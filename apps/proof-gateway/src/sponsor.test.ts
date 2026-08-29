import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProofJobRow } from './jobs.js';
import {
  canRecoverStaleSponsoringRequest,
  deviceTransactionAcceptance,
  shouldReplaySponsorDustState,
  sponsorWalletCanSubmit,
} from './sponsor-policy.js';

vi.mock('@cloudflare/containers', () => ({ getContainer: vi.fn() }));

import { sponsorProofTransaction } from './sponsor.js';

const runtimeCrypto = crypto;

describe('Sponsor Wallet DUST replay guard', () => {
  const inconsistentState = {
    phase: 'syncing',
    totalDustCoins: 0,
    pendingDustCoins: 0,
    nightCoins: { total: 1, registered: 1, unregistered: 0 },
    progressDetails: {
      dust: { connected: true, complete: true },
    },
    initialization: { status: 'succeeded' },
    shuttingDown: false,
  };

  it('replays a fully synchronized DUST state that lost every registered coin', () => {
    expect(shouldReplaySponsorDustState(inconsistentState, 0)).toBe(true);
  });

  it.each([
    ['active reservation', inconsistentState, 1],
    ['DUST still synchronizing', {
      ...inconsistentState,
      progressDetails: { dust: { connected: true, complete: false } },
    }, 0],
    ['unregistered NIGHT', {
      ...inconsistentState,
      nightCoins: { total: 1, registered: 0, unregistered: 1 },
    }, 0],
    ['existing DUST coin', { ...inconsistentState, totalDustCoins: 1 }, 0],
    ['shutdown in progress', { ...inconsistentState, shuttingDown: true }, 0],
  ])('does not replay for %s', (_name, state, reservations) => {
    expect(shouldReplaySponsorDustState(state, reservations)).toBe(false);
  });
});

function base64Url(value: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function d1Result(changes: number): D1Result {
  return {
    success: true,
    results: [],
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: changes,
      last_row_id: 0,
      changed_db: changes > 0,
      changes,
    },
  };
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = await runtimeCrypto.subtle.digest('SHA-256', value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sponsorJob(status: string, deviceTransactionHash: string | null): ProofJobRow {
  const now = new Date().toISOString();
  return {
    id: 'proof-idempotency-001',
    project_id: 'measurement-authenticity-01',
    device_id: 'edge-temp-001',
    period_date: '2026-08-28',
    contract_address: 'ab'.repeat(32),
    measurement_group_id: '12'.repeat(32),
    attestation_commitment: '34'.repeat(32),
    device_commitment: '56'.repeat(32),
    sample_count: 1440,
    threshold_policy_version: 'temperature-v1',
    policy_key: '78'.repeat(32),
    assignment_id: 'assignment-001',
    assignment_key: '9a'.repeat(32),
    hour_presence: '1'.repeat(24),
    observed_hour_count: 24,
    threshold_satisfied: 1,
    schema_version: 5,
    circuit_version: 3,
    status,
    attempt_count: 1,
    available_after: now,
    lease_expires_at: null,
    proof_artifact_key: null,
    device_transaction_object_key: deviceTransactionHash
      ? `device-transactions/proof-idempotency-001/${deviceTransactionHash}.tx`
      : null,
    device_transaction_hash: deviceTransactionHash,
    device_transaction_bytes: deviceTransactionHash ? 4 : null,
    sponsor_transaction_object_key: null,
    sponsor_serialized_sha256: null,
    sponsor_transaction_id: null,
    sponsor_fee_specks: null,
    sponsor_transaction_bytes: null,
    sponsor_attempt_count: 0,
    sponsor_available_after: now,
    sponsor_lease_expires_at: null,
    sponsorship_started_at: null,
    sponsorship_completed_at: null,
    attest_tx_id: null,
    attest_tx_hash: null,
    block_height: null,
    last_error_code: null,
    created_at: now,
    updated_at: now,
  };
}

async function sponsorApiFixture(job: ProofJobRow) {
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const token = `${sessionId}.${'A'.repeat(43)}`;
  const tokenHash = base64Url(await runtimeCrypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  ));
  const effects = {
    quotaReads: 0,
    databaseWrites: 0,
    r2Writes: 0,
    queueSends: 0,
  };
  const database = {
    prepare(query: string) {
      let bindings: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bindings = values;
          return statement;
        },
        async first<T>() {
          if (query.includes('FROM device_auth_sessions')) {
            return {
              id: sessionId,
              device_id: job.device_id,
              project_id: job.project_id,
              key_id: 'key-001',
              token_sha256: tokenHash,
              scopes_json: JSON.stringify(['transaction:submit']),
              issued_at: Math.floor(Date.now() / 1_000) - 60,
              expires_at: Math.floor(Date.now() / 1_000) + 3_600,
              revoked_at: null,
              key_status: 'active',
            } as T;
          }
          if (query.includes('FROM daily_proof_jobs')) return job as T;
          if (query.includes('INSERT INTO sponsor_quota_reservations')) {
            effects.quotaReads += 1;
            return { proof_job_id: job.id } as T;
          }
          if (query.includes('SELECT sponsor_daily_limit')) {
            effects.quotaReads += 1;
            return { daily_limit: 5 } as T;
          }
          throw new Error(`Unexpected D1 first query: ${query} (${String(bindings[0])})`);
        },
        async all<T>() {
          if (query.includes('FROM sponsor_quota_reservations')) {
            effects.quotaReads += 1;
            return {
              success: true,
              results: [{ proof_job_id: job.id }] as T[],
              meta: {
                duration: 0,
                size_after: 0,
                rows_read: 1,
                rows_written: 0,
                last_row_id: 0,
                changed_db: false,
                changes: 0,
              },
            } as D1Result<T>;
          }
          throw new Error(`Unexpected D1 all query: ${query}`);
        },
        async run<T>() {
          effects.databaseWrites += 1;
          if (query.includes("SET status = 'awaiting_sponsor'")) {
            job.status = 'awaiting_sponsor';
            job.device_transaction_object_key = String(bindings[0]);
            job.device_transaction_hash = String(bindings[1]);
            job.device_transaction_bytes = Number(bindings[2]);
            return d1Result(1) as D1Result<T>;
          }
          return d1Result(0) as D1Result<T>;
        },
      } as unknown as D1PreparedStatement;
      return statement;
    },
    async batch<T>() { return [] as D1Result<T>[]; },
  } as unknown as D1Database;
  const env = {
    DB: database,
    API_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SPONSOR_WALLET_SEED: '11'.repeat(32),
    PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS: 'ab'.repeat(32),
    SPONSOR_STATE: {
      async put() { effects.r2Writes += 1; },
      async delete() {},
    },
    SPONSOR_QUEUE: {
      async send() { effects.queueSends += 1; },
    },
  } as unknown as Env;
  return { token, env, effects };
}

beforeEach(() => {
  vi.stubGlobal('crypto', {
    randomUUID: runtimeCrypto.randomUUID.bind(runtimeCrypto),
    getRandomValues: runtimeCrypto.getRandomValues.bind(runtimeCrypto),
    subtle: {
      digest: runtimeCrypto.subtle.digest.bind(runtimeCrypto.subtle),
      timingSafeEqual(left: ArrayBuffer, right: ArrayBufferView) {
        const leftBytes = new Uint8Array(left);
        const rightBytes = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
        if (leftBytes.length !== rightBytes.length) return false;
        let difference = 0;
        for (let index = 0; index < leftBytes.length; index += 1) {
          difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
        }
        return difference === 0;
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Sponsor Wallet readiness', () => {
  it('accepts a ready legacy Wallet and a healthy supervised Wallet', () => {
    expect(sponsorWalletCanSubmit({ phase: 'ready' })).toBe(true);
    expect(sponsorWalletCanSubmit({
      phase: 'ready',
      spendableDustCoins: 1,
      supervisor: {
        status: 'healthy',
        walletProcessAlive: true,
        walletStatusFresh: true,
      },
    })).toBe(true);
  });

  it('fails closed for stale, degraded, unavailable, or non-ready state', () => {
    expect(sponsorWalletCanSubmit({ phase: 'syncing' })).toBe(false);
    expect(sponsorWalletCanSubmit({ phase: 'ready', spendableDustCoins: 0 })).toBe(false);
    expect(sponsorWalletCanSubmit({
      phase: 'ready',
      supervisor: {
        status: 'degraded',
        walletProcessAlive: true,
        walletStatusFresh: false,
      },
    })).toBe(false);
    expect(sponsorWalletCanSubmit({
      phase: 'ready',
      supervisor: {
        status: 'unavailable',
        walletProcessAlive: false,
        walletStatusFresh: false,
      },
    })).toBe(false);
  });
});

describe('Device transaction idempotency', () => {
  const firstHash = 'ab'.repeat(32);
  const otherHash = 'cd'.repeat(32);

  it('accepts one transaction and returns existing pending or completed state for exact retries', () => {
    expect(deviceTransactionAcceptance('proof_ready', null, firstHash)).toBe('accept-new');
    expect(deviceTransactionAcceptance('awaiting_sponsor', firstHash, firstHash))
      .toBe('idempotent-pending');
    expect(deviceTransactionAcceptance('sponsor_retryable', firstHash, firstHash))
      .toBe('idempotent-pending');
    expect(deviceTransactionAcceptance('submitted', firstHash, firstHash))
      .toBe('idempotent-complete');
  });

  it('rejects different bytes for the same measurement group and ineligible states', () => {
    expect(deviceTransactionAcceptance('awaiting_sponsor', firstHash, otherHash)).toBe('conflict');
    expect(deviceTransactionAcceptance('confirmed', firstHash, otherHash)).toBe('conflict');
    expect(deviceTransactionAcceptance('pending', null, firstHash)).toBe('ineligible');
    expect(deviceTransactionAcceptance('reproof_required', firstHash, firstHash)).toBe('ineligible');
  });

  it('stops an identical authenticated retry before quota, R2, Queue, or Wallet work', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const job = sponsorJob('awaiting_sponsor', await sha256Hex(bytes));
    const { token, env, effects } = await sponsorApiFixture(job);
    const result = await sponsorProofTransaction(new Request(
      `https://worker.test/api/v1/proof-jobs/${job.id}/sponsor`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: bytes,
      },
    ), env, job.id, {} as ExecutionContext);

    expect(result.status).toBe(202);
    expect(await result.json()).toMatchObject({
      accepted: true,
      idempotent: true,
      proofJobId: job.id,
      status: 'awaiting_sponsor',
    });
    expect(effects).toEqual({
      quotaReads: 0,
      databaseWrites: 0,
      r2Writes: 0,
      queueSends: 0,
    });
  });

  it('rejects conflicting bytes before quota, R2, Queue, or Wallet work', async () => {
    const job = sponsorJob('awaiting_sponsor', await sha256Hex(new Uint8Array([1, 2, 3, 4])));
    const { token, env, effects } = await sponsorApiFixture(job);
    const result = await sponsorProofTransaction(new Request(
      `https://worker.test/api/v1/proof-jobs/${job.id}/sponsor`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array([4, 3, 2, 1]),
      },
    ), env, job.id, {} as ExecutionContext);

    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({
      error: 'Measurement group is already bound to another Device transaction',
    });
    expect(effects).toEqual({
      quotaReads: 0,
      databaseWrites: 0,
      r2Writes: 0,
      queueSends: 0,
    });
  });

  it('stores and queues only the first authenticated transaction for a Proof Job', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const job = sponsorJob('proof_ready', null);
    const { token, env, effects } = await sponsorApiFixture(job);
    const result = await sponsorProofTransaction(new Request(
      `https://worker.test/api/v1/proof-jobs/${job.id}/sponsor`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: bytes,
      },
    ), env, job.id, {} as ExecutionContext);

    expect(result.status).toBe(202);
    expect(await result.json()).toMatchObject({
      accepted: true,
      idempotent: false,
      proofJobId: job.id,
      status: 'awaiting_sponsor',
    });
    expect(effects).toEqual({
      quotaReads: 3,
      databaseWrites: 1,
      r2Writes: 1,
      queueSends: 1,
    });
  });
});

function failedJob(overrides: Partial<ProofJobRow> = {}): ProofJobRow {
  return {
    device_transaction_hash: 'ab'.repeat(32),
    device_transaction_bytes: 1024,
    status: 'device_bound',
    last_error_code: 'sponsor_prepare_failed',
    sponsor_transaction_object_key: null,
    sponsor_serialized_sha256: null,
    sponsor_transaction_id: null,
    sponsor_fee_specks: null,
    sponsor_transaction_bytes: null,
    sponsorship_completed_at: null,
    attest_tx_id: null,
    attest_tx_hash: null,
    block_height: null,
    updated_at: '2026-08-29T04:00:00.000Z',
    ...overrides,
  } as ProofJobRow;
}

describe('stale Sponsor request recovery', () => {
  it('keeps a failed Device-bound transaction resumable without another Proof', () => {
    expect(canRecoverStaleSponsoringRequest(failedJob())).toBe(false);
  });

  it('recovers a canceled in-progress request only after thirty-five minutes', () => {
    const now = Date.parse('2026-08-29T04:35:00.000Z');
    expect(canRecoverStaleSponsoringRequest(failedJob({
      status: 'sponsoring',
      last_error_code: null,
    }), now)).toBe(true);
    expect(canRecoverStaleSponsoringRequest(failedJob({
      status: 'sponsoring',
      last_error_code: null,
      updated_at: '2026-08-29T04:00:00.001Z',
    }), now)).toBe(false);
    expect(canRecoverStaleSponsoringRequest(failedJob({
      status: 'sponsoring',
      last_error_code: null,
      sponsor_transaction_object_key: 'sponsor-transactions/job/tx',
    }), now)).toBe(false);
  });
});
