import {
  HourThresholdResult as CompactHourThresholdResult,
  ThresholdMode,
  ledger as decodeLedger,
  pureCircuits,
  type Ledger,
} from '@midnight-demo/sensor-registry-contract/contract';
import {
  bytesToHex,
  hexToBytes,
  operationalPeriodDate,
  operationalPeriodStart,
  utcDayStartMinute,
} from '@midnight-demo/shared';
import type { HourThresholdResult } from '@midnight-demo/shared';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { SucceedEntirely } from '@midnight-ntwrk/midnight-js-types';
import WebSocketImplementation from 'isomorphic-ws';

const preprodIndexer = 'https://indexer.preprod.midnight.network/api/v4/graphql';
const preprodIndexerWs = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
const verificationTimeoutMs = 30_000;

export interface PublicAttestationRecord {
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
  hourPresence: boolean[];
  hourResults: HourThresholdResult[];
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

export interface PublicChainProofRecord extends PublicAttestationRecord {
  proofJobId: null;
  stoppedHourCount: number;
  thresholdResult: 'stopped' | 'within-threshold' | 'outside-threshold';
  resultVerified: true;
  hourlyResultsAvailable: true;
  status: 'confirmed';
  proofGeneratedAt: null;
  claim: string;
  claimJa: string;
  checks: PublicAttestationChecks;
  network: 'Midnight Preprod';
  privacy: {
    hourlyExtrema: 'private';
    nonce: 'private';
    thresholdPolicy: 'public-on-ledger';
  };
}

interface ChainTransactionLookup {
  readonly hash: string;
  readonly identifiers: readonly string[];
  readonly contractActions: readonly {
    readonly address: string;
    readonly state: string;
    readonly entryPoint?: string;
  }[];
  readonly block: { readonly height: number };
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return bytesToHex(left) === bytesToHex(right);
}

function sameHours(left: boolean[], right: boolean[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compactHourResult(result: HourThresholdResult): CompactHourThresholdResult {
  if (result === 'within-threshold') return CompactHourThresholdResult.withinThreshold;
  if (result === 'outside-threshold') return CompactHourThresholdResult.outsideThreshold;
  return CompactHourThresholdResult.noData;
}

function publicHourResult(result: CompactHourThresholdResult): HourThresholdResult {
  if (result === CompactHourThresholdResult.withinThreshold) return 'within-threshold';
  if (result === CompactHourThresholdResult.outsideThreshold) return 'outside-threshold';
  return 'no-data';
}

function sameHourResults(
  left: CompactHourThresholdResult[],
  right: HourThresholdResult[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === compactHourResult(right[index] ?? 'no-data'));
}

function policyMode(mode: PublicAttestationRecord['policy']['mode']): ThresholdMode {
  if (mode === 'closed-range') return ThresholdMode.closedRange;
  if (mode === 'upper-bound') return ThresholdMode.upperBound;
  return ThresholdMode.lowerBound;
}

function encodedTemperature(value: number | null): bigint | null {
  return value === null ? null : BigInt(Math.round(value * 100) + 10_000);
}

function safeNumber(value: bigint, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`${label} is outside the supported number range`);
  return result;
}

function isoFromEpoch(value: bigint): string | null {
  if (value === 0n) return null;
  const seconds = safeNumber(value, 'Policy validity');
  const result = new Date(seconds * 1_000);
  if (Number.isNaN(result.valueOf())) throw new Error('Policy validity is not a valid UTC timestamp');
  return result.toISOString();
}

function publicPolicyMode(mode: ThresholdMode): PublicAttestationRecord['policy']['mode'] {
  if (mode === ThresholdMode.closedRange) return 'closed-range';
  if (mode === ThresholdMode.upperBound) return 'upper-bound';
  return 'lower-bound';
}

function publicSensorType(code: bigint): string {
  return code === 1n ? 'temperature' : `sensor-code-${code}`;
}

function publicUnit(code: bigint): string {
  return code === 1n ? '°C' : `unit-code-${code}`;
}

function decodedPolicyValue(value: bigint, scale: bigint): number {
  if (scale <= 0n) throw new Error('The public policy scale is invalid');
  return (safeNumber(value, 'Policy bound') - 10_000) / safeNumber(scale, 'Policy scale');
}

export function publicAttestationFromLedgerTransition(
  contractAddress: string,
  state: Ledger,
  previousState: Ledger | null,
  transaction: { txId: string; txHash: string; blockHeight: number },
): PublicChainProofRecord {
  const currentAttestations = [...state.attestations];
  const previousAttestationCount = previousState === null ? 0 : [...previousState.attestations].length;
  const additions = currentAttestations.filter(([key]) => (
    previousState === null || !previousState.attestations.member(key)
  ));
  const transactionAttestations = additions.length === 1
    ? additions
    : previousState === null
      ? currentAttestations.filter(([, attestation]) => sameBytes(
          attestation.attestationCommitment,
          state.lastAttestationCommitment,
        ))
      : additions;
  if (transactionAttestations.length !== 1) {
    throw new Error(
      `The transaction does not identify exactly one daily attestation (`
      + `${transactionAttestations.length} matched; ${additions.length} added; `
      + `${currentAttestations.length} current; ${previousAttestationCount} previous)`,
    );
  }
  const [, attestation] = transactionAttestations[0]!;
  if (attestation.schemaVersion !== 7n || attestation.circuitVersion !== 5n) {
    throw new Error('This transaction predates the public hourly-result schema');
  }
  if (!attestation.verified) throw new Error('The daily attestation is not verified');
  if (!state.policies.member(attestation.policyId)) {
    throw new Error('The applied threshold policy is missing from Contract state');
  }
  if (!state.policyAssignments.member(attestation.assignmentId)) {
    throw new Error('The applied policy assignment is missing from Contract state');
  }
  const policy = state.policies.lookup(attestation.policyId);
  const assignment = state.policyAssignments.lookup(attestation.assignmentId);
  if (
    !sameBytes(assignment.policyId, attestation.policyId)
    || !sameBytes(assignment.deviceCommitment, attestation.deviceCommitment)
  ) throw new Error('The attestation does not match its public policy assignment');
  if (
    attestation.periodStart < assignment.validFrom
    || (assignment.validUntil !== 0n && attestation.periodEnd > assignment.validUntil)
  ) throw new Error('The attestation is outside the public policy validity interval');
  const periodStart = safeNumber(attestation.periodStart, 'Measurement period');
  const measurementDay = safeNumber(attestation.measurementDay, 'Measurement day');
  const operationalDay = {
    timeZoneOffsetMinutes: safeNumber(assignment.timeZoneOffsetMinutesBias, 'Time-zone offset') - 840,
    localDayStartHour: safeNumber(assignment.localDayStartHour, 'Local day start hour'),
    utcDayStartMinute: safeNumber(assignment.utcDayStartMinute, 'UTC day start minute'),
  };
  if (
    operationalDay.utcDayStartMinute !== utcDayStartMinute(operationalDay)
    || attestation.periodStart !== attestation.measurementDay * 86_400n
      + assignment.utcDayStartMinute * 60n
    || attestation.periodEnd !== attestation.periodStart + 86_400n
  ) throw new Error('The attestation does not match its registered operational-day boundary');
  const periodDate = operationalPeriodDate(periodStart * 1_000, operationalDay);
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
  const thresholdSatisfied = attestation.thresholdSatisfied;
  if (thresholdSatisfied === hourResults.includes('outside-threshold')) {
    throw new Error('The daily result does not match the public hourly results');
  }
  const mode = publicPolicyMode(policy.mode);
  const minimum = mode === 'upper-bound'
    ? null
    : decodedPolicyValue(policy.minimumCentiOffset, policy.valueScale);
  const maximum = mode === 'lower-bound'
    ? null
    : decodedPolicyValue(policy.maximumCentiOffset, policy.valueScale);
  const thresholdResult = observedHourCount === 0
    ? 'stopped'
    : thresholdSatisfied ? 'within-threshold' : 'outside-threshold';
  return {
    proofJobId: null,
    contractAddress,
    periodDate,
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
    thresholdSatisfied,
    thresholdResult,
    schemaVersion: safeNumber(attestation.schemaVersion, 'Schema version'),
    circuitVersion: safeNumber(attestation.circuitVersion, 'Circuit version'),
    policy: {
      mode,
      minimum,
      maximum,
      valueScale: safeNumber(policy.valueScale, 'Policy scale'),
      sensorType: publicSensorType(policy.sensorTypeCode),
      unit: publicUnit(policy.unitCode),
      version: safeNumber(policy.version, 'Policy version'),
    },
    transactions: {
      attest: {
        txId: transaction.txId,
        txHash: transaction.txHash,
        blockHeight: String(transaction.blockHeight),
      },
    },
    resultVerified: true,
    hourlyResultsAvailable: true,
    status: 'confirmed',
    proofGeneratedAt: null,
    claim: observedHourCount === 0
      ? 'All 24 operational hours are publicly reported as NO DATA; no sensor values are disclosed.'
      : 'Each operational hour is publicly proved as WITHIN, OUTSIDE, or NO DATA under the registered threshold; the sensor values remain private.',
    claimJa: observedHourCount === 0
      ? '運用日の24時間すべてが「計測なし」として公開され、センサー値自体は開示されません。'
      : '運用日の各時間帯について、登録済みしきい値に対する「閾値以内・範囲外・計測なし」を公開しています。センサー値自体は非公開です。',
    checks: {
      dailyAttestationRecorded: true,
      committedHourlyExtrema: true,
      attestationVerified: true,
      midnightConfirmed: true,
    },
    network: 'Midnight Preprod',
    privacy: {
      hourlyExtrema: 'private',
      nonce: 'private',
      thresholdPolicy: 'public-on-ledger',
    },
  };
}

export function verifyPublicAttestationLedger(
  input: PublicAttestationRecord,
  state: Ledger,
): Omit<PublicAttestationChecks, 'midnightConfirmed'> {
  const commitment = hexToBytes(input.attestationCommitment);
  const measurementGroupId = hexToBytes(input.measurementGroupId);
  const deviceCommitment = hexToBytes(input.deviceCommitment);
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
  const assignmentBoundary = {
    timeZoneOffsetMinutes: Number(assignment.timeZoneOffsetMinutesBias) - 840,
    localDayStartHour: Number(assignment.localDayStartHour),
  };
  const boundaryMatches = input.operationalDay.timeZoneOffsetMinutes
      === assignmentBoundary.timeZoneOffsetMinutes
    && input.operationalDay.localDayStartHour === assignmentBoundary.localDayStartHour
    && input.operationalDay.utcDayStartMinute === Number(assignment.utcDayStartMinute)
    && input.operationalDay.utcDayStartMinute === utcDayStartMinute(assignmentBoundary);
  const periodStart = boundaryMatches
    ? operationalPeriodStart(input.periodDate, assignmentBoundary).valueOf()
    : Number.NaN;
  const periodStartEpoch = Number.isFinite(periodStart) ? BigInt(periodStart / 1_000) : -1n;
  const measurementDay = periodStartEpoch >= 0n ? periodStartEpoch / 86_400n : -1n;
  const dailyAttestationRecorded = attestation.verified;
  const committedHourlyExtrema = dailyAttestationRecorded
    && sameBytes(attestation.attestationCommitment, commitment)
    && sameBytes(attestation.measurementGroupId, measurementGroupId)
    && sameBytes(attestation.deviceCommitment, deviceCommitment)
    && sameBytes(attestation.deviceCommitment, assignment.deviceCommitment)
    && sameBytes(attestation.policyId, policyKey)
    && sameBytes(attestation.assignmentId, assignmentKey)
    && boundaryMatches
    && attestation.measurementDay === measurementDay
    && attestation.periodStart === periodStartEpoch
    && attestation.periodEnd === periodStartEpoch + 86_400n
    && attestation.sampleCount === BigInt(input.sampleCount)
    && attestation.observedHourCount === BigInt(input.observedHourCount)
    && sameHours(attestation.hourPresence, input.hourPresence)
    && sameHourResults(attestation.hourResults, input.hourResults)
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
  const assignmentValidFromMs = input.assignmentValidFrom === null
    ? 0
    : Date.parse(input.assignmentValidFrom);
  const assignmentValidUntilMs = input.assignmentValidUntil === null
    ? 0
    : Date.parse(input.assignmentValidUntil);
  if (!Number.isFinite(assignmentValidFromMs) || !Number.isFinite(assignmentValidUntilMs)) {
    return {
      dailyAttestationRecorded,
      committedHourlyExtrema,
      attestationVerified: false,
    };
  }
  const assignmentValidFrom = BigInt(Math.floor(assignmentValidFromMs / 1_000));
  const assignmentValidUntil = BigInt(Math.floor(assignmentValidUntilMs / 1_000));
  const attestationVerified = assignment.version > 0n
    && assignment.version === BigInt(input.assignmentVersion)
    && sameBytes(assignment.policyId, policyKey)
    && sameBytes(assignment.deviceCommitment, attestation.deviceCommitment)
    && assignment.validFrom === assignmentValidFrom
    && assignment.validUntil === assignmentValidUntil
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

async function transactionByHash(transactionHash: string): Promise<ChainTransactionLookup> {
  const response = await withTimeout(fetch(preprodIndexer, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `query PublicProofTransaction($offset: TransactionOffset!) {
        transactions(offset: $offset) {
          hash
          block { height }
          ... on RegularTransaction {
            identifiers
            contractActions {
              address
              state
              ... on ContractCall { entryPoint }
            }
          }
        }
      }`,
      variables: { offset: { hash: transactionHash } },
    }),
  }), 'Midnight transaction-hash lookup');
  if (!response.ok) {
    throw new Error(`Midnight Indexer returned HTTP ${response.status}`);
  }
  const body = await response.json() as {
    data?: { transactions?: ChainTransactionLookup[] };
    errors?: { message?: string }[];
  };
  if (body.errors?.length) {
    throw new Error(body.errors.map((error) => error.message || 'Indexer query failed').join('; '));
  }
  const transaction = body.data?.transactions?.[0];
  if (!transaction) throw new Error('The transaction was not found on Midnight');
  if (
    typeof transaction.hash !== 'string'
    || !Array.isArray(transaction.identifiers)
    || !Array.isArray(transaction.contractActions)
    || transaction.contractActions.some((action) => (
      typeof action.address !== 'string'
      || typeof action.state !== 'string'
      || (action.entryPoint !== undefined && typeof action.entryPoint !== 'string')
    ))
    || !Number.isSafeInteger(transaction.block?.height)
  ) throw new Error('The Midnight Indexer returned an incomplete transaction record');
  return transaction;
}

export async function loadPublicAttestationByTransactionHash(
  rawTransactionHash: string,
): Promise<PublicChainProofRecord> {
  const transactionHash = rawTransactionHash.trim().replace(/^0x/iu, '').toLowerCase();
  if (!/^[a-f\d]{64}$/u.test(transactionHash)) {
    throw new Error('Transaction hash must be 64 hexadecimal characters');
  }
  setNetworkId('preprod');
  const lookup = await transactionByHash(transactionHash);
  const txId = lookup.identifiers.find((identifier) => /^(?:[a-f\d]{2}){32,64}$/iu.test(identifier));
  if (!txId) throw new Error('The Midnight transaction has no usable identifier');
  const provider = indexerPublicDataProvider(
    preprodIndexer,
    preprodIndexerWs,
    WebSocketImplementation,
  );
  const finalized = await withTimeout(
    provider.watchForTxData(txId),
    'Midnight transaction confirmation',
  );
  if (
    finalized.status !== SucceedEntirely
    || finalized.txHash.toLowerCase() !== transactionHash
    || lookup.hash.toLowerCase() !== transactionHash
    || finalized.blockHeight !== lookup.block.height
  ) throw new Error('The transaction is not a successful confirmed Midnight transaction');
  const actions = lookup.contractActions.filter((action) => (
    action.entryPoint === 'submitDailyAttestation'
    && /^[a-f\d]{64}$/u.test(action.address.replace(/^0x/iu, '').toLowerCase())
  ));
  if (actions.length === 0) throw new Error('The transaction has no daily-attestation Contract action');
  const candidates: PublicChainProofRecord[] = [];
  const rejectedCandidates: string[] = [];
  for (const action of actions) {
    try {
      const address = action.address.replace(/^0x/iu, '').toLowerCase();
      const state = decodeLedger(ContractState.deserialize(hexToBytes(action.state)).data);
      candidates.push(publicAttestationFromLedgerTransition(
        address,
        state,
        null,
        {
          txId: finalized.txId,
          txHash: finalized.txHash,
          blockHeight: finalized.blockHeight,
        },
      ));
    } catch (error) {
      // Sponsored transactions can contain unrelated actions. Only a state transition
      // that decodes as the current sensor-registry schema is a viewer candidate.
      rejectedCandidates.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (candidates.length !== 1) {
    throw new Error(candidates.length === 0
      ? `No schema-7 daily attestation was found in this transaction${
          rejectedCandidates.length > 0 ? `: ${rejectedCandidates.join('; ')}` : ''
        }`
      : 'The transaction contains multiple daily attestations');
  }
  return candidates[0]!;
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
