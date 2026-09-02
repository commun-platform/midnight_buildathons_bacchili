import {
  generateSensorRecords,
  operationalPeriodStart,
  prepareDailyExtremaAttestation,
  type PreparedDailyExtremaAttestation,
} from '@midnight-demo/shared';

export const syntheticBenchmarkSampleCounts = [24, 96, 1440] as const;

export interface SyntheticBenchmarkOptions {
  sampleCount: number;
  runId: string;
  seed?: number;
  deviceId?: string;
  periodDate?: string;
  outlierValue?: number;
  missingHours?: readonly number[];
  policyId?: string;
  assignmentId?: string;
  timeZoneOffsetMinutes?: number;
  localDayStartHour?: number;
}

export async function prepareSyntheticBenchmarkDataset(
  options: SyntheticBenchmarkOptions,
): Promise<PreparedDailyExtremaAttestation> {
  if (!syntheticBenchmarkSampleCounts.includes(options.sampleCount as 24 | 96 | 1440)) {
    throw new Error('Synthetic benchmark sample count must be one of 24, 96, or 1440');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(options.runId)) {
    throw new Error('Synthetic benchmark run ID must contain 1-64 safe identifier characters');
  }
  const seed = options.seed ?? 20260828 + options.sampleCount;
  if (!Number.isSafeInteger(seed)) throw new Error('Synthetic benchmark seed must be an integer');
  const deviceId = options.deviceId ?? 'edge-temp-001';
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(deviceId)) {
    throw new Error('Synthetic benchmark Device ID is invalid');
  }
  const periodDate = options.periodDate ?? '2026-08-27';
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(periodDate)) {
    throw new Error('Synthetic benchmark period date must be YYYY-MM-DD');
  }
  const boundary = {
    timeZoneOffsetMinutes: options.timeZoneOffsetMinutes ?? 0,
    localDayStartHour: options.localDayStartHour ?? 0,
  };
  const periodStart = operationalPeriodStart(periodDate, boundary);
  if (options.outlierValue !== undefined && !Number.isFinite(options.outlierValue)) {
    throw new Error('Synthetic benchmark outlier value must be finite');
  }
  const missingHours = options.missingHours ?? [];
  const missingHourSet = new Set<number>();
  for (const hour of missingHours) {
    if (!Number.isSafeInteger(hour) || hour < 0 || hour > 23) {
      throw new Error('Synthetic benchmark missing hours must be integers from 0 through 23');
    }
    if (missingHourSet.has(hour)) {
      throw new Error('Synthetic benchmark missing hours must not contain duplicates');
    }
    missingHourSet.add(hour);
  }
  const intervalSeconds = 86_400 / options.sampleCount;
  const records = generateSensorRecords({
    deviceId,
    start: periodStart,
    samples: options.sampleCount,
    intervalSeconds,
    seed,
  }).filter((record) => {
    const hour = Math.floor(
      (Date.parse(record.timestamp) - periodStart.valueOf()) / 3_600_000,
    );
    return !missingHourSet.has(hour);
  });
  if (options.outlierValue !== undefined && records[0]) {
    records[0] = { ...records[0], temperature: options.outlierValue };
  }
  return prepareDailyExtremaAttestation(records, {
    deviceId,
    periodDate,
    policyId: options.policyId,
    assignmentId: options.assignmentId,
    ...boundary,
    nonceSeed: `synthetic-cost-benchmark:${options.sampleCount}:${options.runId}:${seed}`,
  });
}
