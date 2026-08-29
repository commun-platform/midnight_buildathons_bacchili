import { getContainer } from '@cloudflare/containers';

import { applyDeviceRateLimits, authorizeDeviceRequest } from './device-auth.js';
import type { ProofJobRow } from './jobs.js';
import {
  canRecoverStaleSponsoringRequest,
  deviceTransactionAcceptance,
  shouldReplaySponsorDustState,
  sponsorWalletCanSubmit,
} from './sponsor-policy.js';
import { reserveSponsorQuota, type SponsorQuotaStatus } from './sponsor-quota.js';
import {
  maxSponsorCheckpointBytes,
  sponsorCheckpointKey,
  sponsorCheckpointRecoveryKey,
  storeSponsorCheckpoint,
} from './sponsor-checkpoint.js';
import { createSqlDatabase } from './storage/index.js';

// Keep this logical ID stable. With max_instances=1, changing it while the old
// 24-hour Sponsor instance is running prevents the replacement from starting.
const sponsorContainerName = 'midnight-sponsor-wallet';
const sponsorQueueName = 'midnight-sponsor-jobs';
const synchronizationCheckpointIntervalMs = 5 * 60_000;
const steadyCheckpointIntervalMs = 30 * 60_000;
const maxTransactionBytes = 4 * 1024 * 1024;
const sponsorRetryDelayMs = 60_000;
const sponsorLeaseMs = 20 * 60_000;

interface SponsorQueueMessage {
  kind: 'sponsor-transaction';
  proofJobId: string;
}

interface SponsorSubmission {
  contractTransactionId: string;
  sponsorTransactionId: string;
  transactionHash: string;
  serializedSha256: string;
  feeSpecks: string;
  transactionBytes: number;
  submittedAt: string;
}

interface SponsorRelease {
  released: boolean;
  serializedSha256: string;
  releasedAt: string;
}

export interface SponsorWalletHealth {
  phase: 'starting' | 'syncing' | 'waiting-for-funding' | 'registering-dust' | 'ready' | 'error';
  progress: {
    shielded: string;
    unshielded: string;
    dust: string;
  } | null;
  progressDetails?: {
    shielded: SponsorSyncProgressDetails;
    unshielded: SponsorSyncProgressDetails;
    dust: SponsorSyncProgressDetails;
  } | null;
  night?: string;
  dust?: string;
  spendableDustCoins?: number;
  totalDustCoins?: number;
  pendingDustCoins?: number;
  nightCoins?: {
    total: number;
    registered: number;
    unregistered: number;
  };
  bootId?: string;
  initializedAt?: string | null;
  lastStateAt?: string | null;
  initialization?: {
    status: 'not-started' | 'running' | 'succeeded' | 'failed';
    startedAt: string | null;
    completedAt: string | null;
    error: string | null;
  };
  supervisor?: {
    status: 'healthy' | 'degraded' | 'unavailable';
    walletProcessAlive: boolean;
    walletProcessId: number | null;
    walletStatusFresh: boolean;
    lastSuccessfulProbeAt: string | null;
    lastProbeErrorAt: string | null;
    lastProbeError: string | null;
    statusAgeMs: number | null;
    consecutiveProbeFailures: number;
  };
  shuttingDown?: boolean;
  error: string | null;
}

interface SponsorSyncProgressDetails {
  applied: string;
  highest: string;
  connected: boolean;
  complete: boolean;
}

function json(status: number, value: unknown, extraHeaders?: Record<string, string>): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizedContractAddress(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/^0x/iu, '').toLowerCase() ?? '';
  return /^(?:[0-9a-f]{2}){32}$/u.test(normalized) ? normalized : null;
}

async function readBoundedTransaction(request: Request): Promise<Uint8Array> {
  if (request.headers.get('Content-Type')?.split(';', 1)[0]?.trim() !== 'application/octet-stream') {
    throw new Error('Sponsor request must be application/octet-stream');
  }
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > maxTransactionBytes) {
    throw new Error('Device transaction exceeds the sponsorship size limit');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Device transaction body is required');
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxTransactionBytes) {
      throw new Error('Device transaction exceeds the sponsorship size limit');
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isSponsorQueueMessage(value: unknown): value is SponsorQueueMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as { kind?: unknown; proofJobId?: unknown };
  return message.kind === 'sponsor-transaction'
    && typeof message.proofJobId === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(message.proofJobId);
}

function deviceTransactionObjectKey(proofJobId: string, serializedSha256: string): string {
  return `device-transactions/${proofJobId}/${serializedSha256}.tx`;
}

async function enqueueSponsorJob(env: Env, proofJobId: string, delaySeconds = 0): Promise<void> {
  await env.SPONSOR_QUEUE.send(
    { kind: 'sponsor-transaction', proofJobId } satisfies SponsorQueueMessage,
    delaySeconds > 0 ? { delaySeconds } : undefined,
  );
}

function requiredResponseHeader(response: Response, name: string, pattern: RegExp): string {
  const value = response.headers.get(name)?.trim() ?? '';
  if (!pattern.test(value)) throw new Error(`Sponsor Wallet returned invalid ${name}`);
  return value;
}

async function readSmallJson<T>(response: Response): Promise<T> {
  const declared = Number(response.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > 64 * 1024) {
    throw new Error('Sponsor Wallet response is too large');
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Sponsor Wallet returned HTTP ${response.status}: ${text.slice(0, 4096)}`);
  }
  if (text.length > 64 * 1024) throw new Error('Sponsor Wallet response is too large');
  return JSON.parse(text) as T;
}

function sponsorContainer(env: Env) {
  return getContainer(env.SPONSOR_WALLET, sponsorContainerName);
}

async function restoreSponsorWallet(env: Env): Promise<void> {
  const checkpointExists = await env.SPONSOR_STATE.head(sponsorCheckpointKey) !== null;
  let detail = '';
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const checkpoint = checkpointExists
      ? await env.SPONSOR_STATE.get(sponsorCheckpointKey)
      : null;
    if (checkpointExists && !checkpoint) {
      throw new Error('Sponsor Wallet checkpoint disappeared during restore');
    }
    const response = await sponsorContainer(env).fetch(new Request('http://sponsor-wallet/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: checkpoint?.body ?? new Uint8Array(),
      signal: AbortSignal.timeout(10 * 60_000),
    }));
    if (response.ok) {
      await response.body?.cancel();
      return;
    }
    detail = await response.text();
    if (response.status !== 503 || !detail.includes('process is starting') || attempt === 4) {
      throw new Error(`Sponsor Wallet restore failed with HTTP ${response.status}: ${detail.slice(0, 240)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  throw new Error(`Sponsor Wallet restore failed: ${detail.slice(0, 240)}`);
}

async function fetchSponsorWalletHealth(env: Env): Promise<SponsorWalletHealth> {
  const response = await sponsorContainer(env).fetch(new Request(
    'http://sponsor-wallet/health',
    { signal: AbortSignal.timeout(30_000) },
  ));
  const health = await readSmallJson<SponsorWalletHealth>(response);
  if (!['starting', 'syncing', 'waiting-for-funding', 'registering-dust', 'ready', 'error']
    .includes(health.phase)) {
    throw new Error('Sponsor Wallet returned an invalid health phase');
  }
  return health;
}

export async function sponsorWalletHealth(env: Env): Promise<SponsorWalletHealth> {
  let health = await fetchSponsorWalletHealth(env);
  if (!health.initialization || health.initialization.status === 'not-started') {
    await restoreSponsorWallet(env);
    health = await fetchSponsorWalletHealth(env);
  }
  if (health.initialization?.status === 'failed') {
    throw new Error(`Sponsor Wallet initialization failed: ${health.initialization.error ?? 'unknown error'}`);
  }
  return health;
}

async function persistSponsorCheckpoint(env: Env): Promise<void> {
  const response = await sponsorContainer(env).fetch(new Request(
    'http://sponsor-wallet/checkpoint',
    { signal: AbortSignal.timeout(5 * 60_000) },
  ));
  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(`Sponsor Wallet checkpoint failed with HTTP ${response.status}: ${detail.slice(0, 240)}`);
  }
  const contentLength = Number(response.headers.get('Content-Length'));
  if (
    !Number.isSafeInteger(contentLength)
    || contentLength <= 0
    || contentLength > maxSponsorCheckpointBytes
  ) {
    await response.body.cancel();
    throw new Error('Sponsor Wallet checkpoint has an invalid Content-Length');
  }
  await storeSponsorCheckpoint(env, response.body, contentLength, {
    source: 'periodic-pull',
  });
}

async function persistSponsorCheckpointIfStale(
  env: Env,
  health: SponsorWalletHealth,
): Promise<void> {
  const intervalMs = health.phase === 'ready'
    ? steadyCheckpointIntervalMs
    : synchronizationCheckpointIntervalMs;
  const current = await env.SPONSOR_STATE.head(sponsorCheckpointKey);
  const updatedAt = Date.parse(current?.customMetadata?.updatedAt ?? '');
  if (
    Number.isFinite(updatedAt)
    && Date.now() - updatedAt < intervalMs
  ) return;
  await persistSponsorCheckpoint(env);
}

async function replayInconsistentSponsorDustState(
  env: Env,
  health: SponsorWalletHealth,
): Promise<boolean> {
  const active = await createSqlDatabase(env).first<{ active_count: number }>(
    `SELECT COUNT(*) AS active_count FROM daily_proof_jobs
     WHERE status IN ('sponsoring', 'sponsored')
       AND sponsor_transaction_object_key IS NOT NULL`,
  );
  const activeReservations = Number(active?.active_count ?? 0);
  const recoveryCheckpoint = await env.SPONSOR_STATE.head(sponsorCheckpointRecoveryKey);
  if (
    recoveryCheckpoint === null
    && !shouldReplaySponsorDustState(health, activeReservations)
  ) return false;
  if (activeReservations !== 0) {
    console.warn(JSON.stringify({
      message: 'sponsor_wallet_recovery_deferred_for_active_reservation',
      activeReservations,
    }));
    return false;
  }
  const response = await sponsorContainer(env).fetch(new Request(
    'http://sponsor-wallet/maintenance/replay-dust',
    {
      method: 'POST',
      headers: { 'X-Sponsor-Maintenance': 'replay-dust-from-chain' },
      signal: AbortSignal.timeout(4 * 60_000),
    },
  ));
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Sponsor DUST replay failed with HTTP ${response.status}: ${detail.slice(0, 240)}`);
  }
  await response.body?.cancel();
  console.log(JSON.stringify({
    message: 'sponsor_wallet_inconsistent_dust_state_replaying',
    registeredNightCoins: health.nightCoins?.registered ?? null,
    activeReservations,
    recoveryCheckpointRestored: recoveryCheckpoint !== null,
  }));
  return true;
}

async function logSponsorRuntimeDiagnostics(
  env: Env,
  warmupId: string,
): Promise<void> {
  try {
    const response = await sponsorContainer(env).fetch(new Request(
      'http://sponsor-wallet/runtime-diagnostics',
      { signal: AbortSignal.timeout(15_000) },
    ));
    const diagnostics = await readSmallJson<Record<string, unknown>>(response);
    console.log(JSON.stringify({
      message: 'sponsor_wallet_warmup_runtime_diagnostics',
      warmupId,
      diagnostics,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      message: 'sponsor_wallet_warmup_runtime_diagnostics_failed',
      warmupId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: errorMessage(error),
    }));
  }
}

function sponsorshipView(
  job: ProofJobRow,
  idempotent: boolean,
  sponsorQuota?: SponsorQuotaStatus,
) {
  return {
    accepted: true,
    idempotent,
    proofJobId: job.id,
    status: job.status,
    transactionId: job.attest_tx_id,
    deviceTransactionHash: job.device_transaction_hash,
    sponsorTransactionId: job.sponsor_transaction_id,
    transactionHash: job.attest_tx_hash,
    feeSpecks: job.sponsor_fee_specks,
    feeDust: job.sponsor_fee_specks === null
      ? null
      : formatDust(BigInt(job.sponsor_fee_specks)),
    deviceTransactionBytes: job.device_transaction_bytes,
    transactionBytes: job.sponsor_transaction_bytes,
    sponsorshipStartedAt: job.sponsorship_started_at,
    sponsorshipCompletedAt: job.sponsorship_completed_at,
    ...(sponsorQuota ? { sponsorQuota } : {}),
  };
}

function formatDust(value: bigint): string {
  return `${value / 1_000_000_000_000_000n}.${(value % 1_000_000_000_000_000n)
    .toString()
    .padStart(15, '0')}`;
}

async function currentJob(env: Env, id: string): Promise<ProofJobRow> {
  const job = await createSqlDatabase(env).first<ProofJobRow>(
    'SELECT * FROM daily_proof_jobs WHERE id = ?1',
    [id],
  );
  if (!job) throw new Error('Proof Job disappeared during sponsorship');
  return job;
}

async function prepareSponsoredTransaction(
  env: Env,
  job: ProofJobRow,
  contractAddress: string,
  deviceTransaction: Uint8Array,
  deviceTransactionHash: string,
): Promise<ProofJobRow> {
  const database = createSqlDatabase(env);
  const sponsorshipStartedAt = new Date().toISOString();
  const sponsorLeaseExpiresAt = new Date(Date.now() + sponsorLeaseMs).toISOString();
  const claimed = await database.execute(
    `UPDATE daily_proof_jobs
     SET status = 'sponsoring', sponsor_attempt_count = sponsor_attempt_count + 1,
         sponsorship_started_at = COALESCE(sponsorship_started_at, ?1),
         sponsor_lease_expires_at = ?2, last_error_code = NULL, updated_at = ?1
     WHERE id = ?3 AND status IN ('awaiting_sponsor', 'sponsor_retryable')`,
    [sponsorshipStartedAt, sponsorLeaseExpiresAt, job.id],
  );
  if (claimed !== 1) {
    const changed = await currentJob(env, job.id);
    if (changed.status === 'sponsoring') {
      throw new Error('Sponsorship is already in progress');
    }
    return changed;
  }

  try {
    const prepared = await sponsorContainer(env).fetch(new Request('http://sponsor-wallet/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Proof-Job-Id': job.id,
        'X-Sponsor-Contract-Address': contractAddress,
        'X-Device-Transaction-Hash': deviceTransactionHash,
      },
      body: deviceTransaction,
      signal: AbortSignal.timeout(15 * 60_000),
    }));
    if (!prepared.ok || !prepared.body) {
      const detail = await prepared.text();
      throw new Error(`Sponsor Wallet prepare failed with HTTP ${prepared.status}: ${detail.slice(0, 240)}`);
    }
    const contractTransactionId = requiredResponseHeader(
      prepared,
      'X-Contract-Transaction-Id',
      /^.{1,256}$/u,
    );
    const transactionHash = requiredResponseHeader(
      prepared,
      'X-Sponsor-Transaction-Hash',
      /^.{1,256}$/u,
    );
    const serializedSha256 = requiredResponseHeader(
      prepared,
      'X-Sponsor-Serialized-Sha256',
      /^(?:[0-9a-f]{2}){32}$/u,
    );
    const feeSpecks = requiredResponseHeader(prepared, 'X-Sponsor-Fee-Specks', /^\d{1,80}$/u);
    const transactionBytes = Number(requiredResponseHeader(
      prepared,
      'X-Sponsor-Transaction-Bytes',
      /^\d{1,10}$/u,
    ));
    if (!Number.isSafeInteger(transactionBytes) || transactionBytes <= 0
      || transactionBytes > maxTransactionBytes) {
      throw new Error('Sponsor Wallet returned an invalid transaction size');
    }
    const preparedBytes = new Uint8Array(await prepared.arrayBuffer());
    if (preparedBytes.byteLength !== transactionBytes) {
      throw new Error('Sponsor Wallet transaction size does not match its body');
    }
    if (await sha256Hex(preparedBytes) !== serializedSha256) {
      throw new Error('Sponsor Wallet transaction hash does not match its body');
    }
    const objectKey = `sponsor-transactions/${job.id}/${serializedSha256}.tx`;
    await env.SPONSOR_STATE.put(objectKey, preparedBytes, {
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: {
        format: 'midnight-finalized-transaction',
        proofJobId: job.id,
        serializedSha256,
      },
    });
    const updatedAt = new Date().toISOString();
    const updated = await database.execute(
      `UPDATE daily_proof_jobs
       SET status = 'sponsored', sponsor_transaction_object_key = ?1,
           sponsor_serialized_sha256 = ?2, sponsor_fee_specks = ?3,
           sponsor_transaction_bytes = ?4, attest_tx_id = ?5, attest_tx_hash = ?6,
           sponsor_lease_expires_at = NULL, sponsor_available_after = ?7,
           last_error_code = NULL, updated_at = ?7
       WHERE id = ?8 AND status = 'sponsoring' AND device_transaction_hash = ?9`,
      [
        objectKey, serializedSha256, feeSpecks, transactionBytes,
        contractTransactionId, transactionHash, updatedAt, job.id, deviceTransactionHash,
      ],
    );
    if (updated !== 1) throw new Error('Proof Job changed while the sponsored transaction was prepared');
    await persistSponsorCheckpoint(env).catch((error) => {
      console.error(JSON.stringify({
        message: 'sponsor_checkpoint_after_prepare_failed',
        proofJobId: job.id,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }));
    });
    return currentJob(env, job.id);
  } catch (error) {
    await database.execute(
      `UPDATE daily_proof_jobs
       SET status = 'sponsor_retryable', sponsor_lease_expires_at = NULL,
           sponsor_available_after = ?1, last_error_code = 'sponsor_prepare_failed', updated_at = ?2
       WHERE id = ?3 AND status = 'sponsoring'`,
      [
        new Date(Date.now() + sponsorRetryDelayMs).toISOString(),
        new Date().toISOString(),
        job.id,
      ],
    );
    throw error;
  }
}

async function submitSponsoredTransaction(
  env: Env,
  job: ProofJobRow,
  contractAddress: string,
): Promise<ProofJobRow> {
  if (
    !job.sponsor_transaction_object_key
    || !job.sponsor_serialized_sha256
    || !job.attest_tx_id
  ) {
    throw new Error('Sponsored transaction artifact is missing');
  }
  const object = await env.SPONSOR_STATE.get(job.sponsor_transaction_object_key);
  if (!object) throw new Error('Sponsored transaction artifact was not found');
  const response = await sponsorContainer(env).fetch(new Request('http://sponsor-wallet/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Proof-Job-Id': job.id,
      'X-Sponsor-Contract-Address': contractAddress,
      'X-Contract-Transaction-Id': job.attest_tx_id,
      'X-Sponsor-Serialized-Sha256': job.sponsor_serialized_sha256,
    },
    body: object.body,
    signal: AbortSignal.timeout(15 * 60_000),
  }));
  const result = await readSmallJson<SponsorSubmission>(response);
  if (
    result.contractTransactionId !== job.attest_tx_id
    || result.transactionHash !== job.attest_tx_hash
    || result.serializedSha256 !== job.sponsor_serialized_sha256
    || result.feeSpecks !== job.sponsor_fee_specks
    || result.transactionBytes !== job.sponsor_transaction_bytes
  ) throw new Error('Sponsor submission result does not match the prepared transaction');
  const completedAt = new Date().toISOString();
  const updated = await createSqlDatabase(env).execute(
    `UPDATE daily_proof_jobs
     SET status = 'submitted', sponsor_transaction_id = ?1,
         sponsorship_completed_at = ?2, sponsor_lease_expires_at = NULL,
         last_error_code = NULL, updated_at = ?2
     WHERE id = ?3 AND status = 'sponsored' AND sponsor_serialized_sha256 = ?4`,
    [result.sponsorTransactionId, completedAt, job.id, job.sponsor_serialized_sha256],
  );
  if (updated !== 1) {
    const changed = await currentJob(env, job.id);
    if (!['submitted', 'confirmed'].includes(changed.status)) {
      throw new Error('Proof Job changed while the sponsored transaction was submitted');
    }
    return changed;
  }
  await persistSponsorCheckpoint(env).catch((error) => {
    console.error(JSON.stringify({
      message: 'sponsor_checkpoint_after_submit_failed',
      proofJobId: job.id,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }));
  });
  return currentJob(env, job.id);
}

async function releaseContractUpgradeReservations(
  env: Env,
  contractAddress: string,
): Promise<void> {
  const database = createSqlDatabase(env);
  const jobs = await database.all<ProofJobRow>(
    `SELECT * FROM daily_proof_jobs
     WHERE status = 'dead_lettered'
       AND last_error_code = 'contract_schema_upgrade_release_required'
       AND sponsor_transaction_object_key IS NOT NULL
       AND sponsor_serialized_sha256 IS NOT NULL
       AND sponsor_transaction_id IS NULL
     ORDER BY updated_at ASC LIMIT 4`,
  );
  for (const job of jobs) {
    if (!job.sponsor_transaction_object_key || !job.sponsor_serialized_sha256) continue;
    const object = await env.SPONSOR_STATE.get(job.sponsor_transaction_object_key);
    if (!object || object.size <= 0 || object.size > maxTransactionBytes) {
      throw new Error(`Legacy Sponsor reservation artifact is unavailable for ${job.id}`);
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (await sha256Hex(bytes) !== job.sponsor_serialized_sha256) {
      throw new Error(`Legacy Sponsor reservation artifact is corrupt for ${job.id}`);
    }
    const response = await sponsorContainer(env).fetch(new Request('http://sponsor-wallet/release', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Sponsor-Contract-Address': contractAddress,
        'X-Sponsor-Serialized-Sha256': job.sponsor_serialized_sha256,
      },
      body: bytes,
      signal: AbortSignal.timeout(15 * 60_000),
    }));
    const released = await readSmallJson<SponsorRelease>(response);
    if (!released.released || released.serializedSha256 !== job.sponsor_serialized_sha256) {
      throw new Error(`Sponsor Wallet returned an invalid release result for ${job.id}`);
    }
    await persistSponsorCheckpoint(env);
    const updatedAt = new Date().toISOString();
    const updated = await database.execute(
      `UPDATE daily_proof_jobs
       SET sponsor_transaction_object_key = NULL, sponsor_serialized_sha256 = NULL,
           sponsor_fee_specks = NULL, sponsor_transaction_bytes = NULL,
           sponsor_lease_expires_at = NULL, last_error_code = 'contract_schema_upgraded',
           updated_at = ?1
       WHERE id = ?2 AND status = 'dead_lettered'
         AND last_error_code = 'contract_schema_upgrade_release_required'
         AND sponsor_serialized_sha256 = ?3`,
      [updatedAt, job.id, job.sponsor_serialized_sha256],
    );
    if (updated !== 1) throw new Error(`Legacy Sponsor reservation changed for ${job.id}`);
    await env.SPONSOR_STATE.delete(job.sponsor_transaction_object_key);
    console.log(JSON.stringify({
      message: 'sponsor_wallet_legacy_reservation_released',
      proofJobId: job.id,
      releasedAt: released.releasedAt,
    }));
  }
}

export async function sponsorProofTransaction(
  request: Request,
  env: Env,
  proofJobId: string,
  _ctx: ExecutionContext,
): Promise<Response> {
  const authorization = await authorizeDeviceRequest(request, env, 'transaction:submit');
  if (!authorization.ok) return authorization.response;
  if (!(await applyDeviceRateLimits(env.API_RATE_LIMITER, request, authorization.principal))) {
    return json(429, { error: 'Sponsorship API rate limit exceeded' });
  }
  if (!env.SPONSOR_WALLET_SEED?.trim()) {
    return json(503, { error: 'Sponsor Wallet is not configured' });
  }
  const contractAddress = normalizedContractAddress(env.PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS);
  if (!contractAddress) return json(503, { error: 'Sponsor contract policy is not configured' });

  try {
    const bytes = await readBoundedTransaction(request);
    const deviceTransactionHash = await sha256Hex(bytes);
    const database = createSqlDatabase(env);
    let job = await database.first<ProofJobRow>(
      'SELECT * FROM daily_proof_jobs WHERE id = ?1 AND device_id = ?2 AND project_id = ?3',
      [proofJobId, authorization.principal.deviceId, authorization.principal.projectId],
    );
    if (!job) return json(404, { error: 'Proof Job not found' });
    const acceptance = deviceTransactionAcceptance(
      job.status,
      job.device_transaction_hash,
      deviceTransactionHash,
    );
    if (acceptance === 'conflict') {
      return json(409, { error: 'Measurement group is already bound to another Device transaction' });
    }
    if (acceptance === 'idempotent-complete') {
      return json(200, sponsorshipView(job, true));
    }
    if (acceptance === 'ineligible') {
      return json(409, { error: 'Proof Job is not eligible for sponsorship' });
    }
    if (acceptance === 'idempotent-pending') {
      return json(202, sponsorshipView(job, true), { 'Retry-After': '15' });
    }
    const sponsorQuota = await reserveSponsorQuota(database, {
      deviceId: authorization.principal.deviceId,
      projectId: authorization.principal.projectId,
      proofJobId: job.id,
    });
    if (!sponsorQuota.accepted) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((Date.parse(sponsorQuota.resetAt) - Date.now()) / 1_000),
      );
      return json(429, {
        error: 'Daily sponsorship limit reached',
        sponsorQuota,
      }, { 'Retry-After': String(retryAfterSeconds) });
    }
    const objectKey = deviceTransactionObjectKey(job.id, deviceTransactionHash);
    await env.SPONSOR_STATE.put(objectKey, bytes, {
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: {
        format: 'midnight-device-finalized-transaction',
        proofJobId: job.id,
        serializedSha256: deviceTransactionHash,
      },
    });
    const acceptedAt = new Date().toISOString();
    const bound = await database.execute(
      `UPDATE daily_proof_jobs
       SET status = 'awaiting_sponsor', device_transaction_object_key = ?1,
           device_transaction_hash = ?2, device_transaction_bytes = ?3,
           sponsor_available_after = ?4, last_error_code = NULL, updated_at = ?4
       WHERE id = ?5 AND status = 'proof_ready' AND device_transaction_hash IS NULL`,
      [objectKey, deviceTransactionHash, bytes.byteLength, acceptedAt, job.id],
    );
    job = await currentJob(env, job.id);
    if (bound !== 1 && deviceTransactionAcceptance(
      job.status,
      job.device_transaction_hash,
      deviceTransactionHash,
    ) !== 'idempotent-pending') {
      await env.SPONSOR_STATE.delete(objectKey).catch(() => undefined);
      return json(409, { error: 'Measurement group was bound by another request' });
    }
    if (job.device_transaction_hash !== deviceTransactionHash) {
      await env.SPONSOR_STATE.delete(objectKey).catch(() => undefined);
      return json(409, { error: 'Measurement group is already bound to another Device transaction' });
    }
    try {
      await enqueueSponsorJob(env, job.id);
    } catch (error) {
      console.error(JSON.stringify({
        message: 'sponsor_queue_send_failed',
        proofJobId: job.id,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }));
    }
    return json(202, sponsorshipView(job, bound !== 1, sponsorQuota), {
      'Retry-After': '15',
    });
  } catch (error) {
    console.error(JSON.stringify({
      message: 'sponsor_transaction_failed',
      proofJobId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: errorMessage(error),
    }));
    const message = errorMessage(error);
    const status = message.includes('already in progress') ? 409 : 503;
    return json(status, { error: message }, status === 409 ? { 'Retry-After': '5' } : undefined);
  }
}

async function deferSponsorJob(
  env: Env,
  job: ProofJobRow,
  errorCode: string,
): Promise<void> {
  const now = new Date().toISOString();
  const retryAt = new Date(Date.now() + sponsorRetryDelayMs).toISOString();
  await createSqlDatabase(env).execute(
    `UPDATE daily_proof_jobs
     SET sponsor_available_after = ?1, sponsor_lease_expires_at = NULL,
         last_error_code = ?2, updated_at = ?3
     WHERE id = ?4 AND status = ?5`,
    [retryAt, errorCode, now, job.id, job.status],
  );
}

async function processSponsorQueueMessage(message: Message<unknown>, env: Env): Promise<void> {
  if (!isSponsorQueueMessage(message.body)) {
    message.ack();
    return;
  }
  const database = createSqlDatabase(env);
  let job = await database.first<ProofJobRow>(
    'SELECT * FROM daily_proof_jobs WHERE id = ?1',
    [message.body.proofJobId],
  );
  if (!job || ['submitted', 'confirmed', 'reproof_required', 'dead_lettered'].includes(job.status)) {
    message.ack();
    return;
  }
  if (job.status === 'sponsoring' && canRecoverStaleSponsoringRequest(job)) {
    const recoveredAt = new Date().toISOString();
    await database.execute(
      `UPDATE daily_proof_jobs
       SET status = 'sponsor_retryable', sponsor_lease_expires_at = NULL,
           sponsor_available_after = ?1, last_error_code = 'sponsor_prepare_interrupted',
           updated_at = ?1
       WHERE id = ?2 AND status = 'sponsoring' AND updated_at = ?3`,
      [recoveredAt, job.id, job.updated_at],
    );
    job = await currentJob(env, job.id);
  }
  if (!['awaiting_sponsor', 'sponsor_retryable', 'sponsored'].includes(job.status)) {
    message.ack();
    return;
  }
  if (Date.parse(job.sponsor_available_after) > Date.now()) {
    message.ack();
    return;
  }
  try {
    const health = await sponsorWalletHealth(env);
    if (!sponsorWalletCanSubmit(health)) {
      await deferSponsorJob(env, job, 'sponsor_wallet_not_ready');
      message.ack();
      return;
    }
    const contractAddress = normalizedContractAddress(env.PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS);
    if (!contractAddress) throw new Error('Sponsor contract policy is not configured');
    if (job.status !== 'sponsored') {
      if (!job.device_transaction_object_key || !job.device_transaction_hash) {
        throw new Error('Accepted Device transaction artifact is missing');
      }
      const object = await env.SPONSOR_STATE.get(job.device_transaction_object_key);
      if (!object || object.size <= 0 || object.size > maxTransactionBytes) {
        throw new Error('Accepted Device transaction artifact was not found');
      }
      const bytes = new Uint8Array(await object.arrayBuffer());
      if (
        bytes.byteLength !== job.device_transaction_bytes
        || await sha256Hex(bytes) !== job.device_transaction_hash
      ) throw new Error('Accepted Device transaction artifact failed its integrity check');
      job = await prepareSponsoredTransaction(
        env,
        job,
        contractAddress,
        bytes,
        job.device_transaction_hash,
      );
    }
    if (job.status === 'sponsored') {
      job = await submitSponsoredTransaction(env, job, contractAddress);
    }
    if (!['submitted', 'confirmed'].includes(job.status)) {
      throw new Error('Sponsor processing did not reach the submitted state');
    }
    console.log(JSON.stringify({
      message: 'sponsor_queue_job_submitted',
      proofJobId: job.id,
      sponsorAttemptCount: job.sponsor_attempt_count,
    }));
    message.ack();
  } catch (error) {
    if (errorMessage(error).includes('already in progress')) {
      console.log(JSON.stringify({
        message: 'sponsor_queue_duplicate_ignored',
        proofJobId: job.id,
      }));
      message.ack();
      return;
    }
    const changed = await currentJob(env, job.id);
    if (changed.status === 'sponsored') {
      await deferSponsorJob(env, changed, 'sponsor_submit_failed');
    } else if (changed.status === 'sponsoring') {
      const retryAt = new Date(Date.now() + sponsorRetryDelayMs).toISOString();
      await database.execute(
        `UPDATE daily_proof_jobs
         SET status = 'sponsor_retryable', sponsor_available_after = ?1,
             sponsor_lease_expires_at = NULL, last_error_code = 'sponsor_processing_failed',
             updated_at = ?2
         WHERE id = ?3 AND status = 'sponsoring'`,
        [retryAt, new Date().toISOString(), changed.id],
      );
    }
    console.error(JSON.stringify({
      message: 'sponsor_queue_job_failed',
      proofJobId: job.id,
      attempt: message.attempts,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: errorMessage(error),
    }));
    message.ack();
  }
}

export async function dispatchSponsorJobs(env: Env, scheduledTime: number): Promise<void> {
  const database = createSqlDatabase(env);
  const nowIso = new Date(scheduledTime).toISOString();
  const jobs = await database.all<{ id: string }>(
    `SELECT id FROM daily_proof_jobs
     WHERE status IN ('awaiting_sponsor', 'sponsor_retryable', 'sponsored')
       AND sponsor_available_after <= ?1
     ORDER BY sponsor_available_after ASC, created_at ASC LIMIT 16`,
    [nowIso],
  );
  for (const job of jobs) {
    try {
      await enqueueSponsorJob(env, job.id);
    } catch (error) {
      console.error(JSON.stringify({
        message: 'sponsor_queue_dispatch_failed',
        proofJobId: job.id,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }));
    }
  }
}

export async function handleSponsorQueue(
  batch: MessageBatch<unknown>,
  env: Env,
): Promise<void> {
  if (batch.queue !== sponsorQueueName) {
    batch.retryAll({ delaySeconds: 60 });
    return;
  }
  for (const message of batch.messages) await processSponsorQueueMessage(message, env);
}

export async function warmSponsorWallet(env: Env): Promise<void> {
  if (!env.SPONSOR_WALLET_SEED?.trim()) return;
  const warmupId = crypto.randomUUID();
  const startedAt = performance.now();
  console.log(JSON.stringify({
    message: 'sponsor_wallet_warmup_started',
    warmupId,
  }));
  try {
    const status = await sponsorWalletHealth(env);
    const contractAddress = normalizedContractAddress(env.PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS);
    if (contractAddress) await releaseContractUpgradeReservations(env, contractAddress);
    if (await replayInconsistentSponsorDustState(env, status)) return;
    console.log(JSON.stringify({
      message: 'sponsor_wallet_warmup',
      warmupId,
      durationMs: Math.round(performance.now() - startedAt),
      bootId: status.bootId,
      phase: status.phase,
      night: status.night,
      dust: status.dust,
      spendableDustCoins: status.spendableDustCoins,
      totalDustCoins: status.totalDustCoins,
      pendingDustCoins: status.pendingDustCoins,
      nightCoins: status.nightCoins,
      progress: status.progress,
      progressDetails: status.progressDetails,
      initialization: status.initialization,
      initializedAt: status.initializedAt,
      lastStateAt: status.lastStateAt,
      shuttingDown: status.shuttingDown,
      supervisor: status.supervisor,
      error: status.error,
    }));
    if (status.supervisor && status.supervisor.status !== 'healthy') {
      await logSponsorRuntimeDiagnostics(env, warmupId);
    }
    if (status.progress !== null && status.phase !== 'error') {
      await persistSponsorCheckpointIfStale(env, status);
    }
  } catch (error) {
    const message = errorMessage(error);
    const errorCode = message.includes('Maximum number of running container instances exceeded')
      ? 'sponsor_container_capacity_exhausted'
      : message.includes('initialization failed')
        ? 'sponsor_wallet_initialization_failed'
        : 'sponsor_wallet_warmup_failed';
    console.error(JSON.stringify({
      message: 'sponsor_wallet_warmup_failed',
      warmupId,
      durationMs: Math.round(performance.now() - startedAt),
      errorCode,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: message,
    }));
    if (message.toLowerCase().includes('timeout')) {
      await logSponsorRuntimeDiagnostics(env, warmupId);
    }
  }
}
