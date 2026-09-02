import fs from 'node:fs';
import path from 'node:path';

import {
  evaluatePreparedDailyExtremaHoursLocally,
  evaluatePreparedDailyExtremaLocally,
  prepareDailyExtremaAttestation,
  type PreparedDailyExtremaAttestation,
  type SensorRecord,
  type ThresholdPolicyDescriptor,
} from '@midnight-demo/shared';
import type { DeviceOperationConfiguration } from '@midnight-demo/device-auth';

import {
  deviceContractAddress,
  deviceWalletHome,
  isLocalProofServer,
  repoRoot,
  resolveNetwork,
  synchronizeDeviceOperationConfiguration,
  type NetworkConfig,
} from './config.js';
import {
  confirmSponsoredTransaction,
  queryRegistry,
  submitDailyAttestation,
  type SubmissionResult,
} from './midnight.js';
import { getOrCreateWalletCredentials } from './state.js';
import { prepareSyntheticBenchmarkDataset } from './synthetic.js';
import {
  canResumePendingDeviceTransaction,
  pendingDeviceTransactionRequired,
  reportProofTransaction,
  requestProofJob,
  sponsorProofTransaction,
  waitForProofJob,
} from './proof-job.js';
import { loadPendingDeviceTransaction } from './pending-transaction.js';
import {
  contractAuthorityEnrollmentFile,
  generateContractAuthority,
  loadContractAuthorityEnrollment,
} from './authority.js';
import {
  createWallet,
  walletAddress,
  type WalletContext,
} from './wallet.js';
import { withWalletExecutionLock } from './execution-lock.js';

type Command =
  | 'authority-generate'
  | 'authority-show'
  | 'benchmark'
  | 'configure'
  | 'wallet'
  | 'submit'
  | 'status';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  const inline = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function numericFlag(name: string, fallback: number): number {
  const raw = flag(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number`);
  return value;
}

function networkFromArgs(): NetworkConfig {
  return resolveNetwork(flag('network'));
}

async function loadPreparedAttestation(): Promise<PreparedDailyExtremaAttestation> {
  const input = flag('input');
  if (!input) throw new Error('--input is required; generated sensor data is not accepted');
  const inputPath = path.isAbsolute(input) ? input : path.resolve(repoRoot, input);
  const parsed = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as
    PreparedDailyExtremaAttestation | SensorRecord[];
  if (!Array.isArray(parsed) && parsed.publicData && parsed.privateData) return parsed;
  if (Array.isArray(parsed)) {
    return prepareDailyExtremaAttestation(parsed, {
      deviceId: process.env.SENSOR_DEVICE_ID?.trim() || 'edge-temp-001',
      periodDate: flag('period-date'),
      policyId: flag('policy') ?? process.env.THRESHOLD_POLICY_VERSION?.trim(),
      assignmentId: flag('assignment') ?? process.env.POLICY_ASSIGNMENT_ID?.trim(),
    });
  }
  throw new Error('Input must be a PreparedDailyExtremaAttestation or SensorRecord array');
}

async function connectWallet(network: NetworkConfig, proofJobId?: string): Promise<WalletContext> {
  const credentials = getOrCreateWalletCredentials(network.networkId);
  if (credentials.created) {
    process.stdout.write(`New ${network.networkId} device wallet created under ${deviceWalletHome}.\n`);
    process.stdout.write('Recovery material is not printed. Back up the owner-only credentials file offline.\n');
  }
  const wallet = await createWallet(network.networkId, network, credentials.seed, proofJobId);
  process.stdout.write(
    `Device transaction identity: ${walletAddress(wallet)} (no funding or DUST sync required)\n`,
  );
  return wallet;
}

async function closeWallet(wallet: WalletContext): Promise<void> {
  await wallet.wallet.stop();
}

async function runSubmit(
  network: NetworkConfig,
  dataset: PreparedDailyExtremaAttestation,
  configuration?: DeviceOperationConfiguration,
): Promise<SubmissionResult> {
  const policy: ThresholdPolicyDescriptor = configuration ? {
    policyId: configuration.policy.id,
    mode: configuration.policy.mode,
    minimum: configuration.policy.minimum ?? 0,
    maximum: configuration.policy.maximum ?? 0,
    valueScale: configuration.policy.valueScale,
    sensorTypeCode: configuration.policy.sensorTypeCode,
    unitCode: configuration.policy.unitCode,
    version: configuration.policy.version,
  } : {
    policyId: dataset.publicData.policyId,
    mode: (flag('threshold-mode') as ThresholdPolicyDescriptor['mode'] | undefined) ?? 'closed-range',
    minimum: numericFlag('threshold-minimum', 10),
    maximum: numericFlag('threshold-maximum', 35),
    valueScale: numericFlag('threshold-value-scale', 100),
    sensorTypeCode: numericFlag('sensor-type-code', 1),
    unitCode: numericFlag('unit-code', 1),
    version: numericFlag('threshold-version', 1),
  };
  const thresholdResult = evaluatePreparedDailyExtremaLocally(dataset, policy);
  const hourResults = evaluatePreparedDailyExtremaHoursLocally(dataset, policy);
  const thresholdSatisfied = thresholdResult === 'within-threshold';
  process.stdout.write(`Daily threshold result: ${thresholdResult}\n`);
  const requested = await requestProofJob(network, dataset, hourResults, thresholdSatisfied);
  if (requested.proofJobId && requested.job) {
    process.stdout.write(
      `Proof Job ${requested.proofJobId}: ${requested.job.status}; available after ${requested.job.availableAfter}\n`,
    );
  }
  const admission = await waitForProofJob(network, requested);
  if (admission.proofJobId) {
    process.stdout.write(`Proof Job ${admission.proofJobId} admitted for private input.\n`);
  }
  const pending = admission.proofJobId
    ? loadPendingDeviceTransaction(admission.proofJobId)
    : null;
  if (
    admission.job
    && pendingDeviceTransactionRequired(admission.job.status)
    && !pending
  ) {
    throw new Error(
      `Proof Job ${admission.proofJobId} requires its pending Device transaction artifact`,
    );
  }
  if (
    admission.proofJobId
    && admission.job
    && canResumePendingDeviceTransaction(admission.job.status, pending !== null)
  ) {
    if (!pending) throw new Error('Pending Device transaction disappeared before retry');
    if (
      admission.job.deviceTransactionHash
      && admission.job.deviceTransactionHash !== pending.serializedSha256
    ) throw new Error('Pending Device transaction does not match the Proof Job');
    const sponsorship = await sponsorProofTransaction(network, admission.proofJobId, pending.bytes);
    const confirmation = await confirmSponsoredTransaction(network, sponsorship);
    const attest: SubmissionResult['attest'] = {
      txId: confirmation.txId,
      txHash: confirmation.txHash,
      sponsorTransactionId: sponsorship.sponsorTransactionId,
      blockHeight: confirmation.blockHeight,
      feeSpecks: sponsorship.feeSpecks,
      feeDust: sponsorship.feeDust,
      deviceTransactionHash: sponsorship.deviceTransactionHash,
      deviceTransactionBytes: sponsorship.deviceTransactionBytes,
      transactionBytes: sponsorship.transactionBytes,
      proofGeneratedAt: null,
      proofServerRequests: [],
    };
    await reportProofTransaction(network, admission.proofJobId, 'attest', attest);
    return {
      attest,
      timing: {
        proofServerReadyMs: 0,
        privateStatePreparationMs: 0,
        contractConnectionMs: 0,
        attestationTransactionMs: 0,
      },
    };
  }
  const wallet = await connectWallet(network, admission.proofJobId);
  try {
    return await submitDailyAttestation(
      wallet,
      network,
      deviceContractAddress(flag('contract')),
      dataset,
      hourResults,
      thresholdSatisfied,
      admission.proofJobId,
      async (phase, transaction) => reportProofTransaction(
        network,
        admission.proofJobId,
        phase,
        transaction,
      ),
    );
  } finally {
    await closeWallet(wallet);
  }
}

function benchmarkResultPath(runId: string, sampleCount: number): string {
  const outputDir = path.join(deviceWalletHome, 'benchmarks');
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  return path.join(outputDir, `sensor-registry-${sampleCount}-${runId}.json`);
}

function writeBenchmarkResult(outputPath: string, result: unknown): void {
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
}

async function runSyntheticBenchmark(
  network: NetworkConfig,
  configuration?: DeviceOperationConfiguration,
): Promise<void> {
  if (!hasFlag('confirm-synthetic')) {
    throw new Error('Synthetic submission requires --confirm-synthetic');
  }
  const sampleCount = numericFlag('samples', 0);
  const runId = flag('run-id') ?? Date.now().toString();
  const outputPath = benchmarkResultPath(runId, sampleCount);
  if (fs.existsSync(outputPath)) throw new Error(`Synthetic benchmark run ID already exists: ${runId}`);
  const preparationStarted = performance.now();
  const dataset = await prepareSyntheticBenchmarkDataset({
    sampleCount,
    runId,
    seed: numericFlag('seed', 20260828 + sampleCount),
    deviceId: configuration?.device.deviceId ?? process.env.SENSOR_DEVICE_ID?.trim(),
    periodDate: flag('period-date'),
    outlierValue: flag('outlier-value') === undefined
      ? undefined
      : numericFlag('outlier-value', 40),
    policyId: flag('policy') ?? process.env.THRESHOLD_POLICY_VERSION?.trim(),
    assignmentId: flag('assignment') ?? process.env.POLICY_ASSIGNMENT_ID?.trim(),
  });
  const datasetPreparationMs = Math.round(performance.now() - preparationStarted);
  const submissionStarted = performance.now();
  try {
    const thresholdResult = evaluatePreparedDailyExtremaLocally(dataset, configuration ? {
      policyId: configuration.policy.id,
      mode: configuration.policy.mode,
      minimum: configuration.policy.minimum ?? 0,
      maximum: configuration.policy.maximum ?? 0,
      valueScale: configuration.policy.valueScale,
      sensorTypeCode: configuration.policy.sensorTypeCode,
      unitCode: configuration.policy.unitCode,
      version: configuration.policy.version,
    } : {
      policyId: dataset.publicData.policyId,
      mode: 'closed-range',
      minimum: 10,
      maximum: 35,
      valueScale: 100,
      sensorTypeCode: 1,
      unitCode: 1,
      version: 1,
    });
    const transactions = await runSubmit(network, dataset, configuration);
    const result = {
      measuredAt: new Date().toISOString(),
      synthetic: true,
      succeeded: true,
      network: network.networkId,
      proofServerHost: new URL(network.proofServer).host,
      contractAddress: deviceContractAddress(flag('contract')),
      runId,
      sampleCount,
      samplesPerDay: sampleCount,
      intervalSeconds: 86_400 / sampleCount,
      attestationCommitment: dataset.publicData.attestationCommitment,
      observedHourCount: dataset.publicData.observedHourCount,
      stoppedHourCount: dataset.publicData.stoppedHourCount,
      thresholdResult,
      timing: {
        datasetPreparationMs,
        submissionMs: Math.round(performance.now() - submissionStarted),
        ...transactions.timing,
      },
      transactions: {
        attest: transactions.attest,
      },
    };
    writeBenchmarkResult(outputPath, result);
    process.stdout.write(`${JSON.stringify({ ...result, outputPath }, null, 2)}\n`);
  } catch (error) {
    const result = {
      measuredAt: new Date().toISOString(),
      synthetic: true,
      succeeded: false,
      network: network.networkId,
      proofServerHost: new URL(network.proofServer).host,
      contractAddress: deviceContractAddress(flag('contract')),
      runId,
      sampleCount,
      timing: {
        datasetPreparationMs,
        submissionMs: Math.round(performance.now() - submissionStarted),
      },
      error: error instanceof Error ? error.message : String(error),
    };
    writeBenchmarkResult(outputPath, result);
    process.stdout.write(`${JSON.stringify({ ...result, outputPath }, null, 2)}\n`);
    throw error;
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] as Command | undefined;
  const bootstrapNetwork = networkFromArgs();
  let operationConfiguration: DeviceOperationConfiguration | undefined;

  if (command === 'configure') {
    const configuration = await synchronizeDeviceOperationConfiguration(
      bootstrapNetwork.proofServer,
      flag('network') as NetworkConfig['networkId'] | undefined,
    );
    process.stdout.write(`${JSON.stringify({
      configured: true,
      configurationVersion: configuration.configurationVersion,
      updatedAt: configuration.updatedAt,
      deviceId: configuration.device.deviceId,
      projectId: configuration.device.projectId,
      network: configuration.midnight.network,
      contractAddress: configuration.midnight.contractAddress,
      contractSchemaVersion: configuration.midnight.contractSchemaVersion,
      thresholdPolicyVersion: configuration.policy.id,
      policyAssignmentId: configuration.assignment.id,
    }, null, 2)}\n`);
    return;
  }

  if (command && ['benchmark', 'submit', 'status'].includes(command)) {
    if (flag('contract') && !isLocalProofServer(bootstrapNetwork.proofServer)) {
      throw new Error('--contract is allowed only with a loopback Proof Server');
    }
    if (!flag('contract')) {
      operationConfiguration = await synchronizeDeviceOperationConfiguration(
        bootstrapNetwork.proofServer,
        flag('network') as NetworkConfig['networkId'] | undefined,
      );
    }
  }

  const network = networkFromArgs();

  if (command === 'authority-generate') {
    if (!hasFlag('confirm-contract-authority-generation')) {
      throw new Error(
        'Contract authority generation requires --confirm-contract-authority-generation',
      );
    }
    const enrollment = generateContractAuthority(network.networkId);
    process.stdout.write(`${JSON.stringify({
      created: true,
      ...enrollment,
      enrollmentFile: contractAuthorityEnrollmentFile(network.networkId),
    }, null, 2)}\n`);
    return;
  }

  if (command === 'authority-show') {
    process.stdout.write(`${JSON.stringify(
      loadContractAuthorityEnrollment(network.networkId),
      null,
      2,
    )}\n`);
    return;
  }

  if (command === 'wallet') return withWalletExecutionLock(command, async () => {
    const wallet = await connectWallet(network);
    return closeWallet(wallet);
  });
  if (command === 'benchmark') {
    return withWalletExecutionLock(
      command,
      () => runSyntheticBenchmark(network, operationConfiguration),
    );
  }
  if (command === 'submit') {
    return withWalletExecutionLock(command, async () => {
      const transactions = await runSubmit(
        network,
        await loadPreparedAttestation(),
        operationConfiguration,
      );
      process.stdout.write(`${JSON.stringify(transactions, null, 2)}\n`);
    });
  }
  if (command === 'status') {
    const address = deviceContractAddress(flag('contract'));
    process.stdout.write(`${JSON.stringify(await queryRegistry(network, address), null, 2)}\n`);
    return;
  }
  process.stdout.write(
    'Usage: cli.ts <authority-generate|authority-show|benchmark|configure|wallet|submit|status> [options]\n',
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
