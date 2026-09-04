import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  processBrowserPolicy,
  processBrowserDevice,
  processManagedSource,
  processManagedAttestation,
  processSponsorTransaction,
} = vi.hoisted(() => ({
  processBrowserPolicy: vi.fn(),
  processBrowserDevice: vi.fn(),
  processManagedSource: vi.fn(),
  processManagedAttestation: vi.fn(),
  processSponsorTransaction: vi.fn(),
}));

vi.mock('./provisioning.js', () => ({
  processScheduledBrowserPolicy: processBrowserPolicy,
  processScheduledBrowserDevice: processBrowserDevice,
}));
vi.mock('./managed-sources.js', () => ({
  processScheduledManagedSourceProvisioning: processManagedSource,
  processScheduledManagedAttestation: processManagedAttestation,
}));
vi.mock('./sponsor.js', () => ({
  processScheduledSponsorJob: processSponsorTransaction,
}));

import {
  acquireServerWalletWarmupLease,
  nextServerWalletWork,
  processNextServerWalletWork,
  releaseServerWalletWarmupLease,
  serverWalletWorkCanProceed,
} from './server-wallet-work.js';
import type { SqlDatabase } from './storage/index.js';

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

describe('Server Wallet scheduled work coordinator', () => {
  beforeEach(() => vi.clearAllMocks());

  it('waits for synchronization before any work and resumes a prepared transaction', () => {
    const preparedWork = {
      kind: 'sponsor-transaction' as const,
      id: 'proof-prepared-001',
      createdAt: '2026-09-03T16:59:59.000Z',
      sponsorStatus: 'sponsored',
    };
    expect(serverWalletWorkCanProceed(preparedWork, {
      phase: 'syncing',
      spendableDustCoins: 0,
    })).toBe(false);
    expect(serverWalletWorkCanProceed(preparedWork, {
      phase: 'ready',
      spendableDustCoins: 0,
    })).toBe(true);
  });

  it('waits for synchronization before non-sponsor Wallet work', () => {
    const policyWork = {
      kind: 'browser-policy' as const,
      id: 'policy-operation-001',
      createdAt: '2026-09-03T16:59:59.000Z',
      sponsorStatus: null,
    };
    expect(serverWalletWorkCanProceed(policyWork, {
      phase: 'syncing',
      spendableDustCoins: 1,
    })).toBe(false);
    expect(serverWalletWorkCanProceed(policyWork, {
      phase: 'ready',
      spendableDustCoins: 1,
    })).toBe(true);
  });

  it('requires spendable DUST after synchronization for unprepared work', () => {
    const pendingWork = {
      kind: 'sponsor-transaction' as const,
      id: 'proof-awaiting-001',
      createdAt: '2026-09-03T16:59:59.000Z',
      sponsorStatus: 'awaiting_sponsor',
    };
    expect(serverWalletWorkCanProceed(pendingWork, {
      phase: 'ready',
      spendableDustCoins: 0,
    })).toBe(false);
    expect(serverWalletWorkCanProceed(pendingWork, {
      phase: 'ready',
      spendableDustCoins: 1,
    })).toBe(true);
  });

  it('leases Wallet warmup across Cron invocations and releases only its own token', async () => {
    const queries: Array<{ sql: string; parameters: readonly unknown[] }> = [];
    let nextChanges = 1;
    const database = {
      kind: 'd1',
      async execute(sql: string, parameters: readonly unknown[] = []) {
        queries.push({ sql, parameters });
        return nextChanges;
      },
    } as unknown as SqlDatabase;
    const work = {
      kind: 'managed-attestation' as const,
      id: 'managed-run-001',
      createdAt: '2026-09-03T16:59:59.000Z',
      sponsorStatus: null,
    };
    const now = new Date('2026-09-03T17:01:00.000Z');

    const token = await acquireServerWalletWarmupLease(database, work, now);
    expect(token).toMatch(/^[0-9a-f-]{36}$/u);
    expect(queries[0]?.sql).toContain('UPDATE server_wallet_warmup_lease');
    expect(queries[0]?.parameters.slice(1)).toEqual([
      '2026-09-03T17:16:00.000Z',
      work.kind,
      work.id,
      now.toISOString(),
    ]);

    await releaseServerWalletWarmupLease(database, token!);
    expect(queries[1]?.sql).toContain('singleton_id = 1 AND lease_token = ?2');
    expect(queries[1]?.parameters[1]).toBe(token);

    nextChanges = 0;
    await expect(acquireServerWalletWarmupLease(database, work, now)).resolves.toBeNull();
  });

  it('selects the oldest runnable operation with explicit dependency joins and cutoff', async () => {
    let sql = '';
    let parameters: readonly unknown[] = [];
    const database = {
      kind: 'd1',
      async first<T>(query: string, bindings: readonly unknown[]) {
        sql = query;
        parameters = bindings;
        return {
          kind: 'browser-policy',
          id: 'policy-operation-001',
          created_at: '2026-09-03T16:59:59.000Z',
          sponsor_status: null,
        } as T;
      },
    } as unknown as SqlDatabase;

    await expect(nextServerWalletWork(
      database,
      '2026-09-03T17:01:00.000Z',
      '2026-09-03T17:00:00.000Z',
      'ab'.repeat(32),
    )).resolves.toEqual({
      kind: 'browser-policy',
      id: 'policy-operation-001',
      createdAt: '2026-09-03T16:59:59.000Z',
      sponsorStatus: null,
    });
    expect(sql).toContain("SELECT 'browser-policy'");
    expect(sql).toContain("SELECT 'browser-device'");
    expect(sql).toContain("SELECT 'managed-source'");
    expect(sql).toContain("SELECT 'managed-attestation'");
    expect(sql).toContain("SELECT 'sponsor-transaction', job.id, job.created_at, job.status");
    expect(sql).toContain('SELECT kind, id, created_at, sponsor_status');
    expect(sql).toContain("policy.status = 'registered'");
    expect(sql).toContain('ORDER BY created_at ASC, precedence ASC, id ASC');
    expect(parameters).toEqual([
      '2026-09-03T17:01:00.000Z',
      '2026-09-03T17:00:00.000Z',
      'ab'.repeat(32),
    ]);
  });

  it('leases and processes only one selected operation', async () => {
    const work = {
      kind: 'browser-policy',
      id: 'policy-operation-001',
      created_at: '2026-09-03T16:59:59.000Z',
      sponsor_status: null,
    };
    const queries: string[] = [];
    const database = {
      prepare(query: string) {
        queries.push(query);
        const statement = {
          bind() { return statement; },
          async first<T>() { return work as T; },
          async run() { return d1Result(1); },
        } as unknown as D1PreparedStatement;
        return statement;
      },
    } as unknown as D1Database;
    const result = await processNextServerWalletWork({
      DB: database,
      PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS: 'ab'.repeat(32),
    } as unknown as Env, Date.parse('2026-09-03T17:01:00.000Z'), '2026-09-03T17:00:00.000Z');

    expect(result).toMatchObject({ status: 'processed', work: { id: work.id } });
    expect(processBrowserPolicy).toHaveBeenCalledOnce();
    expect(processBrowserPolicy).toHaveBeenCalledWith(expect.anything(), work.id);
    expect(processBrowserDevice).not.toHaveBeenCalled();
    expect(processManagedSource).not.toHaveBeenCalled();
    expect(processManagedAttestation).not.toHaveBeenCalled();
    expect(processSponsorTransaction).not.toHaveBeenCalled();
    expect(queries.some((query) => query.includes('lease_token = ?1'))).toBe(true);
    expect(queries.some((query) => query.includes('lease_token = NULL'))).toBe(true);
  });

  it('does not execute a second operation while another scheduled run owns the lease', async () => {
    const work = {
      kind: 'sponsor-transaction',
      id: 'proof-queued-001',
      created_at: '2026-09-03T16:59:59.000Z',
      sponsor_status: 'sponsored',
    };
    const database = {
      prepare(query: string) {
        const statement = {
          bind() { return statement; },
          async first<T>() { return work as T; },
          async run() {
            return d1Result(query.includes('lease_token = ?1') ? 0 : 1);
          },
        } as unknown as D1PreparedStatement;
        return statement;
      },
    } as unknown as D1Database;

    await expect(processNextServerWalletWork({
      DB: database,
      PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS: 'ab'.repeat(32),
    } as unknown as Env, Date.parse('2026-09-03T17:01:00.000Z'), null)).resolves.toEqual({
      status: 'busy',
      work: {
        kind: work.kind,
        id: work.id,
        createdAt: work.created_at,
        sponsorStatus: work.sponsor_status,
      },
    });
    expect(processSponsorTransaction).not.toHaveBeenCalled();
  });
});
