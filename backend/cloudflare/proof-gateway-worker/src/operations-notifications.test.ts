import { describe, expect, it } from 'vitest';

import {
  discordNotificationsConfigured,
  japaneseAlertPresentation,
  nextAlertNotificationKind,
  notificationEmbed,
  operationalAlertThresholds,
  sponsorLowDustCondition,
  sponsorSynchronizationUnsynced,
} from './operations-notifications.js';
import type { SponsorWalletOperationsView } from './operations-audit.js';
import type { SqlDatabase } from './storage/sql.js';

function synchronizationView(
  overrides: Partial<SponsorWalletOperationsView> = {},
): SponsorWalletOperationsView {
  return {
    healthClass: 'degraded',
    phase: 'syncing',
    bootId: 'boot-1',
    initializedAt: '2026-08-31T00:00:00.000Z',
    lastStateAt: '2026-08-31T00:00:00.000Z',
    progress: { shielded: '0', unshielded: '0', dust: '0' },
    synchronization: [
      { channel: 'shielded', applied: '0', highest: '0', lag: '0', connected: false, complete: false },
      { channel: 'unshielded', applied: '0', highest: '0', lag: '0', connected: false, complete: false },
      { channel: 'dust', applied: '0', highest: '0', lag: '0', connected: false, complete: false },
    ],
    balances: {
      night: null,
      dust: null,
      spendableDustCoins: 0,
      pendingDustCoins: 0,
      totalDustCoins: 0,
      nightCoins: null,
    },
    initialization: null,
    synchronizationCheckpoint: null,
    supervisor: null,
    shuttingDown: false,
    errorCode: null,
    ...overrides,
  };
}

describe('operations notifications', () => {
  it('accepts only an HTTPS Discord webhook endpoint', () => {
    expect(discordNotificationsConfigured({
      DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/token',
    } as Env)).toBe(true);
    expect(discordNotificationsConfigured({
      DISCORD_WEBHOOK_URL: 'https://attacker.example/api/webhooks/123/token',
    } as Env)).toBe(false);
    expect(discordNotificationsConfigured({
      DISCORD_WEBHOOK_URL: 'http://discord.com/api/webhooks/123/token',
    } as Env)).toBe(false);
  });

  it('uses bounded operational defaults and accepts explicit deployment policy', () => {
    expect(operationalAlertThresholds({} as Env)).toEqual({
      lowDustTransactions: 1,
      syncLagBlocks: 250,
      syncUnsyncedMinutes: 5,
      proofBacklog: 8,
      proofBacklogAgeMinutes: 10,
      sponsorBacklog: 16,
      sponsorBacklogAgeMinutes: 10,
      proofRateLimitEvents: 5,
      reminderMinutes: 60,
    });
    expect(operationalAlertThresholds({
      OPERATIONS_ALERT_LOW_DUST_TRANSACTIONS: '4',
      OPERATIONS_ALERT_SYNC_LAG_BLOCKS: '800',
      OPERATIONS_ALERT_SYNC_UNSYNCED_MINUTES: '7',
      OPERATIONS_ALERT_REMINDER_MINUTES: '120',
    } as Env)).toMatchObject({
      lowDustTransactions: 4,
      syncLagBlocks: 800,
      syncUnsyncedMinutes: 7,
      reminderMinutes: 120,
    });
  });

  it('uses actual DUST capacity instead of the spendable UTXO count', () => {
    const latestFee = {
      proofJobId: 'zjb_01991f1e-2520-7000-8000-000000000001',
      specks: '632920000000001',
      recordedAt: '2026-08-31T09:00:00.000Z',
    };
    const oneUtxoWithCapacity = synchronizationView({
      phase: 'ready',
      balances: {
        night: null,
        dust: '2000000000000000',
        spendableDustCoins: 1,
        pendingDustCoins: 0,
        totalDustCoins: 1,
        nightCoins: null,
      },
    });
    expect(sponsorLowDustCondition(oneUtxoWithCapacity, latestFee, 1)).toMatchObject({
      active: false,
      summary: expect.stringContaining('estimated capacity is 3 transactions'),
    });
    expect(sponsorLowDustCondition({
      ...oneUtxoWithCapacity,
      balances: { ...oneUtxoWithCapacity.balances, dust: '700000000000000' },
    }, latestFee, 1)).toMatchObject({
      active: true,
      summary: expect.stringContaining('0.700000000000000 DUST'),
    });
  });

  it('classifies disconnected 0/0 synchronization as unsynchronized', () => {
    const thresholds = operationalAlertThresholds({} as Env);
    expect(sponsorSynchronizationUnsynced(synchronizationView(), thresholds)).toBe(true);
  });

  it('does not alert for connected synchronization with no block lag', () => {
    const thresholds = operationalAlertThresholds({} as Env);
    const connected = synchronizationView({
      synchronization: [
        { channel: 'shielded', applied: '10', highest: '10', lag: '0', connected: true, complete: false },
        { channel: 'unshielded', applied: '10', highest: '10', lag: '0', connected: true, complete: false },
        { channel: 'dust', applied: '10', highest: '10', lag: '0', connected: true, complete: false },
      ],
    });
    expect(sponsorSynchronizationUnsynced(connected, thresholds)).toBe(false);
  });

  it('opens a synchronization alert only after five continuous minutes', () => {
    const firstObservedAt = '2026-08-31T00:00:00.000Z';
    const current = {
      status: 'open' as const,
      first_observed_at: firstObservedAt,
      last_notified_at: null,
    };
    expect(nextAlertNotificationKind(null, firstObservedAt, 5, 60)).toBeNull();
    expect(nextAlertNotificationKind(
      current,
      '2026-08-31T00:04:59.999Z',
      5,
      60,
    )).toBeNull();
    expect(nextAlertNotificationKind(
      current,
      '2026-08-31T00:05:00.000Z',
      5,
      60,
    )).toBe('alert-opened');
  });

  it('starts a new grace period after an alert recovers', () => {
    expect(nextAlertNotificationKind({
      status: 'resolved',
      first_observed_at: '2026-08-31T00:00:00.000Z',
      last_notified_at: '2026-08-31T00:05:00.000Z',
    }, '2026-08-31T01:00:00.000Z', 5, 60)).toBeNull();
  });

  it('keeps immediate alerts and bounded reminders unchanged', () => {
    expect(nextAlertNotificationKind(null, '2026-08-31T00:00:00.000Z', 0, 60))
      .toBe('alert-opened');
    const current = {
      status: 'open' as const,
      first_observed_at: '2026-08-31T00:00:00.000Z',
      last_notified_at: '2026-08-31T00:05:00.000Z',
    };
    expect(nextAlertNotificationKind(
      current,
      '2026-08-31T01:04:59.999Z',
      5,
      60,
    )).toBeNull();
    expect(nextAlertNotificationKind(
      current,
      '2026-08-31T01:05:00.000Z',
      5,
      60,
    )).toBe('alert-reminder');
  });

  it('presents every known alert in Japanese with an action and relevant Cloudflare link', () => {
    const cases = [
      ['sponsor-wallet-unavailable', 'Sponsor Wallet health is unavailable.', '対応必要', '/workers/containers'],
      ['sponsor-wallet-sync-stalled', 'Sponsor Wallet synchronization lag is 321 blocks; disconnected incomplete channels are dust; last state age is 8 minutes.', '対応必要', '/workers/containers'],
      ['sponsor-wallet-low-dust', 'Sponsor Wallet has 0.7 DUST; the latest sponsored TX fee was 0.6 DUST; estimated capacity is 1 transactions.', '対応必要', '/workers/containers'],
      ['proof-backlog-high', 'Proof backlog is 9; oldest wait is 12 minutes.', '要監視', '/workers/queues'],
      ['sponsor-backlog-high', 'Sponsor backlog is 17; oldest wait is 11 minutes.', '要監視', '/workers/queues'],
      ['proof-api-rate-limited', 'Proof APIs returned HTTP 429 6 times in the last 5 minutes.', '要監視', '/observability'],
    ] as const;
    for (const [key, summary, decision, linkFragment] of cases) {
      const presentation = japaneseAlertPresentation(key, summary, false, 'warning');
      expect(presentation.decision).toBe(decision);
      expect(presentation.description).not.toBe(summary);
      expect(presentation.recommendation.length).toBeGreaterThan(10);
      expect(presentation.detailUrl).toContain(linkFragment);
    }
  });

  it('marks a resolved alert as action not required', () => {
    const presentation = japaneseAlertPresentation(
      'sponsor-wallet-sync-stalled',
      'Sponsor Wallet synchronization lag is 0 blocks.',
      true,
      'error',
    );
    expect(presentation).toMatchObject({
      decision: '対応不要',
      description: expect.stringContaining('解消'),
    });
  });

  it('builds a Japanese sponsor receipt with a direct Midnight Explorer link', async () => {
    const transactionHash = 'a'.repeat(64);
    const database = {
      kind: 'd1',
      first: async () => ({
        id: 'proof-job-1',
        project_id: 'project-1',
        device_id: 'device-1',
        period_date: '2026-09-01',
        status: 'confirmed',
        sponsor_fee_specks: '632920000000001',
        sponsor_transaction_id: 'sponsor-tx-1',
        attest_tx_id: 'contract-tx-1',
        attest_tx_hash: transactionHash,
        block_height: '2300000',
        sponsorship_completed_at: '2026-09-02T00:00:00.000Z',
        wallet_key_sha256: 'wallet-fingerprint-1',
      }),
      all: async () => [],
      execute: async () => 0,
      batch: async () => undefined,
    } as unknown as SqlDatabase;
    const embed = await notificationEmbed(database, {
      id: 'notification-1',
      kind: 'sponsor-receipt',
      dedupe_key: 'receipt:proof-job-1',
      alert_key: null,
      resource_type: 'proof-job',
      resource_id: 'proof-job-1',
      attempt_count: 0,
    }, null);
    const serialized = JSON.stringify(embed);
    const explorerUrl = `https://preprod.midnightexplorer.com/transactions/${transactionHash}`;
    expect(embed.title).toBe('Sponsor Wallet 利用レシート');
    expect(embed.url).toBe(explorerUrl);
    expect(embed.fields).toContainEqual(expect.objectContaining({ name: '判断', value: '対応不要' }));
    expect(serialized).toContain(explorerUrl);
    expect(serialized).not.toContain('Sponsored transaction receipt');
    expect(serialized).not.toContain('unavailable');
  });

  it('builds a Japanese operational alert with the prescribed response class', async () => {
    const database = {
      kind: 'd1',
      first: async () => ({
        alert_key: 'proof-backlog-high',
        severity: 'warning',
        status: 'open',
        summary: 'Proof backlog is 9; oldest wait is 12 minutes.',
        first_observed_at: '2026-09-02T00:00:00.000Z',
        last_observed_at: '2026-09-02T00:05:00.000Z',
        last_notified_at: null,
        resolved_at: null,
        occurrence_count: 6,
      }),
      all: async () => [],
      execute: async () => 0,
      batch: async () => undefined,
    } as unknown as SqlDatabase;
    const embed = await notificationEmbed(database, {
      id: 'notification-2',
      kind: 'alert-opened',
      dedupe_key: 'alert:proof-backlog-high',
      alert_key: 'proof-backlog-high',
      resource_type: 'alert',
      resource_id: 'proof-backlog-high',
      attempt_count: 0,
    }, null);
    expect(embed.title).toBe('運用アラート');
    expect(embed.description).toContain('ZKP生成待ち');
    expect(embed.fields).toContainEqual(expect.objectContaining({ name: '判断', value: '要監視' }));
    expect(embed.url).toContain('/workers/queues');
    expect(JSON.stringify(embed)).not.toContain('Proof backlog is');
  });
});
