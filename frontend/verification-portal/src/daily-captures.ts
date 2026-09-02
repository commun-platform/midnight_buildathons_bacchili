import {
  DAILY_EXTREMA_CIRCUIT_VERSION,
  DAILY_EXTREMA_SCHEMA_VERSION,
  bytesToHex,
  evaluatePreparedDailyExtremaLocally,
  evaluatePreparedDailyExtremaHoursLocally,
  generateSensorRecords,
  operationalPeriodDate,
  operationalPeriodStart,
  prepareDailyExtremaAttestation,
  sha256,
  type PreparedDailyExtremaAttestation,
  type HourThresholdResult,
  type OperationalDayBoundary,
  type SensorRecord,
  type ThresholdPolicyDescriptor,
} from '@midnight-demo/shared';

export type DailyGenerationMode = 'within-threshold' | 'with-outliers';
export type DailySampleCount = 24 | 96 | 1440;

export interface DailyHourlyWindow {
  hourIndex: number;
  periodStart: string;
  periodEnd: string;
  count: number;
  minimum: number;
  maximum: number;
  average: number;
  commitment: string;
}

export interface BrowserDailyCapture {
  schemaVersion: 3;
  storageKey: string;
  projectId: string;
  deviceId: string;
  periodDate: string;
  generatedAt: string;
  generationMode: DailyGenerationMode;
  requestedSampleCount: DailySampleCount;
  seed: number;
  completeDay: boolean;
  hourResults: HourThresholdResult[];
  thresholdSatisfied: boolean;
  outlierCount: number;
  records: SensorRecord[];
  windows: DailyHourlyWindow[];
  attestation: PreparedDailyExtremaAttestation;
  proofJobId: string;
}

export interface GenerateDailyCaptureInput {
  projectId: string;
  deviceId: string;
  periodDate: string;
  policy: ThresholdPolicyDescriptor;
  assignmentId: string;
  operationalDay: OperationalDayBoundary;
  sampleCount: DailySampleCount;
  mode: DailyGenerationMode;
  now?: Date;
  seed?: number;
}

const databaseName = 'vsp-device-private-data-v1';
const captureStoreName = 'daily-captures';
const dayMilliseconds = 24 * 60 * 60 * 1000;
const browserGenerationDayLimit = 30;
const supportedSampleCounts = new Set<DailySampleCount>([24, 96, 1440]);

function isCurrentDailyCapture(value: unknown): value is BrowserDailyCapture {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const capture = value as Partial<BrowserDailyCapture>;
  const attestation = capture.attestation;
  return capture.schemaVersion === 3
    && capture.requestedSampleCount === 1440
    && Array.isArray(capture.records)
    && capture.records.length === 1440
    && Array.isArray(capture.windows)
    && capture.windows.length === 24
    && Array.isArray(capture.hourResults)
    && capture.hourResults.length === 24
    && attestation?.publicData.schemaVersion === DAILY_EXTREMA_SCHEMA_VERSION
    && attestation.publicData.circuitVersion === DAILY_EXTREMA_CIRCUIT_VERSION
    && attestation.publicData.sampleCount === 1440
    && attestation.privateData.schemaVersion === DAILY_EXTREMA_SCHEMA_VERSION
    && attestation.privateData.circuitVersion === DAILY_EXTREMA_CIRCUIT_VERSION
    && attestation.privateData.hours.length === 24;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function shiftCalendarDate(periodDate: string, days: number): string {
  const [year, month, day] = periodDate.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

export function dailyGenerationDateBounds(
  operationalDay: OperationalDayBoundary = { timeZoneOffsetMinutes: 0, localDayStartHour: 0 },
  now = new Date(),
): { minimum: string; maximum: string } {
  if (!Number.isFinite(now.valueOf())) throw new Error('Current time is invalid');
  const currentPeriodDate = operationalPeriodDate(now, operationalDay);
  return {
    minimum: shiftCalendarDate(currentPeriodDate, -browserGenerationDayLimit),
    maximum: shiftCalendarDate(currentPeriodDate, -1),
  };
}

export function validateDailyGenerationDate(
  periodDate: string,
  operationalDay: OperationalDayBoundary = { timeZoneOffsetMinutes: 0, localDayStartHour: 0 },
  now = new Date(),
): void {
  operationalPeriodStart(periodDate, operationalDay);
  const bounds = dailyGenerationDateBounds(operationalDay, now);
  if (periodDate < bounds.minimum || periodDate > bounds.maximum) {
    throw new Error(`periodDate must be between ${bounds.minimum} and ${bounds.maximum}`);
  }
}

function storageKey(projectId: string, deviceId: string, periodDate: string): string {
  return `${projectId}\n${deviceId}\n${periodDate}`;
}

function policyAllowsValue(policy: ThresholdPolicyDescriptor, value: number): boolean {
  if (policy.mode !== 'upper-bound' && value < policy.minimum) return false;
  if (policy.mode !== 'lower-bound' && value > policy.maximum) return false;
  return true;
}

function safeRange(policy: ThresholdPolicyDescriptor): { low: number; high: number } {
  if (policy.mode === 'upper-bound') {
    return { low: Math.max(-99, policy.maximum - 8), high: policy.maximum - 1 };
  }
  if (policy.mode === 'lower-bound') {
    return { low: policy.minimum + 1, high: policy.minimum + 8 };
  }
  const width = policy.maximum - policy.minimum;
  if (!(width > 0)) throw new Error('Closed-range Policy must have minimum < maximum');
  const margin = Math.min(Math.max(width * 0.12, 0.25), width * 0.4);
  return { low: policy.minimum + margin, high: policy.maximum - margin };
}

function outlierValue(policy: ThresholdPolicyDescriptor, upper: boolean): number {
  if (policy.mode === 'upper-bound' || (policy.mode === 'closed-range' && upper)) {
    return round(policy.maximum + Math.max(1, Math.abs(policy.maximum) * 0.05));
  }
  return round(policy.minimum - Math.max(1, Math.abs(policy.minimum) * 0.05));
}

function generatedTemperatures(
  records: SensorRecord[],
  policy: ThresholdPolicyDescriptor,
  mode: DailyGenerationMode,
  seed: number,
): SensorRecord[] {
  const range = safeRange(policy);
  const normalized = records.map((record, index) => {
    const wave = (Math.sin((index / Math.max(records.length, 1)) * Math.PI * 2) + 1) / 2;
    const noise = Math.max(-0.08, Math.min(0.08, (record.temperature - 25) / 40));
    const ratio = Math.max(0, Math.min(1, wave * 0.84 + 0.08 + noise));
    return {
      ...record,
      temperature: round(range.low + (range.high - range.low) * ratio),
    };
  });
  if (mode === 'within-threshold' || normalized.length === 0) return normalized;

  const firstIndex = Math.abs(seed) % normalized.length;
  const secondIndex = (firstIndex + Math.max(1, Math.floor(normalized.length * 0.57)))
    % normalized.length;
  const first = normalized[firstIndex];
  if (first) normalized[firstIndex] = { ...first, temperature: outlierValue(policy, true) };
  const second = normalized[secondIndex];
  if (second) normalized[secondIndex] = {
    ...second,
    temperature: outlierValue(policy, policy.mode === 'upper-bound'),
  };
  return normalized;
}

async function hourlyWindows(
  records: readonly SensorRecord[],
  start: Date,
  end: Date,
  intervalMilliseconds: number,
): Promise<DailyHourlyWindow[]> {
  const groups = new Map<number, SensorRecord[]>();
  for (const record of records) {
    const timestamp = Date.parse(record.timestamp);
    const hourIndex = Math.floor((timestamp - start.valueOf()) / 3_600_000);
    const group = groups.get(hourIndex) ?? [];
    group.push(record);
    groups.set(hourIndex, group);
  }
  return Promise.all([...groups.entries()].sort(([left], [right]) => left - right).map(
    async ([hourIndex, group]) => {
      const temperatures = group.map((record) => record.temperature);
      const windowStart = new Date(start.valueOf() + hourIndex * 3_600_000);
      const latestSample = Math.max(...group.map((record) => Date.parse(record.timestamp)));
      const windowEnd = new Date(Math.min(
        windowStart.valueOf() + 3_600_000,
        end.valueOf(),
        latestSample + intervalMilliseconds,
      ));
      if (windowEnd <= windowStart) throw new Error('Generated measurement window is empty');
      return {
        hourIndex,
        periodStart: windowStart.toISOString(),
        periodEnd: windowEnd.toISOString(),
        count: group.length,
        minimum: Math.min(...temperatures),
        maximum: Math.max(...temperatures),
        average: round(temperatures.reduce((sum, value) => sum + value, 0) / group.length),
        commitment: bytesToHex(await sha256(JSON.stringify(group))),
      };
    },
  ));
}

async function proofJobId(
  projectId: string,
  deviceId: string,
  attestation: PreparedDailyExtremaAttestation,
): Promise<string> {
  const digest = await sha256([
    projectId,
    deviceId,
    attestation.publicData.measurementGroupId,
  ].join('\n'));
  return `proof-${bytesToHex(digest).slice(0, 48)}`;
}

export async function generateDailyCapture(
  input: GenerateDailyCaptureInput,
): Promise<BrowserDailyCapture> {
  if (!supportedSampleCounts.has(input.sampleCount)) {
    throw new Error('sampleCount must be 24, 96, or 1440');
  }
  const now = input.now ?? new Date();
  validateDailyGenerationDate(input.periodDate, input.operationalDay, now);
  const start = operationalPeriodStart(input.periodDate, input.operationalDay);
  const fullEnd = new Date(start.valueOf() + dayMilliseconds);
  const completeDay = true;
  const effectiveEnd = fullEnd;
  const intervalMilliseconds = dayMilliseconds / input.sampleCount;
  const actualSampleCount = input.sampleCount;
  const seed = input.seed ?? crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  const records = generatedTemperatures(generateSensorRecords({
    deviceId: input.deviceId,
    start,
    samples: actualSampleCount,
    intervalSeconds: intervalMilliseconds / 1000,
    seed,
  }), input.policy, input.mode, seed);
  const attestation = await prepareDailyExtremaAttestation(records, {
    deviceId: input.deviceId,
    periodDate: input.periodDate,
    policyId: input.policy.policyId,
    assignmentId: input.assignmentId,
    timeZoneOffsetMinutes: input.operationalDay.timeZoneOffsetMinutes,
    localDayStartHour: input.operationalDay.localDayStartHour,
  });
  const outlierCount = records.filter((record) => !policyAllowsValue(input.policy, record.temperature)).length;
  const thresholdResult = evaluatePreparedDailyExtremaLocally(attestation, input.policy);
  const hourResults = evaluatePreparedDailyExtremaHoursLocally(attestation, input.policy);
  return {
    schemaVersion: 3,
    storageKey: storageKey(input.projectId, input.deviceId, input.periodDate),
    projectId: input.projectId,
    deviceId: input.deviceId,
    periodDate: input.periodDate,
    generatedAt: new Date().toISOString(),
    generationMode: input.mode,
    requestedSampleCount: input.sampleCount,
    seed,
    completeDay,
    hourResults,
    thresholdSatisfied: thresholdResult === 'within-threshold',
    outlierCount,
    records,
    windows: await hourlyWindows(records, start, effectiveEnd, intervalMilliseconds),
    attestation,
    proofJobId: await proofJobId(input.projectId, input.deviceId, attestation),
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(captureStoreName)) {
        const store = request.result.createObjectStore(captureStoreName, { keyPath: 'storageKey' });
        store.createIndex('device', ['projectId', 'deviceId'], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open private daily storage'));
  });
}

export async function loadDailyCapture(
  projectId: string,
  deviceId: string,
  periodDate: string,
): Promise<BrowserDailyCapture | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(captureStoreName, 'readonly')
        .objectStore(captureStoreName)
        .get(storageKey(projectId, deviceId, periodDate));
      request.onsuccess = () => resolve(isCurrentDailyCapture(request.result) ? request.result : null);
      request.onerror = () => reject(request.error ?? new Error('Could not read private daily data'));
    });
  } finally {
    database.close();
  }
}

export async function listDailyCaptures(
  projectId: string,
  deviceId: string,
): Promise<BrowserDailyCapture[]> {
  const database = await openDatabase();
  try {
    const captures = await new Promise<BrowserDailyCapture[]>((resolve, reject) => {
      const request = database.transaction(captureStoreName, 'readonly')
        .objectStore(captureStoreName)
        .index('device')
        .getAll(IDBKeyRange.only([projectId, deviceId]));
      request.onsuccess = () => resolve(request.result as BrowserDailyCapture[]);
      request.onerror = () => reject(request.error ?? new Error('Could not list private daily data'));
    });
    return captures
      .filter(isCurrentDailyCapture)
      .sort((left, right) => right.periodDate.localeCompare(left.periodDate));
  } finally {
    database.close();
  }
}

export async function storeDailyCapture(capture: BrowserDailyCapture): Promise<void> {
  if (!isCurrentDailyCapture(capture)) {
    throw new Error('Private daily data does not match the current 1,440-sample attestation profile');
  }
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(captureStoreName, 'readwrite');
      transaction.objectStore(captureStoreName).put(capture);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not store private daily data'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Private daily storage was aborted'));
    });
  } finally {
    database.close();
  }
}

export const dailyCaptureStorageName = databaseName;
