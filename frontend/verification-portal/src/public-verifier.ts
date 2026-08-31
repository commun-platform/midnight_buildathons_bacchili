import {
  ThresholdMode,
  ledger as decodeLedger,
  pureCircuits,
  type Ledger,
} from '@midnight-demo/sensor-registry-contract/contract';
import { bytesToHex, hexToBytes } from '@midnight-demo/shared';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { SucceedEntirely } from '@midnight-ntwrk/midnight-js-types';
import WebSocketImplementation from 'isomorphic-ws';

const preprodIndexer = 'https://indexer.preprod.midnight.network/api/v4/graphql';
const preprodIndexerWs = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
const verificationTimeoutMs = 30_000;

export interface PublicAttestationRecord {
  contractAddress: string;
  attestationCommitment: string;
  measurementGroupId: string;
  policyKey: string;
  assignmentKey: string;
  sampleCount: number;
  observedHourCount: number;
  hourPresence: boolean[];
  thresholdSatisfied: boolean;
  schemaVersion: number;
  circuitVersion: number;
  policy: {
    mode: 'closed-range' | 'upper-bound' | 'lower-bound';
    minimum: number | null;
    maximum: number | null;
    valueScale: number;
    sensorType: string;
    unit: string;
    version: number;
  };
  transactions: {
    attest: {
      txId: string;
      txHash: string;
      blockHeight: string;
    };
  };
}

export interface PublicAttestationChecks {
  dailyAttestationRecorded: boolean;
  committedHourlyExtrema: boolean;
  attestationVerified: boolean;
  midnightConfirmed: boolean;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return bytesToHex(left) === bytesToHex(right);
}

function sameHours(left: boolean[], right: boolean[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function policyMode(mode: PublicAttestationRecord['policy']['mode']): ThresholdMode {
  if (mode === 'closed-range') return ThresholdMode.closedRange;
  if (mode === 'upper-bound') return ThresholdMode.upperBound;
  return ThresholdMode.lowerBound;
}

function encodedTemperature(value: number | null): bigint | null {
  return value === null ? null : BigInt(Math.round(value * 100) + 10_000);
}

export function verifyPublicAttestationLedger(
  input: PublicAttestationRecord,
  state: Ledger,
): Omit<PublicAttestationChecks, 'midnightConfirmed'> {
  const commitment = hexToBytes(input.attestationCommitment);
  const measurementGroupId = hexToBytes(input.measurementGroupId);
  const policyKey = hexToBytes(input.policyKey);
  const assignmentKey = hexToBytes(input.assignmentKey);
  if (!state.policyAssignments.member(assignmentKey)) {
    return {
      dailyAttestationRecorded: false,
      committedHourlyExtrema: false,
      attestationVerified: false,
    };
  }
  const assignment = state.policyAssignments.lookup(assignmentKey);
  const attestationId = pureCircuits.deriveAttestationId(
    assignment.deviceCommitment,
    measurementGroupId,
  );
  if (!state.attestations.member(attestationId)) {
    return {
      dailyAttestationRecorded: false,
      committedHourlyExtrema: false,
      attestationVerified: false,
    };
  }
  const attestation = state.attestations.lookup(attestationId);
  const dailyAttestationRecorded = attestation.verified;
  const committedHourlyExtrema = dailyAttestationRecorded
    && sameBytes(attestation.attestationCommitment, commitment)
    && sameBytes(attestation.measurementGroupId, measurementGroupId)
    && sameBytes(attestation.deviceCommitment, assignment.deviceCommitment)
    && sameBytes(attestation.policyId, policyKey)
    && sameBytes(attestation.assignmentId, assignmentKey)
    && attestation.sampleCount === BigInt(input.sampleCount)
    && attestation.observedHourCount === BigInt(input.observedHourCount)
    && sameHours(attestation.hourPresence, input.hourPresence)
    && attestation.thresholdSatisfied === input.thresholdSatisfied
    && attestation.schemaVersion === BigInt(input.schemaVersion)
    && attestation.circuitVersion === BigInt(input.circuitVersion);
  if (
    !committedHourlyExtrema
    || !state.policies.member(policyKey)
  ) {
    return {
      dailyAttestationRecorded,
      committedHourlyExtrema,
      attestationVerified: false,
    };
  }
  const policy = state.policies.lookup(policyKey);
  const minimum = encodedTemperature(input.policy.minimum);
  const maximum = encodedTemperature(input.policy.maximum);
  const attestationVerified = assignment.version > 0n
    && sameBytes(assignment.policyId, policyKey)
    && sameBytes(assignment.deviceCommitment, attestation.deviceCommitment)
    && policy.mode === policyMode(input.policy.mode)
    && (minimum === null || policy.minimumCentiOffset === minimum)
    && (maximum === null || policy.maximumCentiOffset === maximum)
    && policy.valueScale === BigInt(input.policy.valueScale)
    && policy.version === BigInt(input.policy.version)
    && input.policy.sensorType === 'temperature'
    && input.policy.unit === '°C'
    && policy.sensorTypeCode === 1n
    && policy.unitCode === 1n;
  return {
    dailyAttestationRecorded,
    committedHourlyExtrema,
    attestationVerified,
  };
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out after ${verificationTimeoutMs} ms`)),
          verificationTimeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function verifyPublicAttestation(
  input: PublicAttestationRecord,
): Promise<{ checks: PublicAttestationChecks }> {
  if (!/^[a-f\d]{64}$/iu.test(input.contractAddress)) {
    throw new Error('The public Contract address is unavailable');
  }
  const blockHeight = Number(input.transactions.attest.blockHeight);
  if (!Number.isSafeInteger(blockHeight) || blockHeight < 0) {
    throw new Error('The public transaction block height is invalid');
  }
  setNetworkId('preprod');
  const provider = indexerPublicDataProvider(
    preprodIndexer,
    preprodIndexerWs,
    WebSocketImplementation,
  );
  const transaction = await withTimeout(
    provider.watchForTxData(input.transactions.attest.txId),
    'Midnight transaction lookup',
  );
  const midnightConfirmed = transaction.status === SucceedEntirely
    && (transaction.txId === input.transactions.attest.txId
      || transaction.identifiers.includes(input.transactions.attest.txId))
    && transaction.txHash === input.transactions.attest.txHash
    && transaction.blockHeight === blockHeight;
  if (!midnightConfirmed) {
    return {
      checks: {
        dailyAttestationRecorded: false,
        committedHourlyExtrema: false,
        attestationVerified: false,
        midnightConfirmed: false,
      },
    };
  }
  const contractState = await withTimeout(
    provider.queryContractState(input.contractAddress, {
      type: 'blockHeight',
      blockHeight,
    }),
    'Midnight Contract state lookup',
  );
  if (!contractState) throw new Error('The Contract state was not found at the confirmed block');
  return {
    checks: {
      ...verifyPublicAttestationLedger(input, decodeLedger(contractState.data)),
      midnightConfirmed,
    },
  };
}
