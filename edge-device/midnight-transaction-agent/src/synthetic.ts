import {
  generateSensorRecords,
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
  policyId?: string;
  assignmentId?: string;
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
  const periodStart = new Date(`${periodDate}T00:00:00+09:00`);
  if (Number.isNaN(periodStart.valueOf())) throw new Error('Synthetic benchmark period date is invalid');
  if (options.outlierValue !== undefined && !Number.isFinite(options.outlierValue)) {
    throw new Error('Synthetic benchmark outlier value must be finite');
  }
  const intervalSeconds = 86_400 / options.sampleCount;
  const records = generateSensorRecords({
    deviceId,
    start: periodStart,
    samples: options.sampleCount,
    intervalSeconds,
    seed,
  });
  if (options.outlierValue !== undefined && records[0]) {
    records[0] = { ...records[0], temperature: options.outlierValue };
  }
  return prepareDailyExtremaAttestation(records, {
    deviceId,
    periodDate,
    policyId: options.policyId,
    assignmentId: options.assignmentId,
    nonceSeed: `synthetic-cost-benchmark:${options.sampleCount}:${options.runId}:${seed}`,
  });
}
