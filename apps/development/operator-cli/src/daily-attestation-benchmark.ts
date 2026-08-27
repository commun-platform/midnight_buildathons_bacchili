import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

import {
  createUnprovenCallTxFromInitialStates,
  createUnprovenDeployTx,
} from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProvingProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import {
  ChargedState,
  sampleSigningKey,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import {
  CostModel,
  LedgerParameters,
  ZswapChainState,
  ZswapSecretKeys,
  createCheckPayload,
  createProvingPayload,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  createProofProvider,
  zkConfigToProvingKeyMaterial,
} from '@midnight-ntwrk/midnight-js-types';
import { parseCoinPublicKeyToHex } from '@midnight-ntwrk/midnight-js-utils';

import {
  DAILY_ATTESTATION_PRIVATE_STATE_ID,
  createDailyAttestationWitnesses,
  type DailyAttestationPrivateState,
} from '@midnight-demo/daily-attestation-contract/witnesses';

import {
  createDeviceSignatureBundle,
  createSignedOutlierReason,
  ensureSigningKeyPair,
  publicKeyCommitment,
  verifyDeviceSignatureBundle,
  verifySignedOutlierReason,
  type HourSignaturePayload,
} from './device-evidence.js';
import {
  proofServerHeaders,
  repoRoot,
  resolveNetwork,
  stateDir,
} from './config.js';
import { waitForProofServer } from './midnight.js';
import { getOrCreateWalletCredentials } from './state.js';
import {
  createWallet,
  persistWalletState,
  syncWallet,
  walletBalances,
  type WalletContext,
} from './wallet.js';

type Measurement = {
  timestamp: bigint;
  sequence: bigint;
  sensorId: Uint8Array;
  temperatureCentiOffset: bigint;
  schemaVersion: bigint;
};

type ThresholdPolicy = {
  minimumCentiOffset: bigint;
  maximumCentiOffset: bigint;
  policyVersion: bigint;
};

type HourInput = {
  measurements: Measurement[];
  nonces: Uint8Array[];
};

type DayInput = {
  hours: HourInput[];
  policy: ThresholdPolicy;
  policyNonce: Uint8Array;
};

type HourClaim = {
  hourRoot: Uint8Array;
  sampleCount: bigint;
  normalCount: bigint;
  anomalyCount: bigint;
  allWithinRange: boolean;
};

type PureCircuits = {
  deriveOperatorCommitment(secret: Uint8Array): Uint8Array;
  policyCommitment(policy: ThresholdPolicy, nonce: Uint8Array): Uint8Array;
  computeDayRoot(hours: HourInput[]): Uint8Array;
  computeHourClaims(hours: HourInput[], policy: ThresholdPolicy): HourClaim[];
  computeHourClaimsRoot(claims: HourClaim[]): Uint8Array;
};

type ContractModule = {
  Contract: new (witnesses: unknown) => unknown;
  pureCircuits: PureCircuits;
};

type RequestMetric = {
  endpoint: 'check' | 'prove';
  bytes: number;
  durationMs: number | null;
  status: 'ok' | 'failed' | 'not-sent';
  error?: string;
};

const dustAtomicUnits = 1_000_000_000_000_000n;
const supportedSampleCounts = [24, 96, 1440];

function positiveIntegerArgument(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  const index = process.argv.indexOf(`--${name}`);
  const raw = inline?.slice(prefix.length) ?? (index >= 0 ? process.argv[index + 1] : undefined);
  const value = Number(raw ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer`);
  return value;
}

function deterministicBytes(label: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(label).digest());
}

function bytesToHex(value: Uint8Array): string {
  return Buffer.from(value).toString('hex');
}

function hexToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'hex'));
}

function formatDust(value: bigint): string {
  return `${value / dustAtomicUnits}.${(value % dustAtomicUnits).toString().padStart(15, '0')}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildDayInput(sampleCount: number): DayInput {
  if (sampleCount % 24 !== 0) throw new Error('sample count must be divisible by 24');
  const samplesPerHour = sampleCount / 24;
  const sensorId = deterministicBytes('production-attestation:temperature-sensor');
  const baseTimestamp = 1_787_673_600n;
  const policy: ThresholdPolicy = {
    minimumCentiOffset: 12_000n,
    maximumCentiOffset: 13_500n,
    policyVersion: 1n,
  };
  let sequence = 1n;
  const hours: HourInput[] = [];

  for (let hourIndex = 0; hourIndex < 24; hourIndex += 1) {
    const measurements: Measurement[] = [];
    const nonces: Uint8Array[] = [];
    for (let sampleIndex = 0; sampleIndex < samplesPerHour; sampleIndex += 1) {
      const isAnomaly = sequence % 19n === 0n;
      measurements.push({
        timestamp: baseTimestamp + BigInt(
          hourIndex * 3600 + sampleIndex * Math.floor(3600 / samplesPerHour),
        ),
        sequence,
        sensorId,
        temperatureCentiOffset: isAnomaly
          ? 14_000n + BigInt(sampleIndex % 5)
          : 12_500n + BigInt((hourIndex + sampleIndex) % 101),
        schemaVersion: 1n,
      });
      nonces.push(deterministicBytes(`production-attestation:${sampleCount}:${sequence}`));
      sequence += 1n;
    }
    hours.push({ measurements, nonces });
  }
  return {
    hours,
    policy,
    policyNonce: deterministicBytes(`production-policy:${sampleCount}:v1`),
  };
}

function createEvidence(
  sampleCount: number,
  dayInput: DayInput,
  claims: HourClaim[],
): ReturnType<typeof createDeviceSignatureBundle> {
  const deviceKeys = ensureSigningKeyPair('device-ed25519');
  const deviceCommitment = publicKeyCommitment(deviceKeys.publicKey);
  const localDate = '2026-08-26';
  const firmwareId = 'temperature-agent-v1';
  const payloads: HourSignaturePayload[] = claims.map((claim, hourIndex) => {
    const hour = dayInput.hours[hourIndex];
    const first = hour?.measurements[0];
    const last = hour?.measurements[hour.measurements.length - 1];
    if (!first || !last) throw new Error(`Hour ${hourIndex} is empty`);
    return {
      domain: 'measurement-hour-root:v1',
      deviceCommitment,
      schemaVersion: 1,
      localDate,
      hourIndex,
      hourRoot: bytesToHex(claim.hourRoot),
      sampleCount: sampleCount / 24,
      firstSequence: first.sequence.toString(),
      lastSequence: last.sequence.toString(),
      firmwareId,
    };
  });
  return createDeviceSignatureBundle(payloads);
}

function fileSize(file: string): number {
  return fs.statSync(file).size;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return bytesToHex(value);
  return value;
}

async function main(): Promise<void> {
  const sampleCount = positiveIntegerArgument('samples', 24);
  if (!supportedSampleCounts.includes(sampleCount)) {
    throw new Error(`--samples must be one of ${supportedSampleCounts.join(', ')}`);
  }
  const balanceTransaction = process.argv.includes('--balance');
  const network = resolveNetwork();
  setNetworkId(network.networkId);
  const artifactsPath = path.join(
    repoRoot,
    'contracts',
    'daily-attestation',
    'src',
    'managed',
    `daily-attestation-${sampleCount}`,
  );
  const contractModulePath = path.join(artifactsPath, 'contract', 'index.js');
  if (!fs.existsSync(contractModulePath)) {
    throw new Error(`Missing ${sampleCount}-sample production artifacts`);
  }

  const module = await import(pathToFileURL(contractModulePath).href) as ContractModule;
  if (typeof module.pureCircuits.deriveOperatorCommitment !== 'function') {
    throw new Error('Artifacts are stale; recompile after exporting deriveOperatorCommitment');
  }

  const datasetStarted = performance.now();
  const dayInput = buildDayInput(sampleCount);
  const operatorSecret = deterministicBytes('production-attestation:operator-secret');
  const operatorCommitment = module.pureCircuits.deriveOperatorCommitment(operatorSecret);
  const policyCommitment = module.pureCircuits.policyCommitment(dayInput.policy, dayInput.policyNonce);
  const dayRoot = module.pureCircuits.computeDayRoot(dayInput.hours);
  const hourClaims = module.pureCircuits.computeHourClaims(dayInput.hours, dayInput.policy);
  const hourClaimsRoot = module.pureCircuits.computeHourClaimsRoot(hourClaims);
  const signatureEvidence = createEvidence(sampleCount, dayInput, hourClaims);
  if (!verifyDeviceSignatureBundle(signatureEvidence.bundle, signatureEvidence.bundleHash)) {
    throw new Error('Generated device signature bundle did not verify');
  }
  const deviceCommitment = hexToBytes(signatureEvidence.bundle.hours[0]!.payload.deviceCommitment);
  const signatureBundleHash = hexToBytes(signatureEvidence.bundleHash);
  const datasetPreparationMs = performance.now() - datasetStarted;

  const privateState: DailyAttestationPrivateState<DayInput> = {
    operatorSecret,
    days: [{ dayRoot, input: dayInput }],
  };
  const witnesses = createDailyAttestationWitnesses<DayInput>();
  const compiledContract = CompiledContract.make(
    `daily-attestation-${sampleCount}`,
    module.Contract as never,
  ).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(artifactsPath),
  );
  const zkConfigProvider = new NodeZkConfigProvider(artifactsPath);
  const benchmarkKeys = ZswapSecretKeys.fromSeed(deterministicBytes('daily-attestation:zswap'));
  const walletProvider = {
    getCoinPublicKey: () => benchmarkKeys.coinPublicKey,
    getEncryptionPublicKey: () => benchmarkKeys.encryptionPublicKey,
  };
  const coinPublicKey = parseCoinPublicKeyToHex(benchmarkKeys.coinPublicKey, getNetworkId());
  const ledgerParameters = LedgerParameters.initialParameters();
  const zswapChainState = new ZswapChainState();

  const transactionStarted = performance.now();
  const deployment = await createUnprovenDeployTx(
    { zkConfigProvider, walletProvider } as never,
    {
      compiledContract: compiledContract as never,
      args: [operatorCommitment],
      signingKey: sampleSigningKey(),
      initialPrivateState: privateState,
    } as never,
  );
  const commonCallOptions = {
    compiledContract: compiledContract as never,
    contractAddress: deployment.public.contractAddress,
    coinPublicKey,
    initialZswapChainState: zswapChainState,
    ledgerParameters,
  };
  const contractState = deployment.public.initialContractState;
  const registeredDevice = await createUnprovenCallTxFromInitialStates(
    zkConfigProvider,
    {
      ...commonCallOptions,
      circuitId: 'registerDevice',
      args: [deviceCommitment],
      initialContractState: contractState,
      initialPrivateState: privateState,
    } as never,
    benchmarkKeys.encryptionPublicKey,
  );
  contractState.data = new ChargedState(registeredDevice.public.nextContractState);
  const registeredPolicy = await createUnprovenCallTxFromInitialStates(
    zkConfigProvider,
    {
      ...commonCallOptions,
      circuitId: 'registerPolicy',
      args: [policyCommitment],
      initialContractState: contractState,
      initialPrivateState: registeredDevice.private.nextPrivateState,
    } as never,
    benchmarkKeys.encryptionPublicKey,
  );
  contractState.data = new ChargedState(registeredPolicy.public.nextContractState);
  const unprovenCall = await createUnprovenCallTxFromInitialStates(
    zkConfigProvider,
    {
      ...commonCallOptions,
      circuitId: 'submitDailyAttestation',
      args: [
        dayRoot,
        deviceCommitment,
        policyCommitment,
        signatureBundleHash,
        1_787_673_600n,
        1_787_760_000n,
        1n,
      ],
      initialContractState: contractState,
      initialPrivateState: registeredPolicy.private.nextPrivateState,
    } as never,
    benchmarkKeys.encryptionPublicKey,
  );
  const transactionPreparationMs = performance.now() - transactionStarted;

  const outputDir = path.join(stateDir, 'benchmarks');
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const firstAnomalyHour = hourClaims.findIndex((claim) => claim.anomalyCount > 0n);
  const signedReason = createSignedOutlierReason({
    domain: 'measurement-outlier-reason:v1',
    dayRoot: bytesToHex(dayRoot),
    hourIndex: firstAnomalyHour < 0 ? 0 : firstAnomalyHour,
    reasonCode: 'BENCHMARK_MAINTENANCE',
    reasonText: 'Scheduled inspection caused the recorded anomaly.',
    operatorId: 'operator-001',
    recordedAt: '2026-08-27T00:00:00.000Z',
    previousReasonHash: '00'.repeat(32),
  });
  if (!verifySignedOutlierReason(signedReason)) throw new Error('Generated reason signature did not verify');
  fs.writeFileSync(
    path.join(outputDir, `daily-attestation-${sampleCount}-public-evidence.json`),
    `${JSON.stringify({
      dayRoot,
      hourClaimsRoot,
      hourClaims,
      deviceSignatures: signatureEvidence.bundle,
      deviceSignatureBundleHash: signatureEvidence.bundleHash,
      exampleOutlierReason: signedReason,
    }, jsonReplacer, 2)}\n`,
    { mode: 0o600 },
  );

  let proofServerReadyMs: number | null = null;
  let proofServerReadyError: string | null = null;
  const readyStarted = performance.now();
  try {
    await waitForProofServer(network);
    proofServerReadyMs = performance.now() - readyStarted;
  } catch (error) {
    proofServerReadyError = errorMessage(error);
  }

  const metrics: RequestMetric[] = [];
  const remote = httpClientProvingProvider(network.proofServer, zkConfigProvider, {
    timeout: 60 * 60_000,
    headers: proofServerHeaders(),
  });
  const measuredProvider = {
    async check(serializedPreimage: Uint8Array, keyLocation: string) {
      const keyMaterial = zkConfigToProvingKeyMaterial(await zkConfigProvider.get(keyLocation));
      const bytes = createCheckPayload(serializedPreimage, keyMaterial.ir).byteLength;
      const metric: RequestMetric = { endpoint: 'check', bytes, durationMs: null, status: 'not-sent' };
      metrics.push(metric);
      const started = performance.now();
      try {
        const result = await remote.check(serializedPreimage, keyLocation);
        metric.durationMs = performance.now() - started;
        metric.status = 'ok';
        return result;
      } catch (error) {
        metric.durationMs = performance.now() - started;
        metric.status = 'failed';
        metric.error = errorMessage(error);
        throw error;
      }
    },
    async prove(serializedPreimage: Uint8Array, keyLocation: string, overwriteBindingInput?: bigint) {
      const keyMaterial = zkConfigToProvingKeyMaterial(await zkConfigProvider.get(keyLocation));
      const bytes = createProvingPayload(serializedPreimage, overwriteBindingInput, keyMaterial).byteLength;
      const metric: RequestMetric = { endpoint: 'prove', bytes, durationMs: null, status: 'not-sent' };
      metrics.push(metric);
      const started = performance.now();
      try {
        const result = await remote.prove(serializedPreimage, keyLocation, overwriteBindingInput);
        metric.durationMs = performance.now() - started;
        metric.status = 'ok';
        return result;
      } catch (error) {
        metric.durationMs = performance.now() - started;
        metric.status = 'failed';
        metric.error = errorMessage(error);
        throw error;
      }
    },
  };
  const proofProvider = createProofProvider(measuredProvider, CostModel.initialCostModel());
  const proofStarted = performance.now();
  let proofError = proofServerReadyError;
  let provenTransaction: Awaited<ReturnType<typeof proofProvider.proveTx>> | null = null;
  if (!proofError) {
    try {
      provenTransaction = await proofProvider.proveTx(unprovenCall.private.unprovenTx);
    } catch (error) {
      proofError = errorMessage(error);
    }
  }
  const proofMs = performance.now() - proofStarted;

  let contractFeeSpecks: string | null = null;
  let contractFeeDust: string | null = null;
  let contractTransactionBytes: number | null = null;
  if (provenTransaction) {
    const fee = provenTransaction.fees(ledgerParameters);
    contractFeeSpecks = fee.toString();
    contractFeeDust = formatDust(fee);
    contractTransactionBytes = provenTransaction.serialize().byteLength;
  }

  let wallet: WalletContext | null = null;
  let walletSyncMs: number | null = null;
  let walletBalanceProofMs: number | null = null;
  let finalizedFeeSpecks: string | null = null;
  let finalizedFeeDust: string | null = null;
  let finalizedTransactionBytes: number | null = null;
  let balanceError: string | null = null;
  if (balanceTransaction && provenTransaction) {
    try {
      const credentials = getOrCreateWalletCredentials(network.networkId);
      wallet = await createWallet(network.networkId, network, credentials.seed);
      const syncStarted = performance.now();
      const walletState = await syncWallet(wallet, network.networkId);
      walletSyncMs = performance.now() - syncStarted;
      if (walletBalances(walletState).dust === 0n) throw new Error('Benchmark wallet has no spendable DUST');
      const balanceStarted = performance.now();
      const recipe = await wallet.wallet.balanceUnboundTransaction(
        provenTransaction,
        {
          shieldedSecretKeys: wallet.shieldedSecretKeys,
          dustSecretKey: wallet.dustSecretKey,
        },
        {
          ttl: new Date(Date.now() + 30 * 60 * 1000),
          tokenKindsToBalance: ['dust'],
        },
      );
      const finalized = await wallet.wallet.finalizeRecipe(recipe);
      walletBalanceProofMs = performance.now() - balanceStarted;
      const fee = finalized.fees(ledgerParameters);
      finalizedFeeSpecks = fee.toString();
      finalizedFeeDust = formatDust(fee);
      finalizedTransactionBytes = finalized.serialize().byteLength;
    } catch (error) {
      balanceError = errorMessage(error);
    } finally {
      if (wallet) {
        wallet.checkpoint?.unsubscribe();
        await persistWalletState(wallet, network.networkId);
        await wallet.wallet.stop();
      }
    }
  }

  const circuitKey = path.join(artifactsPath, 'keys', 'submitDailyAttestation.prover');
  const result = {
    measuredAt: new Date().toISOString(),
    implementation: 'production-daily-attestation-v1',
    network: network.networkId,
    proofServerHost: new URL(network.proofServer).host,
    sampleCount,
    samplesPerHour: sampleCount / 24,
    privacy: {
      rawMeasurementsPublic: false,
      privateThresholdsPublic: false,
      noncesPublic: false,
      publicHourlyClaims: ['hourRoot', 'sampleCount', 'normalCount', 'anomalyCount', 'allWithinRange'],
    },
    guarantees: {
      persistentMeasurementCommitments: sampleCount,
      persistentHourlyRoots: 24,
      persistentDayRoot: true,
      policyCommitmentBound: true,
      sequenceContinuity: true,
      anomalyClassificationComplete: true,
      deviceSignatureBundleVerifiedOffCircuit: true,
      appendOnlyReasonHashImplemented: true,
    },
    publicEvidence: {
      dayRoot: bytesToHex(dayRoot),
      hourClaimsRoot: bytesToHex(hourClaimsRoot),
      anomalyCount: hourClaims.reduce((total, claim) => total + claim.anomalyCount, 0n).toString(),
      deviceSignatureBundleHash: signatureEvidence.bundleHash,
      exampleReasonHash: signedReason.reasonHash,
    },
    artifacts: {
      dailyProverKeyBytes: fileSize(circuitKey),
      dailyVerifierKeyBytes: fileSize(path.join(artifactsPath, 'keys', 'submitDailyAttestation.verifier')),
      dailyZkirBytes: fileSize(path.join(artifactsPath, 'zkir', 'submitDailyAttestation.bzkir')),
      allProverKeysBytes: fs.readdirSync(path.join(artifactsPath, 'keys'))
        .filter((name) => name.endsWith('.prover'))
        .reduce((total, name) => total + fileSize(path.join(artifactsPath, 'keys', name)), 0),
    },
    timing: {
      datasetPreparationMs: Math.round(datasetPreparationMs),
      transactionPreparationMs: Math.round(transactionPreparationMs),
      proofServerReadyMs: proofServerReadyMs === null ? null : Math.round(proofServerReadyMs),
      proofRequestMs: Math.round(proofMs),
      walletSyncMs: walletSyncMs === null ? null : Math.round(walletSyncMs),
      walletBalanceProofMs: walletBalanceProofMs === null ? null : Math.round(walletBalanceProofMs),
    },
    proof: {
      succeeded: proofError === null,
      error: proofError,
      requests: metrics.map((metric) => ({
        ...metric,
        durationMs: metric.durationMs === null ? null : Math.round(metric.durationMs),
      })),
    },
    midnightTransaction: {
      contractFeeSpecks,
      contractFeeDust,
      contractTransactionBytes,
      finalizedFeeSpecks,
      finalizedFeeDust,
      finalizedTransactionBytes,
      balanceError,
      submitted: false,
    },
  };
  const outputPath = path.join(outputDir, `daily-attestation-${sampleCount}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(result, jsonReplacer, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(result, jsonReplacer, 2)}\n`);
  process.stdout.write(`Saved benchmark metrics to ${outputPath}\n`);
  if (proofError) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
