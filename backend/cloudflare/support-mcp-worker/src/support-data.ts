type D1Row = Record<string, unknown>;

async function all<T extends D1Row>(statement: D1PreparedStatement): Promise<T[]> {
  return (await statement.all<T>()).results;
}

function safeJson(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function sanitizeWalletState(summary: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!summary) return null;
  const balances = safeRecord(summary.balances);
  const synchronization = Array.isArray(summary.synchronization)
    ? summary.synchronization.map((value) => {
      const row = safeRecord(value);
      return row ? {
        channel: row.channel ?? null,
        applied: row.applied ?? null,
        highest: row.highest ?? null,
        lag: row.lag ?? null,
        connected: row.connected ?? null,
        complete: row.complete ?? null,
      } : null;
    }).filter((value) => value !== null)
    : [];
  return {
    healthClass: summary.healthClass ?? null,
    phase: summary.phase ?? null,
    initializedAt: summary.initializedAt ?? null,
    lastStateAt: summary.lastStateAt ?? null,
    progress: summary.progress ?? null,
    synchronization,
    balances: balances ? {
      night: balances.night ?? null,
      dust: balances.dust ?? null,
      spendableDustCoins: balances.spendableDustCoins ?? null,
      pendingDustCoins: balances.pendingDustCoins ?? null,
      totalDustCoins: balances.totalDustCoins ?? null,
    } : null,
    initializationStatus: safeRecord(summary.initialization)?.status ?? null,
    checkpointStatus: safeRecord(summary.synchronizationCheckpoint)?.status ?? null,
    supervisorStatus: safeRecord(summary.supervisor)?.status ?? null,
    shuttingDown: summary.shuttingDown ?? null,
    errorCode: summary.errorCode ?? null,
  };
}

function safeRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function systemOverview(env: Pick<Env, 'DB'>): Promise<Record<string, unknown>> {
  const [inventory, proofStatuses, registrationStatuses, policyStatuses, activeAlerts] = await Promise.all([
    env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM projects) AS projects,
      (SELECT COUNT(*) FROM devices) AS devices,
      (SELECT COUNT(*) FROM threshold_policies WHERE status = 'registered') AS policies,
      (SELECT COUNT(*) FROM managed_sources) AS managed_sources`).first<D1Row>(),
    all<{ status: string; count: number; oldest_at: string | null }>(env.DB.prepare(
      `SELECT status, COUNT(*) AS count, MIN(created_at) AS oldest_at
       FROM daily_proof_jobs GROUP BY status ORDER BY status`,
    )),
    all<{ status: string; count: number }>(env.DB.prepare(
      `SELECT status, COUNT(*) AS count FROM browser_provisioning_operations
       GROUP BY status ORDER BY status`,
    )),
    all<{ status: string; count: number }>(env.DB.prepare(
      `SELECT status, COUNT(*) AS count FROM browser_policy_operations
       GROUP BY status ORDER BY status`,
    )),
    all<{ severity: string; count: number }>(env.DB.prepare(
      `SELECT severity, COUNT(*) AS count FROM operations_alert_state
       WHERE status = 'open' GROUP BY severity ORDER BY severity`,
    )),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    inventory: inventory ?? {},
    proofJobsByStatus: proofStatuses,
    deviceRegistrationsByStatus: registrationStatuses,
    policyRegistrationsByStatus: policyStatuses,
    activeAlertsBySeverity: activeAlerts,
  };
}

export async function walletStatus(
  env: Pick<Env, 'DB'>,
): Promise<Record<string, unknown>> {
  const [component, schedule] = await Promise.all([
    env.DB.prepare(
      `SELECT health_class, last_observed_at, last_changed_at, summary_json
       FROM system_component_state WHERE component = 'sponsor-wallet'`,
    ).first<D1Row>(),
    env.DB.prepare(
      `SELECT mode, time_zone_offset_minutes, processing_starts_at_minute,
              last_stopped_at, next_start_allowed_at, updated_at
       FROM sponsor_wallet_operating_schedule WHERE singleton_id = 1`,
    ).first<D1Row>(),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    source: 'last-observed-operational-state',
    healthClass: component?.health_class ?? 'unavailable',
    lastObservedAt: component?.last_observed_at ?? null,
    lastChangedAt: component?.last_changed_at ?? null,
    wallet: sanitizeWalletState(safeJson(component?.summary_json)),
    processingSchedule: schedule ?? null,
    checkpointStatus: safeRecord(safeJson(component?.summary_json)?.synchronizationCheckpoint)?.status
      ?? null,
  };
}

export async function jobStatistics(
  env: Pick<Env, 'DB'>,
  days: number,
): Promise<Record<string, unknown>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [proofByDay, proofByStatus, managedByStatus] = await Promise.all([
    all<D1Row>(env.DB.prepare(
      `SELECT substr(created_at, 1, 10) AS day,
        COUNT(*) AS accepted,
        SUM(CASE WHEN proof_generated_at IS NOT NULL THEN 1 ELSE 0 END) AS proofs_generated,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN status IN ('retryable_failed', 'dead_lettered', 'reproof_required')
          THEN 1 ELSE 0 END) AS failed
       FROM daily_proof_jobs WHERE created_at >= ?1 GROUP BY day ORDER BY day`,
    ).bind(since)),
    all<D1Row>(env.DB.prepare(
      `SELECT status, origin, COUNT(*) AS count, MIN(created_at) AS oldest_at,
              MAX(updated_at) AS newest_at
       FROM daily_proof_jobs WHERE created_at >= ?1
       GROUP BY status, origin ORDER BY origin, status`,
    ).bind(since)),
    all<D1Row>(env.DB.prepare(
      `SELECT status, COUNT(*) AS count, MIN(created_at) AS oldest_at,
              MAX(updated_at) AS newest_at
       FROM managed_source_runs WHERE created_at >= ?1 GROUP BY status ORDER BY status`,
    ).bind(since)),
  ]);
  return { generatedAt: new Date().toISOString(), days, since, proofByDay, proofByStatus, managedByStatus };
}

export interface JobSearch {
  proofJobId?: string;
  transactionHash?: string;
  projectId?: string;
  deviceId?: string;
  status?: string;
  limit: number;
}

export async function findProofJobs(
  env: Pick<Env, 'DB'>,
  input: JobSearch,
): Promise<Record<string, unknown>> {
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  const bind = (value: string | number): string => {
    values.push(value);
    return `?${values.length}`;
  };
  if (input.proofJobId) clauses.push(`id = ${bind(input.proofJobId)}`);
  if (input.transactionHash) {
    clauses.push(`lower(attest_tx_hash) = ${bind(input.transactionHash.replace(/^0x/iu, '').toLowerCase())}`);
  }
  if (input.projectId) clauses.push(`project_id = ${bind(input.projectId)}`);
  if (input.deviceId) clauses.push(`device_id = ${bind(input.deviceId)}`);
  if (input.status) clauses.push(`status = ${bind(input.status)}`);
  const limit = bind(input.limit);
  const statement = env.DB.prepare(
    `SELECT id AS proof_job_id, origin, project_id, device_id, period_date,
            sample_count, observed_hour_count, threshold_satisfied, status,
            attempt_count, sponsor_attempt_count, sponsor_stage,
            sponsor_reason_code, sponsor_stage_updated_at, last_error_code,
            proof_generated_at, sponsorship_completed_at, attest_tx_hash,
            block_height, created_at, updated_at
     FROM daily_proof_jobs
     ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY created_at DESC LIMIT ${limit}`,
  ).bind(...values);
  return {
    generatedAt: new Date().toISOString(),
    jobs: await all<D1Row>(statement),
  };
}

export interface EventSearch {
  walletIdentifier?: string;
  projectId?: string;
  deviceId?: string;
  requestId?: string;
  correlationId?: string;
  severity?: string;
  category?: string;
  sinceHours: number;
  limit: number;
}

export async function searchOperationalEvents(
  env: Pick<Env, 'DB'>,
  input: EventSearch,
): Promise<Record<string, unknown>> {
  const clauses = ['occurred_at >= ?1'];
  const values: Array<string | number> = [new Date(Date.now() - input.sinceHours * 3_600_000).toISOString()];
  const bind = (value: string | number): string => {
    values.push(value);
    return `?${values.length}`;
  };
  if (input.walletIdentifier) {
    clauses.push(`actor_type = 'wallet' AND actor_identifier = ${bind(input.walletIdentifier)}`);
  }
  if (input.projectId) clauses.push(`project_id = ${bind(input.projectId)}`);
  if (input.deviceId) clauses.push(`device_id = ${bind(input.deviceId)}`);
  if (input.requestId) clauses.push(`request_id = ${bind(input.requestId)}`);
  if (input.correlationId) clauses.push(`correlation_id = ${bind(input.correlationId)}`);
  if (input.severity) clauses.push(`severity = ${bind(input.severity)}`);
  if (input.category) clauses.push(`category = ${bind(input.category)}`);
  const limit = bind(input.limit);
  const rows = await all<D1Row>(env.DB.prepare(
    `SELECT occurred_at, category, severity, actor_type, actor_identifier,
            action, method, route, response_status, outcome, request_id,
            client_operation_id, project_id, device_id, resource_type,
            resource_id, correlation_id, state_from, state_to, error_code,
            duration_ms
     FROM operational_events WHERE ${clauses.join(' AND ')}
     ORDER BY occurred_at DESC, id DESC LIMIT ${limit}`,
  ).bind(...values));
  return { generatedAt: new Date().toISOString(), sinceHours: input.sinceHours, events: rows };
}

export async function managedSourceStatus(
  env: Pick<Env, 'DB'>,
  projectId?: string,
): Promise<Record<string, unknown>> {
  const projectFilter = projectId ? 'WHERE project_id = ?1' : '';
  const parameters = projectId ? [projectId] : [];
  const [sources, runs] = await Promise.all([
    all<D1Row>(env.DB.prepare(
      `SELECT id AS source_id, project_id, device_id, name, status, stage,
              attempt_count, last_error_code, updated_at
       FROM managed_sources ${projectFilter} ORDER BY updated_at DESC LIMIT 100`,
    ).bind(...parameters)),
    all<D1Row>(env.DB.prepare(
      `SELECT id AS run_id, source_id, project_id, device_id, period_date,
              status, stage, fetch_attempt_count, proof_attempt_count,
              source_http_status, sample_count, observed_hour_count,
              proof_job_id, last_error_code, updated_at
       FROM managed_source_runs ${projectFilter} ORDER BY updated_at DESC LIMIT 100`,
    ).bind(...parameters)),
  ]);
  return { generatedAt: new Date().toISOString(), sources, runs };
}
