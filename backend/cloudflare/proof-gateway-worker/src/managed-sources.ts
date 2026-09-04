import { operationalPeriodDate } from '@midnight-demo/shared/operational-day';
import type {
  HourThresholdResult,
  PreparedDailyExtremaAttestation,
  ThresholdPolicyDescriptor,
} from '@midnight-demo/shared';

import {
  decryptConnectorCredential,
  encryptConnectorCredential,
  fetchFixedWindowMeasurements,
  fixedOperationalWindow,
  managedMeasurementGroupKey,
  managedSourceIdentifiers,
  ManagedSourceError,
  requireManagedIdentifier,
  requirePeriodDate,
  sha256Hex,
  validateManagedEndpoint,
  type HourlyMeasurementSummary,
} from './managed-source-core.js';
import {
  decryptManagedArtifact,
  encryptManagedArtifact,
  type ManagedArtifactBinding,
  type ManagedArtifactEnvelope,
} from './managed-artifact-crypto.js';
import {
  authorityContainerRequest,
  ensureAuthorityRuntime,
  type AuthorityRuntimeRole,
} from './authority-container.js';
import {
  sponsorWalletOperatingWindow,
  sponsorWorkIsEligible,
} from './sponsor-operating-window.js';
import { sponsorWalletCanSubmit } from './sponsor-policy.js';
import { createSqlDatabase, type SqlDatabase } from './storage/index.js';
import { authorizeSystemOperator } from './system-operations-auth.js';
import {
  canOperateProject,
  canViewProject,
  hasAnySystemOperatorAccess,
  issueSystemOperatorCsrfToken,
  loadSystemOperatorAccess,
  requireSystemOperatorMutationSecurity,
  visibleProjectIds,
  type SystemOperatorAccess,
} from './system-operator-security.js';

const queueName = 'midnight-managed-source-jobs';
const maximumBodyBytes = 64 * 1024;
const maximumAttempts = 12;
const fetchLeaseMilliseconds = 2 * 60_000;
const managedPreparationTimeoutMilliseconds = 30_000;
const managedMutationTimeoutMilliseconds = 5 * 60_000;
const managedMutationLeaseMilliseconds = managedMutationTimeoutMilliseconds + 60_000;
const registrationLeaseMilliseconds = managedMutationLeaseMilliseconds;
const sponsorHealthTimeoutMilliseconds = 10_000;
const defaultRetrySeconds = 60;
const privateArtifactRetentionMilliseconds = 7 * 24 * 60 * 60_000;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const bytes32Pattern = /^(?:[0-9a-f]{2}){32}$/u;
const transactionIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;

type ManagedSourceStatus = 'provisioning' | 'active' | 'paused' | 'action_required';
type ManagedRunStatus =
  | 'pending_fetch'
  | 'fetching'
  | 'fetch_retry'
  | 'proof_queued'
  | 'proving'
  | 'proof_retry'
  | 'confirmed'
  | 'action_required'
  | 'dead_lettered';

interface ManagedSourceRow {
  id: string;
  project_id: string;
  device_id: string;
  name: string;
  adapter_type: 'fixed-window-json';
  adapter_version: number;
  endpoint_url: string;
  source_sensor_id: string;
  auth_type: 'bearer';
  credential_envelope: string;
  credential_key_version: number;
  sensor_type: 'temperature';
  unit: '°C';
  policy_id: string;
  assignment_id: string;
  first_period_date: string;
  fetch_delay_minutes: number;
  response_max_bytes: number;
  status: ManagedSourceStatus;
  stage: string;
  attempt_count: number;
  available_after: string;
  device_authority: string | null;
  device_tx_id: string | null;
  assignment_tx_id: string | null;
  last_error_code: string | null;
  last_error_summary: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ManagedSourceOperationalRow extends ManagedSourceRow {
  time_zone_offset_minutes: number;
  local_day_start_hour: number;
  utc_day_start_minute: number | null;
  midnight_contract_address: string | null;
  midnight_device_commitment: string | null;
  assignment_key: string | null;
  policy_key: string;
  mode: ThresholdPolicyDescriptor['mode'];
  minimum: number | null;
  maximum: number | null;
  value_scale: number;
  sensor_type_code: number;
  unit_code: number;
  policy_version: number;
}

interface ManagedRunRow {
  id: string;
  source_id: string;
  project_id: string;
  device_id: string;
  period_date: string;
  period_start: string;
  period_end: string;
  status: ManagedRunStatus;
  stage: string;
  fetch_attempt_count: number;
  proof_attempt_count: number;
  available_after: string;
  lease_expires_at: string | null;
  source_http_status: number | null;
  source_response_bytes: number | null;
  sample_count: number | null;
  observed_hour_count: number | null;
  private_artifact_key: string | null;
  private_artifact_expires_at: string | null;
  proof_job_id: string | null;
  last_error_code: string | null;
  last_error_summary: string | null;
  fetched_at: string | null;
  proof_started_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ManagedArtifact {
  schemaVersion: 1;
  sourceId: string;
  runId: string;
  proofJobId: string;
  createdAt: string;
  attestation: PreparedDailyExtremaAttestation;
  hourResults: HourThresholdResult[];
  thresholdSatisfied: boolean;
  summaries: HourlyMeasurementSummary[];
}

function managedArtifactEncryptionKey(env: Env): string {
  const key = env.MANAGED_ARTIFACT_ENCRYPTION_KEY?.trim();
  if (!key) throw new Error('Managed artifact encryption is not configured');
  return key;
}

function managedArtifactBinding(
  objectKey: string,
  sourceId: string,
  runId: string,
  periodDate: string,
): ManagedArtifactBinding {
  return { objectKey, sourceId, runId, periodDate };
}

interface ManagedProofRow {
  id: string;
  status: string;
  proof_generated_at: string | null;
  attest_tx_id: string | null;
  attest_tx_hash: string | null;
  sponsor_fee_specks: string | null;
  sponsor_transaction_bytes: number | null;
}

// D1 includes writes performed by AFTER audit triggers in meta.changes. Every
// guarded claim below targets one business row, so any positive count means
// that this delivery acquired the claim.
export function managedClaimWasApplied(changes: number): boolean {
  return Number.isInteger(changes) && changes > 0;
}

interface ManagedRegistrationResult {
  deviceCommitment: string;
  deviceAuthority: string;
  policyKey: string;
  assignmentKey: string;
  deviceTxId: string;
  assignmentTxId: string;
}

interface ManagedAttestationResult {
  transactionId: string;
  transactionHash: string;
  blockHeight: string;
  proofGeneratedAt: string;
  feeSpecks: string;
  transactionBytes: number;
  replayRecovered: boolean;
  idempotent: boolean;
}

interface ManagedProgressEvent {
  type: 'progress';
  stage: string;
  proofGeneratedAt?: string;
  transactionId?: string;
  transactionHash?: string;
  feeSpecks?: string;
  transactionBytes?: number;
  blockHeight?: string;
}

type ManagedStreamEvent =
  | ManagedProgressEvent
  | { type: 'result'; result: ManagedAttestationResult }
  | { type: 'error'; error: string };

export type ManagedSourceQueueMessage =
  | { kind: 'provision-source'; sourceId: string }
  | { kind: 'fetch-window'; runId: string }
  | { kind: 'attest-window'; runId: string };

function json(status: number, value: unknown): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function projectMutationDenied(access: SystemOperatorAccess, projectId: string): Response {
  return canViewProject(access, projectId)
    ? json(403, { error: 'Operator role is required for this Project' })
    : json(404, { error: 'Project was not found' });
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
}

function retryDelay(attempt: number, requested: number | null = null): number {
  if (requested !== null) return Math.max(1, Math.min(3_600, requested));
  return Math.min(15 * 60, defaultRetrySeconds * (2 ** Math.min(4, Math.max(0, attempt - 1))));
}

function isQueueMessage(value: unknown): value is ManagedSourceQueueMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { kind?: unknown; sourceId?: unknown; runId?: unknown };
  if (candidate.kind === 'provision-source') {
    return typeof candidate.sourceId === 'string' && transactionIdPattern.test(candidate.sourceId);
  }
  if (candidate.kind === 'fetch-window' || candidate.kind === 'attest-window') {
    return typeof candidate.runId === 'string' && transactionIdPattern.test(candidate.runId);
  }
  return false;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > maximumBodyBytes) {
    throw new Error('Request body is too large');
  }
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

function requiredString(
  body: Record<string, unknown>,
  name: string,
  maximum: number,
): string {
  const value = body[name];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) {
    throw new Error(`${name} is invalid`);
  }
  return value.trim();
}

function integer(
  body: Record<string, unknown>,
  name: string,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const value = body[name] ?? fallback;
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${name} is invalid`);
  }
  return Number(value);
}

function sourceView(row: ManagedSourceRow) {
  return {
    sourceId: row.id,
    projectId: row.project_id,
    deviceId: row.device_id,
    name: row.name,
    adapter: `${row.adapter_type}-v${row.adapter_version}`,
    endpointUrl: row.endpoint_url,
    sourceSensorId: row.source_sensor_id,
    authType: row.auth_type,
    sensorType: row.sensor_type,
    unit: row.unit,
    policyId: row.policy_id,
    assignmentId: row.assignment_id,
    firstPeriodDate: row.first_period_date,
    fetchDelayMinutes: row.fetch_delay_minutes,
    responseMaxBytes: row.response_max_bytes,
    status: row.status,
    stage: row.stage,
    attemptCount: row.attempt_count,
    availableAfter: row.available_after,
    deviceAuthority: row.device_authority,
    deviceTxId: row.device_tx_id,
    assignmentTxId: row.assignment_tx_id,
    errorCode: row.last_error_code,
    errorSummary: row.last_error_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function runView(row: ManagedRunRow) {
  return {
    runId: row.id,
    sourceId: row.source_id,
    projectId: row.project_id,
    deviceId: row.device_id,
    periodDate: row.period_date,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    stage: row.stage,
    fetchAttemptCount: row.fetch_attempt_count,
    proofAttemptCount: row.proof_attempt_count,
    availableAfter: row.available_after,
    sourceHttpStatus: row.source_http_status,
    sourceResponseBytes: row.source_response_bytes,
    sampleCount: row.sample_count,
    observedHourCount: row.observed_hour_count,
    stoppedHourCount: row.observed_hour_count === null ? null : 24 - row.observed_hour_count,
    proofJobId: row.proof_job_id,
    errorCode: row.last_error_code,
    errorSummary: row.last_error_summary,
    fetchedAt: row.fetched_at,
    proofStartedAt: row.proof_started_at,
    confirmedAt: row.confirmed_at,
    verificationUrl: row.proof_job_id ? `/#/verify/${encodeURIComponent(row.proof_job_id)}` : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function runDetail(database: SqlDatabase, run: ManagedRunRow) {
  const [hours, proof] = await Promise.all([
    database.all<{
      period_start: string;
      period_end: string;
      sample_count: number;
      minimum: number;
      maximum: number;
      average: number;
    }>(
      `SELECT period_start, period_end, sample_count, minimum, maximum, average
       FROM measurement_windows
       WHERE device_id = ?1 AND project_id = ?2
         AND period_start >= ?3 AND period_end <= ?4
       ORDER BY period_start ASC`,
      [run.device_id, run.project_id, run.period_start, run.period_end],
    ),
    run.proof_job_id
      ? database.first<{
        status: string;
        hour_results: string | null;
        threshold_satisfied: number;
        proof_generated_at: string | null;
        attest_tx_id: string | null;
        attest_tx_hash: string | null;
        block_height: string | null;
        sponsor_fee_specks: string | null;
      }>('SELECT * FROM daily_proof_jobs WHERE id = ?1', [run.proof_job_id])
      : Promise.resolve(null),
  ]);
  const byStart = new Map(hours.map((hour) => [hour.period_start, hour]));
  const start = Date.parse(run.period_start);
  const hourResults = proof?.hour_results
    ? [...proof.hour_results].map((value) => value === '0'
      ? 'no-data'
      : value === '1' ? 'within-threshold' : 'outside-threshold')
    : Array.from({ length: 24 }, () => null);
  return {
    run: runView(run),
    hours: Array.from({ length: 24 }, (_value, hourIndex) => {
      const periodStart = new Date(start + hourIndex * 3_600_000).toISOString();
      const row = byStart.get(periodStart);
      return {
        hourIndex,
        periodStart,
        periodEnd: new Date(start + (hourIndex + 1) * 3_600_000).toISOString(),
        sampleCount: row?.sample_count ?? 0,
        minimum: row?.minimum ?? null,
        maximum: row?.maximum ?? null,
        average: row?.average ?? null,
        thresholdResult: hourResults[hourIndex] ?? null,
      };
    }),
    proof: proof ? {
      status: proof.status,
      thresholdSatisfied: proof.threshold_satisfied === 1,
      proofGeneratedAt: proof.proof_generated_at,
      transactionId: proof.attest_tx_id,
      transactionHash: proof.attest_tx_hash,
      blockHeight: proof.block_height,
      feeSpecks: proof.sponsor_fee_specks,
    } : null,
  };
}

function activeContractAddress(env: Env): string {
  const address = env.PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS?.trim().toLowerCase() ?? '';
  if (!bytes32Pattern.test(address)) {
    throw new Error('Active Midnight contract is not configured');
  }
  return address;
}

export async function sourceOperationalRow(
  database: SqlDatabase,
  sourceId: string,
  contractAddress: string,
): Promise<ManagedSourceOperationalRow | null> {
  return database.first<ManagedSourceOperationalRow>(
    `SELECT s.*, p.time_zone_offset_minutes, p.local_day_start_hour,
            a.utc_day_start_minute, d.midnight_contract_address,
            d.midnight_device_commitment, a.assignment_key,
            tp.policy_key, tp.mode, tp.minimum, tp.maximum, tp.value_scale,
            tp.sensor_type_code, tp.unit_code, tp.policy_version
     FROM managed_sources s
     JOIN projects p ON p.id = s.project_id
     JOIN devices d ON d.id = s.device_id AND d.project_id = s.project_id
     JOIN project_policies pp ON pp.project_id = s.project_id
       AND pp.policy_id = s.policy_id
     JOIN threshold_policies tp ON tp.policy_id = pp.policy_id
       AND tp.contract_address = ?2
     LEFT JOIN policy_assignments a ON a.assignment_id = s.assignment_id
       AND a.device_id = s.device_id AND a.status = 'registered'
       AND a.contract_address = ?2
     WHERE s.id = ?1
       AND (s.status = 'provisioning' OR d.midnight_contract_address = ?2)`,
    [sourceId, contractAddress],
  );
}

async function containerRequest(
  env: Env,
  role: AuthorityRuntimeRole,
  pathname: string,
  headerName: string,
  headerValue: string,
  body: unknown,
  signal: AbortSignal,
): Promise<Response> {
  return authorityContainerRequest(env, role, pathname, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [headerName]: headerValue,
    },
    body: JSON.stringify(body),
    signal,
  });
}

async function requireManagedSponsorWallet(env: Env): Promise<void> {
  let health;
  try {
    const { probeSponsorWalletHealth } = await import('./sponsor.js');
    health = await probeSponsorWalletHealth(env, sponsorHealthTimeoutMilliseconds);
  } catch (error) {
    throw new Error(`Sponsor Wallet health is unavailable: ${errorMessage(error)}`);
  }
  if (!sponsorWalletCanSubmit(health)) {
    throw new Error(
      `Sponsor Wallet is not ready: phase=${health.phase}, `
      + `spendableDustCoins=${health.spendableDustCoins ?? 'unknown'}`,
    );
  }
}

async function withManagedOperationTimeout<T>(
  timeoutMs: number,
  timeoutCode: string,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(timeoutCode));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function deferProvisioningForSponsorWallet(
  message: Message<unknown>,
  database: SqlDatabase,
  sourceId: string,
  error: unknown,
): Promise<void> {
  const now = new Date();
  await database.execute(
    `UPDATE managed_sources SET stage = 'retry_waiting', available_after = ?1,
       last_error_code = 'managed_sponsor_wallet_not_ready', last_error_summary = ?2,
       updated_at = ?3
     WHERE id = ?4 AND status = 'provisioning' AND stage IN ('queued', 'retry_waiting')`,
    [
      new Date(now.valueOf() + defaultRetrySeconds * 1_000).toISOString(),
      errorMessage(error),
      now.toISOString(),
      sourceId,
    ],
  );
  console.log(JSON.stringify({
    message: 'managed_source_registration_deferred_for_sponsor_wallet',
    sourceId,
  }));
  message.retry({ delaySeconds: defaultRetrySeconds });
}

async function deferAttestationForSponsorWallet(
  message: Message<unknown>,
  database: SqlDatabase,
  run: ManagedRunRow,
  error: unknown,
): Promise<void> {
  const now = new Date();
  const availableAfter = new Date(
    now.valueOf() + defaultRetrySeconds * 1_000,
  ).toISOString();
  await database.batch([
    {
      sql: `UPDATE managed_source_runs SET status = 'proof_retry',
              stage = 'sponsor_wallet_waiting', available_after = ?1,
              lease_expires_at = NULL,
              last_error_code = 'managed_sponsor_wallet_not_ready',
              last_error_summary = ?2, updated_at = ?3
            WHERE id = ?4 AND status IN ('proof_queued', 'proof_retry')`,
      parameters: [availableAfter, errorMessage(error), now.toISOString(), run.id],
    },
    {
      sql: `UPDATE daily_proof_jobs SET status = 'retryable_failed',
              available_after = ?1, lease_expires_at = NULL,
              last_error_code = 'managed_sponsor_wallet_not_ready', updated_at = ?2
            WHERE id = ?3 AND origin = 'managed-api'
              AND status IN ('pending', 'retryable_failed')`,
      parameters: [availableAfter, now.toISOString(), run.proof_job_id],
    },
  ]);
  console.log(JSON.stringify({
    message: 'managed_attestation_deferred_for_sponsor_wallet',
    sourceId: run.source_id,
    runId: run.id,
  }));
  message.retry({ delaySeconds: defaultRetrySeconds });
}

async function deferProvisioningForAuthorityWallet(
  message: Message<unknown>,
  database: SqlDatabase,
  sourceId: string,
  error: unknown,
): Promise<void> {
  const now = new Date();
  await database.execute(
    `UPDATE managed_sources SET stage = 'retry_waiting', available_after = ?1,
       last_error_code = 'managed_fleet_authority_not_ready', last_error_summary = ?2,
       updated_at = ?3
     WHERE id = ?4 AND status = 'provisioning' AND stage IN ('queued', 'retry_waiting')`,
    [
      new Date(now.valueOf() + defaultRetrySeconds * 1_000).toISOString(),
      errorMessage(error),
      now.toISOString(),
      sourceId,
    ],
  );
  console.log(JSON.stringify({
    message: 'managed_source_registration_deferred_for_fleet_authority',
    sourceId,
  }));
  message.retry({ delaySeconds: defaultRetrySeconds });
}

async function deferAttestationForAuthorityWallet(
  message: Message<unknown>,
  database: SqlDatabase,
  run: ManagedRunRow,
  error: unknown,
): Promise<void> {
  const now = new Date();
  const availableAfter = new Date(
    now.valueOf() + defaultRetrySeconds * 1_000,
  ).toISOString();
  await database.batch([
    {
      sql: `UPDATE managed_source_runs SET status = 'proof_retry',
              stage = 'managed_attestor_waiting', available_after = ?1,
              lease_expires_at = NULL,
              last_error_code = 'managed_attestor_not_ready',
              last_error_summary = ?2, updated_at = ?3
            WHERE id = ?4 AND status IN ('proof_queued', 'proof_retry')`,
      parameters: [availableAfter, errorMessage(error), now.toISOString(), run.id],
    },
    {
      sql: `UPDATE daily_proof_jobs SET status = 'retryable_failed',
              available_after = ?1, lease_expires_at = NULL,
              last_error_code = 'managed_attestor_not_ready', updated_at = ?2
            WHERE id = ?3 AND origin = 'managed-api'
              AND status IN ('pending', 'retryable_failed')`,
      parameters: [availableAfter, now.toISOString(), run.proof_job_id],
    },
  ]);
  console.log(JSON.stringify({
    message: 'managed_attestation_deferred_for_managed_attestor',
    sourceId: run.source_id,
    runId: run.id,
  }));
  message.retry({ delaySeconds: defaultRetrySeconds });
}

async function readSmallJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (text.length > 64 * 1024) throw new Error('Private Container response is too large');
  if (!response.ok) {
    throw new Error(`Private Container returned HTTP ${response.status}: ${text.slice(0, 2_000)}`);
  }
  return JSON.parse(text) as T;
}

async function createSource(
  request: Request,
  env: Env,
  actorIdentifier: string,
  access: SystemOperatorAccess,
): Promise<Response> {
  try {
    const credentialKey = env.MANAGED_CONNECTOR_CREDENTIAL_KEY?.trim();
    if (!credentialKey) return json(503, { error: 'Managed connector encryption is not configured' });
    if (!env.MANAGED_ATTESTOR_ROOT_SECRET?.trim()) {
      return json(503, { error: 'Managed Attestor Authority is not configured' });
    }
    const body = await readJson(request);
    const sourceId = requireManagedIdentifier(body.sourceId, 'sourceId', 80);
    const projectId = requireManagedIdentifier(body.projectId, 'projectId');
    if (!canOperateProject(access, projectId)) {
      return projectMutationDenied(access, projectId);
    }
    const policyId = requireManagedIdentifier(body.policyId, 'policyId');
    const sourceSensorId = requireManagedIdentifier(body.sourceSensorId, 'sourceSensorId');
    const name = requiredString(body, 'name', 160);
    const endpointUrl = validateManagedEndpoint(requiredString(body, 'endpointUrl', 2_048));
    const bearerToken = requiredString(body, 'bearerToken', 4_096);
    const firstPeriodDate = requirePeriodDate(body.firstPeriodDate);
    const fetchDelayMinutes = integer(body, 'fetchDelayMinutes', 0, 1_440, 15);
    const responseMaxBytes = integer(body, 'responseMaxBytes', 1_024, 4 * 1_024 * 1_024, 1_048_576);
    const database = createSqlDatabase(env);
    const policy = await database.first<{
      policy_id: string;
      sensor_type: string;
      unit: string;
      minimum: number | null;
      maximum: number | null;
    }>(
      `SELECT tp.policy_id, tp.sensor_type, tp.unit, tp.minimum, tp.maximum
       FROM threshold_policies tp
       JOIN project_policies pp ON pp.policy_id = tp.policy_id
       WHERE tp.policy_id = ?1 AND pp.project_id = ?2 AND tp.status = 'registered'`,
      [policyId, projectId],
    );
    if (!policy) return json(404, { error: 'Registered Project Policy was not found' });
    if (policy.sensor_type !== 'temperature' || policy.unit !== '°C') {
      return json(400, { error: 'Managed API v1 supports temperature in °C' });
    }
    const existing = await database.first<ManagedSourceRow>(
      'SELECT * FROM managed_sources WHERE id = ?1',
      [sourceId],
    );
    if (existing) {
      const existingCredential = await decryptConnectorCredential(
        existing.credential_envelope,
        credentialKey,
      );
      if (
        existing.project_id !== projectId
        || existing.policy_id !== policyId
        || existing.source_sensor_id !== sourceSensorId
        || existing.endpoint_url !== endpointUrl
        || existing.first_period_date !== firstPeriodDate
        || existing.fetch_delay_minutes !== fetchDelayMinutes
        || existing.response_max_bytes !== responseMaxBytes
        || existingCredential !== bearerToken
      ) return json(409, { error: 'sourceId conflicts with another Managed Source' });
      return json(200, { accepted: true, idempotent: true, source: sourceView(existing) });
    }
    const identifiers = await managedSourceIdentifiers(projectId, sourceId, policyId);
    const envelope = await encryptConnectorCredential(bearerToken, credentialKey);
    const now = new Date().toISOString();
    await database.batch([
      {
        sql: `INSERT INTO devices (
                id, project_id, name, device_type, sensor_type, unit,
                expected_interval_minutes, normal_min, normal_max, created_at,
                threshold_policy_version, midnight_registry_status,
                operation_configuration_version, operation_configuration_updated_at
              ) VALUES (?1, ?2, ?3, 'Managed API Source', 'temperature', '°C', 1,
                        ?4, ?5, ?6, ?7, 'unregistered', 1, ?6)`,
        parameters: [
          identifiers.deviceId,
          projectId,
          name,
          policy.minimum,
          policy.maximum,
          now,
          policyId,
        ],
      },
      {
        sql: `INSERT INTO managed_sources (
                id, project_id, device_id, name, adapter_type, adapter_version,
                endpoint_url, source_sensor_id, auth_type, credential_envelope,
                credential_key_version, sensor_type, unit, policy_id, assignment_id,
                first_period_date, fetch_delay_minutes, response_max_bytes,
                status, stage, attempt_count, available_after, created_by, created_at, updated_at
              ) VALUES (
                ?1, ?2, ?3, ?4, 'fixed-window-json', 1, ?5, ?6, 'bearer', ?7,
                1, 'temperature', '°C', ?8, ?9, ?10, ?11, ?12,
                'provisioning', 'queued', 0, ?13, ?14, ?13, ?13
              )`,
        parameters: [
          sourceId,
          projectId,
          identifiers.deviceId,
          name,
          endpointUrl,
          sourceSensorId,
          envelope,
          policyId,
          identifiers.assignmentId,
          firstPeriodDate,
          fetchDelayMinutes,
          responseMaxBytes,
          now,
          actorIdentifier,
        ],
      },
    ]);
    try {
      await env.MANAGED_SOURCE_QUEUE.send({
        kind: 'provision-source',
        sourceId,
      } satisfies ManagedSourceQueueMessage);
    } catch (error) {
      console.error(JSON.stringify({
        message: 'managed_source_provision_enqueue_failed',
        sourceId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }));
    }
    const created = await database.first<ManagedSourceRow>(
      'SELECT * FROM managed_sources WHERE id = ?1',
      [sourceId],
    );
    return json(202, { accepted: true, idempotent: false, source: sourceView(created!) });
  } catch (error) {
    return json(400, { error: errorMessage(error) });
  }
}

async function updateSource(
  request: Request,
  env: Env,
  sourceId: string,
  access: SystemOperatorAccess,
): Promise<Response> {
  try {
    const credentialKey = env.MANAGED_CONNECTOR_CREDENTIAL_KEY?.trim();
    if (!credentialKey) return json(503, { error: 'Managed connector encryption is not configured' });
    const body = await readJson(request);
    const database = createSqlDatabase(env);
    const source = await database.first<ManagedSourceRow>(
      'SELECT * FROM managed_sources WHERE id = ?1',
      [sourceId],
    );
    if (!source) {
      return json(404, { error: 'Managed Source was not found' });
    }
    if (!canOperateProject(access, source.project_id)) {
      return projectMutationDenied(access, source.project_id);
    }
    const endpointUrl = body.endpointUrl === undefined
      ? source.endpoint_url
      : validateManagedEndpoint(requiredString(body, 'endpointUrl', 2_048));
    const credentialEnvelope = body.bearerToken === undefined
      ? source.credential_envelope
      : await encryptConnectorCredential(requiredString(body, 'bearerToken', 4_096), credentialKey);
    const name = body.name === undefined ? source.name : requiredString(body, 'name', 160);
    const requestedStatus = body.status;
    if (requestedStatus !== undefined && requestedStatus !== 'active' && requestedStatus !== 'paused') {
      throw new Error('status must be active or paused');
    }
    const status = requestedStatus ?? (source.device_tx_id ? 'active' : 'provisioning');
    if (status === 'active' && !source.device_tx_id) {
      return json(409, { error: 'Managed Source is not registered on Midnight yet' });
    }
    const stage = status === 'paused' ? 'paused' : status === 'active' ? 'ready' : 'queued';
    const now = new Date().toISOString();
    await database.execute(
      `UPDATE managed_sources SET name = ?1, endpoint_url = ?2,
         credential_envelope = ?3, credential_key_version = 1,
         status = ?4, stage = ?5, available_after = ?6,
         last_error_code = NULL, last_error_summary = NULL, updated_at = ?6
       WHERE id = ?7`,
      [name, endpointUrl, credentialEnvelope, status, stage, now, sourceId],
    );
    if (status === 'provisioning') {
      await env.MANAGED_SOURCE_QUEUE.send({ kind: 'provision-source', sourceId });
    }
    const updated = await database.first<ManagedSourceRow>(
      'SELECT * FROM managed_sources WHERE id = ?1',
      [sourceId],
    );
    return json(200, { source: sourceView(updated!) });
  } catch (error) {
    return json(400, { error: errorMessage(error) });
  }
}

async function createRun(
  request: Request,
  env: Env,
  sourceId: string,
  access: SystemOperatorAccess,
): Promise<Response> {
  try {
    const body = await readJson(request);
    const periodDate = requirePeriodDate(body.periodDate);
    const database = createSqlDatabase(env);
    const source = await sourceOperationalRow(database, sourceId, activeContractAddress(env));
    if (!source) {
      return json(404, { error: 'Managed Source was not found' });
    }
    if (!canOperateProject(access, source.project_id)) {
      return projectMutationDenied(access, source.project_id);
    }
    if (source.status !== 'active') {
      return json(409, { error: `Managed Source is not active (${source.status})` });
    }
    if (periodDate < source.first_period_date) {
      return json(400, { error: 'periodDate is before the first configured operational date' });
    }
    const window = fixedOperationalWindow(periodDate, {
      timeZoneOffsetMinutes: source.time_zone_offset_minutes,
      localDayStartHour: source.local_day_start_hour,
    });
    if (Date.parse(window.periodEnd) + source.fetch_delay_minutes * 60_000 > Date.now()) {
      return json(409, { error: 'The fixed 24-hour source window is not complete yet' });
    }
    const identifiers = await managedSourceIdentifiers(
      source.project_id,
      source.id,
      source.policy_id,
      periodDate,
    );
    const now = new Date().toISOString();
    const changes = await database.execute(
      `INSERT OR IGNORE INTO managed_source_runs (
         id, source_id, project_id, device_id, period_date, period_start, period_end,
         status, stage, fetch_attempt_count, proof_attempt_count,
         available_after, created_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7,
                 'pending_fetch', 'queued', 0, 0, ?8, ?8, ?8)`,
      [
        identifiers.runId!,
        source.id,
        source.project_id,
        source.device_id,
        periodDate,
        window.periodStart,
        window.periodEnd,
        now,
      ],
    );
    const run = await database.first<ManagedRunRow>(
      'SELECT * FROM managed_source_runs WHERE source_id = ?1 AND period_date = ?2',
      [source.id, periodDate],
    );
    if (!run || run.id !== identifiers.runId) {
      return json(409, { error: 'Managed Source period conflicts with another Run' });
    }
    if (changes > 0) {
      try {
        await env.MANAGED_SOURCE_QUEUE.send({ kind: 'fetch-window', runId: run.id });
      } catch (error) {
        console.error(JSON.stringify({
          message: 'managed_source_fetch_enqueue_failed',
          sourceId,
          runId: run.id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        }));
      }
    }
    return json(changes > 0 ? 202 : 200, {
      accepted: true,
      idempotent: changes === 0,
      run: runView(run),
    });
  } catch (error) {
    return json(400, { error: errorMessage(error) });
  }
}

async function retryRun(
  env: Env,
  sourceId: string,
  runId: string,
  access: SystemOperatorAccess,
): Promise<Response> {
  const database = createSqlDatabase(env);
  const run = await database.first<ManagedRunRow>(
    'SELECT * FROM managed_source_runs WHERE id = ?1 AND source_id = ?2',
    [runId, sourceId],
  );
  if (!run) {
    return json(404, { error: 'Managed Source Run was not found' });
  }
  if (!canOperateProject(access, run.project_id)) {
    return projectMutationDenied(access, run.project_id);
  }
  if (!['action_required', 'dead_lettered'].includes(run.status)) {
    return json(409, { error: 'Only a failed Managed Source Run can be retried manually' });
  }
  const nextStatus = run.private_artifact_key && run.proof_job_id ? 'proof_queued' : 'pending_fetch';
  const nextKind = nextStatus === 'proof_queued' ? 'attest-window' : 'fetch-window';
  const now = new Date().toISOString();
  await database.execute(
    `UPDATE managed_source_runs SET status = ?1, stage = 'queued', available_after = ?2,
       lease_expires_at = NULL, last_error_code = NULL, last_error_summary = NULL, updated_at = ?2
     WHERE id = ?3 AND source_id = ?4 AND status IN ('action_required', 'dead_lettered')`,
    [nextStatus, now, runId, sourceId],
  );
  await env.MANAGED_SOURCE_QUEUE.send({ kind: nextKind, runId } as ManagedSourceQueueMessage);
  const updated = await database.first<ManagedRunRow>(
    'SELECT * FROM managed_source_runs WHERE id = ?1',
    [runId],
  );
  return json(202, { accepted: true, run: runView(updated!) });
}

export async function handleManagedSourcesApi(
  request: Request,
  env: Env,
  context: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/v1/managed-sources')) return null;
  const authorization = await authorizeSystemOperator(request, env, context);
  if (!authorization.ok) return authorization.response;
  const database = createSqlDatabase(env);
  const access = await loadSystemOperatorAccess(database, authorization.principal);
  if (!hasAnySystemOperatorAccess(access)) {
    return json(403, { error: 'System operator authorization is required' });
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const mutationSecurity = await requireSystemOperatorMutationSecurity(
      request,
      database,
      authorization.principal,
    );
    if (!mutationSecurity.ok) return mutationSecurity.response;
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length === 4 && parts[3] === 'bootstrap') {
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
    const projectIds = visibleProjectIds(access);
    const placeholders = projectIds?.map((_, index) => `?${index + 1}`).join(', ');
    const [projects, policies] = await Promise.all([
      database.all<{
        id: string;
        name: string;
        time_zone_offset_minutes: number;
        local_day_start_hour: number;
      }>(
        `SELECT id, name, time_zone_offset_minutes, local_day_start_hour
         FROM projects${projectIds ? ` WHERE id IN (${placeholders})` : ''}
         ORDER BY created_at DESC`,
        projectIds ?? [],
      ),
      database.all<{
        policy_id: string;
        project_id: string;
        name: string | null;
        mode: string;
        minimum: number | null;
        maximum: number | null;
        sensor_type: string;
        unit: string;
      }>(
        `SELECT tp.policy_id, pp.project_id, tp.name, tp.mode, tp.minimum, tp.maximum,
                tp.sensor_type, tp.unit
         FROM threshold_policies tp
         JOIN project_policies pp ON pp.policy_id = tp.policy_id
         WHERE tp.status = 'registered'
         ${projectIds ? `AND pp.project_id IN (${placeholders})` : ''}
         ORDER BY pp.project_id, tp.registered_at DESC`,
        projectIds ?? [],
      ),
    ]);
    const csrf = await issueSystemOperatorCsrfToken(database, authorization.principal);
    return json(200, {
      authorization: {
        globalRole: access.globalRole,
        projectRoles: [...access.projectRoles].map(([projectId, role]) => ({ projectId, role })),
      },
      csrfToken: csrf.token,
      csrfExpiresAt: csrf.expiresAt,
      projects: projects.map((project) => ({
        projectId: project.id,
        name: project.name,
        timeZoneOffsetMinutes: project.time_zone_offset_minutes,
        localDayStartHour: project.local_day_start_hour,
      })),
      policies: policies.map((policy) => ({
        policyId: policy.policy_id,
        projectId: policy.project_id,
        name: policy.name ?? policy.policy_id,
        mode: policy.mode,
        minimum: policy.minimum,
        maximum: policy.maximum,
        sensorType: policy.sensor_type,
        unit: policy.unit,
      })),
    });
  }
  if (parts.length === 3) {
    if (request.method === 'POST') {
      return createSource(request, env, authorization.principal.identifier, access);
    }
    if (request.method === 'GET') {
      const projectIds = visibleProjectIds(access);
      const placeholders = projectIds?.map((_, index) => `?${index + 1}`).join(', ');
      const sources = await database.all<ManagedSourceRow>(
        `SELECT * FROM managed_sources
         ${projectIds ? `WHERE project_id IN (${placeholders})` : ''}
         ORDER BY created_at DESC`,
        projectIds ?? [],
      );
      return json(200, { sources: sources.map(sourceView) });
    }
    return json(405, { error: 'Method not allowed' });
  }
  const sourceId = parts[3] ? requireManagedIdentifier(parts[3], 'sourceId', 80) : '';
  if (parts.length === 4) {
    if (request.method === 'PATCH') return updateSource(request, env, sourceId, access);
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
    const source = await database.first<ManagedSourceRow>(
      'SELECT * FROM managed_sources WHERE id = ?1',
      [sourceId],
    );
    return source && canViewProject(access, source.project_id)
      ? json(200, { source: sourceView(source) })
      : json(404, { error: 'Managed Source was not found' });
  }
  if (parts.length === 5 && parts[4] === 'runs') {
    if (request.method === 'POST') return createRun(request, env, sourceId, access);
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
    const source = await database.first<Pick<ManagedSourceRow, 'project_id'>>(
      'SELECT project_id FROM managed_sources WHERE id = ?1',
      [sourceId],
    );
    if (!source || !canViewProject(access, source.project_id)) {
      return json(404, { error: 'Managed Source was not found' });
    }
    const runs = await database.all<ManagedRunRow>(
      `SELECT * FROM managed_source_runs WHERE source_id = ?1
       ORDER BY period_date DESC LIMIT 366`,
      [sourceId],
    );
    return json(200, { runs: runs.map(runView) });
  }
  if (parts.length === 6 && parts[4] === 'runs') {
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
    const run = await database.first<ManagedRunRow>(
      'SELECT * FROM managed_source_runs WHERE id = ?1 AND source_id = ?2',
      [parts[5]!, sourceId],
    );
    return run && canViewProject(access, run.project_id)
      ? json(200, await runDetail(database, run))
      : json(404, { error: 'Managed Source Run was not found' });
  }
  if (parts.length === 7 && parts[4] === 'runs' && parts[6] === 'retry') {
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
    return retryRun(env, sourceId, parts[5]!, access);
  }
  return json(404, { error: 'Managed Source API endpoint not found' });
}

async function processProvisioning(message: Message<unknown>, env: Env, sourceId: string): Promise<void> {
  const database = createSqlDatabase(env);
  console.log(JSON.stringify({
    message: 'managed_source_registration_delivery_started',
    sourceId,
  }));
  const contractAddress = activeContractAddress(env);
  const source = await sourceOperationalRow(database, sourceId, contractAddress);
  if (!source || source.status === 'active' || source.status === 'paused') {
    message.ack();
    return;
  }
  if (source.status === 'action_required') {
    message.ack();
    return;
  }
  if (
    !['queued', 'retry_waiting'].includes(source.stage)
    || Date.parse(source.available_after) > Date.now()
  ) {
    message.ack();
    return;
  }
  try {
    await requireManagedSponsorWallet(env);
  } catch (error) {
    await deferProvisioningForSponsorWallet(message, database, source.id, error);
    return;
  }
  try {
    await ensureAuthorityRuntime(env, 'fleet-authority');
  } catch (error) {
    await deferProvisioningForAuthorityWallet(message, database, source.id, error);
    return;
  }
  const now = new Date();
  const claimed = await database.execute(
    `UPDATE managed_sources SET stage = 'registering', attempt_count = attempt_count + 1,
       updated_at = ?1, last_error_code = NULL, last_error_summary = NULL
     WHERE id = ?2 AND status = 'provisioning'
       AND stage IN ('queued', 'retry_waiting') AND available_after <= ?1`,
    [now.toISOString(), sourceId],
  );
  if (!managedClaimWasApplied(claimed)) {
    console.log(JSON.stringify({
      message: 'managed_source_registration_delivery_skipped',
      sourceId,
      sourceStatus: source.status,
      sourceStage: source.stage,
    }));
    message.ack();
    return;
  }
  try {
    console.log(JSON.stringify({
      message: 'managed_source_registration_container_request_started',
      sourceId: source.id,
      projectId: source.project_id,
      deviceId: source.device_id,
    }));
    const result = await withManagedOperationTimeout(
      managedMutationTimeoutMilliseconds,
      'managed_source_registration_timeout',
      async (signal) => {
        const authorityResponse = await containerRequest(
          env,
          'managed-attestor',
          '/managed/source-authority',
          'X-Managed-Source',
          'derive-authority-v1',
          {
            sourceId: source.id,
            projectId: source.project_id,
          },
          signal,
        );
        const authority = await readSmallJson<{ deviceAuthority: string }>(authorityResponse);
        if (!bytes32Pattern.test(authority.deviceAuthority)) {
          throw new Error('Managed Source authority result is invalid');
        }
        const response = await containerRequest(
          env,
          'fleet-authority',
          '/operator/register-service-device',
          'X-Operator-Provisioning',
          'register-service-device-v1',
          {
            contractAddress,
            deviceId: source.device_id,
            deviceAuthority: authority.deviceAuthority,
            policyId: source.policy_id,
            assignmentId: source.assignment_id,
            deviceRegistrationVersion: 1,
            assignmentVersion: 1,
            timeZoneOffsetMinutes: source.time_zone_offset_minutes,
            localDayStartHour: source.local_day_start_hour,
            utcDayStartMinute: ((source.local_day_start_hour * 60
              - source.time_zone_offset_minutes) % 1440 + 1440) % 1440,
            validFromEpoch: '0',
            validUntilEpoch: '0',
            knownDeviceTxId: source.device_tx_id ?? undefined,
            knownAssignmentTxId: source.assignment_tx_id ?? undefined,
          },
          signal,
        );
        console.log(JSON.stringify({
          message: 'managed_source_registration_container_request_completed',
          sourceId: source.id,
          status: response.status,
        }));
        return {
          ...await readSmallJson<Omit<ManagedRegistrationResult, 'deviceAuthority'>>(response),
          deviceAuthority: authority.deviceAuthority,
        };
      },
    );
    if (
      !bytes32Pattern.test(result.deviceCommitment)
      || !bytes32Pattern.test(result.deviceAuthority)
      || result.policyKey !== source.policy_key
      || !bytes32Pattern.test(result.assignmentKey)
      || !transactionIdPattern.test(result.deviceTxId)
      || !transactionIdPattern.test(result.assignmentTxId)
    ) throw new Error('Managed Source registration result is invalid');
    const registeredAt = new Date().toISOString();
    const utcStartMinute = ((source.local_day_start_hour * 60
      - source.time_zone_offset_minutes) % 1440 + 1440) % 1440;
    await database.batch([
      {
        sql: `UPDATE devices SET threshold_policy_version = ?1,
                midnight_device_commitment = ?2, midnight_device_authority = ?3,
                midnight_registry_status = 'registered', midnight_registration_version = 1,
                midnight_contract_address = ?4, midnight_registered_tx_id = ?5,
                midnight_authority_tx_id = ?5, midnight_registered_at = ?6,
                operation_configuration_version = operation_configuration_version + 1,
                operation_configuration_updated_at = ?6
              WHERE id = ?7 AND project_id = ?8`,
        parameters: [
          source.policy_id,
          result.deviceCommitment,
          result.deviceAuthority,
          contractAddress,
          result.deviceTxId,
          registeredAt,
          source.device_id,
          source.project_id,
        ],
      },
      {
        sql: `INSERT OR IGNORE INTO policy_assignments (
                assignment_id, assignment_key, policy_id, project_id, device_id,
                valid_from, valid_until, assignment_version, status, device_commitment,
                contract_address, registered_tx_id, registered_at,
                time_zone_offset_minutes, local_day_start_hour, utc_day_start_minute
              ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, 1, 'registered',
                        ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
        parameters: [
          source.assignment_id,
          result.assignmentKey,
          source.policy_id,
          source.project_id,
          source.device_id,
          result.deviceCommitment,
          contractAddress,
          result.assignmentTxId,
          registeredAt,
          source.time_zone_offset_minutes,
          source.local_day_start_hour,
          utcStartMinute,
        ],
      },
      {
        sql: `INSERT OR IGNORE INTO anomaly_states (
                device_id, project_id, state, last_event_id, changed_at
              ) VALUES (?1, ?2, 'normal', NULL, ?3)`,
        parameters: [source.device_id, source.project_id, registeredAt],
      },
      {
        sql: `UPDATE managed_sources SET status = 'active', stage = 'ready',
                device_authority = ?1, device_tx_id = ?2, assignment_tx_id = ?3,
                last_error_code = NULL, last_error_summary = NULL, updated_at = ?4
              WHERE id = ?5 AND status = 'provisioning' AND stage = 'registering'`,
        parameters: [
          result.deviceAuthority,
          result.deviceTxId,
          result.assignmentTxId,
          registeredAt,
          source.id,
        ],
      },
    ]);
    console.log(JSON.stringify({
      message: 'managed_source_registration_completed',
      sourceId: source.id,
      deviceTxId: result.deviceTxId,
      assignmentTxId: result.assignmentTxId,
    }));
    message.ack();
  } catch (error) {
    const attempt = source.attempt_count + 1;
    const terminal = attempt >= maximumAttempts;
    const delay = retryDelay(attempt);
    const failedAt = new Date();
    await database.execute(
      `UPDATE managed_sources SET status = ?1, stage = ?2, available_after = ?3,
         last_error_code = 'managed_source_registration_failed', last_error_summary = ?4,
         updated_at = ?5 WHERE id = ?6 AND stage = 'registering'`,
      [
        terminal ? 'action_required' : 'provisioning',
        terminal ? 'failed' : 'retry_waiting',
        new Date(failedAt.valueOf() + delay * 1_000).toISOString(),
        errorMessage(error),
        failedAt.toISOString(),
        source.id,
      ],
    );
    console.error(JSON.stringify({
      message: 'managed_source_registration_failed',
      sourceId: source.id,
      attempt,
      terminal,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }));
    if (terminal) message.ack();
    else message.retry({ delaySeconds: delay });
  }
}

function policyDescriptor(source: ManagedSourceOperationalRow): ThresholdPolicyDescriptor {
  return {
    policyId: source.policy_id,
    mode: source.mode,
    minimum: source.minimum ?? -100,
    maximum: source.maximum ?? 42_949_572.95,
    valueScale: source.value_scale,
    sensorTypeCode: source.sensor_type_code,
    unitCode: source.unit_code,
    version: source.policy_version,
  };
}

function encodeHourResults(results: readonly HourThresholdResult[]): string {
  return results.map((result) => result === 'no-data' ? '0' : result === 'within-threshold' ? '1' : '2').join('');
}

async function privateArtifact(
  env: Env,
  source: ManagedSourceOperationalRow,
  run: ManagedRunRow,
): Promise<{ artifact: ManagedArtifact; objectKey: string; httpStatus: number; responseBytes: number }> {
  const objectKey = `managed-source-private/${source.id}/${run.period_date}.v2.enc`;
  const artifactKey = managedArtifactEncryptionKey(env);
  const binding = managedArtifactBinding(objectKey, source.id, run.id, run.period_date);
  const existing = await env.MANAGED_SOURCE_DATA.get(objectKey);
  if (existing) {
    const envelope = await existing.json<ManagedArtifactEnvelope>();
    const artifact = await decryptManagedArtifact<ManagedArtifact>(envelope, artifactKey, binding);
    if (
      artifact.schemaVersion !== 1
      || artifact.sourceId !== source.id
      || artifact.runId !== run.id
      || artifact.attestation.publicData.periodDate !== run.period_date
    ) throw new Error('Managed Source private artifact is invalid');
    return {
      artifact,
      objectKey,
      httpStatus: run.source_http_status ?? 200,
      responseBytes: run.source_response_bytes ?? 0,
    };
  }
  const credentialKey = env.MANAGED_CONNECTOR_CREDENTIAL_KEY?.trim();
  if (!credentialKey) throw new Error('Managed connector encryption is not configured');
  const token = await decryptConnectorCredential(source.credential_envelope, credentialKey);
  const fetched = await fetchFixedWindowMeasurements({
    endpointUrl: source.endpoint_url,
    sourceSensorId: source.source_sensor_id,
    bearerToken: token,
    deviceId: source.device_id,
    sensorType: source.sensor_type,
    unit: source.unit,
    periodStart: run.period_start,
    periodEnd: run.period_end,
    responseMaxBytes: source.response_max_bytes,
  });
  const identifiers = await managedSourceIdentifiers(
    source.project_id,
    source.id,
    source.policy_id,
    run.period_date,
  );
  const prepared = await withManagedOperationTimeout(
    managedPreparationTimeoutMilliseconds,
    'managed_attestation_preparation_timeout',
    async (signal) => {
      const preparationResponse = await containerRequest(
        env,
        'managed-attestor',
        '/managed/prepare',
        'X-Managed-Attestation',
        'prepare-v1',
        {
          deviceId: source.device_id,
          periodDate: run.period_date,
          measurementGroupId: identifiers.measurementGroupId,
          timeZoneOffsetMinutes: source.time_zone_offset_minutes,
          localDayStartHour: source.local_day_start_hour,
          policyId: source.policy_id,
          assignmentId: source.assignment_id,
          policy: policyDescriptor(source),
          records: fetched.records,
        },
        signal,
      );
      return readSmallJson<{
        attestation: PreparedDailyExtremaAttestation;
        hourResults: HourThresholdResult[];
        thresholdSatisfied: boolean;
      }>(preparationResponse);
    },
  );
  const { attestation, hourResults, thresholdSatisfied } = prepared;
  const expectedMeasurementGroupKey = await managedMeasurementGroupKey(
    identifiers.measurementGroupId!,
  );
  if (attestation.publicData.deviceCommitment !== source.midnight_device_commitment) {
    throw new Error('Managed Source Device does not match the prepared attestation');
  }
  if (attestation.publicData.policyKey !== source.policy_key) {
    throw new Error('Managed Source Policy does not match the prepared attestation');
  }
  if (attestation.publicData.assignmentKey !== source.assignment_key) {
    throw new Error('Managed Source Assignment does not match the prepared attestation');
  }
  if (attestation.publicData.measurementGroupId !== expectedMeasurementGroupKey) {
    throw new Error('Managed Source measurement group does not match the prepared attestation');
  }
  if (
    attestation.publicData.periodDate !== run.period_date
    || attestation.publicData.sampleCount !== fetched.records.length
  ) throw new Error('Managed Source period does not match the prepared attestation');
  if (
    hourResults.length !== 24
    || hourResults.some((result) => ![
      'no-data',
      'within-threshold',
      'outside-threshold',
    ].includes(result))
    || thresholdSatisfied === hourResults.includes('outside-threshold')
  ) throw new Error('Managed Source threshold results are invalid');
  const artifact: ManagedArtifact = {
    schemaVersion: 1,
    sourceId: source.id,
    runId: run.id,
    proofJobId: identifiers.proofJobId!,
    createdAt: new Date().toISOString(),
    attestation,
    hourResults,
    thresholdSatisfied,
    summaries: fetched.summaries,
  };
  const envelope = await encryptManagedArtifact(artifact, artifactKey, binding);
  await env.MANAGED_SOURCE_DATA.put(objectKey, JSON.stringify(envelope), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: {
      format: 'managed-daily-extrema-aes-gcm-v1',
      keyVersion: String(envelope.keyVersion),
      sourceId: source.id,
      runId: run.id,
    },
  });
  return {
    artifact,
    objectKey,
    httpStatus: fetched.httpStatus,
    responseBytes: fetched.responseBytes,
  };
}

async function persistFetchedArtifact(
  database: SqlDatabase,
  source: ManagedSourceOperationalRow,
  run: ManagedRunRow,
  artifact: ManagedArtifact,
  objectKey: string,
  httpStatus: number,
  responseBytes: number,
): Promise<void> {
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const privateArtifactExpiresAt = new Date(
    nowDate.valueOf() + privateArtifactRetentionMilliseconds,
  ).toISOString();
  const statements = [] as Array<{ sql: string; parameters: Array<string | number | null> }>;
  for (const summary of artifact.summaries) {
    if (summary.sampleCount === 0) continue;
    const digest = await sha256Hex(
      `managed-window:v1\n${source.id}\n${run.period_date}\n${summary.hourIndex}`,
    );
    const commitment = await sha256Hex(JSON.stringify({
      sourceId: source.id,
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
      sampleCount: summary.sampleCount,
      minimum: summary.minimum,
      maximum: summary.maximum,
      average: summary.average,
    }));
    statements.push({
      sql: `INSERT OR IGNORE INTO measurement_windows (
              batch_id, project_id, device_id, sensor_type, unit, period_start, period_end,
              sample_count, minimum, maximum, average, commitment,
              threshold_policy_version, received_at
            ) VALUES (?1, ?2, ?3, 'temperature', '°C', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
      parameters: [
        `managed-window-${digest}`,
        source.project_id,
        source.device_id,
        summary.periodStart,
        summary.periodEnd,
        summary.sampleCount,
        summary.minimum,
        summary.maximum,
        summary.average,
        commitment,
        source.policy_id,
        now,
      ],
    });
  }
  const publicData = artifact.attestation.publicData;
  statements.push({
    sql: `INSERT OR IGNORE INTO daily_proof_jobs (
            id, project_id, device_id, period_date, contract_address, measurement_group_id,
            attestation_commitment, device_commitment, sample_count,
            threshold_policy_version, policy_key, assignment_id, assignment_key,
            hour_presence, hour_results, observed_hour_count, threshold_satisfied,
            schema_version, circuit_version, status, attempt_count, available_after,
            sponsor_available_after, origin, managed_source_id, private_input_object_key,
            created_at, updated_at
          ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
            ?14, ?15, ?16, ?17, ?18, ?19, 'pending', 0, ?20, ?20,
            'managed-api', ?21, ?22, ?20, ?20
          )`,
    parameters: [
      artifact.proofJobId,
      source.project_id,
      source.device_id,
      run.period_date,
      source.midnight_contract_address,
      publicData.measurementGroupId,
      publicData.attestationCommitment,
      publicData.deviceCommitment,
      publicData.sampleCount,
      source.policy_id,
      publicData.policyKey,
      source.assignment_id,
      publicData.assignmentKey,
      publicData.hourPresence.map((present) => present ? '1' : '0').join(''),
      encodeHourResults(artifact.hourResults),
      publicData.observedHourCount,
      artifact.thresholdSatisfied ? 1 : 0,
      publicData.schemaVersion,
      publicData.circuitVersion,
      now,
      source.id,
      objectKey,
    ],
  });
  statements.push({
    sql: `UPDATE managed_source_runs SET status = 'proof_queued', stage = 'proof_queued',
            source_http_status = ?1, source_response_bytes = ?2, sample_count = ?3,
            observed_hour_count = ?4, private_artifact_key = ?5,
            private_artifact_expires_at = ?6, proof_job_id = ?7,
            fetched_at = COALESCE(fetched_at, ?8), lease_expires_at = NULL,
            available_after = ?8, last_error_code = NULL, last_error_summary = NULL,
            updated_at = ?8 WHERE id = ?9 AND status = 'fetching'`,
    parameters: [
      httpStatus,
      responseBytes,
      publicData.sampleCount,
      publicData.observedHourCount,
      objectKey,
      privateArtifactExpiresAt,
      artifact.proofJobId,
      now,
      run.id,
    ],
  });
  statements.push({
    sql: 'UPDATE devices SET last_seen_at = ?1 WHERE id = ?2',
    parameters: [now, source.device_id],
  });
  await database.batch(statements);
}

async function failFetch(
  message: Message<unknown>,
  database: SqlDatabase,
  run: ManagedRunRow,
  error: unknown,
): Promise<void> {
  const attempt = run.fetch_attempt_count + 1;
  const managedError = error instanceof ManagedSourceError ? error : null;
  const actionRequired = managedError?.kind === 'action-required';
  const terminal = !actionRequired && attempt >= maximumAttempts;
  const delay = retryDelay(attempt, managedError?.retryAfterSeconds ?? null);
  const now = new Date();
  const status: ManagedRunStatus = actionRequired
    ? 'action_required'
    : terminal ? 'dead_lettered' : 'fetch_retry';
  await database.execute(
    `UPDATE managed_source_runs SET status = ?1, stage = ?2, available_after = ?3,
       lease_expires_at = NULL, source_http_status = ?4, last_error_code = ?5,
       last_error_summary = ?6, updated_at = ?7 WHERE id = ?8 AND status = 'fetching'`,
    [
      status,
      actionRequired ? 'source_action_required' : terminal ? 'failed' : 'retry_waiting',
      new Date(now.valueOf() + delay * 1_000).toISOString(),
      managedError?.httpStatus ?? null,
      managedError?.code ?? 'managed_source_fetch_failed',
      errorMessage(error),
      now.toISOString(),
      run.id,
    ],
  );
  console.error(JSON.stringify({
    message: 'managed_source_fetch_failed',
    runId: run.id,
    sourceId: run.source_id,
    errorCode: managedError?.code ?? 'managed_source_fetch_failed',
    attempt,
    actionRequired,
    terminal,
  }));
  if (actionRequired || terminal) message.ack();
  else message.retry({ delaySeconds: delay });
}

async function processFetch(message: Message<unknown>, env: Env, runId: string): Promise<void> {
  const database = createSqlDatabase(env);
  const run = await database.first<ManagedRunRow>(
    'SELECT * FROM managed_source_runs WHERE id = ?1',
    [runId],
  );
  if (!run || ['proof_queued', 'proving', 'confirmed', 'action_required', 'dead_lettered'].includes(run.status)) {
    message.ack();
    return;
  }
  if (!['pending_fetch', 'fetch_retry'].includes(run.status) || Date.parse(run.available_after) > Date.now()) {
    message.ack();
    return;
  }
  const now = new Date();
  const claimed = await database.execute(
    `UPDATE managed_source_runs SET status = 'fetching', stage = 'fetching',
       fetch_attempt_count = fetch_attempt_count + 1, lease_expires_at = ?1,
       last_error_code = NULL, last_error_summary = NULL, updated_at = ?2
     WHERE id = ?3 AND status IN ('pending_fetch', 'fetch_retry') AND available_after <= ?2`,
    [new Date(now.valueOf() + fetchLeaseMilliseconds).toISOString(), now.toISOString(), run.id],
  );
  if (!managedClaimWasApplied(claimed)) {
    message.ack();
    return;
  }
  try {
    const source = await sourceOperationalRow(
      database,
      run.source_id,
      activeContractAddress(env),
    );
    if (
      !source
      || source.status !== 'active'
      || !source.midnight_contract_address
      || !source.midnight_device_commitment
      || !source.assignment_key
    ) throw new ManagedSourceError(
      'managed_source_not_active',
      'action-required',
      'Managed Source does not have an active on-chain assignment',
    );
    const prepared = await privateArtifact(env, source, run);
    await persistFetchedArtifact(
      database,
      source,
      run,
      prepared.artifact,
      prepared.objectKey,
      prepared.httpStatus,
      prepared.responseBytes,
    );
    try {
      await env.MANAGED_SOURCE_QUEUE.send({ kind: 'attest-window', runId: run.id });
    } catch (error) {
      console.error(JSON.stringify({
        message: 'managed_attestation_enqueue_failed',
        runId: run.id,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }));
    }
    message.ack();
  } catch (error) {
    await failFetch(message, database, run, error);
  }
}

async function updateManagedProgress(
  database: SqlDatabase,
  run: ManagedRunRow,
  event: ManagedProgressEvent,
): Promise<void> {
  const now = new Date().toISOString();
  if (event.stage === 'zkp_generated' && event.proofGeneratedAt) {
    await database.execute(
      `UPDATE daily_proof_jobs SET proof_generated_at = ?1, updated_at = ?2
       WHERE id = ?3 AND origin = 'managed-api'`,
      [event.proofGeneratedAt, now, run.proof_job_id],
    );
  }
  if (
    event.stage === 'transaction_prepared'
    && event.transactionId
    && event.transactionHash
    && transactionIdPattern.test(event.transactionId)
    && bytes32Pattern.test(event.transactionHash)
  ) {
    await database.execute(
      `UPDATE daily_proof_jobs SET attest_tx_id = ?1, attest_tx_hash = ?2,
         sponsor_transaction_id = ?1, sponsor_fee_specks = ?3,
         sponsor_transaction_bytes = ?4, sponsor_stage = 'transaction_ready',
         sponsor_stage_updated_at = ?5, updated_at = ?5
       WHERE id = ?6 AND origin = 'managed-api' AND status = 'proving'`,
      [
        event.transactionId,
        event.transactionHash,
        event.feeSpecks ?? null,
        event.transactionBytes ?? null,
        now,
        run.proof_job_id,
      ],
    );
  }
  await database.execute(
    `UPDATE managed_source_runs SET stage = ?1, updated_at = ?2
     WHERE id = ?3 AND status = 'proving'`,
    [event.stage, now, run.id],
  );
}

async function readManagedStream(
  response: Response,
  onProgress: (event: ManagedProgressEvent) => Promise<void>,
): Promise<ManagedAttestationResult> {
  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(`Private Container returned HTTP ${response.status}: ${detail.slice(0, 2_000)}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  let received = 0;
  let result: ManagedAttestationResult | null = null;
  const consume = async (line: string): Promise<void> => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as ManagedStreamEvent;
    if (event.type === 'progress') {
      await onProgress(event);
      return;
    }
    if (event.type === 'result') {
      result = event.result;
      return;
    }
    if (event.type === 'error') throw new Error(`Managed attestation failed: ${event.error}`);
    throw new Error('Private Container returned an invalid managed progress event');
  };
  while (true) {
    const { done, value } = await reader.read();
    received += value?.byteLength ?? 0;
    if (received > 128 * 1024) throw new Error('Private Container progress response is too large');
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
  const completed = result as ManagedAttestationResult | null;
  if (!completed) throw new Error('Private Container progress stream ended without a result');
  if (
    !transactionIdPattern.test(completed.transactionId)
    || !bytes32Pattern.test(completed.transactionHash)
    || !/^\d+$/u.test(completed.blockHeight)
    || !/^\d+$/u.test(completed.feeSpecks)
    || !Number.isSafeInteger(completed.transactionBytes)
    || !Number.isFinite(Date.parse(completed.proofGeneratedAt))
  ) throw new Error('Private Container returned an invalid managed attestation result');
  return completed;
}

function proofFailureActionRequired(error: unknown): boolean {
  const message = errorMessage(error);
  return /assignment|policy|authority|already attested but|identifiers do not match|public\/private/u.test(message);
}

async function processAttestation(message: Message<unknown>, env: Env, runId: string): Promise<void> {
  const database = createSqlDatabase(env);
  const run = await database.first<ManagedRunRow>(
    'SELECT * FROM managed_source_runs WHERE id = ?1',
    [runId],
  );
  if (!run || ['confirmed', 'action_required', 'dead_lettered'].includes(run.status)) {
    message.ack();
    return;
  }
  if (!['proof_queued', 'proof_retry'].includes(run.status) || Date.parse(run.available_after) > Date.now()) {
    message.ack();
    return;
  }
  if (!run.private_artifact_key || !run.proof_job_id) {
    await database.execute(
      `UPDATE managed_source_runs SET status = 'action_required', stage = 'failed',
         last_error_code = 'managed_private_artifact_missing',
         last_error_summary = 'Managed private artifact reference is missing', updated_at = ?1
       WHERE id = ?2`,
      [new Date().toISOString(), run.id],
    );
    message.ack();
    return;
  }
  const knownProof = await database.first<ManagedProofRow>(
    'SELECT * FROM daily_proof_jobs WHERE id = ?1',
    [run.proof_job_id],
  );
  if (!knownProof?.attest_tx_id || !knownProof.attest_tx_hash) {
    try {
      await requireManagedSponsorWallet(env);
    } catch (error) {
      await deferAttestationForSponsorWallet(message, database, run, error);
      return;
    }
    try {
      await ensureAuthorityRuntime(env, 'managed-attestor');
    } catch (error) {
      await deferAttestationForAuthorityWallet(message, database, run, error);
      return;
    }
  }
  const now = new Date();
  const claimed = await database.execute(
    `UPDATE managed_source_runs SET status = 'proving', stage = 'starting',
       proof_attempt_count = proof_attempt_count + 1, lease_expires_at = ?1,
       proof_started_at = COALESCE(proof_started_at, ?2),
       last_error_code = NULL, last_error_summary = NULL, updated_at = ?2
     WHERE id = ?3 AND status IN ('proof_queued', 'proof_retry') AND available_after <= ?2`,
    [
      new Date(now.valueOf() + managedMutationLeaseMilliseconds).toISOString(),
      now.toISOString(),
      run.id,
    ],
  );
  if (!managedClaimWasApplied(claimed)) {
    message.ack();
    return;
  }
  await database.execute(
    `UPDATE daily_proof_jobs SET status = 'proving', attempt_count = attempt_count + 1,
       lease_expires_at = ?1, updated_at = ?2
     WHERE id = ?3 AND origin = 'managed-api' AND status IN ('pending', 'retryable_failed')`,
    [
      new Date(now.valueOf() + managedMutationLeaseMilliseconds).toISOString(),
      now.toISOString(),
      run.proof_job_id,
    ],
  );
  try {
    const [source, object, proof] = await Promise.all([
      sourceOperationalRow(database, run.source_id, activeContractAddress(env)),
      env.MANAGED_SOURCE_DATA.get(run.private_artifact_key),
      database.first<ManagedProofRow>('SELECT * FROM daily_proof_jobs WHERE id = ?1', [run.proof_job_id]),
    ]);
    if (!source || source.status !== 'active' || !source.midnight_contract_address) {
      throw new Error('Managed Source assignment is not active');
    }
    if (!object) throw new Error('Managed Source private artifact was not found');
    const envelope = await object.json<ManagedArtifactEnvelope>();
    const artifact = await decryptManagedArtifact<ManagedArtifact>(
      envelope,
      managedArtifactEncryptionKey(env),
      managedArtifactBinding(
        run.private_artifact_key,
        run.source_id,
        run.id,
        run.period_date,
      ),
    );
    if (
      artifact.schemaVersion !== 1
      || artifact.runId !== run.id
      || artifact.proofJobId !== run.proof_job_id
    ) throw new Error('Managed Source private artifact is invalid');
    const knownSubmission = proof?.attest_tx_id && proof.attest_tx_hash
      ? {
        transactionId: proof.attest_tx_id,
        transactionHash: proof.attest_tx_hash,
        proofGeneratedAt: proof.proof_generated_at ?? undefined,
        feeSpecks: proof.sponsor_fee_specks ?? undefined,
        transactionBytes: proof.sponsor_transaction_bytes ?? undefined,
      }
      : undefined;
    const result = await withManagedOperationTimeout(
      managedMutationTimeoutMilliseconds,
      'managed_attestation_timeout',
      async (signal) => {
        const response = await containerRequest(
          env,
          'managed-attestor',
          '/managed/attest',
          'X-Managed-Attestation',
          'submit-v1',
          {
            sourceId: source.id,
            projectId: source.project_id,
            deviceId: source.device_id,
            policyId: source.policy_id,
            assignmentId: source.assignment_id,
            contractAddress: source.midnight_contract_address,
            attestation: artifact.attestation,
            hourResults: artifact.hourResults,
            thresholdSatisfied: artifact.thresholdSatisfied,
            knownSubmission,
          },
          signal,
        );
        return readManagedStream(
          response,
          (event) => updateManagedProgress(database, run, event),
        );
      },
    );
    const confirmedAt = new Date().toISOString();
    await database.batch([
      {
        sql: `UPDATE daily_proof_jobs SET status = 'confirmed', proof_generated_at = ?1,
                lease_expires_at = NULL, sponsor_transaction_id = ?2,
                sponsor_fee_specks = ?3, sponsor_transaction_bytes = ?4,
                sponsor_attempt_count = sponsor_attempt_count + 1,
                sponsor_stage = 'completed', sponsor_reason_code = 'managed_attestation_confirmed',
                sponsor_stage_updated_at = ?5, sponsorship_started_at = COALESCE(sponsorship_started_at, ?6),
                sponsorship_completed_at = ?5, attest_tx_id = ?2, attest_tx_hash = ?7,
                block_height = ?8, last_error_code = NULL, updated_at = ?5
              WHERE id = ?9 AND origin = 'managed-api' AND status = 'proving'`,
        parameters: [
          result.proofGeneratedAt,
          result.transactionId,
          result.feeSpecks,
          result.transactionBytes,
          confirmedAt,
          run.proof_started_at ?? confirmedAt,
          result.transactionHash,
          result.blockHeight,
          run.proof_job_id,
        ],
      },
      {
        sql: `UPDATE managed_source_runs SET status = 'confirmed', stage = 'confirmed',
                lease_expires_at = NULL, confirmed_at = ?1, last_error_code = NULL,
                last_error_summary = NULL, private_artifact_expires_at = ?1,
                updated_at = ?1
              WHERE id = ?2 AND status = 'proving'`,
        parameters: [confirmedAt, run.id],
      },
    ]);
    try {
      await env.MANAGED_SOURCE_DATA.delete(run.private_artifact_key);
      await database.batch([
        {
          sql: `UPDATE managed_source_runs SET private_artifact_key = NULL,
                  private_artifact_expires_at = NULL, updated_at = ?1
                WHERE id = ?2 AND status = 'confirmed'`,
          parameters: [confirmedAt, run.id],
        },
        {
          sql: `UPDATE daily_proof_jobs SET private_input_object_key = NULL, updated_at = ?1
                WHERE id = ?2 AND origin = 'managed-api' AND status = 'confirmed'`,
          parameters: [confirmedAt, run.proof_job_id],
        },
      ]);
    } catch (cleanupError) {
      console.error(JSON.stringify({
        message: 'managed_private_artifact_confirmed_cleanup_failed',
        runId: run.id,
        errorName: cleanupError instanceof Error ? cleanupError.name : 'UnknownError',
      }));
    }
    message.ack();
  } catch (error) {
    const attempt = run.proof_attempt_count + 1;
    const actionRequired = proofFailureActionRequired(error);
    const terminal = !actionRequired && attempt >= maximumAttempts;
    const status: ManagedRunStatus = actionRequired
      ? 'action_required'
      : terminal ? 'dead_lettered' : 'proof_retry';
    const delay = retryDelay(attempt);
    const failedAt = new Date();
    await database.batch([
      {
        sql: `UPDATE managed_source_runs SET status = ?1, stage = ?2,
                available_after = ?3, lease_expires_at = NULL,
                last_error_code = 'managed_attestation_failed', last_error_summary = ?4,
                updated_at = ?5 WHERE id = ?6 AND status = 'proving'`,
        parameters: [
          status,
          actionRequired ? 'proof_action_required' : terminal ? 'failed' : 'retry_waiting',
          new Date(failedAt.valueOf() + delay * 1_000).toISOString(),
          errorMessage(error),
          failedAt.toISOString(),
          run.id,
        ],
      },
      {
        sql: `UPDATE daily_proof_jobs SET status = ?1, lease_expires_at = NULL,
                available_after = ?2, last_error_code = 'managed_attestation_failed',
                updated_at = ?3 WHERE id = ?4 AND origin = 'managed-api' AND status = 'proving'`,
        parameters: [
          actionRequired || terminal ? 'dead_lettered' : 'retryable_failed',
          new Date(failedAt.valueOf() + delay * 1_000).toISOString(),
          failedAt.toISOString(),
          run.proof_job_id,
        ],
      },
    ]);
    console.error(JSON.stringify({
      message: 'managed_attestation_failed',
      runId: run.id,
      sourceId: run.source_id,
      attempt,
      actionRequired,
      terminal,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }));
    if (actionRequired || terminal) message.ack();
    else message.retry({ delaySeconds: delay });
  }
}

export async function handleManagedSourceQueue(
  batch: MessageBatch<unknown>,
  env: Env,
): Promise<void> {
  if (batch.queue !== queueName) {
    batch.retryAll({ delaySeconds: 60 });
    return;
  }
  const operatingWindow = await sponsorWalletOperatingWindow(env);
  for (const message of batch.messages) {
    if (!isQueueMessage(message.body)) {
      message.ack();
      continue;
    }
    let acceptedAt: string | null = null;
    if (message.body.kind === 'provision-source') {
      acceptedAt = (await createSqlDatabase(env).first<{ created_at: string }>(
        'SELECT created_at FROM managed_sources WHERE id = ?1',
        [message.body.sourceId],
      ))?.created_at ?? null;
    } else if (message.body.kind === 'attest-window') {
      acceptedAt = (await createSqlDatabase(env).first<{ created_at: string }>(
        'SELECT created_at FROM managed_source_runs WHERE id = ?1',
        [message.body.runId],
      ))?.created_at ?? null;
    }
    if (
      message.body.kind !== 'fetch-window'
      && (acceptedAt === null || !sponsorWorkIsEligible(operatingWindow, acceptedAt))
    ) {
      console.log(JSON.stringify({
        message: 'managed_source_wallet_work_deferred_until_processing_start',
        kind: message.body.kind,
        sourceId: 'sourceId' in message.body ? message.body.sourceId : null,
        runId: 'runId' in message.body ? message.body.runId : null,
        acceptedAt,
        eligibleThrough: operatingWindow.eligibleThrough,
        nextProcessingStartsAt: operatingWindow.nextProcessingStartsAt,
      }));
      // Source and Run rows remain queued. The minute dispatcher re-enqueues
      // them after the next daily cutoff includes their accepted-at time.
      message.ack();
      continue;
    }
    if (
      message.body.kind !== 'fetch-window'
      && typeof env.SPONSOR_WALLET.getByName === 'function'
    ) {
      // In production, wallet-dependent Queue messages are admission signals.
      // The scheduled D1 coordinator executes exactly one Server Wallet
      // mutation at a time; fetch-only work remains independently concurrent.
      message.ack();
      continue;
    }
    if (message.body.kind === 'provision-source') {
      await processProvisioning(message, env, message.body.sourceId);
    } else if (message.body.kind === 'fetch-window') {
      await processFetch(message, env, message.body.runId);
    } else {
      await processAttestation(message, env, message.body.runId);
    }
  }
}

function scheduledManagedMessage(body: ManagedSourceQueueMessage): Message<unknown> {
  return {
    body,
    attempts: 1,
    ack() {},
    retry() {},
  } as unknown as Message<unknown>;
}

export async function processScheduledManagedSourceProvisioning(
  env: Env,
  sourceId: string,
): Promise<void> {
  await processProvisioning(
    scheduledManagedMessage({ kind: 'provision-source', sourceId }),
    env,
    sourceId,
  );
}

export async function processScheduledManagedAttestation(
  env: Env,
  runId: string,
): Promise<void> {
  await processAttestation(
    scheduledManagedMessage({ kind: 'attest-window', runId }),
    env,
    runId,
  );
}

interface ExpiredManagedArtifactRow {
  id: string;
  status: ManagedRunStatus;
  private_artifact_key: string;
  proof_job_id: string | null;
}

export async function cleanupExpiredManagedArtifacts(
  env: Env,
  scheduledTime: number,
  limit = 50,
): Promise<number> {
  const database = createSqlDatabase(env);
  const now = new Date(scheduledTime).toISOString();
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const expired = await database.all<ExpiredManagedArtifactRow>(
    `SELECT id, status, private_artifact_key, proof_job_id
     FROM managed_source_runs
     WHERE private_artifact_key IS NOT NULL
       AND private_artifact_expires_at IS NOT NULL
       AND private_artifact_expires_at <= ?1
     ORDER BY private_artifact_expires_at, id
     LIMIT ${boundedLimit}`,
    [now],
  );
  let cleaned = 0;
  for (const row of expired) {
    try {
      await env.MANAGED_SOURCE_DATA.delete(row.private_artifact_key);
      if (row.status === 'confirmed') {
        await database.batch([
          {
            sql: `UPDATE managed_source_runs SET private_artifact_key = NULL,
                    private_artifact_expires_at = NULL, updated_at = ?1
                  WHERE id = ?2 AND private_artifact_key = ?3`,
            parameters: [now, row.id, row.private_artifact_key],
          },
          {
            sql: `UPDATE daily_proof_jobs SET private_input_object_key = NULL, updated_at = ?1
                  WHERE id = ?2 AND private_input_object_key = ?3`,
            parameters: [now, row.proof_job_id, row.private_artifact_key],
          },
        ]);
      } else {
        await database.batch([
          {
            sql: `UPDATE managed_source_runs SET status = 'action_required',
                    stage = 'private_artifact_expired', private_artifact_key = NULL,
                    private_artifact_expires_at = NULL, lease_expires_at = NULL,
                    last_error_code = 'managed_private_artifact_expired',
                    last_error_summary = 'Private retry input expired after seven days',
                    updated_at = ?1
                  WHERE id = ?2 AND private_artifact_key = ?3`,
            parameters: [now, row.id, row.private_artifact_key],
          },
          {
            sql: `UPDATE daily_proof_jobs SET status = 'dead_lettered',
                    private_input_object_key = NULL, lease_expires_at = NULL,
                    last_error_code = 'managed_private_artifact_expired', updated_at = ?1
                  WHERE id = ?2 AND private_input_object_key = ?3
                    AND status NOT IN ('submitted', 'confirmed')`,
            parameters: [now, row.proof_job_id, row.private_artifact_key],
          },
        ]);
      }
      cleaned += 1;
    } catch (error) {
      console.error(JSON.stringify({
        message: 'managed_private_artifact_expiry_cleanup_failed',
        runId: row.id,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }));
    }
  }
  return cleaned;
}

export async function dispatchManagedSourceJobs(env: Env, scheduledTime: number): Promise<void> {
  const database = createSqlDatabase(env);
  const now = new Date(scheduledTime);
  const nowIso = now.toISOString();
  const contractAddress = activeContractAddress(env);
  await cleanupExpiredManagedArtifacts(env, scheduledTime);
  const operatingWindow = await sponsorWalletOperatingWindow(env, now);
  const staleRegistrationBefore = new Date(
    scheduledTime - registrationLeaseMilliseconds,
  ).toISOString();
  await database.batch([
    {
      sql: `UPDATE managed_sources SET stage = 'retry_waiting', available_after = ?1,
              last_error_code = 'managed_registration_lease_expired',
              last_error_summary = 'The registration worker stopped before returning a result',
              updated_at = ?1
            WHERE status = 'provisioning' AND stage = 'registering' AND updated_at < ?2`,
      parameters: [nowIso, staleRegistrationBefore],
    },
    {
      sql: `UPDATE managed_source_runs SET status = 'fetch_retry', stage = 'retry_waiting',
              lease_expires_at = NULL, available_after = ?1,
              last_error_code = 'managed_fetch_lease_expired', updated_at = ?1
            WHERE status = 'fetching' AND lease_expires_at < ?1`,
      parameters: [nowIso],
    },
    {
      sql: `UPDATE managed_source_runs SET status = 'proof_retry', stage = 'retry_waiting',
              lease_expires_at = NULL, available_after = ?1,
              last_error_code = 'managed_proof_lease_expired', updated_at = ?1
            WHERE status = 'proving' AND lease_expires_at < ?1`,
      parameters: [nowIso],
    },
    {
      sql: `UPDATE daily_proof_jobs SET status = 'retryable_failed', lease_expires_at = NULL,
              available_after = ?1, last_error_code = 'managed_proof_lease_expired', updated_at = ?1
            WHERE origin = 'managed-api' AND status = 'proving' AND lease_expires_at < ?1`,
      parameters: [nowIso],
    },
  ]);
  const sources = await database.all<ManagedSourceOperationalRow>(
    `SELECT s.*, p.time_zone_offset_minutes, p.local_day_start_hour,
            NULL AS utc_day_start_minute, NULL AS midnight_contract_address,
            NULL AS midnight_device_commitment, NULL AS assignment_key,
            tp.policy_key, tp.mode, tp.minimum, tp.maximum, tp.value_scale,
            tp.sensor_type_code, tp.unit_code, tp.policy_version
     FROM managed_sources s
     JOIN projects p ON p.id = s.project_id
     JOIN devices d ON d.id = s.device_id AND d.project_id = s.project_id
     JOIN project_policies pp ON pp.project_id = s.project_id
       AND pp.policy_id = s.policy_id
     JOIN threshold_policies tp ON tp.policy_id = pp.policy_id
       AND tp.contract_address = ?1
     WHERE s.status = 'provisioning'
        OR (s.status = 'active' AND d.midnight_contract_address = ?1)`,
    [contractAddress],
  );
  for (const source of sources) {
    if (source.status === 'provisioning') {
      if (
        sponsorWorkIsEligible(operatingWindow, source.created_at)
        && source.stage !== 'registering'
        && source.available_after <= nowIso
      ) {
        await env.MANAGED_SOURCE_QUEUE.send({ kind: 'provision-source', sourceId: source.id });
      }
      continue;
    }
    const cutoff = new Date(scheduledTime - source.fetch_delay_minutes * 60_000);
    const currentDate = operationalPeriodDate(cutoff, {
      timeZoneOffsetMinutes: source.time_zone_offset_minutes,
      localDayStartHour: source.local_day_start_hour,
    });
    const currentWindow = fixedOperationalWindow(currentDate, {
      timeZoneOffsetMinutes: source.time_zone_offset_minutes,
      localDayStartHour: source.local_day_start_hour,
    });
    const latestCompleteDate = operationalPeriodDate(Date.parse(currentWindow.periodStart) - 1, {
      timeZoneOffsetMinutes: source.time_zone_offset_minutes,
      localDayStartHour: source.local_day_start_hour,
    });
    if (latestCompleteDate < source.first_period_date) continue;
    const next = await database.first<{ period_date: string }>(
      `SELECT candidate AS period_date
       FROM (
         SELECT ?2 AS candidate
         WHERE NOT EXISTS (
           SELECT 1 FROM managed_source_runs
           WHERE source_id = ?1 AND period_date = ?2
         )
         UNION ALL
         SELECT date(previous.period_date, '+1 day') AS candidate
         FROM managed_source_runs previous
         LEFT JOIN managed_source_runs following
           ON following.source_id = previous.source_id
          AND following.period_date = date(previous.period_date, '+1 day')
         WHERE previous.source_id = ?1
           AND previous.period_date >= ?2
           AND previous.period_date < ?3
           AND following.id IS NULL
       )
       WHERE candidate <= ?3
       ORDER BY candidate ASC
       LIMIT 1`,
      [source.id, source.first_period_date, latestCompleteDate],
    );
    if (!next) continue;
    const window = fixedOperationalWindow(next.period_date, {
      timeZoneOffsetMinutes: source.time_zone_offset_minutes,
      localDayStartHour: source.local_day_start_hour,
    });
    const identifiers = await managedSourceIdentifiers(
      source.project_id,
      source.id,
      source.policy_id,
      next.period_date,
    );
    await database.execute(
      `INSERT OR IGNORE INTO managed_source_runs (
         id, source_id, project_id, device_id, period_date, period_start, period_end,
         status, stage, fetch_attempt_count, proof_attempt_count,
         available_after, created_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7,
                 'pending_fetch', 'queued', 0, 0, ?8, ?8, ?8)`,
      [
        identifiers.runId!, source.id, source.project_id, source.device_id,
        next.period_date, window.periodStart, window.periodEnd, nowIso,
      ],
    );
  }
  const runs = await database.all<{ id: string; status: ManagedRunStatus; created_at: string }>(
    `SELECT id, status, created_at FROM managed_source_runs
     WHERE status IN ('pending_fetch', 'fetch_retry', 'proof_queued', 'proof_retry')
       AND available_after <= ?1 ORDER BY created_at ASC LIMIT 16`,
    [nowIso],
  );
  for (const run of runs) {
    const fetchWork = run.status === 'pending_fetch' || run.status === 'fetch_retry';
    if (!fetchWork && !sponsorWorkIsEligible(operatingWindow, run.created_at)) continue;
    await env.MANAGED_SOURCE_QUEUE.send({
      kind: fetchWork ? 'fetch-window' : 'attest-window',
      runId: run.id,
    });
  }
}
