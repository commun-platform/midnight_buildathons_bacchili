import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';

import {
  createSensorPrivateState,
  SENSOR_PRIVATE_STATE_ID,
  witnesses,
  type SensorPrivateState,
} from '@midnight-demo/sensor-registry-contract/witnesses';
import {
  bytesToHex,
  hexToBytes,
  type HourThresholdResult,
  type PreparedDailyExtremaAttestation,
} from '@midnight-demo/shared';
import { deviceAuthenticatedFetch } from '@midnight-demo/device-auth';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProvingProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import {
  CostModel,
  createCheckPayload,
  createProvingPayload,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  SucceedEntirely,
  createProofProvider,
  zkConfigToProvingKeyMaterial,
  type FinalizedTxData,
} from '@midnight-ntwrk/midnight-js-types';

import {
  contractArtifactsPath,
  contractModulePath,
  deviceProofAuthConfig,
  isLocalProofServer,
  privateStatePassword,
  proofServerHeaders,
  stateDir,
  type NetworkConfig,
} from './config.js';
import { loadContractAuthority } from './authority.js';
import { savePendingDeviceTransaction } from './pending-transaction.js';
import { sponsorProofTransaction, type SponsoredTransaction } from './proof-job.js';
import { walletAddress, type WalletContext } from './wallet.js';

interface LoadedContract {
  module: {
    Contract: new (witnesses: unknown) => unknown;
    ledger(state: unknown): {
      policies: Iterable<[Uint8Array, {
        mode: number;
        minimumCentiOffset: bigint;
        maximumCentiOffset: bigint;
        valueScale: bigint;
        sensorTypeCode: bigint;
        unitCode: bigint;
        version: bigint;
      }]>;
      policyAssignments: Iterable<[Uint8Array, {
        policyId: Uint8Array;
        deviceCommitment: Uint8Array;
        timeZoneOffsetMinutesBias: bigint;
        localDayStartHour: bigint;
        utcDayStartMinute: bigint;
        validFrom: bigint;
        validUntil: bigint;
        version: bigint;
      }]>;
      attestations: Iterable<[Uint8Array, {
        attestationCommitment: Uint8Array;
        measurementGroupId: Uint8Array;
        deviceCommitment: Uint8Array;
        policyId: Uint8Array;
        assignmentId: Uint8Array;
        measurementDay: bigint;
        periodStart: bigint;
        periodEnd: bigint;
        hourPresence: boolean[];
        hourResults: number[];
        observedHourCount: bigint;
        sampleCount: bigint;
        schemaVersion: bigint;
        circuitVersion: bigint;
        thresholdSatisfied: boolean;
        verified: boolean;
      }]>;
      devices: Iterable<[Uint8Array, {
        authority: Uint8Array;
        active: boolean;
        version: bigint;
      }]>;
      operatorAuthority: Uint8Array;
      deviceCount: bigint;
      disabledDeviceCount: bigint;
      policyCount: bigint;
      assignmentCount: bigint;
      attestationCount: bigint;
      lastAttestationCommitment: Uint8Array;
      lastAttestationThresholdSatisfied: boolean;
    };
  };
  compiledContract: unknown;
}

export interface TransactionSummary {
  txId: string;
  txHash: string | null;
  sponsorTransactionId: string;
  blockHeight: string;
  feeSpecks: string;
  feeDust: string;
  deviceTransactionHash: string;
  deviceTransactionBytes: number;
  transactionBytes: number;
  proofGeneratedAt: string | null;
  proofServerRequests: ProofServerRequestMetric[];
}

export interface ProofServerRequestMetric {
  endpoint: 'check' | 'prove';
  requestBytes: number;
  durationMs: number;
  completedAt: string;
}

export interface SponsoredTransactionConfirmation {
  txId: string;
  txHash: string;
  blockHeight: string;
}

export function summarizeSponsoredTransactionConfirmation(
  expectedTxId: string,
  expectedTxHash: string,
  finalized: Pick<FinalizedTxData, 'status' | 'txId' | 'identifiers' | 'txHash' | 'blockHeight'>,
): SponsoredTransactionConfirmation {
  if (finalized.status !== SucceedEntirely) {
    throw new Error(`Sponsored transaction failed on Midnight: ${finalized.status}`);
  }
  if (finalized.txId !== expectedTxId && !finalized.identifiers.includes(expectedTxId)) {
    throw new Error('Midnight Indexer returned a different sponsored transaction identifier');
  }
  if (finalized.txHash !== expectedTxHash) {
    throw new Error('Midnight Indexer returned a different sponsored transaction hash');
  }
  if (!Number.isSafeInteger(finalized.blockHeight) || finalized.blockHeight < 0) {
    throw new Error('Midnight Indexer returned an invalid sponsored transaction block height');
  }
  return {
    txId: expectedTxId,
    txHash: finalized.txHash,
    blockHeight: String(finalized.blockHeight),
  };
}

export async function confirmSponsoredTransaction(
  network: NetworkConfig,
  sponsorship: Pick<SponsoredTransaction, 'transactionId' | 'transactionHash'>,
): Promise<SponsoredTransactionConfirmation> {
  const provider = indexerPublicDataProvider(network.indexer, network.indexerWS);
  const finalized = await provider.watchForTxData(sponsorship.transactionId);
  return summarizeSponsoredTransactionConfirmation(
    sponsorship.transactionId,
    sponsorship.transactionHash,
    finalized,
  );
}

export interface SubmissionResult {
  attest: TransactionSummary;
  timing: {
    proofServerReadyMs: number;
    privateStatePreparationMs: number;
    contractConnectionMs: number;
    attestationTransactionMs: number;
  };
}

export type TransactionObserver = (
  phase: 'attest',
  transaction: TransactionSummary,
) => Promise<void>;

interface FinalizedTransactionMetric {
  ledgerTransactionHash: string;
  deviceTransactionHash: string;
  deviceTransactionBytes: number;
  sponsorship?: SponsoredTransaction;
}

function summarizeTransaction(
  transaction: unknown,
  finalized: FinalizedTransactionMetric,
  proofServerRequests: ProofServerRequestMetric[],
): TransactionSummary {
  const publicData = (transaction as {
    public?: { txId?: unknown; txHash?: unknown; blockHeight?: unknown };
  }).public;
  return {
    txId: finalized.sponsorship?.transactionId ?? String(publicData?.txId ?? 'unknown'),
    txHash: finalized.sponsorship?.transactionHash ?? (
      typeof publicData?.txHash === 'string' && publicData.txHash ? publicData.txHash : null
    ),
    sponsorTransactionId: finalized.sponsorship?.sponsorTransactionId ?? 'unknown',
    blockHeight: String(publicData?.blockHeight ?? 'unknown'),
    feeSpecks: finalized.sponsorship?.feeSpecks ?? '0',
    feeDust: finalized.sponsorship?.feeDust ?? '0.000000000000000',
    deviceTransactionHash: finalized.deviceTransactionHash,
    deviceTransactionBytes: finalized.deviceTransactionBytes,
    transactionBytes: finalized.sponsorship?.transactionBytes ?? finalized.deviceTransactionBytes,
    proofGeneratedAt: [...proofServerRequests].reverse().find((request) => (
      request.endpoint === 'prove'
    ))?.completedAt ?? null,
    proofServerRequests,
  };
}

export async function loadCompiledContract(): Promise<LoadedContract> {
  if (!fs.existsSync(contractModulePath)) {
    throw new Error(
      'Device runtime artifacts are missing. Export them on the development server and install them under runtime/device-artifacts.',
    );
  }
  const contractModule = await import(pathToFileURL(contractModulePath).href) as LoadedContract['module'];
  const compiledContract = CompiledContract.make(
    'sensor-registry',
    contractModule.Contract as never,
  ).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(contractArtifactsPath),
  );
  return { module: contractModule, compiledContract };
}

export function createProviders(
  wallet: WalletContext,
  network: NetworkConfig,
  proofHeaders: Record<string, string> = {},
  proofJobId?: string,
) {
  const finalizedTransactionMetrics: FinalizedTransactionMetric[] = [];
  const proofServerRequestMetrics: ProofServerRequestMetric[] = [];
  const walletProvider = {
    getCoinPublicKey: () => wallet.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => wallet.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(transaction: unknown, ttl?: Date) {
      const recipe = await wallet.wallet.balanceUnboundTransaction(
        transaction as never,
        {
          shieldedSecretKeys: wallet.shieldedSecretKeys,
          dustSecretKey: wallet.dustSecretKey,
        },
        {
          ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000),
          tokenKindsToBalance: ['unshielded'],
        },
      );
      const finalized = await wallet.wallet.finalizeRecipe(recipe);
      const finalizedTransaction = finalized as unknown as {
        transactionHash(): string;
        serialize(): Uint8Array;
      };
      const serialized = finalizedTransaction.serialize();
      finalizedTransactionMetrics.push({
        ledgerTransactionHash: finalizedTransaction.transactionHash(),
        deviceTransactionHash: crypto.createHash('sha256').update(serialized).digest('hex'),
        deviceTransactionBytes: serialized.byteLength,
      });
      return finalized;
    },
    async submitTx(transaction: unknown) {
      const finalized = transaction as {
        identifiers(): unknown[];
        transactionHash(): string;
        serialize(): Uint8Array;
      };
      const identifier = finalized.identifiers()[0];
      if (!identifier) throw new Error('Device transaction has no contract identifier');
      const transactionHash = finalized.transactionHash();
      const metric = [...finalizedTransactionMetrics].reverse().find(
        (candidate) => candidate.ledgerTransactionHash === transactionHash,
      );
      if (!metric) throw new Error('Device transaction metric was not captured');
      if (!proofJobId) throw new Error('Sponsor submission requires a Proof Job ID');
      const serialized = finalized.serialize();
      savePendingDeviceTransaction(proofJobId, serialized);
      metric.sponsorship = await sponsorProofTransaction(network, proofJobId, serialized);
      if (metric.sponsorship.deviceTransactionHash !== transactionHash) {
        throw new Error('Sponsor accepted a different Device transaction');
      }
      return identifier as never;
    },
  };
  const zkConfigProvider = new NodeZkConfigProvider(contractArtifactsPath);
  const remoteProofProvider = httpClientProvingProvider(network.proofServer, zkConfigProvider, {
    timeout: 900_000,
    headers: proofHeaders,
  });
  const measuredProofProvider = {
    async check(serializedPreimage: Uint8Array, keyLocation: string) {
      const keyMaterial = zkConfigToProvingKeyMaterial(await zkConfigProvider.get(keyLocation));
      const requestBytes = createCheckPayload(serializedPreimage, keyMaterial.ir).byteLength;
      const started = performance.now();
      const result = await remoteProofProvider.check(serializedPreimage, keyLocation);
      proofServerRequestMetrics.push({
        endpoint: 'check' as const,
        requestBytes,
        durationMs: Math.round(performance.now() - started),
        completedAt: new Date().toISOString(),
      });
      return result;
    },
    async prove(serializedPreimage: Uint8Array, keyLocation: string, overwriteBindingInput?: bigint) {
      const keyMaterial = zkConfigToProvingKeyMaterial(await zkConfigProvider.get(keyLocation));
      const requestBytes = createProvingPayload(
        serializedPreimage,
        overwriteBindingInput,
        keyMaterial,
      ).byteLength;
      const started = performance.now();
      const result = await remoteProofProvider.prove(
        serializedPreimage,
        keyLocation,
        overwriteBindingInput,
      );
      proofServerRequestMetrics.push({
        endpoint: 'prove' as const,
        requestBytes,
        durationMs: Math.round(performance.now() - started),
        completedAt: new Date().toISOString(),
      });
      return result;
    },
  };
  const accountId = walletAddress(wallet);
  const privateStateProvider = levelPrivateStateProvider<string, SensorPrivateState>({
    midnightDbName: path.join(stateDir, 'midnight-level-db'),
    privateStateStoreName: 'sensor-private-state',
    signingKeyStoreName: 'sensor-signing-keys',
    accountId,
    privateStoragePasswordProvider: privateStatePassword,
  });

  return {
    privateStateProvider,
    publicDataProvider: indexerPublicDataProvider(network.indexer, network.indexerWS),
    zkConfigProvider,
    proofProvider: createProofProvider(measuredProofProvider, CostModel.initialCostModel()),
    walletProvider,
    midnightProvider: walletProvider,
    finalizedTransactionMetrics,
    proofServerRequestMetrics,
  };
}

export async function waitForProofServer(
  network: NetworkConfig,
  proofJobId?: string,
): Promise<void> {
  const base = new URL(network.proofServer);
  const local = isLocalProofServer(network.proofServer);
  const readyUrl = local ? base : new URL('/ready', base);
  let lastError: unknown;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const init: RequestInit = {
        headers: proofJobId ? { 'X-Proof-Job-Id': proofJobId } : {},
        signal: AbortSignal.timeout(10_000),
      };
      const response = local
        ? await fetch(readyUrl, init)
        : await deviceAuthenticatedFetch(
          deviceProofAuthConfig(network.proofServer),
          'proof:generate',
          readyUrl,
          init,
        );
      if (response.ok) return;
      lastError = new Error(`Proof server returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Proof server is unavailable: ${lastError instanceof Error ? lastError.message : lastError}`);
}

export async function submitDailyAttestation(
  wallet: WalletContext,
  network: NetworkConfig,
  contractAddress: string,
  dataset: PreparedDailyExtremaAttestation,
  hourResults: HourThresholdResult[],
  thresholdSatisfied: boolean,
  proofJobId?: string,
  transactionObserver?: TransactionObserver,
): Promise<SubmissionResult> {
  const loaded = await loadCompiledContract();
  const proofServerReadyStarted = performance.now();
  await waitForProofServer(network, proofJobId);
  const proofServerReadyMs = Math.round(performance.now() - proofServerReadyStarted);
  const proofHeaders = await proofServerHeaders(network.proofServer, proofJobId);
  const providers = createProviders(wallet, network, proofHeaders, proofJobId);
  const privateStateStarted = performance.now();
  const authority = loadContractAuthority(network.networkId);
  providers.privateStateProvider.setContractAddress(contractAddress);
  const current = await providers.privateStateProvider.get(SENSOR_PRIVATE_STATE_ID) ?? createSensorPrivateState();
  if (current.deviceSecretHex && current.deviceSecretHex !== authority.deviceSecretHex) {
    throw new Error('Stored private state uses a different Device contract authority');
  }
  const nextPrivateState = createSensorPrivateState([
    ...current.dailyAttestations.filter(
      (stored) => stored.attestationCommitment !== dataset.privateData.attestationCommitment,
    ),
    dataset.privateData,
  ], authority.deviceSecretHex);
  await providers.privateStateProvider.set(SENSOR_PRIVATE_STATE_ID, nextPrivateState);
  const privateStatePreparationMs = Math.round(performance.now() - privateStateStarted);

  const contractConnectionStarted = performance.now();
  const deployed = await findDeployedContract(providers as never, {
    compiledContract: loaded.compiledContract as never,
    contractAddress,
    privateStateId: SENSOR_PRIVATE_STATE_ID,
    initialPrivateState: nextPrivateState,
  }) as unknown as {
    callTx: {
      submitDailyAttestation(...args: unknown[]): Promise<unknown>;
    };
  };
  const contractConnectionMs = Math.round(performance.now() - contractConnectionStarted);

  const finalizedMetricIndex = providers.finalizedTransactionMetrics.length;
  const proofMetricIndex = providers.proofServerRequestMetrics.length;
  const attestationStarted = performance.now();
  const publicData = dataset.publicData;
  const transaction = await deployed.callTx.submitDailyAttestation(
    hexToBytes(publicData.attestationCommitment),
    hexToBytes(publicData.deviceCommitment),
    hexToBytes(publicData.measurementGroupId),
    hexToBytes(publicData.assignmentKey),
    BigInt(publicData.measurementDay),
    BigInt(publicData.periodStartEpoch),
    BigInt(publicData.periodEndEpoch),
    publicData.hourPresence,
    hourResults.map((result) => result === 'outside-threshold' ? 2 : result === 'within-threshold' ? 1 : 0),
    BigInt(publicData.sampleCount),
    thresholdSatisfied,
    BigInt(publicData.schemaVersion),
    BigInt(publicData.circuitVersion),
  );
  const attestationTransactionMs = Math.round(performance.now() - attestationStarted);
  const finalized = providers.finalizedTransactionMetrics[finalizedMetricIndex];
  if (!finalized?.sponsorship) throw new Error('Attestation transaction sponsorship was not captured');
  const attest = summarizeTransaction(
    transaction,
    finalized,
    providers.proofServerRequestMetrics.slice(proofMetricIndex),
  );
  await transactionObserver?.('attest', attest);
  return {
    attest,
    timing: {
      proofServerReadyMs,
      privateStatePreparationMs,
      contractConnectionMs,
      attestationTransactionMs,
    },
  };
}

export async function queryRegistry(network: NetworkConfig, contractAddress: string) {
  const loaded = await loadCompiledContract();
  const provider = indexerPublicDataProvider(network.indexer, network.indexerWS);
  const contractState = await provider.queryContractState(contractAddress);
  if (!contractState) throw new Error(`Contract state not found: ${contractAddress}`);
  const state = loaded.module.ledger(contractState.data);
  return {
    contractAddress,
    network: network.networkId,
    operatorAuthority: bytesToHex(state.operatorAuthority),
    deviceCount: state.deviceCount.toString(),
    disabledDeviceCount: state.disabledDeviceCount.toString(),
    policyCount: state.policyCount.toString(),
    assignmentCount: state.assignmentCount.toString(),
    attestationCount: state.attestationCount.toString(),
    lastAttestationCommitment: bytesToHex(state.lastAttestationCommitment),
    lastAttestationThresholdSatisfied: state.lastAttestationThresholdSatisfied,
    devices: Array.from(state.devices, ([deviceCommitment, device]) => ({
      deviceCommitment: bytesToHex(deviceCommitment),
      deviceAuthority: bytesToHex(device.authority),
      active: device.active,
      version: device.version.toString(),
    })),
    policies: Array.from(state.policies, ([policyId, policy]) => ({
      policyKey: bytesToHex(policyId),
      mode: policy.mode,
      minimum: (Number(policy.minimumCentiOffset) - 10_000) / 100,
      maximum: (Number(policy.maximumCentiOffset) - 10_000) / 100,
      valueScale: policy.valueScale.toString(),
      sensorTypeCode: policy.sensorTypeCode.toString(),
      unitCode: policy.unitCode.toString(),
      version: policy.version.toString(),
    })),
    policyAssignments: Array.from(state.policyAssignments, ([assignmentId, assignment]) => ({
      assignmentKey: bytesToHex(assignmentId),
      policyKey: bytesToHex(assignment.policyId),
      deviceCommitment: bytesToHex(assignment.deviceCommitment),
      timeZoneOffsetMinutes: Number(assignment.timeZoneOffsetMinutesBias) - 840,
      localDayStartHour: Number(assignment.localDayStartHour),
      utcDayStartMinute: Number(assignment.utcDayStartMinute),
      validFrom: new Date(Number(assignment.validFrom) * 1000).toISOString(),
      validUntil: assignment.validUntil === 0n
        ? null
        : new Date(Number(assignment.validUntil) * 1000).toISOString(),
      version: assignment.version.toString(),
    })),
    attestations: Array.from(state.attestations, ([attestationId, attestation]) => ({
      attestationId: bytesToHex(attestationId),
      attestationCommitment: bytesToHex(attestation.attestationCommitment),
      measurementGroupId: bytesToHex(attestation.measurementGroupId),
      deviceCommitment: bytesToHex(attestation.deviceCommitment),
      policyKey: bytesToHex(attestation.policyId),
      assignmentKey: bytesToHex(attestation.assignmentId),
      measurementDay: attestation.measurementDay.toString(),
      periodStart: new Date(Number(attestation.periodStart) * 1000).toISOString(),
      periodEnd: new Date(Number(attestation.periodEnd) * 1000).toISOString(),
      hourPresence: attestation.hourPresence,
      hourResults: attestation.hourResults.map((result) => result === 2
        ? 'outside-threshold'
        : result === 1
          ? 'within-threshold'
          : 'no-data'),
      observedHourCount: attestation.observedHourCount.toString(),
      stoppedHourCount: (24n - attestation.observedHourCount).toString(),
      sampleCount: attestation.sampleCount.toString(),
      thresholdSatisfied: attestation.thresholdSatisfied,
      verified: attestation.verified,
      schemaVersion: attestation.schemaVersion.toString(),
      circuitVersion: attestation.circuitVersion.toString(),
    })),
  };
}
