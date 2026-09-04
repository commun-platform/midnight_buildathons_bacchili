import {
  evaluatePreparedDailyExtremaHoursLocally,
  prepareDailyExtremaAttestation,
  type HourThresholdResult,
  type PreparedDailyExtremaAttestation,
  type SensorRecord,
  type ThresholdPolicyDescriptor,
} from '@midnight-demo/shared/runtime';

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const periodDatePattern = /^\d{4}-\d{2}-\d{2}$/u;
const maximumRecords = 2_000;

export interface ManagedPreparationInput {
  deviceId: string;
  periodDate: string;
  measurementGroupId: string;
  timeZoneOffsetMinutes: number;
  localDayStartHour: number;
  policyId: string;
  assignmentId: string;
  policy: ThresholdPolicyDescriptor;
  records: SensorRecord[];
}

export interface ManagedPreparationResult {
  attestation: PreparedDailyExtremaAttestation;
  hourResults: HourThresholdResult[];
  thresholdSatisfied: boolean;
}

function validate(input: ManagedPreparationInput): void {
  for (const [label, value] of [
    ['deviceId', input.deviceId],
    ['measurementGroupId', input.measurementGroupId],
    ['policyId', input.policyId],
    ['assignmentId', input.assignmentId],
  ] as const) {
    if (!identifierPattern.test(value)) throw new Error(`${label} is invalid`);
  }
  if (!periodDatePattern.test(input.periodDate)) throw new Error('periodDate is invalid');
  if (!Array.isArray(input.records) || input.records.length > maximumRecords) {
    throw new Error('Managed preparation records are invalid');
  }
  if (input.policy.policyId !== input.policyId) throw new Error('Managed preparation Policy is invalid');
}

export async function prepareManagedAttestation(
  input: ManagedPreparationInput,
): Promise<ManagedPreparationResult> {
  validate(input);
  const attestation = await prepareDailyExtremaAttestation(input.records, {
    deviceId: input.deviceId,
    periodDate: input.periodDate,
    measurementGroupId: input.measurementGroupId,
    timeZoneOffsetMinutes: input.timeZoneOffsetMinutes,
    localDayStartHour: input.localDayStartHour,
    policyId: input.policyId,
    assignmentId: input.assignmentId,
  });
  const hourResults = evaluatePreparedDailyExtremaHoursLocally(attestation, input.policy);
  return {
    attestation,
    hourResults,
    thresholdSatisfied: !hourResults.includes('outside-threshold'),
  };
}
