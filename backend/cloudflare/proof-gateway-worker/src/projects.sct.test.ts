import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  browserPolicyCanonicalMessage,
  browserProjectCanonicalMessage,
} from '@midnight-demo/shared/browser-provisioning';
import {
  sampleSigningKey,
  signData,
  signatureVerifyingKey,
} from '@midnight-ntwrk/onchain-runtime-v3';

const containerMocks = vi.hoisted(() => ({ fetch: vi.fn() }));
const walletSigningKey = sampleSigningKey();
const walletVerifyingKey = signatureVerifyingKey(walletSigningKey);

vi.mock('@cloudflare/containers', () => ({
  getContainer: () => ({ fetch: containerMocks.fetch }),
}));

import { handleProvisioningApi } from './provisioning.js';

interface MemoryState {
  challenges: Map<string, {
    nonce_sha256: string;
    expires_at: number;
    consumed_at: number | null;
  }>;
  sessions: Map<string, { wallet_key_sha256: string; expires_at: number }>;
  projects: Map<string, {
    name: string;
    name_ja: string | null;
    timezone?: string;
    time_zone_offset_minutes?: number;
    local_day_start_hour?: number;
  }>;
  walletProjects: Array<{
    wallet_key_sha256: string;
    project_id: string;
    created_at: string;
  }>;
  policyChallenges: Map<string, {
    wallet_key_sha256: string;
    project_id: string;
    policy_id: string;
    nonce_sha256: string;
    expires_at: number;
    consumed_at: number | null;
  }>;
  policies: Array<{
    policy_id: string;
    name: string;
    project_id: string;
    policy_key: string;
    mode: string;
    minimum: number | null;
    maximum: number | null;
    policy_version: number;
    registered_tx_id: string;
  }>;
  projectPolicies: Array<{ project_id: string; policy_id: string }>;
  policyOperations: Map<string, Record<string, unknown>>;
  queued: unknown[];
}

function memoryDatabase(state: MemoryState): D1Database {
  return {
    prepare(query: string) {
      let parameters: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          parameters = values;
          return statement;
        },
        async first<T>() {
          if (query.includes('sponsor_wallet_operating_schedule')) {
            throw new Error('Admission must not read the Server Wallet operating schedule');
          }
          if (query.includes('AS policy_count')) {
            const projectId = String(parameters[0]);
            const registered = state.projectPolicies.filter((item) => item.project_id === projectId).length;
            const pending = [...state.policyOperations.values()].filter((operation) => (
              operation.project_id === projectId
              && ['queued', 'running', 'retrying'].includes(String(operation.status))
            )).length;
            return { policy_count: registered + pending } as T;
          }
          if (query.includes('FROM browser_policy_challenges')) {
            const challenge = state.policyChallenges.get(String(parameters[0]));
            return (challenge ? { id: parameters[0], ...challenge } : null) as T | null;
          }
          if (query.includes('FROM browser_policy_operations')) {
            const operation = state.policyOperations.get(String(parameters[0]));
            if (parameters.length > 1 && operation?.wallet_key_sha256 !== parameters[1]) return null as T;
            return (operation ?? null) as T | null;
          }
          if (query.includes('FROM browser_project_challenges')) {
            const challenge = state.challenges.get(String(parameters[0]));
            return (challenge ? { id: parameters[0], ...challenge } : null) as T | null;
          }
          if (query.includes('FROM browser_project_sessions')) {
            const session = state.sessions.get(String(parameters[0]));
            return (session && session.expires_at >= Number(parameters[1]) ? session : null) as T | null;
          }
          if (query.includes('FROM browser_wallet_projects')) {
            const row = state.walletProjects.find((item) => (
              item.wallet_key_sha256 === parameters[0]
              && item.project_id === parameters[1]
            ));
            return (row ? { project_id: row.project_id } : null) as T | null;
          }
          return null as T | null;
        },
        async all<T>() {
          if (query.includes('FROM threshold_policies')) {
            const visibleIds = new Set(state.projectPolicies
              .filter((item) => item.project_id === parameters[0])
              .map((item) => item.policy_id));
            const results = state.policies.filter((policy) => visibleIds.has(policy.policy_id)) as T[];
            return { success: true, results, meta: { changes: 0 } } as D1Result<T>;
          }
          if (query.includes('FROM browser_policy_operations')) {
            const results = [...state.policyOperations.values()].filter((operation) => (
              operation.project_id === parameters[0]
              && operation.wallet_key_sha256 === parameters[1]
            )) as T[];
            return { success: true, results, meta: { changes: 0 } } as D1Result<T>;
          }
          if (query.includes('FROM browser_wallet_projects')) {
            const results = state.walletProjects
              .filter((item) => item.wallet_key_sha256 === parameters[0])
              .map((item) => ({
                id: item.project_id,
                name: state.projects.get(item.project_id)?.name ?? item.project_id,
                name_ja: state.projects.get(item.project_id)?.name_ja ?? null,
                timezone: state.projects.get(item.project_id)?.timezone ?? 'UTC',
                time_zone_offset_minutes: state.projects.get(item.project_id)?.time_zone_offset_minutes ?? 0,
                local_day_start_hour: state.projects.get(item.project_id)?.local_day_start_hour ?? 0,
                created_at: item.created_at,
              })) as T[];
            return { success: true, results, meta: { changes: 0 } } as D1Result<T>;
          }
          return { success: true, results: [] as T[], meta: { changes: 0 } } as D1Result<T>;
        },
        async run<T>() {
          let changes = 1;
          if (query.includes('INSERT INTO browser_project_challenges')) {
            state.challenges.set(String(parameters[0]), {
              nonce_sha256: String(parameters[1]),
              expires_at: Number(parameters[3]),
              consumed_at: null,
            });
          } else if (query.includes('UPDATE browser_project_challenges')) {
            const challenge = state.challenges.get(String(parameters[1]));
            if (!challenge || challenge.consumed_at !== null) changes = 0;
            else challenge.consumed_at = Number(parameters[0]);
          } else if (query.includes('INSERT INTO browser_project_sessions')) {
            state.sessions.set(String(parameters[0]), {
              wallet_key_sha256: String(parameters[1]),
              expires_at: Number(parameters[3]),
            });
          } else if (query.includes('INSERT OR IGNORE INTO browser_wallet_projects')) {
            if (!state.walletProjects.some((item) => (
              item.wallet_key_sha256 === parameters[0] && item.project_id === parameters[1]
            ))) state.walletProjects.push({
              wallet_key_sha256: String(parameters[0]),
              project_id: String(parameters[1]),
              created_at: String(parameters[2]),
            });
          } else if (query.includes('INSERT INTO browser_wallet_projects')) {
            state.walletProjects.push({
              wallet_key_sha256: String(parameters[0]),
              project_id: String(parameters[1]),
              created_at: String(parameters[2]),
            });
          } else if (query.includes('INSERT INTO projects')) {
            state.projects.set(String(parameters[0]), {
              name: String(parameters[1]),
              name_ja: null,
              timezone: String(parameters[2]),
              time_zone_offset_minutes: Number(parameters[3]),
              local_day_start_hour: Number(parameters[4]),
            });
          } else if (query.includes('INSERT INTO browser_policy_challenges')) {
            state.policyChallenges.set(String(parameters[0]), {
              wallet_key_sha256: String(parameters[1]),
              project_id: String(parameters[2]),
              policy_id: String(parameters[3]),
              nonce_sha256: String(parameters[4]),
              expires_at: Number(parameters[6]),
              consumed_at: null,
            });
          } else if (query.includes('UPDATE browser_policy_challenges')) {
            const challenge = state.policyChallenges.get(String(parameters[1]));
            if (!challenge || challenge.consumed_at !== null) changes = 0;
            else challenge.consumed_at = Number(parameters[0]);
          } else if (query.includes('INSERT INTO browser_policy_operations')) {
            state.policyOperations.set(String(parameters[0]), {
              id: parameters[0],
              wallet_key_sha256: parameters[1],
              project_id: parameters[2],
              policy_id: parameters[3],
              name: parameters[4],
              mode: parameters[5],
              minimum_centi_celsius: parameters[6],
              maximum_centi_celsius: parameters[7],
              browser_authorization_json: parameters[8],
              status: 'queued',
              stage: 'queued',
              policy_key: null,
              policy_tx_id: null,
              error_message: null,
              created_at: parameters[9],
              updated_at: parameters[9],
            });
          }
          return { success: true, results: [] as T[], meta: { changes } } as D1Result<T>;
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

async function walletProjectSession(env: Env) {
  const challengeResponse = await handleProvisioningApi(new Request(
    'https://worker.test/api/v1/projects/challenge',
    { method: 'POST', headers: { 'CF-Connecting-IP': '192.0.2.10' } },
  ), env);
  expect(challengeResponse?.status).toBe(200);
  const challenge = await challengeResponse?.json() as {
    challengeId: string;
    nonce: string;
  };
  const timestamp = new Date().toISOString();
  const data = browserProjectCanonicalMessage({ ...challenge, timestamp });
  const sessionResponse = await handleProvisioningApi(new Request(
    'https://worker.test/api/v1/projects/session',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...challenge,
        timestamp,
        walletSignature: {
          data,
          signature: signData(walletSigningKey, new TextEncoder().encode(data)),
          verifyingKey: walletVerifyingKey,
        },
      }),
    },
  ), env);
  expect(sessionResponse?.status).toBe(200);
  return sessionResponse?.json() as Promise<{
    accessToken: string;
    projects: Array<{ projectId: string; name: string }>;
    maximumProjects: number;
  }>;
}

describe('SCT: Wallet-owned Browser Projects', () => {
  let state: MemoryState;
  let env: Env;

  beforeEach(() => {
    containerMocks.fetch.mockReset();
    state = {
      challenges: new Map(),
      sessions: new Map(),
      projects: new Map([
        ['measurement-authenticity-01', { name: 'Measurement Data Authenticity', name_ja: null }],
      ]),
      walletProjects: [],
      policyChallenges: new Map(),
      policies: [],
      projectPolicies: [],
      policyOperations: new Map(),
      queued: [],
    };
    env = {
      DB: memoryDatabase(state),
      AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
      SPONSOR_QUEUE: { send: async (message: unknown) => { state.queued.push(message); } },
    } as unknown as Env;
  });

  it('creates a 24-hour Wallet session without starting the scheduled Server Wallet', async () => {
    const session = await walletProjectSession(env);

    expect(session.maximumProjects).toBe(10);
    expect(session.projects).toEqual([expect.objectContaining({
      projectId: 'measurement-authenticity-01',
    })]);
    expect(session.accessToken).toMatch(/^[A-Za-z0-9_-]{32,}$/u);
    expect(containerMocks.fetch).not.toHaveBeenCalled();

    const listed = await handleProvisioningApi(new Request(
      'https://worker.test/api/v1/projects',
      { headers: { Authorization: `Bearer ${session.accessToken}` } },
    ), env);
    expect(listed?.status).toBe(200);
    expect(await listed?.json()).toMatchObject({ maximumProjects: 10 });
  });

  it('creates and returns a second Project owned by the same Wallet', async () => {
    const session = await walletProjectSession(env);
    const response = await handleProvisioningApi(new Request(
      'https://worker.test/api/v1/projects',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Second construction site',
          timeZoneOffsetMinutes: 540,
          localDayStartHour: 6,
        }),
      },
    ), env);

    expect(response?.status).toBe(201);
    expect(await response?.json()).toMatchObject({
      project: {
        projectId: expect.stringMatching(/^project-[0-9a-f-]+$/u),
        name: 'Second construction site',
        timeZone: 'UTC+09:00',
        timeZoneOffsetMinutes: 540,
        localDayStartHour: 6,
        utcDayStartMinute: 1260,
      },
      projectCount: 2,
      maximumProjects: 10,
    });
    expect(state.walletProjects).toHaveLength(2);
  });

  it('rejects an eleventh Project before any D1 write', async () => {
    const session = await walletProjectSession(env);
    const walletKeySha256 = state.walletProjects[0]!.wallet_key_sha256;
    for (let index = 2; index <= 10; index += 1) {
      const projectId = `project-existing-${index}`;
      state.projects.set(projectId, { name: `Existing ${index}`, name_ja: null });
      state.walletProjects.push({
        wallet_key_sha256: walletKeySha256,
        project_id: projectId,
        created_at: `2026-08-31T00:00:${String(index).padStart(2, '0')}.000Z`,
      });
    }
    const response = await handleProvisioningApi(new Request(
      'https://worker.test/api/v1/projects',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Eleventh Project' }),
      },
    ), env);

    expect(response?.status).toBe(409);
    expect(await response?.json()).toEqual({
      error: 'A Midnight Wallet can own up to 10 Projects',
    });
    expect(state.walletProjects).toHaveLength(10);
  });

  it('accepts a Project-scoped Policy outside Server Wallet hours as an asynchronous Job', async () => {
    const session = await walletProjectSession(env);
    const authorization = `Bearer ${session.accessToken}`;
    const challengeResponse = await handleProvisioningApi(new Request(
      'https://worker.test/api/v1/policies/challenge',
      {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'measurement-authenticity-01' }),
      },
    ), env);
    expect(challengeResponse?.status).toBe(200);
    const challenge = await challengeResponse?.json() as {
      projectId: string;
      policyId: string;
      challengeId: string;
      nonce: string;
    };
    const unsigned = {
      projectId: challenge.projectId,
      policyId: challenge.policyId,
      name: 'Concrete curing temperature',
      mode: 'closed-range' as const,
      minimumCentiCelsius: 1_000,
      maximumCentiCelsius: 3_500,
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      timestamp: new Date().toISOString(),
    };
    const response = await handleProvisioningApi(new Request(
      'https://worker.test/api/v1/policies',
      {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...unsigned,
          walletSignature: {
            data: browserPolicyCanonicalMessage(unsigned),
            signature: signData(
              walletSigningKey,
              new TextEncoder().encode(browserPolicyCanonicalMessage(unsigned)),
            ),
            verifyingKey: walletVerifyingKey,
          },
        }),
      },
    ), env);

    expect(response?.status).toBe(202);
    expect(await response?.json()).toMatchObject({
      projectId: 'measurement-authenticity-01',
      policyId: challenge.policyId,
      name: 'Concrete curing temperature',
      minimum: 10,
      maximum: 35,
      status: 'queued',
    });
    expect(state.queued).toEqual([{
      kind: 'browser-policy-provisioning',
      operationId: expect.stringMatching(/^pol_/u),
    }]);
    expect(state.policyChallenges.get(challenge.challengeId)?.consumed_at).not.toBeNull();
    expect(containerMocks.fetch).not.toHaveBeenCalled();
  });

  it('keeps an accepted Policy queued when the initial Queue publish is unavailable', async () => {
    const session = await walletProjectSession(env);
    const authorization = `Bearer ${session.accessToken}`;
    const challengeResponse = await handleProvisioningApi(new Request(
      'https://worker.test/api/v1/policies/challenge',
      {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'measurement-authenticity-01' }),
      },
    ), env);
    const challenge = await challengeResponse?.json() as {
      projectId: string;
      policyId: string;
      challengeId: string;
      nonce: string;
    };
    const unsigned = {
      projectId: challenge.projectId,
      policyId: challenge.policyId,
      name: 'Queued without initial delivery',
      mode: 'upper-bound' as const,
      minimumCentiCelsius: null,
      maximumCentiCelsius: 4_000,
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      timestamp: new Date().toISOString(),
    };
    const data = browserPolicyCanonicalMessage(unsigned);
    env = {
      ...env,
      SPONSOR_QUEUE: { send: async () => { throw new Error('Queue unavailable'); } },
    } as unknown as Env;

    const response = await handleProvisioningApi(new Request(
      'https://worker.test/api/v1/policies',
      {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...unsigned,
          walletSignature: {
            data,
            signature: signData(walletSigningKey, new TextEncoder().encode(data)),
            verifyingKey: walletVerifyingKey,
          },
        }),
      },
    ), env);

    expect(response?.status).toBe(202);
    expect(await response?.json()).toMatchObject({
      policyId: challenge.policyId,
      status: 'queued',
      stage: 'queued',
    });
    expect([...state.policyOperations.values()]).toContainEqual(expect.objectContaining({
      policy_id: challenge.policyId,
      status: 'queued',
      stage: 'queued',
    }));
  });

  it('keeps an explicitly associated legacy Policy visible without copying it into new Projects', async () => {
    const session = await walletProjectSession(env);
    const sharedPolicy = {
      policy_id: 'temperature-v1',
      name: 'Temperature v1',
      project_id: 'legacy-owner-project',
      policy_key: '11'.repeat(32),
      mode: 'closed-range',
      minimum: 10,
      maximum: 35,
      policy_version: 1,
      registered_tx_id: 'policy-tx-legacy',
    };
    state.policies.push(sharedPolicy);
    state.projectPolicies.push({
      project_id: 'measurement-authenticity-01',
      policy_id: sharedPolicy.policy_id,
    });
    const associated = await handleProvisioningApi(new Request(
      'https://worker.test/api/v1/policies?projectId=measurement-authenticity-01',
      { headers: { Authorization: `Bearer ${session.accessToken}` } },
    ), env);
    expect(associated?.status).toBe(200);
    expect(await associated?.json()).toMatchObject({
      policies: [expect.objectContaining({ policyId: 'temperature-v1' })],
    });

    const created = await handleProvisioningApi(new Request(
      'https://worker.test/api/v1/projects',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Empty Project' }),
      },
    ), env);
    const createdBody = await created?.json() as { project: { projectId: string } };
    const empty = await handleProvisioningApi(new Request(
      `https://worker.test/api/v1/policies?projectId=${createdBody.project.projectId}`,
      { headers: { Authorization: `Bearer ${session.accessToken}` } },
    ), env);
    expect(empty?.status).toBe(200);
    expect(await empty?.json()).toMatchObject({ policies: [] });
  });

  it('enforces ten Policies per Project before issuing another signing challenge', async () => {
    const session = await walletProjectSession(env);
    for (let index = 0; index < 10; index += 1) {
      state.policies.push({
        policy_id: `policy-${index}`,
        name: `Policy ${index}`,
        project_id: 'measurement-authenticity-01',
        policy_key: String(index).padStart(64, '0'),
        mode: 'closed-range',
        minimum: 10,
        maximum: 35,
        policy_version: 1,
        registered_tx_id: `policy-tx-${index}`,
      });
      state.projectPolicies.push({
        project_id: 'measurement-authenticity-01',
        policy_id: `policy-${index}`,
      });
    }
    const response = await handleProvisioningApi(new Request(
      'https://worker.test/api/v1/policies/challenge',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId: 'measurement-authenticity-01' }),
      },
    ), env);

    expect(response?.status).toBe(409);
    expect(await response?.json()).toEqual({
      error: 'A Project can contain up to 10 Policies',
    });
    expect(state.policyChallenges.size).toBe(0);
  });
});
