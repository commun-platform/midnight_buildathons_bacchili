import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getContainer } from '@cloudflare/containers';

vi.mock('@cloudflare/containers', () => ({ getContainer: vi.fn() }));

import {
  recoverStalledSponsorWallet,
  persistedStalledSponsorWalletSyncReason,
  stalledSponsorWalletSyncReason,
  type SponsorWalletHealth,
} from './sponsor.js';

function d1Result(changes = 1): D1Result {
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

function stalledHealth(): SponsorWalletHealth {
  return {
    phase: 'syncing',
    progress: {
      shielded: 'disconnected, syncing (100/0)',
      unshielded: 'connected, complete (100/100)',
      dust: 'connected, syncing (100/0)',
    },
    progressDetails: {
      shielded: { applied: '100', highest: '0', connected: false, complete: false },
      unshielded: { applied: '100', highest: '100', connected: true, complete: true },
      dust: { applied: '100', highest: '0', connected: true, complete: false },
    },
    initialization: {
      status: 'succeeded',
      startedAt: '2026-09-16T00:00:00.000Z',
      completedAt: '2026-09-16T00:00:01.000Z',
      error: null,
    },
    lastStateAt: '2026-09-16T00:00:00.000Z',
    supervisor: {
      status: 'healthy',
      walletProcessAlive: true,
      walletProcessId: 24,
      walletStatusFresh: true,
      lastSuccessfulProbeAt: '2026-09-16T00:10:00.000Z',
      lastProbeErrorAt: null,
      lastProbeError: null,
      statusAgeMs: 0,
      consecutiveProbeFailures: 0,
    },
    shuttingDown: false,
    error: null,
  };
}

function fakeDatabase(options: {
  activeCount?: number;
  latestRecoveryAt?: string | null;
}) {
  const queries: string[] = [];
  const database = {
    prepare(sql: string) {
      let parameters: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          parameters = values;
          return statement;
        },
        async first<T>() {
          queries.push(sql);
          if (sql.includes('server_wallet_processing_lease')) {
            return { active_count: options.activeCount ?? 0 } as T;
          }
          if (sql.includes('FROM operational_events')) {
            return options.latestRecoveryAt
              ? { occurred_at: options.latestRecoveryAt } as T
              : null;
          }
          throw new Error(`Unexpected first query: ${sql} ${JSON.stringify(parameters)}`);
        },
        async run() {
          queries.push(sql);
          return d1Result();
        },
      } as unknown as D1PreparedStatement;
      return statement;
    },
  } as unknown as D1Database;
  return { database, queries };
}

describe('stalled Sponsor Wallet recovery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not classify fresh or ready Wallet state as stalled', () => {
    const health = stalledHealth();
    expect(stalledSponsorWalletSyncReason(health, Date.parse('2026-09-16T00:04:59.999Z')))
      .toBeNull();
    expect(stalledSponsorWalletSyncReason({ ...health, phase: 'ready' }, Date.parse('2026-09-16T01:00:00.000Z')))
      .toBeNull();
  });

  it('classifies a stale degraded persisted snapshot when the live probe is unavailable', () => {
    const state = {
      health_class: 'degraded' as const,
      last_observed_at: '2026-09-16T00:04:59.999Z',
      last_changed_at: '2026-09-16T00:00:00.000Z',
      summary_json: JSON.stringify({
        phase: 'syncing',
        initialization: { status: 'succeeded' },
        supervisor: { walletProcessAlive: true },
        synchronization: [
          { channel: 'shielded', connected: false, complete: false },
          { channel: 'unshielded', connected: true, complete: true },
        ],
      }),
    };
    expect(persistedStalledSponsorWalletSyncReason(state, Date.parse('2026-09-16T00:05:00.001Z')))
      .toBe('shielded_sync_stalled');
    expect(persistedStalledSponsorWalletSyncReason({ ...state, health_class: 'healthy' }, Date.parse('2026-09-16T01:00:00.000Z')))
      .toBeNull();
  });

  it('gracefully stops a stale Wallet and records the cooldown event', async () => {
    const { database, queries } = fakeDatabase({});
    vi.mocked(getContainer).mockReturnValue({
      async stopAfterScheduledDrain() {
        return { stopped: true, state: 'stopped' };
      },
    } as never);
    const now = new Date('2026-09-16T01:00:00.000Z');
    const result = await recoverStalledSponsorWallet({
      DB: database,
      SPONSOR_WALLET: {},
    } as Env, stalledHealth(), now);

    expect(result).toEqual({ attempted: true, stopped: true, reason: 'shielded_sync_stalled' });
    expect(queries.some((sql) => sql.includes('sponsor_wallet_operating_schedule'))).toBe(true);
    expect(queries.some((sql) => sql.includes('INSERT INTO operational_events'))).toBe(true);
    expect(getContainer).toHaveBeenCalledOnce();
  });

  it('does not stop while a reservation or recent recovery is active', async () => {
    const active = fakeDatabase({ activeCount: 1 });
    const activeResult = await recoverStalledSponsorWallet({ DB: active.database } as Env, stalledHealth(), new Date('2026-09-16T01:00:00.000Z'));
    expect(activeResult).toEqual({ attempted: false, stopped: false, reason: 'active-wallet-operation' });

    const recent = fakeDatabase({ latestRecoveryAt: '2026-09-16T00:50:00.000Z' });
    const recentResult = await recoverStalledSponsorWallet({ DB: recent.database } as Env, stalledHealth(), new Date('2026-09-16T01:00:00.000Z'));
    expect(recentResult).toEqual({ attempted: false, stopped: false, reason: 'recovery-cooldown' });
    expect(getContainer).not.toHaveBeenCalled();
  });
});
