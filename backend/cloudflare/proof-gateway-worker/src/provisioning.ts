import {
  browserPolicyCanonicalMessage,
  browserProjectCanonicalMessage,
  browserProvisioningCanonicalMessage,
  deriveBrowserWalletDeviceId,
  type BrowserPolicyAuthorization,
  type BrowserPolicyMode,
  type BrowserProjectAuthorization,
  type BrowserProvisioningAuthorization,
  type BrowserWalletSignature,
} from '@midnight-demo/shared/browser-provisioning';
import {
  utcDayStartMinute,
  validateOperationalDayBoundary,
} from '@midnight-demo/shared/operational-day';

import {
  verifyBrowserPolicyAuthorization,
  verifyBrowserProjectAuthorization,
  verifyBrowserProvisioningAuthorization,
} from './browser-wallet-signature.js';
import { sponsorWalletCanSubmit } from './sponsor-policy.js';
import { authorityContainerRequest } from './authority-container.js';
import { sponsorWalletOperatingWindow } from './sponsor-operating-window.js';
import { createSqlDatabase, type SqlDatabase } from './storage/index.js';

export { browserProvisioningCanonicalMessage } from '@midnight-demo/shared/browser-provisioning';

const defaultProjectId = 'measurement-authenticity-01';
const challengeTtlSeconds = 5 * 60;
const projectSessionTtlSeconds = 24 * 60 * 60;
const maximumProjectsPerWallet = 10;
const maximumPoliciesPerProject = 10;
const timestampToleranceSeconds = 5 * 60;
const maximumBodyBytes = 64 * 1024;
const sponsorDailyLimit = 20;
const provisioningQueueMaximumAttempts = 12;
const sponsorWalletRetryDelaySeconds = 60;
const supportedScopes = new Set([
  'measurement:write',
  'anomaly:write',
  'proof:request',
  'proof:read',
  'proof:generate',
  'transaction:submit',
  'configuration:read',
  'device:status',
]);
const encoder = new TextEncoder();

class SponsorWalletNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SponsorWalletNotReadyError';
  }
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

interface PolicyRow {
  policy_id: string;
  name: string | null;
  policy_key: string;
  mode: 'closed-range' | 'upper-bound' | 'lower-bound';
  minimum: number | null;
  maximum: number | null;
  value_scale: number;
  sensor_type_code: number;
  unit_code: number;
  policy_version: number;
  registered_tx_id: string;
}

interface PolicyChallengeRow {
  id: string;
  wallet_key_sha256: string;
  project_id: string;
  policy_id: string;
  nonce_sha256: string;
  expires_at: number;
  consumed_at: number | null;
}

interface ChallengeRow {
  id: string;
  device_id: string;
  project_id: string;
  key_id: string;
  nonce_sha256: string;
  expires_at: number;
  consumed_at: number | null;
}

interface Enrollment {
  schemaVersion: 1;
  deviceId: string;
  projectId: string;
  keyId: string;
  algorithm: 'ES256';
  publicKeyJwk: JsonWebKey;
  requestedScopes: string[];
  createdAt: string;
}

interface ProvisioningBody {
  enrollment: Enrollment;
  deviceAuthority: string;
  policyId: string;
  challengeId: string;
  nonce: string;
  timestamp: string;
  walletSignature: BrowserWalletSignature;
}

interface ExistingRegistrationRow {
  id: string;
  project_id: string;
  midnight_registry_status: string;
  midnight_contract_address: string | null;
  midnight_device_commitment: string | null;
  midnight_device_authority: string | null;
  midnight_registered_tx_id: string | null;
  assignment_id: string | null;
  assignment_key: string | null;
  assignment_registered_tx_id: string | null;
  time_zone_offset_minutes: number | null;
  local_day_start_hour: number | null;
  utc_day_start_minute: number | null;
  policy_id: string | null;
  policy_key: string | null;
  key_id: string | null;
}

interface WalletDeviceRow {
  wallet_key_sha256: string;
  device_id: string;
  project_id?: string;
  status: 'provisioning' | 'registered' | 'failed';
  updated_at: string;
}

interface ProjectSessionRow {
  wallet_key_sha256: string;
  expires_at: number;
}

interface ProjectRow {
  id: string;
  name: string;
  name_ja: string | null;
  timezone: string;
  time_zone_offset_minutes: number;
  local_day_start_hour: number;
  created_at: string;
}

interface OperationalDayBoundaryRow {
  time_zone_offset_minutes: number;
  local_day_start_hour: number;
}

type PolicyOperationStage =
  | 'queued'
  | 'sponsor_wallet_syncing'
  | 'sponsor_wallet_ready'
  | 'policy_zkp_generating'
  | 'policy_tx_submitting'
  | 'policy_tx_submitted'
  | 'policy_confirmation_waiting'
  | 'policy_confirmed'
  | 'retry_waiting'
  | 'completed'
  | 'failed';

interface PolicyOperationRow {
  id: string;
  wallet_key_sha256: string;
  project_id: string;
  policy_id: string;
  name: string;
  mode: BrowserPolicyMode;
  minimum_centi_celsius: number | null;
  maximum_centi_celsius: number | null;
  browser_authorization_json: string;
  status: 'queued' | 'running' | 'retrying' | 'registered' | 'failed';
  stage: PolicyOperationStage;
  policy_key: string | null;
  policy_tx_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

type ProvisioningStage =
  | 'queued'
  | 'sponsor_wallet_syncing'
  | 'sponsor_wallet_ready'
  | 'device_zkp_generating'
  | 'device_tx_submitting'
  | 'device_tx_submitted'
  | 'device_confirmation_waiting'
  | 'device_confirmed'
  | 'assignment_zkp_generating'
  | 'assignment_tx_submitting'
  | 'assignment_tx_submitted'
  | 'assignment_confirmation_waiting'
  | 'assignment_confirmed'
  | 'retry_waiting'
  | 'completed'
  | 'failed';

const registrationProgressStages = new Set<ProvisioningStage>([
  'sponsor_wallet_ready',
  'device_zkp_generating',
  'device_tx_submitting',
  'device_tx_submitted',
  'device_confirmation_waiting',
  'device_confirmed',
  'assignment_zkp_generating',
  'assignment_tx_submitting',
  'assignment_tx_submitted',
  'assignment_confirmation_waiting',
  'assignment_confirmed',
]);

interface ProvisioningOperationRow {
  id: string;
  progress_token_sha256: string;
  wallet_key_sha256: string;
  device_id: string;
  project_id: string;
  policy_id: string;
  assignment_id: string;
  enrollment_json: string;
  device_authority: string;
  browser_authorization_json: string;
  status: 'queued' | 'running' | 'retrying' | 'registered' | 'failed';
  stage: ProvisioningStage;
  device_commitment: string | null;
  policy_key: string | null;
  assignment_key: string | null;
  device_tx_id: string | null;
  assignment_tx_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface OperatorRegistrationResult {
  deviceCommitment: string;
  policyKey: string;
  assignmentKey: string;
  deviceTxId: string;
  assignmentTxId: string;
}

interface OperatorProgressEvent {
  type: 'progress';
  stage: ProvisioningStage;
  transactionId?: string;
}

interface OperatorResultEvent {
  type: 'result';
  result: OperatorRegistrationResult;
}

interface OperatorErrorEvent {
  type: 'error';
  error: string;
}

type OperatorStreamEvent = OperatorProgressEvent | OperatorResultEvent | OperatorErrorEvent;

interface OperatorPolicyResult {
  policyKey: string;
  policyTxId: string;
}

interface OperatorPolicyProgressEvent {
  type: 'progress';
  stage: PolicyOperationStage;
  transactionId?: string;
}

type OperatorPolicyStreamEvent =
  | OperatorPolicyProgressEvent
  | { type: 'result'; result: OperatorPolicyResult }
  | OperatorErrorEvent;

const policyProgressStages = new Set<PolicyOperationStage>([
  'sponsor_wallet_ready',
  'policy_zkp_generating',
  'policy_tx_submitting',
  'policy_tx_submitted',
  'policy_confirmation_waiting',
  'policy_confirmed',
]);

export interface BrowserProvisioningQueueMessage {
  kind: 'browser-device-provisioning';
  operationId: string;
}

export interface BrowserPolicyQueueMessage {
  kind: 'browser-policy-provisioning';
  operationId: string;
}

export function isBrowserPolicyQueueMessage(value: unknown): value is BrowserPolicyQueueMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<BrowserPolicyQueueMessage>;
  return candidate.kind === 'browser-policy-provisioning'
    && typeof candidate.operationId === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(candidate.operationId);
}

export function isBrowserProvisioningQueueMessage(
  value: unknown,
): value is BrowserProvisioningQueueMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<BrowserProvisioningQueueMessage>;
  return candidate.kind === 'browser-device-provisioning'
    && typeof candidate.operationId === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(candidate.operationId);
}

export function walletOwnsDeviceRegistration(
  row: WalletDeviceRow | null,
  walletKeySha256: string,
  deviceId: string,
): boolean {
  return row?.wallet_key_sha256 === walletKeySha256
    && row.device_id === deviceId
    && row.status === 'registered';
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

function safeIdentifier(name: string, value: unknown, maximum = 160): string {
  if (typeof value !== 'string' || value.length > maximum) throw new Error(`${name} is invalid`);
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized)) throw new Error(`${name} is invalid`);
  return normalized;
}

function safeP256KeyId(name: string, value: unknown): string {
  if (typeof value !== 'string') throw new Error(`${name} is invalid`);
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{43}$/u.test(normalized)) throw new Error(`${name} is invalid`);
  return normalized;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > maximumBodyBytes) throw new Error('Request body is too large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Request body is required');
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBodyBytes) throw new Error('Request body is too large');
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

function base64Url(value: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function expectedKeyId(jwk: JsonWebKey): Promise<string> {
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );
  const spki = await crypto.subtle.exportKey('spki', key) as ArrayBuffer;
  return base64Url(await crypto.subtle.digest('SHA-256', spki));
}

async function parseEnrollment(value: unknown): Promise<Enrollment> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('enrollment is required');
  const candidate = value as Partial<Enrollment>;
  const deviceId = safeIdentifier('deviceId', candidate.deviceId, 80);
  const enrollmentProjectId = safeIdentifier('projectId', candidate.projectId);
  const keyId = safeP256KeyId('keyId', candidate.keyId);
  if (
    candidate.schemaVersion !== 1
    || candidate.algorithm !== 'ES256'
    || candidate.publicKeyJwk?.kty !== 'EC'
    || candidate.publicKeyJwk.crv !== 'P-256'
    || typeof candidate.publicKeyJwk.x !== 'string'
    || typeof candidate.publicKeyJwk.y !== 'string'
    || candidate.publicKeyJwk.d !== undefined
    || !Array.isArray(candidate.requestedScopes)
    || candidate.requestedScopes.length !== supportedScopes.size
    || candidate.requestedScopes.some((scope) => !supportedScopes.has(scope))
    || typeof candidate.createdAt !== 'string'
    || !Number.isFinite(Date.parse(candidate.createdAt))
  ) throw new Error('Enrollment metadata is invalid');
  if (await expectedKeyId(candidate.publicKeyJwk) !== keyId) {
    throw new Error('Enrollment keyId does not match its public key');
  }
  return {
    schemaVersion: 1,
    deviceId,
    projectId: enrollmentProjectId,
    keyId,
    algorithm: 'ES256',
    publicKeyJwk: candidate.publicKeyJwk,
    requestedScopes: [...new Set(candidate.requestedScopes)].sort(),
    createdAt: candidate.createdAt,
  };
}

async function policy(
  database: SqlDatabase,
  policyId: string,
  contractAddress: string,
  selectedProjectId: string,
): Promise<PolicyRow> {
  const row = await database.first<PolicyRow>(
     `SELECT p.policy_id, p.policy_key, p.mode, p.minimum, p.maximum, p.value_scale,
            p.sensor_type_code, p.unit_code, p.policy_version, p.registered_tx_id
     FROM threshold_policies p
     JOIN project_policies pp ON pp.policy_id = p.policy_id
     WHERE p.policy_id = ?1 AND pp.project_id = ?2 AND p.status = 'registered'
       AND p.contract_address = ?3 AND p.registered_tx_id IS NOT NULL`,
    [policyId, selectedProjectId, contractAddress],
  );
  if (!row) throw new Error('Threshold Policy is not registered for the active contract');
  return row;
}

async function operationalDayBoundary(
  database: SqlDatabase,
  projectId: string,
): Promise<{ timeZoneOffsetMinutes: number; localDayStartHour: number; utcDayStartMinute: number }> {
  const row = await database.first<OperationalDayBoundaryRow>(
    `SELECT time_zone_offset_minutes, local_day_start_hour
     FROM projects WHERE id = ?1`,
    [projectId],
  );
  if (!row) throw new Error('Project operational-day configuration was not found');
  const boundary = validateOperationalDayBoundary({
    timeZoneOffsetMinutes: Number(row.time_zone_offset_minutes),
    localDayStartHour: Number(row.local_day_start_hour),
  });
  return { ...boundary, utcDayStartMinute: utcDayStartMinute(boundary) };
}

function registrationView(row: ExistingRegistrationRow, contractAddress: string) {
  if (
    row.midnight_registry_status !== 'registered'
    || row.midnight_contract_address !== contractAddress
    || !row.midnight_device_commitment
    || !row.midnight_registered_tx_id
    || !row.assignment_id
    || !row.assignment_key
    || !row.assignment_registered_tx_id
    || !row.policy_id
    || !row.policy_key
    || row.time_zone_offset_minutes === null
    || row.local_day_start_hour === null
    || row.utc_day_start_minute === null
  ) return null;
  return {
    deviceId: row.id,
    projectId: row.project_id,
    contractAddress,
    deviceCommitment: row.midnight_device_commitment,
    policyId: row.policy_id,
    policyKey: row.policy_key,
    assignmentId: row.assignment_id,
    assignmentKey: row.assignment_key,
    timeZoneOffsetMinutes: row.time_zone_offset_minutes,
    localDayStartHour: row.local_day_start_hour,
    utcDayStartMinute: row.utc_day_start_minute,
    registeredTxId: row.midnight_registered_tx_id,
    assignmentTxId: row.assignment_registered_tx_id,
  };
}

async function existingRegistration(
  database: SqlDatabase,
  deviceId: string,
  selectedProjectId: string,
): Promise<ExistingRegistrationRow | null> {
  return database.first<ExistingRegistrationRow>(
    `SELECT d.id, d.project_id, d.midnight_registry_status, d.midnight_contract_address,
            d.midnight_device_commitment, d.midnight_device_authority,
            d.midnight_registered_tx_id, a.assignment_id, a.assignment_key,
            a.registered_tx_id AS assignment_registered_tx_id,
            a.time_zone_offset_minutes, a.local_day_start_hour, a.utc_day_start_minute,
            p.policy_id, p.policy_key, k.key_id
     FROM devices d
     LEFT JOIN policy_assignments a ON a.device_id = d.id AND a.project_id = d.project_id
       AND a.status = 'registered'
       AND a.contract_address = d.midnight_contract_address
     LEFT JOIN threshold_policies p ON p.policy_id = a.policy_id AND p.status = 'registered'
       AND p.contract_address = d.midnight_contract_address
     LEFT JOIN device_auth_keys k ON k.device_id = d.id AND k.project_id = d.project_id
       AND k.status = 'active'
     WHERE d.id = ?1 AND d.project_id = ?2
     ORDER BY a.assignment_version DESC LIMIT 1`,
    [deviceId, selectedProjectId],
  );
}

async function sponsorOperatorRequest(
  env: Env,
  pathname: string,
  operation: string,
  body: unknown,
  options: { progress?: boolean; signal?: AbortSignal } = {},
): Promise<Response> {
  const serialized = JSON.stringify(body);
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await authorityContainerRequest(env, 'fleet-authority', pathname, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Operator-Provisioning': operation,
        ...(options.progress ? { 'X-Operator-Progress': 'ndjson-v1' } : {}),
      },
      body: serialized,
      signal: options.signal ?? AbortSignal.timeout(5 * 60_000),
    });
    if (response.status !== 503) return response;
    const detail = await response.text();
    const processStarting = detail.includes('Sponsor Wallet process is starting')
      || detail.includes('Sponsor Wallet process is unavailable');
    if (!processStarting || attempt === 6) {
      return new Response(detail, { status: response.status, headers: response.headers });
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  throw new Error('Sponsor Wallet process did not become available');
}

function provisioningResult(
  operation: ProvisioningOperationRow,
  contractAddress: string,
) {
  if (
    !operation.device_commitment
    || !operation.policy_key
    || !operation.assignment_key
    || !operation.device_tx_id
    || !operation.assignment_tx_id
  ) return null;
  return {
    deviceId: operation.device_id,
    projectId: operation.project_id,
    contractAddress,
    deviceCommitment: operation.device_commitment,
    policyId: operation.policy_id,
    policyKey: operation.policy_key,
    assignmentId: operation.assignment_id,
    assignmentKey: operation.assignment_key,
    registeredTxId: operation.device_tx_id,
    assignmentTxId: operation.assignment_tx_id,
  };
}

function provisioningOperationView(operation: ProvisioningOperationRow, contractAddress: string) {
  return {
    operationId: operation.id,
    status: operation.status,
    stage: operation.stage,
    deviceId: operation.device_id,
    policyId: operation.policy_id,
    deviceTxId: operation.device_tx_id,
    assignmentTxId: operation.assignment_tx_id,
    error: operation.error_message,
    updatedAt: operation.updated_at,
    result: operation.status === 'registered'
      ? provisioningResult(operation, contractAddress)
      : null,
  };
}

async function serverProcessingSchedule(env: Env, acceptedAt?: string) {
  const schedule = await sponsorWalletOperatingWindow(env);
  const processingEligibleNow = schedule.executionAllowed && (
    schedule.mode === 'always-on'
    || schedule.mode === 'on-demand'
    || (acceptedAt !== undefined
      && schedule.eligibleThrough !== null
      && acceptedAt <= schedule.eligibleThrough)
  ) && schedule.startAllowed;
  return {
    mode: schedule.mode,
    timeZoneOffsetMinutes: schedule.timeZoneOffsetMinutes,
    processingStartsAtMinute: schedule.processingStartsAtMinute,
    nextProcessingStartsAt: schedule.nextProcessingStartsAt,
    nextContainerStartAllowedAt: schedule.nextStartAllowedAt,
    processingCadenceSeconds: 60,
    processingEligibleNow,
  };
}

function validOperatorResult(
  result: OperatorRegistrationResult,
  expectedPolicyKey: string,
): boolean {
  return result.policyKey === expectedPolicyKey
    && /^(?:[0-9a-f]{2}){32}$/u.test(result.deviceCommitment)
    && /^(?:[0-9a-f]{2}){32}$/u.test(result.assignmentKey)
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(result.deviceTxId)
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(result.assignmentTxId);
}

async function updateOperationProgress(
  database: SqlDatabase,
  operationId: string,
  event: OperatorProgressEvent,
): Promise<void> {
  if (!registrationProgressStages.has(event.stage)) {
    throw new Error(`Operator Wallet returned unknown registration stage: ${event.stage}`);
  }
  const now = new Date().toISOString();
  const transactionId = typeof event.transactionId === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(event.transactionId)
    ? event.transactionId
    : null;
  if (event.stage.startsWith('device_') && transactionId) {
    await database.execute(
      `UPDATE browser_provisioning_operations
       SET stage = ?1, device_tx_id = ?2, error_message = NULL, updated_at = ?3
       WHERE id = ?4 AND status = 'running'`,
      [event.stage, transactionId, now, operationId],
    );
    return;
  }
  if (event.stage.startsWith('assignment_') && transactionId) {
    await database.execute(
      `UPDATE browser_provisioning_operations
       SET stage = ?1, assignment_tx_id = ?2, error_message = NULL, updated_at = ?3
       WHERE id = ?4 AND status = 'running'`,
      [event.stage, transactionId, now, operationId],
    );
    return;
  }
  await database.execute(
    `UPDATE browser_provisioning_operations
     SET stage = ?1, error_message = NULL, updated_at = ?2
     WHERE id = ?3 AND status = 'running'`,
    [event.stage, now, operationId],
  );
}

async function readOperatorRegistrationStream(
  response: Response,
  onProgress: (event: OperatorProgressEvent) => Promise<void>,
): Promise<OperatorRegistrationResult> {
  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(`Operator Wallet returned HTTP ${response.status}: ${detail.slice(0, 2_000)}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  let result: OperatorRegistrationResult | null = null;
  const consume = async (line: string): Promise<void> => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as OperatorStreamEvent;
    if (event.type === 'progress') {
      await onProgress(event);
      return;
    }
    if (event.type === 'result') {
      result = event.result;
      return;
    }
    if (event.type === 'error') throw new Error(`Operator Wallet registration failed: ${event.error}`);
    throw new Error('Operator Wallet returned an invalid progress event');
  };
  while (true) {
    const { done, value } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });
    let newline = buffered.indexOf('\n');
    while (newline >= 0) {
      await consume(buffered.slice(0, newline));
      buffered = buffered.slice(newline + 1);
      newline = buffered.indexOf('\n');
    }
    if (done) break;
  }
  await consume(buffered);
  if (!result) throw new Error('Operator Wallet progress stream ended without a result');
  return result;
}

async function completeProvisioningOperation(
  database: SqlDatabase,
  operation: ProvisioningOperationRow,
  enrollment: Enrollment,
  contractAddress: string,
  result: OperatorRegistrationResult,
  boundary: { timeZoneOffsetMinutes: number; localDayStartHour: number; utcDayStartMinute: number },
): Promise<void> {
  const registeredAt = new Date().toISOString();
  await database.batch([
    {
      sql: `UPDATE devices SET
              threshold_policy_version = ?1,
              midnight_device_commitment = ?2,
              midnight_device_authority = ?3,
              midnight_registry_status = 'registered',
              midnight_registration_version = 1,
              midnight_contract_address = ?4,
              midnight_registered_tx_id = ?5,
              midnight_authority_tx_id = ?5,
              midnight_disabled_tx_id = NULL,
              midnight_registered_at = ?6,
              operation_configuration_version = operation_configuration_version + 1,
              operation_configuration_updated_at = ?6
            WHERE id = ?7 AND project_id = ?8 AND midnight_registry_status = 'unregistered'`,
      parameters: [
        operation.policy_id,
        result.deviceCommitment,
        operation.device_authority,
        contractAddress,
        result.deviceTxId,
        registeredAt,
        operation.device_id,
        operation.project_id,
      ],
    },
    {
      sql: `INSERT INTO policy_assignments (
              assignment_id, assignment_key, policy_id, project_id, device_id,
              valid_from, valid_until, assignment_version, status, device_commitment,
              contract_address, registered_tx_id, registered_at,
              time_zone_offset_minutes, local_day_start_hour, utc_day_start_minute
            ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, 1, 'registered', ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
      parameters: [
        operation.assignment_id,
        result.assignmentKey,
        operation.policy_id,
        operation.project_id,
        operation.device_id,
        result.deviceCommitment,
        contractAddress,
        result.assignmentTxId,
        registeredAt,
        boundary.timeZoneOffsetMinutes,
        boundary.localDayStartHour,
        boundary.utcDayStartMinute,
      ],
    },
    {
      sql: `INSERT INTO device_auth_keys (
              key_id, device_id, project_id, algorithm, public_key_jwk,
              allowed_scopes_json, status, registered_at, rotated_at, last_authenticated_at
            ) VALUES (?1, ?2, ?3, 'ES256', ?4, ?5, 'active', ?6, NULL, NULL)`,
      parameters: [
        enrollment.keyId,
        operation.device_id,
        operation.project_id,
        JSON.stringify(enrollment.publicKeyJwk),
        JSON.stringify(enrollment.requestedScopes),
        registeredAt,
      ],
    },
    {
      sql: `INSERT OR IGNORE INTO anomaly_states (
              device_id, project_id, state, last_event_id, changed_at
            ) VALUES (?1, ?2, 'normal', NULL, ?3)`,
      parameters: [operation.device_id, operation.project_id, registeredAt],
    },
    {
      sql: `UPDATE browser_wallet_devices SET status = 'registered', updated_at = ?1
            WHERE wallet_key_sha256 = ?2 AND device_id = ?3 AND project_id = ?4`,
      parameters: [
        registeredAt,
        operation.wallet_key_sha256,
        operation.device_id,
        operation.project_id,
      ],
    },
    {
      sql: `UPDATE browser_provisioning_operations SET
              status = 'registered', stage = 'completed', device_commitment = ?1,
              policy_key = ?2, assignment_key = ?3, device_tx_id = ?4,
              assignment_tx_id = ?5, error_message = NULL, updated_at = ?6
            WHERE id = ?7 AND status = 'running'`,
      parameters: [
        result.deviceCommitment,
        result.policyKey,
        result.assignmentKey,
        result.deviceTxId,
        result.assignmentTxId,
        registeredAt,
        operation.id,
      ],
    },
  ]);
}

async function updatePolicyOperationProgress(
  database: SqlDatabase,
  operationId: string,
  event: OperatorPolicyProgressEvent,
): Promise<void> {
  if (!policyProgressStages.has(event.stage)) {
    throw new Error(`Operator Wallet returned unknown Policy stage: ${event.stage}`);
  }
  const transactionId = typeof event.transactionId === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(event.transactionId)
    ? event.transactionId
    : null;
  await database.execute(
    `UPDATE browser_policy_operations SET stage = ?1,
       policy_tx_id = COALESCE(?2, policy_tx_id), error_message = NULL, updated_at = ?3
     WHERE id = ?4 AND status = 'running'`,
    [event.stage, transactionId, new Date().toISOString(), operationId],
  );
}

async function readOperatorPolicyStream(
  response: Response,
  onProgress: (event: OperatorPolicyProgressEvent) => Promise<void>,
): Promise<OperatorPolicyResult> {
  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(`Operator Wallet returned HTTP ${response.status}: ${detail.slice(0, 2_000)}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  let result: OperatorPolicyResult | null = null;
  const consume = async (line: string): Promise<void> => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as OperatorPolicyStreamEvent;
    if (event.type === 'progress') {
      await onProgress(event);
      return;
    }
    if (event.type === 'result') {
      result = event.result;
      return;
    }
    if (event.type === 'error') throw new Error(`Operator Wallet Policy registration failed: ${event.error}`);
    throw new Error('Operator Wallet returned an invalid Policy progress event');
  };
  while (true) {
    const { done, value } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });
    let newline = buffered.indexOf('\n');
    while (newline >= 0) {
      await consume(buffered.slice(0, newline));
      buffered = buffered.slice(newline + 1);
      newline = buffered.indexOf('\n');
    }
    if (done) break;
  }
  await consume(buffered);
  if (!result) throw new Error('Operator Wallet Policy stream ended without a result');
  return result;
}

export async function processBrowserPolicyQueueMessage(
  message: Message<unknown>,
  env: Env,
): Promise<boolean> {
  if (!isBrowserPolicyQueueMessage(message.body)) return false;
  const database = createSqlDatabase(env);
  const operation = await database.first<PolicyOperationRow>(
    'SELECT * FROM browser_policy_operations WHERE id = ?1',
    [message.body.operationId],
  );
  if (!operation || operation.status === 'registered' || operation.status === 'failed') {
    message.ack();
    return true;
  }
  const contractAddress = env.PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS?.trim();
  try {
    if (!contractAddress) throw new Error('Active Midnight contract is not configured');
    const startedAt = new Date().toISOString();
    await database.execute(
      `UPDATE browser_policy_operations
       SET status = 'running', stage = 'sponsor_wallet_syncing', error_message = NULL, updated_at = ?1
       WHERE id = ?2 AND status IN ('queued', 'retrying', 'running')`,
      [startedAt, operation.id],
    );
    const authorization = JSON.parse(
      operation.browser_authorization_json,
    ) as BrowserPolicyAuthorization;
    const { sponsorWalletHealth } = await import('./sponsor.js');
    const health = await sponsorWalletHealth(env);
    if (!sponsorWalletCanSubmit(health)) {
      throw new SponsorWalletNotReadyError(
        `Sponsor Wallet is not ready: phase=${health.phase}, `
        + `spendableDustCoins=${health.spendableDustCoins ?? 'unknown'}`,
      );
    }
    const response = await sponsorOperatorRequest(
      env,
      '/operator/register-policy',
      'register-policy-v1',
      {
        contractAddress,
        projectId: operation.project_id,
        policyId: operation.policy_id,
        name: operation.name,
        mode: operation.mode,
        minimumCentiCelsius: operation.minimum_centi_celsius,
        maximumCentiCelsius: operation.maximum_centi_celsius,
        policyVersion: 1,
        knownPolicyTxId: operation.policy_tx_id ?? undefined,
        browserAuthorization: authorization,
      },
      { progress: true },
    );
    const result = await readOperatorPolicyStream(
      response,
      (event) => updatePolicyOperationProgress(database, operation.id, event),
    );
    if (
      !/^(?:[0-9a-f]{2}){32}$/u.test(result.policyKey)
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(result.policyTxId)
    ) throw new Error('Operator Wallet Policy response is invalid');
    const registeredAt = new Date().toISOString();
    await database.batch([
      {
        sql: `INSERT INTO threshold_policies (
                policy_id, policy_key, project_id, sensor_type, unit, mode,
                minimum, maximum, value_scale, sensor_type_code, unit_code,
                policy_version, status, contract_address, registered_tx_id, registered_at, name
              ) VALUES (?1, ?2, ?3, 'temperature', '°C', ?4, ?5, ?6, 100, 1, 1,
                        1, 'registered', ?7, ?8, ?9, ?10)`,
        parameters: [
          operation.policy_id,
          result.policyKey,
          operation.project_id,
          operation.mode,
          operation.minimum_centi_celsius === null ? null : operation.minimum_centi_celsius / 100,
          operation.maximum_centi_celsius === null ? null : operation.maximum_centi_celsius / 100,
          contractAddress,
          result.policyTxId,
          registeredAt,
          operation.name,
        ],
      },
      {
        sql: `INSERT OR IGNORE INTO project_policies (project_id, policy_id, created_at)
              VALUES (?1, ?2, ?3)`,
        parameters: [operation.project_id, operation.policy_id, registeredAt],
      },
      {
        sql: `UPDATE browser_policy_operations SET status = 'registered', stage = 'completed',
                policy_key = ?1, policy_tx_id = ?2, error_message = NULL, updated_at = ?3
              WHERE id = ?4 AND status = 'running'`,
        parameters: [result.policyKey, result.policyTxId, registeredAt, operation.id],
      },
    ]);
    message.ack();
  } catch (error) {
    const failedAt = new Date().toISOString();
    const detail = errorMessage(error).slice(0, 2_000);
    if (error instanceof SponsorWalletNotReadyError) {
      await database.execute(
        `UPDATE browser_policy_operations
         SET status = 'retrying', stage = 'retry_waiting', error_message = ?1, updated_at = ?2
         WHERE id = ?3 AND status = 'running'`,
        [detail, failedAt, operation.id],
      );
      try {
        await env.SPONSOR_QUEUE.send({
          kind: 'browser-policy-provisioning',
          operationId: operation.id,
        } satisfies BrowserPolicyQueueMessage, {
          delaySeconds: sponsorWalletRetryDelaySeconds,
        });
        message.ack();
      } catch {
        message.retry({ delaySeconds: 30 });
      }
    } else if (message.attempts < provisioningQueueMaximumAttempts) {
      await database.execute(
        `UPDATE browser_policy_operations
         SET status = 'retrying', stage = 'retry_waiting', error_message = ?1, updated_at = ?2
         WHERE id = ?3 AND status = 'running'`,
        [detail, failedAt, operation.id],
      );
      message.retry({ delaySeconds: 30 });
    } else {
      await database.execute(
        `UPDATE browser_policy_operations
         SET status = 'failed', stage = 'failed', error_message = ?1, updated_at = ?2
         WHERE id = ?3`,
        [detail, failedAt, operation.id],
      );
      message.ack();
    }
    console.error(JSON.stringify({
      message: 'browser_policy_provisioning_queue_failed',
      operationId: operation.id,
      projectId: operation.project_id,
      attempt: message.attempts,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: detail,
    }));
  }
  return true;
}

export async function processBrowserProvisioningQueueMessage(
  message: Message<unknown>,
  env: Env,
): Promise<boolean> {
  if (!isBrowserProvisioningQueueMessage(message.body)) return false;
  const database = createSqlDatabase(env);
  const operation = await database.first<ProvisioningOperationRow>(
    'SELECT * FROM browser_provisioning_operations WHERE id = ?1',
    [message.body.operationId],
  );
  if (!operation || operation.status === 'registered' || operation.status === 'failed') {
    message.ack();
    return true;
  }
  const contractAddress = env.PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS?.trim();
  try {
    if (!contractAddress) throw new Error('Active Midnight contract is not configured');
    const startedAt = new Date().toISOString();
    await database.execute(
      `UPDATE browser_provisioning_operations
       SET status = 'running', stage = 'sponsor_wallet_syncing', error_message = NULL, updated_at = ?1
       WHERE id = ?2 AND status IN ('queued', 'retrying', 'running')`,
      [startedAt, operation.id],
    );
    const enrollment = await parseEnrollment(JSON.parse(operation.enrollment_json));
    const authorization = JSON.parse(
      operation.browser_authorization_json,
    ) as BrowserProvisioningAuthorization;
    const selectedPolicy = await policy(
      database,
      operation.policy_id,
      contractAddress,
      operation.project_id,
    );
    const boundary = await operationalDayBoundary(database, operation.project_id);
    const { sponsorWalletHealth } = await import('./sponsor.js');
    const health = await sponsorWalletHealth(env);
    if (!sponsorWalletCanSubmit(health)) {
      throw new SponsorWalletNotReadyError(
        `Sponsor Wallet is not ready: phase=${health.phase}, `
        + `spendableDustCoins=${health.spendableDustCoins ?? 'unknown'}`,
      );
    }
    const response = await sponsorOperatorRequest(
      env,
      '/operator/register-device',
      'register-device-v1',
      {
        contractAddress,
        deviceId: operation.device_id,
        deviceAuthority: operation.device_authority,
        policyId: operation.policy_id,
        assignmentId: operation.assignment_id,
        deviceRegistrationVersion: 1,
        assignmentVersion: 1,
        ...boundary,
        validFromEpoch: '0',
        validUntilEpoch: '0',
        knownDeviceTxId: operation.device_tx_id ?? undefined,
        knownAssignmentTxId: operation.assignment_tx_id ?? undefined,
        browserAuthorization: authorization,
      },
      { progress: true },
    );
    const result = await readOperatorRegistrationStream(
      response,
      (event) => updateOperationProgress(database, operation.id, event),
    );
    if (!validOperatorResult(result, selectedPolicy.policy_key)) {
      throw new Error('Operator Wallet registration response is invalid');
    }
    await completeProvisioningOperation(
      database,
      operation,
      enrollment,
      contractAddress,
      result,
      boundary,
    );
    message.ack();
  } catch (error) {
    const failedAt = new Date().toISOString();
    const detail = errorMessage(error).slice(0, 2_000);
    if (error instanceof SponsorWalletNotReadyError) {
      await database.execute(
        `UPDATE browser_provisioning_operations
         SET status = 'retrying', stage = 'retry_waiting', error_message = ?1, updated_at = ?2
         WHERE id = ?3 AND status = 'running'`,
        [detail, failedAt, operation.id],
      );
      try {
        await env.SPONSOR_QUEUE.send({
          kind: 'browser-device-provisioning',
          operationId: operation.id,
        } satisfies BrowserProvisioningQueueMessage, {
          delaySeconds: sponsorWalletRetryDelaySeconds,
        });
        message.ack();
      } catch {
        message.retry({ delaySeconds: 30 });
      }
    } else if (message.attempts < provisioningQueueMaximumAttempts) {
      await database.execute(
        `UPDATE browser_provisioning_operations
         SET status = 'retrying', stage = 'retry_waiting', error_message = ?1, updated_at = ?2
         WHERE id = ?3 AND status = 'running'`,
        [detail, failedAt, operation.id],
      );
      message.retry({ delaySeconds: 30 });
    } else {
      await database.batch([
        {
          sql: `UPDATE browser_provisioning_operations
                SET status = 'failed', stage = 'failed', error_message = ?1, updated_at = ?2
                WHERE id = ?3`,
          parameters: [detail, failedAt, operation.id],
        },
        {
          sql: `UPDATE browser_wallet_devices SET status = 'failed', updated_at = ?1
                WHERE wallet_key_sha256 = ?2 AND device_id = ?3 AND project_id = ?4`,
          parameters: [
            failedAt,
            operation.wallet_key_sha256,
            operation.device_id,
            operation.project_id,
          ],
        },
      ]);
      message.ack();
    }
    console.error(JSON.stringify({
      message: 'browser_device_provisioning_queue_failed',
      operationId: operation.id,
      deviceId: operation.device_id,
      attempt: message.attempts,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: detail,
    }));
  }
  return true;
}

function scheduledWalletMessage(body: BrowserPolicyQueueMessage | BrowserProvisioningQueueMessage): Message<unknown> {
  return {
    body,
    attempts: 1,
    ack() {},
    retry() {},
  } as unknown as Message<unknown>;
}

export async function processScheduledBrowserPolicy(
  env: Env,
  operationId: string,
): Promise<void> {
  await processBrowserPolicyQueueMessage(
    scheduledWalletMessage({ kind: 'browser-policy-provisioning', operationId }),
    env,
  );
}

export async function processScheduledBrowserDevice(
  env: Env,
  operationId: string,
): Promise<void> {
  await processBrowserProvisioningQueueMessage(
    scheduledWalletMessage({ kind: 'browser-device-provisioning', operationId }),
    env,
  );
}

export async function dispatchPendingBrowserProvisioning(
  env: Env,
  acceptedThrough: string | null = null,
): Promise<void> {
  const database = createSqlDatabase(env);
  const acceptedClause = acceptedThrough === null ? '' : ' AND operation.created_at <= ?1';
  const parameters = acceptedThrough === null ? [] : [acceptedThrough];
  const [policies, devices] = await Promise.all([
    database.all<{ id: string }>(
      `SELECT operation.id FROM browser_policy_operations operation
       WHERE operation.status IN ('queued', 'retrying')${acceptedClause}
       ORDER BY operation.created_at ASC LIMIT 8`,
      parameters,
    ),
    database.all<{ id: string }>(
      `SELECT operation.id FROM browser_provisioning_operations operation
       WHERE operation.status IN ('queued', 'retrying')${acceptedClause}
         AND EXISTS (
           SELECT 1
           FROM project_policies project_policy
           JOIN threshold_policies policy
             ON policy.policy_id = project_policy.policy_id
           WHERE project_policy.project_id = operation.project_id
             AND project_policy.policy_id = operation.policy_id
             AND policy.status = 'registered'
         )
       ORDER BY operation.created_at ASC LIMIT 8`,
      parameters,
    ),
  ]);
  for (const policy of policies) {
    await env.SPONSOR_QUEUE.send({
      kind: 'browser-policy-provisioning',
      operationId: policy.id,
    } satisfies BrowserPolicyQueueMessage);
  }
  for (const device of devices) {
    await env.SPONSOR_QUEUE.send({
      kind: 'browser-device-provisioning',
      operationId: device.id,
    } satisfies BrowserProvisioningQueueMessage);
  }
}

async function provisioningOperation(request: Request, env: Env, operationId: string): Promise<Response> {
  const token = request.headers.get('X-Provisioning-Token')?.trim() ?? '';
  if (!token || token.length > 256) return json(401, { error: 'Provisioning progress token is required' });
  const operation = await createSqlDatabase(env).first<ProvisioningOperationRow>(
    `SELECT * FROM browser_provisioning_operations
     WHERE id = ?1 AND progress_token_sha256 = ?2`,
    [operationId, await sha256Hex(token)],
  );
  if (!operation) return json(404, { error: 'Provisioning operation was not found' });
  const contractAddress = env.PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS?.trim() ?? '';
  return json(200, {
    ...provisioningOperationView(operation, contractAddress),
    processingSchedule: await serverProcessingSchedule(env, operation.created_at),
  });
}

function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes.buffer);
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get('Authorization')?.trim() ?? '';
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/u);
  if (!match?.[1]) throw new HttpError(401, 'Wallet Project session is required');
  return match[1];
}

async function projectSession(request: Request, database: SqlDatabase): Promise<ProjectSessionRow> {
  const now = Math.floor(Date.now() / 1000);
  const session = await database.first<ProjectSessionRow>(
    `SELECT wallet_key_sha256, expires_at
     FROM browser_project_sessions
     WHERE token_sha256 = ?1 AND expires_at >= ?2`,
    [await sha256Hex(bearerToken(request)), now],
  );
  if (!session) throw new HttpError(401, 'Wallet Project session is invalid or expired');
  return session;
}

async function walletOwnsProject(
  database: SqlDatabase,
  walletKeySha256: string,
  selectedProjectId: string,
): Promise<boolean> {
  return Boolean(await database.first<{ project_id: string }>(
    `SELECT project_id FROM browser_wallet_projects
     WHERE wallet_key_sha256 = ?1 AND project_id = ?2`,
    [walletKeySha256, selectedProjectId],
  ));
}

function projectView(row: ProjectRow) {
  return {
    projectId: row.id,
    name: row.name,
    nameJa: row.name_ja,
    timeZone: row.timezone,
    timeZoneOffsetMinutes: Number(row.time_zone_offset_minutes),
    localDayStartHour: Number(row.local_day_start_hour),
    utcDayStartMinute: utcDayStartMinute({
      timeZoneOffsetMinutes: Number(row.time_zone_offset_minutes),
      localDayStartHour: Number(row.local_day_start_hour),
    }),
    createdAt: row.created_at,
  };
}

async function walletProjects(database: SqlDatabase, walletKeySha256: string): Promise<ProjectRow[]> {
  return database.all<ProjectRow>(
    `SELECT p.id, p.name, p.name_ja, p.timezone,
            p.time_zone_offset_minutes, p.local_day_start_hour, wp.created_at
     FROM browser_wallet_projects wp
     INNER JOIN projects p ON p.id = wp.project_id
     WHERE wp.wallet_key_sha256 = ?1
     ORDER BY wp.created_at, p.id`,
    [walletKeySha256],
  );
}

async function issueProjectChallenge(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP')?.trim() || 'unknown';
  if (!(await env.AUTH_RATE_LIMITER.limit({ key: `project-session-ip:${ip}` })).success) {
    return json(429, { error: 'Wallet Project session rate limit exceeded' });
  }
  const nonce = randomToken();
  const now = Math.floor(Date.now() / 1000);
  const challengeId = `project_${crypto.randomUUID()}`;
  await createSqlDatabase(env).execute(
    `INSERT INTO browser_project_challenges (
       id, nonce_sha256, issued_at, expires_at, consumed_at
     ) VALUES (?1, ?2, ?3, ?4, NULL)`,
    [challengeId, await sha256Hex(nonce), now, now + challengeTtlSeconds],
  );
  return json(200, {
    network: 'preprod',
    challengeId,
    nonce,
    expiresAt: new Date((now + challengeTtlSeconds) * 1000).toISOString(),
  });
}

async function createProjectSession(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const challengeId = safeIdentifier('challengeId', body.challengeId);
  const nonce = typeof body.nonce === 'string' && body.nonce.length <= 128 ? body.nonce : '';
  const timestamp = typeof body.timestamp === 'string' ? body.timestamp : '';
  const timestampMs = Date.parse(timestamp);
  if (!nonce || !Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > timestampToleranceSeconds * 1000) {
    throw new Error('Wallet Project timestamp or nonce is invalid');
  }
  if (!body.walletSignature || typeof body.walletSignature !== 'object' || Array.isArray(body.walletSignature)) {
    throw new Error('Wallet signature is required');
  }
  const walletSignature = body.walletSignature as Partial<BrowserWalletSignature>;
  if (
    typeof walletSignature.data !== 'string'
    || typeof walletSignature.signature !== 'string'
    || typeof walletSignature.verifyingKey !== 'string'
    || walletSignature.data.length > 2048
    || walletSignature.signature.length > 1024
    || walletSignature.verifyingKey.length > 1024
  ) throw new Error('Wallet signature is invalid');
  const database = createSqlDatabase(env);
  const challenge = await database.first<{
    id: string;
    nonce_sha256: string;
    expires_at: number;
    consumed_at: number | null;
  }>(
    `SELECT id, nonce_sha256, expires_at, consumed_at
     FROM browser_project_challenges WHERE id = ?1`,
    [challengeId],
  );
  const now = Math.floor(Date.now() / 1000);
  if (
    !challenge
    || challenge.nonce_sha256 !== await sha256Hex(nonce)
    || challenge.expires_at < now
    || challenge.consumed_at !== null
  ) throw new Error('Wallet Project challenge is invalid, expired, or already used');
  const authorization: BrowserProjectAuthorization = {
    challengeId,
    nonce,
    timestamp,
    walletSignature: walletSignature as BrowserWalletSignature,
  };
  if (walletSignature.data !== browserProjectCanonicalMessage(authorization)) {
    throw new Error('Midnight Wallet signed data does not match the Project session request');
  }
  verifyBrowserProjectAuthorization(authorization);
  const consumed = await database.execute(
    `UPDATE browser_project_challenges SET consumed_at = ?1
     WHERE id = ?2 AND consumed_at IS NULL AND expires_at >= ?1`,
    [now, challengeId],
  );
  if (consumed !== 1) throw new Error('Wallet Project challenge was already consumed');
  const walletKeySha256 = await sha256Hex(walletSignature.verifyingKey);
  const existingProjects = await walletProjects(database, walletKeySha256);
  const accessToken = randomToken();
  const expiresAt = now + projectSessionTtlSeconds;
  const statements = [{
    sql: `INSERT INTO browser_project_sessions (
            token_sha256, wallet_key_sha256, issued_at, expires_at, last_used_at
          ) VALUES (?1, ?2, ?3, ?4, ?3)`,
    parameters: [await sha256Hex(accessToken), walletKeySha256, now, expiresAt],
  }];
  if (existingProjects.length === 0) {
    statements.push({
      sql: `INSERT OR IGNORE INTO browser_wallet_projects (
              wallet_key_sha256, project_id, created_at
            ) VALUES (?1, ?2, ?3)`,
      parameters: [walletKeySha256, defaultProjectId, new Date().toISOString()],
    });
  }
  await database.batch(statements);
  const projects = existingProjects.length > 0
    ? existingProjects
    : await walletProjects(database, walletKeySha256);
  return json(200, {
    accessToken,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    projects: projects.map(projectView),
    maximumProjects: maximumProjectsPerWallet,
  });
}

async function listProjects(request: Request, env: Env): Promise<Response> {
  const database = createSqlDatabase(env);
  const session = await projectSession(request, database);
  const projects = await walletProjects(database, session.wallet_key_sha256);
  return json(200, {
    projects: projects.map(projectView),
    maximumProjects: maximumProjectsPerWallet,
  });
}

async function createProject(request: Request, env: Env): Promise<Response> {
  const database = createSqlDatabase(env);
  const session = await projectSession(request, database);
  const body = await readJson(request);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new Error('Project name must contain 1-80 printable characters');
  }
  const boundary = validateOperationalDayBoundary({
    timeZoneOffsetMinutes: body.timeZoneOffsetMinutes === undefined
      ? 0
      : Number(body.timeZoneOffsetMinutes),
    localDayStartHour: body.localDayStartHour === undefined
      ? 0
      : Number(body.localDayStartHour),
  });
  const sign = boundary.timeZoneOffsetMinutes < 0 ? '-' : '+';
  const absoluteOffset = Math.abs(boundary.timeZoneOffsetMinutes);
  const timeZone = `UTC${sign}${String(Math.floor(absoluteOffset / 60)).padStart(2, '0')}:${String(absoluteOffset % 60).padStart(2, '0')}`;
  const current = await walletProjects(database, session.wallet_key_sha256);
  if (current.length >= maximumProjectsPerWallet) {
    throw new HttpError(409, `A Midnight Wallet can own up to ${maximumProjectsPerWallet} Projects`);
  }
  const selectedProjectId = `project-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  try {
    await database.batch([
      {
        sql: `INSERT INTO projects (
                id, name, organization, timezone, expected_interval_minutes, name_ja, organization_ja,
                time_zone_offset_minutes, local_day_start_hour
              ) VALUES (?1, ?2, ?2, ?3, 1, NULL, NULL, ?4, ?5)`,
        parameters: [
          selectedProjectId,
          name,
          timeZone,
          boundary.timeZoneOffsetMinutes,
          boundary.localDayStartHour,
        ],
      },
      {
        sql: `INSERT INTO browser_wallet_projects (wallet_key_sha256, project_id, created_at)
              VALUES (?1, ?2, ?3)`,
        parameters: [session.wallet_key_sha256, selectedProjectId, createdAt],
      },
    ]);
  } catch (error) {
    if (errorMessage(error).includes('wallet_project_limit')) {
      throw new HttpError(409, `A Midnight Wallet can own up to ${maximumProjectsPerWallet} Projects`);
    }
    throw error;
  }
  return json(201, {
    project: {
      projectId: selectedProjectId,
      name,
      nameJa: null,
      timeZone,
      ...boundary,
      utcDayStartMinute: utcDayStartMinute(boundary),
      createdAt,
    },
    projectCount: current.length + 1,
    maximumProjects: maximumProjectsPerWallet,
  });
}

function policyOperationView(row: PolicyOperationRow) {
  return {
    operationId: row.id,
    projectId: row.project_id,
    policyId: row.policy_id,
    name: row.name,
    mode: row.mode,
    minimum: row.minimum_centi_celsius === null ? null : row.minimum_centi_celsius / 100,
    maximum: row.maximum_centi_celsius === null ? null : row.maximum_centi_celsius / 100,
    status: row.status,
    stage: row.stage,
    policyKey: row.policy_key,
    policyTxId: row.policy_tx_id,
    error: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function policyCentiBound(name: string, value: unknown): number | null {
  if (value === null) return null;
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < -10_000
    || value > 0xffff_ffff - 10_000
  ) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function policyAuthorization(body: Record<string, unknown>): BrowserPolicyAuthorization {
  const projectId = safeIdentifier('projectId', body.projectId);
  const policyId = safeIdentifier('policyId', body.policyId);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new Error('Policy name must contain 1-80 printable characters');
  }
  const mode = body.mode;
  if (!['closed-range', 'upper-bound', 'lower-bound'].includes(String(mode))) {
    throw new Error('Policy mode is invalid');
  }
  const minimumCentiCelsius = policyCentiBound('minimumCentiCelsius', body.minimumCentiCelsius);
  const maximumCentiCelsius = policyCentiBound('maximumCentiCelsius', body.maximumCentiCelsius);
  if (
    (mode === 'closed-range' && (
      minimumCentiCelsius === null
      || maximumCentiCelsius === null
      || minimumCentiCelsius > maximumCentiCelsius
    ))
    || (mode === 'upper-bound' && (minimumCentiCelsius !== null || maximumCentiCelsius === null))
    || (mode === 'lower-bound' && (minimumCentiCelsius === null || maximumCentiCelsius !== null))
  ) throw new Error('Policy bounds are not canonical');
  const challengeId = safeIdentifier('challengeId', body.challengeId);
  const nonce = typeof body.nonce === 'string' && body.nonce.length <= 128 ? body.nonce : '';
  const timestamp = typeof body.timestamp === 'string' ? body.timestamp : '';
  if (!nonce || !Number.isFinite(Date.parse(timestamp))) {
    throw new Error('Policy timestamp or nonce is invalid');
  }
  if (!body.walletSignature || typeof body.walletSignature !== 'object' || Array.isArray(body.walletSignature)) {
    throw new Error('Wallet signature is required');
  }
  const walletSignature = body.walletSignature as Partial<BrowserWalletSignature>;
  if (
    typeof walletSignature.data !== 'string'
    || typeof walletSignature.signature !== 'string'
    || typeof walletSignature.verifyingKey !== 'string'
    || walletSignature.data.length > 4096
    || walletSignature.signature.length > 1024
    || walletSignature.verifyingKey.length > 1024
  ) throw new Error('Policy Wallet signature is invalid');
  return {
    projectId,
    policyId,
    name,
    mode: mode as BrowserPolicyMode,
    minimumCentiCelsius,
    maximumCentiCelsius,
    challengeId,
    nonce,
    timestamp,
    walletSignature: walletSignature as BrowserWalletSignature,
  };
}

async function projectPolicyCount(database: SqlDatabase, projectId: string): Promise<number> {
  const row = await database.first<{ policy_count: number }>(
    `SELECT
       (SELECT COUNT(*) FROM project_policies WHERE project_id = ?1)
       +
       (SELECT COUNT(*) FROM browser_policy_operations
        WHERE project_id = ?1
          AND status IN ('queued', 'running', 'retrying')) AS policy_count`,
    [projectId],
  );
  return Number(row?.policy_count ?? 0);
}

async function issuePolicyChallenge(request: Request, env: Env): Promise<Response> {
  const database = createSqlDatabase(env);
  const session = await projectSession(request, database);
  const body = await readJson(request);
  const projectId = safeIdentifier('projectId', body.projectId);
  if (!await walletOwnsProject(database, session.wallet_key_sha256, projectId)) {
    throw new HttpError(403, 'Project does not belong to the connected Midnight Wallet');
  }
  if (await projectPolicyCount(database, projectId) >= maximumPoliciesPerProject) {
    throw new HttpError(409, `A Project can contain up to ${maximumPoliciesPerProject} Policies`);
  }
  const ip = request.headers.get('CF-Connecting-IP')?.trim() || 'unknown';
  for (const key of [`policy-wallet:${session.wallet_key_sha256}`, `policy-ip:${ip}`]) {
    if (!(await env.AUTH_RATE_LIMITER.limit({ key })).success) {
      return json(429, { error: 'Policy creation rate limit exceeded' });
    }
  }
  const policyId = `policy-${crypto.randomUUID()}`;
  const challengeId = `policy_${crypto.randomUUID()}`;
  const nonce = randomToken();
  const now = Math.floor(Date.now() / 1000);
  await database.execute(
    `INSERT INTO browser_policy_challenges (
       id, wallet_key_sha256, project_id, policy_id, nonce_sha256,
       issued_at, expires_at, consumed_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)`,
    [
      challengeId,
      session.wallet_key_sha256,
      projectId,
      policyId,
      await sha256Hex(nonce),
      now,
      now + challengeTtlSeconds,
    ],
  );
  return json(200, {
    projectId,
    policyId,
    challengeId,
    nonce,
    expiresAt: new Date((now + challengeTtlSeconds) * 1000).toISOString(),
  });
}

async function listPolicies(request: Request, env: Env): Promise<Response> {
  const database = createSqlDatabase(env);
  const session = await projectSession(request, database);
  const projectId = safeIdentifier('projectId', new URL(request.url).searchParams.get('projectId'));
  if (!await walletOwnsProject(database, session.wallet_key_sha256, projectId)) {
    throw new HttpError(403, 'Project does not belong to the connected Midnight Wallet');
  }
  const [registered, operations] = await Promise.all([
    database.all<PolicyRow>(
      `SELECT p.policy_id, p.name, p.policy_key, p.mode, p.minimum, p.maximum, p.value_scale,
              p.sensor_type_code, p.unit_code, p.policy_version, p.registered_tx_id
       FROM threshold_policies p
       JOIN project_policies pp ON pp.policy_id = p.policy_id
       WHERE pp.project_id = ?1 AND p.status = 'registered'
       ORDER BY p.registered_at, p.policy_id`,
      [projectId],
    ),
    database.all<PolicyOperationRow>(
      `SELECT * FROM browser_policy_operations
       WHERE project_id = ?1 AND wallet_key_sha256 = ?2
       ORDER BY created_at DESC`,
      [projectId, session.wallet_key_sha256],
    ),
  ]);
  return json(200, {
    policies: registered.map((row) => ({
      policyId: row.policy_id,
      name: row.name ?? row.policy_id,
      policyKey: row.policy_key,
      mode: row.mode,
      minimum: row.minimum,
      maximum: row.maximum,
      version: row.policy_version,
      registeredTxId: row.registered_tx_id,
      status: 'registered',
    })),
    operations: operations.map(policyOperationView),
    maximumPolicies: maximumPoliciesPerProject,
  });
}

async function createPolicy(request: Request, env: Env): Promise<Response> {
  const database = createSqlDatabase(env);
  const session = await projectSession(request, database);
  const authorization = policyAuthorization(await readJson(request));
  if (!await walletOwnsProject(database, session.wallet_key_sha256, authorization.projectId)) {
    throw new HttpError(403, 'Project does not belong to the connected Midnight Wallet');
  }
  if (Math.abs(Date.now() - Date.parse(authorization.timestamp)) > timestampToleranceSeconds * 1000) {
    throw new Error('Policy signature timestamp is outside the allowed window');
  }
  const challenge = await database.first<PolicyChallengeRow>(
    `SELECT id, wallet_key_sha256, project_id, policy_id, nonce_sha256, expires_at, consumed_at
     FROM browser_policy_challenges WHERE id = ?1`,
    [authorization.challengeId],
  );
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !challenge
    || challenge.wallet_key_sha256 !== session.wallet_key_sha256
    || challenge.project_id !== authorization.projectId
    || challenge.policy_id !== authorization.policyId
    || challenge.nonce_sha256 !== await sha256Hex(authorization.nonce)
    || challenge.expires_at < nowSeconds
    || challenge.consumed_at !== null
  ) throw new Error('Policy challenge is invalid, expired, or already used');
  const canonical = browserPolicyCanonicalMessage(authorization);
  if (authorization.walletSignature.data !== canonical) {
    throw new Error('Midnight Wallet signed data does not match the Policy request');
  }
  const walletKeySha256 = await sha256Hex(authorization.walletSignature.verifyingKey);
  if (walletKeySha256 !== session.wallet_key_sha256) {
    throw new Error('Policy Wallet does not match the active Project session');
  }
  verifyBrowserPolicyAuthorization(authorization);
  const consumed = await database.execute(
    `UPDATE browser_policy_challenges SET consumed_at = ?1
     WHERE id = ?2 AND consumed_at IS NULL AND expires_at >= ?1`,
    [nowSeconds, authorization.challengeId],
  );
  if (consumed !== 1) throw new Error('Policy challenge was already consumed');
  const operationId = `pol_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  try {
    await database.execute(
      `INSERT INTO browser_policy_operations (
         id, wallet_key_sha256, project_id, policy_id, name, mode,
         minimum_centi_celsius, maximum_centi_celsius, browser_authorization_json,
         status, stage, created_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'queued', 'queued', ?10, ?10)`,
      [
        operationId,
        walletKeySha256,
        authorization.projectId,
        authorization.policyId,
        authorization.name,
        authorization.mode,
        authorization.minimumCentiCelsius,
        authorization.maximumCentiCelsius,
        JSON.stringify(authorization),
        now,
      ],
    );
  } catch (error) {
    if (errorMessage(error).includes('project_policy_limit')) {
      throw new HttpError(409, `A Project can contain up to ${maximumPoliciesPerProject} Policies`);
    }
    throw error;
  }
  try {
    await env.SPONSOR_QUEUE.send({
      kind: 'browser-policy-provisioning',
      operationId,
    } satisfies BrowserPolicyQueueMessage);
  } catch (error) {
    // D1 is authoritative after admission. The minute dispatcher retries a
    // queued operation, so a transient Queue producer failure must not turn a
    // valid, signed request into a client-owned failure.
    console.error(JSON.stringify({
      message: 'browser_policy_initial_queue_send_failed',
      operationId,
      projectId: authorization.projectId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: errorMessage(error).slice(0, 1_000),
    }));
  }
  const operation = await database.first<PolicyOperationRow>(
    'SELECT * FROM browser_policy_operations WHERE id = ?1',
    [operationId],
  );
  if (!operation) throw new Error('Policy operation was not stored');
  return json(202, policyOperationView(operation));
}

async function policyOperation(request: Request, env: Env, operationId: string): Promise<Response> {
  const database = createSqlDatabase(env);
  const session = await projectSession(request, database);
  const operation = await database.first<PolicyOperationRow>(
    `SELECT * FROM browser_policy_operations
     WHERE id = ?1 AND wallet_key_sha256 = ?2`,
    [operationId, session.wallet_key_sha256],
  );
  if (!operation) return json(404, { error: 'Policy operation was not found' });
  return json(200, policyOperationView(operation));
}

async function configuration(request: Request, env: Env): Promise<Response> {
  const contractAddress = env.PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS?.trim();
  if (!contractAddress) return json(503, { error: 'Active Midnight contract is not configured' });
  const url = new URL(request.url);
  const selectedProjectId = safeIdentifier(
    'projectId',
    url.searchParams.get('projectId') || defaultProjectId,
  );
  const database = createSqlDatabase(env);
  if (selectedProjectId !== defaultProjectId || request.headers.has('Authorization')) {
    const session = await projectSession(request, database);
    if (!await walletOwnsProject(database, session.wallet_key_sha256, selectedProjectId)) {
      throw new HttpError(403, 'Project does not belong to the connected Midnight Wallet');
    }
  }
  const rows = await database.all<PolicyRow>(
     `SELECT p.policy_id, p.name, p.policy_key, p.mode, p.minimum, p.maximum, p.value_scale,
            p.sensor_type_code, p.unit_code, p.policy_version, p.registered_tx_id
     FROM threshold_policies p
     JOIN project_policies pp ON pp.policy_id = p.policy_id
     WHERE pp.project_id = ?1 AND p.status = 'registered' AND p.contract_address = ?2
       AND p.registered_tx_id IS NOT NULL
     ORDER BY p.policy_version DESC`,
    [selectedProjectId, contractAddress],
  );
  const boundary = await operationalDayBoundary(database, selectedProjectId);
  const processingSchedule = await serverProcessingSchedule(env);
  return json(200, {
    network: 'preprod',
    projectId: selectedProjectId,
    contractAddress,
    serviceUrl: new URL(request.url).origin,
    operationalDay: boundary,
    processingSchedule,
    policies: rows.map((row) => ({
      policyId: row.policy_id,
      name: row.name ?? row.policy_id,
      policyKey: row.policy_key,
      mode: row.mode,
      minimum: row.minimum ?? 0,
      maximum: row.maximum ?? 0,
      valueScale: row.value_scale,
      sensorTypeCode: row.sensor_type_code,
      unitCode: row.unit_code,
      version: row.policy_version,
      registeredTxId: row.registered_tx_id,
    })),
    maximumPolicies: maximumPoliciesPerProject,
  });
}

async function issueChallenge(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const deviceId = safeIdentifier('deviceId', body.deviceId, 80);
  const selectedProjectId = safeIdentifier('projectId', body.projectId);
  const keyId = safeP256KeyId('keyId', body.keyId);
  const database = createSqlDatabase(env);
  const session = await projectSession(request, database);
  if (!await walletOwnsProject(database, session.wallet_key_sha256, selectedProjectId)) {
    throw new HttpError(403, 'Project does not belong to the connected Midnight Wallet');
  }
  if (deviceId !== await deriveBrowserWalletDeviceId(session.wallet_key_sha256, selectedProjectId)) {
    throw new Error('Device ID does not match the connected Midnight Wallet and Project');
  }
  const ip = request.headers.get('CF-Connecting-IP')?.trim() || 'unknown';
  for (const key of [`provision-device:${deviceId}`, `provision-ip:${ip}`]) {
    if (!(await env.AUTH_RATE_LIMITER.limit({ key })).success) {
      return json(429, { error: 'Provisioning rate limit exceeded' });
    }
  }
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const nonce = base64Url(bytes.buffer);
  const now = Math.floor(Date.now() / 1000);
  const challengeId = crypto.randomUUID();
  await database.execute(
    `INSERT INTO browser_provisioning_challenges (
       id, device_id, project_id, key_id, nonce_sha256, issued_at, expires_at, consumed_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)`,
    [
      challengeId,
      deviceId,
      selectedProjectId,
      keyId,
      await sha256Hex(nonce),
      now,
      now + challengeTtlSeconds,
    ],
  );
  return json(200, {
    challengeId,
    nonce,
    expiresAt: new Date((now + challengeTtlSeconds) * 1000).toISOString(),
  });
}

async function registerDevice(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const enrollment = await parseEnrollment(body.enrollment);
  const deviceAuthority = typeof body.deviceAuthority === 'string'
    ? body.deviceAuthority.trim().replace(/^0x/iu, '').toLowerCase()
    : '';
  if (!/^(?:[0-9a-f]{2}){32}$/u.test(deviceAuthority)) throw new Error('deviceAuthority is invalid');
  const policyId = safeIdentifier('policyId', body.policyId);
  const challengeId = safeIdentifier('challengeId', body.challengeId);
  const nonce = typeof body.nonce === 'string' && body.nonce.length <= 128 ? body.nonce : '';
  const timestamp = typeof body.timestamp === 'string' ? body.timestamp : '';
  const timestampMs = Date.parse(timestamp);
  if (!nonce || !Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > timestampToleranceSeconds * 1000) {
    throw new Error('Provisioning timestamp or nonce is invalid');
  }
  if (!body.walletSignature || typeof body.walletSignature !== 'object' || Array.isArray(body.walletSignature)) {
    throw new Error('Wallet signature is required');
  }
  const walletSignature = body.walletSignature as Partial<BrowserWalletSignature>;
  if (
    typeof walletSignature.data !== 'string'
    || typeof walletSignature.signature !== 'string'
    || typeof walletSignature.verifyingKey !== 'string'
    || walletSignature.data.length > 2048
    || walletSignature.signature.length > 1024
    || walletSignature.verifyingKey.length > 1024
  ) throw new Error('Wallet signature is invalid');
  const database = createSqlDatabase(env);
  const session = await projectSession(request, database);
  if (!await walletOwnsProject(database, session.wallet_key_sha256, enrollment.projectId)) {
    throw new HttpError(403, 'Project does not belong to the connected Midnight Wallet');
  }
  const challenge = await database.first<ChallengeRow>(
    `SELECT id, device_id, project_id, key_id, nonce_sha256, expires_at, consumed_at
     FROM browser_provisioning_challenges WHERE id = ?1`,
    [challengeId],
  );
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !challenge
    || challenge.device_id !== enrollment.deviceId
    || challenge.project_id !== enrollment.projectId
    || challenge.key_id !== enrollment.keyId
    || challenge.nonce_sha256 !== await sha256Hex(nonce)
    || challenge.expires_at < nowSeconds
    || challenge.consumed_at !== null
  ) throw new Error('Provisioning challenge is invalid, expired, or already used');
  const authorization: BrowserProvisioningAuthorization = {
    deviceId: enrollment.deviceId,
    keyId: enrollment.keyId,
    deviceAuthority,
    policyId,
    challengeId,
    nonce,
    timestamp,
    walletSignature: walletSignature as BrowserWalletSignature,
  };
  const canonical = browserProvisioningCanonicalMessage(authorization);
  if (walletSignature.data !== canonical) {
    throw new Error('Midnight Wallet signed data does not match the provisioning request');
  }
  const walletKeySha256 = await sha256Hex(walletSignature.verifyingKey);
  if (walletKeySha256 !== session.wallet_key_sha256) {
    throw new Error('Provisioning Wallet does not match the active Project session');
  }
  const expectedDeviceId = await deriveBrowserWalletDeviceId(walletKeySha256, enrollment.projectId);
  if (enrollment.deviceId !== expectedDeviceId) {
    throw new Error('Device ID does not match the connected Midnight Wallet');
  }
  verifyBrowserProvisioningAuthorization(authorization);
  const consumed = await database.execute(
    `UPDATE browser_provisioning_challenges SET consumed_at = ?1
     WHERE id = ?2 AND consumed_at IS NULL AND expires_at >= ?1`,
    [nowSeconds, challengeId],
  );
  if (consumed !== 1) throw new Error('Provisioning challenge was already consumed');
  const contractAddress = env.PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS?.trim();
  if (!contractAddress) throw new Error('Active Midnight contract is not configured');
  await policy(database, policyId, contractAddress, enrollment.projectId);
  const walletDevice = await database.first<WalletDeviceRow>(
    `SELECT wallet_key_sha256, device_id, project_id, status, updated_at
     FROM browser_wallet_devices
     WHERE (wallet_key_sha256 = ?1 AND project_id = ?3) OR device_id = ?2
     LIMIT 1`,
    [walletKeySha256, enrollment.deviceId, enrollment.projectId],
  );
  const existing = await existingRegistration(database, enrollment.deviceId, enrollment.projectId);
  const existingView = existing ? registrationView(existing, contractAddress) : null;
  if (existingView) {
    if (existing?.midnight_device_authority !== deviceAuthority || existing.key_id !== enrollment.keyId) {
      throw new Error('Existing Device registration belongs to another identity');
    }
    if (existingView.policyId !== policyId) {
      throw new HttpError(
        409,
        'This Device is already registered with another Threshold Policy; create a new Project/Device to use a different Policy',
      );
    }
    if (!walletOwnsDeviceRegistration(walletDevice, walletKeySha256, enrollment.deviceId)) {
      return json(409, { error: 'Existing Device registration belongs to another Midnight Wallet' });
    }
    return json(200, existingView);
  }
  if (walletDevice && (
    walletDevice.device_id !== enrollment.deviceId
    || walletDevice.wallet_key_sha256 !== walletKeySha256
  )) {
    return json(409, { error: 'This Midnight Wallet is already bound to another Device in this Project' });
  }
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const leaseAcquired = await database.execute(
    `INSERT INTO browser_wallet_devices (
       wallet_key_sha256, device_id, project_id, status, created_at, updated_at
     ) VALUES (?1, ?2, ?3, 'provisioning', ?4, ?4)
     ON CONFLICT(wallet_key_sha256, project_id) DO UPDATE SET
       status = 'provisioning', updated_at = excluded.updated_at
     WHERE browser_wallet_devices.device_id = excluded.device_id
       AND (browser_wallet_devices.status = 'failed'
         OR (browser_wallet_devices.status = 'provisioning'
           AND browser_wallet_devices.updated_at <= ?5))`,
    [walletKeySha256, enrollment.deviceId, enrollment.projectId, now, staleBefore],
  );
  if (leaseAcquired !== 1) {
    return json(409, { error: 'Device registration is already in progress or complete' });
  }
  try {
    await database.execute(
      `INSERT INTO devices (
         id, project_id, name, device_type, sensor_type, unit,
         expected_interval_minutes, normal_min, normal_max,
         threshold_policy_version, sponsor_daily_limit
       ) VALUES (?1, ?2, ?1, 'Browser Sensor Device', 'temperature', '°C', 1, NULL, NULL, ?3, ?4)
       ON CONFLICT(id) DO UPDATE SET
         threshold_policy_version = excluded.threshold_policy_version,
         sponsor_daily_limit = excluded.sponsor_daily_limit
       WHERE devices.project_id = excluded.project_id
         AND devices.midnight_registry_status = 'unregistered'`,
      [enrollment.deviceId, enrollment.projectId, policyId, sponsorDailyLimit],
    );
  } catch (error) {
    await database.execute(
      `UPDATE browser_wallet_devices SET status = 'failed', updated_at = ?1
       WHERE wallet_key_sha256 = ?2 AND device_id = ?3 AND project_id = ?4`,
      [new Date().toISOString(), walletKeySha256, enrollment.deviceId, enrollment.projectId],
    );
    throw error;
  }
  const assignmentId = `${enrollment.deviceId}-${policyId}-wave1`;
  const operationId = `prv_${crypto.randomUUID()}`;
  const progressTokenBytes = new Uint8Array(32);
  crypto.getRandomValues(progressTokenBytes);
  const progressToken = base64Url(progressTokenBytes.buffer);
  try {
    await database.execute(
      `INSERT INTO browser_provisioning_operations (
         id, progress_token_sha256, wallet_key_sha256, device_id, project_id,
         policy_id, assignment_id, enrollment_json, device_authority,
         browser_authorization_json, status, stage, created_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'queued', 'queued', ?11, ?11)`,
      [
        operationId,
        await sha256Hex(progressToken),
        walletKeySha256,
        enrollment.deviceId,
        enrollment.projectId,
        policyId,
        assignmentId,
        JSON.stringify(enrollment),
        deviceAuthority,
        JSON.stringify(authorization),
        now,
      ],
    );
  } catch (error) {
    const failedAt = new Date().toISOString();
    await database.batch([
      {
        sql: `UPDATE browser_provisioning_operations
              SET status = 'failed', stage = 'failed', error_message = ?1, updated_at = ?2
              WHERE id = ?3`,
        parameters: [errorMessage(error).slice(0, 2_000), failedAt, operationId],
      },
      {
        sql: `UPDATE browser_wallet_devices SET status = 'failed', updated_at = ?1
              WHERE wallet_key_sha256 = ?2 AND device_id = ?3 AND project_id = ?4`,
        parameters: [failedAt, walletKeySha256, enrollment.deviceId, enrollment.projectId],
      },
    ]);
    throw error;
  }
  try {
    await env.SPONSOR_QUEUE.send({
      kind: 'browser-device-provisioning',
      operationId,
    } satisfies BrowserProvisioningQueueMessage);
  } catch (error) {
    // The operation and Device lease are durable in D1. Keep them queued for
    // dispatchPendingBrowserProvisioning instead of asking the Browser to
    // resubmit the same signed intent.
    console.error(JSON.stringify({
      message: 'browser_device_initial_queue_send_failed',
      operationId,
      deviceId: enrollment.deviceId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: errorMessage(error).slice(0, 1_000),
    }));
  }
  return json(202, {
    operationId,
    progressToken,
    statusUrl: `/api/v1/provisioning/operations/${encodeURIComponent(operationId)}`,
    status: 'queued',
    stage: 'queued',
    processingSchedule: await serverProcessingSchedule(env, now),
  });
}

export async function handleProvisioningApi(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  try {
    if (request.method === 'POST' && url.pathname === '/api/v1/projects/challenge') {
      return await issueProjectChallenge(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/projects/session') {
      return await createProjectSession(request, env);
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/projects') {
      return await listProjects(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/projects') {
      return await createProject(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/policies/challenge') {
      return await issuePolicyChallenge(request, env);
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/policies') {
      return await listPolicies(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/policies') {
      return await createPolicy(request, env);
    }
    const policyOperationMatch = url.pathname.match(/^\/api\/v1\/policy-operations\/([^/]+)$/u);
    if (request.method === 'GET' && policyOperationMatch?.[1]) {
      return await policyOperation(
        request,
        env,
        safeIdentifier('operationId', decodeURIComponent(policyOperationMatch[1])),
      );
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/provisioning/configuration') {
      return await configuration(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/provisioning/challenge') {
      return await issueChallenge(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/provisioning/devices') {
      return await registerDevice(request, env);
    }
    const operationMatch = url.pathname.match(/^\/api\/v1\/provisioning\/operations\/([^/]+)$/u);
    if (request.method === 'GET' && operationMatch?.[1]) {
      return await provisioningOperation(
        request,
        env,
        safeIdentifier('operationId', decodeURIComponent(operationMatch[1])),
      );
    }
    return null;
  } catch (error) {
    console.error(JSON.stringify({
      message: 'browser_device_provisioning_failed',
      pathname: url.pathname,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: errorMessage(error),
    }));
    return json(error instanceof HttpError ? error.status : 400, { error: errorMessage(error) });
  }
}
