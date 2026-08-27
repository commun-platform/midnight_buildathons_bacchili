import {
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

export const MERKLE_TREE_DEPTH = 11;
export const TEMPERATURE_OFFSET_CENTI = 10_000;
export const DATASET_SCHEMA_VERSION = 1;

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
  schemaVersion: number;
}

export interface PrivateDataset {
  datasetId: string;
  datasetRoot: string;
  deviceId: string;
  samples: SensorRecord[];
  threshold: {
    min: number;
    max: number;
  };
  selectedIndex: number;
  selectedNonceHex: string;
  merklePath: SerializedMerklePath;
}

export interface PreparedDataset {
  publicData: PublicDatasetCommitment;
  privateData: PrivateDataset;
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
  const encoded = Math.round(value * 100) + TEMPERATURE_OFFSET_CENTI;
  if (encoded < 0) throw new Error('Temperature is below the supported range');
  return BigInt(encoded);
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
      schemaVersion: DATASET_SCHEMA_VERSION,
    },
    privateData: {
      datasetId: `dataset-${fieldToHex(datasetRoot).slice(0, 16)}`,
      datasetRoot: root,
      deviceId,
      samples: [...records],
      threshold: { min: thresholdMin, max: thresholdMax },
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
  return selected.temperature >= dataset.privateData.threshold.min &&
    selected.temperature <= dataset.privateData.threshold.max;
}
