import {
  discordNotificationsConfigured,
  operationalAlertThresholds,
} from './operations-notifications.js';
import {
  recordSponsorWalletHealth,
  sponsorWalletOperationsView,
  type SponsorWalletOperationsView,
} from './operations-audit.js';
import { sponsorCheckpointKey } from './sponsor-checkpoint.js';
import { latestSponsorFee, sponsorDustFunds } from './sponsor-dust.js';
import { probeSponsorWalletHealth } from './sponsor.js';
import {
  authorizeSystemOperator,
  type SystemOperatorPrincipal,
} from './system-operations-auth.js';
import { createSqlDatabase } from './storage/index.js';
import type { SqlDatabase, SqlParameter } from './storage/sql.js';

const proofQueueStates = [
  'pending',
  'dispatched',
  'ready_for_input',
  'proving',
  'proof_ready',
  'device_bound',
] as const;
const sponsorQueueStates = [
  'awaiting_sponsor',
  'sponsor_retryable',
  'sponsoring',
  'sponsored',
] as const;
const terminalFailureStates = [
  'retryable_failed',
  'dead_lettered',
  'reproof_required',
] as const;

interface CountRow {
  count: number;
}

interface StatusCountRow {
  status: string;
  count: number;
  oldest_at: string | null;
  newest_at: string | null;
}

interface ComponentStateRow {
  health_class: SponsorWalletOperationsView['healthClass'];
  last_observed_at: string;
  last_changed_at: string;
  summary_json: string;
}

interface AlertRow {
  alert_key: string;
  severity: 'warning' | 'error';
  status: 'open' | 'resolved';
  summary: string;
  first_observed_at: string;
  last_observed_at: string;
  last_notified_at: string | null;
  resolved_at: string | null;
  occurrence_count: number;
}

interface NotificationCountRow {
  status: string;
  count: number;
}

interface DailyMetricRow {
  day: string;
  metric: string;
  value: number;
}

interface OperationalEventRow {
  id: string;
  occurred_at: string;
  category: string;
  severity: string;
  actor_type: string;
  actor_identifier: string | null;
  action: string;
  method: string | null;
  route: string | null;
  response_status: number | null;
  outcome: string;
  request_id: string | null;
  client_operation_id: string | null;
  project_id: string | null;
  device_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  correlation_id: string | null;
  state_from: string | null;
  state_to: string | null;
  error_code: string | null;
  duration_ms: number | null;
  details_json: string;
}

interface SponsorJobDetailRow {
  id: string;
  project_id: string;
  device_id: string;
  period_date: string;
  status: string;
  sponsor_stage: string | null;
  sponsor_reason_code: string | null;
  sponsor_stage_updated_at: string | null;
  sponsor_available_after: string;
  sponsor_lease_expires_at: string | null;
  sponsor_attempt_count: number;
  last_error_code: string | null;
}

function securityHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

function json(status: number, value: unknown): Response {
  return Response.json(value, { status, headers: securityHeaders() });
}

function countMap(rows: Array<{ status: string; count: number }>): Record<string, number> {
  return Object.fromEntries(rows.map(({ status, count }) => [status, Number(count)]));
}

function sumStates(rows: StatusCountRow[], states: readonly string[]): number {
  const selected = new Set(states);
  return rows.reduce((sum, row) => sum + (selected.has(row.status) ? Number(row.count) : 0), 0);
}

function oldestInStates(rows: StatusCountRow[], states: readonly string[]): string | null {
  const selected = new Set(states);
  return rows
    .filter((row) => selected.has(row.status) && row.oldest_at)
    .map((row) => row.oldest_at as string)
    .sort()[0] ?? null;
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function overview(
  env: Env,
  context: ExecutionContext,
  principal: SystemOperatorPrincipal,
): Promise<Response> {
  const database = createSqlDatabase(env);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [
    jobStates,
    provisioningStates,
    policyStates,
    deviceTotal,
    projectTotal,
    policyTotal,
    failures24h,
    componentState,
    healthHistory,
    alerts,
    notificationCounts,
    latestFee,
    checkpoint,
    sponsorJobs,
  ] = await Promise.all([
    database.all<StatusCountRow>(
      `SELECT status, COUNT(*) AS count, MIN(updated_at) AS oldest_at,
              MAX(updated_at) AS newest_at
       FROM daily_proof_jobs GROUP BY status ORDER BY status`,
    ),
    database.all<StatusCountRow>(
      `SELECT status, COUNT(*) AS count, MIN(updated_at) AS oldest_at,
              MAX(updated_at) AS newest_at
       FROM browser_provisioning_operations GROUP BY status ORDER BY status`,
    ),
    database.all<StatusCountRow>(
      `SELECT status, COUNT(*) AS count, MIN(updated_at) AS oldest_at,
              MAX(updated_at) AS newest_at
       FROM browser_policy_operations GROUP BY status ORDER BY status`,
    ),
    database.first<CountRow>('SELECT COUNT(*) AS count FROM devices'),
    database.first<CountRow>('SELECT COUNT(*) AS count FROM projects'),
    database.first<CountRow>("SELECT COUNT(*) AS count FROM threshold_policies WHERE status = 'registered'"),
    database.first<CountRow>(
      `SELECT COUNT(*) AS count FROM operational_events
       WHERE severity = 'error' AND occurred_at >= ?1`,
      [since],
    ),
    database.first<ComponentStateRow>(
      `SELECT health_class, last_observed_at, last_changed_at, summary_json
       FROM system_component_state WHERE component = 'sponsor-wallet'`,
    ),
    database.all<{
      observed_at: string;
      health_class: string;
      phase: string;
      changed: number;
    }>(
      `SELECT observed_at, health_class, phase, changed
       FROM system_health_snapshots WHERE component = 'sponsor-wallet'
       ORDER BY observed_at DESC LIMIT 48`,
    ),
    database.all<AlertRow>(
      `SELECT * FROM operations_alert_state
       ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END,
                last_observed_at DESC LIMIT 50`,
    ),
    database.all<NotificationCountRow>(
      `SELECT status, COUNT(*) AS count FROM operations_notification_outbox
       GROUP BY status ORDER BY status`,
    ),
    latestSponsorFee(database),
    env.SPONSOR_STATE.head(sponsorCheckpointKey).catch(() => null),
    database.all<SponsorJobDetailRow>(
      `SELECT id, project_id, device_id, period_date, status,
              sponsor_stage, sponsor_reason_code, sponsor_stage_updated_at,
              sponsor_available_after, sponsor_lease_expires_at,
              sponsor_attempt_count, last_error_code
       FROM daily_proof_jobs
       WHERE status IN ('awaiting_sponsor', 'sponsor_retryable', 'sponsoring', 'sponsored')
       ORDER BY COALESCE(sponsor_stage_updated_at, updated_at) ASC LIMIT 32`,
    ),
  ]);

  let sponsorWallet: SponsorWalletOperationsView | null = componentState
    ? safeJson<SponsorWalletOperationsView | null>(componentState.summary_json, null)
    : null;
  let live = false;
  let liveErrorCode: string | null = null;
  try {
    const health = await probeSponsorWalletHealth(env);
    sponsorWallet = sponsorWalletOperationsView(health);
    live = true;
    context.waitUntil(recordSponsorWalletHealth(env, health));
  } catch (error) {
    liveErrorCode = error instanceof DOMException && error.name === 'TimeoutError'
      ? 'sponsor_wallet_probe_timeout'
      : 'sponsor_wallet_probe_failed';
  }

  const proofBacklog = sumStates(jobStates, proofQueueStates);
  const sponsorBacklog = sumStates(jobStates, sponsorQueueStates);
  const failures = sumStates(jobStates, terminalFailureStates);
  const proofOldestAt = oldestInStates(jobStates, proofQueueStates);
  const sponsorOldestAt = oldestInStates(jobStates, sponsorQueueStates);
  const proofOldestAgeMinutes = proofOldestAt
    ? Math.max(0, Math.floor((Date.now() - Date.parse(proofOldestAt)) / 60_000))
    : null;
  const proofServerClass = proofBacklog > 0 && (proofOldestAgeMinutes ?? 0) >= 10
    ? 'degraded'
    : 'healthy';
  const openAlerts = alerts.filter((alert) => alert.status === 'open');
  const funds = sponsorDustFunds(sponsorWallet?.balances.dust, latestFee);

  return json(200, {
    generatedAt: new Date().toISOString(),
    operator: principal,
    overall: {
      healthClass: openAlerts.some((alert) => alert.severity === 'error')
        ? 'unavailable'
        : openAlerts.length > 0 || sponsorWallet?.healthClass === 'degraded'
          ? 'degraded'
          : sponsorWallet?.healthClass ?? 'degraded',
      openAlerts: openAlerts.length,
      failures24h: Number(failures24h?.count ?? 0),
    },
    components: {
      worker: { healthClass: 'healthy', source: 'current-request' },
      d1: { healthClass: 'healthy', source: 'current-query' },
      proofServer: {
        healthClass: proofServerClass,
        source: 'job-state-inference',
        proofBacklog,
        oldestPendingAt: proofOldestAt,
        note: 'No container wake-up is performed by this dashboard.',
      },
      sponsorWallet: {
        healthClass: sponsorWallet?.healthClass ?? 'unavailable',
        source: live ? 'live-probe' : componentState ? 'last-known-state' : 'unavailable',
        live,
        liveErrorCode,
        lastObservedAt: live ? new Date().toISOString() : componentState?.last_observed_at ?? null,
        lastChangedAt: componentState?.last_changed_at ?? null,
        state: sponsorWallet,
        funds,
      },
    },
    inventory: {
      projects: Number(projectTotal?.count ?? 0),
      devices: Number(deviceTotal?.count ?? 0),
      registeredPolicies: Number(policyTotal?.count ?? 0),
    },
    processing: {
      jobStates: countMap(jobStates),
      registrationOperations: countMap(provisioningStates),
      policyOperations: countMap(policyStates),
      proofBacklog,
      proofOldestAt,
      sponsorBacklog,
      sponsorOldestAt,
      sponsorJobs: sponsorJobs.map((job) => {
        const stageUpdatedAt = job.sponsor_stage_updated_at;
        const stageAgeSeconds = stageUpdatedAt
          ? Math.max(0, Math.floor((Date.now() - Date.parse(stageUpdatedAt)) / 1_000))
          : null;
        return {
          proofJobId: job.id,
          projectId: job.project_id,
          deviceId: job.device_id,
          periodDate: job.period_date,
          status: job.status,
          stage: job.sponsor_stage,
          reasonCode: job.sponsor_reason_code,
          stageUpdatedAt,
          stageAgeSeconds,
          nextRetryAt: job.status === 'sponsor_retryable'
            ? job.sponsor_available_after
            : job.sponsor_stage === 'interrupted' && job.sponsor_lease_expires_at
              ? new Date(Date.parse(job.sponsor_lease_expires_at) - 4 * 60_000).toISOString()
              : null,
          leaseExpiresAt: job.sponsor_lease_expires_at,
          attemptCount: Number(job.sponsor_attempt_count),
          errorCode: job.last_error_code,
          stalled: job.sponsor_stage === 'interrupted'
            || (job.status === 'sponsoring' && stageAgeSeconds !== null
              && stageAgeSeconds >= 15 * 60),
        };
      }),
      terminalFailures: failures,
    },
    checkpoint: checkpoint ? {
      present: true,
      size: checkpoint.size,
      uploadedAt: checkpoint.uploaded.toISOString(),
      source: checkpoint.customMetadata?.source ?? null,
      phase: checkpoint.customMetadata?.phase ?? null,
      shieldedApplied: checkpoint.customMetadata?.shieldedApplied ?? null,
      unshieldedApplied: checkpoint.customMetadata?.unshieldedApplied ?? null,
      dustApplied: checkpoint.customMetadata?.dustApplied ?? null,
    } : { present: false },
    alerts,
    notifications: {
      discordConfigured: discordNotificationsConfigured(env),
      outbox: countMap(notificationCounts),
    },
    thresholds: operationalAlertThresholds(env),
    healthHistory,
  });
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function metrics(database: SqlDatabase, days: number): Promise<Response> {
  const today = new Date();
  const start = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate() - days + 1,
  ));
  const startDay = dateKey(start);
  const metricQueries: Array<[string, string]> = [
    ['devicesRegistered', `SELECT substr(midnight_registered_at, 1, 10) AS day,
      COUNT(*) AS value FROM devices
      WHERE midnight_registered_at IS NOT NULL AND midnight_registered_at >= ?1 GROUP BY day`],
    ['proofJobsAccepted', `SELECT substr(created_at, 1, 10) AS day,
      COUNT(*) AS value FROM daily_proof_jobs WHERE created_at >= ?1 GROUP BY day`],
    ['proofsGenerated', `SELECT substr(proof_generated_at, 1, 10) AS day,
      COUNT(*) AS value FROM daily_proof_jobs
      WHERE proof_generated_at IS NOT NULL AND proof_generated_at >= ?1 GROUP BY day`],
    ['sponsoredTransactions', `SELECT substr(sponsorship_completed_at, 1, 10) AS day,
      COUNT(*) AS value FROM daily_proof_jobs
      WHERE sponsorship_completed_at IS NOT NULL AND sponsorship_completed_at >= ?1 GROUP BY day`],
    ['terminalFailures', `SELECT substr(updated_at, 1, 10) AS day,
      COUNT(*) AS value FROM daily_proof_jobs
      WHERE status IN ('retryable_failed', 'dead_lettered', 'reproof_required')
        AND updated_at >= ?1 GROUP BY day`],
    ['measurementWindows', `SELECT substr(received_at, 1, 10) AS day,
      COUNT(*) AS value FROM measurement_windows WHERE received_at >= ?1 GROUP BY day`],
    ['measurementSamples', `SELECT substr(received_at, 1, 10) AS day,
      COALESCE(SUM(sample_count), 0) AS value FROM measurement_windows
      WHERE received_at >= ?1 GROUP BY day`],
  ];
  const rows = (await Promise.all(metricQueries.map(async ([metric, sql]) => (
    (await database.all<Omit<DailyMetricRow, 'metric'>>(sql, [startDay]))
      .map((row) => ({ ...row, metric }))
  )))).flat();
  const metricNames = [
    'devicesRegistered',
    'proofJobsAccepted',
    'proofsGenerated',
    'sponsoredTransactions',
    'terminalFailures',
    'measurementWindows',
    'measurementSamples',
  ];
  const values = new Map(rows.map((row) => [`${row.day}:${row.metric}`, Number(row.value)]));
  const series = Array.from({ length: days }, (_, index) => {
    const day = dateKey(new Date(start.getTime() + index * 24 * 60 * 60 * 1000));
    return {
      day,
      ...Object.fromEntries(metricNames.map((metric) => [metric, values.get(`${day}:${metric}`) ?? 0])),
    };
  });
  return json(200, {
    generatedAt: new Date().toISOString(),
    days,
    startDay,
    endDay: dateKey(today),
    series,
  });
}

function encodeCursor(row: Pick<OperationalEventRow, 'occurred_at' | 'id'>): string {
  return btoa(JSON.stringify([row.occurred_at, row.id]))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '');
}

function decodeCursor(value: string): [string, string] | null {
  try {
    const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    const parsed = JSON.parse(decoded) as unknown;
    return Array.isArray(parsed)
      && parsed.length === 2
      && typeof parsed[0] === 'string'
      && typeof parsed[1] === 'string'
      && parsed[0].length <= 40
      && parsed[1].length <= 160
      ? [parsed[0], parsed[1]]
      : null;
  } catch {
    return null;
  }
}

async function events(database: SqlDatabase, url: URL): Promise<Response> {
  const limit = Math.min(100, Math.max(10, Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
  const clauses: string[] = [];
  const parameters: SqlParameter[] = [];
  const bind = (value: SqlParameter): string => {
    parameters.push(value);
    return `?${parameters.length}`;
  };
  const category = url.searchParams.get('category')?.trim() ?? '';
  if (['api', 'workflow', 'health'].includes(category)) {
    clauses.push(`category = ${bind(category)}`);
  }
  const outcome = url.searchParams.get('outcome')?.trim() ?? '';
  if (/^[a-z][a-z0-9_-]{0,39}$/u.test(outcome)) clauses.push(`outcome = ${bind(outcome)}`);
  for (const [parameter, column] of [
    ['projectId', 'project_id'],
    ['deviceId', 'device_id'],
    ['actor', 'actor_identifier'],
  ] as const) {
    const value = url.searchParams.get(parameter)?.trim() ?? '';
    if (/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(value)) clauses.push(`${column} = ${bind(value)}`);
  }
  const query = url.searchParams.get('q')?.trim() ?? '';
  if (query && query.length <= 80) {
    const escaped = query.replace(/[\\%_]/gu, '\\$&');
    const match = bind(`%${escaped}%`);
    clauses.push(`(
      actor_identifier LIKE ${match} ESCAPE '\\'
      OR action LIKE ${match} ESCAPE '\\'
      OR request_id LIKE ${match} ESCAPE '\\'
      OR client_operation_id LIKE ${match} ESCAPE '\\'
      OR resource_id LIKE ${match} ESCAPE '\\'
    )`);
  }
  const cursorValue = url.searchParams.get('cursor');
  if (cursorValue) {
    const cursor = decodeCursor(cursorValue);
    if (!cursor) return json(400, { error: 'Invalid event cursor' });
    const timeBinding = bind(cursor[0]);
    const idBinding = bind(cursor[1]);
    clauses.push(`(occurred_at < ${timeBinding} OR (occurred_at = ${timeBinding} AND id < ${idBinding}))`);
  }
  const limitBinding = bind(limit + 1);
  const rows = await database.all<OperationalEventRow>(
    `SELECT * FROM operational_events
     ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY occurred_at DESC, id DESC LIMIT ${limitBinding}`,
    parameters,
  );
  const page = rows.slice(0, limit).map((row) => ({
    ...row,
    details: safeJson<Record<string, unknown>>(row.details_json, {}),
    details_json: undefined,
  }));
  const nextRow = rows.length > limit ? rows[limit - 1] : undefined;
  return json(200, {
    generatedAt: new Date().toISOString(),
    events: page,
    nextCursor: nextRow
      ? encodeCursor(nextRow)
      : null,
  });
}

export async function handleSystemOperations(
  request: Request,
  env: Env,
  context: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  const assetRoute = url.pathname === '/system-operations'
    || url.pathname.startsWith('/system-operations/');
  const apiRoute = url.pathname === '/api/v1/system-operations'
    || url.pathname.startsWith('/api/v1/system-operations/');
  if (!assetRoute && !apiRoute) return null;

  const authorization = await authorizeSystemOperator(request, env, context, assetRoute);
  if (!authorization.ok) return authorization.response;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { error: 'Method not allowed' });
  }
  if (assetRoute) {
    if (url.pathname === '/system-operations') {
      return new Response(null, {
        status: 302,
        headers: { ...securityHeaders(), Location: '/system-operations/' },
      });
    }
    return env.ASSETS.fetch(request);
  }

  const database = createSqlDatabase(env);
  if (url.pathname === '/api/v1/system-operations/overview') {
    return overview(env, context, authorization.principal);
  }
  if (url.pathname === '/api/v1/system-operations/metrics') {
    const days = Math.min(90, Math.max(7, Number.parseInt(url.searchParams.get('days') ?? '30', 10) || 30));
    return metrics(database, days);
  }
  if (url.pathname === '/api/v1/system-operations/events') {
    return events(database, url);
  }
  return json(404, { error: 'Unknown system operations endpoint' });
}
