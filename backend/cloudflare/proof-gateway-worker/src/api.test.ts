import { describe, expect, it } from 'vitest';

import { handleApi } from './api.js';

function database(proofRow: Record<string, unknown> | null = null): D1Database {
  return {
    prepare(query: string) {
      const visibleProofRow = proofRow
        && (!query.includes("j.status = 'confirmed'") || proofRow.status === 'confirmed')
        && (!query.includes('j.attest_tx_id IS NOT NULL') || proofRow.attest_tx_id)
        && (!query.includes('j.attest_tx_hash IS NOT NULL') || proofRow.attest_tx_hash)
        && (!query.includes('j.block_height IS NOT NULL') || proofRow.block_height)
        ? proofRow
        : null;
      const statement = {
        bind() { return statement; },
        async first<T>() {
          return (query.includes('FROM daily_proof_jobs') ? visibleProofRow : null) as T | null;
        },
        async all<T>() {
          const results = query.includes('FROM daily_proof_jobs j') && visibleProofRow
            ? [visibleProofRow] as T[]
            : [] as T[];
          return { success: true, results, meta: { changes: 0 } } as D1Result<T>;
        },
        async run<T>() {
          return { success: true, results: [] as T[], meta: { changes: 0 } } as D1Result<T>;
        },
        async raw() { return [[]] as [string[]]; },
      } as unknown as D1PreparedStatement;
      return statement;
    },
    async batch<T>() { return [] as D1Result<T>[]; },
  } as unknown as D1Database;
}

function environment(db = database()): Env {
  return {
    DB: db,
    API_RATE_LIMITER: { limit: async () => ({ success: true }) },
    PUBLIC_MIDNIGHT_NETWORK: 'Midnight Preprod',
    PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS: 'ab'.repeat(32),
  } as unknown as Env;
}

async function response(request: Request, env = environment()): Promise<Response> {
  const result = await handleApi(request, env);
  if (!result) throw new Error('Expected an API response');
  return result;
}

describe('Wave 1 API router', () => {
  it('permanently retires the cloud raw-reading endpoint', async () => {
    const result = await response(new Request('https://worker.test/api/v1/readings', {
      method: 'POST',
      body: JSON.stringify({ value: 22.5 }),
    }));
    expect(result.status).toBe(410);
    expect(await result.json()).toMatchObject({ error: expect.stringContaining('retired') });
  });

  it('requires a Device Session for hourly aggregate ingestion', async () => {
    const result = await response(new Request('https://worker.test/api/v1/measurement-windows', {
      method: 'POST',
      body: '{}',
    }));
    expect(result.status).toBe(401);
  });

  it('requires a Device Session for Device-owned daily history', async () => {
    const result = await response(new Request('https://worker.test/api/v1/device/history'));
    expect(result.status).toBe(401);
  });

  it('requires a Device Session for the Device-scoped administrator dashboard', async () => {
    const result = await response(new Request('https://worker.test/api/v1/device/dashboard'));
    expect(result.status).toBe(401);
  });

  it('does not expose Sponsor usage without a Device Session', async () => {
    const result = await response(new Request('https://worker.test/api/v1/sponsor-quota'));
    expect(result.status).toBe(401);
  });

  it('does not expose administrator data from a deployed hostname', async () => {
    const result = await response(new Request(
      'https://worker.test/api/v1/projects/measurement-authenticity-01/dashboard',
      { headers: { 'X-VSP-Local-Admin': 'dashboard' } },
    ));
    expect(result.status).toBe(403);
  });

  it('returns redacted public Proof evidence', async () => {
    const proofRow = {
      id: 'proof-public-001', project_id: 'project-secret', device_id: 'device-secret',
      period_date: '2026-08-28', contract_address: 'cd'.repeat(32),
      measurement_group_id: '90'.repeat(32),
      attestation_commitment: '12'.repeat(32),
      device_commitment: '34'.repeat(32),
      sample_count: 24, threshold_policy_version: 'temperature-v1', status: 'confirmed',
      policy_key: '56'.repeat(32), assignment_id: 'edge-temp-001-temperature-v1-wave1',
      assignment_key: '78'.repeat(32), hour_presence: '101010101010101010101010',
      hour_results: '101010101010101010101010',
      observed_hour_count: 12, threshold_satisfied: 1, schema_version: 6, circuit_version: 4,
      attempt_count: 1, available_after: '2026-08-28T17:00:00.000Z', lease_expires_at: null,
      proof_artifact_key: null, attest_tx_id: 'attest-tx', attest_tx_hash: 'attest-hash',
      block_height: '123', mode: 'closed-range', minimum: 10, maximum: 35,
      value_scale: 100, sensor_type: 'temperature', unit: '°C',
      policy_version: 1, assignment_version: 1,
      valid_from: '2026-08-28T00:00:00.000Z', valid_until: null,
      last_error_code: null, created_at: '2026-08-28T17:00:00.000Z',
      updated_at: '2026-08-28T17:10:00.000Z',
    };
    const result = await response(
      new Request('https://worker.test/api/v1/public/proofs/proof-public-001'),
      environment(database(proofRow)),
    );
    const body = await result.json() as Record<string, unknown>;
    const serialized = JSON.stringify(body);
    expect(result.status).toBe(200);
    expect(serialized).not.toContain('device-secret');
    expect(serialized).not.toContain('project-secret');
    expect(serialized).not.toContain(proofRow.assignment_id);
    expect(serialized).toContain(proofRow.device_commitment);
    expect(body).not.toHaveProperty('minimum');
    expect(body).not.toHaveProperty('maximum');
    expect(serialized).not.toContain('hourlyExtremaValues');
    expect(serialized).not.toContain('nonceHex');
    expect(body).toMatchObject({
      proofJobId: 'proof-public-001',
      checks: { midnightConfirmed: true, attestationVerified: true },
      thresholdSatisfied: true,
      thresholdResult: 'within-threshold',
      resultVerified: true,
      contractAddress: 'cd'.repeat(32),
      observedHourCount: 12,
      stoppedHourCount: 12,
      schemaVersion: 6,
      circuitVersion: 4,
      deviceCommitment: '34'.repeat(32),
      hourResults: Array.from({ length: 24 }, (_value, index) => (
        index % 2 === 0 ? 'within-threshold' : 'no-data'
      )),
      policy: {
        mode: 'closed-range', minimum: 10, maximum: 35,
        valueScale: 100, sensorType: 'temperature', unit: '°C', version: 1,
      },
      transactions: { attest: { txId: 'attest-tx' } },
      privacy: { hourlyExtrema: 'private', thresholdPolicy: 'public-on-ledger' },
    });
  });

  it('lists public Proof Jobs newest-first without exposing Device identifiers', async () => {
    const proofRow = {
      id: 'proof-public-list-001', project_id: 'project-secret', device_id: 'device-secret',
      period_date: '2026-08-27', contract_address: 'cd'.repeat(32),
      measurement_group_id: '91'.repeat(32),
      attestation_commitment: '12'.repeat(32),
      device_commitment: '34'.repeat(32), sample_count: 1440,
      threshold_policy_version: 'temperature-v1', status: 'confirmed',
      policy_key: '56'.repeat(32), assignment_id: 'private-assignment-id',
      assignment_key: '78'.repeat(32), hour_presence: '1'.repeat(24),
      hour_results: `2${'1'.repeat(23)}`,
      observed_hour_count: 24, threshold_satisfied: 0, schema_version: 6, circuit_version: 4,
      attempt_count: 1, available_after: '2026-08-28T17:00:00.000Z', lease_expires_at: null,
      proof_artifact_key: null, attest_tx_id: 'attest-tx', attest_tx_hash: '81'.repeat(32),
      block_height: '123', mode: 'closed-range', minimum: 10, maximum: 35,
      value_scale: 100, sensor_type: 'temperature', unit: '°C',
      policy_version: 1, assignment_version: 1,
      valid_from: '2026-08-27T00:00:00.000Z', valid_until: null, last_error_code: null,
      created_at: '2026-08-28T17:00:00.000Z', updated_at: '2026-08-28T17:10:00.000Z',
    };
    const result = await response(
      new Request('https://worker.test/api/v1/public/proofs?limit=100'),
      environment(database(proofRow)),
    );
    const body = await result.json() as { proofs: Record<string, unknown>[] };
    const serialized = JSON.stringify(body);
    expect(result.status).toBe(200);
    expect(body.proofs).toHaveLength(1);
    expect(body.proofs[0]).toMatchObject({
      proofJobId: 'proof-public-list-001',
      periodDate: '2026-08-27',
      midnightConfirmed: true,
      thresholdSatisfied: false,
      thresholdResult: 'outside-threshold',
      hourResults: ['outside-threshold', ...Array(23).fill('within-threshold')],
      sampleCount: 1440,
    });
    expect(serialized).not.toContain('device-secret');
    expect(serialized).not.toContain('project-secret');
    expect(serialized).not.toContain('private-assignment-id');
  });

  it('finds a confirmed public proof by Midnight transaction hash', async () => {
    const transactionHash = '81'.repeat(32);
    const proofRow = {
      id: 'proof-public-list-001', status: 'confirmed',
      attest_tx_id: 'attest-tx', attest_tx_hash: transactionHash, block_height: '123',
    };
    const result = await response(
      new Request(`https://worker.test/api/v1/public/proofs/by-transaction/${transactionHash}`),
      environment(database(proofRow)),
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ proofJobId: 'proof-public-list-001' });
  });

  it('rejects an invalid Midnight transaction hash lookup', async () => {
    const result = await response(
      new Request('https://worker.test/api/v1/public/proofs/by-transaction/not-a-hash'),
    );
    expect(result.status).toBe(400);
  });

  it('excludes unconfirmed or incomplete transaction records from the public verifier', async () => {
    const baseRow = {
      id: 'proof-not-public-001', project_id: 'project-secret', device_id: 'device-secret',
      period_date: '2026-08-28', contract_address: 'cd'.repeat(32),
      measurement_group_id: '93'.repeat(32), attestation_commitment: '12'.repeat(32),
      device_commitment: '34'.repeat(32), sample_count: 1440,
      threshold_policy_version: 'temperature-v1', policy_key: '56'.repeat(32),
      assignment_id: 'private-assignment-id', assignment_key: '78'.repeat(32),
      hour_presence: '1'.repeat(24), hour_results: '1'.repeat(24),
      observed_hour_count: 24, threshold_satisfied: 1,
      schema_version: 6, circuit_version: 4, attempt_count: 1,
      available_after: '2026-08-28T17:00:00.000Z', lease_expires_at: null,
      proof_artifact_key: null, mode: 'closed-range', minimum: 10, maximum: 35,
      value_scale: 100, sensor_type: 'temperature', unit: '°C', policy_version: 1,
      assignment_version: 1, valid_from: '2026-08-28T00:00:00.000Z', valid_until: null,
      last_error_code: null,
      created_at: '2026-08-28T17:00:00.000Z', updated_at: '2026-08-28T17:10:00.000Z',
    };
    for (const proofRow of [
      {
        ...baseRow,
        status: 'reproof_required',
        attest_tx_id: 'unconfirmed-tx',
        attest_tx_hash: 'unconfirmed-hash',
        block_height: '123',
      },
      {
        ...baseRow,
        status: 'confirmed',
        attest_tx_id: 'incomplete-tx',
        attest_tx_hash: null,
        block_height: '123',
      },
    ]) {
      const list = await response(
        new Request('https://worker.test/api/v1/public/proofs?limit=100'),
        environment(database(proofRow)),
      );
      expect(list.status).toBe(200);
      expect(await list.json()).toEqual({ proofs: [] });

      const detail = await response(
        new Request(`https://worker.test/api/v1/public/proofs/${proofRow.id}`),
        environment(database(proofRow)),
      );
      expect(detail.status).toBe(404);
      expect(await detail.json()).toEqual({ error: 'Public Proof record not found' });
    }
  });

  it('publishes a confirmed outside-threshold result without private extrema', async () => {
    const proofRow = {
      id: 'proof-outside-001', project_id: 'project-secret', device_id: 'device-secret',
      period_date: '2026-08-27', contract_address: 'cd'.repeat(32),
      measurement_group_id: '92'.repeat(32),
      attestation_commitment: '12'.repeat(32),
      device_commitment: '34'.repeat(32), sample_count: 1440,
      threshold_policy_version: 'temperature-v1', status: 'confirmed',
      policy_key: '56'.repeat(32), assignment_id: 'private-assignment-id',
      assignment_key: '78'.repeat(32), hour_presence: '1'.repeat(24),
      hour_results: `${'1'.repeat(7)}2${'1'.repeat(16)}`,
      observed_hour_count: 24, threshold_satisfied: 0, schema_version: 6, circuit_version: 4,
      attempt_count: 1, available_after: '2026-08-28T17:00:00.000Z', lease_expires_at: null,
      proof_artifact_key: null, attest_tx_id: 'outside-attest-tx', attest_tx_hash: '82'.repeat(32),
      block_height: '124', mode: 'closed-range', minimum: 10, maximum: 35,
      value_scale: 100, sensor_type: 'temperature', unit: '°C',
      policy_version: 1, assignment_version: 1,
      valid_from: '2026-08-27T00:00:00.000Z', valid_until: null, last_error_code: null,
      created_at: '2026-08-28T17:00:00.000Z', updated_at: '2026-08-28T17:10:00.000Z',
    };
    const result = await response(
      new Request('https://worker.test/api/v1/public/proofs/proof-outside-001'),
      environment(database(proofRow)),
    );
    const body = await result.json() as Record<string, unknown>;
    const serialized = JSON.stringify(body);
    expect(result.status).toBe(200);
    expect(body).toMatchObject({
      thresholdSatisfied: false,
      thresholdResult: 'outside-threshold',
      resultVerified: true,
      checks: { attestationVerified: true, midnightConfirmed: true },
    });
    expect(body.claim).toContain('Each UTC hourly slot');
    expect(body.hourResults).toEqual([
      ...Array(7).fill('within-threshold'),
      'outside-threshold',
      ...Array(16).fill('within-threshold'),
    ]);
    expect(serialized).not.toContain('device-secret');
    expect(serialized).not.toContain('private-assignment-id');
    expect(serialized).not.toContain('hourlyExtremaValues');
  });
});
