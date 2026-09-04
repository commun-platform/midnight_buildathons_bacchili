import { beforeEach, describe, expect, it } from 'vitest';

import {
  dispatchManagedSourceJobs,
  handleManagedSourcesApi,
  managedClaimWasApplied,
  sourceOperationalRow,
} from './managed-sources.js';

interface MemoryState {
  source: Record<string, unknown> | null;
  run: Record<string, unknown> | null;
  queued: unknown[];
  csrf: Map<string, { principal_identifier: string; expires_at: string }>;
  grants: Array<{ role: 'viewer' | 'operator'; scope_key: string; project_id: string | null }>;
}

function d1Result<T>(results: T[] = [], changes = 1): D1Result<T> {
  return {
    success: true,
    results,
    meta: { changes },
  } as D1Result<T>;
}

function database(state: MemoryState): D1Database {
  return {
    prepare(query: string) {
      let parameters: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { parameters = values; return statement; },
        async first<T>() {
          if (query.includes('sponsor_wallet_operating_schedule')) {
            return {
              mode: 'always-on', time_zone_offset_minutes: 540,
              opens_at_minute: 120, closes_at_minute: 360,
              updated_at: '2026-09-03T00:00:00.000Z',
            } as T;
          }
          if (query.includes('FROM system_operator_csrf_tokens')) {
            const row = state.csrf.get(String(parameters[0]));
            return (row && row.expires_at > String(parameters[1]) ? row : null) as T | null;
          }
          if (query.includes('FROM threshold_policies tp') && query.includes('JOIN project_policies')) {
            return {
              policy_id: 'temperature-v1', sensor_type: 'temperature', unit: '°C',
              minimum: 10, maximum: 35,
            } as T;
          }
          if (query.includes('FROM managed_sources s')) {
            if (!state.source || state.source.id !== parameters[0]) return null as T;
            return {
              ...state.source,
              time_zone_offset_minutes: 540,
              local_day_start_hour: 6,
              utc_day_start_minute: 1260,
              midnight_contract_address: 'aa'.repeat(32),
              midnight_device_commitment: 'bb'.repeat(32),
              assignment_key: 'cc'.repeat(32),
              policy_key: 'dd'.repeat(32),
              mode: 'closed-range', minimum: 10, maximum: 35,
              value_scale: 100, sensor_type_code: 1, unit_code: 1, policy_version: 1,
            } as T;
          }
          if (query.includes('FROM managed_sources WHERE id')) {
            return (state.source?.id === parameters[0] ? state.source : null) as T | null;
          }
          if (query.includes('FROM managed_source_runs WHERE source_id =')) {
            return (state.run?.source_id === parameters[0]
              && state.run?.period_date === parameters[1] ? state.run : null) as T | null;
          }
          if (query.includes('FROM managed_source_runs WHERE id')) {
            return (state.run?.id === parameters[0] ? state.run : null) as T | null;
          }
          return null as T | null;
        },
        async all<T>() {
          if (query.includes('FROM system_operator_grants')) {
            return d1Result(state.grants as T[], 0);
          }
          if (query.includes('FROM managed_sources ORDER BY')) {
            return d1Result((state.source ? [state.source] : []) as T[], 0);
          }
          if (query.includes('FROM managed_source_runs WHERE source_id')) {
            return d1Result((state.run ? [state.run] : []) as T[], 0);
          }
          if (
            query.includes('FROM managed_sources s')
            && query.includes("s.status = 'provisioning'")
          ) {
            return d1Result((state.source ? [{
              ...state.source,
              time_zone_offset_minutes: 540,
              local_day_start_hour: 6,
              policy_key: 'dd'.repeat(32),
              mode: 'closed-range',
              minimum: 10,
              maximum: 35,
              value_scale: 100,
              sensor_type_code: 1,
              unit_code: 1,
              policy_version: 1,
            }] : []) as T[], 0);
          }
          return d1Result<T>([], 0);
        },
        async run<T>() {
          let changes = 1;
          if (query.startsWith('DELETE FROM system_operator_csrf_tokens')) {
            for (const [key, value] of state.csrf) {
              if (value.expires_at <= String(parameters[0])) state.csrf.delete(key);
            }
          } else if (query.includes('INSERT INTO system_operator_csrf_tokens')) {
            state.csrf.set(String(parameters[0]), {
              principal_identifier: String(parameters[1]),
              expires_at: String(parameters[2]),
            });
          } else if (query.includes('INSERT INTO managed_sources')) {
            state.source = {
              id: parameters[0], project_id: parameters[1], device_id: parameters[2],
              name: parameters[3], adapter_type: 'fixed-window-json', adapter_version: 1,
              endpoint_url: parameters[4], source_sensor_id: parameters[5], auth_type: 'bearer',
              credential_envelope: parameters[6], credential_key_version: 1,
              sensor_type: 'temperature', unit: '°C', policy_id: parameters[7],
              assignment_id: parameters[8], first_period_date: parameters[9],
              fetch_delay_minutes: parameters[10], response_max_bytes: parameters[11],
              status: 'provisioning', stage: 'queued', attempt_count: 0,
              available_after: parameters[12], device_authority: null, device_tx_id: null,
              assignment_tx_id: null, last_error_code: null, last_error_summary: null,
              created_by: parameters[13], created_at: parameters[12], updated_at: parameters[12],
            };
          } else if (query.includes('INSERT OR IGNORE INTO managed_source_runs')) {
            if (state.run) changes = 0;
            else state.run = {
              id: parameters[0], source_id: parameters[1], project_id: parameters[2],
              device_id: parameters[3], period_date: parameters[4],
              period_start: parameters[5], period_end: parameters[6], status: 'pending_fetch',
              stage: 'queued', fetch_attempt_count: 0, proof_attempt_count: 0,
              available_after: parameters[7], lease_expires_at: null,
              source_http_status: null, source_response_bytes: null, sample_count: null,
              observed_hour_count: null, private_artifact_key: null, proof_job_id: null,
              last_error_code: null, last_error_summary: null, fetched_at: null,
              proof_started_at: null, confirmed_at: null,
              created_at: parameters[7], updated_at: parameters[7],
            };
          } else if (query.includes("UPDATE managed_sources SET stage = 'retry_waiting'")) {
            if (
              state.source?.status === 'provisioning'
              && state.source.stage === 'registering'
              && String(state.source.updated_at) < String(parameters[1])
            ) {
              Object.assign(state.source, {
                stage: 'retry_waiting',
                available_after: parameters[0],
                last_error_code: 'managed_registration_lease_expired',
                updated_at: parameters[0],
              });
            } else {
              changes = 0;
            }
          }
          return d1Result<T>([], changes);
        },
        async raw() { return [[]] as [string[]]; },
      } as unknown as D1PreparedStatement;
      return statement;
    },
    async batch<T>(statements: D1PreparedStatement[]) {
      const results: D1Result<T>[] = [];
      for (const statement of statements) results.push(await statement.run<T>());
      return results;
    },
  } as unknown as D1Database;
}

let currentCsrfToken = '';

function request(path: string, init: RequestInit = {}) {
  return new Request(`http://127.0.0.1${path}`, {
    ...init,
    headers: {
      Origin: 'http://127.0.0.1',
      'X-System-Operations-Local': 'dashboard',
      ...(currentCsrfToken ? { 'X-CSRF-Token': currentCsrfToken } : {}),
      ...(init.headers ?? {}),
    },
  });
}

function accessContext(): ExecutionContext {
  return {
    access: {
      getIdentity: async () => ({
        email: 'operator@example.com',
        name: 'Project Operator',
        user_uuid: 'access-project-operator',
      }),
    },
  } as unknown as ExecutionContext;
}

function accessRequest(path: string, csrfToken = '', init: RequestInit = {}): Request {
  return new Request(`https://gateway.example${path}`, {
    ...init,
    headers: {
      Origin: 'https://gateway.example',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(init.headers ?? {}),
    },
  });
}

describe('SCT: Managed API Attestation request lifecycle', () => {
  let state: MemoryState;
  let env: Env;

  beforeEach(async () => {
    currentCsrfToken = '';
    state = { source: null, run: null, queued: [], csrf: new Map(), grants: [] };
    env = {
      DB: database(state),
      MANAGED_CONNECTOR_CREDENTIAL_KEY: '11'.repeat(32),
      MANAGED_ATTESTOR_ROOT_SECRET: '22'.repeat(32),
      PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS: 'aa'.repeat(32),
      MANAGED_SOURCE_QUEUE: {
        send: async (message: unknown) => { state.queued.push(message); },
      },
    } as unknown as Env;
    const bootstrap = await handleManagedSourcesApi(
      request('/api/v1/managed-sources/bootstrap'),
      env,
      {} as ExecutionContext,
    );
    currentCsrfToken = String((await bootstrap?.json() as { csrfToken?: string }).csrfToken ?? '');
  });

  it('accepts a guarded D1 claim even when an audit trigger increments changes', () => {
    expect(managedClaimWasApplied(0)).toBe(false);
    expect(managedClaimWasApplied(1)).toBe(true);
    expect(managedClaimWasApplied(2)).toBe(true);
  });

  it('loads a provisioning Source against the active Policy before its Device has a contract', async () => {
    const contractAddress = 'aa'.repeat(32);
    let observedSql = '';
    let observedParameters: unknown[] = [];
    const sqlDatabase = {
      async first<T>(sql: string, parameters: unknown[]) {
        observedSql = sql;
        observedParameters = parameters;
        return { id: 'managed-api-demo', status: 'provisioning' } as T;
      },
    } as never;

    const source = await sourceOperationalRow(
      sqlDatabase,
      'managed-api-demo',
      contractAddress,
    );

    expect(source).toMatchObject({ id: 'managed-api-demo', status: 'provisioning' });
    expect(observedParameters).toEqual(['managed-api-demo', contractAddress]);
    expect(observedSql).toContain('tp.contract_address = ?2');
    expect(observedSql).toContain("s.status = 'provisioning'");
    expect(observedSql).not.toContain('tp.contract_address = d.midnight_contract_address');
  });

  it('registers an encrypted connector and returns only an asynchronous operation state', async () => {
    const response = await handleManagedSourcesApi(request('/api/v1/managed-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId: 'managed-api-demo',
        projectId: 'measurement-authenticity-01',
        policyId: 'temperature-v1',
        sourceSensorId: 'normal-1440',
        name: 'Customer cloud temperature',
        endpointUrl: 'https://source.example.com/v1/measurements',
        bearerToken: 'test-managed-source-token',
        firstPeriodDate: '2026-08-29',
      }),
    }), env, {} as ExecutionContext);

    expect(response?.status).toBe(202);
    const body = await response?.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      accepted: true,
      idempotent: false,
      source: { sourceId: 'managed-api-demo', status: 'provisioning', stage: 'queued' },
    });
    expect(JSON.stringify(body)).not.toContain('test-managed-source-token');
    expect(String(state.source?.credential_envelope)).not.toContain('test-managed-source-token');
    expect(state.queued).toEqual([{ kind: 'provision-source', sourceId: 'managed-api-demo' }]);
  });

  it('queues exactly one deterministic Run after registration and treats a replay idempotently', async () => {
    await handleManagedSourcesApi(request('/api/v1/managed-sources', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId: 'managed-api-demo', projectId: 'measurement-authenticity-01',
        policyId: 'temperature-v1', sourceSensorId: 'normal-1440',
        name: 'Customer cloud temperature',
        endpointUrl: 'https://source.example.com/v1/measurements',
        bearerToken: 'test-managed-source-token', firstPeriodDate: '2026-08-29',
      }),
    }), env, {} as ExecutionContext);
    Object.assign(state.source!, {
      status: 'active', stage: 'ready', device_tx_id: 'device-tx', assignment_tx_id: 'assignment-tx',
    });
    state.queued.length = 0;
    const runRequest = () => handleManagedSourcesApi(request(
      '/api/v1/managed-sources/managed-api-demo/runs',
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodDate: '2026-08-30' }),
      },
    ), env, {} as ExecutionContext);
    const first = await runRequest();
    const repeated = await runRequest();
    expect(first?.status).toBe(202);
    expect(repeated?.status).toBe(200);
    expect(await repeated?.json()).toMatchObject({ accepted: true, idempotent: true });
    expect(state.queued).toEqual([{ kind: 'fetch-window', runId: state.run?.id }]);
    expect(state.run).toMatchObject({
      period_start: '2026-08-29T21:00:00.000Z',
      period_end: '2026-08-30T21:00:00.000Z',
      status: 'pending_fetch',
    });
  });

  it('requires Cloudflare Access outside local development', async () => {
    const response = await handleManagedSourcesApi(
      new Request('https://worker.test/api/v1/managed-sources'),
      env,
      {} as ExecutionContext,
    );
    expect(response?.status).toBe(403);
  });

  it('hides another Project and denies mutation to a Project viewer', async () => {
    state.grants = [{ role: 'viewer', scope_key: 'project-a', project_id: 'project-a' }];
    state.source = {
      id: 'source-a', project_id: 'project-a', device_id: 'device-a', name: 'Source A',
      policy_id: 'temperature-v1', status: 'active', stage: 'ready',
      endpoint_url: 'https://source.example.com', source_sensor_id: 'sensor-a',
      first_period_date: '2026-08-29', fetch_delay_minutes: 15,
      response_max_bytes: 1_048_576, assignment_id: 'assignment-a',
      credential_envelope: '{}', credential_key_version: 1,
      created_at: '2026-09-03T00:00:00.000Z', updated_at: '2026-09-03T00:00:00.000Z',
    };
    const bootstrap = await handleManagedSourcesApi(
      accessRequest('/api/v1/managed-sources/bootstrap'),
      env,
      accessContext(),
    );
    expect(bootstrap?.status).toBe(200);
    const csrfToken = String((await bootstrap?.json() as { csrfToken: string }).csrfToken);

    const readable = await handleManagedSourcesApi(
      accessRequest('/api/v1/managed-sources/source-a'), env, accessContext(),
    );
    expect(readable?.status).toBe(200);

    const mutation = await handleManagedSourcesApi(accessRequest(
      '/api/v1/managed-sources/source-a',
      csrfToken,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    ), env, accessContext());
    expect(mutation?.status).toBe(403);

    Object.assign(state.source, { project_id: 'project-b' });
    const hidden = await handleManagedSourcesApi(
      accessRequest('/api/v1/managed-sources/source-a'), env, accessContext(),
    );
    expect(hidden?.status).toBe(404);
  });

  it('recovers a registration claim when its Container request disappears', async () => {
    const scheduledTime = Date.parse('2026-09-03T00:30:00.000Z');
    state.source = {
      id: 'managed-api-demo',
      project_id: 'measurement-authenticity-01',
      device_id: 'managed-device',
      policy_id: 'temperature-v1',
      status: 'provisioning',
      stage: 'registering',
      available_after: '2026-09-02T23:00:00.000Z',
      created_at: '2026-09-02T23:00:00.000Z',
      updated_at: '2026-09-03T00:23:59.000Z',
      first_period_date: '2026-08-29',
      fetch_delay_minutes: 15,
    };

    await dispatchManagedSourceJobs(env, scheduledTime);

    expect(state.source).toMatchObject({
      stage: 'retry_waiting',
      available_after: '2026-09-03T00:30:00.000Z',
      last_error_code: 'managed_registration_lease_expired',
    });
    expect(state.queued).toEqual([{ kind: 'provision-source', sourceId: 'managed-api-demo' }]);
  });

  it('does not reclaim an active registration before its six-minute recovery deadline', async () => {
    const scheduledTime = Date.parse('2026-09-03T00:30:00.000Z');
    state.source = {
      id: 'managed-api-demo',
      project_id: 'measurement-authenticity-01',
      device_id: 'managed-device',
      policy_id: 'temperature-v1',
      status: 'provisioning',
      stage: 'registering',
      available_after: '2026-09-02T23:00:00.000Z',
      updated_at: '2026-09-03T00:24:01.000Z',
      first_period_date: '2026-08-29',
      fetch_delay_minutes: 15,
    };

    await dispatchManagedSourceJobs(env, scheduledTime);

    expect(state.source).toMatchObject({
      stage: 'registering',
      updated_at: '2026-09-03T00:24:01.000Z',
    });
    expect(state.queued).toEqual([]);
  });
});
