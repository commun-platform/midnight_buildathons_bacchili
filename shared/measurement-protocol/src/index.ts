import {
  CompactTypeBoolean,
  CompactTypeBytes,
  CompactTypeField,
  CompactTypeMerkleTreeDigest,
  CompactTypeMerkleTreePath,
  CompactTypeUnsignedInteger,
  CompactTypeVector,
  StateBoundedMerkleTree,
  degradeToTransient,
  leafHash,
  persistentCommit,
  transientHash,
  type CompactType,
  type MerkleTreePath,
} from '@midnight-ntwrk/compact-runtime';

export {
  browserPolicyCanonicalMessage,
  browserProjectCanonicalMessage,
  browserProvisioningCanonicalMessage,
  type BrowserPolicyAuthorization,
  type BrowserPolicyMode,
  type BrowserProjectAuthorization,
  type BrowserProvisioningAuthorization,
  type BrowserWalletSignature,
} from './browser-provisioning.js';

export const MERKLE_TREE_DEPTH = 11;
export const TEMPERATURE_OFFSET_CENTI = 10_000;
export const DATASET_SCHEMA_VERSION = 2;
export const DAILY_EXTREMA_SCHEMA_VERSION = 6;
export const DAILY_EXTREMA_CIRCUIT_VERSION = 4;
export const HOURS_PER_DAY = 24;
export const DAILY_EXTREMA_COMMITMENT_DOMAIN = 'vsp:daily-extrema:v1';
export const MEASUREMENT_GROUP_DOMAIN = 'vsp:measurement-group:v1';
export const UTC_OFFSET_MINUTES = 0;

export interface SensorRecord {
  deviceId: string;
  timestamp: string;
  temperature: number;
  humidity: number;
}

export interface CompactSensorLeaf {
  timestamp: bigint;
  temperatureCentiOffset: bigint;
  humidityDeci: bigint;
}

export interface SerializedMerklePathEntry {
  sibling: string;
  goesLeft: boolean;
}

export interface SerializedMerklePath {
  leafHex: string;
  path: SerializedMerklePathEntry[];
}

export interface PublicDatasetCommitment {
  datasetRoot: string;
  merkleRoot: string;
  deviceCommitment: string;
  periodStart: string;
  periodEnd: string;
  periodStartEpoch: string;
  periodEndEpoch: string;
  sampleCount: number;
  thresholdMin: number;
  thresholdMax: number;
  schemaVersion: number;
}

export interface PrivateDataset {
  datasetId: string;
  datasetRoot: string;
  deviceId: string;
  samples: SensorRecord[];
  selectedIndex: number;
  selectedNonceHex: string;
  merklePath: SerializedMerklePath;
}

export interface PreparedDataset {
  publicData: PublicDatasetCommitment;
  privateData: PrivateDataset;
}

export type ThresholdPolicyMode = 'closed-range' | 'upper-bound' | 'lower-bound';
export type DailyThresholdResult = 'within-threshold' | 'outside-threshold';
export type HourThresholdResult = 'no-data' | DailyThresholdResult;

export interface ThresholdPolicyDescriptor {
  policyId: string;
  mode: ThresholdPolicyMode;
  minimum: number;
  maximum: number;
  valueScale: number;
  sensorTypeCode: number;
  unitCode: number;
  version: number;
}

export interface HourlyExtremaSlot {
  hourIndex: number;
  present: boolean;
  minimum: number;
  maximum: number;
  sampleCount: number;
}

export interface CompactHourlyExtrema {
  present: boolean;
  minimumCentiOffset: bigint;
  maximumCentiOffset: bigint;
  sampleCount: bigint;
}

export interface CompactDailyExtremaInput {
  commitmentDomain: Uint8Array;
  deviceCommitment: Uint8Array;
  measurementGroupId: Uint8Array;
  policyId: Uint8Array;
  assignmentId: Uint8Array;
  periodStart: bigint;
  periodEnd: bigint;
  hours: CompactHourlyExtrema[];
  schemaVersion: bigint;
  circuitVersion: bigint;
}

export interface PublicDailyExtremaAttestation {
  attestationCommitment: string;
  deviceCommitment: string;
  measurementGroupId: string;
  policyId: string;
  policyKey: string;
  assignmentId: string;
  assignmentKey: string;
  periodDate: string;
  measurementDay: number;
  periodStart: string;
  periodEnd: string;
  periodStartEpoch: string;
  periodEndEpoch: string;
  hourPresence: boolean[];
  observedHourCount: number;
  stoppedHourCount: number;
  sampleCount: number;
  schemaVersion: number;
  circuitVersion: number;
}

export interface PrivateDailyExtremaAttestation {
  attestationCommitment: string;
  deviceId: string;
  deviceCommitment: string;
  measurementGroupId: string;
  policyKey: string;
  assignmentKey: string;
  periodStartEpoch: string;
  periodEndEpoch: string;
  hours: HourlyExtremaSlot[];
  nonceHex: string;
  schemaVersion: number;
  circuitVersion: number;
}

export interface PreparedDailyExtremaAttestation {
  publicData: PublicDailyExtremaAttestation;
  privateData: PrivateDailyExtremaAttestation;
}

export interface PrepareDailyExtremaOptions {
  deviceId?: string;
  periodDate?: string;
  measurementGroupId?: string;
  timeZoneOffsetMinutes?: number;
  policyId?: string;
  assignmentId?: string;
  nonceSeed?: string;
}

export interface GenerateSensorOptions {
  deviceId?: string;
  start?: Date;
  samples?: number;
  intervalSeconds?: number;
  seed?: number;
}

export interface PrepareDatasetOptions {
  thresholdMin?: number;
  thresholdMax?: number;
  selectedIndex?: number;
  nonceSeed?: string;
}

const encoder = new TextEncoder();
const bytes32Type = new CompactTypeBytes(32);
const uint32Type = new CompactTypeUnsignedInteger((1n << 32n) - 1n, 4);
const uint64Type = new CompactTypeUnsignedInteger((1n << 64n) - 1n, 8);
const fieldPairType = new CompactTypeVector(2, CompactTypeField);

export const compactHourlyExtremaType: CompactType<CompactHourlyExtrema> = {
  alignment: () => [
    ...CompactTypeBoolean.alignment(),
    ...uint32Type.alignment(),
    ...uint32Type.alignment(),
    ...uint32Type.alignment(),
  ],
  toValue: (value) => [
    ...CompactTypeBoolean.toValue(value.present),
    ...uint32Type.toValue(value.minimumCentiOffset),
    ...uint32Type.toValue(value.maximumCentiOffset),
    ...uint32Type.toValue(value.sampleCount),
  ],
  fromValue: (value) => ({
    present: CompactTypeBoolean.fromValue(value),
    minimumCentiOffset: uint32Type.fromValue(value),
    maximumCentiOffset: uint32Type.fromValue(value),
    sampleCount: uint32Type.fromValue(value),
  }),
};

const hourlyExtremaVectorType = new CompactTypeVector(HOURS_PER_DAY, compactHourlyExtremaType);

export const compactDailyExtremaInputType: CompactType<CompactDailyExtremaInput> = {
  alignment: () => [
    ...bytes32Type.alignment(),
    ...bytes32Type.alignment(),
    ...bytes32Type.alignment(),
    ...bytes32Type.alignment(),
    ...bytes32Type.alignment(),
    ...uint64Type.alignment(),
    ...uint64Type.alignment(),
    ...hourlyExtremaVectorType.alignment(),
    ...uint32Type.alignment(),
    ...uint32Type.alignment(),
  ],
  toValue: (value) => [
    ...bytes32Type.toValue(value.commitmentDomain),
    ...bytes32Type.toValue(value.deviceCommitment),
    ...bytes32Type.toValue(value.measurementGroupId),
    ...bytes32Type.toValue(value.policyId),
    ...bytes32Type.toValue(value.assignmentId),
    ...uint64Type.toValue(value.periodStart),
    ...uint64Type.toValue(value.periodEnd),
    ...hourlyExtremaVectorType.toValue(value.hours),
    ...uint32Type.toValue(value.schemaVersion),
    ...uint32Type.toValue(value.circuitVersion),
  ],
  fromValue: (value) => ({
    commitmentDomain: bytes32Type.fromValue(value),
    deviceCommitment: bytes32Type.fromValue(value),
    measurementGroupId: bytes32Type.fromValue(value),
    policyId: bytes32Type.fromValue(value),
    assignmentId: bytes32Type.fromValue(value),
    periodStart: uint64Type.fromValue(value),
    periodEnd: uint64Type.fromValue(value),
    hours: hourlyExtremaVectorType.fromValue(value),
    schemaVersion: uint32Type.fromValue(value),
    circuitVersion: uint32Type.fromValue(value),
  }),
};

export const compactSensorLeafType: CompactType<CompactSensorLeaf> = {
  alignment: () => [
    ...uint64Type.alignment(),
    ...uint32Type.alignment(),
    ...uint32Type.alignment(),
  ],
  toValue: (value) => [
    ...uint64Type.toValue(value.timestamp),
    ...uint32Type.toValue(value.temperatureCentiOffset),
    ...uint32Type.toValue(value.humidityDeci),
  ],
  fromValue: (value) => ({
    timestamp: uint64Type.fromValue(value),
    temperatureCentiOffset: uint32Type.fromValue(value),
    humidityDeci: uint32Type.fromValue(value),
  }),
};

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function createPrng(initialSeed: number): () => number {
  let state = initialSeed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSensorRecords(options: GenerateSensorOptions = {}): SensorRecord[] {
  const deviceId = options.deviceId ?? 'measurement-test-001';
  const start = options.start ?? new Date('2026-08-25T00:00:00.000Z');
  const samples = options.samples ?? 1440;
  const intervalSeconds = options.intervalSeconds ?? 60;
  const random = createPrng(options.seed ?? 20260825);

  if (!deviceId.trim()) throw new Error('deviceId is required');
  if (!Number.isInteger(samples) || samples < 1 || samples > 2 ** MERKLE_TREE_DEPTH) {
    throw new Error(`samples must be between 1 and ${2 ** MERKLE_TREE_DEPTH}`);
  }
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1) {
    throw new Error('intervalSeconds must be a positive integer');
  }

  return Array.from({ length: samples }, (_, index) => {
    const cycle = (index / samples) * Math.PI * 2;
    const timestamp = new Date(start.getTime() + index * intervalSeconds * 1000);
    return {
      deviceId,
      timestamp: timestamp.toISOString(),
      temperature: round(25 + Math.sin(cycle) * 3 + (random() - 0.5) * 0.8, 2),
      humidity: round(61 + Math.cos(cycle) * 8 + (random() - 0.5) * 2, 1),
    };
  });
}

export function canonicalizeSensorRecord(record: SensorRecord): string {
  if (!record.deviceId.trim()) throw new Error('record.deviceId is required');
  if (!Number.isFinite(Date.parse(record.timestamp))) throw new Error(`Invalid timestamp: ${record.timestamp}`);
  if (!Number.isFinite(record.temperature) || !Number.isFinite(record.humidity)) {
    throw new Error('Sensor values must be finite numbers');
  }

  return JSON.stringify({
    deviceId: record.deviceId,
    timestamp: new Date(record.timestamp).toISOString(),
    temperature: record.temperature,
    humidity: record.humidity,
  });
}

export function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(value: string): Uint8Array {
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error('Expected an even-length hexadecimal value');
  }
  return Uint8Array.from(normalized.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
}

export async function sha256(value: Uint8Array | string): Promise<Uint8Array> {
  const input = typeof value === 'string' ? encoder.encode(value) : value;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(input).buffer));
}

export function toCompactSensorLeaf(record: SensorRecord): CompactSensorLeaf {
  const timestamp = Date.parse(record.timestamp);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid timestamp: ${record.timestamp}`);
  const temperatureCentiOffset = Math.round(record.temperature * 100) + TEMPERATURE_OFFSET_CENTI;
  const humidityDeci = Math.round(record.humidity * 10);
  if (temperatureCentiOffset < 0 || humidityDeci < 0) {
    throw new Error('Sensor values are outside the supported unsigned encoding');
  }
  return {
    timestamp: BigInt(Math.floor(timestamp / 1000)),
    temperatureCentiOffset: BigInt(temperatureCentiOffset),
    humidityDeci: BigInt(humidityDeci),
  };
}

export function encodeTemperature(value: number): bigint {
  if (!Number.isFinite(value)) throw new Error('Temperature must be finite');
  const encoded = Math.round(value * 100) + TEMPERATURE_OFFSET_CENTI;
  if (encoded < 0 || encoded > 0xffff_ffff) {
    throw new Error('Temperature is outside the supported Uint<32> range');
  }
  return BigInt(encoded);
}

function requireSafeIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(normalized)) {
    throw new Error(`${label} must contain 1-160 safe identifier characters`);
  }
  return normalized;
}

function periodStartForDate(periodDate: string, offsetMinutes: number): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(periodDate)) throw new Error('periodDate must be YYYY-MM-DD');
  if (!Number.isInteger(offsetMinutes) || offsetMinutes < -14 * 60 || offsetMinutes > 14 * 60) {
    throw new Error('timeZoneOffsetMinutes is outside the supported range');
  }
  const [yearText, monthText, dayText] = periodDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const start = new Date(Date.UTC(year, month - 1, day) - offsetMinutes * 60_000);
  const shifted = new Date(start.valueOf() + offsetMinutes * 60_000).toISOString().slice(0, 10);
  if (shifted !== periodDate) throw new Error('periodDate is not a valid calendar date');
  return start;
}

function localDateAtOffset(timestamp: number, offsetMinutes: number): string {
  return new Date(timestamp + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

export async function thresholdPolicyKey(policyId: string): Promise<Uint8Array> {
  return sha256(`vsp:threshold-policy:v1\n${requireSafeIdentifier(policyId, 'policyId')}`);
}

export async function policyAssignmentKey(assignmentId: string): Promise<Uint8Array> {
  return sha256(`vsp:policy-assignment:v1\n${requireSafeIdentifier(assignmentId, 'assignmentId')}`);
}

export async function sensorDeviceCommitment(deviceId: string): Promise<Uint8Array> {
  return sha256(`vsp:sensor-device:v1\n${requireSafeIdentifier(deviceId, 'deviceId')}`);
}

export async function measurementGroupKey(groupId: string): Promise<Uint8Array> {
  return sha256(`${MEASUREMENT_GROUP_DOMAIN}\n${requireSafeIdentifier(groupId, 'measurementGroupId')}`);
}

export function toCompactDailyExtremaInput(
  value: PrivateDailyExtremaAttestation,
): CompactDailyExtremaInput {
  if (value.hours.length !== HOURS_PER_DAY) throw new Error('Daily extrema must contain exactly 24 hours');
  return {
    commitmentDomain: paddedBytes32(DAILY_EXTREMA_COMMITMENT_DOMAIN),
    deviceCommitment: hexToBytes(value.deviceCommitment),
    measurementGroupId: hexToBytes(value.measurementGroupId),
    policyId: hexToBytes(value.policyKey),
    assignmentId: hexToBytes(value.assignmentKey),
    periodStart: BigInt(value.periodStartEpoch),
    periodEnd: BigInt(value.periodEndEpoch),
    hours: value.hours.map((hour, index) => {
      if (hour.hourIndex !== index) throw new Error('Daily extrema hour order is invalid');
      return {
        present: hour.present,
        minimumCentiOffset: hour.present ? encodeTemperature(hour.minimum) : 0n,
        maximumCentiOffset: hour.present ? encodeTemperature(hour.maximum) : 0n,
        sampleCount: BigInt(hour.sampleCount),
      };
    }),
    schemaVersion: BigInt(value.schemaVersion),
    circuitVersion: BigInt(value.circuitVersion),
  };
}

function paddedBytes32(value: string): Uint8Array {
  const encoded = encoder.encode(value);
  if (encoded.length > 32) throw new Error('Commitment domain must fit in Bytes<32>');
  const padded = new Uint8Array(32);
  padded.set(encoded);
  return padded;
}

function policyAllows(
  policy: ThresholdPolicyDescriptor,
  minimum: number,
  maximum: number,
): boolean {
  if (minimum > maximum) return false;
  if (policy.mode !== 'upper-bound' && minimum < policy.minimum) return false;
  if (policy.mode !== 'lower-bound' && maximum > policy.maximum) return false;
  return true;
}

export async function prepareDailyExtremaAttestation(
  records: readonly SensorRecord[],
  options: PrepareDailyExtremaOptions = {},
): Promise<PreparedDailyExtremaAttestation> {
  const offsetMinutes = options.timeZoneOffsetMinutes ?? UTC_OFFSET_MINUTES;
  if (offsetMinutes !== UTC_OFFSET_MINUTES) {
    throw new Error('Daily extrema periods are fixed to UTC (UTC+00:00)');
  }
  const first = records[0];
  const deviceId = requireSafeIdentifier(
    options.deviceId ?? first?.deviceId ?? '',
    'deviceId',
  );
  if (records.some((record) => record.deviceId !== deviceId)) {
    throw new Error('All records must belong to the configured device');
  }
  const firstTimestamp = first ? Date.parse(first.timestamp) : Number.NaN;
  const periodDate = options.periodDate
    ?? (Number.isFinite(firstTimestamp) ? localDateAtOffset(firstTimestamp, offsetMinutes) : '');
  const periodStart = periodStartForDate(periodDate, offsetMinutes);
  const periodEnd = new Date(periodStart.valueOf() + 86_400_000);
  const measurementDay = Math.floor(periodStart.valueOf() / 86_400_000);
  const policyId = requireSafeIdentifier(options.policyId ?? 'temperature-v1', 'policyId');
  const assignmentId = requireSafeIdentifier(
    options.assignmentId ?? `${deviceId}-${policyId}-wave1`,
    'assignmentId',
  );
  const hours: HourlyExtremaSlot[] = Array.from({ length: HOURS_PER_DAY }, (_, hourIndex) => ({
    hourIndex,
    present: false,
    minimum: 0,
    maximum: 0,
    sampleCount: 0,
  }));

  for (const record of records) {
    const timestamp = Date.parse(record.timestamp);
    if (!Number.isFinite(timestamp)) throw new Error(`Invalid timestamp: ${record.timestamp}`);
    if (timestamp < periodStart.valueOf() || timestamp >= periodEnd.valueOf()) {
      throw new Error(`Record timestamp is outside ${periodDate} at the configured offset`);
    }
    if (!Number.isFinite(record.temperature)) throw new Error('Temperature must be finite');
    encodeTemperature(record.temperature);
    const hourIndex = Math.floor((timestamp - periodStart.valueOf()) / 3_600_000);
    const hour = hours[hourIndex];
    if (!hour) throw new Error('Calculated hour index is outside the daily range');
    if (!hour.present) {
      hour.present = true;
      hour.minimum = record.temperature;
      hour.maximum = record.temperature;
    } else {
      hour.minimum = Math.min(hour.minimum, record.temperature);
      hour.maximum = Math.max(hour.maximum, record.temperature);
    }
    hour.sampleCount += 1;
  }

  const policyKeyBytes = await thresholdPolicyKey(policyId);
  const assignmentKeyBytes = await policyAssignmentKey(assignmentId);
  const deviceCommitmentBytes = await sensorDeviceCommitment(deviceId);
  const measurementGroupIdBytes = await measurementGroupKey(
    options.measurementGroupId ?? `daily:${periodDate}`,
  );
  const nonce = await createNonce(options.nonceSeed, HOURS_PER_DAY);
  const privateData: PrivateDailyExtremaAttestation = {
    attestationCommitment: '',
    deviceId,
    deviceCommitment: bytesToHex(deviceCommitmentBytes),
    measurementGroupId: bytesToHex(measurementGroupIdBytes),
    policyKey: bytesToHex(policyKeyBytes),
    assignmentKey: bytesToHex(assignmentKeyBytes),
    periodStartEpoch: BigInt(Math.floor(periodStart.valueOf() / 1000)).toString(),
    periodEndEpoch: BigInt(Math.floor(periodEnd.valueOf() / 1000)).toString(),
    hours,
    nonceHex: bytesToHex(nonce),
    schemaVersion: DAILY_EXTREMA_SCHEMA_VERSION,
    circuitVersion: DAILY_EXTREMA_CIRCUIT_VERSION,
  };
  const commitment = persistentCommit(
    compactDailyExtremaInputType,
    toCompactDailyExtremaInput(privateData),
    nonce,
  );
  const attestationCommitment = bytesToHex(commitment);
  privateData.attestationCommitment = attestationCommitment;
  const hourPresence = hours.map((hour) => hour.present);
  const observedHourCount = hourPresence.filter(Boolean).length;
  return {
    publicData: {
      attestationCommitment,
      deviceCommitment: privateData.deviceCommitment,
      measurementGroupId: privateData.measurementGroupId,
      policyId,
      policyKey: privateData.policyKey,
      assignmentId,
      assignmentKey: privateData.assignmentKey,
      periodDate,
      measurementDay,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      periodStartEpoch: privateData.periodStartEpoch,
      periodEndEpoch: privateData.periodEndEpoch,
      hourPresence,
      observedHourCount,
      stoppedHourCount: HOURS_PER_DAY - observedHourCount,
      sampleCount: records.length,
      schemaVersion: privateData.schemaVersion,
      circuitVersion: privateData.circuitVersion,
    },
    privateData,
  };
}

export function evaluatePreparedDailyExtremaLocally(
  attestation: PreparedDailyExtremaAttestation,
  policy: ThresholdPolicyDescriptor,
): DailyThresholdResult {
  return evaluatePreparedDailyExtremaHoursLocally(attestation, policy).some(
    (result) => result === 'outside-threshold',
  ) ? 'outside-threshold' : 'within-threshold';
}

export function evaluatePreparedDailyExtremaHoursLocally(
  attestation: PreparedDailyExtremaAttestation,
  policy: ThresholdPolicyDescriptor,
): HourThresholdResult[] {
  if (policy.policyId !== attestation.publicData.policyId) throw new Error('Threshold policy mismatch');
  const publicData = attestation.publicData;
  const privateData = attestation.privateData;
  if (privateData.attestationCommitment !== publicData.attestationCommitment) {
    throw new Error('Private attestation commitment mismatch');
  }
  const nonce = hexToBytes(privateData.nonceHex);
  const commitment = persistentCommit(
    compactDailyExtremaInputType,
    toCompactDailyExtremaInput(privateData),
    nonce,
  );
  if (bytesToHex(commitment) !== publicData.attestationCommitment) {
    throw new Error('Daily extrema commitment mismatch');
  }
  if (
    privateData.deviceCommitment !== publicData.deviceCommitment
    || privateData.measurementGroupId !== publicData.measurementGroupId
    || privateData.policyKey !== publicData.policyKey
    || privateData.assignmentKey !== publicData.assignmentKey
    || privateData.periodStartEpoch !== publicData.periodStartEpoch
    || privateData.periodEndEpoch !== publicData.periodEndEpoch
    || privateData.schemaVersion !== publicData.schemaVersion
    || privateData.circuitVersion !== publicData.circuitVersion
  ) throw new Error('Private daily extrema metadata mismatch');
  if (privateData.hours.length !== HOURS_PER_DAY || publicData.hourPresence.length !== HOURS_PER_DAY) {
    throw new Error('Daily extrema must contain exactly 24 hours');
  }
  let sampleCount = 0;
  let observedHourCount = 0;
  const hourResults: HourThresholdResult[] = [];
  for (const [index, hour] of privateData.hours.entries()) {
    if (hour.hourIndex !== index || hour.present !== publicData.hourPresence[index]) {
      throw new Error('Hourly presence mismatch');
    }
    sampleCount += hour.sampleCount;
    if (!hour.present) {
      if (hour.sampleCount !== 0 || hour.minimum !== 0 || hour.maximum !== 0) {
        throw new Error('Stopped hour is not canonical');
      }
      hourResults.push('no-data');
      continue;
    }
    observedHourCount += 1;
    if (
      hour.sampleCount < 1
      || !Number.isFinite(hour.minimum)
      || !Number.isFinite(hour.maximum)
      || hour.minimum > hour.maximum
    ) throw new Error('Observed hourly extrema are invalid');
    encodeTemperature(hour.minimum);
    encodeTemperature(hour.maximum);
    hourResults.push(policyAllows(policy, hour.minimum, hour.maximum)
      ? 'within-threshold'
      : 'outside-threshold');
  }
  if (
    sampleCount !== publicData.sampleCount
    || observedHourCount !== publicData.observedHourCount
    || HOURS_PER_DAY - observedHourCount !== publicData.stoppedHourCount
  ) throw new Error('Daily aggregate counts mismatch');
  return hourResults;
}

export function verifyPreparedDailyExtremaLocally(
  attestation: PreparedDailyExtremaAttestation,
  policy: ThresholdPolicyDescriptor,
): boolean {
  try {
    return evaluatePreparedDailyExtremaLocally(attestation, policy) === 'within-threshold';
  } catch {
    return false;
  }
}

function alignedBytes32(value: Uint8Array) {
  return { value: bytes32Type.toValue(value), alignment: bytes32Type.alignment() };
}

async function createNonce(seed: string | undefined, index: number): Promise<Uint8Array> {
  if (seed !== undefined) return sha256(`${seed}:${index}`);
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);
  return nonce;
}

function fieldToHex(field: bigint): string {
  return field.toString(16).padStart(64, '0');
}

function serializeMerklePath(path: MerkleTreePath<Uint8Array>): SerializedMerklePath {
  return {
    leafHex: bytesToHex(path.leaf),
    path: path.path.map((entry) => ({
      sibling: entry.sibling.field.toString(),
      goesLeft: entry.goes_left,
    })),
  };
}

export function deserializeMerklePath(path: SerializedMerklePath): MerkleTreePath<Uint8Array> {
  return {
    leaf: hexToBytes(path.leafHex),
    path: path.path.map((entry) => ({
      sibling: { field: BigInt(entry.sibling) },
      goes_left: entry.goesLeft,
    })),
  };
}

export function calculateMerklePathRoot(path: MerkleTreePath<Uint8Array>): bigint {
  const leafDigest = bytes32Type.fromValue(leafHash(alignedBytes32(path.leaf)).value);
  let current = degradeToTransient(leafDigest);
  for (const entry of path.path) {
    const left = entry.goes_left ? current : entry.sibling.field;
    const right = entry.goes_left ? entry.sibling.field : current;
    current = transientHash(fieldPairType, [left, right]);
  }
  return current;
}

export async function prepareDataset(
  records: readonly SensorRecord[],
  options: PrepareDatasetOptions = {},
): Promise<PreparedDataset> {
  if (records.length === 0) throw new Error('At least one sensor record is required');
  if (records.length > 2 ** MERKLE_TREE_DEPTH) throw new Error('Dataset exceeds the Merkle tree capacity');

  const deviceId = records[0]?.deviceId;
  if (!deviceId || records.some((record) => record.deviceId !== deviceId)) {
    throw new Error('All records must belong to the same device');
  }

  const selectedIndex = options.selectedIndex ?? Math.floor(records.length / 2);
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= records.length) {
    throw new Error('selectedIndex is outside the dataset');
  }

  const thresholdMin = options.thresholdMin ?? 10;
  const thresholdMax = options.thresholdMax ?? 35;
  encodeTemperature(thresholdMin);
  encodeTemperature(thresholdMax);
  if (thresholdMin > thresholdMax) throw new Error('thresholdMin must not exceed thresholdMax');

  let tree = new StateBoundedMerkleTree(MERKLE_TREE_DEPTH);
  const commitments: Uint8Array[] = [];
  const nonces: Uint8Array[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) throw new Error('Dataset contains an empty record');
    const nonce = await createNonce(options.nonceSeed, index);
    const commitment = persistentCommit(compactSensorLeafType, toCompactSensorLeaf(record), nonce);
    tree = tree.update(BigInt(index), alignedBytes32(commitment));
    commitments.push(commitment);
    nonces.push(nonce);
  }

  tree = tree.rehash();
  const rootValue = tree.root();
  if (!rootValue) throw new Error('Merkle root generation failed');
  const datasetRoot = CompactTypeMerkleTreeDigest.fromValue(rootValue.value).field;
  const selectedCommitment = commitments[selectedIndex];
  const selectedNonce = nonces[selectedIndex];
  if (!selectedCommitment || !selectedNonce) throw new Error('Selected sample commitment is missing');

  const rawPath = tree.pathForLeaf(BigInt(selectedIndex), alignedBytes32(selectedCommitment));
  const merklePath = new CompactTypeMerkleTreePath(MERKLE_TREE_DEPTH, bytes32Type).fromValue(rawPath.value);
  const timestamps = records.map((record) => Date.parse(record.timestamp));
  const periodStartMs = Math.min(...timestamps);
  const periodEndMs = Math.max(...timestamps);
  const deviceHash = await sha256(deviceId);
  const deviceNonce = await createNonce(options.nonceSeed, records.length);
  const deviceCommitment = persistentCommit(bytes32Type, deviceHash, deviceNonce);
  const root = datasetRoot.toString();

  return {
    publicData: {
      datasetRoot: root,
      merkleRoot: fieldToHex(datasetRoot),
      deviceCommitment: bytesToHex(deviceCommitment),
      periodStart: new Date(periodStartMs).toISOString(),
      periodEnd: new Date(periodEndMs).toISOString(),
      periodStartEpoch: BigInt(Math.floor(periodStartMs / 1000)).toString(),
      periodEndEpoch: BigInt(Math.floor(periodEndMs / 1000)).toString(),
      sampleCount: records.length,
      thresholdMin,
      thresholdMax,
      schemaVersion: DATASET_SCHEMA_VERSION,
    },
    privateData: {
      datasetId: `dataset-${fieldToHex(datasetRoot).slice(0, 16)}`,
      datasetRoot: root,
      deviceId,
      samples: [...records],
      selectedIndex,
      selectedNonceHex: bytesToHex(selectedNonce),
      merklePath: serializeMerklePath(merklePath),
    },
  };
}

export function verifyPreparedDatasetLocally(dataset: PreparedDataset): boolean {
  const selected = dataset.privateData.samples[dataset.privateData.selectedIndex];
  if (!selected) return false;
  const nonce = hexToBytes(dataset.privateData.selectedNonceHex);
  const commitment = persistentCommit(compactSensorLeafType, toCompactSensorLeaf(selected), nonce);
  const path = deserializeMerklePath(dataset.privateData.merklePath);
  if (bytesToHex(commitment) !== bytesToHex(path.leaf)) return false;
  if (calculateMerklePathRoot(path).toString() !== dataset.publicData.datasetRoot) return false;
  return selected.temperature >= dataset.publicData.thresholdMin &&
    selected.temperature <= dataset.publicData.thresholdMax;
}
