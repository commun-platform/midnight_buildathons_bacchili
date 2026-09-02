import { describe, expect, it, vi } from 'vitest';

import type { ProofJobRow } from './jobs.js';

vi.mock('./device-auth.js', () => ({
  applyDeviceRateLimits: vi.fn(async () => true),
  authorizeDeviceRequest: vi.fn(async () => ({
    ok: true,
    principal: {
      deviceId: 'dvc-test',
      projectId: 'project-test',
      keyId: 'key-test',
      scopes: ['transaction:submit'],
      sessionId: 'session-test',
      issuedAt: 0,
      expiresAt: Number.MAX_SAFE_INTEGER,
    },
  })),
}));

import { handleWave1Api } from './wave1-api.js';

function proofJob(overrides: Partial<ProofJobRow> = {}): ProofJobRow {
  return {
    id: 'proof-test',
    project_id: 'project-test',
    device_id: 'dvc-test',
    period_date: '2026-08-29',
    contract_address: 'ab'.repeat(32),
    measurement_group_id: '01'.repeat(32),
    attestation_commitment: '02'.repeat(32),
    device_commitment: '03'.repeat(32),
    sample_count: 1440,
    threshold_policy_version: 'temperature-v1',
    policy_key: '04'.repeat(32),
    assignment_id: 'assignment-test',
    assignment_key: '05'.repeat(32),
    hour_presence: '1'.repeat(24),
    hour_results: '1'.repeat(24),
    observed_hour_count: 24,
    threshold_satisfied: 1,
    schema_version: 7,
    circuit_version: 5,
    proof_generated_at: null,
    status: 'proof_ready',
    attempt_count: 1,
    available_after: '2026-08-29T00:00:00.000Z',
    lease_expires_at: null,
    proof_artifact_key: null,
    device_transaction_object_key: null,
    device_transaction_hash: null,
    device_transaction_bytes: null,
    sponsor_transaction_object_key: null,
    sponsor_serialized_sha256: null,
    sponsor_transaction_id: null,
    sponsor_fee_specks: null,
    sponsor_transaction_bytes: null,
    sponsor_attempt_count: 0,
    sponsor_available_after: '2026-08-29T00:00:00.000Z',
    sponsor_lease_expires_at: null,
    sponsorship_started_at: null,
    sponsorship_completed_at: null,
    attest_tx_id: null,
    attest_tx_hash: null,
    block_height: null,
    last_error_code: null,
    created_at: '2026-08-29T00:00:00.000Z',
    updated_at: '2026-08-29T00:00:00.000Z',
    ...overrides,
  };
}

function environment(initial: ProofJobRow): { env: Env; current: () => ProofJobRow } {
  let row = { ...initial };
  const db = {
    prepare(query: string) {
      let parameters: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          parameters = values;
          return statement;
        },
        async first<T>() {
          if (query.includes('FROM daily_proof_jobs')) return { ...row } as T;
          return null;
        },
        async all<T>() {
          return { success: true, results: [] as T[], meta: { changes: 0 } } as D1Result<T>;
        },
        async run<T>() {
          let changes = 0;
          if (
            query.includes("SET status = 'dead_lettered'")
            && ['ready_for_input', 'proving', 'proof_ready'].includes(row.status)
            && parameters[2] === row.id
          ) {
            row = {
              ...row,
              status: 'dead_lettered',
              lease_expires_at: null,
              last_error_code: String(parameters[0]),
              updated_at: String(parameters[1]),
            };
            changes = 1;
          }
          return { success: true, results: [] as T[], meta: { changes } } as D1Result<T>;
        },
        async raw() { return [[]] as [string[]]; },
      } as unknown as D1PreparedStatement;
      return statement;
    },
    async batch<T>() { return [] as D1Result<T>[]; },
  } as unknown as D1Database;
  return {
    env: {
      DB: db,
      API_RATE_LIMITER: { limit: async () => ({ success: true }) },
    } as unknown as Env,
    current: () => row,
  };
}

async function reportAlreadyAttested(env: Env): Promise<Response> {
  const response = await handleWave1Api(new Request(
    'https://worker.test/api/v1/proof-jobs/proof-test/result',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phase: 'failed',
        errorCode: 'measurement_group_already_attested',
      }),
    },
  ), env);
  if (!response) throw new Error('Proof result route did not respond');
  return response;
}

describe('already-attested Proof Job result', () => {
  it('closes a proof-ready job so the GUI cannot submit it again', async () => {
    const store = environment(proofJob());
    const response = await reportAlreadyAttested(store.env);

    expect(response.status).toBe(200);
    expect(store.current()).toMatchObject({
      status: 'dead_lettered',
      last_error_code: 'measurement_group_already_attested',
    });
    expect(await response.json()).toMatchObject({
      accepted: true,
      idempotent: false,
      job: {
        status: 'dead_lettered',
        errorCode: 'measurement_group_already_attested',
      },
    });
  });

  it('accepts the same terminal result idempotently', async () => {
    const store = environment(proofJob({
      status: 'dead_lettered',
      last_error_code: 'measurement_group_already_attested',
    }));
    const response = await reportAlreadyAttested(store.env);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accepted: true, idempotent: true });
  });

  it('does not rewrite a job that has already reached submission', async () => {
    const store = environment(proofJob({ status: 'submitted', attest_tx_id: 'tx-test' }));
    const response = await reportAlreadyAttested(store.env);

    expect(response.status).toBe(409);
    expect(store.current().status).toBe('submitted');
  });
});
