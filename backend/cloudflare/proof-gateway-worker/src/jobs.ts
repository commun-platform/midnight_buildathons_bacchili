import {
  applyDeviceRateLimits,
  authorizeDeviceRequest,
  type DevicePrincipal,
} from './device-auth.js';
import { isProofOperatingWindow } from './proof-window.js';
import { createSqlDatabase } from './storage/index.js';

const proofQueueName = 'midnight-proof-jobs';
const proofContainerName = 'midnight-proof-server';
const proofLeaseSeconds = 2 * 60 * 60;
const dispatchBatchSize = 8;
const proofAdmissionCapacity = 1;

export interface ProofQueueMessage {
  kind: 'admit-proof';
  proofJobId: string;
}

export interface ProofJobRow {
  id: string;
  project_id: string;
  device_id: string;
  period_date: string;
  contract_address: string | null;
  measurement_group_id: string;
  attestation_commitment: string;
  device_commitment: string;
  sample_count: number;
  threshold_policy_version: string;
  policy_key: string;
  assignment_id: string;
  assignment_key: string;
  hour_presence: string;
  observed_hour_count: number;
  threshold_satisfied: number;
  schema_version: number;
  circuit_version: number;
  status: string;
  attempt_count: number;
  available_after: string;
  lease_expires_at: string | null;
  proof_artifact_key: string | null;
  proof_generated_at: string | null;
  device_transaction_object_key: string | null;
  device_transaction_hash: string | null;
  device_transaction_bytes: number | null;
  sponsor_transaction_object_key: string | null;
  sponsor_serialized_sha256: string | null;
  sponsor_transaction_id: string | null;
  sponsor_fee_specks: string | null;
  sponsor_transaction_bytes: number | null;
  sponsor_attempt_count: number;
  sponsor_available_after: string;
  sponsor_lease_expires_at: string | null;
  sponsor_stage?: string | null;
  sponsor_reason_code?: string | null;
  sponsor_stage_updated_at?: string | null;
  sponsorship_started_at: string | null;
  sponsorship_completed_at: string | null;
  attest_tx_id: string | null;
  attest_tx_hash: string | null;
  block_height: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

export type ProofJobAuthorization =
  | { ok: true; job: ProofJobRow }
  | { ok: false; response: Response };

function json(status: number, value: unknown): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function errorCode(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') return 'proof_container_timeout';
  return 'proof_container_unavailable';
}

function isProofQueueMessage(value: unknown): value is ProofQueueMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as { kind?: unknown; proofJobId?: unknown };
  return message.kind === 'admit-proof'
    && typeof message.proofJobId === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(message.proofJobId);
}

export async function dispatchProofJobs(env: Env, scheduledTime: number): Promise<void> {
  const database = createSqlDatabase(env);
  const scheduledAt = new Date(scheduledTime);
  const nowIso = scheduledAt.toISOString();
  const nowSeconds = Math.floor(scheduledTime / 1000);
  await Promise.all([
    database.execute('DELETE FROM device_auth_challenges WHERE expires_at < ?1', [nowSeconds - 3600]),
    database.execute('DELETE FROM device_auth_sessions WHERE expires_at < ?1', [nowSeconds - 86400]),
    database.execute(
      `UPDATE daily_proof_jobs
       SET status = 'retryable_failed', lease_expires_at = NULL, available_after = ?1, updated_at = ?1,
           last_error_code = 'proof_input_lease_expired'
       WHERE status IN ('ready_for_input', 'proving', 'proof_ready') AND lease_expires_at < ?1`,
      [nowIso],
    ),
  ]);
  if (!isProofOperatingWindow(scheduledAt)) return;
  const jobs = await database.all<{ id: string }>(
    `SELECT id FROM daily_proof_jobs
     WHERE status IN ('pending', 'retryable_failed') AND available_after <= ?1
     ORDER BY created_at ASC LIMIT ${dispatchBatchSize}`,
    [nowIso],
  );
  for (const job of jobs) {
    const updatedAt = new Date().toISOString();
    const claimed = await database.execute(
      `UPDATE daily_proof_jobs SET status = 'dispatched', updated_at = ?1
       WHERE id = ?2 AND status IN ('pending', 'retryable_failed')`,
      [updatedAt, job.id],
    );
    if (claimed < 1) continue;
    try {
      await env.PROOF_QUEUE.send({ kind: 'admit-proof', proofJobId: job.id } satisfies ProofQueueMessage);
    } catch (error) {
      await database.execute(
        `UPDATE daily_proof_jobs SET status = 'retryable_failed', updated_at = ?1,
           last_error_code = 'proof_queue_send_failed'
         WHERE id = ?2 AND status = 'dispatched'`,
        [new Date().toISOString(), job.id],
      );
      console.error(JSON.stringify({
        message: 'proof_job_dispatch_failed',
        proofJobId: job.id,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }));
    }
  }
}

async function admitProofJob(message: Message<unknown>, env: Env): Promise<void> {
  if (!isProofQueueMessage(message.body)) {
    message.ack();
    return;
  }
  const database = createSqlDatabase(env);
  const job = await database.first<ProofJobRow>(
    'SELECT * FROM daily_proof_jobs WHERE id = ?1',
    [message.body.proofJobId],
  );
  if (!job || [
    'proof_ready', 'device_bound', 'sponsoring', 'sponsored',
    'submitted', 'confirmed', 'dead_lettered',
  ].includes(job.status)) {
    message.ack();
    return;
  }
  if (!isProofOperatingWindow(new Date())) {
    await database.execute(
      `UPDATE daily_proof_jobs SET status = 'pending', updated_at = ?1
       WHERE id = ?2 AND status IN ('dispatched', 'retryable_failed')`,
      [new Date().toISOString(), job.id],
    );
    message.ack();
    return;
  }
  const active = await database.first<{ active_count: number }>(
    `SELECT
       (SELECT COUNT(*) FROM daily_proof_jobs
        WHERE status IN ('ready_for_input', 'proving', 'proof_ready')
          AND lease_expires_at > ?1)
       +
       (SELECT COUNT(*) FROM operator_proof_leases
        WHERE status = 'active' AND expires_at > ?2) AS active_count`,
    [new Date().toISOString(), Math.floor(Date.now() / 1000)],
  );
  if ((active?.active_count ?? 0) >= proofAdmissionCapacity) {
    const retryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await database.execute(
      `UPDATE daily_proof_jobs SET status = 'pending', available_after = ?1, updated_at = ?2
       WHERE id = ?3 AND status = 'dispatched'`,
      [retryAt, new Date().toISOString(), job.id],
    );
    message.ack();
    return;
  }
  try {
    const { getContainer } = await import('@cloudflare/containers');
    const container = getContainer(env.PROOF_SERVER, proofContainerName);
    const response = await container.fetch(new Request('http://proof-server/health', {
      signal: AbortSignal.timeout(8 * 60 * 1000),
    }));
    if (!response.ok) throw new Error(`Proof Server readiness returned HTTP ${response.status}`);
    const now = new Date();
    const leaseExpiresAt = new Date(now.valueOf() + proofLeaseSeconds * 1000).toISOString();
    const changes = await database.execute(
      `UPDATE daily_proof_jobs SET status = 'ready_for_input', attempt_count = attempt_count + 1,
         lease_expires_at = ?1, last_error_code = NULL, updated_at = ?2
       WHERE id = ?3 AND status IN ('dispatched', 'retryable_failed')`,
      [leaseExpiresAt, now.toISOString(), job.id],
    );
    if (changes !== 1) {
      message.ack();
      return;
    }
    message.ack();
  } catch (error) {
    const failedAt = new Date();
    const terminal = message.attempts >= 4;
    await database.execute(
      `UPDATE daily_proof_jobs SET status = ?1, attempt_count = attempt_count + 1,
         available_after = ?2, last_error_code = ?3, updated_at = ?4
       WHERE id = ?5 AND status IN ('dispatched', 'retryable_failed')`,
      [
        terminal ? 'dead_lettered' : 'retryable_failed',
        new Date(failedAt.valueOf() + 5 * 60 * 1000).toISOString(),
        errorCode(error),
        failedAt.toISOString(),
        job.id,
      ],
    );
    console.error(JSON.stringify({
      message: 'proof_job_admission_failed',
      proofJobId: job.id,
      attempt: message.attempts,
      errorCode: errorCode(error),
    }));
    message.retry({ delaySeconds: 60 });
  }
}

export async function handleJobQueue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  if (batch.queue !== proofQueueName) {
    batch.retryAll({ delaySeconds: 60 });
    return;
  }
  for (const message of batch.messages) await admitProofJob(message, env);
}

export async function authorizeProofJob(
  request: Request,
  env: Env,
  principal: DevicePrincipal,
  startProving: boolean,
): Promise<ProofJobAuthorization> {
  const proofJobId = request.headers.get('X-Proof-Job-Id')?.trim() ?? '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(proofJobId)) {
    return { ok: false, response: json(400, { error: 'X-Proof-Job-Id is required' }) };
  }
  const database = createSqlDatabase(env);
  const job = await database.first<ProofJobRow>(
    'SELECT * FROM daily_proof_jobs WHERE id = ?1 AND device_id = ?2 AND project_id = ?3',
    [proofJobId, principal.deviceId, principal.projectId],
  );
  if (!job) return { ok: false, response: json(404, { error: 'Proof Job not found' }) };
  if (!['ready_for_input', 'proving', 'proof_ready'].includes(job.status)) {
    return { ok: false, response: json(409, { error: 'Proof Job has not been admitted' }) };
  }
  if (!job.lease_expires_at || Date.parse(job.lease_expires_at) <= Date.now()) {
    return { ok: false, response: json(409, { error: 'Proof Job input lease has expired' }) };
  }
  if (startProving && job.status !== 'proving') {
    const updatedAt = new Date().toISOString();
    const changes = await database.execute(
      `UPDATE daily_proof_jobs SET status = 'proving', updated_at = ?1
       WHERE id = ?2 AND status IN ('ready_for_input', 'proof_ready')`,
      [updatedAt, job.id],
    );
    if (changes > 0) return { ok: true, job: { ...job, status: 'proving', updated_at: updatedAt } };
    const current = await database.first<ProofJobRow>(
      'SELECT * FROM daily_proof_jobs WHERE id = ?1',
      [job.id],
    );
    if (!current || current.status !== 'proving') {
      return { ok: false, response: json(409, { error: 'Proof Job state changed' }) };
    }
    return { ok: true, job: current };
  }
  return { ok: true, job };
}

export async function markProofReady(env: Env, proofJobId: string): Promise<void> {
  const completedAt = new Date().toISOString();
  await createSqlDatabase(env).execute(
    `UPDATE daily_proof_jobs
     SET status = 'proof_ready',
         proof_generated_at = COALESCE(proof_generated_at, ?1),
         updated_at = ?1
     WHERE id = ?2 AND status = 'proving'`,
    [completedAt, proofJobId],
  );
}

export async function admitProofJobForBrowserDevice(
  request: Request,
  env: Env,
  proofJobId: string,
): Promise<Response> {
  const authorization = await authorizeDeviceRequest(request, env, 'proof:request');
  if (!authorization.ok) return authorization.response;
  if (!(await applyDeviceRateLimits(env.API_RATE_LIMITER, request, authorization.principal))) {
    return json(429, { error: 'Immediate Proof admission rate limit exceeded' });
  }
  const database = createSqlDatabase(env);
  const job = await database.first<ProofJobRow>(
    'SELECT * FROM daily_proof_jobs WHERE id = ?1 AND device_id = ?2 AND project_id = ?3',
    [proofJobId, authorization.principal.deviceId, authorization.principal.projectId],
  );
  if (!job) return json(404, { error: 'Proof Job not found' });
  if (['ready_for_input', 'proving', 'proof_ready'].includes(job.status)) {
    return json(200, { admitted: true, proofJobId, status: job.status });
  }
  if (!['pending', 'retryable_failed'].includes(job.status)) {
    return json(409, { error: `Proof Job cannot be admitted from status ${job.status}` });
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseExpiresAt = new Date(now.valueOf() + proofLeaseSeconds * 1000).toISOString();
  const active = await database.first<{ active_count: number }>(
    `SELECT
       (SELECT COUNT(*) FROM daily_proof_jobs
        WHERE status IN ('ready_for_input', 'proving', 'proof_ready')
          AND lease_expires_at > ?1)
       +
       (SELECT COUNT(*) FROM operator_proof_leases
        WHERE status = 'active' AND expires_at > ?2) AS active_count`,
    [nowIso, Math.floor(now.valueOf() / 1000)],
  );
  if ((active?.active_count ?? 0) >= proofAdmissionCapacity) {
    return json(409, { error: 'Proof capacity is already leased; retry shortly' });
  }
  const changed = await database.execute(
    `UPDATE daily_proof_jobs
     SET status = 'ready_for_input', attempt_count = attempt_count + 1,
         lease_expires_at = ?1, last_error_code = NULL, updated_at = ?2
     WHERE id = ?3 AND device_id = ?4 AND project_id = ?5
       AND status IN ('pending', 'retryable_failed')`,
    [
      leaseExpiresAt,
      nowIso,
      proofJobId,
      authorization.principal.deviceId,
      authorization.principal.projectId,
    ],
  );
  if (changed !== 1) return json(409, { error: 'Proof Job state changed' });
  return json(200, {
    admitted: true,
    proofJobId,
    status: 'ready_for_input',
    leaseExpiresAt,
  });
}
