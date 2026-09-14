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
  walletNotificationGraceMinutes: number;
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
  url?: string;
  color: number;
  timestamp: string;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  footer: { text: string };
}

type AdministratorDecision = '対応不要' | '要監視' | '対応必要';

interface JapaneseAlertPresentation {
  decision: AdministratorDecision;
  description: string;
  recommendation: string;
  detailLabel: string;
  detailUrl: string;
}

const cloudflareWorkersUrl = 'https://dash.cloudflare.com/?to=/:account/workers-and-pages';
const cloudflareObservabilityUrl = 'https://dash.cloudflare.com/?to=/:account/workers-and-pages/observability';
const cloudflareQueuesUrl = 'https://dash.cloudflare.com/?to=/:account/workers/queues';
const cloudflareContainersUrl = 'https://dash.cloudflare.com/?to=/:account/workers/containers';
const midnightExplorerTransactionUrl = 'https://preprod.midnightexplorer.com/transactions/';

function integerSetting(value: string | undefined, fallback: number, minimum: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

export function operationalAlertThresholds(env: Env): AlertThresholds {
  return {
    lowDustTransactions: integerSetting(env.OPERATIONS_ALERT_LOW_DUST_TRANSACTIONS, 1, 0),
    syncLagBlocks: integerSetting(env.OPERATIONS_ALERT_SYNC_LAG_BLOCKS, 250, 1),
    walletNotificationGraceMinutes: integerSetting(
      env.OPERATIONS_ALERT_WALLET_GRACE_MINUTES,
      5,
      1,
    ),
    proofBacklog: integerSetting(env.OPERATIONS_ALERT_PROOF_BACKLOG, 8, 1),
    proofBacklogAgeMinutes: integerSetting(env.OPERATIONS_ALERT_PROOF_BACKLOG_AGE_MINUTES, 10, 1),
    sponsorBacklog: integerSetting(env.OPERATIONS_ALERT_SPONSOR_BACKLOG, 16, 1),
    sponsorBacklogAgeMinutes: integerSetting(env.OPERATIONS_ALERT_SPONSOR_BACKLOG_AGE_MINUTES, 10, 1),
    proofRateLimitEvents: integerSetting(env.OPERATIONS_ALERT_PROOF_RATE_LIMIT_EVENTS, 5, 1),
    reminderMinutes: integerSetting(env.OPERATIONS_ALERT_REMINDER_MINUTES, 60, 15),
  };
}

const walletAlertKeys = new Set([
  'sponsor-wallet-unavailable',
  'sponsor-wallet-low-dust',
]);
const intermittentWalletAlertKeys = new Set([
  'sponsor-wallet-unavailable',
  'sponsor-wallet-sync-stalled',
  'sponsor-wallet-low-dust',
]);

export function operationalAlertNotificationGraceMinutes(
  alertKey: string,
  thresholds: Pick<AlertThresholds, 'walletNotificationGraceMinutes'>,
): number {
  return walletAlertKeys.has(alertKey) ? thresholds.walletNotificationGraceMinutes : 0;
}

export function shouldNotifyAlertResolution(
  alertKey: string,
  sponsorScheduledOffline: boolean,
): boolean {
  return !sponsorScheduledOffline || !intermittentWalletAlertKeys.has(alertKey);
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
  if (!['ready', 'waiting-for-funding'].includes(view.phase)) {
    return {
      active: false,
      summary: `Sponsor Wallet DUST capacity is not evaluated during phase ${view.phase}.`,
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

export function sponsorSynchronizationStalled(
  view: SponsorWalletOperationsView,
  thresholds: Pick<AlertThresholds, 'syncLagBlocks' | 'walletNotificationGraceMinutes'>,
  unchangedMinutes: number | null,
): boolean {
  return unchangedMinutes !== null
    && unchangedMinutes >= thresholds.walletNotificationGraceMinutes
    && sponsorSynchronizationUnsynced(view, thresholds);
}

export function sponsorWalletUnavailableCondition(
  view: SponsorWalletOperationsView | null,
): boolean {
  if (!view) return true;
  if (view.healthClass !== 'unavailable') return false;
  const expectedStartup = ['starting', 'syncing'].includes(view.phase)
    && view.initialization?.status !== 'failed'
    && view.errorCode === null;
  return !expectedStartup;
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
  notifyResolution: boolean,
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
    if (current.last_notified_at && notifyResolution) {
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
            occurrence_count = CASE
              WHEN operations_alert_state.status = 'resolved' THEN 1
              ELSE operations_alert_state.occurrence_count + 1 END`,
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
  options: {
    sponsorScheduledOffline?: boolean;
    sponsorScheduleUnavailable?: boolean;
  } = {},
): Promise<void> {
  try {
    const database = createSqlDatabase(env);
    const thresholds = operationalAlertThresholds(env);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const [queueState, rateLimited, latestFee, walletComponentState] = await Promise.all([
      backlog(database),
      database.first<{ count: number }>(
        `SELECT COUNT(*) AS count FROM operational_events
         WHERE category = 'api' AND response_status = 429
           AND action IN ('proof.request', 'proof.admit', 'proof.input.check', 'proof.generate')
           AND occurred_at >= ?1`,
        [new Date(now - 5 * 60_000).toISOString()],
      ),
      latestSponsorFee(database),
      database.first<{ last_changed_at: string }>(
        `SELECT last_changed_at FROM system_component_state
         WHERE component = 'sponsor-wallet'`,
      ),
    ]);
    const view = health ? sponsorWalletOperationsView(health) : null;
    const lag = view ? maxLag(view) : 0n;
    const stateAge = ageMinutes(
      walletComponentState?.last_changed_at
        ?? view?.lastStateAt
        ?? view?.initialization?.startedAt
        ?? null,
      now,
    );
    const disconnectedChannels = view?.synchronization
      .filter(({ connected, complete }) => !connected && !complete)
      .map(({ channel }) => channel) ?? [];
    const proofAge = ageMinutes(queueState.proof_oldest_at, now);
    const sponsorAge = ageMinutes(queueState.sponsor_oldest_at, now);
    const rateLimitedCount = Number(rateLimited?.count ?? 0);
    const lowDust = sponsorLowDustCondition(view, latestFee, thresholds.lowDustTransactions);
    const sponsorScheduledOffline = options.sponsorScheduledOffline === true;
    const conditions: AlertCondition[] = [
      {
        key: 'sponsor-wallet-schedule-unavailable',
        active: options.sponsorScheduleUnavailable === true,
        severity: 'error',
        summary: 'Sponsor Wallet operating schedule could not be read; wallet execution failed closed.',
      },
      {
        key: 'sponsor-wallet-unavailable',
        active: !sponsorScheduledOffline && sponsorWalletUnavailableCondition(view),
        severity: 'error',
        notificationGraceMinutes: operationalAlertNotificationGraceMinutes(
          'sponsor-wallet-unavailable',
          thresholds,
        ),
        summary: view
          ? `Sponsor Wallet is ${view.healthClass} in phase ${view.phase}.`
          : 'Sponsor Wallet health is unavailable.',
      },
      {
        key: 'sponsor-wallet-sync-stalled',
        active: !sponsorScheduledOffline
          && view !== null
          && sponsorSynchronizationStalled(view, thresholds, stateAge),
        severity: 'error',
        summary: `Sponsor Wallet synchronization lag is ${lag.toString()} blocks; disconnected incomplete channels are ${disconnectedChannels.join(', ') || 'none'}; last state age is ${stateAge ?? 'unknown'} minutes.`,
      },
      {
        key: 'sponsor-wallet-low-dust',
        active: !sponsorScheduledOffline && lowDust.active,
        severity: 'warning',
        notificationGraceMinutes: operationalAlertNotificationGraceMinutes(
          'sponsor-wallet-low-dust',
          thresholds,
        ),
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
        active: !sponsorScheduledOffline
          && Number(queueState.sponsor_backlog ?? 0) >= thresholds.sponsorBacklog
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
      await setAlertCondition(
        database,
        condition,
        nowIso,
        thresholds,
        shouldNotifyAlertResolution(condition.key, sponsorScheduledOffline),
      );
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

function captured(summary: string, pattern: RegExp, fallback = '不明'): string {
  return pattern.exec(summary)?.[1] ?? fallback;
}

function localizedStatus(status: string): string {
  return ({
    confirmed: '確定済み',
    submitted: '送信済み',
    failed: '失敗',
  } as Record<string, string>)[status] ?? status;
}

function localizedWalletPhase(phase: string | undefined): string {
  if (!phase) return '取得不可';
  return ({
    ready: '準備完了',
    syncing: '同期中',
    'waiting-for-funding': '入金待ち',
    unavailable: '取得不可',
  } as Record<string, string>)[phase] ?? phase;
}

function resolvedAlertDetail(alertKey: string): Pick<
  JapaneseAlertPresentation,
  'description' | 'detailLabel' | 'detailUrl'
> {
  if (alertKey.startsWith('queue-dead-letter:')) {
    return {
      description: 'Queueの要対応メッセージは解決済みになりました。',
      detailLabel: 'Cloudflare Queuesで現在の状態を確認',
      detailUrl: cloudflareQueuesUrl,
    };
  }
  switch (alertKey) {
    case 'sponsor-wallet-schedule-unavailable':
      return {
        description: 'Sponsor Walletの営業時間設定を再び取得できるようになりました。',
        detailLabel: 'Cloudflare Workersで現在の状態を確認',
        detailUrl: cloudflareWorkersUrl,
      };
    case 'sponsor-wallet-unavailable':
      return {
        description: 'Sponsor Walletの状態取得は復旧しました。',
        detailLabel: 'Cloudflare Containersで現在の状態を確認',
        detailUrl: cloudflareContainersUrl,
      };
    case 'sponsor-wallet-sync-stalled':
      return {
        description: 'Sponsor Walletの同期停滞は解消しました。',
        detailLabel: 'Cloudflare Containersで現在の状態を確認',
        detailUrl: cloudflareContainersUrl,
      };
    case 'sponsor-wallet-low-dust':
      return {
        description: 'Sponsor WalletのDUST残高不足は解消しました。',
        detailLabel: 'CloudflareでWallet運用状態を確認',
        detailUrl: cloudflareContainersUrl,
      };
    case 'proof-backlog-high':
      return {
        description: 'ZKP生成ジョブの滞留は解消しました。',
        detailLabel: 'Cloudflare Queuesで現在の状態を確認',
        detailUrl: cloudflareQueuesUrl,
      };
    case 'sponsor-backlog-high':
      return {
        description: 'Sponsor送信ジョブの滞留は解消しました。',
        detailLabel: 'Cloudflare Queuesで現在の状態を確認',
        detailUrl: cloudflareQueuesUrl,
      };
    case 'proof-api-rate-limited':
      return {
        description: 'Proof APIのレート制限多発は解消しました。',
        detailLabel: 'Cloudflare Observabilityで現在の状態を確認',
        detailUrl: cloudflareObservabilityUrl,
      };
    default:
      return {
        description: `「${alertKey}」は解消しました。`,
        detailLabel: 'Cloudflareで現在の状態を確認',
        detailUrl: cloudflareWorkersUrl,
      };
  }
}

export function japaneseAlertPresentation(
  alertKey: string,
  summary: string,
  resolved: boolean,
  severity: 'warning' | 'error',
): JapaneseAlertPresentation {
  if (resolved) {
    const detail = resolvedAlertDetail(alertKey);
    return {
      decision: '対応不要',
      description: detail.description,
      recommendation: '自動復旧を確認済みです。再発した場合のみ詳細を確認してください。',
      detailLabel: detail.detailLabel,
      detailUrl: detail.detailUrl,
    };
  }

  if (alertKey.startsWith('queue-dead-letter:')) {
    return {
      decision: '対応必要',
      description: 'Queueの自動再試行を使い切ったメッセージがあります。対象Jobは要対応状態へ移されました。',
      recommendation: 'Queueと運用ログで原因を確認し、原因を解消してから対象Jobを再投入してください。',
      detailLabel: 'Cloudflare Queuesを確認',
      detailUrl: cloudflareQueuesUrl,
    };
  }

  switch (alertKey) {
    case 'sponsor-wallet-schedule-unavailable':
      return {
        decision: '対応必要',
        description: 'Sponsor Walletの営業時間設定を取得できないため、安全側に停止しました。',
        recommendation: 'D1とMigrationの状態を確認してください。設定を取得できるまでSponsor処理はQueueで待機します。',
        detailLabel: 'Cloudflare Workersを確認',
        detailUrl: cloudflareWorkersUrl,
      };
    case 'sponsor-wallet-unavailable':
      return {
        decision: '対応必要',
        description: 'Sponsor Walletの稼働状態を取得できません。',
        recommendation: 'コンテナの稼働状態と直近ログを確認し、Sponsor待ちジョブが滞留していないか確認してください。',
        detailLabel: 'Cloudflare Containersを確認',
        detailUrl: cloudflareContainersUrl,
      };
    case 'sponsor-wallet-sync-stalled': {
      const lag = captured(summary, /lag is ([0-9]+) blocks/u);
      const channels = captured(summary, /channels are ([^;]+);/u, 'なし');
      const age = captured(summary, /state age is ([^ ]+) minutes/u);
      return {
        decision: '対応必要',
        description: `Sponsor Walletの同期が停滞しています（最大遅延: ${lag}ブロック、未接続チャネル: ${channels}、最終更新: ${age}分前）。`,
        recommendation: 'コンテナのCPU・メモリ・再起動履歴とWallet同期ログを確認してください。',
        detailLabel: 'Cloudflare Containersを確認',
        detailUrl: cloudflareContainersUrl,
      };
    }
    case 'sponsor-wallet-low-dust': {
      const balance = captured(summary, /(?:balance is|has) ([0-9.]+) DUST/u);
      const capacity = captured(summary, /capacity is ([0-9]+) transactions/u);
      return {
        decision: '対応必要',
        description: `Sponsor WalletのDUST残高が運用しきい値以下です（残高: ${balance} DUST、推定残り送信: ${capacity}件）。`,
        recommendation: 'Sponsor Walletの残高を確認し、必要なDUSTを補充してください。',
        detailLabel: 'CloudflareのWallet運用状態を確認',
        detailUrl: cloudflareContainersUrl,
      };
    }
    case 'proof-backlog-high': {
      const count = captured(summary, /backlog is ([0-9]+)/u);
      const age = captured(summary, /oldest wait is ([0-9]+) minutes/u);
      return {
        decision: '要監視',
        description: `ZKP生成待ちが増えています（${count}ジョブ、最長待機: ${age}分）。`,
        recommendation: 'Queueの消化数とProof Serverの処理状態を監視し、増加が続く場合は処理能力を見直してください。',
        detailLabel: 'Cloudflare Queuesを確認',
        detailUrl: cloudflareQueuesUrl,
      };
    }
    case 'sponsor-backlog-high': {
      const count = captured(summary, /backlog is ([0-9]+)/u);
      const age = captured(summary, /oldest wait is ([0-9]+) minutes/u);
      return {
        decision: '要監視',
        description: `Sponsor送信待ちが増えています（${count}ジョブ、最長待機: ${age}分）。`,
        recommendation: 'QueueとSponsor Walletの同期状態を確認し、滞留が続く場合はWallet側の原因を調査してください。',
        detailLabel: 'Cloudflare Queuesを確認',
        detailUrl: cloudflareQueuesUrl,
      };
    }
    case 'proof-api-rate-limited': {
      const count = captured(summary, /HTTP 429 ([0-9]+) times/u);
      return {
        decision: '要監視',
        description: `直近5分間にProof APIでレート制限が${count}回発生しました。`,
        recommendation: 'リクエスト元と発生頻度を確認し、継続する場合は制限値または送信間隔を見直してください。',
        detailLabel: 'Cloudflare Observabilityを確認',
        detailUrl: cloudflareObservabilityUrl,
      };
    }
    default:
      return {
        decision: severity === 'error' ? '対応必要' : '要監視',
        description: `運用監視で「${alertKey}」を検出しました。`,
        recommendation: '運用ログと関連コンポーネントの状態を確認してください。',
        detailLabel: 'Cloudflare Observabilityを確認',
        detailUrl: cloudflareObservabilityUrl,
      };
  }
}

function explorerUrl(transactionHash: string | null): string | null {
  return transactionHash && /^[0-9a-f]{64}$/u.test(transactionHash)
    ? `${midnightExplorerTransactionUrl}${transactionHash}`
    : null;
}

export async function notificationEmbed(
  database: SqlDatabase,
  notification: NotificationRow,
  health: SponsorWalletHealth | null,
  verificationPortalUrl: string,
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
    const transactionUrl = explorerUrl(receipt.attest_tx_hash);
    const verificationUrl = new URL(
      `/#/verify/${encodeURIComponent(receipt.id)}`,
      verificationPortalUrl,
    ).href;
    return {
      title: 'Sponsor Wallet 利用レシート',
      description: '認可済みのデバイス取引にDUST手数料を付与し、Midnightへ送信しました。',
      ...(transactionUrl ? { url: transactionUrl } : {}),
      color: 0x2e8b57,
      timestamp: receipt.sponsorship_completed_at ?? timestamp,
      fields: [
        discordField('判断', '対応不要'),
        discordField('推奨対応', '通常の送信完了通知です。Verify URLから検証結果を確認できます。', false),
        discordField('Verify URL', `[検証ページを開く](${verificationUrl})`, false),
        discordField('プロジェクト', short(receipt.project_id, 28)),
        discordField('デバイス', short(receipt.device_id, 28)),
        discordField('Wallet識別子', short(receipt.wallet_key_sha256, 20)),
        discordField('対象日', receipt.period_date),
        discordField('状態', localizedStatus(receipt.status)),
        discordField('Proof Job', short(receipt.id, 28), false),
        discordField('手数料', funds.latestFee ? `${funds.latestFee.dust} DUST` : '取得不可'),
        discordField('残DUST', funds.remainingDust ? `${funds.remainingDust} DUST` : '取得不可'),
        discordField('推定残り送信', funds.estimatedTransactionsRemaining === null
          ? '取得不可'
          : `${funds.estimatedTransactionsRemaining}件`),
        discordField('Wallet状態', localizedWalletPhase(wallet?.phase)),
        discordField('同期遅延', wallet ? `${maxLag(wallet).toString()} Block` : '取得不可'),
        discordField('Midnight TX', short(receipt.attest_tx_hash ?? receipt.attest_tx_id, 32), false),
        discordField('ブロック', receipt.block_height),
        discordField('詳細', transactionUrl
          ? `[Midnight Explorerで確認](${transactionUrl})`
          : 'Transaction Hashの確定後にExplorerリンクを表示します。', false),
      ],
      footer: { text: `BACCHIRI システム運用 · ${notification.id}` },
    };
  }

  const alert = await database.first<AlertStateRow>(
    'SELECT * FROM operations_alert_state WHERE alert_key = ?1',
    [notification.alert_key],
  );
  if (!alert) throw new Error('Notification alert state was not found');
  const resolved = notification.kind === 'alert-resolved';
  const presentation = japaneseAlertPresentation(
    alert.alert_key,
    alert.summary,
    resolved,
    alert.severity,
  );
  return {
    title: resolved
      ? '運用アラート解消'
      : notification.kind === 'alert-reminder'
        ? '運用アラート（継続中）'
        : '運用アラート',
    description: presentation.description,
    url: presentation.detailUrl,
    color: resolved ? 0x2e8b57 : alert.severity === 'error' ? 0xc0392b : 0xf39c12,
    timestamp,
    fields: [
      discordField('判断', presentation.decision),
      discordField('重要度', resolved ? '解消' : alert.severity === 'error' ? '障害' : '警告'),
      discordField('アラート識別子', alert.alert_key, false),
      discordField('推奨対応', presentation.recommendation, false),
      discordField('初回検知', alert.first_observed_at, false),
      discordField('最終検知', alert.last_observed_at, false),
      discordField('検知回数', `${alert.occurrence_count}回`),
      discordField('詳細', `[${presentation.detailLabel}](${presentation.detailUrl})`, false),
    ],
    footer: { text: `BACCHIRI システム運用 · ${notification.id}` },
  };
}

async function sendDiscord(env: Env, embed: DiscordEmbed): Promise<void> {
  const webhook = validDiscordWebhook(env.DISCORD_WEBHOOK_URL);
  if (!webhook) throw new Error('discord_webhook_not_configured');
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'BACCHIRI 運用通知',
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
      await sendDiscord(env, await notificationEmbed(
        database,
        notification,
        health,
        env.PUBLIC_VERIFICATION_PORTAL_URL,
      ));
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
