import { applyDeviceRateLimits, authorizeDeviceRequest } from './device-auth.js';
import { admitProofJobForBrowserDevice } from './jobs.js';
import { authorizeLocalAdministrator } from './admin-auth.js';
import type { ProofJobRow } from './jobs.js';
import { readSponsorQuota } from './sponsor-quota.js';
import { createSqlDatabase } from './storage/index.js';
import {
  operationalPeriodStart,
  utcDayStartMinute,
  validateOperationalDayBoundary,
} from '@midnight-demo/shared/operational-day';

const maxBodyBytes = 64 * 1024;

interface DeviceRow {
  id: string;
  project_id: string;
  sensor_type: string;
  unit: string;
  threshold_policy_version: string;
  midnight_device_commitment: string;
  midnight_device_authority: string;
  midnight_registry_status: 'registered';
  midnight_registration_version: number;
  midnight_contract_address: string;
  midnight_registered_tx_id: string;
  midnight_authority_tx_id: string;
}

interface MeasurementWindowRow {
  batch_id: string;
  project_id: string;
  device_id: string;
  sensor_type: string;
  unit: string;
  period_start: string;
  period_end: string;
  sample_count: number;
  minimum: number;
  maximum: number;
  average: number;
  commitment: string;
  threshold_policy_version: string;
  received_at: string;
}

interface AnomalyEventRow {
  event_id: string;
  project_id: string;
  device_id: string;
  sensor_type: string;
  unit: string;
  transition: 'anomaly_open' | 'recovered';
  occurred_at: string;
  threshold_policy_version: string;
  received_at: string;
}

interface Wave1ProjectRow {
  id: string;
  name: string;
  name_ja: string | null;
  organization: string;
  organization_ja: string | null;
  timezone: string;
}

interface Wave1DeviceRow {
  id: string;
  project_id: string;
  sensor_type: string;
  unit: string;
  threshold_policy_version: string;
  name: string;
  name_ja: string | null;
  last_seen_at: string | null;
  midnight_device_commitment: string | null;
  midnight_device_authority: string | null;
  midnight_registry_status: 'unregistered' | 'registered' | 'disabled';
  midnight_registration_version: number | null;
  midnight_contract_address: string | null;
}

interface RegisteredPolicyAssignmentRow {
  assignment_id: string;
  assignment_key: string;
  valid_from: string | null;
  valid_until: string | null;
  assignment_version: number;
  time_zone_offset_minutes: number;
  local_day_start_hour: number;
  utc_day_start_minute: number;
  device_commitment: string;
  policy_id: string;
  policy_key: string;
  mode: 'closed-range' | 'upper-bound' | 'lower-bound';
  minimum: number | null;
  maximum: number | null;
  value_scale: number;
  sensor_type_code: number;
  unit_code: number;
  policy_version: number;
}

interface DeviceConfigurationRow extends RegisteredPolicyAssignmentRow {
  device_id: string;
  project_id: string;
  sensor_type: string;
  unit: string;
  midnight_registration_version: number;
  midnight_contract_address: string;
  midnight_registered_tx_id: string;
  midnight_authority_tx_id: string;
  operation_configuration_version: number;
  operation_configuration_updated_at: string;
  policy_registered_tx_id: string;
  assignment_registered_tx_id: string;
  provisioning_wallet_key_sha256: string | null;
}

interface PublicProofRow extends ProofJobRow {
  mode: 'closed-range' | 'upper-bound' | 'lower-bound';
  minimum: number | null;
  maximum: number | null;
  value_scale: number;
  sensor_type: string;
  unit: string;
  policy_version: number;
  assignment_version: number;
  time_zone_offset_minutes: number;
  local_day_start_hour: number;
  utc_day_start_minute: number;
  valid_from: string | null;
  valid_until: string | null;
}

type HourThresholdResult = 'no-data' | 'within-threshold' | 'outside-threshold';

interface ThresholdPolicyRow {
  policy_id: string;
  mode: 'closed-range' | 'upper-bound' | 'lower-bound';
  minimum: number | null;
  maximum: number | null;
  value_scale: number;
  sensor_type: string;
  unit: string;
  policy_version: number;
  status: 'registered' | 'retired';
}

interface CompletedProvisioningOperationRow {
  created_at: string;
  updated_at: string;
}

const deferredProvisioningContinuationMilliseconds = 6 * 60 * 60 * 1000;

export function deferredProvisioningCreatedAt(
  operation: CompletedProvisioningOperationRow | null,
  previousProofCount: number,
  now: Date,
): string {
  if (
    !operation
    || !Number.isFinite(Date.parse(operation.created_at))
    || !Number.isFinite(Date.parse(operation.updated_at))
    || now.valueOf() - Date.parse(operation.updated_at) > deferredProvisioningContinuationMilliseconds
    || Date.parse(operation.updated_at) > now.valueOf() + 5 * 60_000
  ) throw new Error('Deferred Proof request is not linked to a recent completed Device registration');
  if (previousProofCount > 0) {
    throw new Error('Deferred Device registration continuation was already used');
  }
  return operation.created_at;
}

function json(status: number, value: unknown): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > maxBodyBytes) throw new Error('Request body is too large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Request body is required');
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBodyBytes) throw new Error('Request body is too large');
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Request body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, key: string, max = 256): string {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`${key} must be a non-empty string up to ${max} characters`);
  }
  return value.trim();
}

export function requiredBlockHeight(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,14})$/u.test(value)) {
    throw new Error('blockHeight must be a non-negative decimal integer');
  }
  if (!Number.isSafeInteger(Number(value))) {
    throw new Error('blockHeight must be a safe integer');
  }
  return value;
}

function identifier(body: Record<string, unknown>, key: string): string {
  const value = requiredString(body, key, 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(value)) {
    throw new Error(`${key} contains unsupported characters`);
  }
  return value;
}

function optionalIdentifier(body: Record<string, unknown>, key: string): string | null {
  return body[key] === undefined ? null : identifier(body, key);
}

function finiteNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} must be finite`);
  return value;
}

function positiveInteger(body: Record<string, unknown>, key: string, maximum = 1_000_000): number {
  const value = body[key];
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > maximum) {
    throw new Error(`${key} must be a positive integer up to ${maximum}`);
  }
  return Number(value);
}

function nonnegativeInteger(body: Record<string, unknown>, key: string, maximum = 1_000_000): number {
  const value = body[key];
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw new Error(`${key} must be a non-negative integer up to ${maximum}`);
  }
  return Number(value);
}

function signedInteger(
  body: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
): number {
  const value = body[key];
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${key} must be an integer from ${minimum} through ${maximum}`);
  }
  return Number(value);
}

function requiredBoolean(body: Record<string, unknown>, key: string): boolean {
  const value = body[key];
  if (typeof value !== 'boolean') throw new Error(`${key} must be a boolean`);
  return value;
}

function hourPresence(body: Record<string, unknown>): { values: boolean[]; encoded: string } {
  const value = body.hourPresence;
  if (
    !Array.isArray(value)
    || value.length !== 24
    || value.some((entry) => typeof entry !== 'boolean')
  ) throw new Error('hourPresence must contain exactly 24 booleans');
  const values = value as boolean[];
  return {
    values,
    encoded: values.map((entry) => entry ? '1' : '0').join(''),
  };
}

function hourThresholdResults(
  body: Record<string, unknown>,
): { values: HourThresholdResult[]; encoded: string } {
  const value = body.hourResults;
  const allowed = new Set<HourThresholdResult>([
    'no-data',
    'within-threshold',
    'outside-threshold',
  ]);
  if (
    !Array.isArray(value)
    || value.length !== 24
    || value.some((entry) => typeof entry !== 'string' || !allowed.has(entry as HourThresholdResult))
  ) throw new Error('hourResults must contain exactly 24 hourly threshold results');
  const values = value as HourThresholdResult[];
  return {
    values,
    encoded: values.map((entry) => entry === 'no-data' ? '0' : entry === 'within-threshold' ? '1' : '2').join(''),
  };
}

function decodedHourResults(value: string | null | undefined): HourThresholdResult[] | null {
  if (typeof value !== 'string' || value.length !== 24 || /[^012]/u.test(value)) return null;
  return [...value].map((entry) => entry === '0'
    ? 'no-data'
    : entry === '1'
      ? 'within-threshold'
      : 'outside-threshold');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isoDate(body: Record<string, unknown>, key: string): string {
  const value = requiredString(body, key, 64);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new Error(`${key} must be an ISO-8601 timestamp`);
  return parsed.toISOString();
}

function publicCommitment(body: Record<string, unknown>, key: string): string {
  const value = requiredString(body, key, 256);
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error(`${key} has an unsupported format`);
  return value;
}

async function registeredDevice(
  env: Env,
  deviceId: string,
  projectId: string,
): Promise<DeviceRow | null> {
  return createSqlDatabase(env).first<DeviceRow>(
    `SELECT id, project_id, sensor_type, unit, threshold_policy_version,
            midnight_device_commitment, midnight_device_authority,
            midnight_registry_status, midnight_registration_version,
            midnight_contract_address, midnight_registered_tx_id,
            midnight_authority_tx_id
     FROM devices
     WHERE id = ?1 AND project_id = ?2
       AND midnight_registry_status = 'registered'
       AND midnight_device_commitment IS NOT NULL
       AND midnight_device_authority IS NOT NULL
       AND midnight_registration_version IS NOT NULL
       AND midnight_contract_address IS NOT NULL
       AND midnight_registered_tx_id IS NOT NULL
       AND midnight_authority_tx_id IS NOT NULL`,
    [deviceId, projectId],
  );
}

function midnightNetwork(value: string | undefined): 'preview' | 'preprod' | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (normalized === 'preview' || normalized === 'midnight preview') return 'preview';
  if (normalized === 'preprod' || normalized === 'midnight preprod') return 'preprod';
  return null;
}

function normalizedContractAddress(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/^0x/iu, '').toLowerCase() ?? '';
  return /^(?:[0-9a-f]{2}){32}$/u.test(normalized) ? normalized : null;
}

async function deviceConfiguration(request: Request, env: Env): Promise<Response> {
  const authorization = await authorizeDeviceRequest(request, env, 'configuration:read');
  if (!authorization.ok) return authorization.response;
  if (!(await applyDeviceRateLimits(env.API_RATE_LIMITER, request, authorization.principal))) {
    return json(429, { error: 'Device configuration API rate limit exceeded' });
  }
  const network = midnightNetwork(env.PUBLIC_MIDNIGHT_NETWORK);
  const configuredAddress = normalizedContractAddress(
    env.PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS,
  );
  if (!network || !configuredAddress) {
    return json(503, { error: 'Operational configuration is not available' });
  }
  try {
    const now = new Date().toISOString();
    const row = await createSqlDatabase(env).first<DeviceConfigurationRow>(
      `SELECT
         d.id AS device_id, d.project_id, d.sensor_type, d.unit,
         d.midnight_registration_version, d.midnight_contract_address,
         d.midnight_registered_tx_id, d.midnight_authority_tx_id,
         d.operation_configuration_version, d.operation_configuration_updated_at,
         w.wallet_key_sha256 AS provisioning_wallet_key_sha256,
         a.assignment_id, a.assignment_key, a.valid_from, a.valid_until,
         a.time_zone_offset_minutes, a.local_day_start_hour, a.utc_day_start_minute,
         a.assignment_version, a.device_commitment,
         a.registered_tx_id AS assignment_registered_tx_id,
         p.policy_id, p.policy_key, p.mode, p.minimum, p.maximum,
         p.value_scale, p.sensor_type_code, p.unit_code, p.policy_version,
         p.registered_tx_id AS policy_registered_tx_id
       FROM devices d
       LEFT JOIN browser_wallet_devices w
         ON w.device_id = d.id
        AND w.project_id = d.project_id
        AND w.status = 'registered'
       JOIN policy_assignments a
         ON a.device_id = d.id
        AND a.project_id = d.project_id
        AND a.device_commitment = d.midnight_device_commitment
        AND a.status = 'registered'
       JOIN project_policies pp
         ON pp.project_id = d.project_id
        AND pp.policy_id = a.policy_id
       JOIN threshold_policies p
         ON p.policy_id = a.policy_id
        AND p.policy_id = d.threshold_policy_version
        AND p.sensor_type = d.sensor_type
        AND p.unit = d.unit
        AND p.status = 'registered'
       WHERE d.id = ?1 AND d.project_id = ?2
         AND d.midnight_registry_status = 'registered'
         AND d.midnight_registration_version IS NOT NULL
         AND d.midnight_registered_tx_id IS NOT NULL
         AND d.midnight_authority_tx_id IS NOT NULL
         AND d.operation_configuration_updated_at IS NOT NULL
         AND a.registered_tx_id IS NOT NULL
         AND p.registered_tx_id IS NOT NULL
         AND a.contract_address = d.midnight_contract_address
         AND p.contract_address = d.midnight_contract_address
         AND (a.valid_from IS NULL OR a.valid_from <= ?3)
         AND (a.valid_until IS NULL OR a.valid_until > ?3)
       ORDER BY a.assignment_version DESC, a.registered_at DESC
       LIMIT 1`,
      [authorization.principal.deviceId, authorization.principal.projectId, now],
    );
    if (
      !row
      || normalizedContractAddress(row.midnight_contract_address) !== configuredAddress
    ) return json(409, { error: 'Device operational configuration is not synchronized' });
    return json(200, {
      schemaVersion: 2,
      configurationVersion: row.operation_configuration_version,
      updatedAt: row.operation_configuration_updated_at,
      device: {
        deviceId: row.device_id,
        projectId: row.project_id,
        sensorType: row.sensor_type,
        unit: row.unit,
        commitment: row.device_commitment,
        provisioningWalletKeySha256: row.provisioning_wallet_key_sha256,
      },
      midnight: {
        network,
        contractAddress: configuredAddress,
        contractSchemaVersion: 5,
        registrationVersion: row.midnight_registration_version,
      },
      policy: {
        id: row.policy_id,
        key: row.policy_key,
        mode: row.mode,
        minimum: row.minimum,
        maximum: row.maximum,
        valueScale: row.value_scale,
        sensorTypeCode: row.sensor_type_code,
        unitCode: row.unit_code,
        version: row.policy_version,
      },
      assignment: {
        id: row.assignment_id,
        key: row.assignment_key,
        version: row.assignment_version,
        timeZoneOffsetMinutes: row.time_zone_offset_minutes,
        localDayStartHour: row.local_day_start_hour,
        utcDayStartMinute: row.utc_day_start_minute,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
      },
      evidence: {
        deviceRegisteredTxId: row.midnight_registered_tx_id,
        deviceAuthorityTxId: row.midnight_authority_tx_id,
        policyRegisteredTxId: row.policy_registered_tx_id,
        assignmentRegisteredTxId: row.assignment_registered_tx_id,
      },
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'device_configuration_lookup_failed',
      message: errorMessage(error),
    }));
    return json(503, { error: 'Device operational configuration is unavailable' });
  }
}

function measurementWindowView(row: MeasurementWindowRow) {
  return {
    batchId: row.batch_id,
    projectId: row.project_id,
    deviceId: row.device_id,
    sensorType: row.sensor_type,
    unit: row.unit,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    count: row.sample_count,
    minimum: row.minimum,
    maximum: row.maximum,
    average: row.average,
    commitment: row.commitment,
    thresholdPolicyVersion: row.threshold_policy_version,
    receivedAt: row.received_at,
  };
}

function anomalyEventView(row: AnomalyEventRow) {
  return {
    eventId: row.event_id,
    projectId: row.project_id,
    deviceId: row.device_id,
    sensorType: row.sensor_type,
    unit: row.unit,
    transition: row.transition,
    occurredAt: row.occurred_at,
    thresholdPolicyVersion: row.threshold_policy_version,
    receivedAt: row.received_at,
  };
}

export function proofJobView(row: ProofJobRow) {
  const sponsorStageUpdatedAt = row.sponsor_stage_updated_at ?? null;
  const sponsorStageAgeSeconds = sponsorStageUpdatedAt === null
    ? null
    : Math.max(0, Math.floor((Date.now() - Date.parse(sponsorStageUpdatedAt)) / 1_000));
  const interruptedRetryAt = row.sponsor_stage === 'interrupted' && row.sponsor_lease_expires_at
    ? new Date(Date.parse(row.sponsor_lease_expires_at) - 4 * 60_000).toISOString()
    : null;
  return {
    proofJobId: row.id,
    projectId: row.project_id,
    deviceId: row.device_id,
    periodDate: row.period_date,
    measurementGroupId: row.measurement_group_id,
    attestationCommitment: row.attestation_commitment,
    deviceCommitment: row.device_commitment,
    sampleCount: row.sample_count,
    thresholdPolicyVersion: row.threshold_policy_version,
    policyKey: row.policy_key,
    assignmentId: row.assignment_id,
    assignmentKey: row.assignment_key,
    hourPresence: [...row.hour_presence].map((value) => value === '1'),
    hourResults: decodedHourResults(row.hour_results),
    observedHourCount: row.observed_hour_count,
    stoppedHourCount: 24 - row.observed_hour_count,
    thresholdSatisfied: row.threshold_satisfied === 1,
    schemaVersion: row.schema_version,
    circuitVersion: row.circuit_version,
    status: row.status,
    attemptCount: row.attempt_count,
    availableAfter: row.available_after,
    leaseExpiresAt: row.lease_expires_at,
    proofGeneratedAt: row.proof_generated_at,
    deviceTransactionHash: row.device_transaction_hash,
    deviceTransactionBytes: row.device_transaction_bytes,
    sponsorTransactionId: row.sponsor_transaction_id,
    sponsorFeeSpecks: row.sponsor_fee_specks,
    sponsorTransactionBytes: row.sponsor_transaction_bytes,
    sponsorAttemptCount: row.sponsor_attempt_count,
    sponsorStage: row.sponsor_stage ?? null,
    sponsorReasonCode: row.sponsor_reason_code ?? null,
    sponsorStageUpdatedAt,
    sponsorStageAgeSeconds,
    sponsorNextRetryAt: row.status === 'sponsor_retryable'
      ? row.sponsor_available_after
      : interruptedRetryAt,
    sponsorLeaseExpiresAt: row.sponsor_lease_expires_at,
    sponsorStalled: row.sponsor_stage === 'interrupted'
      || (row.status === 'sponsoring' && sponsorStageAgeSeconds !== null
        && sponsorStageAgeSeconds >= 15 * 60),
    sponsorshipStartedAt: row.sponsorship_started_at,
    sponsorshipCompletedAt: row.sponsorship_completed_at,
    attestTxId: row.attest_tx_id,
    attestTxHash: row.attest_tx_hash,
    blockHeight: row.block_height,
    errorCode: row.last_error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ingestMeasurementWindow(request: Request, env: Env): Promise<Response> {
  const authorization = await authorizeDeviceRequest(request, env, 'measurement:write');
  if (!authorization.ok) return authorization.response;
  if (!(await applyDeviceRateLimits(env.API_RATE_LIMITER, request, authorization.principal))) {
    return json(429, { error: 'Measurement API rate limit exceeded' });
  }
  try {
    const body = await readJson(request);
    const batchId = identifier(body, 'batchId');
    const projectId = identifier(body, 'projectId');
    const deviceId = identifier(body, 'deviceId');
    if (projectId !== authorization.principal.projectId || deviceId !== authorization.principal.deviceId) {
      return json(403, { error: 'Device Session does not match the measurement window' });
    }
    const sensorType = requiredString(body, 'sensorType', 64);
    const unit = requiredString(body, 'unit', 24);
    const periodStart = isoDate(body, 'periodStart');
    const periodEnd = isoDate(body, 'periodEnd');
    const duration = Date.parse(periodEnd) - Date.parse(periodStart);
    if (duration <= 0 || duration > 90 * 60 * 1000) {
      throw new Error('Measurement window must be positive and no longer than 90 minutes');
    }
    if (Date.parse(periodEnd) > Date.now() + 5 * 60 * 1000) throw new Error('periodEnd is too far in the future');
    const count = positiveInteger(body, 'count');
    const minimum = finiteNumber(body, 'minimum');
    const maximum = finiteNumber(body, 'maximum');
    const average = finiteNumber(body, 'average');
    if (minimum > average || average > maximum) throw new Error('Expected minimum <= average <= maximum');
    const commitment = publicCommitment(body, 'commitment');
    const thresholdPolicyVersion = requiredString(body, 'thresholdPolicyVersion', 80);
    const device = await registeredDevice(env, deviceId, projectId);
    if (!device) return json(404, { error: 'Device not found' });
    if (
      sensorType !== device.sensor_type
      || unit !== device.unit
      || thresholdPolicyVersion !== device.threshold_policy_version
    ) return json(400, { error: 'Sensor metadata or threshold policy does not match the device' });
    const database = createSqlDatabase(env);
    const receivedAt = new Date().toISOString();
    const changes = await database.execute(
      `INSERT OR IGNORE INTO measurement_windows (
         batch_id, project_id, device_id, sensor_type, unit, period_start, period_end,
         sample_count, minimum, maximum, average, commitment,
         threshold_policy_version, received_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
      [
        batchId, projectId, deviceId, sensorType, unit, periodStart, periodEnd,
        count, minimum, maximum, average, commitment, thresholdPolicyVersion, receivedAt,
      ],
    );
    if (changes === 0) {
      const existing = await database.first<MeasurementWindowRow>(
        'SELECT * FROM measurement_windows WHERE batch_id = ?1',
        [batchId],
      );
      if (!existing || existing.device_id !== deviceId || existing.project_id !== projectId) {
        return json(409, { error: 'batchId conflicts with another measurement window' });
      }
      return json(200, { accepted: true, idempotent: true, window: measurementWindowView(existing) });
    }
    await database.execute('UPDATE devices SET last_seen_at = ?1 WHERE id = ?2', [receivedAt, deviceId]);
    return json(202, {
      accepted: true,
      idempotent: false,
      window: measurementWindowView({
        batch_id: batchId,
        project_id: projectId,
        device_id: deviceId,
        sensor_type: sensorType,
        unit,
        period_start: periodStart,
        period_end: periodEnd,
        sample_count: count,
        minimum,
        maximum,
        average,
        commitment,
        threshold_policy_version: thresholdPolicyVersion,
        received_at: receivedAt,
      }),
    });
  } catch (error) {
    return json(400, { error: errorMessage(error) });
  }
}

async function ingestAnomalyEvent(request: Request, env: Env): Promise<Response> {
  const authorization = await authorizeDeviceRequest(request, env, 'anomaly:write');
  if (!authorization.ok) return authorization.response;
  if (!(await applyDeviceRateLimits(env.API_RATE_LIMITER, request, authorization.principal))) {
    return json(429, { error: 'Anomaly API rate limit exceeded' });
  }
  try {
    const body = await readJson(request);
    const eventId = identifier(body, 'eventId');
    const projectId = identifier(body, 'projectId');
    const deviceId = identifier(body, 'deviceId');
    if (projectId !== authorization.principal.projectId || deviceId !== authorization.principal.deviceId) {
      return json(403, { error: 'Device Session does not match the anomaly event' });
    }
    const sensorType = requiredString(body, 'sensorType', 64);
    const unit = requiredString(body, 'unit', 24);
    const transition = requiredString(body, 'transition', 32);
    if (transition !== 'anomaly_open' && transition !== 'recovered') {
      throw new Error('transition must be anomaly_open or recovered');
    }
    const occurredAt = isoDate(body, 'occurredAt');
    if (Date.parse(occurredAt) > Date.now() + 5 * 60 * 1000) throw new Error('occurredAt is too far in the future');
    const thresholdPolicyVersion = requiredString(body, 'thresholdPolicyVersion', 80);
    const device = await registeredDevice(env, deviceId, projectId);
    if (!device) return json(404, { error: 'Device not found' });
    if (
      sensorType !== device.sensor_type
      || unit !== device.unit
      || thresholdPolicyVersion !== device.threshold_policy_version
    ) return json(400, { error: 'Sensor metadata or threshold policy does not match the device' });
    const database = createSqlDatabase(env);
    const existing = await database.first<AnomalyEventRow>(
      'SELECT * FROM anomaly_events WHERE event_id = ?1',
      [eventId],
    );
    if (existing) {
      if (existing.device_id !== deviceId || existing.project_id !== projectId) {
        return json(409, { error: 'eventId conflicts with another anomaly event' });
      }
      return json(200, { accepted: true, idempotent: true, event: anomalyEventView(existing) });
    }
    const state = await database.first<{ state: string }>(
      'SELECT state FROM anomaly_states WHERE device_id = ?1',
      [deviceId],
    );
    const currentState = state?.state ?? 'normal';
    if (
      (transition === 'anomaly_open' && currentState !== 'normal')
      || (transition === 'recovered' && currentState !== 'anomaly_open')
    ) return json(409, { error: 'Anomaly transition does not match the current state' });
    const receivedAt = new Date().toISOString();
    const nextState = transition === 'anomaly_open' ? 'anomaly_open' : 'normal';
    await database.batch([
      {
        sql: `INSERT INTO anomaly_events (
           event_id, project_id, device_id, sensor_type, unit, transition,
           occurred_at, threshold_policy_version, received_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
        parameters: [
          eventId, projectId, deviceId, sensorType, unit, transition,
          occurredAt, thresholdPolicyVersion, receivedAt,
        ],
      },
      {
        sql: `INSERT INTO anomaly_states (device_id, project_id, state, last_event_id, changed_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(device_id) DO UPDATE SET
           state = excluded.state,
           last_event_id = excluded.last_event_id,
           changed_at = excluded.changed_at`,
        parameters: [deviceId, projectId, nextState, eventId, occurredAt],
      },
      {
        sql: 'UPDATE devices SET last_seen_at = ?1 WHERE id = ?2',
        parameters: [receivedAt, deviceId],
      },
    ]);
    return json(202, {
      accepted: true,
      idempotent: false,
      state: nextState,
      event: anomalyEventView({
        event_id: eventId,
        project_id: projectId,
        device_id: deviceId,
        sensor_type: sensorType,
        unit,
        transition,
        occurred_at: occurredAt,
        threshold_policy_version: thresholdPolicyVersion,
        received_at: receivedAt,
      }),
    });
  } catch (error) {
    return json(400, { error: errorMessage(error) });
  }
}

async function deferredProofCreatedAt(
  database: ReturnType<typeof createSqlDatabase>,
  operationId: string | null,
  proofJobId: string,
  deviceId: string,
  projectId: string,
  policyId: string,
  now: Date,
): Promise<string> {
  if (!operationId) return now.toISOString();
  const existing = await database.first<{ id: string }>(
    'SELECT id FROM daily_proof_jobs WHERE id = ?1',
    [proofJobId],
  );
  if (existing) return now.toISOString();
  const operation = await database.first<CompletedProvisioningOperationRow>(
    `SELECT created_at, updated_at
     FROM browser_provisioning_operations
     WHERE id = ?1 AND device_id = ?2 AND project_id = ?3 AND policy_id = ?4
       AND status = 'registered' AND stage = 'completed'`,
    [operationId, deviceId, projectId, policyId],
  );
  const previous = await database.first<{ proof_count: number }>(
    `SELECT COUNT(*) AS proof_count FROM daily_proof_jobs
     WHERE device_id = ?1 AND project_id = ?2 AND created_at = ?3`,
    [deviceId, projectId, operation?.created_at ?? ''],
  );
  return deferredProvisioningCreatedAt(operation, previous?.proof_count ?? 0, now);
}

async function createProofJob(request: Request, env: Env): Promise<Response> {
  const authorization = await authorizeDeviceRequest(request, env, 'proof:request');
  if (!authorization.ok) return authorization.response;
  if (!(await applyDeviceRateLimits(env.API_RATE_LIMITER, request, authorization.principal))) {
    return json(429, { error: 'Proof Job API rate limit exceeded' });
  }
  try {
    const body = await readJson(request);
    const forbiddenThresholdFields = [
      'minimum', 'maximum', 'thresholdMinimum', 'thresholdMaximum',
      'thresholdMin', 'thresholdMax',
    ];
    if (forbiddenThresholdFields.some((field) => field in body)) {
      throw new Error('Proof Jobs must not supply threshold bounds; use the registered Midnight policy');
    }
    const proofJobId = identifier(body, 'proofJobId');
    const projectId = identifier(body, 'projectId');
    const deviceId = identifier(body, 'deviceId');
    if (projectId !== authorization.principal.projectId || deviceId !== authorization.principal.deviceId) {
      return json(403, { error: 'Device Session does not match the Proof Job' });
    }
    const periodDate = requiredString(body, 'periodDate', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(periodDate)) throw new Error('periodDate must be YYYY-MM-DD');
    const measurementGroupId = publicCommitment(body, 'measurementGroupId');
    const attestationCommitment = publicCommitment(body, 'attestationCommitment');
    const deviceCommitment = publicCommitment(body, 'deviceCommitment');
    const sampleCount = nonnegativeInteger(body, 'sampleCount');
    const thresholdPolicyVersion = requiredString(body, 'thresholdPolicyVersion', 80);
    const deferredProvisioningOperationId = optionalIdentifier(
      body,
      'deferredProvisioningOperationId',
    );
    const policyKey = publicCommitment(body, 'policyKey');
    const assignmentId = identifier(body, 'assignmentId');
    const assignmentKey = publicCommitment(body, 'assignmentKey');
    const measurementDay = nonnegativeInteger(body, 'measurementDay', 0xffff_ffff);
    const submittedTimeZoneOffsetMinutes = signedInteger(
      body,
      'timeZoneOffsetMinutes',
      -840,
      840,
    );
    const submittedLocalDayStartHour = nonnegativeInteger(body, 'localDayStartHour', 23);
    const submittedUtcDayStartMinute = nonnegativeInteger(body, 'utcDayStartMinute', 1439);
    const presence = hourPresence(body);
    const hourlyResults = hourThresholdResults(body);
    const observedHourCount = nonnegativeInteger(body, 'observedHourCount', 24);
    const thresholdSatisfied = requiredBoolean(body, 'thresholdSatisfied');
    const schemaVersion = positiveInteger(body, 'schemaVersion', 65_535);
    const circuitVersion = positiveInteger(body, 'circuitVersion', 65_535);
    if (schemaVersion !== 7 || circuitVersion !== 5) {
      throw new Error('Unsupported daily attestation schema or circuit version');
    }
    if (presence.values.filter(Boolean).length !== observedHourCount) {
      throw new Error('observedHourCount does not match hourPresence');
    }
    if (hourlyResults.values.some((result, index) => (
      (result === 'no-data') === presence.values[index]
    ))) throw new Error('hourResults does not match hourPresence');
    if (thresholdSatisfied === hourlyResults.values.includes('outside-threshold')) {
      throw new Error('thresholdSatisfied does not match hourResults');
    }
    const device = await registeredDevice(env, deviceId, projectId);
    if (!device) return json(404, { error: 'Device not found' });
    if (thresholdPolicyVersion !== device.threshold_policy_version) {
      return json(400, { error: 'Threshold policy does not match the device' });
    }
    const database = createSqlDatabase(env);
    const assignment = await database.first<RegisteredPolicyAssignmentRow>(
      `SELECT
         a.assignment_id, a.assignment_key, a.valid_from, a.valid_until, a.assignment_version,
         a.device_commitment, a.time_zone_offset_minutes, a.local_day_start_hour,
         a.utc_day_start_minute,
         p.policy_id, p.policy_key, p.mode, p.minimum, p.maximum, p.value_scale,
         p.sensor_type_code, p.unit_code, p.policy_version
       FROM policy_assignments a
       JOIN threshold_policies p ON p.policy_id = a.policy_id
       WHERE a.assignment_id = ?1 AND a.assignment_key = ?2
         AND a.device_id = ?3 AND a.project_id = ?4
         AND a.status = 'registered' AND p.status = 'registered'
         AND a.contract_address = ?5 AND p.contract_address = ?5`,
      [assignmentId, assignmentKey, deviceId, projectId, device.midnight_contract_address],
    );
    if (
      !assignment
      || assignment.policy_id !== thresholdPolicyVersion
      || assignment.policy_key !== policyKey
      || assignment.device_commitment !== device.midnight_device_commitment
      || assignment.time_zone_offset_minutes !== submittedTimeZoneOffsetMinutes
      || assignment.local_day_start_hour !== submittedLocalDayStartHour
      || assignment.utc_day_start_minute !== submittedUtcDayStartMinute
    ) return json(400, { error: 'Registered on-chain policy assignment does not match the Proof Job' });
    const expectedDeviceCommitment = await sha256Hex(`vsp:sensor-device:v1\n${deviceId}`);
    if (
      deviceCommitment !== expectedDeviceCommitment
      || deviceCommitment !== device.midnight_device_commitment
    ) {
      return json(400, { error: 'Device commitment does not match the authenticated device' });
    }
    const boundary = validateOperationalDayBoundary({
      timeZoneOffsetMinutes: assignment.time_zone_offset_minutes,
      localDayStartHour: assignment.local_day_start_hour,
    });
    if (utcDayStartMinute(boundary) !== assignment.utc_day_start_minute) {
      return json(500, { error: 'Registered policy assignment has an inconsistent day boundary' });
    }
    const periodStart = operationalPeriodStart(periodDate, boundary).valueOf();
    const periodEnd = periodStart + 86_400_000;
    if (
      !Number.isFinite(periodStart)
      || measurementDay !== Math.floor(periodStart / 86_400_000)
      || (assignment.valid_from && periodStart < Date.parse(assignment.valid_from))
      || (assignment.valid_until && periodEnd > Date.parse(assignment.valid_until))
    ) return json(400, { error: 'Proof period is outside the registered policy assignment' });
    const now = new Date();
    // Scheduling is applied by the daily processing cutoff. `available_after`
    // is reserved for retry backoff and starts at the admission time.
    const availableAfter = now.toISOString();
    const createdAt = await deferredProofCreatedAt(
      database,
      deferredProvisioningOperationId,
      proofJobId,
      deviceId,
      projectId,
      thresholdPolicyVersion,
      now,
    );
    const changes = await database.execute(
      `INSERT OR IGNORE INTO daily_proof_jobs (
         id, project_id, device_id, period_date, contract_address, measurement_group_id,
         attestation_commitment, device_commitment,
         sample_count, threshold_policy_version, policy_key, assignment_id, assignment_key,
         hour_presence, hour_results, observed_hour_count, threshold_satisfied, schema_version, circuit_version,
         status, attempt_count, available_after, sponsor_available_after, created_at, updated_at
       ) VALUES (
         ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
         ?16, ?17, ?18, ?19, 'pending', 0, ?20, ?20, ?21, ?21
       )`,
      [
        proofJobId, projectId, deviceId, periodDate,
        device.midnight_contract_address, measurementGroupId,
        attestationCommitment, deviceCommitment, sampleCount, thresholdPolicyVersion, policyKey,
        assignmentId, assignmentKey, presence.encoded, hourlyResults.encoded, observedHourCount,
        thresholdSatisfied ? 1 : 0, schemaVersion, circuitVersion, availableAfter, createdAt,
      ],
    );
    const job = await database.first<ProofJobRow>(
      'SELECT * FROM daily_proof_jobs WHERE id = ?1',
      [proofJobId],
    );
    if (
      !job
      || job.device_id !== deviceId
      || job.project_id !== projectId
      || job.period_date !== periodDate
      || job.contract_address !== device.midnight_contract_address
      || job.measurement_group_id !== measurementGroupId
      || job.attestation_commitment !== attestationCommitment
      || job.device_commitment !== deviceCommitment
      || job.sample_count !== sampleCount
      || job.threshold_policy_version !== thresholdPolicyVersion
      || job.policy_key !== policyKey
      || job.assignment_id !== assignmentId
      || job.assignment_key !== assignmentKey
      || job.hour_presence !== presence.encoded
      || job.hour_results !== hourlyResults.encoded
      || job.observed_hour_count !== observedHourCount
      || job.threshold_satisfied !== (thresholdSatisfied ? 1 : 0)
      || job.schema_version !== schemaVersion
      || job.circuit_version !== circuitVersion
    ) {
      return json(409, { error: 'proofJobId conflicts with another Proof Job' });
    }
    return json(changes > 0 ? 202 : 200, {
      accepted: true,
      idempotent: changes === 0,
      job: proofJobView(job),
    });
  } catch (error) {
    return json(400, { error: errorMessage(error) });
  }
}

async function getProofJob(request: Request, env: Env, proofJobId: string): Promise<Response> {
  const authorization = await authorizeDeviceRequest(request, env, 'proof:read');
  if (!authorization.ok) return authorization.response;
  const job = await createSqlDatabase(env).first<ProofJobRow>(
    'SELECT * FROM daily_proof_jobs WHERE id = ?1 AND device_id = ?2 AND project_id = ?3',
    [proofJobId, authorization.principal.deviceId, authorization.principal.projectId],
  );
  if (!job) return json(404, { error: 'Proof Job not found' });
  return json(200, { job: proofJobView(job) });
}

async function deviceHistory(request: Request, env: Env): Promise<Response> {
  const authorization = await authorizeDeviceRequest(request, env, 'device:status');
  if (!authorization.ok) return authorization.response;
  if (!(await applyDeviceRateLimits(env.API_RATE_LIMITER, request, authorization.principal))) {
    return json(429, { error: 'Device history API rate limit exceeded' });
  }
  const database = createSqlDatabase(env);
  const [windows, proofJobs] = await Promise.all([
    database.all<MeasurementWindowRow>(
      `SELECT * FROM measurement_windows
       WHERE device_id = ?1 AND project_id = ?2
       ORDER BY period_start DESC LIMIT 2160`,
      [authorization.principal.deviceId, authorization.principal.projectId],
    ),
    database.all<ProofJobRow>(
      `SELECT * FROM daily_proof_jobs
       WHERE device_id = ?1 AND project_id = ?2
       ORDER BY period_date DESC, created_at DESC LIMIT 100`,
      [authorization.principal.deviceId, authorization.principal.projectId],
    ),
  ]);
  return json(200, {
    windows: windows.map(measurementWindowView),
    proofJobs: proofJobs.map(proofJobView),
  });
}

async function deviceAdministratorDashboard(request: Request, env: Env): Promise<Response> {
  const authorization = await authorizeDeviceRequest(request, env, 'device:status');
  if (!authorization.ok) return authorization.response;
  if (!(await applyDeviceRateLimits(env.API_RATE_LIMITER, request, authorization.principal))) {
    return json(429, { error: 'Device administrator API rate limit exceeded' });
  }
  const { deviceId, projectId: authorizedProjectId } = authorization.principal;
  const database = createSqlDatabase(env);
  const project = await database.first<Wave1ProjectRow>(
    `SELECT id, name, name_ja, organization, organization_ja, timezone
     FROM projects WHERE id = ?1`,
    [authorizedProjectId],
  );
  if (!project) return json(404, { error: 'Project not found' });
  const [devices, windows, anomalies, proofJobs, policies, activeKey, anomalyState] = await Promise.all([
    database.all<Wave1DeviceRow>(
      `SELECT id, project_id, sensor_type, unit, threshold_policy_version,
              midnight_device_commitment, midnight_device_authority,
              midnight_registry_status, midnight_registration_version,
              midnight_contract_address, name, name_ja, last_seen_at
       FROM devices WHERE id = ?1 AND project_id = ?2`,
      [deviceId, authorizedProjectId],
    ),
    database.all<MeasurementWindowRow>(
      `SELECT * FROM measurement_windows
       WHERE device_id = ?1 AND project_id = ?2
       ORDER BY period_start DESC LIMIT 2160`,
      [deviceId, authorizedProjectId],
    ),
    database.all<AnomalyEventRow>(
      `SELECT * FROM anomaly_events
       WHERE device_id = ?1 AND project_id = ?2
       ORDER BY occurred_at DESC LIMIT 100`,
      [deviceId, authorizedProjectId],
    ),
    database.all<ProofJobRow>(
      `SELECT * FROM daily_proof_jobs
       WHERE device_id = ?1 AND project_id = ?2
       ORDER BY created_at DESC LIMIT 50`,
      [deviceId, authorizedProjectId],
    ),
    database.all<ThresholdPolicyRow>(
      `SELECT DISTINCT p.policy_id, p.mode, p.minimum, p.maximum, p.value_scale,
              p.sensor_type, p.unit, p.policy_version, p.status
       FROM threshold_policies p
       JOIN policy_assignments a
         ON a.policy_id = p.policy_id
       JOIN devices d
         ON d.id = a.device_id AND d.project_id = a.project_id
       WHERE a.device_id = ?1 AND a.project_id = ?2 AND p.project_id = a.project_id
         AND a.status = 'registered'
         AND a.contract_address = d.midnight_contract_address
         AND p.contract_address = d.midnight_contract_address
       ORDER BY p.policy_version DESC`,
      [deviceId, authorizedProjectId],
    ),
    database.first<{ active_count: number }>(
      `SELECT COUNT(*) AS active_count FROM device_auth_keys
       WHERE device_id = ?1 AND project_id = ?2 AND status = 'active'`,
      [deviceId, authorizedProjectId],
    ),
    database.first<{ state: string; changed_at: string }>(
      `SELECT state, changed_at FROM anomaly_states
       WHERE device_id = ?1 AND project_id = ?2`,
      [deviceId, authorizedProjectId],
    ),
  ]);
  const device = devices[0];
  if (!device || devices.length !== 1) return json(404, { error: 'Device not found' });
  const latestJob = proofJobs[0] ?? null;
  return json(200, {
    source: `${database.kind} / authenticated Device`,
    project: {
      id: project.id,
      name: project.name,
      nameJa: project.name_ja,
      organization: project.organization,
      organizationJa: project.organization_ja,
      timezone: project.timezone,
    },
    devices: devices.map((device) => ({
      id: device.id,
      name: device.name,
      nameJa: device.name_ja,
      sensorType: device.sensor_type,
      unit: device.unit,
      thresholdPolicyVersion: device.threshold_policy_version,
      midnightDeviceCommitment: device.midnight_device_commitment,
      midnightRegistryStatus: device.midnight_registry_status,
      midnightRegistrationVersion: device.midnight_registration_version,
      midnightContractAddress: device.midnight_contract_address,
      lastSeenAt: device.last_seen_at,
    })),
    windows: windows.map(measurementWindowView),
    anomalies: anomalies.map(anomalyEventView),
    anomalyState: anomalyState ? {
      state: anomalyState.state,
      changedAt: anomalyState.changed_at,
    } : null,
    proofJobs: proofJobs.map(proofJobView),
    policies: policies.map((policy) => ({
      policyId: policy.policy_id,
      mode: policy.mode,
      minimum: policy.minimum,
      maximum: policy.maximum,
      valueScale: policy.value_scale,
      sensorType: policy.sensor_type,
      unit: policy.unit,
      version: policy.policy_version,
      status: policy.status,
    })),
    stepper: {
      deviceRegistered: (activeKey?.active_count ?? 0) > 0
        && device.midnight_registry_status === 'registered',
      hourlyDataReceived: windows.length > 0,
      anomalyStateAvailable: Boolean(anomalyState),
      proofRequested: Boolean(latestJob),
      proofGenerated: Boolean(latestJob && [
        'proof_ready', 'device_bound', 'sponsoring', 'sponsored', 'submitted', 'confirmed',
      ].includes(latestJob.status)),
      midnightConfirmed: latestJob?.status === 'confirmed',
    },
  });
}

async function deviceSponsorQuota(request: Request, env: Env): Promise<Response> {
  const authorization = await authorizeDeviceRequest(request, env, 'transaction:submit');
  if (!authorization.ok) return authorization.response;
  if (!(await applyDeviceRateLimits(env.API_RATE_LIMITER, request, authorization.principal))) {
    return json(429, { error: 'Sponsor quota API rate limit exceeded' });
  }
  try {
    const sponsorQuota = await readSponsorQuota(createSqlDatabase(env), {
      deviceId: authorization.principal.deviceId,
      projectId: authorization.principal.projectId,
    });
    return json(200, { sponsorQuota });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'sponsor_quota_lookup_failed',
      message: errorMessage(error),
    }));
    return json(503, { error: 'Sponsor quota is unavailable' });
  }
}

async function reportProofJobResult(
  request: Request,
  env: Env,
  proofJobId: string,
): Promise<Response> {
  const authorization = await authorizeDeviceRequest(request, env, 'transaction:submit');
  if (!authorization.ok) return authorization.response;
  if (!(await applyDeviceRateLimits(env.API_RATE_LIMITER, request, authorization.principal))) {
    return json(429, { error: 'Proof result API rate limit exceeded' });
  }
  try {
    const body = await readJson(request);
    const phase = requiredString(body, 'phase', 16);
    const database = createSqlDatabase(env);
    const job = await database.first<ProofJobRow>(
      'SELECT * FROM daily_proof_jobs WHERE id = ?1 AND device_id = ?2 AND project_id = ?3',
      [proofJobId, authorization.principal.deviceId, authorization.principal.projectId],
    );
    if (!job) return json(404, { error: 'Proof Job not found' });

    if (phase === 'failed') {
      const failureCode = requiredString(body, 'errorCode', 64);
      if (failureCode !== 'measurement_group_already_attested') {
        return json(400, { error: 'Unsupported Proof Job failure code' });
      }
      const idempotent = job.status === 'dead_lettered'
        && job.last_error_code === failureCode;
      if (!idempotent) {
        const closed = await database.execute(
          `UPDATE daily_proof_jobs SET status = 'dead_lettered',
             lease_expires_at = NULL, last_error_code = ?1, updated_at = ?2
           WHERE id = ?3 AND status IN ('ready_for_input', 'proving', 'proof_ready')`,
          [failureCode, new Date().toISOString(), job.id],
        );
        if (closed !== 1) {
          return json(409, { error: 'Proof Job is not accepting this failure result' });
        }
      }
      const current = await database.first<ProofJobRow>(
        'SELECT * FROM daily_proof_jobs WHERE id = ?1',
        [job.id],
      );
      return json(200, { accepted: true, idempotent, job: current ? proofJobView(current) : null });
    }

    if (phase !== 'attest') throw new Error('phase must be attest or failed');
    const txId = requiredString(body, 'txId', 256);
    const txHashValue = body.txHash;
    const txHash = txHashValue === null || txHashValue === undefined
      ? null
      : requiredString(body, 'txHash', 256);
    const blockHeight = requiredBlockHeight(body.blockHeight);
    const proofGeneratedAt = body.proofGeneratedAt === null || body.proofGeneratedAt === undefined
      ? null
      : isoDate(body, 'proofGeneratedAt');

    if (!job.attest_tx_id || job.attest_tx_id !== txId) {
      return json(409, { error: 'Proof Job already has another attestation transaction' });
    }
    if (txHash !== null && job.attest_tx_hash !== txHash) {
      return json(409, { error: 'Attestation transaction hash does not match the sponsored transaction' });
    }
    const idempotent = job.attest_tx_id === txId && job.status === 'confirmed';
    if (!idempotent) {
      if (job.status !== 'submitted') {
        return json(409, { error: 'Proof Job is not accepting an attestation result' });
      }
      const confirmed = await database.execute(
        `UPDATE daily_proof_jobs SET block_height = ?1, proof_generated_at = COALESCE(proof_generated_at, ?2),
           status = 'confirmed', lease_expires_at = NULL, last_error_code = NULL, updated_at = ?3
         WHERE id = ?4 AND status = 'submitted' AND attest_tx_id = ?5`,
        [blockHeight, proofGeneratedAt, new Date().toISOString(), job.id, txId],
      );
      if (confirmed !== 1) {
        return json(409, { error: 'Proof Job changed before confirmation was recorded' });
      }
      const sponsorArtifact = job.sponsor_transaction_object_key;
      if (sponsorArtifact) await env.SPONSOR_STATE.delete(sponsorArtifact).catch((error) => {
        console.error(JSON.stringify({
          message: 'sponsor_transaction_artifact_cleanup_failed',
          proofJobId: job.id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        }));
      });
    }
    const current = await database.first<ProofJobRow>(
      'SELECT * FROM daily_proof_jobs WHERE id = ?1',
      [job.id],
    );
    return json(200, { accepted: true, idempotent, job: current ? proofJobView(current) : null });
  } catch (error) {
    return json(400, { error: errorMessage(error) });
  }
}

async function listMeasurementWindows(
  request: Request,
  env: Env,
  projectId: string,
  url: URL,
): Promise<Response> {
  const denied = authorizeLocalAdministrator(request);
  if (denied) return denied;
  const deviceId = url.searchParams.get('device');
  const parameters: string[] = [projectId];
  let condition = 'project_id = ?1';
  if (deviceId) {
    parameters.push(deviceId);
    condition += ' AND device_id = ?2';
  }
  const rows = await createSqlDatabase(env).all<MeasurementWindowRow>(
    `SELECT * FROM measurement_windows WHERE ${condition} ORDER BY period_start DESC LIMIT 2160`,
    parameters,
  );
  return json(200, { windows: rows.map(measurementWindowView) });
}

async function listAnomalyEvents(
  request: Request,
  env: Env,
  projectId: string,
  url: URL,
): Promise<Response> {
  const denied = authorizeLocalAdministrator(request);
  if (denied) return denied;
  const deviceId = url.searchParams.get('device');
  const parameters: string[] = [projectId];
  let condition = 'project_id = ?1';
  if (deviceId) {
    parameters.push(deviceId);
    condition += ' AND device_id = ?2';
  }
  const rows = await createSqlDatabase(env).all<AnomalyEventRow>(
    `SELECT * FROM anomaly_events WHERE ${condition} ORDER BY occurred_at DESC LIMIT 200`,
    parameters,
  );
  return json(200, { events: rows.map(anomalyEventView) });
}

async function administratorDashboard(
  request: Request,
  env: Env,
  projectId: string,
): Promise<Response> {
  const denied = authorizeLocalAdministrator(request);
  if (denied) return denied;
  const database = createSqlDatabase(env);
  const project = await database.first<Wave1ProjectRow>(
    `SELECT id, name, name_ja, organization, organization_ja, timezone
     FROM projects WHERE id = ?1`,
    [projectId],
  );
  if (!project) return json(404, { error: 'Project not found' });
  const [devices, windows, anomalies, proofJobs, policies, activeKey, anomalyState] = await Promise.all([
    database.all<Wave1DeviceRow>(
      `SELECT id, project_id, sensor_type, unit, threshold_policy_version,
              midnight_device_commitment, midnight_device_authority,
              midnight_registry_status, midnight_registration_version,
              midnight_contract_address, name, name_ja, last_seen_at
       FROM devices WHERE project_id = ?1 ORDER BY name`,
      [projectId],
    ),
    database.all<MeasurementWindowRow>(
      `SELECT * FROM measurement_windows WHERE project_id = ?1
       ORDER BY period_start DESC LIMIT 2160`,
      [projectId],
    ),
    database.all<AnomalyEventRow>(
      `SELECT * FROM anomaly_events WHERE project_id = ?1
       ORDER BY occurred_at DESC LIMIT 100`,
      [projectId],
    ),
    database.all<ProofJobRow>(
      `SELECT * FROM daily_proof_jobs WHERE project_id = ?1
       ORDER BY created_at DESC LIMIT 50`,
      [projectId],
    ),
    database.all<ThresholdPolicyRow>(
      `SELECT p.policy_id, p.mode, p.minimum, p.maximum, p.value_scale,
              p.sensor_type, p.unit, p.policy_version, p.status
       FROM threshold_policies p
       JOIN project_policies pp ON pp.policy_id = p.policy_id
       WHERE pp.project_id = ?1 ORDER BY p.policy_version DESC`,
      [projectId],
    ),
    database.first<{ active_count: number }>(
      `SELECT COUNT(*) AS active_count FROM device_auth_keys
       WHERE project_id = ?1 AND status = 'active'`,
      [projectId],
    ),
    database.first<{ state_count: number }>(
      `SELECT COUNT(*) AS state_count FROM anomaly_states
       WHERE project_id = ?1`,
      [projectId],
    ),
  ]);
  const latestJob = proofJobs[0] ?? null;
  return json(200, {
    source: database.kind,
    project: {
      id: project.id,
      name: project.name,
      nameJa: project.name_ja,
      organization: project.organization,
      organizationJa: project.organization_ja,
      timezone: project.timezone,
    },
    devices: devices.map((device) => ({
      id: device.id,
      name: device.name,
      nameJa: device.name_ja,
      sensorType: device.sensor_type,
      unit: device.unit,
      thresholdPolicyVersion: device.threshold_policy_version,
      midnightDeviceCommitment: device.midnight_device_commitment,
      midnightRegistryStatus: device.midnight_registry_status,
      midnightRegistrationVersion: device.midnight_registration_version,
      midnightContractAddress: device.midnight_contract_address,
      lastSeenAt: device.last_seen_at,
    })),
    windows: windows.map(measurementWindowView),
    anomalies: anomalies.map(anomalyEventView),
    proofJobs: proofJobs.map(proofJobView),
    policies: policies.map((policy) => ({
      policyId: policy.policy_id,
      mode: policy.mode,
      minimum: policy.minimum,
      maximum: policy.maximum,
      valueScale: policy.value_scale,
      sensorType: policy.sensor_type,
      unit: policy.unit,
      version: policy.policy_version,
      status: policy.status,
    })),
    stepper: {
      deviceRegistered: (activeKey?.active_count ?? 0) > 0
        && devices.some((device) => device.midnight_registry_status === 'registered'),
      hourlyDataReceived: windows.length > 0,
      anomalyStateAvailable: (anomalyState?.state_count ?? 0) > 0,
      proofRequested: Boolean(latestJob),
      proofGenerated: Boolean(latestJob && [
        'proof_ready', 'device_bound', 'sponsoring', 'sponsored', 'submitted', 'confirmed',
      ].includes(latestJob.status)),
      midnightConfirmed: latestJob?.status === 'confirmed',
    },
  });
}

async function publicProof(env: Env, proofJobId: string): Promise<Response> {
  const row = await createSqlDatabase(env).first<PublicProofRow>(
    `SELECT
       j.*,
       p.mode, p.minimum, p.maximum, p.value_scale, p.sensor_type, p.unit,
       p.policy_version, a.assignment_version, a.valid_from, a.valid_until,
       a.time_zone_offset_minutes, a.local_day_start_hour, a.utc_day_start_minute
     FROM daily_proof_jobs j
     JOIN threshold_policies p ON p.policy_key = j.policy_key
     JOIN policy_assignments a ON a.assignment_key = j.assignment_key
       AND a.policy_id = p.policy_id
       AND a.device_id = j.device_id
       AND a.project_id = j.project_id
     WHERE j.id = ?1
       AND j.status = 'confirmed'
       AND j.attest_tx_id IS NOT NULL
       AND j.attest_tx_hash IS NOT NULL
       AND j.block_height IS NOT NULL`,
    [proofJobId],
  );
  if (!row) return json(404, { error: 'Public Proof record not found' });
  const confirmed = row.status === 'confirmed' && Boolean(row.attest_tx_id);
  const jobAddress = row.contract_address?.trim() ?? '';
  const contractAddress = /^[a-f\d]{64}$/iu.test(jobAddress.replace(/^0x/iu, ''))
    ? jobAddress.replace(/^0x/iu, '')
    : null;
  const thresholdSatisfied = row.threshold_satisfied === 1;
  const hourResults = decodedHourResults(row.hour_results);
  const hourlyResultsAvailable = hourResults !== null
    && row.schema_version === 7
    && row.circuit_version === 5;
  const thresholdResult = row.observed_hour_count === 0
    ? 'stopped'
    : thresholdSatisfied ? 'within-threshold' : 'outside-threshold';
  const verifiedClaim = hourResults === null
    ? 'This legacy record contains only the aggregate daily threshold result; hourly results are unavailable.'
    : thresholdResult === 'stopped'
    ? 'No hourly extrema were submitted for this day; all 24 hours are reported as NO DATA.'
    : 'Each operational-hour slot is publicly reported as WITHIN, OUTSIDE, or NO DATA under the registered threshold; the sensor values remain private.';
  const verifiedClaimJa = hourResults === null
    ? 'この旧形式の記録には日次の集約判定しかなく、時間帯別の判定結果は確認できません。'
    : thresholdResult === 'stopped'
    ? 'この日は時間別の最小値・最大値が提出されておらず、24時間すべてが計測なしとして記録されています。'
    : '運用日の各時間帯について、登録済みしきい値に対する「閾値以内・範囲外・計測なし」を公開しています。センサー値自体は非公開です。';
  return json(200, {
    proofJobId: row.id,
    periodDate: row.period_date,
    deviceCommitment: row.device_commitment,
    sampleCount: row.sample_count,
    observedHourCount: row.observed_hour_count,
    stoppedHourCount: 24 - row.observed_hour_count,
    thresholdSatisfied,
    thresholdResult,
    resultVerified: confirmed,
    hourlyResultsAvailable,
    hourPresence: [...row.hour_presence].map((value) => value === '1'),
    hourResults,
    thresholdPolicyVersion: row.threshold_policy_version,
    policyKey: row.policy_key,
    policy: {
      mode: row.mode,
      minimum: row.minimum,
      maximum: row.maximum,
      valueScale: row.value_scale,
      sensorType: row.sensor_type,
      unit: row.unit,
      version: row.policy_version,
    },
    assignmentKey: row.assignment_key,
    assignmentVersion: row.assignment_version,
    assignmentValidFrom: row.valid_from,
    assignmentValidUntil: row.valid_until,
    operationalDay: {
      timeZoneOffsetMinutes: row.time_zone_offset_minutes,
      localDayStartHour: row.local_day_start_hour,
      utcDayStartMinute: row.utc_day_start_minute,
    },
    measurementGroupId: row.measurement_group_id,
    attestationCommitment: row.attestation_commitment,
    schemaVersion: row.schema_version,
    circuitVersion: row.circuit_version,
    status: row.status,
    claim: confirmed
      ? verifiedClaim
      : 'This threshold result is not verified until the Midnight transaction is confirmed.',
    claimJa: confirmed
      ? verifiedClaimJa
      : 'MidnightのTransactionがConfirmedになるまで、このしきい値結果は検証済みではありません。',
    checks: {
      dailyAttestationRecorded: confirmed,
      committedHourlyExtrema: confirmed,
      attestationVerified: confirmed,
      midnightConfirmed: confirmed,
    },
    transactions: {
      attest: row.attest_tx_id ? {
        txId: row.attest_tx_id,
        txHash: row.attest_tx_hash,
        blockHeight: row.block_height,
      } : null,
    },
    network: env.PUBLIC_MIDNIGHT_NETWORK?.trim() || 'Midnight network',
    contractAddress,
    privacy: {
      hourlyExtrema: 'private',
      nonce: 'private',
      thresholdPolicy: 'public-on-ledger',
    },
  });
}

async function listPublicProofs(env: Env, url: URL): Promise<Response> {
  const requestedLimit = Number(url.searchParams.get('limit') ?? 50);
  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.max(1, Math.min(100, requestedLimit))
    : 50;
  const rows = await createSqlDatabase(env).all<PublicProofRow>(
    `SELECT
       j.*,
       p.mode, p.minimum, p.maximum, p.value_scale, p.sensor_type, p.unit,
       p.policy_version, a.assignment_version, a.valid_from, a.valid_until,
       a.time_zone_offset_minutes, a.local_day_start_hour, a.utc_day_start_minute
     FROM daily_proof_jobs j
     JOIN threshold_policies p ON p.policy_key = j.policy_key
     JOIN policy_assignments a ON a.assignment_key = j.assignment_key
       AND a.policy_id = p.policy_id
       AND a.device_id = j.device_id
       AND a.project_id = j.project_id
     WHERE j.status = 'confirmed'
       AND j.attest_tx_id IS NOT NULL
       AND j.attest_tx_hash IS NOT NULL
       AND j.block_height IS NOT NULL
     ORDER BY j.period_date DESC, j.created_at DESC
     LIMIT ${limit}`,
  );
  return json(200, {
    proofs: rows.map((row) => ({
      proofJobId: row.id,
      periodDate: row.period_date,
      sampleCount: row.sample_count,
      observedHourCount: row.observed_hour_count,
      stoppedHourCount: 24 - row.observed_hour_count,
      hourResults: decodedHourResults(row.hour_results),
      thresholdSatisfied: row.threshold_satisfied === 1,
      thresholdResult: row.observed_hour_count === 0
        ? 'stopped'
        : row.threshold_satisfied === 1 ? 'within-threshold' : 'outside-threshold',
      thresholdPolicyVersion: row.threshold_policy_version,
      operationalDay: {
        timeZoneOffsetMinutes: row.time_zone_offset_minutes,
        localDayStartHour: row.local_day_start_hour,
        utcDayStartMinute: row.utc_day_start_minute,
      },
      policy: {
        mode: row.mode,
        minimum: row.minimum,
        maximum: row.maximum,
        valueScale: row.value_scale,
        sensorType: row.sensor_type,
        unit: row.unit,
        version: row.policy_version,
      },
      status: row.status,
      proofGeneratedAt: row.proof_generated_at,
      midnightConfirmed: row.status === 'confirmed' && Boolean(row.attest_tx_id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
}

async function publicProofByTransaction(env: Env, rawTransactionHash: string): Promise<Response> {
  let transactionHash: string;
  try {
    transactionHash = decodeURIComponent(rawTransactionHash).replace(/^0x/iu, '').toLowerCase();
  } catch {
    return json(400, { error: 'Transaction hash is not valid URL input' });
  }
  if (!/^[a-f\d]{64}$/u.test(transactionHash)) {
    return json(400, { error: 'Transaction hash must be 64 hexadecimal characters' });
  }
  const row = await createSqlDatabase(env).first<{ id: string }>(
    `SELECT id FROM daily_proof_jobs
     WHERE (lower(attest_tx_hash) = ?1 OR lower(attest_tx_hash) = '0x' || ?1)
       AND status = 'confirmed'
       AND attest_tx_id IS NOT NULL
       AND attest_tx_hash IS NOT NULL
       AND block_height IS NOT NULL`,
    [transactionHash],
  );
  if (!row) return json(404, { error: 'Confirmed public Proof record not found for this transaction' });
  return json(200, { proofJobId: row.id });
}

export async function handleWave1Api(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/api/v1/device/configuration') {
    return deviceConfiguration(request, env);
  }
  if (request.method === 'GET' && url.pathname === '/api/v1/device/history') {
    return deviceHistory(request, env);
  }
  if (request.method === 'GET' && url.pathname === '/api/v1/device/dashboard') {
    return deviceAdministratorDashboard(request, env);
  }
  if (request.method === 'GET' && url.pathname === '/api/v1/sponsor-quota') {
    return deviceSponsorQuota(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/api/v1/measurement-windows') {
    return ingestMeasurementWindow(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/api/v1/anomaly-events') {
    return ingestAnomalyEvent(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/api/v1/proof-jobs') {
    return createProofJob(request, env);
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (request.method === 'GET' && url.pathname === '/api/v1/public/proofs') {
    return listPublicProofs(env, url);
  }
  if (
    request.method === 'POST'
    && parts.length === 5
    && parts[0] === 'api'
    && parts[1] === 'v1'
    && parts[2] === 'proof-jobs'
    && parts[3]
    && parts[4] === 'admit'
  ) return admitProofJobForBrowserDevice(request, env, parts[3]);
  if (
    request.method === 'GET'
    && parts.length === 6
    && parts[0] === 'api'
    && parts[1] === 'v1'
    && parts[2] === 'public'
    && parts[3] === 'proofs'
    && parts[4] === 'by-transaction'
    && parts[5]
  ) return publicProofByTransaction(env, parts[5]);
  if (
    request.method === 'GET'
    && parts.length === 4
    && parts[0] === 'api'
    && parts[1] === 'v1'
    && parts[2] === 'proof-jobs'
    && parts[3]
  ) return getProofJob(request, env, parts[3]);
  if (
    request.method === 'POST'
    && parts.length === 5
    && parts[0] === 'api'
    && parts[1] === 'v1'
    && parts[2] === 'proof-jobs'
    && parts[3]
    && parts[4] === 'result'
  ) return reportProofJobResult(request, env, parts[3]);
  if (
    request.method === 'GET'
    && parts.length === 5
    && parts[0] === 'api'
    && parts[1] === 'v1'
    && parts[2] === 'projects'
    && parts[3]
  ) {
    if (parts[4] === 'measurement-windows') return listMeasurementWindows(request, env, parts[3], url);
    if (parts[4] === 'anomaly-events') return listAnomalyEvents(request, env, parts[3], url);
    if (parts[4] === 'dashboard') return administratorDashboard(request, env, parts[3]);
  }
  if (
    request.method === 'GET'
    && parts.length === 5
    && parts[0] === 'api'
    && parts[1] === 'v1'
    && parts[2] === 'public'
    && parts[3] === 'proofs'
    && parts[4]
  ) return publicProof(env, parts[4]);
  return null;
}
