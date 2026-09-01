import {
  sponsorWalletOperationsView,
  type SponsorWalletOperationsView,
} from './operations-audit.js';
import {
  latestSponsorFee,
  sponsorDustFunds,
  type SponsorFeeRecord,
} from './sponsor-dust.js';
import type { SponsorWalletHealth } from './sponsor.js';
import { createSqlDatabase } from './storage/index.js';
import type { SqlDatabase } from './storage/sql.js';

const notificationBatchSize = 8;
const maxNotificationAttempts = 8;

export interface AlertThresholds {
  lowDustTransactions: number;
  syncLagBlocks: number;
  syncUnsyncedMinutes: number;
  proofBacklog: number;
  proofBacklogAgeMinutes: number;
  sponsorBacklog: number;
  sponsorBacklogAgeMinutes: number;
  proofRateLimitEvents: number;
  reminderMinutes: number;
}

interface AlertCondition {
  key: string;
  active: boolean;
  severity: 'warning' | 'error';
  summary: string;
  notificationGraceMinutes?: number;
}

interface AlertStateRow {
  alert_key: string;
  severity: 'warning' | 'error';
  status: 'open' | 'resolved';
  summary: string;
  first_observed_at: string;
  last_observed_at: string;
  last_notified_at: string | null;
  resolved_at: string | null;
  occurrence_count: number;
}

interface NotificationRow {
  id: string;
  kind: 'alert-opened' | 'alert-reminder' | 'alert-resolved' | 'sponsor-receipt';
  dedupe_key: string;
  alert_key: string | null;
  resource_type: string | null;
  resource_id: string | null;
  attempt_count: number;
}

interface ProofBacklogRow {
  proof_backlog: number;
  proof_oldest_at: string | null;
  sponsor_backlog: number;
  sponsor_oldest_at: string | null;
}

interface SponsorReceiptRow {
  id: string;
  project_id: string;
  device_id: string;
  period_date: string;
  status: string;
  sponsor_fee_specks: string | null;
  sponsor_transaction_id: string | null;
  attest_tx_id: string | null;
  attest_tx_hash: string | null;
  block_height: string | null;
  sponsorship_completed_at: string | null;
  wallet_key_sha256: string | null;
}

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  timestamp: string;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  footer: { text: string };
}

function integerSetting(value: string | undefined, fallback: number, minimum: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

export function operationalAlertThresholds(env: Env): AlertThresholds {
  return {
    lowDustTransactions: integerSetting(env.OPERATIONS_ALERT_LOW_DUST_TRANSACTIONS, 1, 0),
    syncLagBlocks: integerSetting(env.OPERATIONS_ALERT_SYNC_LAG_BLOCKS, 250, 1),
    syncUnsyncedMinutes: integerSetting(env.OPERATIONS_ALERT_SYNC_UNSYNCED_MINUTES, 5, 1),
    proofBacklog: integerSetting(env.OPERATIONS_ALERT_PROOF_BACKLOG, 8, 1),
    proofBacklogAgeMinutes: integerSetting(env.OPERATIONS_ALERT_PROOF_BACKLOG_AGE_MINUTES, 10, 1),
    sponsorBacklog: integerSetting(env.OPERATIONS_ALERT_SPONSOR_BACKLOG, 16, 1),
    sponsorBacklogAgeMinutes: integerSetting(env.OPERATIONS_ALERT_SPONSOR_BACKLOG_AGE_MINUTES, 10, 1),
    proofRateLimitEvents: integerSetting(env.OPERATIONS_ALERT_PROOF_RATE_LIMIT_EVENTS, 5, 1),
    reminderMinutes: integerSetting(env.OPERATIONS_ALERT_REMINDER_MINUTES, 60, 15),
  };
}

export function sponsorLowDustCondition(
  view: SponsorWalletOperationsView | null,
  latestFee: SponsorFeeRecord | null,
  thresholdTransactions: number,
): Pick<AlertCondition, 'active' | 'summary'> {
  if (!view) {
    return {
      active: false,
      summary: 'Sponsor Wallet DUST balance is unavailable.',
    };
  }
  const funds = sponsorDustFunds(view.balances.dust, latestFee);
  if (view.phase === 'waiting-for-funding') {
    return {
      active: true,
      summary: funds.remainingDust === null
        ? 'Sponsor Wallet is waiting for spendable DUST funding; the balance is unavailable.'
        : `Sponsor Wallet is waiting for spendable DUST funding; the balance is ${funds.remainingDust} DUST.`,
    };
  }
  if (!funds.latestFee || funds.estimatedTransactionsRemaining === null) {
    return {
      active: false,
      summary: funds.remainingDust === null
        ? 'Sponsor Wallet DUST balance is unavailable.'
        : `Sponsor Wallet has ${funds.remainingDust} DUST; no completed sponsored TX fee is available for capacity estimation.`,
    };
  }
  const estimatedTransactions = BigInt(funds.estimatedTransactionsRemaining);
  return {
    active: estimatedTransactions <= BigInt(thresholdTransactions),
    summary: `Sponsor Wallet has ${funds.remainingDust} DUST; the latest sponsored TX fee was ${funds.latestFee.dust} DUST; estimated capacity is ${funds.estimatedTransactionsRemaining} transactions.`,
  };
}

export function discordNotificationsConfigured(env: Env): boolean {
  return validDiscordWebhook(env.DISCORD_WEBHOOK_URL) !== null;
}

function validDiscordWebhook(value: string | undefined): URL | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const validHost = url.hostname === 'discord.com' || url.hostname === 'discordapp.com';
    return url.protocol === 'https:' && validHost && /^\/api\/webhooks\/[^/]+\/[^/]+$/u.test(url.pathname)
      ? url
      : null;
  } catch {
    return null;
  }
}

function ageMinutes(value: string | null, now: number): number | null {
  const timestamp = Date.parse(value ?? '');
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((now - timestamp) / 60_000)) : null;
}

function maxLag(view: SponsorWalletOperationsView): bigint {
  return view.synchronization.reduce((maximum, channel) => {
    try {
      const lag = BigInt(channel.lag);
      return lag > maximum ? lag : maximum;
    } catch {
      return maximum;
    }
  }, 0n);
}

export function sponsorSynchronizationUnsynced(
  view: SponsorWalletOperationsView,
  thresholds: Pick<AlertThresholds, 'syncLagBlocks'>,
): boolean {
  if (view.phase !== 'syncing') return false;
  const disconnectedIncomplete = view.synchronization.some(
    ({ connected, complete }) => !connected && !complete,
  );
  return maxLag(view) >= BigInt(thresholds.syncLagBlocks) || disconnectedIncomplete;
}

type AlertNotificationKind = 'alert-opened' | 'alert-reminder' | null;

export function nextAlertNotificationKind(
  current: Pick<AlertStateRow, 'status' | 'first_observed_at' | 'last_notified_at'> | null,
  nowIso: string,
  notificationGraceMinutes: number,
  reminderMinutes: number,
): AlertNotificationKind {
  const reopening = !current || current.status === 'resolved';
  if (reopening) return notificationGraceMinutes === 0 ? 'alert-opened' : null;

  const now = Date.parse(nowIso);
  const firstObservedAt = Date.parse(current.first_observed_at);
  if (!current.last_notified_at) {
    return Number.isFinite(now)
      && Number.isFinite(firstObservedAt)
      && now - firstObservedAt >= notificationGraceMinutes * 60_000
      ? 'alert-opened'
      : null;
  }

  const lastNotifiedAt = Date.parse(current.last_notified_at);
  return Number.isFinite(now)
    && Number.isFinite(lastNotifiedAt)
    && now - lastNotifiedAt >= reminderMinutes * 60_000
    ? 'alert-reminder'
    : null;
}

async function backlog(database: SqlDatabase): Promise<ProofBacklogRow> {
  return await database.first<ProofBacklogRow>(
    `SELECT
       SUM(CASE WHEN status IN (
         'pending', 'dispatched', 'ready_for_input', 'proving', 'proof_ready', 'device_bound'
       ) THEN 1 ELSE 0 END) AS proof_backlog,
       MIN(CASE WHEN status IN (
         'pending', 'dispatched', 'ready_for_input', 'proving', 'proof_ready', 'device_bound'
       ) THEN created_at END) AS proof_oldest_at,
       SUM(CASE WHEN status IN (
         'awaiting_sponsor', 'sponsor_retryable', 'sponsoring', 'sponsored'
       ) THEN 1 ELSE 0 END) AS sponsor_backlog,
       MIN(CASE WHEN status IN (
         'awaiting_sponsor', 'sponsor_retryable', 'sponsoring', 'sponsored'
       ) THEN updated_at END) AS sponsor_oldest_at
     FROM daily_proof_jobs`,
  ) ?? { proof_backlog: 0, proof_oldest_at: null, sponsor_backlog: 0, sponsor_oldest_at: null };
}

async function setAlertCondition(
  database: SqlDatabase,
  condition: AlertCondition,
  nowIso: string,
  thresholds: AlertThresholds,
): Promise<void> {
  const current = await database.first<AlertStateRow>(
    'SELECT * FROM operations_alert_state WHERE alert_key = ?1',
    [condition.key],
  );
  if (!condition.active) {
    if (!current || current.status !== 'open') return;
    const statements = [
      {
        sql: `UPDATE operations_alert_state SET status = 'resolved', summary = ?1,
                last_observed_at = ?2, resolved_at = ?2 WHERE alert_key = ?3`,
        parameters: [condition.summary, nowIso, condition.key],
      },
      {
        sql: `UPDATE operations_notification_outbox
              SET status = 'failed', updated_at = ?1,
                  last_error_code = 'alert_resolved_before_delivery'
              WHERE alert_key = ?2
                AND kind IN ('alert-opened', 'alert-reminder')
                AND status IN ('pending', 'retrying')`,
        parameters: [nowIso, condition.key],
      },
    ];
    if (current.last_notified_at) {
      statements.push({
        sql: `INSERT OR IGNORE INTO operations_notification_outbox (
                id, kind, dedupe_key, alert_key, resource_type, resource_id,
                status, available_after, created_at, updated_at
              ) VALUES (?1, 'alert-resolved', ?2, ?3, 'alert', ?3,
                'pending', ?4, ?4, ?4)`,
        parameters: [
          crypto.randomUUID(), `alert-resolved:${condition.key}:${nowIso}`, condition.key, nowIso,
        ],
      });
    }
    await database.batch(statements);
    return;
  }

  const reopening = !current || current.status === 'resolved';
  const notificationGraceMinutes = condition.notificationGraceMinutes ?? 0;
  const notificationKind = nextAlertNotificationKind(
    current,
    nowIso,
    notificationGraceMinutes,
    thresholds.reminderMinutes,
  );
  const firstObservedAt = reopening ? nowIso : current.first_observed_at;
  const bucket = nowIso.slice(0, 13);
  const statements = [{
    sql: `INSERT INTO operations_alert_state (
            alert_key, severity, status, summary, first_observed_at,
            last_observed_at, last_notified_at, resolved_at, occurrence_count
          ) VALUES (?1, ?2, 'open', ?3, ?4, ?5, NULL, NULL, 1)
          ON CONFLICT(alert_key) DO UPDATE SET
            severity = excluded.severity,
            status = 'open',
            summary = excluded.summary,
            first_observed_at = CASE
              WHEN operations_alert_state.status = 'resolved' THEN excluded.first_observed_at
              ELSE operations_alert_state.first_observed_at END,
            last_observed_at = excluded.last_observed_at,
            last_notified_at = CASE
              WHEN operations_alert_state.status = 'resolved' THEN NULL
              ELSE operations_alert_state.last_notified_at END,
            resolved_at = NULL,
            occurrence_count = operations_alert_state.occurrence_count + 1`,
    parameters: [condition.key, condition.severity, condition.summary, firstObservedAt, nowIso],
  }];
  if (notificationKind) {
    statements.push({
      sql: `INSERT OR IGNORE INTO operations_notification_outbox (
              id, kind, dedupe_key, alert_key, resource_type, resource_id,
              status, available_after, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, 'alert', ?4,
              'pending', ?5, ?5, ?5)`,
      parameters: [
        crypto.randomUUID(),
        notificationKind,
        `${notificationKind}:${condition.key}:${notificationKind === 'alert-opened' ? firstObservedAt : bucket}`,
        condition.key,
        nowIso,
      ],
    });
  }
  await database.batch(statements);
}

export async function evaluateOperationalAlerts(
  env: Env,
  health: SponsorWalletHealth | null,
): Promise<void> {
  try {
    const database = createSqlDatabase(env);
    const thresholds = operationalAlertThresholds(env);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const [queueState, rateLimited, latestFee] = await Promise.all([
      backlog(database),
      database.first<{ count: number }>(
        `SELECT COUNT(*) AS count FROM operational_events
         WHERE category = 'api' AND response_status = 429
           AND action IN ('proof.request', 'proof.admit', 'proof.input.check', 'proof.generate')
           AND occurred_at >= ?1`,
        [new Date(now - 5 * 60_000).toISOString()],
      ),
      latestSponsorFee(database),
    ]);
    const view = health ? sponsorWalletOperationsView(health) : null;
    const lag = view ? maxLag(view) : 0n;
    const stateAge = ageMinutes(view?.lastStateAt ?? view?.initializedAt ?? null, now);
    const disconnectedChannels = view?.synchronization
      .filter(({ connected, complete }) => !connected && !complete)
      .map(({ channel }) => channel) ?? [];
    const proofAge = ageMinutes(queueState.proof_oldest_at, now);
    const sponsorAge = ageMinutes(queueState.sponsor_oldest_at, now);
    const rateLimitedCount = Number(rateLimited?.count ?? 0);
    const lowDust = sponsorLowDustCondition(view, latestFee, thresholds.lowDustTransactions);
    const conditions: AlertCondition[] = [
      {
        key: 'sponsor-wallet-unavailable',
        active: !view || view.healthClass === 'unavailable',
        severity: 'error',
        notificationGraceMinutes: thresholds.syncUnsyncedMinutes,
        summary: view
          ? `Sponsor Wallet is ${view.healthClass} in phase ${view.phase}.`
          : 'Sponsor Wallet health is unavailable.',
      },
      {
        key: 'sponsor-wallet-sync-stalled',
        active: view?.healthClass !== 'unavailable'
          && view !== null
          && sponsorSynchronizationUnsynced(view, thresholds),
        severity: 'error',
        notificationGraceMinutes: thresholds.syncUnsyncedMinutes,
        summary: `Sponsor Wallet synchronization lag is ${lag.toString()} blocks; disconnected incomplete channels are ${disconnectedChannels.join(', ') || 'none'}; last state age is ${stateAge ?? 'unknown'} minutes.`,
      },
      {
        key: 'sponsor-wallet-low-dust',
        active: lowDust.active,
        severity: 'warning',
        summary: lowDust.summary,
      },
      {
        key: 'proof-backlog-high',
        active: Number(queueState.proof_backlog ?? 0) >= thresholds.proofBacklog
          && proofAge !== null
          && proofAge >= thresholds.proofBacklogAgeMinutes,
        severity: 'warning',
        summary: `Proof backlog is ${Number(queueState.proof_backlog ?? 0)}; oldest wait is ${proofAge ?? 0} minutes.`,
      },
      {
        key: 'sponsor-backlog-high',
        active: Number(queueState.sponsor_backlog ?? 0) >= thresholds.sponsorBacklog
          && sponsorAge !== null
          && sponsorAge >= thresholds.sponsorBacklogAgeMinutes,
        severity: 'warning',
        summary: `Sponsor backlog is ${Number(queueState.sponsor_backlog ?? 0)}; oldest wait is ${sponsorAge ?? 0} minutes.`,
      },
      {
        key: 'proof-api-rate-limited',
        active: rateLimitedCount >= thresholds.proofRateLimitEvents,
        severity: 'warning',
        summary: `Proof APIs returned HTTP 429 ${rateLimitedCount} times in the last 5 minutes.`,
      },
    ];
    for (const condition of conditions) {
      await setAlertCondition(database, condition, nowIso, thresholds);
    }
  } catch (error) {
    console.error(JSON.stringify({
      message: 'operations_alert_evaluation_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }));
  }
}

function short(value: string | null, length = 18): string {
  if (!value) return '—';
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}

function discordField(name: string, value: unknown, inline = true) {
  const text = String(value ?? '—').slice(0, 1024);
  return { name, value: text || '—', inline };
}

async function notificationEmbed(
  database: SqlDatabase,
  notification: NotificationRow,
  health: SponsorWalletHealth | null,
): Promise<DiscordEmbed> {
  const timestamp = new Date().toISOString();
  if (notification.kind === 'sponsor-receipt') {
    const receipt = await database.first<SponsorReceiptRow>(
      `SELECT j.id, j.project_id, j.device_id, j.period_date, j.status,
              j.sponsor_fee_specks, j.sponsor_transaction_id, j.attest_tx_id,
              j.attest_tx_hash, j.block_height, j.sponsorship_completed_at,
              w.wallet_key_sha256
       FROM daily_proof_jobs j
       LEFT JOIN browser_wallet_devices w
         ON w.device_id = j.device_id AND w.project_id = j.project_id
       WHERE j.id = ?1`,
      [notification.resource_id],
    );
    if (!receipt) throw new Error('Sponsor receipt Proof Job was not found');
    const wallet = health ? sponsorWalletOperationsView(health) : null;
    const funds = sponsorDustFunds(wallet?.balances.dust, receipt.sponsor_fee_specks
      ? {
          proofJobId: receipt.id,
          specks: receipt.sponsor_fee_specks,
          recordedAt: receipt.sponsorship_completed_at ?? timestamp,
        }
      : null);
    return {
      title: 'Sponsored transaction receipt',
      description: 'The Sponsor Wallet added DUST and submitted an authorized Device transaction.',
      color: 0x2e8b57,
      timestamp: receipt.sponsorship_completed_at ?? timestamp,
      fields: [
        discordField('Proof Job', short(receipt.id, 28), false),
        discordField('Project', short(receipt.project_id, 28)),
        discordField('Device', short(receipt.device_id, 28)),
        discordField('Wallet fingerprint', short(receipt.wallet_key_sha256, 20)),
        discordField('Measurement day', receipt.period_date),
        discordField('Status', receipt.status),
        discordField('Fee (DUST)', funds.latestFee ? `${funds.latestFee.dust} DUST` : 'unavailable'),
        discordField('Fee (specks)', funds.latestFee?.specks ?? 'unavailable'),
        discordField('Remaining DUST', funds.remainingDust ? `${funds.remainingDust} DUST` : 'unavailable'),
        discordField('Estimated TX capacity', funds.estimatedTransactionsRemaining ?? 'unavailable'),
        discordField('Spendable DUST UTXOs', wallet?.balances.spendableDustCoins ?? 'unavailable'),
        discordField('Wallet phase', wallet?.phase ?? 'unavailable'),
        discordField('Synchronization lag', wallet ? maxLag(wallet).toString() : 'unavailable'),
        discordField('Midnight TX', short(receipt.attest_tx_id, 32), false),
        discordField('Block', receipt.block_height),
      ],
      footer: { text: `BACCHIRI operations · ${notification.id}` },
    };
  }

  const alert = await database.first<AlertStateRow>(
    'SELECT * FROM operations_alert_state WHERE alert_key = ?1',
    [notification.alert_key],
  );
  if (!alert) throw new Error('Notification alert state was not found');
  const resolved = notification.kind === 'alert-resolved';
  return {
    title: resolved ? 'Operational alert resolved' : 'Operational alert',
    description: alert.summary,
    color: resolved ? 0x2e8b57 : alert.severity === 'error' ? 0xc0392b : 0xf39c12,
    timestamp,
    fields: [
      discordField('Alert', alert.alert_key, false),
      discordField('State', resolved ? 'resolved' : 'open'),
      discordField('Severity', alert.severity),
      discordField('First observed', alert.first_observed_at, false),
      discordField('Last observed', alert.last_observed_at, false),
      discordField('Occurrences', alert.occurrence_count),
    ],
    footer: { text: `BACCHIRI operations · ${notification.id}` },
  };
}

async function sendDiscord(env: Env, embed: DiscordEmbed): Promise<void> {
  const webhook = validDiscordWebhook(env.DISCORD_WEBHOOK_URL);
  if (!webhook) throw new Error('discord_webhook_not_configured');
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'BACCHIRI Operations',
      allowed_mentions: { parse: [] },
      embeds: [embed],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`discord_http_${response.status}`);
  }
  await response.body?.cancel();
}

function notificationErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/^discord_[a-z0-9_]+$/u.test(message)) return message;
  if (message.toLowerCase().includes('timeout')) return 'discord_timeout';
  return 'discord_delivery_failed';
}

export async function dispatchOperationsNotifications(
  env: Env,
  health: SponsorWalletHealth | null,
): Promise<void> {
  if (!discordNotificationsConfigured(env)) return;
  const database = createSqlDatabase(env);
  const now = new Date().toISOString();
  await database.execute(
    `DELETE FROM operations_notification_outbox
     WHERE status IN ('sent', 'failed') AND updated_at < ?1`,
    [new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()],
  );
  await database.execute(
    `UPDATE operations_notification_outbox
     SET status = 'retrying', available_after = ?1, updated_at = ?1,
         last_error_code = 'delivery_lease_expired'
     WHERE status = 'sending' AND updated_at < ?2`,
    [now, new Date(Date.now() - 10 * 60_000).toISOString()],
  );
  const notifications = await database.all<NotificationRow>(
    `SELECT id, kind, dedupe_key, alert_key, resource_type, resource_id, attempt_count
     FROM operations_notification_outbox
     WHERE status IN ('pending', 'retrying') AND available_after <= ?1
     ORDER BY created_at ASC LIMIT ?2`,
    [now, notificationBatchSize],
  );
  for (const notification of notifications) {
    const claimed = await database.execute(
      `UPDATE operations_notification_outbox
       SET status = 'sending', attempt_count = attempt_count + 1, updated_at = ?1
       WHERE id = ?2 AND status IN ('pending', 'retrying')`,
      [now, notification.id],
    );
    if (claimed < 1) continue;
    try {
      await sendDiscord(env, await notificationEmbed(database, notification, health));
      const sentAt = new Date().toISOString();
      const statements = [{
        sql: `UPDATE operations_notification_outbox
              SET status = 'sent', sent_at = ?1, updated_at = ?1, last_error_code = NULL
              WHERE id = ?2 AND status = 'sending'`,
        parameters: [sentAt, notification.id],
      }];
      if (notification.alert_key) {
        statements.push({
          sql: `UPDATE operations_alert_state SET last_notified_at = ?1
                WHERE alert_key = ?2`,
          parameters: [sentAt, notification.alert_key],
        });
      }
      await database.batch(statements);
      console.log(JSON.stringify({
        message: 'operations_discord_notification_sent',
        notificationId: notification.id,
        kind: notification.kind,
        resourceId: notification.resource_id,
      }));
    } catch (error) {
      const attempts = notification.attempt_count + 1;
      const terminal = attempts >= maxNotificationAttempts;
      const delayMinutes = Math.min(360, 2 ** Math.min(attempts, 8));
      await database.execute(
        `UPDATE operations_notification_outbox
         SET status = ?1, available_after = ?2, updated_at = ?3, last_error_code = ?4
         WHERE id = ?5 AND status = 'sending'`,
        [
          terminal ? 'failed' : 'retrying',
          new Date(Date.now() + delayMinutes * 60_000).toISOString(),
          new Date().toISOString(),
          notificationErrorCode(error),
          notification.id,
        ],
      );
      console.error(JSON.stringify({
        message: 'operations_discord_notification_failed',
        notificationId: notification.id,
        kind: notification.kind,
        attempt: attempts,
        errorCode: notificationErrorCode(error),
      }));
    }
  }
}
