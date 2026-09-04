import {
  operationalPeriodStart,
  type OperationalDayBoundary,
} from '@midnight-demo/shared/operational-day';
import { encodeTemperature } from '@midnight-demo/shared/temperature';
import type { SensorRecord } from '@midnight-demo/shared';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const credentialAad = encoder.encode('managed-source-credential:v1');
const reservedQueryParameters = new Set(['sourceId', 'from', 'to']);
const blockedHostnameSuffixes = ['.internal', '.local', '.localhost'];
const maximumSamples = 2_000;

export type ManagedFailureKind = 'retryable' | 'action-required';

export class ManagedSourceError extends Error {
  constructor(
    readonly code: string,
    readonly kind: ManagedFailureKind,
    message: string,
    readonly httpStatus: number | null = null,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ManagedSourceError';
  }
}

export interface ConnectorCredentialEnvelope {
  version: 1;
  algorithm: 'AES-GCM-256';
  iv: string;
  ciphertext: string;
}

export interface FixedWindowMeasurement {
  id: string;
  recordedAt: string;
  value: number;
}

export interface HourlyMeasurementSummary {
  hourIndex: number;
  periodStart: string;
  periodEnd: string;
  sampleCount: number;
  minimum: number | null;
  maximum: number | null;
  average: number | null;
}

export interface FixedWindowFetchResult {
  records: SensorRecord[];
  summaries: HourlyMeasurementSummary[];
  responseBytes: number;
  httpStatus: number;
}

export interface FixedWindowFetchInput {
  endpointUrl: string;
  sourceSensorId: string;
  bearerToken: string;
  deviceId: string;
  sensorType: 'temperature';
  unit: '°C';
  periodStart: string;
  periodEnd: string;
  responseMaxBytes: number;
  timeoutMs?: number;
}

export type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('Base64URL value is invalid');
  const padded = value.replace(/-/gu, '+').replace(/_/gu, '/')
    + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function keyBytes(value: string): Uint8Array {
  const normalized = value.trim();
  if (/^(?:[0-9a-f]{2}){32}$/u.test(normalized)) {
    return Uint8Array.from(normalized.match(/.{2}/gu) ?? [], (pair) => Number.parseInt(pair, 16));
  }
  const decoded = base64UrlDecode(normalized);
  if (decoded.byteLength !== 32) throw new Error('Managed credential key must contain 32 bytes');
  return decoded;
}

async function credentialKey(value: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', keyBytes(value), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptConnectorCredential(
  bearerToken: string,
  encryptionKey: string,
): Promise<string> {
  const normalized = bearerToken.trim();
  if (!normalized || normalized.length > 4_096) throw new Error('Bearer credential is invalid');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: credentialAad },
    await credentialKey(encryptionKey),
    encoder.encode(normalized),
  );
  return JSON.stringify({
    version: 1,
    algorithm: 'AES-GCM-256',
    iv: base64UrlEncode(iv),
    ciphertext: base64UrlEncode(new Uint8Array(encrypted)),
  } satisfies ConnectorCredentialEnvelope);
}

export async function decryptConnectorCredential(
  serializedEnvelope: string,
  encryptionKey: string,
): Promise<string> {
  let value: unknown;
  try {
    value = JSON.parse(serializedEnvelope);
  } catch {
    throw new Error('Managed credential envelope is invalid');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Managed credential envelope is invalid');
  }
  const envelope = value as Partial<ConnectorCredentialEnvelope>;
  if (
    envelope.version !== 1
    || envelope.algorithm !== 'AES-GCM-256'
    || typeof envelope.iv !== 'string'
    || typeof envelope.ciphertext !== 'string'
  ) throw new Error('Managed credential envelope is invalid');
  const iv = base64UrlDecode(envelope.iv);
  if (iv.byteLength !== 12) throw new Error('Managed credential envelope IV is invalid');
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: credentialAad },
    await credentialKey(encryptionKey),
    base64UrlDecode(envelope.ciphertext),
  );
  return decoder.decode(decrypted);
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/u.test(part))) return false;
  const values = parts.map(Number);
  if (values.some((value) => value < 0 || value > 255)) return true;
  const [first = 0, second = 0] = values;
  return first === 0
    || first === 10
    || first === 127
    || first >= 224
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 100 && second >= 64 && second <= 127);
}

function isBlockedIpv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[/u, '').replace(/\]$/u, '').toLowerCase();
  if (!normalized.includes(':')) return false;
  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/u.test(normalized)
    || normalized.startsWith('ff');
}

export function validateManagedEndpoint(value: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error('Endpoint URL is invalid');
  }
  const hostname = endpoint.hostname.toLowerCase();
  if (
    endpoint.protocol !== 'https:'
    || endpoint.username
    || endpoint.password
    || endpoint.hash
    || (endpoint.port && endpoint.port !== '443')
    || hostname === 'localhost'
    || blockedHostnameSuffixes.some((suffix) => hostname.endsWith(suffix))
    || isPrivateIpv4(hostname)
    || isBlockedIpv6(hostname)
  ) throw new Error('Endpoint must be a public HTTPS URL');
  for (const name of reservedQueryParameters) {
    if (endpoint.searchParams.has(name)) {
      throw new Error(`Endpoint must not define the reserved ${name} query parameter`);
    }
  }
  endpoint.searchParams.sort();
  return endpoint.toString();
}

export function requireManagedIdentifier(value: unknown, label: string, maximum = 160): string {
  if (typeof value !== 'string') throw new Error(`${label} is invalid`);
  const normalized = value.trim();
  if (normalized.length > maximum || !identifierPattern.test(normalized)) {
    throw new Error(`${label} is invalid`);
  }
  return normalized;
}

export function requirePeriodDate(value: unknown): string {
  if (typeof value !== 'string' || !datePattern.test(value)) {
    throw new Error('periodDate must be YYYY-MM-DD');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('periodDate is invalid');
  }
  return value;
}

export function fixedOperationalWindow(
  periodDate: string,
  boundary: OperationalDayBoundary,
): { periodStart: string; periodEnd: string } {
  const start = operationalPeriodStart(requirePeriodDate(periodDate), boundary);
  return {
    periodStart: start.toISOString(),
    periodEnd: new Date(start.valueOf() + 86_400_000).toISOString(),
  };
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function managedMeasurementGroupKey(measurementGroupId: string): Promise<string> {
  if (!identifierPattern.test(measurementGroupId)) {
    throw new Error('Managed measurementGroupId is invalid');
  }
  return sha256Hex(`vsp:measurement-group:v1\n${measurementGroupId}`);
}

export async function managedSourceIdentifiers(
  projectId: string,
  sourceId: string,
  policyId: string,
  periodDate?: string,
): Promise<{
  deviceId: string;
  assignmentId: string;
  runId?: string;
  proofJobId?: string;
  measurementGroupId?: string;
}> {
  const sourceDigest = await sha256Hex(`managed-source:v1\n${projectId}\n${sourceId}`);
  const assignmentDigest = await sha256Hex(
    `managed-assignment:v1\n${projectId}\n${sourceId}\n${policyId}`,
  );
  const base = {
    deviceId: `managed-${sourceDigest}`,
    assignmentId: `managed-assignment-${assignmentDigest}`,
  };
  if (!periodDate) return base;
  const runDigest = await sha256Hex(`managed-run:v1\n${projectId}\n${sourceId}\n${periodDate}`);
  return {
    ...base,
    runId: `managed-run-${runDigest}`,
    proofJobId: `proof-${runDigest}`,
    measurementGroupId: `managed:${sourceDigest.slice(0, 32)}:${periodDate}`,
  };
}

function retryAfterSeconds(response: Response): number | null {
  const value = response.headers.get('Retry-After')?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1, Math.min(3_600, Math.ceil(seconds)));
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.max(1, Math.min(3_600, Math.ceil((date - Date.now()) / 1_000)));
}

function httpFailure(response: Response): ManagedSourceError {
  const status = response.status;
  if ([408, 425, 429].includes(status) || status >= 500) {
    return new ManagedSourceError(
      `source_http_${status}`,
      'retryable',
      `Source API temporarily returned HTTP ${status}`,
      status,
      retryAfterSeconds(response),
    );
  }
  const code = status === 401 || status === 403
    ? 'source_authentication_failed'
    : status === 404
      ? 'source_not_found'
      : status >= 300 && status < 400
        ? 'source_redirect_rejected'
        : `source_http_${status}`;
  return new ManagedSourceError(
    code,
    'action-required',
    `Source API request was rejected with HTTP ${status}`,
    status,
  );
}

async function boundedBody(response: Response, maximumBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel();
    throw new ManagedSourceError(
      'source_response_too_large',
      'action-required',
      'Source API response exceeds the configured byte limit',
      response.status,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      throw new ManagedSourceError(
        'source_response_too_large',
        'action-required',
        'Source API response exceeds the configured byte limit',
        response.status,
      );
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function actionRequired(code: string, message: string, status = 200): never {
  throw new ManagedSourceError(code, 'action-required', message, status);
}

function parseSourceResponse(
  body: Uint8Array,
  input: FixedWindowFetchInput,
): FixedWindowMeasurement[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(body));
  } catch {
    return actionRequired('source_invalid_json', 'Source API returned invalid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return actionRequired('source_invalid_schema', 'Source API response must be a JSON object');
  }
  const value = parsed as Record<string, unknown>;
  if (value.schemaVersion !== 1) {
    return actionRequired('source_schema_unsupported', 'Source API schemaVersion must be 1');
  }
  if (value.sourceId !== input.sourceSensorId) {
    return actionRequired('source_identity_mismatch', 'Source API echoed a different sourceId');
  }
  if (value.sensorType !== input.sensorType || value.unit !== input.unit) {
    return actionRequired('source_metadata_mismatch', 'Source API sensor type or unit does not match');
  }
  if (value.from !== input.periodStart || value.to !== input.periodEnd) {
    return actionRequired('source_range_mismatch', 'Source API echoed a different time range');
  }
  if (!Array.isArray(value.measurements)) {
    return actionRequired('source_invalid_schema', 'Source API measurements must be an array');
  }
  if (value.measurements.length > maximumSamples) {
    return actionRequired('source_sample_limit_exceeded', 'Source API returned too many samples');
  }
  const start = Date.parse(input.periodStart);
  const end = Date.parse(input.periodEnd);
  const unique = new Map<string, FixedWindowMeasurement>();
  for (const candidate of value.measurements) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return actionRequired('source_invalid_sample', 'Source API returned an invalid measurement');
    }
    const measurement = candidate as Record<string, unknown>;
    const id = typeof measurement.id === 'string' ? measurement.id.trim() : '';
    const recordedAt = typeof measurement.recordedAt === 'string' ? measurement.recordedAt : '';
    const recordedEpoch = Date.parse(recordedAt);
    const sampleValue = measurement.value;
    if (!identifierPattern.test(id)) {
      return actionRequired('source_invalid_sample_id', 'Source API returned an invalid measurement ID');
    }
    if (!Number.isFinite(recordedEpoch) || recordedEpoch < start || recordedEpoch >= end) {
      return actionRequired('source_timestamp_outside_window', 'Source measurement is outside the requested window');
    }
    if (typeof sampleValue !== 'number' || !Number.isFinite(sampleValue)) {
      return actionRequired('source_invalid_value', 'Source measurement value must be finite');
    }
    try {
      encodeTemperature(sampleValue);
    } catch {
      return actionRequired('source_invalid_value', 'Source measurement value is outside the supported range');
    }
    const normalized = { id, recordedAt, value: sampleValue };
    const previous = unique.get(id);
    if (previous) {
      if (previous.recordedAt !== normalized.recordedAt || previous.value !== normalized.value) {
        return actionRequired('source_conflicting_duplicate', 'Source API returned a conflicting measurement ID');
      }
      continue;
    }
    unique.set(id, normalized);
  }
  return [...unique.values()].sort((left, right) => (
    Date.parse(left.recordedAt) - Date.parse(right.recordedAt) || left.id.localeCompare(right.id)
  ));
}

function summarize(
  measurements: readonly FixedWindowMeasurement[],
  periodStart: string,
): HourlyMeasurementSummary[] {
  const start = Date.parse(periodStart);
  const accumulators = Array.from({ length: 24 }, () => ({
    count: 0,
    minimum: Number.POSITIVE_INFINITY,
    maximum: Number.NEGATIVE_INFINITY,
    sum: 0,
  }));
  for (const measurement of measurements) {
    const hour = Math.floor((Date.parse(measurement.recordedAt) - start) / 3_600_000);
    const accumulator = accumulators[hour];
    if (!accumulator) throw new Error('Measurement hour is outside the fixed daily window');
    accumulator.count += 1;
    accumulator.minimum = Math.min(accumulator.minimum, measurement.value);
    accumulator.maximum = Math.max(accumulator.maximum, measurement.value);
    accumulator.sum += measurement.value;
  }
  return accumulators.map((accumulator, hourIndex) => ({
    hourIndex,
    periodStart: new Date(start + hourIndex * 3_600_000).toISOString(),
    periodEnd: new Date(start + (hourIndex + 1) * 3_600_000).toISOString(),
    sampleCount: accumulator.count,
    minimum: accumulator.count === 0 ? null : accumulator.minimum,
    maximum: accumulator.count === 0 ? null : accumulator.maximum,
    average: accumulator.count === 0 ? null : accumulator.sum / accumulator.count,
  }));
}

export async function fetchFixedWindowMeasurements(
  input: FixedWindowFetchInput,
  fetchImplementation: FetchImplementation = fetch,
): Promise<FixedWindowFetchResult> {
  const endpoint = new URL(validateManagedEndpoint(input.endpointUrl));
  const start = Date.parse(input.periodStart);
  const end = Date.parse(input.periodEnd);
  if (!Number.isFinite(start) || end - start !== 86_400_000) {
    throw new Error('Managed source interval must be exactly 24 hours');
  }
  if (
    !Number.isSafeInteger(input.responseMaxBytes)
    || input.responseMaxBytes < 1_024
    || input.responseMaxBytes > 4 * 1_024 * 1_024
  ) throw new Error('Managed source response byte limit is invalid');
  endpoint.searchParams.set('sourceId', input.sourceSensorId);
  endpoint.searchParams.set('from', input.periodStart);
  endpoint.searchParams.set('to', input.periodEnd);
  let response: Response;
  try {
    response = await fetchImplementation(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${input.bearerToken}`,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(input.timeoutMs ?? 15_000),
    });
  } catch (error) {
    throw new ManagedSourceError(
      error instanceof Error && error.name === 'TimeoutError'
        ? 'source_request_timeout'
        : 'source_network_unavailable',
      'retryable',
      error instanceof Error && error.name === 'TimeoutError'
        ? 'Source API request timed out'
        : 'Source API could not be reached',
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw httpFailure(response);
  }
  const body = await boundedBody(response, input.responseMaxBytes);
  const measurements = parseSourceResponse(body, input);
  return {
    records: measurements.map((measurement) => ({
      deviceId: input.deviceId,
      timestamp: measurement.recordedAt,
      temperature: measurement.value,
      humidity: 0,
    })),
    summaries: summarize(measurements, input.periodStart),
    responseBytes: body.byteLength,
    httpStatus: response.status,
  };
}
