import { beforeEach, describe, expect, it, vi } from 'vitest';

const sponsorMocks = vi.hoisted(() => ({
  sponsorWalletHealth: vi.fn(),
}));
const containerMocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('./sponsor.js', () => ({
  sponsorWalletHealth: sponsorMocks.sponsorWalletHealth,
}));
vi.mock('@cloudflare/containers', () => ({
  getContainer: () => ({ fetch: containerMocks.fetch }),
}));

import { processBrowserPolicyQueueMessage } from './provisioning.js';

const operation = {
  id: 'pol_01990a00-0000-7000-8000-000000000101',
  wallet_key_sha256: '11'.repeat(32),
  project_id: 'project-001',
  policy_id: 'policy-001',
  name: 'Concrete curing temperature',
  mode: 'closed-range',
  minimum_centi_celsius: 1_000,
  maximum_centi_celsius: 3_500,
  browser_authorization_json: JSON.stringify({
    projectId: 'project-001',
    policyId: 'policy-001',
    name: 'Concrete curing temperature',
    mode: 'closed-range',
    minimumCentiCelsius: 1_000,
    maximumCentiCelsius: 3_500,
    challengeId: 'policy-challenge-001',
    nonce: 'policy-nonce-001',
    timestamp: '2026-08-31T00:00:00.000Z',
    walletSignature: {
      data: 'canonical-wallet-data',
      signature: 'wallet-signature',
      verifyingKey: 'wallet-verifying-key',
    },
  }),
  status: 'queued',
  stage: 'queued',
  policy_key: null as string | null,
  policy_tx_id: null as string | null,
  error_message: null as string | null,
  created_at: '2026-08-31T00:00:00.000Z',
  updated_at: '2026-08-31T00:00:00.000Z',
};

function database(registeredPolicies: Array<Record<string, unknown>>): D1Database {
  return {
    prepare(query: string) {
      let parameters: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          parameters = values;
          return statement;
        },
        async first<T>() {
          if (query.includes('FROM browser_policy_operations')) {
            return (parameters[0] === operation.id ? { ...operation } : null) as T | null;
          }
          return null as T | null;
        },
        async all<T>() {
          return { success: true, results: [] as T[], meta: { changes: 0 } } as D1Result<T>;
        },
        async run<T>() {
          if (query.includes("SET status = 'running'")) {
            operation.status = 'running';
            operation.stage = 'sponsor_wallet_syncing';
            operation.error_message = null;
          } else if (query.includes('SET stage = ?1')) {
            operation.stage = String(parameters[0]);
            if (parameters[1]) operation.policy_tx_id = String(parameters[1]);
          } else if (query.includes('INSERT INTO threshold_policies')) {
            registeredPolicies.push({
              policyId: parameters[0],
              policyKey: parameters[1],
              projectId: parameters[2],
              mode: parameters[3],
              minimum: parameters[4],
              maximum: parameters[5],
              contractAddress: parameters[6],
              transactionId: parameters[7],
              name: parameters[9],
            });
          } else if (query.includes("SET status = 'registered'")) {
            operation.status = 'registered';
            operation.stage = 'completed';
            operation.policy_key = String(parameters[0]);
            operation.policy_tx_id = String(parameters[1]);
          }
          return {
            success: true,
            results: [] as T[],
            meta: { changes: 1 },
          } as D1Result<T>;
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

describe('SCT: asynchronous Project Policy registration', () => {
  beforeEach(() => {
    operation.status = 'queued';
    operation.stage = 'queued';
    operation.policy_key = null;
    operation.policy_tx_id = null;
    operation.error_message = null;
    sponsorMocks.sponsorWalletHealth.mockReset();
    containerMocks.fetch.mockReset();
  });

  it('lets the Sponsor Wallet register the Policy and persists its Midnight evidence', async () => {
    sponsorMocks.sponsorWalletHealth.mockResolvedValue({
      phase: 'ready',
      spendableDustCoins: 1,
    });
    const policyKey = '22'.repeat(32);
    containerMocks.fetch.mockImplementation(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe('/operator/register-policy');
      expect(request.headers.get('X-Operator-Provisioning')).toBe('register-policy-v1');
      expect(request.headers.get('X-Operator-Progress')).toBe('ndjson-v1');
      expect(await request.json()).toMatchObject({
        projectId: 'project-001',
        policyId: 'policy-001',
        minimumCentiCelsius: 1_000,
        maximumCentiCelsius: 3_500,
        policyVersion: 1,
      });
      return new Response([
        JSON.stringify({ type: 'progress', stage: 'policy_zkp_generating' }),
        JSON.stringify({ type: 'progress', stage: 'policy_tx_submitted', transactionId: 'policy-tx-001' }),
        JSON.stringify({ type: 'progress', stage: 'policy_confirmed', transactionId: 'policy-tx-001' }),
        JSON.stringify({ type: 'result', result: { policyKey, policyTxId: 'policy-tx-001' } }),
        '',
      ].join('\n'), { status: 200 });
    });
    const registeredPolicies: Array<Record<string, unknown>> = [];
    const acknowledged = vi.fn();
    const retried = vi.fn();
    const message = {
      body: { kind: 'browser-policy-provisioning', operationId: operation.id },
      attempts: 1,
      ack: acknowledged,
      retry: retried,
    } as unknown as Message<unknown>;
    const env = {
      DB: database(registeredPolicies),
      PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS: 'contract-address-001',
    } as unknown as Env;

    expect(await processBrowserPolicyQueueMessage(message, env)).toBe(true);
    expect(acknowledged).toHaveBeenCalledOnce();
    expect(retried).not.toHaveBeenCalled();
    expect(operation).toMatchObject({
      status: 'registered',
      stage: 'completed',
      policy_key: policyKey,
      policy_tx_id: 'policy-tx-001',
    });
    expect(registeredPolicies).toEqual([expect.objectContaining({
      projectId: 'project-001',
      policyId: 'policy-001',
      minimum: 10,
      maximum: 35,
      transactionId: 'policy-tx-001',
    })]);
  });
});
