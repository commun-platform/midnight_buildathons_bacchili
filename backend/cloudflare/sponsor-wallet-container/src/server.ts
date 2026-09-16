import crypto from 'node:crypto';
import http from 'node:http';

import {
  decryptCheckpoint,
  encryptCheckpoint,
  selectCheckpointState,
} from './checkpoint.js';
import {
  downloadRestoreCheckpoint,
  restoreCheckpointSource,
} from './checkpoint-restore.js';
import {
  canPersistSynchronizationCheckpoint,
  uploadShutdownCheckpoint,
} from './checkpoint-upload.js';
import {
  nextSynchronizationCheckpointDelayMs,
  writeSynchronizationCheckpointCache,
} from './checkpoint-cache.js';
import {
  diagnosticError,
  diagnosticLog,
  safeErrorCauses,
  sponsorWalletBootId,
} from './diagnostics.js';
import {
  deserializeFinalizedTransaction,
  preservedContractTransactionId,
  transactionMetrics,
  validateSponsorTransaction,
} from './transaction.js';
import {
  registerOperatorDevice,
  registerServiceDevice,
  type OperatorDeviceRegistration,
} from './operator-registration.js';
import {
  registerOperatorPolicy,
  type OperatorPolicyRegistration,
} from './operator-policy.js';
import { verifyWalletSignatureRequest } from './wallet-signature.js';
import { SponsorWalletRuntime, type SponsorSerializedState } from './wallet.js';
import {
  deriveManagedDeviceAuthorityHex,
  submitManagedAttestation,
  type ManagedAttestationInput,
} from './managed-attestation.js';
import {
  prepareManagedAttestation,
  type ManagedPreparationInput,
} from './managed-preparation.js';
import {
  type AuthorityTransactionRuntime,
} from './authority-transaction-runtime.js';
import {
  requireWalletRuntimeRole,
  walletRuntimeAllows,
} from './runtime-role-policy.js';

const configuredPort = Number(process.env.SPONSOR_WALLET_SERVICE_PORT ?? 8789);
if (!Number.isSafeInteger(configuredPort) || configuredPort < 1 || configuredPort > 65_535) {
  throw new Error('SPONSOR_WALLET_SERVICE_PORT must be a valid TCP port');
}
const port = configuredPort;
const maxTransactionBytes = 4 * 1024 * 1024;
const maxCheckpointBytes = 128 * 1024 * 1024;
const gracefulOperationWaitMs = 60_000;
const walletStopWaitMs = 45_000;
const forcedShutdownMs = 14 * 60_000;
const initialSynchronizationCheckpointDelayMs = 60_000;
const runtimeRole = requireWalletRuntimeRole(
  process.env.WALLET_RUNTIME_ROLE?.trim() ?? 'server-wallet',
);
const seedHex = process.env.WALLET_RUNTIME_SEED?.trim()
  ?? process.env.SPONSOR_WALLET_SEED?.trim()
  ?? '';
const operatorSecretHex = process.env.OPERATOR_AUTHORITY_SECRET?.trim() ?? '';
const managedAttestorRootSecretHex = process.env.MANAGED_ATTESTOR_ROOT_SECRET?.trim() ?? '';
let sponsor: SponsorWalletRuntime | null = null;
let mutation = Promise.resolve();
let initialization: Promise<void> | null = null;
let initializationStatus: 'not-started' | 'running' | 'succeeded' | 'failed' = 'not-started';
let initializationStartedAt: string | null = null;
let initializationCompletedAt: string | null = null;
let initializationError: string | null = null;
let shuttingDown = false;
let shutdownPromise: Promise<void> | null = null;
let synchronizationCheckpointTimer: NodeJS.Timeout | null = null;
let synchronizationCheckpointInFlight = false;
let synchronizationCheckpointStatus: {
  status: 'idle' | 'saving' | 'succeeded' | 'skipped' | 'failed';
  attemptedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  bytes: number | null;
  dustApplied: string | null;
  error: string | null;
  delivery: 'local-cache' | 'local-cache+r2';
} = {
  status: 'idle',
  attemptedAt: null,
  completedAt: null,
  durationMs: null,
  bytes: null,
  dustApplied: null,
  error: null,
  delivery: 'local-cache',
};

function requireSponsor(): SponsorWalletRuntime {
  sponsor ??= new SponsorWalletRuntime(seedHex, 'sponsor');
  return sponsor;
}

function startInitialization(state: SponsorSerializedState): void {
  if (initialization) {
    diagnosticLog('sponsor_wallet_initialization_request_deduplicated', {
      initializationStatus,
    });
    return;
  }
  initializationStatus = 'running';
  initializationStartedAt = new Date().toISOString();
  initializationCompletedAt = null;
  initializationError = null;
  initialization = requireSponsor().initialize(state).then(() => {
    initializationStatus = 'succeeded';
    initializationCompletedAt = new Date().toISOString();
    diagnosticLog('sponsor_wallet_initialization_succeeded', {
      initializationStartedAt,
      initializationCompletedAt,
    });
  });
  void initialization.catch((error) => {
    initializationStatus = 'failed';
    initializationCompletedAt = new Date().toISOString();
    initializationError = error instanceof Error ? error.message : String(error);
    diagnosticLog('sponsor_wallet_initialization_failed', {
      initializationStartedAt,
      initializationCompletedAt,
      ...diagnosticError(error),
    }, 'error');
    void requestShutdown('wallet-initialization-failed', 1);
  });
}

async function initializedSponsor(): Promise<SponsorWalletRuntime> {
  if (!initialization) throw new Error('Sponsor Wallet restore must run before this operation');
  await initialization;
  return requireSponsor();
}

async function initializedAuthority(): Promise<AuthorityTransactionRuntime> {
  return initializedSponsor();
}

function serviceStatus() {
  const runtime = requireSponsor();
  return {
    ...runtime.status(),
    bootId: sponsorWalletBootId,
    initialization: {
      status: initializationStatus,
      startedAt: initializationStartedAt,
      completedAt: initializationCompletedAt,
      error: initializationError,
    },
    synchronizationCheckpoint: synchronizationCheckpointStatus,
    shuttingDown,
  };
}

function responseJson(
  response: http.ServerResponse,
  status: number,
  value: unknown,
): void {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

async function readBody(request: http.IncomingMessage, maximum: number): Promise<Buffer> {
  const declared = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(declared) && declared > maximum) {
    throw new Error('Request body is too large');
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > maximum) throw new Error('Request body is too large');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

function requiredHeader(request: http.IncomingMessage, name: string, maximum = 256): string {
  const value = request.headers[name.toLowerCase()];
  if (typeof value !== 'string' || !value || value.length > maximum) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function serializedSha256(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function exclusive<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutation.then(operation, operation);
  mutation = result.then(() => undefined, () => undefined);
  return result;
}

async function handleRestore(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const inlineCheckpoint = await readBody(request, maxCheckpointBytes);
  const restoreSource = request.headers['x-sponsor-restore-source'];
  if (restoreSource === restoreCheckpointSource && inlineCheckpoint.byteLength !== 0) {
    throw new Error('State-backed restore must not include an inline checkpoint');
  }
  const checkpoint = restoreSource === restoreCheckpointSource
    ? await downloadRestoreCheckpoint()
    : inlineCheckpoint;
  let restored: SponsorSerializedState = {};
  let checkpointAccepted = false;
  if (checkpoint.length > 0) {
    try {
      restored = decryptCheckpoint(seedHex, checkpoint) as SponsorSerializedState;
      checkpointAccepted = true;
      diagnosticLog('sponsor_wallet_checkpoint_decrypted', {
        bytes: checkpoint.length,
      });
    } catch (error) {
      diagnosticLog('sponsor_wallet_checkpoint_rejected', {
        bytes: checkpoint.length,
        fallback: 'fresh-wallet-state',
        ...diagnosticError(error),
      }, 'error');
    }
  } else {
    diagnosticLog('sponsor_wallet_checkpoint_missing', {
      fallback: 'fresh-wallet-state',
    }, 'warn');
  }
  startInitialization(restored);
  responseJson(response, 200, {
    restored: checkpointAccepted,
    checkpointBytes: checkpoint.length,
    status: serviceStatus(),
  });
}

async function handlePrepare(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const proofJobId = requiredHeader(request, 'X-Proof-Job-Id', 128);
  const contractAddress = requiredHeader(request, 'X-Sponsor-Contract-Address', 128);
  const expectedSerializedHash = requiredHeader(request, 'X-Device-Transaction-Hash', 64);
  const bytes = await readBody(request, maxTransactionBytes);
  if (serializedSha256(bytes) !== expectedSerializedHash) {
    throw new Error('Device transaction hash does not match its serialized bytes');
  }
  diagnosticLog('sponsor_wallet_prepare_input_validated', {
    proofJobId,
    deviceTransactionBytes: bytes.byteLength,
  });
  const original = deserializeFinalizedTransaction(bytes);
  const originalPolicy = validateSponsorTransaction(original, contractAddress, false);
  const runtime = await initializedSponsor();
  await runtime.waitUntilReady();
  await runtime.waitForDustReplay();
  diagnosticLog('sponsor_wallet_prepare_wallet_ready', { proofJobId });
  const balanceStartedAt = performance.now();
  diagnosticLog('sponsor_wallet_balance_started', { proofJobId });
  const recipe = await runtime.wallet.balanceFinalizedTransaction(
    original,
    {
      shieldedSecretKeys: runtime.shieldedSecretKeys,
      dustSecretKey: runtime.dustSecretKey,
    },
    {
      ttl: new Date(Date.now() + 30 * 60 * 1000),
      tokenKindsToBalance: ['dust'],
    },
  );
  diagnosticLog('sponsor_wallet_balance_completed', {
    proofJobId,
    durationMs: Math.round(performance.now() - balanceStartedAt),
  });
  const finalizeStartedAt = performance.now();
  diagnosticLog('sponsor_wallet_finalize_started', { proofJobId });
  const finalized = await runtime.wallet.finalizeRecipe(recipe);
  diagnosticLog('sponsor_wallet_finalize_completed', {
    proofJobId,
    durationMs: Math.round(performance.now() - finalizeStartedAt),
  });
  const finalPolicy = validateSponsorTransaction(finalized, contractAddress, true);
  const contractTransactionId = preservedContractTransactionId(
    originalPolicy.transactionIdentifiers,
    finalPolicy.transactionIdentifiers,
  );
  const serialized = finalized.serialize();
  const metrics = transactionMetrics(finalized);
  diagnosticLog('sponsor_wallet_prepare_completed', {
    proofJobId,
    deviceTransactionBytes: bytes.byteLength,
    sponsoredTransactionBytes: metrics.transactionBytes,
    deviceIdentifiers: originalPolicy.transactionIdentifiers.length,
    sponsoredIdentifiers: finalPolicy.transactionIdentifiers.length,
    feeSpecks: metrics.feeSpecks,
  });
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Length': serialized.byteLength,
    'Content-Type': 'application/octet-stream',
    'X-Contract-Transaction-Id': contractTransactionId,
    'X-Sponsor-Transaction-Hash': finalPolicy.transactionHash,
    'X-Sponsor-Serialized-Sha256': serializedSha256(serialized),
    'X-Sponsor-Fee-Specks': metrics.feeSpecks,
    'X-Sponsor-Transaction-Bytes': String(metrics.transactionBytes),
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(Buffer.from(serialized));
}

async function handleSubmit(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const contractAddress = requiredHeader(request, 'X-Sponsor-Contract-Address', 128);
  const expectedContractTransactionId = requiredHeader(
    request,
    'X-Contract-Transaction-Id',
    256,
  );
  const expectedSerializedHash = requiredHeader(request, 'X-Sponsor-Serialized-Sha256', 64);
  const bytes = await readBody(request, maxTransactionBytes);
  if (serializedSha256(bytes) !== expectedSerializedHash) {
    throw new Error('Sponsored transaction hash does not match its serialized bytes');
  }
  const transaction = deserializeFinalizedTransaction(bytes);
  const policy = validateSponsorTransaction(transaction, contractAddress, true);
  if (!policy.transactionIdentifiers.includes(expectedContractTransactionId)) {
    throw new Error('Sponsored transaction does not contain the expected Device identifier');
  }
  const runtime = await initializedSponsor();
  const confirmation = await runtime.submitPreparedTransactionAndConfirm(transaction);
  const metrics = transactionMetrics(transaction);
  responseJson(response, 200, {
    contractTransactionId: expectedContractTransactionId,
    sponsorTransactionId: confirmation.transactionId,
    transactionHash: confirmation.transactionHash,
    blockHeight: confirmation.blockHeight,
    replayRecovered: confirmation.replayRecovered,
    serializedSha256: expectedSerializedHash,
    feeSpecks: metrics.feeSpecks,
    transactionBytes: metrics.transactionBytes,
    submittedAt: new Date().toISOString(),
  });
}

async function handleRelease(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const contractAddress = requiredHeader(request, 'X-Sponsor-Contract-Address', 128);
  const expectedSerializedHash = requiredHeader(request, 'X-Sponsor-Serialized-Sha256', 64);
  const bytes = await readBody(request, maxTransactionBytes);
  if (serializedSha256(bytes) !== expectedSerializedHash) {
    throw new Error('Sponsored transaction hash does not match its serialized bytes');
  }
  const transaction = deserializeFinalizedTransaction(bytes);
  validateSponsorTransaction(transaction, contractAddress, true);
  const runtime = await initializedSponsor();
  await runtime.releasePreparedTransaction(transaction);
  responseJson(response, 200, {
    released: true,
    serializedSha256: expectedSerializedHash,
    releasedAt: new Date().toISOString(),
  });
}

async function handleOperatorDeviceRegistration(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  if (requiredHeader(request, 'X-Operator-Provisioning') !== 'register-device-v1') {
    throw new Error('Operator provisioning request is invalid');
  }
  if (!/^(?:[0-9a-f]{2}){32}$/u.test(operatorSecretHex)) {
    throw new Error('Operator Authority is not configured');
  }
  const bytes = await readBody(request, 32 * 1024);
  const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Operator provisioning body must be a JSON object');
  }
  const input = {
    ...(parsed as Omit<OperatorDeviceRegistration, 'operatorSecretHex'>),
    operatorSecretHex,
  };
  if (request.headers['x-operator-progress'] !== 'ndjson-v1') {
    const result = await registerOperatorDevice(await initializedAuthority(), input);
    responseJson(response, 200, result);
    return;
  }
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  const writeEvent = (event: unknown): void => {
    response.write(`${JSON.stringify(event)}\n`);
  };
  try {
    const result = await registerOperatorDevice(
      await initializedAuthority(),
      input,
      (progress) => {
        diagnosticLog('sponsor_wallet_operator_registration_progress', { ...progress });
        writeEvent({ type: 'progress', ...progress });
      },
    );
    writeEvent({ type: 'result', result });
  } catch (error) {
    diagnosticLog('sponsor_wallet_operator_registration_failed', {
      ...diagnosticError(error),
    }, 'error');
    writeEvent({
      type: 'error',
      error: error instanceof Error ? error.message : 'Operator registration failed',
      causes: safeErrorCauses(error),
    });
  }
  response.end();
}

async function handleOperatorPolicyRegistration(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  if (requiredHeader(request, 'X-Operator-Provisioning') !== 'register-policy-v1') {
    throw new Error('Operator Policy request is invalid');
  }
  if (!/^(?:[0-9a-f]{2}){32}$/u.test(operatorSecretHex)) {
    throw new Error('Operator Authority is not configured');
  }
  const bytes = await readBody(request, 32 * 1024);
  const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Operator Policy body must be a JSON object');
  }
  const input = {
    ...(parsed as Omit<OperatorPolicyRegistration, 'operatorSecretHex'>),
    operatorSecretHex,
  };
  if (request.headers['x-operator-progress'] !== 'ndjson-v1') {
    const result = await registerOperatorPolicy(await initializedAuthority(), input);
    responseJson(response, 200, result);
    return;
  }
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  const writeEvent = (event: unknown): void => {
    response.write(`${JSON.stringify(event)}\n`);
  };
  try {
    const result = await registerOperatorPolicy(
      await initializedAuthority(),
      input,
      (progress) => {
        diagnosticLog('sponsor_wallet_operator_policy_progress', { ...progress });
        writeEvent({ type: 'progress', ...progress });
      },
    );
    writeEvent({ type: 'result', result });
  } catch (error) {
    diagnosticLog('sponsor_wallet_operator_policy_failed', {
      ...diagnosticError(error),
    }, 'error');
    writeEvent({
      type: 'error',
      error: error instanceof Error ? error.message : 'Operator Policy registration failed',
      causes: safeErrorCauses(error),
    });
  }
  response.end();
}

async function handleManagedSourceRegistration(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  if (requiredHeader(request, 'X-Operator-Provisioning') !== 'register-service-device-v1') {
    throw new Error('Service Device registration request is invalid');
  }
  if (!/^(?:[0-9a-f]{2}){32}$/u.test(operatorSecretHex)) {
    throw new Error('Operator Authority is not configured');
  }
  const bytes = await readBody(request, 32 * 1024);
  const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Service Device registration body must be a JSON object');
  }
  const input = {
    ...(parsed as Omit<OperatorDeviceRegistration, 'operatorSecretHex' | 'browserAuthorization'>),
    operatorSecretHex,
  };
  const result = await registerServiceDevice(await initializedAuthority(), input);
  responseJson(response, 200, result);
}

async function handleManagedSourceAuthority(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  if (requiredHeader(request, 'X-Managed-Source') !== 'derive-authority-v1') {
    throw new Error('Managed Source authority request is invalid');
  }
  if (!/^(?:[0-9a-f]{2}){32}$/u.test(managedAttestorRootSecretHex)) {
    throw new Error('Managed Attestor Authority is not configured');
  }
  const bytes = await readBody(request, 8 * 1024);
  const parsed = JSON.parse(bytes.toString('utf8')) as {
    projectId?: unknown;
    sourceId?: unknown;
  };
  if (
    !parsed
    || typeof parsed !== 'object'
    || Array.isArray(parsed)
    || typeof parsed.projectId !== 'string'
    || typeof parsed.sourceId !== 'string'
  ) throw new Error('Managed Source authority body is invalid');
  const deviceAuthority = deriveManagedDeviceAuthorityHex(
    managedAttestorRootSecretHex,
    parsed.projectId,
    parsed.sourceId,
  );
  responseJson(response, 200, { deviceAuthority });
}

async function handleManagedAttestation(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  if (requiredHeader(request, 'X-Managed-Attestation') !== 'submit-v1') {
    throw new Error('Managed attestation request is invalid');
  }
  if (!/^(?:[0-9a-f]{2}){32}$/u.test(managedAttestorRootSecretHex)) {
    throw new Error('Managed Attestor Authority is not configured');
  }
  const bytes = await readBody(request, 512 * 1024);
  const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Managed attestation body must be a JSON object');
  }
  const input = {
    ...(parsed as Omit<ManagedAttestationInput, 'managedAttestorRootSecretHex'>),
    managedAttestorRootSecretHex,
  };
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  const writeEvent = (event: unknown): void => {
    response.write(`${JSON.stringify(event)}\n`);
  };
  try {
    const result = await submitManagedAttestation(
      await initializedAuthority(),
      input,
      (progress) => {
        diagnosticLog('sponsor_wallet_managed_attestation_progress', {
          sourceId: input.sourceId,
          ...progress,
        });
        writeEvent({ type: 'progress', ...progress });
      },
    );
    writeEvent({ type: 'result', result });
  } catch (error) {
    diagnosticLog('sponsor_wallet_managed_attestation_failed', {
      sourceId: input.sourceId,
      ...diagnosticError(error),
    }, 'error');
    writeEvent({
      type: 'error',
      error: error instanceof Error ? error.message : 'Managed attestation failed',
      causes: safeErrorCauses(error),
    });
  }
  response.end();
}

async function handleManagedPreparation(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  if (requiredHeader(request, 'X-Managed-Attestation') !== 'prepare-v1') {
    throw new Error('Managed preparation request is invalid');
  }
  const bytes = await readBody(request, 512 * 1024);
  const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Managed preparation body must be a JSON object');
  }
  const result = await prepareManagedAttestation(parsed as ManagedPreparationInput);
  responseJson(response, 200, result);
}

async function handleWalletSignatureVerification(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const bytes = await readBody(request, 8 * 1024);
  verifyWalletSignatureRequest(
    requiredHeader(request, 'X-Operator-Provisioning'),
    bytes,
  );
  responseJson(response, 200, { verified: true });
}

async function handleCheckpoint(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const runtime = await initializedSponsor();
  const serialized = await runtime.serializeState();
  const mode = new URL(request.url ?? '/', 'http://sponsor.internal').searchParams.get('mode');
  const checkpoint = encryptCheckpoint(seedHex, selectCheckpointState(serialized, mode));
  const status = runtime.status();
  const checkpointProgress = status.progressDetails;
  diagnosticLog('sponsor_wallet_checkpoint_serialized', {
    mode: mode ?? 'full',
    bytes: checkpoint.byteLength,
    phase: status.phase,
    progressDetails: checkpointProgress,
  });
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Length': checkpoint.byteLength,
    'Content-Type': 'application/octet-stream',
    'X-Sponsor-Checkpoint-Boot-Id': sponsorWalletBootId,
    'X-Sponsor-Checkpoint-Mode': mode ?? 'full',
    'X-Sponsor-Checkpoint-Phase': status.phase,
    'X-Sponsor-Checkpoint-Shielded-Applied': checkpointProgress?.shielded.applied ?? '0',
    'X-Sponsor-Checkpoint-Unshielded-Applied': checkpointProgress?.unshielded.applied ?? '0',
    'X-Sponsor-Checkpoint-Dust-Applied': checkpointProgress?.dust.applied ?? '0',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(Buffer.from(checkpoint));
}

const server = http.createServer((request, response) => {
  const startedAt = performance.now();
  const pathname = new URL(request.url ?? '/', 'http://sponsor.internal').pathname;
  const requestId = crypto.randomUUID();
  diagnosticLog('sponsor_wallet_request_started', {
    requestId,
    method: request.method,
    pathname,
    declaredBytes: request.headers['content-length'] ?? null,
  });
  response.once('finish', () => {
    diagnosticLog('sponsor_wallet_request_completed', {
      requestId,
      method: request.method,
      pathname,
      status: response.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
    });
  });
  const run = async (): Promise<void> => {
    if (shuttingDown) {
      responseJson(response, 503, { error: 'Sponsor Wallet is shutting down' });
      return;
    }
    if (!walletRuntimeAllows(runtimeRole, pathname)) {
      responseJson(response, 404, { error: 'Endpoint is not available in this Wallet runtime' });
      return;
    }
    if (request.method === 'POST' && pathname === '/restore') {
      await handleRestore(request, response);
      return;
    }
    if (request.method === 'GET' && pathname === '/health') {
      const runtime = requireSponsor();
      runtime.startActivation();
      const status = serviceStatus();
      responseJson(response, 200, status);
      if (status.phase === 'error' && initializationStatus === 'succeeded') {
        void requestShutdown('wallet-runtime-error', 1);
      }
      return;
    }
    if (request.method === 'POST' && pathname === '/prepare') {
      await exclusive(() => handlePrepare(request, response));
      return;
    }
    if (request.method === 'POST' && pathname === '/submit') {
      await exclusive(() => handleSubmit(request, response));
      return;
    }
    if (request.method === 'POST' && pathname === '/release') {
      await exclusive(() => handleRelease(request, response));
      return;
    }
    if (request.method === 'POST' && pathname === '/operator/register-device') {
      await exclusive(() => handleOperatorDeviceRegistration(request, response));
      return;
    }
    if (request.method === 'POST' && pathname === '/operator/register-policy') {
      await exclusive(() => handleOperatorPolicyRegistration(request, response));
      return;
    }
    if (request.method === 'POST' && pathname === '/operator/register-service-device') {
      await exclusive(() => handleManagedSourceRegistration(request, response));
      return;
    }
    if (request.method === 'POST' && pathname === '/managed/source-authority') {
      await handleManagedSourceAuthority(request, response);
      return;
    }
    if (request.method === 'POST' && pathname === '/managed/prepare') {
      await handleManagedPreparation(request, response);
      return;
    }
    if (request.method === 'POST' && pathname === '/managed/attest') {
      await exclusive(() => handleManagedAttestation(request, response));
      return;
    }
    if (request.method === 'POST' && pathname === '/operator/verify-wallet-signature') {
      await handleWalletSignatureVerification(request, response);
      return;
    }
    if (request.method === 'GET' && pathname === '/checkpoint') {
      await exclusive(() => handleCheckpoint(request, response));
      return;
    }
    responseJson(response, 404, { error: 'Unknown Sponsor Wallet endpoint' });
  };
  void run().catch((error) => {
    diagnosticLog('sponsor_wallet_request_failed', {
      requestId,
      pathname,
      durationMs: Math.round(performance.now() - startedAt),
      ...diagnosticError(error),
    }, 'error');
    if (!response.headersSent) {
      responseJson(response, 503, {
        error: error instanceof Error ? error.message : 'Sponsor Wallet operation failed',
        causes: safeErrorCauses(error),
      });
    } else {
      response.destroy();
    }
  });
});

server.listen(port, '0.0.0.0', () => {
  diagnosticLog('sponsor_wallet_service_started', {
    port,
    runtimeRole,
    seedConfigured: /^(?:[0-9a-f]{2}){32}$/u.test(seedHex),
    nodeVersion: process.version,
    walletSdkVersion: '1.2.0',
    midnightJsVersion: '4.1.1',
    operatorAuthorityConfigured: /^(?:[0-9a-f]{2}){32}$/u.test(operatorSecretHex),
    managedAttestorAuthorityConfigured: /^(?:[0-9a-f]{2}){32}$/u.test(
      managedAttestorRootSecretHex,
    ),
  });
});

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function persistShutdownCheckpoint(reason: string): Promise<void> {
  if (!sponsor?.canSerializeState()) {
    diagnosticLog('sponsor_wallet_shutdown_checkpoint_skipped', {
      reason,
      initializationStatus,
      skipReason: 'serializable-state-unavailable',
    }, 'warn');
    return;
  }
  try {
    await withTimeout(
      mutation,
      gracefulOperationWaitMs,
      'Timed out waiting for an active Sponsor Wallet mutation',
    );
  } catch (error) {
    diagnosticLog('sponsor_wallet_shutdown_mutation_wait_failed', {
      reason,
      ...diagnosticError(error),
    }, 'warn');
  }
  const serialized = await withTimeout(
    sponsor.serializeState(),
    gracefulOperationWaitMs,
    'Timed out serializing Sponsor Wallet state during shutdown',
  );
  const checkpoint = encryptCheckpoint(seedHex, serialized);
  if (checkpoint.byteLength > maxCheckpointBytes) {
    throw new Error('Shutdown checkpoint exceeds the maximum size');
  }
  await uploadShutdownCheckpoint(checkpoint, reason);
}

async function persistSynchronizationCheckpoint(): Promise<void> {
  if (
    synchronizationCheckpointInFlight
    || shuttingDown
    || !sponsor
    || !canPersistSynchronizationCheckpoint(
      initializationStatus,
      sponsor.canSerializeState(),
      sponsor.status().phase,
    )
  ) return;
  synchronizationCheckpointInFlight = true;
  const startedAt = performance.now();
  const attemptedAt = new Date().toISOString();
  const initialStatus = sponsor.status();
  synchronizationCheckpointStatus = {
    status: 'saving',
    attemptedAt,
    completedAt: null,
    durationMs: null,
    bytes: null,
    dustApplied: initialStatus.progressDetails?.dust.applied ?? null,
    error: null,
    delivery: 'local-cache',
  };
  try {
    const serialized = await withTimeout(
      sponsor.serializeState(),
      gracefulOperationWaitMs,
      'Timed out serializing Sponsor Wallet state during synchronization',
    );
    const status = sponsor.status();
    // A transaction mutation may start as soon as the Wallet becomes ready.
    // Never persist from this path after that transition, because a prepared
    // transaction can reserve DUST until it is submitted or released.
    if (status.phase !== 'syncing' || !status.progressDetails) {
      synchronizationCheckpointStatus = {
        ...synchronizationCheckpointStatus,
        status: 'skipped',
        completedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - startedAt),
        error: `phase_changed_to_${status.phase}`,
      };
      return;
    }
    const checkpoint = encryptCheckpoint(seedHex, serialized);
    if (checkpoint.byteLength > maxCheckpointBytes) {
      throw new Error('Synchronization checkpoint exceeds the maximum size');
    }
    await writeSynchronizationCheckpointCache(checkpoint, {
      shieldedApplied: status.progressDetails.shielded.applied,
      unshieldedApplied: status.progressDetails.unshielded.applied,
      dustApplied: status.progressDetails.dust.applied,
    });
    await uploadShutdownCheckpoint(checkpoint, 'periodic-sync', {
      progress: {
        phase: status.phase,
        shieldedApplied: status.progressDetails.shielded.applied,
        unshieldedApplied: status.progressDetails.unshielded.applied,
        dustApplied: status.progressDetails.dust.applied,
      },
    });
    synchronizationCheckpointStatus = {
      status: 'succeeded',
      attemptedAt,
      completedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - startedAt),
      bytes: checkpoint.byteLength,
      dustApplied: status.progressDetails.dust.applied,
      error: null,
      delivery: 'local-cache+r2',
    };
    diagnosticLog('sponsor_wallet_periodic_checkpoint_persisted', {
      bytes: checkpoint.byteLength,
      durationMs: Math.round(performance.now() - startedAt),
      progressDetails: status.progressDetails,
    });
  } catch (error) {
    synchronizationCheckpointStatus = {
      ...synchronizationCheckpointStatus,
      status: 'failed',
      completedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
    diagnosticLog('sponsor_wallet_periodic_checkpoint_failed', {
      durationMs: Math.round(performance.now() - startedAt),
      ...diagnosticError(error),
    }, 'error');
  } finally {
    synchronizationCheckpointInFlight = false;
  }
}

async function shutdown(reason: string, exitCode: number): Promise<void> {
  shuttingDown = true;
  if (synchronizationCheckpointTimer) clearTimeout(synchronizationCheckpointTimer);
  diagnosticLog('sponsor_wallet_shutdown_started', { reason, exitCode });
  const forcedShutdownTimer = setTimeout(() => {
    diagnosticLog('sponsor_wallet_forced_shutdown_deadline_reached', { reason }, 'error');
    process.exit(1);
  }, forcedShutdownMs);
  server.close();
  if (initializationStatus === 'running' && initialization) {
    try {
      await withTimeout(
        initialization,
        gracefulOperationWaitMs,
        'Timed out waiting for Sponsor Wallet initialization during shutdown',
      );
    } catch (error) {
      diagnosticLog('sponsor_wallet_shutdown_initialization_wait_failed', {
        reason,
        ...diagnosticError(error),
      }, 'warn');
    }
  }
  try {
    await persistShutdownCheckpoint(reason);
  } catch (error) {
    diagnosticLog('sponsor_wallet_shutdown_checkpoint_failed', {
      reason,
      ...diagnosticError(error),
    }, 'error');
  }
  try {
    if (sponsor) {
      await withTimeout(
        sponsor.close(),
        walletStopWaitMs,
        'Timed out stopping Sponsor Wallet SDK after checkpoint persistence',
      );
    }
  } catch (error) {
    const timedOut = error instanceof Error
      && error.message === 'Timed out stopping Sponsor Wallet SDK after checkpoint persistence';
    diagnosticLog(timedOut
      ? 'sponsor_wallet_shutdown_stop_timed_out'
      : 'sponsor_wallet_shutdown_stop_failed', {
        reason,
        checkpointAlreadyPersisted: true,
        ...diagnosticError(error),
      }, timedOut ? 'warn' : 'error');
  }
  diagnosticLog('sponsor_wallet_shutdown_completed', { reason, exitCode });
  clearTimeout(forcedShutdownTimer);
  process.exitCode = exitCode;
  setTimeout(() => process.exit(exitCode), 100);
}

function requestShutdown(reason: string, exitCode: number): Promise<void> {
  shutdownPromise ??= shutdown(reason, exitCode);
  return shutdownPromise;
}

const heartbeat = setInterval(() => {
  const status = sponsor?.status();
  diagnosticLog('sponsor_wallet_process_heartbeat', {
    initializationStatus,
    phase: status?.phase ?? 'not-created',
    lastStateAt: status?.lastStateAt ?? null,
    shuttingDown,
  });
}, 60_000);
heartbeat.unref();

function scheduleSynchronizationCheckpoint(delayMs: number): void {
  synchronizationCheckpointTimer = setTimeout(async () => {
    const startedAt = performance.now();
    await persistSynchronizationCheckpoint();
    if (!shuttingDown) {
      scheduleSynchronizationCheckpoint(
        nextSynchronizationCheckpointDelayMs(performance.now() - startedAt),
      );
    }
  }, delayMs);
  synchronizationCheckpointTimer.unref();
}

scheduleSynchronizationCheckpoint(initialSynchronizationCheckpointDelayMs);

process.on('uncaughtExceptionMonitor', (error, origin) => {
  diagnosticLog('sponsor_wallet_uncaught_exception', {
    origin,
    ...diagnosticError(error),
  }, 'error');
});
process.on('unhandledRejection', (reason) => {
  diagnosticLog('sponsor_wallet_unhandled_rejection', {
    ...diagnosticError(reason),
  }, 'error');
});
process.once('SIGTERM', () => void requestShutdown('SIGTERM', 0));
process.once('SIGINT', () => void requestShutdown('SIGINT', 0));
process.once('beforeExit', (code) => {
  diagnosticLog('sponsor_wallet_process_before_exit', { code });
});
process.once('exit', (code) => {
  diagnosticLog('sponsor_wallet_process_exit', { code });
});
