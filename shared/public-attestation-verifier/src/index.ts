import {
  HourThresholdResult as CompactHourThresholdResult,
  ThresholdMode,
  ledger as decodeLedger,
  type Ledger,
} from '@midnight-demo/sensor-registry-contract/contract';
import {
  bytesToHex,
  hexToBytes,
  operationalPeriodDate,
  utcDayStartMinute,
} from '@midnight-demo/shared';
import type { HourThresholdResult } from '@midnight-demo/shared';
import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

const preprodIndexer = 'https://indexer.preprod.midnight.network/api/v4/graphql';
const transactionHashPattern = /^[a-f\d]{64}$/u;
const contractAddressPattern = /^[a-f\d]{64}$/u;

export interface PublicVerificationRecord {
  network: 'Midnight Preprod';
  contractAddress: string;
  periodDate: string;
  attestationCommitment: string;
  measurementGroupId: string;
  deviceCommitment: string;
  policyKey: string;
  assignmentKey: string;
  assignmentVersion: number;
  assignmentValidFrom: string | null;
  assignmentValidUntil: string | null;
  operationalDay: {
    timeZoneOffsetMinutes: number;
    localDayStartHour: number;
    utcDayStartMinute: number;
  };
  sampleCount: number;
  observedHourCount: number;
  stoppedHourCount: number;
  hourPresence: boolean[];
  hourResults: HourThresholdResult[];
  thresholdSatisfied: boolean;
  thresholdResult: 'stopped' | 'within-threshold' | 'outside-threshold';
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
  transaction: {
    txId: string;
    txHash: string;
    blockHeight: number;
    status: 'SUCCESS';
    explorerUrl: string;
  };
  checks: {
    transactionConfirmed: true;
    contractActionFound: true;
    publicAttestationRecorded: true;
    thresholdPolicyBound: true;
    hourlyResultsConsistent: true;
  };
  privacy: {
    rawSamples: 'not-public';
    hourlyExtrema: 'not-public';
    proofNonce: 'not-public';
    thresholdPolicy: 'public-on-ledger';
  };
}

interface ChainTransactionLookup {
  hash: string;
  identifiers: unknown;
  transactionResult: { status?: unknown } | null;
  contractActions: unknown;
  block: { height?: unknown } | null;
}

interface ContractActionLookup {
  address: string;
  state: string;
  entryPoint?: string;
}

function normalizedHex(value: string, bytes: number, label: string): string {
  const normalized = value.trim().replace(/^0x/iu, '').toLowerCase();
  if (!new RegExp(`^[a-f\\d]{${bytes * 2}}$`, 'u').test(normalized)) {
    throw new Error(`${label} must be ${bytes * 2} hexadecimal characters`);
  }
  return normalized;
}

function safeNumber(value: bigint, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`${label} is outside the supported range`);
  return result;
}

function isoFromEpoch(value: bigint): string | null {
  if (value === 0n) return null;
  return new Date(safeNumber(value, 'Policy validity') * 1_000).toISOString();
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return bytesToHex(left) === bytesToHex(right);
}

function publicHourResult(value: CompactHourThresholdResult): HourThresholdResult {
  if (value === CompactHourThresholdResult.withinThreshold) return 'within-threshold';
  if (value === CompactHourThresholdResult.outsideThreshold) return 'outside-threshold';
  if (value === CompactHourThresholdResult.noData) return 'no-data';
  throw new Error('The public hourly result is unsupported');
}

function publicPolicyMode(mode: ThresholdMode): PublicVerificationRecord['policy']['mode'] {
  if (mode === ThresholdMode.closedRange) return 'closed-range';
  if (mode === ThresholdMode.upperBound) return 'upper-bound';
  return 'lower-bound';
}

function decodedPolicyValue(value: bigint, scale: bigint): number {
  if (scale <= 0n) throw new Error('The public policy scale is invalid');
  return (safeNumber(value, 'Policy bound') - 10_000) / safeNumber(scale, 'Policy scale');
}

export function publicAttestationFromLedger(
  contractAddress: string,
  ledger: Ledger,
  transaction: PublicVerificationRecord['transaction'],
): PublicVerificationRecord {
  const candidates = [...ledger.attestations].filter(([, attestation]) => (
    sameBytes(attestation.attestationCommitment, ledger.lastAttestationCommitment)
  ));
  if (candidates.length !== 1) {
    throw new Error(`The Contract action identifies ${candidates.length} public attestations`);
  }
  const [, attestation] = candidates[0]!;
  if (attestation.schemaVersion !== 7n || attestation.circuitVersion !== 5n) {
    throw new Error('The transaction does not use the supported public hourly-result schema');
  }
  if (!attestation.verified) throw new Error('The daily attestation is not marked verified');
  if (!ledger.policies.member(attestation.policyId)) {
    throw new Error('The applied threshold policy is absent from Contract state');
  }
  if (!ledger.policyAssignments.member(attestation.assignmentId)) {
    throw new Error('The applied policy assignment is absent from Contract state');
  }
  const policy = ledger.policies.lookup(attestation.policyId);
  const assignment = ledger.policyAssignments.lookup(attestation.assignmentId);
  if (
    !sameBytes(assignment.policyId, attestation.policyId)
    || !sameBytes(assignment.deviceCommitment, attestation.deviceCommitment)
  ) throw new Error('The attestation does not match its public policy assignment');
  if (
    attestation.periodStart < assignment.validFrom
    || (assignment.validUntil !== 0n && attestation.periodEnd > assignment.validUntil)
  ) throw new Error('The attestation is outside the policy validity interval');

  const periodStart = safeNumber(attestation.periodStart, 'Measurement period');
  const operationalDay = {
    timeZoneOffsetMinutes: safeNumber(
      assignment.timeZoneOffsetMinutesBias,
      'Time-zone offset',
    ) - 840,
    localDayStartHour: safeNumber(assignment.localDayStartHour, 'Local day start hour'),
    utcDayStartMinute: safeNumber(assignment.utcDayStartMinute, 'UTC day start minute'),
  };
  if (
    operationalDay.utcDayStartMinute !== utcDayStartMinute(operationalDay)
    || attestation.periodEnd !== attestation.periodStart + 86_400n
  ) throw new Error('The attestation does not match its registered operational-day boundary');

  const hourPresence = [...attestation.hourPresence];
  const hourResults = attestation.hourResults.map(publicHourResult);
  if (
    hourPresence.length !== 24
    || hourResults.length !== 24
    || hourResults.some((result, index) => (result === 'no-data') === hourPresence[index])
  ) throw new Error('The public hourly result vector is inconsistent');
  const observedHourCount = safeNumber(attestation.observedHourCount, 'Observed-hour count');
  if (hourPresence.filter(Boolean).length !== observedHourCount) {
    throw new Error('The public observed-hour count is inconsistent');
  }
  if (attestation.thresholdSatisfied === hourResults.includes('outside-threshold')) {
    throw new Error('The daily threshold result conflicts with the public hourly results');
  }

  const mode = publicPolicyMode(policy.mode);
  const thresholdResult = observedHourCount === 0
    ? 'stopped'
    : attestation.thresholdSatisfied ? 'within-threshold' : 'outside-threshold';
  return {
    network: 'Midnight Preprod',
    contractAddress,
    periodDate: operationalPeriodDate(periodStart * 1_000, operationalDay),
    attestationCommitment: bytesToHex(attestation.attestationCommitment),
    measurementGroupId: bytesToHex(attestation.measurementGroupId),
    deviceCommitment: bytesToHex(attestation.deviceCommitment),
    policyKey: bytesToHex(attestation.policyId),
    assignmentKey: bytesToHex(attestation.assignmentId),
    assignmentVersion: safeNumber(assignment.version, 'Assignment version'),
    assignmentValidFrom: isoFromEpoch(assignment.validFrom),
    assignmentValidUntil: isoFromEpoch(assignment.validUntil),
    operationalDay,
    sampleCount: safeNumber(attestation.sampleCount, 'Sample count'),
    observedHourCount,
    stoppedHourCount: 24 - observedHourCount,
    hourPresence,
    hourResults,
    thresholdSatisfied: attestation.thresholdSatisfied,
    thresholdResult,
    schemaVersion: safeNumber(attestation.schemaVersion, 'Schema version'),
    circuitVersion: safeNumber(attestation.circuitVersion, 'Circuit version'),
    policy: {
      mode,
      minimum: mode === 'upper-bound'
        ? null
        : decodedPolicyValue(policy.minimumCentiOffset, policy.valueScale),
      maximum: mode === 'lower-bound'
        ? null
        : decodedPolicyValue(policy.maximumCentiOffset, policy.valueScale),
      valueScale: safeNumber(policy.valueScale, 'Policy scale'),
      sensorType: policy.sensorTypeCode === 1n
        ? 'temperature'
        : `sensor-code-${policy.sensorTypeCode}`,
      unit: policy.unitCode === 1n ? '°C' : `unit-code-${policy.unitCode}`,
      version: safeNumber(policy.version, 'Policy version'),
    },
    transaction,
    checks: {
      transactionConfirmed: true,
      contractActionFound: true,
      publicAttestationRecorded: true,
      thresholdPolicyBound: true,
      hourlyResultsConsistent: true,
    },
    privacy: {
      rawSamples: 'not-public',
      hourlyExtrema: 'not-public',
      proofNonce: 'not-public',
      thresholdPolicy: 'public-on-ledger',
    },
  };
}

function contractActions(value: unknown): ContractActionLookup[] {
  if (!Array.isArray(value)) throw new Error('The Midnight transaction has invalid Contract actions');
  const actions: ContractActionLookup[] = [];
  for (const candidate of value) {
    if (typeof candidate !== 'object' || candidate === null) {
      throw new Error('The Midnight transaction has an invalid Contract action');
    }
    const action = candidate as Record<string, unknown>;
    if (
      typeof action.address !== 'string'
      || typeof action.state !== 'string'
      || (action.entryPoint !== undefined && typeof action.entryPoint !== 'string')
    ) throw new Error('The Midnight transaction has an incomplete Contract action');
    actions.push({
      address: action.address,
      state: action.state,
      ...(action.entryPoint ? { entryPoint: action.entryPoint } : {}),
    });
  }
  return actions;
}

async function lookupTransaction(
  txHash: string,
  fetchImplementation: typeof fetch,
): Promise<ChainTransactionLookup> {
  const response = await fetchImplementation(preprodIndexer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query PublicProofTransaction($offset: TransactionOffset!) {
        transactions(offset: $offset) {
          hash
          block { height }
          ... on RegularTransaction {
            identifiers
            transactionResult { status }
            contractActions {
              address
              state
              ... on ContractCall { entryPoint }
            }
          }
        }
      }`,
      variables: { offset: { hash: txHash } },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Midnight Indexer returned HTTP ${response.status}`);
  const payload = await response.json() as {
    data?: { transactions?: unknown };
    errors?: unknown;
  };
  if (payload.errors !== undefined) throw new Error('Midnight Indexer returned GraphQL errors');
  if (!Array.isArray(payload.data?.transactions) || payload.data.transactions.length !== 1) {
    throw new Error('The transaction was not found uniquely on Midnight Preprod');
  }
  return payload.data.transactions[0] as ChainTransactionLookup;
}

export async function verifyAttestationTransaction(
  rawTransactionHash: string,
  fetchImplementation: typeof fetch = fetch,
  allowedContractAddresses?: readonly string[],
): Promise<PublicVerificationRecord> {
  const txHash = normalizedHex(rawTransactionHash, 32, 'Transaction hash');
  if (!transactionHashPattern.test(txHash)) throw new Error('Transaction hash is invalid');
  const lookup = await lookupTransaction(txHash, fetchImplementation);
  if (normalizedHex(lookup.hash, 32, 'Indexer transaction hash') !== txHash) {
    throw new Error('Midnight Indexer returned a different transaction hash');
  }
  if (lookup.transactionResult?.status !== 'SUCCESS') {
    throw new Error('The transaction was not accepted successfully by Midnight');
  }
  if (!Number.isSafeInteger(lookup.block?.height) || Number(lookup.block?.height) < 0) {
    throw new Error('The Midnight transaction block height is invalid');
  }
  if (
    !Array.isArray(lookup.identifiers)
    || !lookup.identifiers.every((value) => typeof value === 'string')
  ) throw new Error('The Midnight transaction identifiers are invalid');
  const txId = lookup.identifiers.find((identifier) => /^(?:[a-f\d]{2}){32,64}$/iu.test(identifier));
  if (typeof txId !== 'string') throw new Error('The Midnight transaction has no usable identifier');

  const allowedContracts = allowedContractAddresses === undefined
    ? null
    : new Set(allowedContractAddresses.map((address) => (
      normalizedHex(address, 32, 'Allowed Contract address')
    )));
  if (allowedContracts?.size === 0) {
    throw new Error('No trusted Sensor Registry Contract is configured');
  }
  const actions = contractActions(lookup.contractActions).filter((action) => {
    const address = action.address.replace(/^0x/iu, '').toLowerCase();
    return action.entryPoint === 'submitDailyAttestation'
      && contractAddressPattern.test(address)
      && (allowedContracts === null || allowedContracts.has(address));
  });
  const records: PublicVerificationRecord[] = [];
  for (const action of actions) {
    try {
      const contractAddress = normalizedHex(action.address, 32, 'Contract address');
      const state = decodeLedger(ContractState.deserialize(hexToBytes(action.state)).data);
      records.push(publicAttestationFromLedger(contractAddress, state, {
        txId,
        txHash,
        blockHeight: Number(lookup.block!.height),
        status: 'SUCCESS',
        explorerUrl: `https://preprod.midnightexplorer.com/transactions/${txHash}`,
      }));
    } catch {
      // A sponsored transaction may contain unrelated Contract actions. Only
      // the action that decodes as this Sensor Registry schema is accepted.
    }
  }
  if (records.length !== 1) {
    throw new Error(records.length === 0
      ? 'No supported daily attestation was found in this transaction'
      : 'The transaction contains multiple supported daily attestations');
  }
  return records[0]!;
}
