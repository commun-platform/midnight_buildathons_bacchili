import type { SponsorWalletHealth } from './sponsor.js';
import { createSqlDatabase } from './storage/index.js';
import type { SqlDatabase } from './storage/sql.js';
import { verifiedSystemOperatorPrincipal } from './system-operations-auth.js';

const eventRetentionMs = 90 * 24 * 60 * 60 * 1000;
const healthHeartbeatMs = 60 * 60 * 1000;
const safeIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;

interface AuditActor {
  type: 'wallet' | 'device' | 'anonymous' | 'operator';
  identifier: string | null;
  projectId: string | null;
  deviceId: string | null;
}

export interface PreparedRequestAudit {
  requestId: string;
  clientOperationId: string | null;
  action: string;
  route: string;
  resourceType: string | null;
  resourceId: string | null;
  startedAt: number;
}

export interface SponsorWalletOperationsView {
  healthClass: 'healthy' | 'degraded' | 'unavailable';
  phase: SponsorWalletHealth['phase'];
  bootId: string | null;
  initializedAt: string | null;
  lastStateAt: string | null;
  progress: SponsorWalletHealth['progress'];
  synchronization: Array<{
    channel: 'shielded' | 'unshielded' | 'dust';
    applied: string;
    highest: string;
    lag: string;
    connected: boolean;
    complete: boolean;
  }>;
  balances: {
    night: string | null;
    dust: string | null;
    spendableDustCoins: number | null;
    pendingDustCoins: number | null;
    totalDustCoins: number | null;
    nightCoins: SponsorWalletHealth['nightCoins'] | null;
  };
  initialization: SponsorWalletHealth['initialization'] | null;
  synchronizationCheckpoint: SponsorWalletHealth['synchronizationCheckpoint'] | null;
  supervisor: SponsorWalletHealth['supervisor'] | null;
  shuttingDown: boolean;
  errorCode: string | null;
}

interface ComponentStateRow {
  health_class: 'healthy' | 'degraded' | 'unavailable';
  state_signature: string;
  last_changed_at: string;
  last_snapshot_at: string;
}

interface SessionActorRow {
  wallet_key_sha256?: string;
  device_id?: string;
  project_id?: string;
}

function errorCodeForStatus(status: number): string | null {
  if (status < 400) return null;
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  return status >= 500 ? 'server_error' : `http_${status}`;
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function hex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function bearerToken(request: Request): string | null {
  const match = request.headers.get('Authorization')?.match(/^Bearer\s+([^\s]+)$/u);
  return match?.[1] && match[1].length <= 512 ? match[1] : null;
}

async function requestActor(database: SqlDatabase, request: Request, env: Env): Promise<AuditActor> {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith('/api/v1/managed-sources')) {
    const principal = await verifiedSystemOperatorPrincipal(request, env);
    if (principal) {
      const sourceId = pathname.match(/^\/api\/v1\/managed-sources\/([^/]+)/u)?.[1];
      let projectId: string | null = null;
      if (sourceId && sourceId !== 'bootstrap') {
        const source = await database.first<{ project_id: string }>(
          'SELECT project_id FROM managed_sources WHERE id = ?1',
          [decodeURIComponent(sourceId)],
        );
        projectId = source?.project_id ?? null;
      }
      return {
        type: 'operator',
        identifier: principal.email ?? principal.identifier,
        projectId,
        deviceId: null,
      };
    }
  }
  const token = bearerToken(request);
  if (!token) return { type: 'anonymous', identifier: null, projectId: null, deviceId: null };
  const digest = await sha256(token);
  const wallet = await database.first<SessionActorRow>(
    `SELECT wallet_key_sha256 FROM browser_project_sessions
     WHERE token_sha256 = ?1 LIMIT 1`,
    [hex(digest)],
  );
  if (wallet?.wallet_key_sha256) {
    return {
      type: 'wallet',
      identifier: wallet.wallet_key_sha256,
      projectId: null,
      deviceId: null,
    };
  }
  const sessionId = token.split('.', 1)[0] ?? '';
  if (!/^[0-9a-f-]{36}$/iu.test(sessionId)) {
    return { type: 'anonymous', identifier: null, projectId: null, deviceId: null };
  }
  const device = await database.first<SessionActorRow>(
    `SELECT device_id, project_id FROM device_auth_sessions
     WHERE id = ?1 AND token_sha256 = ?2 LIMIT 1`,
    [sessionId, base64Url(digest)],
  );
  return device?.device_id
    ? {
        type: 'device',
        identifier: device.device_id,
        projectId: device.project_id ?? null,
        deviceId: device.device_id,
      }
    : { type: 'anonymous', identifier: null, projectId: null, deviceId: null };
}

function classifiedRoute(pathname: string, method: string): Pick<
  PreparedRequestAudit,
  'action' | 'route' | 'resourceType' | 'resourceId'
> {
  const decodedResourceId = (value: string): string => {
    try {
      return decodeURIComponent(value).slice(0, 240);
    } catch {
      return value.slice(0, 240);
    }
  };
  const managedRun = pathname.match(
    /^\/api\/v1\/managed-sources\/([^/]+)\/runs\/([^/]+)(?:\/(retry))?$/u,
  );
  if (managedRun?.[1] && managedRun[2]) {
    return {
      action: managedRun[3] ? 'managed.attestation.retry' : 'managed.attestation.read',
      route: `/api/v1/managed-sources/:sourceId/runs/:runId${managedRun[3] ? '/retry' : ''}`,
      resourceType: 'managed-source-run',
      resourceId: decodedResourceId(managedRun[2]),
    };
  }
  const managedRuns = pathname.match(/^\/api\/v1\/managed-sources\/([^/]+)\/runs$/u);
  if (managedRuns?.[1]) {
    return {
      action: method === 'POST' ? 'managed.attestation.request' : 'managed.attestation.list',
      route: '/api/v1/managed-sources/:sourceId/runs',
      resourceType: 'managed-source',
      resourceId: decodedResourceId(managedRuns[1]),
    };
  }
  const managedSource = pathname.match(/^\/api\/v1\/managed-sources\/([^/]+)$/u);
  if (managedSource?.[1]) {
    return {
      action: managedSource[1] === 'bootstrap'
        ? 'managed.bootstrap.read'
        : method === 'PATCH' ? 'managed.source.update' : 'managed.source.read',
      route: managedSource[1] === 'bootstrap'
        ? '/api/v1/managed-sources/bootstrap'
        : '/api/v1/managed-sources/:sourceId',
      resourceType: managedSource[1] === 'bootstrap' ? null : 'managed-source',
      resourceId: managedSource[1] === 'bootstrap' ? null : decodedResourceId(managedSource[1]),
    };
  }
  if (pathname === '/api/v1/managed-sources') {
    return {
      action: method === 'POST' ? 'managed.source.create' : 'managed.source.list',
      route: '/api/v1/managed-sources',
      resourceType: null,
      resourceId: null,
    };
  }
  const proofJob = pathname.match(/^\/api\/v1\/proof-jobs\/([^/]+)(?:\/(admit|result|sponsor))?$/u);
  if (proofJob?.[1]) {
    const suffix = proofJob[2] ?? 'read';
    return {
      action: suffix === 'admit' ? 'proof.admit'
        : suffix === 'result' ? 'proof.result.report'
          : suffix === 'sponsor' ? 'proof.sponsor.request'
            : 'proof.read',
      route: `/api/v1/proof-jobs/:proofJobId${suffix === 'read' ? '' : `/${suffix}`}`,
      resourceType: 'proof-job',
      resourceId: decodedResourceId(proofJob[1]),
    };
  }
  const operation = pathname.match(/^\/api\/v1\/(policy-operations|provisioning\/operations)\/([^/]+)$/u);
  if (operation?.[1] && operation[2]) {
    return {
      action: operation[1] === 'policy-operations'
        ? 'policy.registration.read'
        : 'device.registration.read',
      route: operation[1] === 'policy-operations'
        ? '/api/v1/policy-operations/:operationId'
        : '/api/v1/provisioning/operations/:operationId',
      resourceType: operation[1] === 'policy-operations'
        ? 'policy-registration'
        : 'device-registration',
      resourceId: decodedResourceId(operation[2]),
    };
  }
  const exact = new Map<string, [string, string]>([
    ['/auth/challenge', ['device.session.challenge', '/auth/challenge']],
    ['/auth/session', ['device.session.issue', '/auth/session']],
    ['/api/v1/projects/challenge', ['wallet.session.challenge', '/api/v1/projects/challenge']],
    ['/api/v1/projects/session', ['wallet.session.issue', '/api/v1/projects/session']],
    ['/api/v1/projects', ['project.create', '/api/v1/projects']],
    ['/api/v1/policies/challenge', ['policy.registration.challenge', '/api/v1/policies/challenge']],
    ['/api/v1/policies', ['policy.registration.request', '/api/v1/policies']],
    ['/api/v1/provisioning/challenge', ['device.registration.challenge', '/api/v1/provisioning/challenge']],
    ['/api/v1/provisioning/devices', ['device.registration.request', '/api/v1/provisioning/devices']],
    ['/api/v1/measurement-windows', ['measurement.window.write', '/api/v1/measurement-windows']],
    ['/api/v1/anomaly-events', ['anomaly.transition.write', '/api/v1/anomaly-events']],
    ['/api/v1/proof-jobs', ['proof.request', '/api/v1/proof-jobs']],
    ['/check', ['proof.input.check', '/check']],
    ['/prove', ['proof.generate', '/prove']],
    ['/proof/check', ['proof.input.check', '/proof/check']],
    ['/proof/prove', ['proof.generate', '/proof/prove']],
  ]);
  const matched = exact.get(pathname);
  return matched
    ? { action: matched[0], route: matched[1], resourceType: null, resourceId: null }
    : { action: 'api.write', route: pathname.slice(0, 240), resourceType: null, resourceId: null };
}

export function prepareRequestAudit(request: Request, requestId: string): PreparedRequestAudit | null {
  const url = new URL(request.url);
  const managedRead = request.method === 'GET'
    && url.pathname.startsWith('/api/v1/managed-sources');
  if (
    (request.method === 'GET' && !managedRead)
    || request.method === 'HEAD'
    || request.method === 'OPTIONS'
  ) return null;
  if (
    !url.pathname.startsWith('/api/v1/')
    && !url.pathname.startsWith('/auth/')
    && !['/check', '/prove', '/proof/check', '/proof/prove'].includes(url.pathname)
  ) return null;
  const suppliedOperationId = request.headers.get('X-Client-Operation-Id')?.trim() ?? '';
  const classified = classifiedRoute(url.pathname, request.method);
  return {
    requestId,
    clientOperationId: safeIdentifierPattern.test(suppliedOperationId) ? suppliedOperationId : null,
    ...classified,
    startedAt: performance.now(),
  };
}

export async function recordRequestAudit(
  env: Env,
  request: Request,
  response: Response,
  prepared: PreparedRequestAudit,
): Promise<void> {
  try {
    const database = createSqlDatabase(env);
    const actor = await requestActor(database, request, env);
    const status = response.status;
    const occurredAt = new Date().toISOString();
    await database.execute(
      `INSERT INTO operational_events (
         id, occurred_at, category, severity, actor_type, actor_identifier,
         action, method, route, response_status, outcome, request_id,
         client_operation_id, project_id, device_id, resource_type, resource_id,
         correlation_id, error_code, duration_ms
       ) VALUES (
         ?1, ?2, 'api', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
         ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19
       )`,
      [
        crypto.randomUUID(),
        occurredAt,
        status >= 500 ? 'error' : status >= 400 ? 'warning' : 'info',
        actor.type,
        actor.identifier,
        prepared.action,
        request.method,
        prepared.route,
        status,
        status < 400 ? 'accepted' : 'rejected',
        prepared.requestId,
        prepared.clientOperationId,
        actor.projectId,
        actor.deviceId,
        prepared.resourceType,
        prepared.resourceId,
        prepared.clientOperationId ?? prepared.requestId,
        errorCodeForStatus(status),
        Math.max(0, Math.round(performance.now() - prepared.startedAt)),
      ],
    );
  } catch (error) {
    console.error(JSON.stringify({
      message: 'operational_request_audit_failed',
      requestId: prepared.requestId,
      action: prepared.action,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }));
  }
}

function blockLag(applied: string, highest: string): string {
  try {
    const difference = BigInt(highest) - BigInt(applied);
    return (difference > 0n ? difference : 0n).toString();
  } catch {
    return '0';
  }
}

export function sponsorWalletOperationsView(health: SponsorWalletHealth): SponsorWalletOperationsView {
  const supervisor = health.supervisor ?? null;
  const healthClass = health.phase === 'ready' && (!supervisor || supervisor.status === 'healthy')
    ? 'healthy'
    : health.phase === 'error' || supervisor?.status === 'unavailable'
      ? 'unavailable'
      : 'degraded';
  const channels = ['shielded', 'unshielded', 'dust'] as const;
  return {
    healthClass,
    phase: health.phase,
    bootId: health.bootId ?? null,
    initializedAt: health.initializedAt ?? null,
    lastStateAt: health.lastStateAt ?? null,
    progress: health.progress,
    synchronization: channels.map((channel) => {
      const detail = health.progressDetails?.[channel];
      const applied = detail?.applied ?? health.progress?.[channel] ?? '0';
      const highest = detail?.highest ?? applied;
      return {
        channel,
        applied,
        highest,
        lag: blockLag(applied, highest),
        connected: detail?.connected ?? false,
        complete: detail?.complete ?? false,
      };
    }),
    balances: {
      night: health.night ?? null,
      dust: health.dust ?? null,
      spendableDustCoins: health.spendableDustCoins ?? null,
      pendingDustCoins: health.pendingDustCoins ?? null,
      totalDustCoins: health.totalDustCoins ?? null,
      nightCoins: health.nightCoins ?? null,
    },
    initialization: health.initialization ?? null,
    synchronizationCheckpoint: health.synchronizationCheckpoint
      ? { ...health.synchronizationCheckpoint, error: health.synchronizationCheckpoint.error ? 'checkpoint_failed' : null }
      : null,
    supervisor: supervisor
      ? { ...supervisor, lastProbeError: supervisor.lastProbeError ? 'probe_failed' : null }
      : null,
    shuttingDown: health.shuttingDown ?? false,
    errorCode: health.error ? 'sponsor_wallet_error' : null,
  };
}

function stateSignature(view: SponsorWalletOperationsView): string {
  return JSON.stringify({
    healthClass: view.healthClass,
    phase: view.phase,
    bootId: view.bootId,
    supervisor: view.supervisor?.status ?? null,
    connected: view.synchronization.map(({ channel, connected }) => [channel, connected]),
    complete: view.synchronization.map(({ channel, complete }) => [channel, complete]),
    applied: view.synchronization.map(({ channel, applied }) => [channel, applied]),
    initialization: view.initialization?.status ?? null,
    checkpoint: view.synchronizationCheckpoint?.status ?? null,
    errorCode: view.errorCode,
  });
}

async function storeHealthView(
  env: Env,
  view: SponsorWalletOperationsView,
  observedAt: string,
): Promise<void> {
  const database = createSqlDatabase(env);
  const current = await database.first<ComponentStateRow>(
    `SELECT health_class, state_signature, last_changed_at, last_snapshot_at
     FROM system_component_state WHERE component = 'sponsor-wallet'`,
  );
  const signature = stateSignature(view);
  const changed = current?.state_signature !== signature;
  const heartbeatDue = !current
    || Date.parse(observedAt) - Date.parse(current.last_snapshot_at) >= healthHeartbeatMs;
  if (!changed && !heartbeatDue) return;
  const summary = JSON.stringify(view);
  const lastChangedAt = changed ? observedAt : current?.last_changed_at ?? observedAt;
  await database.batch([
    {
      sql: `INSERT INTO system_component_state (
              component, health_class, state_signature, last_observed_at,
              last_changed_at, last_snapshot_at, summary_json
            ) VALUES ('sponsor-wallet', ?1, ?2, ?3, ?4, ?3, ?5)
            ON CONFLICT(component) DO UPDATE SET
              health_class = excluded.health_class,
              state_signature = excluded.state_signature,
              last_observed_at = excluded.last_observed_at,
              last_changed_at = excluded.last_changed_at,
              last_snapshot_at = excluded.last_snapshot_at,
              summary_json = excluded.summary_json`,
      parameters: [view.healthClass, signature, observedAt, lastChangedAt, summary],
    },
    {
      sql: `INSERT INTO system_health_snapshots (
              id, component, observed_at, health_class, phase, changed, summary_json
            ) VALUES (?1, 'sponsor-wallet', ?2, ?3, ?4, ?5, ?6)`,
      parameters: [
        crypto.randomUUID(), observedAt, view.healthClass, view.phase, changed ? 1 : 0, summary,
      ],
    },
    {
      sql: `INSERT INTO operational_events (
              id, occurred_at, category, severity, actor_type, action, outcome,
              resource_type, resource_id, state_from, state_to, error_code
            ) VALUES (?1, ?2, 'health', ?3, 'system', 'sponsor.wallet.health', ?4,
              'component', 'sponsor-wallet', ?5, ?6, ?7)`,
      parameters: [
        crypto.randomUUID(), observedAt,
        view.healthClass === 'unavailable' ? 'error' : view.healthClass === 'degraded' ? 'warning' : 'info',
        view.healthClass,
        current?.health_class ?? null,
        view.healthClass,
        view.errorCode,
      ],
    },
  ]);
  const cutoff = new Date(Date.parse(observedAt) - eventRetentionMs).toISOString();
  await database.batch([
    { sql: 'DELETE FROM operational_events WHERE occurred_at < ?1', parameters: [cutoff] },
    { sql: 'DELETE FROM system_health_snapshots WHERE observed_at < ?1', parameters: [cutoff] },
  ]);
}

export async function recordSponsorWalletHealth(
  env: Env,
  health: SponsorWalletHealth,
): Promise<void> {
  try {
    await storeHealthView(env, sponsorWalletOperationsView(health), new Date().toISOString());
  } catch (error) {
    console.error(JSON.stringify({
      message: 'sponsor_wallet_health_history_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }));
  }
}

export async function recordSponsorWalletUnavailable(env: Env, errorCode: string): Promise<void> {
  const unavailable: SponsorWalletOperationsView = {
    healthClass: 'unavailable',
    phase: 'error',
    bootId: null,
    initializedAt: null,
    lastStateAt: null,
    progress: null,
    synchronization: ['shielded', 'unshielded', 'dust'].map((channel) => ({
      channel: channel as 'shielded' | 'unshielded' | 'dust',
      applied: '0', highest: '0', lag: '0', connected: false, complete: false,
    })),
    balances: {
      night: null, dust: null, spendableDustCoins: null,
      pendingDustCoins: null, totalDustCoins: null, nightCoins: null,
    },
    initialization: null,
    synchronizationCheckpoint: null,
    supervisor: null,
    shuttingDown: false,
    errorCode: errorCode.slice(0, 160),
  };
  try {
    await storeHealthView(env, unavailable, new Date().toISOString());
  } catch (error) {
    console.error(JSON.stringify({
      message: 'sponsor_wallet_unavailable_history_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }));
  }
}
