import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getContainer } from '@cloudflare/containers';

import type { ProofJobRow } from './jobs.js';
import {
  canRecoverStaleSponsoringRequest,
  deviceTransactionAcceptance,
  shouldReplaySponsorDustState,
  sponsorJobCanProceed,
  sponsorSubmissionIsReplayProtectionViolation,
  sponsorSubmissionRequiresDustRefresh,
  sponsorSubmissionRequiresReproof,
  sponsorTransactionNeedsRefresh,
  sponsorWalletCanSubmit,
} from './sponsor-policy.js';

vi.mock('@cloudflare/containers', () => ({ getContainer: vi.fn() }));

import {
  dispatchSponsorJobs,
  handleSponsorQueue,
  persistSponsorDustReplayCheckpoint,
  releaseAlreadyAttestedSponsorReservation,
  releaseExpiredSponsorReservation,
  releaseStaleSponsorReservationForReproof,
  sponsorClaimWasApplied,
  sponsorProofTransaction,
  stopSponsorWalletAfterDrain,
  submitSponsoredTransaction,
  warmSponsorWallet,
  withSponsorCheckpointTimeout,
  withSponsorOperationTimeout,
} from './sponsor.js';

const runtimeCrypto = crypto;

describe('DUST replay checkpoint mode', () => {
  it.each([null, 'full'])('rejects a full or unlabelled cached checkpoint (%s)', async (mode) => {
    const put = vi.fn();
    vi.mocked(getContainer).mockReturnValue({
      async fetch() {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'Content-Length': '3', ...(mode ? { 'X-Sponsor-Checkpoint-Mode': mode } : {}) },
        });
      },
    } as never);
    const env = { SPONSOR_WALLET: {}, SPONSOR_STATE: { put } } as unknown as Env;
    await expect(persistSponsorDustReplayCheckpoint(env)).rejects.toThrow('without DUST state');
    expect(put).not.toHaveBeenCalled();
  });
});

function alwaysOnSchedule<T>(): T {
  return {
    mode: 'always-on',
    time_zone_offset_minutes: 540,
    opens_at_minute: 120,
    closes_at_minute: 360,
    updated_at: '2026-09-03T00:00:00.000Z',
  } as T;
}

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

describe('prepared Sponsor transaction readiness', () => {
  const syncingWallet = {
    phase: 'syncing' as const,
    spendableDustCoins: 0,
  };
  const synchronizedWalletWithReservedDust = {
    phase: 'ready' as const,
    spendableDustCoins: 0,
  };

  it('waits for Wallet synchronization even when a DUST reservation already exists', () => {
    expect(sponsorJobCanProceed('sponsored', syncingWallet)).toBe(false);
  });

  it('submits or releases an existing reservation after synchronization', () => {
    expect(sponsorJobCanProceed('sponsored', synchronizedWalletWithReservedDust)).toBe(true);
  });

  it('requires spendable DUST before preparing a new reservation', () => {
    expect(sponsorJobCanProceed(
      'awaiting_sponsor',
      synchronizedWalletWithReservedDust,
    )).toBe(false);
  });

  it('fails closed when the synchronized Wallet supervisor is unhealthy', () => {
    expect(sponsorJobCanProceed('sponsored', {
      ...synchronizedWalletWithReservedDust,
      supervisor: {
        status: 'degraded',
        walletProcessAlive: true,
        walletStatusFresh: false,
      },
    })).toBe(false);
  });
});

describe('scheduled Server Wallet drain', () => {
  it('uses the internal singleton RPC to checkpoint and stop the runtime', async () => {
    const stopAfterScheduledDrain = vi.fn().mockResolvedValue({
      stopped: true,
      state: 'stopped',
    });
    vi.mocked(getContainer).mockReturnValue({ stopAfterScheduledDrain } as never);

    await expect(stopSponsorWalletAfterDrain({
      SPONSOR_WALLET: {} as DurableObjectNamespace,
    } as Env)).resolves.toEqual({
      stopped: true,
      state: 'stopped',
    });
    expect(stopAfterScheduledDrain).toHaveBeenCalledOnce();
  });
});

describe('Sponsor Wallet deadlock regression', () => {
  it('accepts a guarded D1 claim when audit triggers increase meta.changes', () => {
    expect(sponsorClaimWasApplied(0)).toBe(false);
    expect(sponsorClaimWasApplied(1)).toBe(true);
    expect(sponsorClaimWasApplied(2)).toBe(true);
  });

  it('acknowledges post-cutoff work without waking the Container before the next daily run', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T00:00:00.000Z')); // 09:00 JST
    vi.mocked(getContainer).mockClear();
    try {
      const database = {
        prepare(query: string) {
          const statement = {
            bind() { return statement; },
            async first<T>() {
              if (query.includes('sponsor_wallet_operating_schedule')) {
                return {
                  mode: 'scheduled',
                  time_zone_offset_minutes: 540,
                  opens_at_minute: 120,
                  closes_at_minute: 360,
                  updated_at: '2026-09-02T00:00:00.000Z',
                } as T;
              }
              if (query.includes('SELECT created_at FROM')) {
                return { created_at: '2026-09-03T00:00:00.000Z' } as T;
              }
              throw new Error(`Unexpected D1 query: ${query}`);
            },
          } as unknown as D1PreparedStatement;
          return statement;
        },
      } as unknown as D1Database;
      const acknowledgements = [vi.fn(), vi.fn(), vi.fn()];
      const retries = [vi.fn(), vi.fn(), vi.fn()];
      const batch = {
        queue: 'midnight-sponsor-jobs',
        messages: [
          {
            body: { kind: 'sponsor-transaction', proofJobId: 'proof-scheduled-001' },
            attempts: 1,
            ack: acknowledgements[0],
            retry: retries[0],
          },
          {
            body: { kind: 'browser-policy-provisioning', operationId: 'pol-scheduled-001' },
            attempts: 1,
            ack: acknowledgements[1],
            retry: retries[1],
          },
          {
            body: { kind: 'browser-device-provisioning', operationId: 'prv-scheduled-001' },
            attempts: 1,
            ack: acknowledgements[2],
            retry: retries[2],
          },
        ],
      } as unknown as MessageBatch<unknown>;

      await handleSponsorQueue(batch, {
        DB: database,
        SPONSOR_WALLET: {},
      } as unknown as Env);

      for (const acknowledgement of acknowledgements) expect(acknowledgement).toHaveBeenCalledOnce();
      for (const retry of retries) expect(retry).not.toHaveBeenCalled();
      expect(getContainer).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns control after 60 seconds even when Container RPC ignores abort', async () => {
    vi.useFakeTimers();
    try {
      const operation = withSponsorCheckpointTimeout(() => new Promise<never>(() => {}));
      const rejection = expect(operation).rejects.toThrow('sponsor_checkpoint_timeout');

      await vi.advanceTimersByTimeAsync(60_000);

      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses an operation-specific deadline instead of the Queue wall-time limit', async () => {
    vi.useFakeTimers();
    try {
      const operation = withSponsorOperationTimeout(
        30_000,
        'sponsor_wallet_health_timeout',
        () => new Promise<never>(() => {}),
      );
      const rejection = expect(operation).rejects.toThrow('sponsor_wallet_health_timeout');

      await vi.advanceTimersByTimeAsync(30_000);

      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['no reservation', 0, ['/health', '/checkpoint'], false],
    ['an active reservation', 1, ['/health'], false],
    ['a requested replay while not ready', 0, ['/health', '/maintenance/replay-dust'], true],
    ['a requested replay blocked by a reservation', 1, ['/health'], true],
  ])('checkpoints synchronization progress safely with %s', async (
    _name,
    activeReservations,
    expectedRequests,
    requestedReplay,
  ) => {
    const containerRequests: string[] = [];
    let replayMarked = false;
    vi.stubGlobal('FixedLengthStream', class {
      readonly readable: ReadableStream<Uint8Array>;
      readonly writable: WritableStream<Uint8Array>;

      constructor() {
        const stream = new TransformStream<Uint8Array, Uint8Array>();
        this.readable = stream.readable;
        this.writable = stream.writable;
      }
    });
    vi.mocked(getContainer).mockReturnValue({
      async fetch(request: Request) {
        const pathname = new URL(request.url).pathname;
        containerRequests.push(pathname);
        if (pathname === '/maintenance/replay-dust') return new Response(null, { status: 204 });
        if (pathname === '/checkpoint') {
          return new Response(new Uint8Array([1, 2, 3]), {
            headers: { 'Content-Length': '3' },
          });
        }
        if (pathname !== '/health') throw new Error(`Unexpected Sponsor request: ${pathname}`);
        return Response.json({
          phase: 'syncing',
          night: '1000000000',
          dust: '0',
          spendableDustCoins: 0,
          totalDustCoins: 1,
          pendingDustCoins: 0,
          nightCoins: { total: 1, registered: 1, unregistered: 0 },
          progress: {
            shielded: 'connected, complete (1466444/0)',
            unshielded: 'connected, complete (577250/577250)',
            dust: 'connected, syncing (190325/0)',
          },
          progressDetails: {
            shielded: { applied: '1466444', highest: '0', connected: true, complete: true },
            unshielded: { applied: '577250', highest: '577250', connected: true, complete: true },
            dust: { applied: '190325', highest: '0', connected: true, complete: false },
          },
          initialization: {
            status: 'succeeded',
            startedAt: '2026-08-30T11:32:18.334Z',
            completedAt: '2026-08-30T11:32:19.321Z',
            error: null,
          },
          synchronizationCheckpoint: {
            status: 'succeeded',
            attemptedAt: '2026-08-30T11:33:18.334Z',
            completedAt: '2026-08-30T11:33:18.934Z',
            durationMs: 600,
            bytes: 1_427_006,
            dustApplied: '190325',
            error: null,
            delivery: 'local-cache',
          },
          shuttingDown: false,
          error: null,
        });
      },
    } as never);
    const database = {
      prepare(query: string) {
        const statement = {
          bind() { return statement; },
          async first<T>() {
            if (query.includes('sponsor_wallet_operating_schedule')) {
              return alwaysOnSchedule<T>();
            }
            if (query.includes('COUNT(*) AS active_count')) {
              return { active_count: activeReservations } as T;
            }
            if (query.includes('sponsor_dust_state_replay_required')) {
              return requestedReplay ? { id: 'retained-replay' } as T : null;
            }
            throw new Error(`Unexpected D1 first query: ${query}`);
          },
          async run() {
            if (!query.includes("last_error_code = 'sponsor_dust_state_replay_started'")) {
              throw new Error('Unexpected recovery update');
            }
            replayMarked = true;
            return d1Result(1);
          },
        } as unknown as D1PreparedStatement;
        return statement;
      },
    } as unknown as D1Database;
    const env = {
      DB: database,
      SPONSOR_WALLET: {},
      SPONSOR_WALLET_SEED: '11'.repeat(32),
      SPONSOR_STATE: {
        async head() { return requestedReplay ? { size: 3 } : null; },
        async put(_key: string, body: ReadableStream<Uint8Array>) {
          await new Response(body).arrayBuffer();
        },
      },
    } as unknown as Env;

    const result = await warmSponsorWallet(env);

    expect(containerRequests).toEqual(expectedRequests);
    expect(replayMarked).toBe(requestedReplay && activeReservations === 0);
    if (replayMarked) expect(result.health?.phase).toBe('starting');
  });

  it('clears an expired zero-spendable-DUST reservation without blocking the queue', async () => {
    const bytes = new Uint8Array([5, 4, 3, 2]);
    const serializedHash = await sha256Hex(bytes);
    const artifactKey = `sponsor-transactions/proof-idempotency-001/${serializedHash}.tx`;
    const job = sponsorJob('sponsored', 'ab'.repeat(32));
    Object.assign(job, {
      sponsor_transaction_object_key: artifactKey,
      sponsor_serialized_sha256: serializedHash,
      sponsor_fee_specks: '1000',
      sponsor_transaction_bytes: bytes.byteLength,
      sponsor_available_after: '2026-08-30T02:17:06.159Z',
      sponsorship_started_at: '2026-08-30T02:17:06.159Z',
      attest_tx_id: 'expired-contract-transaction-id',
      attest_tx_hash: 'expired-contract-transaction-hash',
      last_error_code: 'sponsor_submit_failed',
    });
    const deleted: string[] = [];
    const requeued: unknown[] = [];
    const messageEffects = { acknowledgements: 0, retries: 0 };
    vi.mocked(getContainer).mockReturnValue({
      async fetch(request: Request) {
        const pathname = new URL(request.url).pathname;
        if (pathname === '/health') {
          return Response.json({
            phase: 'syncing',
            spendableDustCoins: 0,
            totalDustCoins: 1,
            pendingDustCoins: 0,
            nightCoins: { total: 1, registered: 1, unregistered: 0 },
            progress: { dust: 'connected, syncing (190325/0)' },
            progressDetails: {
              dust: { applied: '190325', highest: '0', connected: true, complete: false },
            },
            initialization: {
              status: 'succeeded',
              startedAt: '2026-08-30T11:32:18.334Z',
              completedAt: '2026-08-30T11:32:19.321Z',
              error: null,
            },
            shuttingDown: false,
            error: null,
          });
        }
        if (pathname === '/release') {
          throw new Error('Wallet serializer is not responding');
        }
        throw new Error(`Unexpected Sponsor Container request: ${pathname}`);
      },
    } as never);
    const database = {
      prepare(query: string) {
        let bindings: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            bindings = values;
            return statement;
          },
          async first<T>() {
            if (query.includes('sponsor_wallet_operating_schedule')) {
              return alwaysOnSchedule<T>();
            }
            if (query.includes('FROM daily_proof_jobs')) return { ...job } as T;
            throw new Error(`Unexpected D1 first query: ${query}`);
          },
          async run<T>() {
            if (query.includes('SET sponsor_stage = ?1') && bindings[4] === job.status) {
              job.sponsor_stage = String(bindings[0]);
              job.sponsor_reason_code = String(bindings[1]);
              job.sponsor_stage_updated_at = String(bindings[2]);
              job.updated_at = String(bindings[2]);
              return d1Result(1) as D1Result<T>;
            }
            if (
              query.includes("SET status = 'awaiting_sponsor'")
              && bindings[1] === job.id
              && bindings[2] === serializedHash
            ) {
              Object.assign(job, {
                status: 'awaiting_sponsor',
                sponsor_transaction_object_key: null,
                sponsor_serialized_sha256: null,
                sponsor_transaction_id: null,
                sponsor_fee_specks: null,
                sponsor_transaction_bytes: null,
                sponsor_lease_expires_at: null,
                sponsor_available_after: String(bindings[0]),
                sponsorship_started_at: null,
                sponsorship_completed_at: null,
                attest_tx_id: null,
                attest_tx_hash: null,
                last_error_code: 'sponsor_transaction_expired_reprepare',
                updated_at: String(bindings[0]),
              });
              return d1Result(1) as D1Result<T>;
            }
            if (query.includes('SET sponsor_available_after = ?1')) {
              job.sponsor_available_after = String(bindings[0]);
              job.last_error_code = String(bindings[1]);
              job.updated_at = String(bindings[2]);
              return d1Result(1) as D1Result<T>;
            }
            return d1Result(0) as D1Result<T>;
          },
        } as unknown as D1PreparedStatement;
        return statement;
      },
    } as unknown as D1Database;
    const env = {
      DB: database,
      SPONSOR_WALLET: {},
      SPONSOR_QUEUE: {
        async send(body: unknown) { requeued.push(body); },
      },
      PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS: 'ab'.repeat(32),
      SPONSOR_STATE: {
        async get(key: string) {
          if (key !== artifactKey) return null;
          return {
            size: bytes.byteLength,
            uploaded: new Date('2026-08-30T02:17:06.159Z'),
            async arrayBuffer() { return bytes.buffer.slice(0); },
          };
        },
        async delete(key: string) { deleted.push(key); },
      },
    } as unknown as Env;
    const message = {
      body: { kind: 'sponsor-transaction', proofJobId: job.id },
      attempts: 1,
      ack() { messageEffects.acknowledgements += 1; },
      retry() { messageEffects.retries += 1; },
    } as unknown as Message<unknown>;
    const batch = {
      queue: 'midnight-sponsor-jobs',
      messages: [message],
    } as unknown as MessageBatch<unknown>;

    const completed = await Promise.race([
      handleSponsorQueue(batch, env).then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 250)),
    ]);

    expect(completed).toBe(true);
    expect(messageEffects).toEqual({ acknowledgements: 1, retries: 0 });
    expect(deleted).toEqual([artifactKey]);
    expect(requeued).toEqual([{ kind: 'sponsor-transaction', proofJobId: job.id }]);
    expect(job).toMatchObject({
      status: 'awaiting_sponsor',
      sponsor_transaction_object_key: null,
      sponsor_serialized_sha256: null,
      last_error_code: 'sponsor_transaction_expired_reprepare',
    });
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
    hour_results: '1'.repeat(24),
    observed_hour_count: 24,
    threshold_satisfied: 1,
    schema_version: 7,
    circuit_version: 5,
    proof_generated_at: null,
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

describe('server-owned Sponsor confirmation', () => {
  it('records an exact Indexer-confirmed submission without waiting for the browser', async () => {
    const bytes = new Uint8Array([7, 6, 5, 4]);
    const serializedHash = await sha256Hex(bytes);
    const artifactKey = `sponsor-transactions/proof-idempotency-001/${serializedHash}.tx`;
    const job = sponsorJob('sponsored', 'ab'.repeat(32));
    Object.assign(job, {
      sponsor_transaction_object_key: artifactKey,
      sponsor_serialized_sha256: serializedHash,
      sponsor_fee_specks: '700720000000001',
      sponsor_transaction_bytes: bytes.byteLength,
      sponsorship_started_at: '2026-08-30T15:49:39.522Z',
      attest_tx_id: `00${'11'.repeat(32)}`,
      attest_tx_hash: 'fa'.repeat(32),
      last_error_code: 'sponsor_submit_failed',
    });
    const deleted: string[] = [];
    vi.mocked(getContainer).mockReturnValue({
      async fetch(request: Request) {
        const pathname = new URL(request.url).pathname;
        if (pathname === '/submit') {
          await request.arrayBuffer();
          return Response.json({
            contractTransactionId: job.attest_tx_id,
            sponsorTransactionId: job.attest_tx_id,
            transactionHash: job.attest_tx_hash,
            blockHeight: '2332070',
            replayRecovered: true,
            serializedSha256: serializedHash,
            feeSpecks: job.sponsor_fee_specks,
            transactionBytes: bytes.byteLength,
            submittedAt: '2026-08-30T15:49:54.001Z',
          });
        }
        if (pathname === '/checkpoint') {
          return Response.json({ error: 'not needed in this fixture' }, { status: 503 });
        }
        throw new Error(`Unexpected Sponsor Container request: ${pathname}`);
      },
    } as never);
    const database = {
      prepare(query: string) {
        let bindings: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            bindings = values;
            return statement;
          },
          async first<T>() {
            if (query.includes('FROM daily_proof_jobs')) return { ...job } as T;
            throw new Error(`Unexpected D1 first query: ${query}`);
          },
          async run<T>() {
            if (query.includes('SET sponsor_stage = ?1') && bindings[4] === job.status) {
              job.sponsor_stage = String(bindings[0]);
              job.sponsor_reason_code = String(bindings[1]);
              job.sponsor_stage_updated_at = String(bindings[2]);
              job.updated_at = String(bindings[2]);
              return d1Result(1) as D1Result<T>;
            }
            if (query.includes('SET status = ?1') && bindings[6] === job.id) {
              Object.assign(job, {
                status: String(bindings[0]),
                sponsor_transaction_id: String(bindings[1]),
                block_height: String(bindings[2]),
                sponsorship_completed_at: String(bindings[3]),
                sponsor_stage: String(bindings[4]),
                sponsor_reason_code: String(bindings[5]),
                sponsor_stage_updated_at: String(bindings[3]),
                sponsor_lease_expires_at: null,
                last_error_code: null,
                updated_at: String(bindings[3]),
              });
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
      SPONSOR_WALLET: {},
      SPONSOR_STATE: {
        async get(key: string) {
          if (key !== artifactKey) return null;
          return {
            size: bytes.byteLength,
            async arrayBuffer() { return bytes.buffer.slice(0); },
          };
        },
        async delete(key: string) { deleted.push(key); },
      },
    } as unknown as Env;

    const result = await submitSponsoredTransaction(env, job, 'ab'.repeat(32));

    expect(result).toMatchObject({
      status: 'confirmed',
      sponsor_transaction_id: job.attest_tx_id,
      block_height: '2332070',
      last_error_code: null,
    });
    expect(deleted).toEqual([artifactKey]);
  });
});

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
    expect(deviceTransactionAcceptance('reproof_required', null, firstHash)).toBe('accept-new');
  });

  it('refreshes only explicitly rejected DUST proofs', () => {
    for (const code of [170, 171]) {
      expect(sponsorSubmissionRequiresDustRefresh(`1010: Invalid Transaction: Custom error: ${code}`)).toBe(true);
    }
    for (const message of ['Custom error: 182', 'Custom error: 193', 'timeout', 'Custom error: 1700']) {
      expect(sponsorSubmissionRequiresDustRefresh(message)).toBe(false);
    }
  });

  it('recognizes the Preprod stale-contract-state submission error', () => {
    expect(sponsorSubmissionRequiresReproof(
      '1010: Invalid Transaction: Custom error: 182',
    )).toBe(true);
    expect(sponsorSubmissionRequiresReproof(
      'Transaction Error: Malformed(TransactionApplicationError)',
    )).toBe(true);
    expect(sponsorSubmissionRequiresReproof(
      '1010: Invalid Transaction: Custom error: 171',
    )).toBe(false);
  });

  it('recognizes replay protection without treating other submission errors as replay', () => {
    expect(sponsorSubmissionIsReplayProtectionViolation(
      '1010: Invalid Transaction: Custom error: 193',
    )).toBe(true);
    expect(sponsorSubmissionIsReplayProtectionViolation(
      'Invalid Transaction: ReplayProtectionViolation',
    )).toBe(true);
    expect(sponsorSubmissionIsReplayProtectionViolation(
      '1010: Invalid Transaction: Custom error: 182',
    )).toBe(false);
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

describe('already-attested Sponsor reservation', () => {
  it('releases the reserved transaction and closes the Proof Job', async () => {
    const bytes = new Uint8Array([9, 8, 7, 6]);
    const serializedHash = await sha256Hex(bytes);
    const artifactKey = `sponsor-transactions/proof-idempotency-001/${serializedHash}.tx`;
    const job = sponsorJob('sponsored', 'ab'.repeat(32));
    Object.assign(job, {
      sponsor_transaction_object_key: artifactKey,
      sponsor_serialized_sha256: serializedHash,
      sponsor_fee_specks: '1000',
      sponsor_transaction_bytes: bytes.byteLength,
      attest_tx_id: 'contract-transaction-id',
      attest_tx_hash: 'contract-transaction-hash',
      last_error_code: 'sponsor_submit_failed',
    });
    const deleted: string[] = [];
    const checkpoints: Uint8Array[] = [];
    const released: string[] = [];
    vi.stubGlobal('FixedLengthStream', class {
      readonly readable: ReadableStream<Uint8Array>;
      readonly writable: WritableStream<Uint8Array>;

      constructor() {
        const stream = new TransformStream<Uint8Array, Uint8Array>();
        this.readable = stream.readable;
        this.writable = stream.writable;
      }
    });
    vi.mocked(getContainer).mockReturnValue({
      async fetch(request: Request) {
        const pathname = new URL(request.url).pathname;
        if (pathname === '/release') {
          released.push(request.headers.get('X-Sponsor-Serialized-Sha256') ?? '');
          return Response.json({
            released: true,
            serializedSha256: serializedHash,
            releasedAt: '2026-08-30T09:00:00.000Z',
          });
        }
        if (pathname === '/checkpoint') {
          return new Response(new Uint8Array([3, 2, 1]), {
            headers: { 'Content-Length': '3' },
          });
        }
        throw new Error(`Unexpected Sponsor Container request: ${pathname}`);
      },
    } as never);
    const database = {
      prepare(query: string) {
        let bindings: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            bindings = values;
            return statement;
          },
          async first<T>() {
            if (query.includes('FROM daily_proof_jobs')) return { ...job } as T;
            throw new Error(`Unexpected D1 first query: ${query}`);
          },
          async run<T>() {
            if (
              query.includes("SET status = 'dead_lettered'")
              && bindings[1] === job.id
              && bindings[2] === serializedHash
            ) {
              Object.assign(job, {
                status: 'dead_lettered',
                sponsor_transaction_object_key: null,
                sponsor_serialized_sha256: null,
                sponsor_fee_specks: null,
                sponsor_transaction_bytes: null,
                sponsor_lease_expires_at: null,
                attest_tx_id: null,
                attest_tx_hash: null,
                last_error_code: 'measurement_group_already_attested',
                updated_at: String(bindings[0]),
              });
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
      SPONSOR_STATE: {
        async get(key: string) {
          if (key !== artifactKey) return null;
          return {
            size: bytes.byteLength,
            async arrayBuffer() { return bytes.buffer.slice(0); },
          };
        },
        async put(_key: string, body: ReadableStream<Uint8Array>) {
          checkpoints.push(new Uint8Array(await new Response(body).arrayBuffer()));
        },
        async delete(key: string) { deleted.push(key); },
      },
      SPONSOR_WALLET: {},
    } as unknown as Env;

    const result = await releaseAlreadyAttestedSponsorReservation(
      env,
      job,
      'ab'.repeat(32),
    );

    expect(released).toEqual([serializedHash]);
    expect(checkpoints).toEqual([new Uint8Array([3, 2, 1])]);
    expect(deleted).toEqual([
      'sponsor-wallet/preprod/checkpoint-recovery.enc',
      artifactKey,
    ]);
    expect(result).toMatchObject({
      status: 'dead_lettered',
      sponsor_transaction_object_key: null,
      sponsor_serialized_sha256: null,
      attest_tx_id: null,
      attest_tx_hash: null,
      last_error_code: 'measurement_group_already_attested',
    });
  });
});

describe('stale-contract-state Sponsor reservation', () => {
  it('releases DUST and permits a new transaction under the same Proof Job ID', async () => {
    const bytes = new Uint8Array([6, 7, 8, 9]);
    const serializedHash = await sha256Hex(bytes);
    const deviceHash = 'ab'.repeat(32);
    const sponsorArtifactKey = `sponsor-transactions/proof-idempotency-001/${serializedHash}.tx`;
    const deviceArtifactKey = `device-transactions/proof-idempotency-001/${deviceHash}.tx`;
    const job = sponsorJob('sponsored', deviceHash);
    Object.assign(job, {
      device_transaction_object_key: deviceArtifactKey,
      sponsor_transaction_object_key: sponsorArtifactKey,
      sponsor_serialized_sha256: serializedHash,
      sponsor_fee_specks: '1000',
      sponsor_transaction_bytes: bytes.byteLength,
      sponsorship_started_at: '2026-08-30T09:00:00.000Z',
      attest_tx_id: 'stale-contract-transaction-id',
      attest_tx_hash: 'stale-contract-transaction-hash',
      last_error_code: 'sponsor_submit_failed',
    });
    const deleted: string[] = [];
    const checkpoints: Uint8Array[] = [];
    vi.stubGlobal('FixedLengthStream', class {
      readonly readable: ReadableStream<Uint8Array>;
      readonly writable: WritableStream<Uint8Array>;

      constructor() {
        const stream = new TransformStream<Uint8Array, Uint8Array>();
        this.readable = stream.readable;
        this.writable = stream.writable;
      }
    });
    vi.mocked(getContainer).mockReturnValue({
      async fetch(request: Request) {
        const pathname = new URL(request.url).pathname;
        if (pathname === '/release') {
          return Response.json({
            released: true,
            serializedSha256: serializedHash,
            releasedAt: '2026-08-30T09:01:00.000Z',
          });
        }
        if (pathname === '/checkpoint') {
          return new Response(new Uint8Array([4, 5, 6]), {
            headers: { 'Content-Length': '3' },
          });
        }
        throw new Error(`Unexpected Sponsor Container request: ${pathname}`);
      },
    } as never);
    const database = {
      prepare(query: string) {
        let bindings: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            bindings = values;
            return statement;
          },
          async first<T>() {
            if (query.includes('FROM daily_proof_jobs')) return { ...job } as T;
            throw new Error(`Unexpected D1 first query: ${query}`);
          },
          async run<T>() {
            if (
              query.includes("SET status = 'reproof_required'")
              && bindings[1] === job.id
              && bindings[2] === serializedHash
            ) {
              expect(query).toContain("status = 'reproof_required', lease_expires_at = NULL");
              Object.assign(job, {
                status: 'reproof_required',
                lease_expires_at: null,
                device_transaction_object_key: null,
                device_transaction_hash: null,
                device_transaction_bytes: null,
                sponsor_transaction_object_key: null,
                sponsor_serialized_sha256: null,
                sponsor_transaction_id: null,
                sponsor_fee_specks: null,
                sponsor_transaction_bytes: null,
                sponsor_lease_expires_at: null,
                sponsorship_started_at: null,
                sponsorship_completed_at: null,
                attest_tx_id: null,
                attest_tx_hash: null,
                sponsor_stage: 'reproof_required',
                sponsor_reason_code: 'contract_state_changed_reproof_required',
                sponsor_stage_updated_at: String(bindings[0]),
                last_error_code: 'contract_state_changed_reproof_required',
                updated_at: String(bindings[0]),
              });
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
      SPONSOR_STATE: {
        async get(key: string) {
          if (key !== sponsorArtifactKey) return null;
          return {
            size: bytes.byteLength,
            async arrayBuffer() { return bytes.buffer.slice(0); },
          };
        },
        async put(_key: string, body: ReadableStream<Uint8Array>) {
          checkpoints.push(new Uint8Array(await new Response(body).arrayBuffer()));
        },
        async delete(key: string) { deleted.push(key); },
      },
      SPONSOR_WALLET: {},
    } as unknown as Env;

    const result = await releaseStaleSponsorReservationForReproof(
      env,
      job,
      'ab'.repeat(32),
    );

    expect(checkpoints).toEqual([new Uint8Array([4, 5, 6])]);
    expect(deleted).toEqual([
      'sponsor-wallet/preprod/checkpoint-recovery.enc',
      sponsorArtifactKey,
      deviceArtifactKey,
    ]);
    expect(result).toMatchObject({
      id: job.id,
      status: 'reproof_required',
      device_transaction_hash: null,
      sponsor_serialized_sha256: null,
      sponsor_stage: 'reproof_required',
      sponsor_reason_code: 'contract_state_changed_reproof_required',
      last_error_code: 'contract_state_changed_reproof_required',
    });
    expect(deviceTransactionAcceptance(result.status, null, 'cd'.repeat(32))).toBe('accept-new');
  });
});

describe('expired Sponsor reservation', () => {
  it('refreshes five minutes before the Wallet transaction TTL', () => {
    const now = Date.parse('2026-08-30T09:30:00.000Z');
    expect(sponsorTransactionNeedsRefresh(new Date('2026-08-30T09:05:00.000Z'), now)).toBe(true);
    expect(sponsorTransactionNeedsRefresh(new Date('2026-08-30T09:05:00.001Z'), now)).toBe(false);
  });

  it.each([
    ['releases through the Wallet', false, 'expired'],
    ['abandons an unreachable Wallet reservation', true, 'expired'],
    ['releases rejected DUST proof', false, 'dust-proof-rejected'],
    ['preserves rejected DUST reservation when release fails', true, 'dust-proof-rejected'],
    ['records a persistent full DUST replay request', false, 'dust-state-replay'],
    ['preserves full replay reservation when release fails', true, 'dust-state-replay'],
  ] as const)('%s and makes the Device transaction resumable', async (_name, releaseUnavailable, reason) => {
    const bytes = new Uint8Array([5, 4, 3, 2]);
    const serializedHash = await sha256Hex(bytes);
    const artifactKey = `sponsor-transactions/proof-idempotency-001/${serializedHash}.tx`;
    const job = sponsorJob('sponsored', 'ab'.repeat(32));
    Object.assign(job, {
      sponsor_transaction_object_key: artifactKey,
      sponsor_serialized_sha256: serializedHash,
      sponsor_fee_specks: '1000',
      sponsor_transaction_bytes: bytes.byteLength,
      sponsorship_started_at: '2026-08-30T02:17:06.159Z',
      attest_tx_id: 'expired-contract-transaction-id',
      attest_tx_hash: 'expired-contract-transaction-hash',
      last_error_code: 'sponsor_submit_failed',
    });
    const deleted: string[] = [];
    const checkpoints: Uint8Array[] = [];
    vi.stubGlobal('FixedLengthStream', class {
      readonly readable: ReadableStream<Uint8Array>;
      readonly writable: WritableStream<Uint8Array>;

      constructor() {
        const stream = new TransformStream<Uint8Array, Uint8Array>();
        this.readable = stream.readable;
        this.writable = stream.writable;
      }
    });
    vi.mocked(getContainer).mockReturnValue({
      async fetch(request: Request) {
        const pathname = new URL(request.url).pathname;
        if (pathname === '/release') {
          if (releaseUnavailable) throw new Error('Container port connection closed unexpectedly');
          return Response.json({
            released: true,
            serializedSha256: serializedHash,
            releasedAt: '2026-08-30T09:30:00.000Z',
          });
        }
        if (pathname === '/checkpoint') {
          return new Response(new Uint8Array([3, 2, 1]), {
            headers: { 'Content-Length': '3' },
          });
        }
        throw new Error(`Unexpected Sponsor Container request: ${pathname}`);
      },
    } as never);
    const database = {
      prepare(query: string) {
        let bindings: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            bindings = values;
            return statement;
          },
          async first<T>() {
            if (query.includes('FROM daily_proof_jobs')) return { ...job } as T;
            throw new Error(`Unexpected D1 first query: ${query}`);
          },
          async run<T>() {
            if (
              query.includes("SET status = 'awaiting_sponsor'")
              && bindings[1] === job.id
              && bindings[2] === serializedHash
            ) {
              Object.assign(job, {
                status: 'awaiting_sponsor',
                sponsor_transaction_object_key: null,
                sponsor_serialized_sha256: null,
                sponsor_transaction_id: null,
                sponsor_fee_specks: null,
                sponsor_transaction_bytes: null,
                sponsor_lease_expires_at: null,
                sponsor_available_after: String(bindings[0]),
                sponsorship_started_at: null,
                sponsorship_completed_at: null,
                attest_tx_id: null,
                attest_tx_hash: null,
                last_error_code: String(bindings[3]),
                updated_at: String(bindings[0]),
              });
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
      SPONSOR_STATE: {
        async get(key: string) {
          if (key !== artifactKey) return null;
          return {
            size: bytes.byteLength,
            async arrayBuffer() { return bytes.buffer.slice(0); },
          };
        },
        async put(_key: string, body: ReadableStream<Uint8Array>) {
          checkpoints.push(new Uint8Array(await new Response(body).arrayBuffer()));
        },
        async delete(key: string) { deleted.push(key); },
      },
      SPONSOR_WALLET: {},
    } as unknown as Env;

    if (reason !== 'expired' && releaseUnavailable) {
      await expect(releaseExpiredSponsorReservation(env, job, 'ab'.repeat(32), reason)).rejects.toThrow();
      expect(job.status).toBe('sponsored');
      expect(deleted).toEqual([]);
      return;
    }
    const result = await releaseExpiredSponsorReservation(env, job, 'ab'.repeat(32), reason);

    expect(deleted).toEqual(releaseUnavailable
      ? [artifactKey]
      : ['sponsor-wallet/preprod/checkpoint-recovery.enc', artifactKey]);
    expect(checkpoints).toEqual(releaseUnavailable ? [] : [new Uint8Array([3, 2, 1])]);
    expect(result).toMatchObject({
      status: 'awaiting_sponsor',
      device_transaction_hash: 'ab'.repeat(32),
      sponsor_transaction_object_key: null,
      sponsor_serialized_sha256: null,
      sponsorship_started_at: null,
      attest_tx_id: null,
      last_error_code: reason === 'expired' ? 'sponsor_transaction_expired_reprepare'
        : reason === 'dust-state-replay' ? 'sponsor_dust_state_replay_required'
          : 'sponsor_dust_proof_rejected_reprepare',
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

describe('Sponsor Queue concurrency', () => {
  it('does not overwrite the active attempt progress when a duplicate message loses the claim race', async () => {
    vi.mocked(getContainer).mockClear();
    const originalStageUpdatedAt = '2026-08-29T04:00:00.000Z';
    const deviceTransaction = new Uint8Array([1, 2, 3, 4]);
    const deviceTransactionHash = await sha256Hex(deviceTransaction);
    const deviceTransactionObjectKey = 'device-transactions/proof-concurrent-duplicate-001.tx';
    const job = failedJob({
      id: 'proof-concurrent-duplicate-001',
      status: 'sponsor_retryable',
      sponsor_available_after: '2026-08-29T04:00:00.000Z',
      sponsor_stage: 'retry_wait',
      sponsor_reason_code: 'sponsor_worker_interrupted',
      sponsor_stage_updated_at: originalStageUpdatedAt,
      device_transaction_hash: deviceTransactionHash,
      device_transaction_bytes: deviceTransaction.byteLength,
      device_transaction_object_key: deviceTransactionObjectKey,
    });
    const database = {
      prepare(query: string) {
        let bindings: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            bindings = values;
            return statement;
          },
          async first<T>() {
            if (query.includes('FROM daily_proof_jobs')) return { ...job } as T;
            throw new Error(`Unexpected D1 first query: ${query}`);
          },
          async run<T>() {
            if (query.includes('sponsor_attempt_count = sponsor_attempt_count + 1')) {
              // Another Queue delivery claims the Job after this delivery read
              // it but before this delivery's generation-checked claim.
              job.status = 'sponsoring';
              expect(bindings[3]).toBe('sponsor_retryable');
              expect(bindings[4]).toBe(job.updated_at);
              return d1Result(0) as D1Result<T>;
            }
            throw new Error(`Unexpected D1 run query: ${query}`);
          },
        } as unknown as D1PreparedStatement;
        return statement;
      },
    } as unknown as D1Database;
    let acknowledgements = 0;
    const message = {
      body: { kind: 'sponsor-transaction', proofJobId: job.id },
      attempts: 1,
      ack() { acknowledgements += 1; },
      retry() {},
    } as unknown as Message<unknown>;

    vi.mocked(getContainer).mockReturnValue({
      async fetch(request: Request) {
        if (new URL(request.url).pathname !== '/health') {
          throw new Error(`Unexpected Sponsor Container request: ${request.url}`);
        }
        return Response.json({
          phase: 'ready',
          spendableDustCoins: 1,
          totalDustCoins: 1,
          pendingDustCoins: 0,
          initialization: { status: 'succeeded' },
          error: null,
        });
      },
    } as never);

    await handleSponsorQueue({
      queue: 'midnight-sponsor-jobs',
      messages: [message],
    } as unknown as MessageBatch<unknown>, {
      DB: database,
      SPONSOR_STATE: {
        async get(key: string) {
          expect(key).toBe(deviceTransactionObjectKey);
          return {
            size: deviceTransaction.byteLength,
            async arrayBuffer() { return deviceTransaction.buffer.slice(0); },
          };
        },
      },
      SPONSOR_WALLET: {},
      PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS: 'ab'.repeat(32),
    } as unknown as Env);

    expect(acknowledgements).toBe(1);
    expect(job.sponsor_stage).toBe('retry_wait');
    expect(job.sponsor_stage_updated_at).toBe(originalStageUpdatedAt);
    expect(getContainer).not.toHaveBeenCalled();
  });
});

describe('stale Sponsor request recovery', () => {
  it('keeps a failed Device-bound transaction resumable without another Proof', () => {
    expect(canRecoverStaleSponsoringRequest(failedJob())).toBe(false);
  });

  it('recovers a canceled in-progress request one minute after the Queue wall-time limit', () => {
    const now = Date.parse('2026-08-29T04:16:00.000Z');
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

  it('reclaims a pre-reservation checkpoint stall after two minutes without a browser retry', async () => {
    const scheduledTime = Date.parse('2026-08-29T04:03:00.000Z');
    const job = {
      id: 'proof-interrupted-001',
      status: 'sponsoring',
      sponsor_stage: 'checkpoint_persisting',
      sponsor_reason_code: 'sponsor_checkpoint_persisting',
      sponsor_stage_updated_at: '2026-08-29T04:00:00.000Z',
      sponsor_lease_expires_at: '2026-08-29T04:20:00.000Z',
    };
    const updates: Array<{ query: string; bindings: unknown[] }> = [];
    const queued: string[] = [];
    const database = {
      prepare(query: string) {
        let bindings: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            bindings = values;
            return statement;
          },
          async first<T>() {
            if (query.includes('sponsor_wallet_operating_schedule')) {
              return alwaysOnSchedule<T>();
            }
            throw new Error(`Unexpected D1 first query: ${query}`);
          },
          async run<T>() {
            updates.push({ query, bindings });
            if (
              query.includes(
                "sponsor_stage IN ('wallet_checking', 'checkpoint_persisting', 'checkpoint_preserving')",
              )
              && job.status === 'sponsoring'
              && ['checkpoint_persisting', 'checkpoint_preserving'].includes(job.sponsor_stage)
            ) {
              job.status = 'sponsor_retryable';
              job.sponsor_stage = 'retry_wait';
              job.sponsor_reason_code = 'sponsor_pre_dust_worker_interrupted';
            } else if (query.includes("sponsor_stage = 'interrupted'") && job.status === 'sponsoring') {
              job.sponsor_stage = 'interrupted';
              job.sponsor_reason_code = 'sponsor_queue_wall_time_exceeded_waiting_for_safe_retry';
            } else if (
              query.includes("sponsor_reason_code = 'sponsor_worker_interrupted'")
              && job.status === 'sponsoring'
            ) {
              job.status = 'sponsor_retryable';
              job.sponsor_stage = 'retry_wait';
              job.sponsor_reason_code = 'sponsor_worker_interrupted';
            }
            return d1Result(1) as D1Result<T>;
          },
          async all<T>() {
            return {
              ...d1Result(0),
              results: job.status === 'sponsor_retryable' ? [{ id: job.id }] as T[] : [],
            } as D1Result<T>;
          },
        } as unknown as D1PreparedStatement;
        return statement;
      },
    } as unknown as D1Database;
    const env = {
      DB: database,
      SPONSOR_QUEUE: {
        async send(message: { proofJobId: string }) { queued.push(message.proofJobId); },
      },
    } as unknown as Env;

    await dispatchSponsorJobs(env, scheduledTime);

    expect(job).toMatchObject({
      status: 'sponsor_retryable',
      sponsor_stage: 'retry_wait',
      sponsor_reason_code: 'sponsor_pre_dust_worker_interrupted',
    });
    expect(queued).toEqual([job.id]);
    expect(updates[0]?.bindings).toEqual([
      '2026-08-29T04:03:00.000Z',
      '2026-08-29T04:01:00.000Z',
    ]);
  });

  it('dispatches a Device-bound transaction that is fenced from legacy Consumers', async () => {
    const queued: string[] = [];
    const database = {
      prepare(query: string) {
        let bindings: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            bindings = values;
            return statement;
          },
          async first<T>() {
            if (query.includes('sponsor_wallet_operating_schedule')) {
              return alwaysOnSchedule<T>();
            }
            throw new Error(`Unexpected D1 first query: ${query}`);
          },
          async run<T>() {
            return d1Result(0) as D1Result<T>;
          },
          async all<T>() {
            expect(query).toContain("status = 'device_bound'");
            expect(query).toContain('device_transaction_object_key IS NOT NULL');
            expect(bindings).toEqual(['2026-08-29T04:03:00.000Z']);
            return {
              ...d1Result(0),
              results: [{ id: 'proof-generation-fenced-001' }] as T[],
            } as D1Result<T>;
          },
        } as unknown as D1PreparedStatement;
        return statement;
      },
    } as unknown as D1Database;
    const env = {
      DB: database,
      SPONSOR_QUEUE: {
        async send(message: { proofJobId: string }) { queued.push(message.proofJobId); },
      },
    } as unknown as Env;

    await dispatchSponsorJobs(env, Date.parse('2026-08-29T04:03:00.000Z'));

    expect(queued).toEqual(['proof-generation-fenced-001']);
  });
});
