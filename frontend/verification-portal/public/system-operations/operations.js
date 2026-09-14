import { demo, mountDemoBanner } from '../demo-mode.js';
mountDemoBanner(demo);

const state = {
  overview: null,
  metrics: null,
  events: [],
  nextCursor: null,
  overviewTimer: null,
};

const $ = (selector) => document.querySelector(selector);
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const colors = {
  devicesRegistered: '#7353ba',
  proofJobsAccepted: '#3273dc',
  proofsGenerated: '#008a8a',
  sponsoredTransactions: '#168244',
  terminalFailures: '#c02636',
};
const metricLabels = {
  devicesRegistered: 'Midnight登録Device',
  proofJobsAccepted: 'Proof受付',
  proofsGenerated: 'ZKP生成',
  sponsoredTransactions: 'Sponsored TX',
  terminalFailures: '要対応Job',
};
const phaseLabels = {
  starting: 'STARTING（起動中）',
  syncing: 'SYNCING（同期中）',
  'waiting-for-funding': 'WAITING（DUST入金待ち）',
  'registering-dust': 'REGISTERING（DUST登録中）',
  ready: 'READY（送信可能）',
  error: 'ERROR（利用不可）',
};
const healthLabels = {
  healthy: '正常',
  degraded: '要確認',
  unavailable: '利用不可',
};
const sponsorReasonLabels = {
  sponsor_queue_waiting: 'Sponsor Queueで順番待ち',
  sponsor_wallet_checking: 'Wallet同期状態・DUST残高を確認中',
  sponsor_wallet_starting: 'Sponsor Wallet起動待ち',
  sponsor_wallet_syncing: 'Sponsor Wallet同期完了待ち',
  sponsor_wallet_waiting_for_funding: 'DUST入金待ち',
  sponsor_wallet_no_spendable_dust: '使用可能なDUSTなし',
  sponsor_wallet_registering_dust: 'DUST登録処理中',
  sponsor_checkpoint_persisting: 'DUST使用前のWallet状態を保存中',
  sponsor_recovery_checkpoint_preserving: '障害復旧用Checkpointを保存中',
  sponsor_dust_balancing_and_proving: 'DUST付与・手数料用ZK証明を生成中',
  sponsor_transaction_ready_for_submission: 'DUST付与済みTXの送信待ち',
  sponsor_submitting_to_midnight: 'MidnightへTX送信・確定待ち',
  sponsor_transaction_submitted_waiting_for_confirmation: '送信済みTXの確定待ち',
  sponsor_queue_wall_time_exceeded_waiting_for_safe_retry: 'Queueの15分上限で中断。安全な再試行時刻を待機',
  sponsor_worker_interrupted: '前回処理が中断したため自動再試行待ち',
  sponsor_checkpoint_timed_out: 'Wallet状態の保存が60秒でタイムアウト',
  sponsor_checkpoint_failed: 'Wallet状態の保存に失敗',
  sponsor_recovery_checkpoint_timed_out: '復旧用Checkpointの保存が60秒でタイムアウト',
  sponsor_recovery_checkpoint_failed: '復旧用Checkpointの保存に失敗',
  sponsor_checkpoint_worker_interrupted: 'Checkpoint保存中のWorker中断を検出し、自動再試行待ち',
  sponsor_pre_dust_worker_interrupted: 'DUST使用前のWorker中断を検出し、安全な自動再試行待ち',
  sponsor_prepare_failed: 'DUST付与処理に失敗して自動再試行待ち',
  sponsor_processing_failed: 'スポンサー処理に失敗して自動再試行待ち',
  sponsor_wallet_not_ready: 'Sponsor Wallet準備未完了',
};

function apiHeaders() {
  return local ? { 'X-System-Operations-Local': 'dashboard' } : {};
}

async function api(path) {
  if (demo) return demo.api(path);
  const response = await fetch(path, {
    headers: apiHeaders(),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error || `HTTP ${response.status}`);
  }
  return response.json();
}

function text(value, fallback = '—') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function number(value) {
  if (value === null || value === undefined || value === '') return '—';
  try {
    if (typeof value === 'bigint') return new Intl.NumberFormat('ja-JP').format(value);
    if (typeof value === 'string' && /^-?\d+$/u.test(value)) {
      return new Intl.NumberFormat('ja-JP').format(BigInt(value));
    }
  } catch {
    return text(value);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat('ja-JP').format(parsed) : text(value);
}

function phase(value) {
  return phaseLabels[value] ?? text(value, 'UNAVAILABLE').toUpperCase();
}

function health(value) {
  return healthLabels[value] ?? text(value);
}

function dust(value) {
  return value === null || value === undefined ? '—' : `${value} DUST`;
}

function processState(value) {
  return value === true ? '稼働中' : value === false ? '停止' : '取得不可';
}

function time(value) {
  const date = new Date(value ?? '');
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'medium' }).format(date)
    : '—';
}

function wallClock(minute) {
  if (!Number.isInteger(minute) || minute < 0 || minute >= 1440) return '—';
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function utcOffset(minutes) {
  if (!Number.isInteger(minutes)) return '—';
  const sign = minutes >= 0 ? '+' : '-';
  const absolute = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function elapsed(seconds) {
  if (!Number.isFinite(Number(seconds))) return '—';
  const total = Math.max(0, Number(seconds));
  if (total < 60) return `${Math.floor(total)}秒`;
  if (total < 3600) return `${Math.floor(total / 60)}分${Math.floor(total % 60)}秒`;
  return `${Math.floor(total / 3600)}時間${Math.floor((total % 3600) / 60)}分`;
}

function short(value, length = 22) {
  const normalized = text(value);
  return normalized.length <= length ? normalized : `${normalized.slice(0, length)}…`;
}

function node(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function badge(healthClass, label = healthClass) {
  return node('span', `badge ${healthClass}`, label);
}

function setMessage(message, kind = 'ready') {
  const element = $('#global-message');
  element.className = `global-message ${kind}`;
  element.replaceChildren();
  if (kind === 'loading') element.append(node('span', 'spinner'));
  element.append(document.createTextNode(message));
}

function summaryCard(label, value, detail, healthClass = '') {
  const card = node('article', `summary-card ${healthClass}`);
  card.append(node('p', 'card-label', label), node('strong', '', value), node('small', '', detail));
  return card;
}

function renderSummary(data) {
  const wallet = data.components.sponsorWallet;
  const scheduledOffline = wallet.source === 'waiting-for-processing-start';
  const funds = wallet.funds;
  const capacity = funds?.estimatedTransactionsRemaining === null
    || funds?.estimatedTransactionsRemaining === undefined
    ? '送信可能回数は未算出'
    : `推定残り ${number(funds.estimatedTransactionsRemaining)} TX`;
  const container = $('#summary-cards');
  container.replaceChildren(
    summaryCard('総合状態', health(data.overall.healthClass), `${data.overall.openAlerts}件の未解決アラート`, data.overall.healthClass),
    summaryCard(
      'Sponsor Wallet',
      scheduledOffline ? '次回処理待ち' : phase(wallet.state?.phase),
      scheduledOffline ? `次回処理開始: ${time(wallet.operatingWindow?.nextProcessingStartsAt)}` : `${dust(funds?.remainingDust)} / ${capacity}`,
      wallet.healthClass,
    ),
    summaryCard('Proof処理待ち', number(data.processing.proofBacklog), `最古の待機開始: ${time(data.processing.proofOldestAt)}`, data.components.proofServer.healthClass),
    summaryCard('直近24時間の運用エラー', number(data.overall.failures24h), `現在の要対応Proof Job: ${number(data.processing.terminalFailures)}`, data.overall.failures24h > 0 ? 'degraded' : 'healthy'),
    summaryCard('Queue要対応', number(data.processing.openDeadLetters), '自動再試行を使い切った配送', data.processing.openDeadLetters > 0 ? 'unavailable' : 'healthy'),
  );
  container.removeAttribute('aria-busy');
}

function dataCell(label, value) {
  const cell = node('div', 'data-cell');
  cell.append(node('span', '', label), node('strong', '', text(value)));
  return cell;
}

function syncPercent(channel) {
  try {
    const applied = BigInt(channel.applied);
    const highest = BigInt(channel.highest);
    return highest === 0n ? (channel.complete ? 100 : 0) : Number(applied * 100n / highest);
  } catch {
    return 0;
  }
}

function renderWallet(data) {
  const component = data.components.sponsorWallet;
  const wallet = component.state;
  const operatingWindow = component.operatingWindow;
  const panel = $('#wallet-panel');
  const source = demo ? 'SIMULATED' : component.source === 'live-probe'
    ? 'LIVE'
    : component.source === 'last-known-state'
      ? 'LAST KNOWN'
      : component.source === 'waiting-for-processing-start' ? 'WAITING FOR NEXT RUN' : 'UNAVAILABLE';
  $('#wallet-source').textContent = `${source} · ${time(component.lastObservedAt)}`;
  panel.replaceChildren();
  const status = node('div', 'status-line');
  status.append(
    badge(component.healthClass, health(component.healthClass)),
    node('strong', '', component.source === 'waiting-for-processing-start' ? '次回処理待ち' : phase(wallet?.phase)),
  );
  if (component.source === 'waiting-for-processing-start') {
    status.append(node('span', '', `次回処理開始: ${time(operatingWindow?.nextProcessingStartsAt)}`));
  } else if (!component.live) {
    status.append(node('span', '', `ライブ状態を取得できません: ${text(component.liveErrorCode)}`));
  }
  panel.append(status);
  const funds = component.funds;
  const grid = node('div', 'data-grid');
  grid.append(
    dataCell('DUST残高', dust(funds?.remainingDust)),
    dataCell('直近Sponsored TX手数料', dust(funds?.latestFee?.dust)),
    dataCell('推定残りSponsored TX', funds?.estimatedTransactionsRemaining === null || funds?.estimatedTransactionsRemaining === undefined ? '未算出' : `約 ${number(funds.estimatedTransactionsRemaining)} 件`),
    dataCell('直近手数料の記録日時', time(funds?.latestFee?.recordedAt)),
    dataCell('使用可能DUST UTXO数', number(wallet?.balances?.spendableDustCoins)),
    dataCell('保留DUST UTXO数', number(wallet?.balances?.pendingDustCoins)),
    dataCell('全DUST UTXO数', number(wallet?.balances?.totalDustCoins)),
    dataCell('Supervisor状態', text(wallet?.supervisor?.status)),
    dataCell('Walletプロセス', processState(wallet?.supervisor?.walletProcessAlive)),
    dataCell('Wallet状態の経過時間', wallet?.supervisor?.statusAgeMs === null || wallet?.supervisor?.statusAgeMs === undefined ? '—' : `${Math.round(wallet.supervisor.statusAgeMs / 1000)} 秒`),
    dataCell('処理モード', operatingWindow?.mode === 'always-on'
      ? '常時処理'
      : operatingWindow?.mode === 'on-demand' ? 'オンデマンド（1分周期）' : '日次バッチ'),
    dataCell('処理開始', operatingWindow?.mode === 'always-on'
      ? '即時'
      : operatingWindow?.mode === 'on-demand'
        ? 'Job検知後、最大1分'
        : `${wallClock(operatingWindow?.processingStartsAtMinute)} ${utcOffset(operatingWindow?.timeZoneOffsetMinutes)}`),
    dataCell('次回処理開始', time(operatingWindow?.nextProcessingStartsAt)),
    dataCell('次回Container起動可能', time(operatingWindow?.nextStartAllowedAt)),
    dataCell('今回の受付締切', time(operatingWindow?.eligibleThrough)),
    dataCell('R2同期Checkpoint', data.checkpoint.present ? `${number(data.checkpoint.size)} bytes` : '未保存'),
    dataCell('Checkpoint保存日時', data.checkpoint.present ? time(data.checkpoint.uploadedAt) : '—'),
  );
  panel.append(grid);
  if (wallet?.synchronization?.length) {
    const table = node('table', 'sync-table');
    const head = node('thead');
    const headRow = node('tr');
    for (const value of ['Ledger', '適用Block / 最新Block', 'Block差', '接続状態', '同期率']) headRow.append(node('th', '', value));
    head.append(headRow);
    const body = node('tbody');
    for (const channel of wallet.synchronization) {
      const row = node('tr');
      const track = node('div', 'progress-track');
      const fill = node('div', 'progress-fill');
      fill.style.width = `${Math.min(100, Math.max(0, syncPercent(channel)))}%`;
      track.append(fill);
      row.append(
        node('th', '', channel.channel.toUpperCase()),
        node('td', '', `${number(channel.applied)} / ${number(channel.highest)}`),
        node('td', 'number', number(channel.lag)),
        node('td', '', channel.connected ? '接続中' : '切断'),
        node('td'),
      );
      row.lastElementChild.append(track);
      body.append(row);
    }
    table.append(head, body);
    panel.append(table);
  }
  panel.removeAttribute('aria-busy');
}

function renderAlerts(data) {
  const panel = $('#alerts-panel');
  panel.replaceChildren();
  $('#discord-state').textContent = data.notifications.discordConfigured ? 'Discord: ENABLED' : 'Discord: NOT CONFIGURED';
  const alerts = data.alerts.filter((alert) => alert.status === 'open');
  if (alerts.length === 0) panel.append(node('p', '', '現在、要対応のアラートはありません。'));
  else {
    const list = node('div', 'alert-list');
    for (const alert of alerts) {
      const item = node('article', `alert-item ${alert.severity}`);
      const walletAlert = [
        'sponsor-wallet-unavailable',
        'sponsor-wallet-sync-stalled',
        'sponsor-wallet-low-dust',
      ].includes(alert.alert_key);
      const notificationState = alert.last_notified_at
        ? `通知済み ${time(alert.last_notified_at)}`
        : walletAlert
          ? `検知中（${number(data.thresholds.walletNotificationGraceMinutes)}分継続後に通知）`
          : '通知配送待ち';
      item.append(
        node('h3', '', alert.alert_key),
        node('p', '', alert.summary),
        node('small', '', `${notificationState} / 初回検出 ${time(alert.first_observed_at)} / 最終検出 ${time(alert.last_observed_at)} / 継続判定 ${number(alert.occurrence_count)}回`),
      );
      list.append(item);
    }
    panel.append(list);
  }
  const details = node('details', 'thresholds');
  details.append(node('summary', '', '通知しきい値と配送状態'));
  const thresholds = node('div', 'threshold-grid');
  const values = [
    ['推定残りSponsored TX', `≤ ${data.thresholds.lowDustTransactions}件`],
    ['Wallet同期異常', `Block差${data.thresholds.syncLagBlocks}以上または未完了Channel切断`],
    ['Wallet系通知保護', `${data.thresholds.walletNotificationGraceMinutes}分間継続後に通知`],
    ['Proof滞留', `${data.thresholds.proofBacklog}件以上、かつ最古${data.thresholds.proofBacklogAgeMinutes}分以上`],
    ['Sponsor滞留', `${data.thresholds.sponsorBacklog}件以上、かつ最古${data.thresholds.sponsorBacklogAgeMinutes}分以上`],
    ['Proof API HTTP 429', `5分間に${data.thresholds.proofRateLimitEvents}回以上`],
    ['再通知', `${data.thresholds.reminderMinutes}分`],
  ];
  for (const [label, value] of values) thresholds.append(node('span', '', `${label}: ${value}`));
  const outbox = Object.entries(data.notifications.outbox).map(([key, value]) => `${key}=${value}`).join(' / ') || 'empty';
  thresholds.append(node('span', '', `Outbox: ${outbox}`));
  details.append(thresholds);
  panel.append(details);
  panel.removeAttribute('aria-busy');
}

function renderPipeline(data) {
  const panel = $('#pipeline-panel');
  panel.replaceChildren();
  const states = data.processing.jobStates;
  const steps = [
    ['Proof Queue待ち', (states.pending ?? 0) + (states.dispatched ?? 0)],
    ['Private input待ち／ZKP生成中', (states.ready_for_input ?? 0) + (states.proving ?? 0)],
    ['Device TX作成待ち', (states.proof_ready ?? 0) + (states.device_bound ?? 0)],
    ['Sponsor処理中', data.processing.sponsorBacklog],
    ['Midnight送信済み／確定（累計）', (states.submitted ?? 0) + (states.confirmed ?? 0)],
  ];
  const grid = node('div', 'pipeline-grid');
  for (const [label, value] of steps) {
    const step = node('article', 'pipeline-step');
    step.append(node('span', '', label), node('strong', '', number(value)));
    grid.append(step);
  }
  const registration = data.processing.registrationOperations;
  const policies = data.processing.policyOperations;
  const operations = node('div', 'data-grid');
  operations.append(
    dataCell('Device登録：待機／実行中', number((registration.queued ?? 0) + (registration.running ?? 0))),
    dataCell('Device登録：再試行／失敗', number((registration.retrying ?? 0) + (registration.failed ?? 0))),
    dataCell('Policy登録：待機／実行中', number((policies.queued ?? 0) + (policies.running ?? 0))),
    dataCell('Policy登録：再試行／失敗', number((policies.retrying ?? 0) + (policies.failed ?? 0))),
    dataCell('Project数', number(data.inventory.projects)),
    dataCell('Device数', number(data.inventory.devices)),
    dataCell('登録済みPolicy数', number(data.inventory.registeredPolicies)),
    dataCell('現在の要対応Proof Job', number(data.processing.terminalFailures)),
    dataCell('Queue Dead Letter', number(data.processing.openDeadLetters)),
  );
  operations.classList.add('pipeline-operations');
  const sponsorJobs = data.processing.sponsorJobs ?? [];
  const sponsorDetails = node('div', 'sponsor-job-list');
  sponsorDetails.append(node('h3', '', 'Sponsor処理の詳細'));
  if (sponsorJobs.length === 0) {
    sponsorDetails.append(node('p', 'pipeline-note', '処理中のSponsor Jobはありません。'));
  } else {
    const scroll = node('div', 'table-scroll');
    const table = node('table', 'sponsor-job-table');
    const head = node('thead');
    const header = node('tr');
    for (const label of ['Job', '状態', '現在の処理／待機理由', '継続時間', '次回再試行', '試行']) {
      header.append(node('th', '', label));
    }
    head.append(header);
    const body = node('tbody');
    for (const job of sponsorJobs) {
      const row = node('tr', job.stalled ? 'stalled-job' : '');
      const reason = sponsorReasonLabels[job.reasonCode]
        ?? text(job.reasonCode || job.stage || job.status);
      row.append(
        node('td', 'event-actor', short(job.proofJobId, 30)),
        node('td', '', job.stalled ? `${job.status}（停止検出）` : text(job.status)),
        node('td', '', reason),
        node('td', '', elapsed(job.stageAgeSeconds)),
        node('td', '', time(job.nextRetryAt)),
        node('td', 'number', number(job.attemptCount)),
      );
      body.append(row);
    }
    table.append(head, body);
    scroll.append(table);
    sponsorDetails.append(scroll);
  }
  panel.append(
    grid,
    operations,
    sponsorDetails,
    node('p', 'pipeline-note', `Sponsor処理の最古待機開始: ${time(data.processing.sponsorOldestAt)} / Proof Server状態はD1のJob状態から推定し、この画面からContainerを起動しません。`),
  );
  panel.removeAttribute('aria-busy');
}

function renderMetrics(data) {
  state.metrics = data;
  const chart = $('#metrics-chart');
  chart.replaceChildren();
  const chartMetrics = Object.keys(colors);
  const maximum = Math.max(1, ...data.series.flatMap((day) => chartMetrics.map((metric) => Number(day[metric] ?? 0))));
  for (const day of data.series) {
    const group = node('div', 'chart-day');
    group.title = `${day.day}\n${chartMetrics.map((metric) => `${metricLabels[metric]}: ${number(day[metric])}`).join('\n')}`;
    group.setAttribute('aria-label', group.title);
    for (const metric of chartMetrics) {
      const bar = node('span', `chart-bar ${metric === 'terminalFailures' ? 'failure' : ''}`);
      bar.style.setProperty('--bar-color', colors[metric]);
      bar.style.height = `${Math.max(day[metric] > 0 ? 2 : 0, Number(day[metric] ?? 0) / maximum * 100)}%`;
      group.append(bar);
    }
    chart.append(group);
  }
  chart.removeAttribute('aria-busy');
  const legend = $('#chart-legend');
  legend.replaceChildren(...chartMetrics.map((metric) => {
    const item = node('span', 'legend-item', metricLabels[metric]);
    item.style.setProperty('--legend-color', colors[metric]);
    return item;
  }));
  const body = $('#metrics-table');
  body.replaceChildren();
  for (const day of [...data.series].reverse()) {
    const row = node('tr');
    row.append(node('th', '', day.day));
    for (const metric of ['devicesRegistered', 'proofJobsAccepted', 'proofsGenerated', 'sponsoredTransactions', 'terminalFailures', 'measurementWindows', 'measurementSamples']) {
      row.append(node('td', 'number', number(day[metric])));
    }
    body.append(row);
  }
}

function outcomeClass(outcome) {
  return `outcome-${String(outcome).replace(/[^a-z0-9_-]/gu, '')}`;
}

function showEvent(event) {
  const detail = $('#event-detail');
  const list = node('dl', 'detail-grid');
  const fields = [
    ['発生日時', time(event.occurred_at)],
    ['カテゴリ', event.category],
    ['重要度', event.severity],
    ['主体種別', event.actor_type],
    ['主体識別子', event.actor_identifier],
    ['操作', event.action],
    ['HTTP', event.method || event.route || event.response_status !== null ? `${text(event.method)} ${text(event.route)} → ${text(event.response_status)}` : '—'],
    ['結果', event.outcome],
    ['Request ID', event.request_id],
    ['Client Operation ID', event.client_operation_id],
    ['Project', event.project_id],
    ['Device', event.device_id],
    ['Resource', event.resource_type || event.resource_id ? `${text(event.resource_type)} / ${text(event.resource_id)}` : '—'],
    ['Correlation ID', event.correlation_id],
    ['状態遷移', event.state_from || event.state_to ? `${text(event.state_from)} → ${text(event.state_to)}` : '—'],
    ['エラーコード', event.error_code],
    ['所要時間', event.duration_ms === null ? '—' : `${event.duration_ms} ms`],
  ];
  for (const [label, value] of fields) list.append(node('dt', '', label), node('dd', '', text(value)));
  detail.replaceChildren(list);
  $('#event-dialog').showModal();
}

function renderEvents(append = false) {
  const body = $('#events-table');
  if (!append) body.replaceChildren();
  const start = append ? body.children.length : 0;
  for (const event of state.events.slice(start)) {
    const row = node('tr');
    const actor = event.actor_identifier ? `${event.actor_type}: ${short(event.actor_identifier)}` : event.actor_type;
    const result = node('strong', outcomeClass(event.outcome), event.outcome);
    const detailButton = node('button', '', '詳細');
    detailButton.type = 'button';
    detailButton.addEventListener('click', () => showEvent(event));
    row.append(
      node('td', '', time(event.occurred_at)),
      node('td', '', `${event.category} / ${event.severity}`),
      node('td', 'event-actor', actor),
      node('td', '', event.action),
      node('td'),
      node('td', 'event-actor', short(event.request_id || event.resource_id || event.correlation_id)),
      node('td'),
    );
    row.children[4].append(result);
    row.children[6].append(detailButton);
    body.append(row);
  }
  $('#events-empty').hidden = state.events.length !== 0;
  $('#events-more').hidden = !state.nextCursor;
}

async function loadOverview(silent = false) {
  if (!silent) setMessage('運用状態を読み込んでいます…', 'loading');
  try {
    const data = await api('/api/v1/system-operations/overview');
    state.overview = data;
    renderSummary(data);
    renderWallet(data);
    renderAlerts(data);
    renderPipeline(data);
    $('#operator-name').textContent = data.operator.displayName;
    $('#last-updated').textContent = `最終更新: ${time(data.generatedAt)}`;
    setMessage(data.overall.openAlerts > 0 ? `${data.overall.openAlerts}件のアラートを確認してください。` : 'すべての監視項目を更新しました。', data.overall.openAlerts > 0 ? 'error' : 'ready');
  } catch (error) {
    setMessage(`運用状態を取得できません: ${error.message}`, 'error');
  }
}

async function loadMetrics() {
  const chart = $('#metrics-chart');
  chart.setAttribute('aria-busy', 'true');
  try {
    renderMetrics(await api(`/api/v1/system-operations/metrics?days=${encodeURIComponent($('#metrics-days').value)}`));
  } catch (error) {
    chart.replaceChildren(node('p', '', `日次データを取得できません: ${error.message}`));
  }
}

function eventQuery(cursor = null) {
  const parameters = new URLSearchParams();
  for (const [name, selector] of [['q', '#event-query'], ['category', '#event-category'], ['outcome', '#event-outcome']]) {
    const value = $(selector).value.trim();
    if (value) parameters.set(name, value);
  }
  if (cursor) parameters.set('cursor', cursor);
  return parameters.toString();
}

async function loadEvents(append = false) {
  $('#events-loading').hidden = false;
  $('#events-more').disabled = true;
  try {
    const page = await api(`/api/v1/system-operations/events?${eventQuery(append ? state.nextCursor : null)}`);
    state.events = append ? [...state.events, ...page.events] : page.events;
    state.nextCursor = page.nextCursor;
    renderEvents(append);
  } catch (error) {
    $('#events-loading').textContent = `イベントを取得できません: ${error.message}`;
    return;
  } finally {
    $('#events-more').disabled = false;
  }
  $('#events-loading').hidden = true;
}

$('#refresh-button').addEventListener('click', async () => {
  $('#refresh-button').disabled = true;
  await Promise.all([loadOverview(), loadMetrics(), loadEvents()]);
  $('#refresh-button').disabled = false;
});
$('#metrics-days').addEventListener('change', loadMetrics);
$('#event-filters').addEventListener('submit', (event) => {
  event.preventDefault();
  loadEvents();
});
$('#events-more').addEventListener('click', () => loadEvents(true));
$('#dialog-close').addEventListener('click', () => $('#event-dialog').close());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadOverview(true);
});

await Promise.all([loadOverview(), loadMetrics(), loadEvents()]);
state.overviewTimer = setInterval(() => loadOverview(true), 30_000);
