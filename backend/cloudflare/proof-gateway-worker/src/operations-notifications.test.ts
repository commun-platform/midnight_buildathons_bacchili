import { describe, expect, it } from 'vitest';

import {
  discordNotificationsConfigured,
  nextAlertNotificationKind,
  operationalAlertThresholds,
  sponsorLowDustCondition,
  sponsorSynchronizationUnsynced,
} from './operations-notifications.js';
import type { SponsorWalletOperationsView } from './operations-audit.js';

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
});
