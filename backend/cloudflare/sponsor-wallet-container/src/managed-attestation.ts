import {
  Contract,
  HourThresholdResult as CompactHourThresholdResult,
  ledger as decodeLedger,
  pureCircuits,
} from '@midnight-demo/sensor-registry-contract/contract';
import {
  bytesToHex,
  hexToBytes,
  policyAssignmentKey,
  sensorDeviceCommitment,
  thresholdPolicyKey,
  type HourThresholdResult,
  type PreparedDailyExtremaAttestation,
} from '@midnight-demo/shared/runtime';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { SucceedEntirely, type UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import WebSocketImplementation from 'isomorphic-ws';

import { inMemoryPrivateStateProvider } from './in-memory-private-state-provider.js';
import {
  createSensorPrivateState,
  deriveDeviceAuthorityHex,
  SENSOR_PRIVATE_STATE_ID,
  witnesses,
  type SensorPrivateState,
} from './sensor-registry-witnesses.js';
import { deriveManagedDeviceSecretHex } from './managed-identity.js';
import type { AuthorityTransactionRuntime } from './authority-transaction-runtime.js';

const indexerUrl = 'https://indexer.preprod.midnight.network/api/v4/graphql';
const indexerWsUrl = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
const proofServerUrl = 'http://proof.internal';
const zkConfigPath = process.env.SPONSOR_ZK_CONFIG_PATH
  ?? '/app/midnight/contracts/sensor-registry/src/managed/sensor-registry';
const bytes32Pattern = /^(?:[0-9a-f]{2}){32}$/u;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;

type SensorRegistryCircuit =
  | 'rotateOperatorAuthority'
  | 'registerDevice'
  | 'rotateDeviceAuthority'
  | 'disableDevice'
  | 'registerThresholdPolicy'
  | 'registerPolicyAssignment'
  | 'closePolicyAssignment'
  | 'submitDailyAttestation';

export interface ManagedKnownSubmission {
  transactionId: string;
  transactionHash: string;
  proofGeneratedAt?: string;
  feeSpecks?: string;
  transactionBytes?: number;
}

export interface ManagedAttestationInput {
  managedAttestorRootSecretHex: string;
  sourceId: string;
  projectId: string;
  deviceId: string;
  policyId: string;
  assignmentId: string;
  contractAddress: string;
  attestation: PreparedDailyExtremaAttestation;
  hourResults: HourThresholdResult[];
  thresholdSatisfied: boolean;
  knownSubmission?: ManagedKnownSubmission;
}

export type ManagedAttestationStage =
  | 'sponsor_wallet_ready'
  | 'contract_state_checking'
  | 'zkp_generating'
  | 'zkp_generated'
  | 'transaction_balancing'
  | 'transaction_prepared'
  | 'transaction_submitting'
  | 'transaction_confirmed';

export interface ManagedAttestationProgress {
  stage: ManagedAttestationStage;
  proofGeneratedAt?: string;
  transactionId?: string;
  transactionHash?: string;
  feeSpecks?: string;
  transactionBytes?: number;
  blockHeight?: string;
}

export type ManagedAttestationProgressReporter = (
  progress: ManagedAttestationProgress,
) => void | Promise<void>;

export interface ManagedAttestationResult {
  transactionId: string;
  transactionHash: string;
  blockHeight: string;
  proofGeneratedAt: string;
  feeSpecks: string;
  transactionBytes: number;
  replayRecovered: boolean;
  idempotent: boolean;
}

export function deriveManagedDeviceAuthorityHex(
  rootSecretHex: string,
  projectId: string,
  sourceId: string,
): string {
  return deriveDeviceAuthorityHex(deriveManagedDeviceSecretHex(rootSecretHex, projectId, sourceId));
}

function validate(input: ManagedAttestationInput): void {
  if (!bytes32Pattern.test(input.managedAttestorRootSecretHex)) {
    throw new Error('Managed Attestor root secret is invalid');
  }
  for (const [label, value] of [
    ['sourceId', input.sourceId],
    ['projectId', input.projectId],
    ['deviceId', input.deviceId],
    ['policyId', input.policyId],
    ['assignmentId', input.assignmentId],
  ] as const) {
    if (!identifierPattern.test(value)) throw new Error(`${label} is invalid`);
  }
  if (!input.contractAddress || input.contractAddress.length > 160) {
    throw new Error('Contract address is invalid');
  }
  const { publicData, privateData } = input.attestation;
  if (
    publicData.policyId !== input.policyId
    || publicData.assignmentId !== input.assignmentId
    || privateData.deviceId !== input.deviceId
    || publicData.attestationCommitment !== privateData.attestationCommitment
    || publicData.deviceCommitment !== privateData.deviceCommitment
    || publicData.measurementGroupId !== privateData.measurementGroupId
    || publicData.policyKey !== privateData.policyKey
    || publicData.assignmentKey !== privateData.assignmentKey
    || publicData.periodStartEpoch !== privateData.periodStartEpoch
    || publicData.periodEndEpoch !== privateData.periodEndEpoch
    || publicData.schemaVersion !== privateData.schemaVersion
    || publicData.circuitVersion !== privateData.circuitVersion
  ) throw new Error('Managed attestation public/private data does not match');
  if (
    privateData.hours.length !== 24
    || publicData.hourPresence.length !== 24
    || input.hourResults.length !== 24
  ) throw new Error('Managed attestation must contain exactly 24 hourly slots');
  if (privateData.hours.reduce((total, hour) => total + hour.sampleCount, 0) !== publicData.sampleCount) {
    throw new Error('Managed attestation sample count does not match its hourly slots');
  }
  if (input.hourResults.some((result, index) => (
    (result === 'no-data') === publicData.hourPresence[index]
  ))) throw new Error('Managed attestation hourly results do not match hour presence');
  if (input.thresholdSatisfied === input.hourResults.includes('outside-threshold')) {
    throw new Error('Managed attestation threshold result is inconsistent');
  }
  if (input.knownSubmission && (
    !identifierPattern.test(input.knownSubmission.transactionId)
    || !bytes32Pattern.test(input.knownSubmission.transactionHash)
    || (input.knownSubmission.proofGeneratedAt !== undefined
      && !Number.isFinite(Date.parse(input.knownSubmission.proofGeneratedAt)))
    || (input.knownSubmission.feeSpecks !== undefined
      && !/^\d+$/u.test(input.knownSubmission.feeSpecks))
    || (input.knownSubmission.transactionBytes !== undefined
      && (!Number.isSafeInteger(input.knownSubmission.transactionBytes)
        || input.knownSubmission.transactionBytes < 0))
  )) throw new Error('Known managed submission is invalid');
}

async function validateDerivedReferences(input: ManagedAttestationInput): Promise<void> {
  const [deviceCommitment, policyKey, assignmentKey] = await Promise.all([
    sensorDeviceCommitment(input.deviceId),
    thresholdPolicyKey(input.policyId),
    policyAssignmentKey(input.assignmentId),
  ]);
  if (
    bytesToHex(deviceCommitment) !== input.attestation.publicData.deviceCommitment
    || bytesToHex(policyKey) !== input.attestation.publicData.policyKey
    || bytesToHex(assignmentKey) !== input.attestation.publicData.assignmentKey
  ) throw new Error('Managed attestation identifiers do not match their canonical commitments');
}

function transactionIdentifier(transaction: unknown): string {
  const value = (transaction as { public?: { txId?: unknown } })?.public?.txId;
  if (value === undefined || value === null || !String(value)) {
    throw new Error('Managed attestation did not return a transaction ID');
  }
  return String(value);
}

export async function submitManagedAttestation(
  runtime: AuthorityTransactionRuntime,
  input: ManagedAttestationInput,
  reportProgress: ManagedAttestationProgressReporter = () => undefined,
): Promise<ManagedAttestationResult> {
  validate(input);
  await validateDerivedReferences(input);
  await runtime.waitUntilReady();
  await reportProgress({ stage: 'sponsor_wallet_ready' });

  const compiledContract = CompiledContract.make('sensor-registry', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
  const deviceSecretHex = deriveManagedDeviceSecretHex(
    input.managedAttestorRootSecretHex,
    input.projectId,
    input.sourceId,
  );
  const privateState = createSensorPrivateState(
    [input.attestation.privateData],
    deviceSecretHex,
  );
  const privateStateProvider = inMemoryPrivateStateProvider<string, SensorPrivateState>();
  privateStateProvider.setContractAddress(input.contractAddress);
  await privateStateProvider.set(SENSOR_PRIVATE_STATE_ID, privateState);
  const zkConfigProvider = new NodeZkConfigProvider<SensorRegistryCircuit>(zkConfigPath);
  const publicDataProvider = indexerPublicDataProvider(
    indexerUrl,
    indexerWsUrl,
    WebSocketImplementation,
  );
  await reportProgress({ stage: 'contract_state_checking' });
  const contractState = await publicDataProvider.queryContractState(input.contractAddress);
  if (!contractState) throw new Error('Sensor Registry state was not found');
  const state = decodeLedger(contractState.data);
  const attestationId = pureCircuits.deriveAttestationId(
    hexToBytes(input.attestation.publicData.deviceCommitment),
    hexToBytes(input.attestation.publicData.measurementGroupId),
  );
  if (state.attestations.member(attestationId)) {
    if (!input.knownSubmission) {
      throw new Error('Measurement group is already attested but its known transaction is unavailable');
    }
    const finalized = await publicDataProvider.watchForTxData(input.knownSubmission.transactionId);
    if (
      finalized.status !== SucceedEntirely
      || finalized.txHash !== input.knownSubmission.transactionHash
      || !Number.isSafeInteger(finalized.blockHeight)
    ) throw new Error('Known managed transaction could not be reconciled with the Indexer');
    const proofGeneratedAt = input.knownSubmission.proofGeneratedAt ?? new Date().toISOString();
    await reportProgress({
      stage: 'transaction_confirmed',
      transactionId: input.knownSubmission.transactionId,
      transactionHash: input.knownSubmission.transactionHash,
      blockHeight: String(finalized.blockHeight),
    });
    return {
      transactionId: input.knownSubmission.transactionId,
      transactionHash: input.knownSubmission.transactionHash,
      blockHeight: String(finalized.blockHeight),
      proofGeneratedAt,
      feeSpecks: input.knownSubmission.feeSpecks ?? '0',
      transactionBytes: input.knownSubmission.transactionBytes ?? 0,
      replayRecovered: true,
      idempotent: true,
    };
  }

  let proofGeneratedAt = '';
  let feeSpecks = '';
  let transactionBytes = 0;
  let confirmation: Awaited<ReturnType<AuthorityTransactionRuntime['sponsorContractTransactionAndConfirm']>>
    | null = null;
  const proofProvider = httpClientProofProvider(proofServerUrl, zkConfigProvider, { timeout: 900_000 });
  const walletProvider = {
    getCoinPublicKey: () => runtime.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => runtime.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(transaction: UnboundTransaction, ttl?: Date) {
      return runtime.finalizeAuthorityTransaction(transaction, ttl);
    },
  };
  const providers = {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider: {
      ...proofProvider,
      async proveTx(...args: Parameters<typeof proofProvider.proveTx>) {
        await reportProgress({ stage: 'zkp_generating' });
        const proved = await proofProvider.proveTx(...args);
        proofGeneratedAt = new Date().toISOString();
        await reportProgress({ stage: 'zkp_generated', proofGeneratedAt });
        return proved;
      },
    },
    walletProvider,
    midnightProvider: {
      submitTx: async (
        transaction: Parameters<AuthorityTransactionRuntime['sponsorContractTransactionAndConfirm']>[0],
      ) => {
        await reportProgress({ stage: 'transaction_balancing' });
        confirmation = await runtime.sponsorContractTransactionAndConfirm(
          transaction,
          input.contractAddress,
          'submitDailyAttestation',
          `managed-attestation:${input.attestation.publicData.attestationCommitment}`,
          async (prepared) => {
            feeSpecks = prepared.feeSpecks;
            transactionBytes = prepared.transactionBytes;
            await reportProgress({
              stage: 'transaction_prepared',
              transactionId: prepared.contractTransactionId,
              transactionHash: prepared.transactionHash,
              feeSpecks,
              transactionBytes,
            });
            await reportProgress({
              stage: 'transaction_submitting',
              transactionId: prepared.contractTransactionId,
              transactionHash: prepared.transactionHash,
            });
          },
        );
        await reportProgress({
          stage: 'transaction_confirmed',
          transactionId: confirmation.transactionId,
          transactionHash: confirmation.transactionHash,
          blockHeight: confirmation.blockHeight,
        });
        return confirmation.contractTransactionId as never;
      },
    },
  };
  const deployed = await findDeployedContract(providers, {
    compiledContract,
    contractAddress: input.contractAddress,
    privateStateId: SENSOR_PRIVATE_STATE_ID,
    initialPrivateState: privateState,
  });
  const publicData = input.attestation.publicData;
  const transaction = await deployed.callTx.submitDailyAttestation(
    hexToBytes(publicData.attestationCommitment),
    hexToBytes(publicData.deviceCommitment),
    hexToBytes(publicData.measurementGroupId),
    hexToBytes(publicData.assignmentKey),
    BigInt(publicData.measurementDay),
    BigInt(publicData.periodStartEpoch),
    BigInt(publicData.periodEndEpoch),
    publicData.hourPresence,
    input.hourResults.map((result) => result === 'outside-threshold'
      ? CompactHourThresholdResult.outsideThreshold
      : result === 'within-threshold'
        ? CompactHourThresholdResult.withinThreshold
        : CompactHourThresholdResult.noData),
    BigInt(publicData.sampleCount),
    input.thresholdSatisfied,
    BigInt(publicData.schemaVersion),
    BigInt(publicData.circuitVersion),
  );
  const callTransactionId = transactionIdentifier(transaction);
  const submitted = confirmation as (
    Awaited<ReturnType<AuthorityTransactionRuntime['sponsorContractTransactionAndConfirm']>> | null
  );
  if (!submitted) throw new Error('Managed transaction was not submitted');
  if (callTransactionId !== submitted.contractTransactionId) {
    throw new Error('Managed contract call returned a different transaction ID');
  }
  return {
    transactionId: submitted.transactionId,
    transactionHash: submitted.transactionHash,
    blockHeight: submitted.blockHeight,
    proofGeneratedAt: proofGeneratedAt || new Date().toISOString(),
    feeSpecks,
    transactionBytes,
    replayRecovered: submitted.replayRecovered,
    idempotent: false,
  };
}
