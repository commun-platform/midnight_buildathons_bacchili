const projectId = 'measurement-authenticity-01';
const main = document.querySelector('#main-content');
const breadcrumb = document.querySelector('#breadcrumb');
const headerStatus = document.querySelector('#header-status');
const footerSource = document.querySelector('#footer-source');
const footerClock = document.querySelector('#footer-clock');
const reloadButton = document.querySelector('#reload-button');
const languageSelect = document.querySelector('#language-select');
const walletConnectButton = document.querySelector('#wallet-connect-button');

const copy = {
  en: {
    title: 'BACCHIRI!━━Verifiable Measurement Layer', subtitle: 'SENSOR VALUES STAY PRIVATE / RESULTS CAN BE CHECKED ON MIDNIGHT',
    language: 'Language', system: 'System', device: 'Device Workflow', admin: 'Administrator', verifier: 'Third-Party Verification',
    refresh: 'Refresh', refreshing: 'Synchronizing...', location: 'Location:', checking: 'CHECKING...', online: 'ONLINE', error: 'ERROR',
    syncInProgress: 'Updating public proof data', syncCode: 'UPDATE',
    syncInProgressDetail: 'The current results stay visible while newer records are downloaded.',
    syncComplete: 'Public proof data updated',
    syncCompleteDetail: 'You are viewing the latest available public records.',
    syncFailed: 'Showing previously loaded proof data',
    syncFailedDetail: 'The update failed. Select Refresh to try again; the current results remain available.',
    chainCheckInProgress: 'Checking Midnight directly',
    chainCheckInProgressDetail: 'The public transaction and Contract state are being checked against the Midnight Indexer.',
    chainCheckComplete: 'Direct Midnight verification complete',
    chainCheckCompleteDetail: 'The transaction, Contract Attestation, Policy, and Assignment all match.',
    chainCheckFailed: 'Direct Midnight verification could not complete',
    source: 'Data source', privacy: 'Sensor values stay private; anyone can check the threshold result on Midnight',
    adminIntro: 'Local review view: hourly summaries, anomaly transitions, and proof processing state.',
    localOnly: 'Administrator APIs are intentionally available only on the loopback development GUI in Wave 1.',
    flow: 'Use-Case Progress', registered: 'Device registered and authenticated',
    received: 'Hourly summary received', anomaly: 'Anomaly state available', requested: 'Proof requested',
    generated: 'Proof generated and transaction sponsored', confirmed: 'Midnight transaction confirmed',
    done: 'DONE', waiting: 'WAIT', nextAction: 'NEXT ACTION', inProgress: 'IN PROGRESS', devices: 'Devices', registry: 'Midnight registry', lastSeen: 'Last received', sensor: 'Sensor', policy: 'Policy',
    hourly: 'Hourly Aggregates', period: 'Period', count: 'Count', minimum: 'Minimum', maximum: 'Maximum',
    average: 'Average', commitment: 'Commitment', anomalies: 'Immediate Anomaly Transitions', transition: 'Transition',
    occurred: 'Occurred', jobs: 'Proof / Transaction Jobs', job: 'Proof Job', status: 'Status', root: 'Data fingerprint',
    tx: 'Attestation Transaction', action: 'Action', inspect: 'Public view', none: 'No records yet.',
    verifierIntro: 'Anyone can check the result without seeing individual sensor readings or the hidden hourly minimum and maximum values.',
    proofId: 'Proof record ID', open: 'Check result', latest: 'Use latest local record', claim: 'Public Result', checks: 'What Was Checked',
    dataset: 'Daily proof record found', inclusion: 'Hidden hourly summary is tied to this proof',
    threshold: 'ZK proof matches the published threshold result',
    midnight: 'Midnight transaction confirmed', publicData: 'Information Anyone Can Check', privateData: 'Information Hidden from Third Parties', private: 'HIDDEN',
    rawSensorValues: 'Raw Sensor Values', rawValuesHidden: 'HIDDEN FROM THIRD PARTIES',
    zkProtected: 'VALUES STAY PRIVATE',
    rawValuesExplanation: 'Individual readings stay on the Device. Third parties can see only how many readings were used and a cryptographic fingerprint of the hidden hourly summary.',
    sample: 'READING', redacted: 'HIDDEN',
    txHash: 'Transaction hash', blockHeight: 'Block height', openExplorer: 'Open in Midnight Explorer',
    proofPipeline: 'How This ZK Proof Was Checked',
    proofPipelineIntro: 'This view uses public information only. Hidden sensor values and proof secrets never appear here.',
    pipelineCommitment: 'Hidden hourly summary matches this proof', pipelineCircuit: 'ZK proof checked successfully',
    pipelinePolicy: 'Threshold result matches the public policy', pipelineChain: 'Transaction found on Midnight',
    pipelineVerifier: 'Public verification complete',
    thresholdPublic: 'PUBLIC ON MIDNIGHT', privateRawValues: 'RAW SENSOR VALUES',
    privateHourlySummary: 'HOURLY MINIMUM / MAXIMUM', privateProofSecret: 'RANDOM PROOF SECRET',
    publicHourStatus: 'OBSERVED / STOPPED HOURS', publicThreshold: 'THRESHOLD RULE',
    network: 'Network', contract: 'Contract',
    sampleCount: 'Sensor readings used', observedHours: 'Observed hours', stoppedHours: 'STOPPED hours', policyId: 'Threshold setting ID',
    policyMode: 'Threshold rule', policyBounds: 'Public threshold', policyVersion: 'Policy version',
    modeClosedRange: 'Between minimum and maximum', modeUpperBound: 'At or below the maximum', modeLowerBound: 'At or above the minimum',
    sensorTemperature: 'Temperature',
    assignment: 'Applied policy record', schemaVersion: 'Schema version', circuitVersion: 'Circuit version',
    pendingClaim: 'The proof is pending and must not be represented as verified.', loading: 'Loading data. Please wait.',
    retry: 'Retry', failed: 'Could not load the requested view.',
    deviceIntro: 'Register this PC as a Device, capture a sensor value, create a ZK proof, and record the claim on Midnight.',
    deviceRegister: 'Device registration', thresholdSetup: 'Threshold assignment', sensorCapture: 'Sensor value',
    proofCreate: 'ZK proof', chainRecord: 'Midnight record', walletConnect: 'Connect Midnight Wallet',
    walletConnecting: 'Connecting Wallet...', walletConnected: 'Wallet Connected',
    walletRequiredTitle: 'Midnight Wallet required',
    walletRequiredBody: 'Connect your Midnight Wallet from the button in the upper-right corner. The Device Workflow appears after the connection is authorized.',
    identityCreate: 'Create Device Identity', registerAction: 'Register Device and assign policy',
    captureAction: 'Capture and upload', proofAction: 'Request proof processing', submitAction: 'Generate proof and record TX',
    deviceId: 'Device ID', wallet: 'Wallet', temperature: 'Temperature', progress: 'Processing status',
    identityRestored: 'Stored Device Identity restored', registrationRestored: 'Registered Device and policy assignment restored',
    autoGenerate: 'Auto Generate one day', generationDate: 'Sensor date (JST)', previousSensorDay: '◀ Previous day', nextSensorDay: 'Next day ▶',
    generationMode: 'Generation mode', withOutliers: 'Random values with outliers (OUTSIDE proof)',
    withinThreshold: 'Within threshold (ZKP test)', outlierCount: 'Outliers', dailyHistory: 'Daily sensor history',
    selectDay: 'View this day', verifyDaily: 'Verify daily ZKP', requestDaily: 'Request daily proof',
    submitDaily: 'Generate ZKP / submit TX', thresholdResult: 'Threshold result',
    withinResult: 'WITHIN THRESHOLD', outsideResult: 'OUTSIDE THRESHOLD', stoppedResult: 'STOPPED',
    privateAvailable: 'Private proof input available', privateUnavailable: 'Private proof input is not stored in this browser',
    feeSponsored: 'The service Sponsor Wallet adds the DUST fee and submits the approved Device transaction.',
    feeSponsoredLabel: 'TRANSACTION FEE SPONSORED',
    sponsorQuotaTitle: 'Daily sponsored submissions (JST)', sponsorQuotaRemaining: 'remaining',
    sponsorQuotaUsed: 'used', sponsorQuotaReset: 'Resets',
    sponsorQuotaReached: 'The daily limit is reached. Already reserved proof jobs can still be retried.',
    completeDay: 'Complete day', incompleteDay: 'Day in progress', generationRange: 'Previous 30 completed days only', latestProofs: 'Daily proof records (newest first)',
    publicProofListIntro: 'Choose a date to check its public result.', publicView: 'PUBLIC VIEW', checked: 'CHECKED', checksComplete: 'checks complete',
    statusPending: 'Waiting', statusAggregating: 'Collecting readings', statusProving: 'Creating ZK proof',
    statusSubmitted: 'Sent to Midnight', statusConfirmed: 'Recorded on Midnight', statusFailed: 'Could not complete',
    statusActive: 'Active', statusDisabled: 'Disabled', statusRevoked: 'Revoked', statusRegistered: 'Registered',
    statusRetired: 'No longer used', statusUnregistered: 'Not registered', statusDispatched: 'Sent for processing',
    statusProofReady: 'Proof ready', statusReadyForInput: 'Ready to create proof', statusRetryableFailed: 'Waiting to retry',
    statusDeviceBound: 'Device approved', statusSponsoring: 'Adding transaction fee', statusSponsored: 'Fee added',
    viewDay: 'Check this date', hourlySummary: 'Hourly min / max / average',
    olderDay: '◀ Older day', newerDay: 'Newer day ▶',
  },
  ja: {
    title: 'BACCHIRI!━━Verifiable Measurement Layer', subtitle: 'センサー値は非公開 / MIDNIGHT上の結果を誰でも確認',
    language: '言語', system: 'システム', device: 'デバイス実行', admin: 'センサーデバイス管理者', verifier: '第三者検証',
    refresh: '再読込', refreshing: '同期中...', location: '現在位置:', checking: '確認中...', online: '稼働中', error: 'エラー',
    syncInProgress: '公開されている証明データを更新中', syncCode: '更新',
    syncInProgressDetail: '新しい記録を取得している間も、現在の結果は閲覧できます。',
    syncComplete: '公開されている証明データを更新しました',
    syncCompleteDetail: '取得可能な最新の公開記録を表示しています。',
    syncFailed: '前回読み込んだ証明データを表示中',
    syncFailedDetail: '更新に失敗しました。再読込で再試行できます。現在の結果は引き続き閲覧できます。',
    chainCheckInProgress: 'Midnightを直接確認中',
    chainCheckInProgressDetail: '公開トランザクションとコントラクト状態をMidnight Indexerで照合しています。',
    chainCheckComplete: 'Midnightの直接検証が完了しました',
    chainCheckCompleteDetail: 'トランザクション、Attestation、しきい値設定、割当がすべて一致しました。',
    chainCheckFailed: 'Midnightの直接検証を完了できませんでした',
    source: 'データの取得元', privacy: 'センサー値は非公開のまま、しきい値の判定結果をMidnight上で誰でも確認できます',
    adminIntro: 'ローカル審査画面：1時間集計、異常遷移、証明の処理状況を確認できます。',
    localOnly: 'Wave 1の管理者APIは、このPCで開く開発用GUIだけで利用できます。',
    flow: 'ユースケース進捗', registered: 'デバイス登録・認証', received: '1時間集計を受信',
    anomaly: '異常状態を表示', requested: '証明を要求', generated: '証明を生成・Sponsorが手数料を付与',
    confirmed: 'Midnightへの記録完了', done: '完了', waiting: '待機', nextAction: '次の操作', inProgress: '処理中', devices: 'デバイス', registry: 'Midnight登録',
    lastSeen: '最終受信', sensor: 'センサー', policy: 'しきい値ルール', hourly: '1時間集計値', period: '期間',
    count: '件数', minimum: '最小', maximum: '最大', average: '平均', commitment: 'データの指紋',
    anomalies: '即時異常遷移', transition: '遷移', occurred: '発生時刻', jobs: '証明・トランザクション処理',
    job: '証明処理', status: '状態', root: '照合用のデータ指紋', tx: '証明トランザクション', action: '操作',
    inspect: '第三者表示', none: 'まだ記録がありません。',
    verifierIntro: '第三者は個別センサー値や非公開の時間別最小・最大値を見ることなく、判定結果を確認できます。',
    proofId: '証明記録ID', open: '結果を確認', latest: '最新の記録を使用', claim: '公開された結果',
    checks: '確認できたこと', dataset: '日次の証明記録がある', inclusion: '非公開の時間別集計と証明が一致',
    threshold: 'ZK証明の判定が公開しきい値と一致', midnight: 'Midnightへの記録を確認', publicData: '誰でも確認できる情報',
    privateData: '第三者には見えない情報', private: '非公開', thresholdPublic: 'MIDNIGHTで公開',
    privateRawValues: '元のセンサー値', privateHourlySummary: '時間別の最小値・最大値',
    privateProofSecret: '証明に使うランダムな秘密情報', publicHourStatus: '観測・停止した時間', publicThreshold: 'しきい値ルール',
    network: 'ネットワーク', rawSensorValues: '元のセンサー値', rawValuesHidden: '第三者には非公開',
    zkProtected: '値を見せずに証明',
    rawValuesExplanation: '個別センサー値はデバイス内に残ります。第三者に見えるのは、使用した件数と、非公開の時間別集計を照合するためのデータの指紋だけです。',
    sample: '測定', redacted: '非公開',
    txHash: 'トランザクションハッシュ', blockHeight: 'ブロック番号', openExplorer: 'Midnight Explorerで確認',
    proofPipeline: 'ゼロ知識証明（ZKP）の確認ステップ',
    proofPipelineIntro: 'この画面で使うのは公開情報だけです。非公開のセンサー値や証明用の秘密情報は表示されません。',
    pipelineCommitment: '非公開の時間別集計と証明を照合', pipelineCircuit: 'ZK証明が正しいことを確認',
    pipelinePolicy: '判定結果と公開しきい値を照合', pipelineChain: 'Midnightへの記録を確認',
    pipelineVerifier: '第三者による確認が完了',
    contract: 'コントラクト', sampleCount: '使用したセンサー値の件数', observedHours: '観測時間数', policyId: 'しきい値設定ID',
    stoppedHours: '停止時間数', policyMode: 'しきい値ルール', policyBounds: '公開しきい値',
    modeClosedRange: '最小値から最大値まで', modeUpperBound: '最大値以下', modeLowerBound: '最小値以上',
    sensorTemperature: '温度',
    policyVersion: 'しきい値設定のバージョン', assignment: '適用したしきい値設定', schemaVersion: 'データ形式のバージョン', circuitVersion: 'ZK回路のバージョン',
    pendingClaim: '証明は処理中です。確認済みとして扱えません。',
    loading: 'データを読み込んでいます。', retry: '再試行', failed: '画面の読込みに失敗しました。',
    deviceIntro: 'このPCをデバイスとして登録し、センサー値の取得、ZK証明の作成、Midnightへの記録まで実行します。',
    deviceRegister: 'デバイス登録', thresholdSetup: 'しきい値設定', sensorCapture: 'センサー値取得',
    proofCreate: 'ZK証明を作成', chainRecord: 'コントラクトに記録', walletConnect: 'Midnight Walletを接続',
    walletConnecting: 'ウォレット接続中...', walletConnected: 'ウォレット接続済み',
    walletRequiredTitle: 'Midnight Walletの接続が必要です',
    walletRequiredBody: '画面右上のボタンからMidnight Walletを接続してください。接続を承認するとデバイス操作画面が表示されます。',
    identityCreate: 'デバイス認証鍵を作成', registerAction: 'デバイス登録・しきい値設定',
    captureAction: '取得して送信', proofAction: '証明処理を開始', submitAction: 'ZK証明を生成してトランザクション送信',
    deviceId: 'デバイスID', wallet: 'ウォレット', temperature: '温度', progress: '処理状況',
    identityRestored: '保存済みのデバイス認証鍵を復元しました', registrationRestored: '登録済みデバイスとしきい値設定を復元しました',
    autoGenerate: '1日分を自動生成', generationDate: 'センサー日付（JST）', previousSensorDay: '◀ 前日', nextSensorDay: '翌日 ▶',
    generationMode: '生成モード', withOutliers: 'ランダム値＋外れ値（しきい値外の証明）',
    withinThreshold: 'しきい値内（ZK証明の確認用）', outlierCount: '外れ値', dailyHistory: '日別センサー履歴',
    selectDay: 'この日を表示', verifyDaily: '日次ZK証明を確認', requestDaily: '日次証明を要求',
    submitDaily: 'ZK証明を生成・トランザクション送信', thresholdResult: 'しきい値結果',
    withinResult: 'しきい値内', outsideResult: 'しきい値外', stoppedResult: '停止',
    privateAvailable: 'このブラウザに非公開の証明入力あり', privateUnavailable: 'このブラウザに非公開の証明入力がありません',
    feeSponsored: 'サービスのSponsor WalletがDUST手数料を付与し、デバイスが承認したトランザクションを送信します。',
    feeSponsoredLabel: 'トランザクション手数料はスポンサー負担',
    sponsorQuotaTitle: 'スポンサー送信の日次上限（JST）', sponsorQuotaRemaining: '回利用可能',
    sponsorQuotaUsed: '回使用済み', sponsorQuotaReset: 'リセット',
    sponsorQuotaReached: '本日分の上限に達しました。予約済みの証明処理は引き続き再試行できます。',
    completeDay: '1日分完了', incompleteDay: '当日進行中', generationRange: '完了済みの過去30日間のみ', latestProofs: '日次証明記録（新しい順）',
    publicProofListIntro: '確認したい日付を選択してください。', publicView: '第三者向け画面', checked: '確認済み', checksComplete: '項目を確認済み',
    statusPending: '待機中', statusAggregating: 'センサー値を集計中', statusProving: 'ZK証明を作成中',
    statusSubmitted: 'Midnightへ送信済み', statusConfirmed: 'Midnightに記録済み', statusFailed: '処理に失敗',
    statusActive: '利用中', statusDisabled: '無効', statusRevoked: '利用停止', statusRegistered: '登録済み',
    statusRetired: '使用終了', statusUnregistered: '未登録', statusDispatched: '証明処理へ送信済み',
    statusProofReady: '証明作成済み', statusReadyForInput: '証明作成の準備完了', statusRetryableFailed: '再試行待ち',
    statusDeviceBound: 'デバイス承認済み', statusSponsoring: '手数料を付与中', statusSponsored: '手数料付与済み',
    viewDay: 'この日を確認', hourlySummary: '時間別 最小 / 最大 / 平均',
    olderDay: '◀ 古い日', newerDay: '新しい日 ▶',
  },
};

let selectedLanguage = localStorage.getItem('vsp-language') || 'auto';
let deviceModule;
let deviceLoadPromise;
let adminData = null;
let adminSelectedDate = '';
let dashboardSyncState = 'idle';
let dashboardSyncPromise = null;
const deviceState = {
  configuration: null,
  wallet: null,
  device: null,
  provisioned: null,
  measurement: null,
  proofJob: null,
  transaction: null,
  history: null,
  sponsorQuota: null,
  selectedDate: localStorage.getItem('vsp-selected-sensor-date') || '',
  generationDate: normalizedSensorDate(localStorage.getItem('vsp-generation-date') || defaultSensorDate()),
  generationMode: localStorage.getItem('vsp-generation-mode') || 'with-outliers',
  busy: false,
  activeAction: '',
  message: '',
  error: '',
  deviceId: localStorage.getItem('vsp-browser-device-id') || `review-device-${crypto.randomUUID().slice(0, 8)}`,
};

function jstDate(value = new Date()) {
  return new Date(value.valueOf() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function defaultSensorDate() {
  return sensorDateBounds().maximum;
}

function sensorDateBounds(value = new Date()) {
  const dayMilliseconds = 24 * 60 * 60 * 1000;
  const today = jstDate(value);
  const todayStart = Date.parse(`${today}T00:00:00+09:00`);
  return {
    minimum: jstDate(new Date(todayStart - 30 * dayMilliseconds)),
    maximum: jstDate(new Date(todayStart - dayMilliseconds)),
  };
}

function normalizedSensorDate(value) {
  const bounds = sensorDateBounds();
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && value >= bounds.minimum && value <= bounds.maximum
    ? value
    : bounds.maximum;
}

function windowDate(window) { return jstDate(new Date(window.periodStart)); }

function locale() {
  if (selectedLanguage === 'en' || selectedLanguage === 'ja') return selectedLanguage;
  return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

function t(key) { return copy[locale()][key] ?? key; }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}
function short(value, length = 18) {
  if (!value) return '—';
  const text = String(value);
  return text.length <= length ? text : `${text.slice(0, length / 2)}…${text.slice(-length / 2)}`;
}
function midnightExplorerBase(network) {
  const normalized = String(network || '').toLowerCase();
  if (normalized.includes('preprod')) return 'https://preprod.midnightexplorer.com';
  if (normalized.includes('preview')) return 'https://preview.midnightexplorer.com';
  if (normalized.includes('mainnet')) return 'https://midnightexplorer.com';
  return '';
}
function midnightExplorerUrl(kind, value, network) {
  const base = midnightExplorerBase(network);
  if (!base || !value) return '';
  const encoded = encodeURIComponent(String(value));
  if (kind === 'transaction') return `${base}/transactions/${encoded}`;
  if (kind === 'contract') return `${base}/contracts/${encoded}`;
  if (kind === 'block' && /^\d+$/u.test(String(value))) return `${base}/blocks/${encoded}`;
  return '';
}
function explorerLink(kind, value, network, display = value) {
  const url = midnightExplorerUrl(kind, value, network);
  if (!url) return escapeHtml(display || '—');
  return `<a class="explorer-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(`${t('openExplorer')}: ${value}`)}">${escapeHtml(display)} <span aria-hidden="true">↗</span></a>`;
}
function dateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? String(value) : new Intl.DateTimeFormat(
    locale() === 'ja' ? 'ja-JP' : 'en-GB',
    { dateStyle: 'short', timeStyle: 'medium' },
  ).format(parsed);
}
function localized(english, japanese) { return locale() === 'ja' && japanese ? japanese : english; }
function policyBounds(policy) {
  const unit = policy.unit || '';
  if (policy.mode === 'upper-bound') return `≤ ${policy.maximum} ${unit}`;
  if (policy.mode === 'lower-bound') return `≥ ${policy.minimum} ${unit}`;
  return `${policy.minimum}–${policy.maximum} ${unit}`;
}
function policyModeLabel(value) {
  const key = {
    'closed-range': 'modeClosedRange', 'upper-bound': 'modeUpperBound', 'lower-bound': 'modeLowerBound',
  }[value];
  return key ? t(key) : String(value || '—').replaceAll('-', ' ');
}
function sensorTypeLabel(value) {
  return value === 'temperature' ? t('sensorTemperature') : String(value || '—').replaceAll('-', ' ');
}
function status(value) {
  const normalized = String(value || 'pending').replaceAll('_', '-');
  const statusKey = {
    pending: 'statusPending', aggregating: 'statusAggregating', proving: 'statusProving', submitted: 'statusSubmitted',
    confirmed: 'statusConfirmed', failed: 'statusFailed', active: 'statusActive', disabled: 'statusDisabled',
    revoked: 'statusRevoked', registered: 'statusRegistered', retired: 'statusRetired', unregistered: 'statusUnregistered',
    dispatched: 'statusDispatched', 'proof-ready': 'statusProofReady', 'ready-for-input': 'statusReadyForInput',
    'device-bound': 'statusDeviceBound', sponsoring: 'statusSponsoring', sponsored: 'statusSponsored',
    'retryable-failed': 'statusRetryableFailed',
  }[normalized];
  return `<span class="status status-${escapeHtml(normalized)}">${escapeHtml(statusKey ? t(statusKey) : normalized.replaceAll('-', ' '))}</span>`;
}
function thresholdResult(value, observedHourCount) {
  if (value === undefined || value === null) return status('pending');
  const result = observedHourCount === 0 || value === 'stopped'
    ? ['stopped', t('stoppedResult')]
    : value === false || value === 'outside-threshold'
      ? ['outside-threshold', t('outsideResult')]
      : ['within-threshold', t('withinResult')];
  return `<span class="status status-${result[0]}">${escapeHtml(result[1])}</span>`;
}
function table(headers, rows) {
  if (!rows.length) return `<div class="empty-state">${escapeHtml(t('none'))}</div>`;
  return `<div class="data-table-wrap"><table class="data-table"><thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

async function fetchJson(url, administrator = false) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(administrator ? { 'X-VSP-Local-Admin': 'dashboard' } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

async function synchronizeLocalDashboard() {
  if (!['localhost', '127.0.0.1', '::1'].includes(location.hostname)) return;
  const response = await fetch('http://127.0.0.1:8790/api/dashboard/sync', {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Dashboard synchronization failed with HTTP ${response.status}`);
}

function isLocalDashboard() {
  return ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
}

function dashboardSyncView() {
  if (!isLocalDashboard() || route().name === 'device' || dashboardSyncState === 'idle') return '';
  const state = dashboardSyncState === 'syncing'
    ? { title: t('syncInProgress'), detail: t('syncInProgressDetail'), code: t('syncCode'), className: 'syncing' }
    : dashboardSyncState === 'complete'
      ? { title: t('syncComplete'), detail: t('syncCompleteDetail'), code: 'OK', className: 'complete' }
      : { title: t('syncFailed'), detail: t('syncFailedDetail'), code: '!', className: 'failed' };
  return `<section class="dashboard-sync ${state.className}" id="dashboard-sync-indicator" role="status" aria-live="polite" aria-busy="${dashboardSyncState === 'syncing'}">
    <span class="dashboard-sync-code" aria-hidden="true">${state.code}</span>
    <div class="dashboard-sync-copy"><strong>${escapeHtml(state.title)}</strong><span>${escapeHtml(state.detail)}</span>
      ${dashboardSyncState === 'syncing' ? '<div class="progress-shell dashboard-sync-progress" aria-hidden="true"><div class="progress-bar"></div></div>' : ''}
    </div>
  </section>`;
}

function withDashboardSyncView(content) {
  return `${dashboardSyncView()}${content}`;
}

function updateReloadControl() {
  const synchronizing = isLocalDashboard() && route().name !== 'device' && dashboardSyncState === 'syncing';
  reloadButton.textContent = t(synchronizing ? 'refreshing' : 'refresh');
  reloadButton.disabled = synchronizing;
}

function updateDashboardSyncView() {
  updateReloadControl();
  const current = document.querySelector('#dashboard-sync-indicator');
  const markup = dashboardSyncView();
  if (current && markup) current.outerHTML = markup;
  else if (current) current.remove();
  else if (markup) main.insertAdjacentHTML('afterbegin', markup);
}

async function startLocalDashboardSync(force = false) {
  if (!isLocalDashboard() || route().name === 'device') return;
  if (dashboardSyncPromise) return dashboardSyncPromise;
  if (!force && dashboardSyncState !== 'idle') return;

  dashboardSyncState = 'syncing';
  updateDashboardSyncView();
  dashboardSyncPromise = (async () => {
    try {
      await synchronizeLocalDashboard();
      dashboardSyncState = 'complete';
      updateDashboardSyncView();
      if (route().name !== 'device') await render({ showLoading: false, startInitialSync: false });
    } catch {
      dashboardSyncState = 'failed';
      updateDashboardSyncView();
    } finally {
      dashboardSyncPromise = null;
      updateReloadControl();
    }
  })();
  return dashboardSyncPromise;
}

function stepper(stepper) {
  const steps = [
    ['registered', stepper.deviceRegistered], ['received', stepper.hourlyDataReceived],
    ['anomaly', stepper.anomalyStateAvailable], ['requested', stepper.proofRequested],
    ['generated', stepper.proofGenerated], ['confirmed', stepper.midnightConfirmed],
  ];
  return `<ol class="proof-stepper">${steps.map(([label, complete], index) => `
    <li class="${complete ? 'complete' : ''}">
      <span class="step-number">${complete ? '<span aria-hidden="true">✓</span><span class="visually-hidden">' + escapeHtml(t('done')) + '</span>' : index + 1}</span>
      <strong>${escapeHtml(t(label))}</strong>
      <span class="step-state">${escapeHtml(t(complete ? 'done' : 'waiting'))}</span>
    </li>`).join('')}</ol>`;
}

function deviceStepper() {
  const steps = [
    [t('deviceRegister'), Boolean(deviceState.provisioned)],
    [t('thresholdSetup'), Boolean(deviceState.provisioned)],
    [t('sensorCapture'), Boolean(deviceState.measurement)],
    [t('proofCreate'), Boolean(deviceState.proofJob && ['ready_for_input', 'proving', 'proof_ready', 'confirmed'].includes(deviceState.proofJob.status))],
    [t('chainRecord'), Boolean(deviceState.transaction)],
  ];
  const current = steps.findIndex(([, complete]) => !complete);
  return `<ol class="proof-stepper device-stepper">${steps.map(([label, complete], index) => `
    <li class="${complete ? 'complete' : index === current ? 'current' : ''}"><span class="step-number">${complete ? '<span aria-hidden="true">✓</span><span class="visually-hidden">' + escapeHtml(t('done')) + '</span>' : index + 1}</span>
      <strong>${escapeHtml(label)}</strong><span class="step-state">${escapeHtml(t(complete ? 'done' : index === current ? 'nextAction' : 'waiting'))}</span></li>`).join('')}</ol>`;
}

function deviceDays() {
  const days = new Map();
  const ensure = (periodDate) => {
    if (!days.has(periodDate)) days.set(periodDate, { periodDate, windows: [], capture: null, proofJob: null });
    return days.get(periodDate);
  };
  for (const capture of deviceState.history?.localCaptures || []) ensure(capture.periodDate).capture = capture;
  for (const window of deviceState.history?.windows || []) ensure(windowDate(window)).windows.push(window);
  for (const proofJob of deviceState.history?.proofJobs || []) ensure(proofJob.periodDate).proofJob ||= proofJob;
  if (deviceState.measurement) ensure(deviceState.measurement.periodDate).capture = deviceState.measurement;
  if (deviceState.proofJob) ensure(deviceState.proofJob.periodDate).proofJob = deviceState.proofJob;
  return [...days.values()].sort((left, right) => right.periodDate.localeCompare(left.periodDate));
}

function selectedDeviceDay() {
  const days = deviceDays();
  const selected = deviceState.selectedDate || deviceState.measurement?.periodDate || days[0]?.periodDate || '';
  return days.find((day) => day.periodDate === selected) || null;
}

function windowIsOutlier(window, policy) {
  if (!policy) return false;
  if (policy.mode !== 'upper-bound' && window.minimum < policy.minimum) return true;
  if (policy.mode !== 'lower-bound' && window.maximum > policy.maximum) return true;
  return false;
}

function dailyProofAction(day) {
  if (!day) return '—';
  if (day.proofJob?.status === 'confirmed') {
    return `<a class="button-link" href="#/verify/${encodeURIComponent(day.proofJob.proofJobId)}">${escapeHtml(t('verifyDaily'))}</a>`;
  }
  if (!day.capture) return `<span class="muted">${escapeHtml(t('privateUnavailable'))}</span>`;
  if (!day.capture.completeDay) return `<span class="status status-pending">${escapeHtml(t('incompleteDay'))}</span>`;
  if (day.proofJob && ['ready_for_input', 'proving', 'proof_ready'].includes(day.proofJob.status)) {
    const allowed = sponsorQuotaAllows(day.proofJob.proofJobId);
    return `<button type="button" class="compact-button daily-submit" data-period-date="${escapeHtml(day.periodDate)}" ${allowed ? '' : 'disabled'} title="${allowed ? '' : escapeHtml(t('sponsorQuotaReached'))}">${escapeHtml(t('submitDaily'))}</button>`;
  }
  return `<button type="button" class="compact-button daily-proof-request" data-period-date="${escapeHtml(day.periodDate)}">${escapeHtml(t('requestDaily'))}</button>`;
}

function sponsorQuotaAllows(proofJobId) {
  const quota = deviceState.sponsorQuota;
  if (!quota) return true;
  return quota.remaining > 0 || quota.reservedProofJobIds.includes(proofJobId || '');
}

function sponsorQuotaView() {
  const quota = deviceState.sponsorQuota;
  if (!quota) return '';
  const selectedJobReserved = quota.reservedProofJobIds.includes(deviceState.proofJob?.proofJobId || '');
  const blocked = quota.remaining === 0 && !selectedJobReserved;
  return `<div class="notice ${blocked ? 'device-error' : ''}"><strong>${escapeHtml(t('sponsorQuotaTitle'))}</strong>
    <span>${escapeHtml(quota.remaining)} ${escapeHtml(t('sponsorQuotaRemaining'))} / ${escapeHtml(quota.dailyLimit)} (${escapeHtml(quota.used)} ${escapeHtml(t('sponsorQuotaUsed'))})</span>
    <small>${escapeHtml(t('sponsorQuotaReset'))}: ${escapeHtml(dateTime(quota.resetAt))}</small>
    ${blocked ? `<span>${escapeHtml(t('sponsorQuotaReached'))}</span>` : ''}</div>`;
}

function deviceHistoryView(policy) {
  const days = deviceDays();
  const selected = selectedDeviceDay();
  const windows = [...(selected?.windows || [])].sort((left, right) => left.periodStart.localeCompare(right.periodStart));
  const localWindows = windows.length ? windows : (selected?.capture?.windows || []).map((window) => ({ ...window, unit: '°C' }));
  return `<section class="window full-width"><div class="window-title">${escapeHtml(t('dailyHistory'))}</div><div class="window-body device-form">
    ${table(
      [t('period'), t('sampleCount'), t('outlierCount'), t('status'), t('action')],
      days.map((day) => `<tr class="${day.periodDate === selected?.periodDate ? 'selected-row' : ''}"><td class="nowrap"><strong>${escapeHtml(day.periodDate)}</strong><br><button type="button" class="compact-button device-day-select" data-period-date="${escapeHtml(day.periodDate)}">${escapeHtml(t('selectDay'))}</button></td><td class="numeric">${escapeHtml(day.capture?.records?.length ?? day.proofJob?.sampleCount ?? day.windows.reduce((sum, window) => sum + window.count, 0))}</td><td class="numeric">${escapeHtml(day.capture?.outlierCount ?? '—')}</td><td>${thresholdResult(day.proofJob?.thresholdSatisfied ?? day.capture?.thresholdSatisfied, day.proofJob?.observedHourCount ?? day.capture?.attestation?.publicData?.observedHourCount)}<br>${day.proofJob ? status(day.proofJob.status) : status('aggregating')}<br><small>${escapeHtml(day.capture ? t('privateAvailable') : t('privateUnavailable'))}</small></td><td>${dailyProofAction(day)}</td></tr>`),
    )}
    ${selected ? `<div class="daily-heading"><strong>${escapeHtml(selected.periodDate)} — ${escapeHtml(t('hourlySummary'))}</strong><span>${dailyProofAction(selected)}</span></div>${table(
      [t('period'), t('count'), t('minimum'), t('maximum'), t('average'), t('commitment')],
      localWindows.map((window) => `<tr class="${windowIsOutlier(window, policy) ? 'outlier' : ''}"><td class="nowrap">${escapeHtml(dateTime(window.periodStart))}<br>${escapeHtml(dateTime(window.periodEnd))}</td><td class="numeric">${escapeHtml(window.count)}</td><td class="numeric">${escapeHtml(window.minimum)} ${escapeHtml(window.unit || '°C')}</td><td class="numeric">${escapeHtml(window.maximum)} ${escapeHtml(window.unit || '°C')}</td><td class="numeric">${escapeHtml(window.average)} ${escapeHtml(window.unit || '°C')}</td><td class="hash">${escapeHtml(short(window.commitment))}</td></tr>`),
    )}` : ''}
  </div></section>`;
}

function nextDeviceAction() {
  if (!deviceState.wallet) return 'wallet-connect-button';
  if (!deviceState.device) return 'device-identity-create';
  if (!deviceState.provisioned) return 'device-register';
  if (!deviceState.measurement || deviceState.transaction) return 'device-capture';
  if (!deviceState.proofJob) return 'device-proof-request';
  if (
    !deviceState.transaction
    && ['ready_for_input', 'proving', 'proof_ready'].includes(deviceState.proofJob.status)
    && sponsorQuotaAllows(deviceState.proofJob.proofJobId)
  ) return 'device-submit';
  return '';
}

function workflowButton(id, label, complete, disabled) {
  const current = nextDeviceAction() === id;
  const active = deviceState.busy && deviceState.activeAction === id;
  const classes = ['workflow-action'];
  if (complete) classes.push('completed-action');
  if (current) classes.push('next-action');
  if (active) classes.push('active-action');
  const state = active ? t('inProgress') : current ? t('nextAction') : '';
  return `<button type="button" id="${escapeHtml(id)}" class="${classes.join(' ')}" ${disabled ? 'disabled' : ''} ${current ? 'aria-current="step"' : ''}>
    ${complete ? '<span class="action-check" aria-hidden="true">✓</span>' : ''}<span>${escapeHtml(label)}</span>
    ${state ? `<span class="action-badge">${escapeHtml(state)}</span>` : ''}
  </button>`;
}

function deviceView() {
  const config = deviceState.configuration;
  const policy = config?.policies[0];
  const generationBounds = sensorDateBounds();
  const policyDescription = policy ? policyBounds({
    mode: policy.mode,
    minimum: policy.minimum,
    maximum: policy.maximum,
    unit: '°C',
  }) : '—';
  const result = deviceState.transaction;
  const heading = `<div class="project-heading"><div><h2>${escapeHtml(t('device'))}</h2><p>${escapeHtml(t('deviceIntro'))}</p></div>
      <span class="network-label">${escapeHtml(config?.network?.toUpperCase() || 'PREPROD')}</span></div>
    ${deviceState.error ? `<div class="notice device-error"><strong>ERROR</strong><span>${escapeHtml(deviceState.error)}</span></div>` : ''}
    ${deviceState.message ? `<div class="notice"><strong>INFO</strong><span>${escapeHtml(deviceState.message)}</span></div>` : ''}`;
  if (!deviceState.wallet) {
    return `${heading}<section class="window wallet-gate" aria-labelledby="wallet-gate-title">
      <div class="window-title" id="wallet-gate-title">${escapeHtml(t('walletRequiredTitle'))}</div>
      <div class="window-body wallet-gate-body"><div class="wallet-gate-icon" aria-hidden="true">W</div>
        <div><p>${escapeHtml(t('walletRequiredBody'))}</p><span class="network-label">MIDNIGHT / PREPROD</span></div>
      </div></section>`;
  }
  return `${heading}
    <section class="window"><div class="window-title">${escapeHtml(t('flow'))}</div><div class="window-body">${deviceStepper()}</div></section>
    <div class="device-action-grid section-gap">
      <section class="window"><div class="window-title">1. ${escapeHtml(t('deviceRegister'))}</div><div class="window-body device-form">
        <label>${escapeHtml(t('deviceId'))}<input id="device-id-input" maxlength="80" value="${escapeHtml(deviceState.deviceId)}" ${deviceState.device ? 'disabled' : ''}></label>
        ${workflowButton('device-identity-create', t('identityCreate'), Boolean(deviceState.device), deviceState.busy || !deviceState.wallet || Boolean(deviceState.device))}
        <dl class="device-summary"><dt>${escapeHtml(t('wallet'))}</dt><dd>${escapeHtml(deviceState.wallet ? `${deviceState.wallet.walletName} / ${short(deviceState.wallet.shieldedAddress, 26)}` : '—')}</dd>
          <dt>Device Authority</dt><dd class="hash">${escapeHtml(short(deviceState.device?.deviceAuthority, 30))}</dd></dl>
      </div></section>
      <section class="window"><div class="window-title">2. ${escapeHtml(t('thresholdSetup'))}</div><div class="window-body device-form">
        <label>${escapeHtml(t('policy'))}<select id="device-policy" ${deviceState.provisioned ? 'disabled' : ''}>${(config?.policies || []).map((item) => `<option value="${escapeHtml(item.policyId)}">${escapeHtml(item.policyId)} / ${escapeHtml(policyBounds({ ...item, unit: '°C' }))}</option>`).join('')}</select></label>
        <div class="threshold-display"><strong>${escapeHtml(policyDescription)}</strong><small>${escapeHtml(policy?.registeredTxId || '—')}</small></div>
        ${workflowButton('device-register', t('registerAction'), Boolean(deviceState.provisioned), deviceState.busy || !deviceState.device || Boolean(deviceState.provisioned))}
        <div class="hash">Contract: ${escapeHtml(short(config?.contractAddress, 34))}</div>
      </div></section>
      <section class="window full-width"><div class="window-title">3. ${escapeHtml(t('sensorCapture'))}</div><div class="window-body device-form">
        <div class="daily-generator">
          <div class="device-date-field"><label for="device-period-date">${escapeHtml(t('generationDate'))}</label><div class="device-date-controls">
            <button type="button" class="compact-button" id="device-date-previous" ${deviceState.generationDate <= generationBounds.minimum ? 'disabled' : ''}>${escapeHtml(t('previousSensorDay'))}</button>
            <input id="device-period-date" type="date" min="${escapeHtml(generationBounds.minimum)}" max="${escapeHtml(generationBounds.maximum)}" value="${escapeHtml(deviceState.generationDate)}">
            <button type="button" class="compact-button" id="device-date-next" ${deviceState.generationDate >= generationBounds.maximum ? 'disabled' : ''}>${escapeHtml(t('nextSensorDay'))}</button>
          </div><small>${escapeHtml(t('generationRange'))}: ${escapeHtml(generationBounds.minimum)} – ${escapeHtml(generationBounds.maximum)}</small></div>
          <label>${escapeHtml(t('generationMode'))}<select id="device-generation-mode"><option value="with-outliers" ${deviceState.generationMode === 'with-outliers' ? 'selected' : ''}>${escapeHtml(t('withOutliers'))}</option><option value="within-threshold" ${deviceState.generationMode === 'within-threshold' ? 'selected' : ''}>${escapeHtml(t('withinThreshold'))}</option></select></label>
        </div>
        ${workflowButton('device-capture', t('autoGenerate'), Boolean(deviceState.measurement), deviceState.busy || !deviceState.provisioned)}
        <dl class="device-summary"><dt>${escapeHtml(t('period'))}</dt><dd>${escapeHtml(deviceState.measurement?.periodDate || '—')}</dd>
          <dt>${escapeHtml(t('sampleCount'))}</dt><dd>${escapeHtml(deviceState.measurement?.records?.length ?? '—')}</dd>
          <dt>${escapeHtml(t('outlierCount'))}</dt><dd>${escapeHtml(deviceState.measurement?.outlierCount ?? '—')}</dd>
          <dt>${escapeHtml(t('thresholdResult'))}</dt><dd>${deviceState.measurement ? thresholdResult(deviceState.measurement.thresholdSatisfied, deviceState.measurement.attestation.publicData.observedHourCount) : '—'}</dd>
          <dt>Attestation</dt><dd class="hash">${escapeHtml(short(deviceState.measurement?.attestation?.publicData?.attestationCommitment, 30))}</dd></dl>
      </div></section>
      <section class="window"><div class="window-title">4. ${escapeHtml(t('proofCreate'))}</div><div class="window-body device-form">
        ${workflowButton('device-proof-request', t('proofAction'), Boolean(deviceState.proofJob), deviceState.busy || !deviceState.measurement || !deviceState.measurement.completeDay || Boolean(deviceState.proofJob))}
        <dl class="device-summary"><dt>${escapeHtml(t('job'))}</dt><dd class="hash">${escapeHtml(short(deviceState.proofJob?.proofJobId, 30))}</dd>
          <dt>${escapeHtml(t('status'))}</dt><dd>${deviceState.proofJob ? status(deviceState.proofJob.status) : '—'}</dd></dl>
      </div></section>
      <section class="window full-width"><div class="window-title">5. ${escapeHtml(t('chainRecord'))}</div><div class="window-body device-form horizontal-device-form">
        ${workflowButton('device-submit', t('submitAction'), Boolean(deviceState.transaction), deviceState.busy || !deviceState.proofJob || Boolean(deviceState.transaction) || !['ready_for_input', 'proving', 'proof_ready'].includes(deviceState.proofJob?.status) || !sponsorQuotaAllows(deviceState.proofJob?.proofJobId))}
        <div><strong>${escapeHtml(t('progress'))}:</strong> <span id="device-progress">${escapeHtml(deviceState.message || '—')}</span></div>
        <div class="hash">TX: ${escapeHtml(result?.transactionId || '—')}</div>
        ${result?.sponsorTransactionId ? `<div class="hash">Sponsor TX: ${escapeHtml(result.sponsorTransactionId)} / ${escapeHtml(result.feeDust)} tDUST</div>` : ''}
        <div class="notice"><strong>${escapeHtml(t('feeSponsoredLabel'))}</strong><span>${escapeHtml(t('feeSponsored'))}</span></div>
        ${sponsorQuotaView()}
      </div></section>
      ${deviceHistoryView(policy)}
    </div>`;
}

async function applySelectedDeviceDay(flow, periodDate) {
  deviceState.selectedDate = periodDate;
  localStorage.setItem('vsp-selected-sensor-date', periodDate);
  const day = deviceDays().find((candidate) => candidate.periodDate === periodDate);
  deviceState.measurement = day?.capture ? await flow.selectDailyCapture(periodDate) : null;
  deviceState.proofJob = day?.proofJob || null;
  deviceState.transaction = day?.proofJob?.attestTxId
    ? { transactionId: day.proofJob.attestTxId }
    : null;
}

async function refreshDeviceHistory(flow) {
  if (!deviceState.provisioned) return;
  deviceState.history = await flow.loadDeviceHistory();
  const days = deviceDays();
  const selected = days.some((day) => day.periodDate === deviceState.selectedDate)
    ? deviceState.selectedDate
    : days[0]?.periodDate;
  if (selected) await applySelectedDeviceDay(flow, selected);
  deviceState.sponsorQuota = await flow.loadSponsorQuota();
}

async function loadDeviceModule() {
  if (!deviceLoadPromise) {
    deviceLoadPromise = (async () => {
      deviceModule ||= await import('/device-flow.js?v=20260829-4');
      if (!deviceState.configuration) {
        deviceState.configuration = await deviceModule.browserDeviceFlow.loadConfiguration();
      }
      if (!deviceState.device && deviceState.deviceId) {
        const restored = await deviceModule.browserDeviceFlow.restoreDevice(deviceState.deviceId);
        if (restored) {
          deviceState.device = restored.device;
          deviceState.provisioned = restored.provisioned;
          deviceState.message = t(restored.provisioned ? 'registrationRestored' : 'identityRestored');
          deviceState.error = restored.warning || '';
          if (restored.provisioned) await refreshDeviceHistory(deviceModule.browserDeviceFlow);
        }
      }
      return deviceModule.browserDeviceFlow;
    })();
  }
  try {
    return await deviceLoadPromise;
  } catch (error) {
    deviceLoadPromise = null;
    throw error;
  }
}

async function verifyPublicProofOnMidnight(data) {
  deviceModule ||= await import('/device-flow.js?v=20260829-4');
  return deviceModule.verifyPublicAttestation(data);
}

async function deviceAction(actionId, message, operation) {
  deviceState.busy = true;
  deviceState.activeAction = actionId;
  deviceState.error = '';
  deviceState.message = message;
  renderWalletControl();
  if (route().name === 'device') main.innerHTML = deviceView();
  try {
    await operation(await loadDeviceModule());
  } catch (error) {
    deviceState.error = error instanceof Error ? error.message : String(error);
  } finally {
    deviceState.busy = false;
    deviceState.activeAction = '';
    renderWalletControl();
    if (route().name === 'device') {
      main.innerHTML = deviceView();
      attachDeviceActions();
    }
  }
}

function attachDeviceActions() {
  const shiftGenerationDate = (days) => {
    const input = document.querySelector('#device-period-date');
    if (!input?.value) return;
    const bounds = sensorDateBounds();
    const shifted = jstDate(new Date(Date.parse(`${input.value}T00:00:00+09:00`) + days * 24 * 60 * 60 * 1000));
    const nextDate = shifted < bounds.minimum ? bounds.minimum : shifted > bounds.maximum ? bounds.maximum : shifted;
    input.value = nextDate;
    deviceState.generationDate = nextDate;
    localStorage.setItem('vsp-generation-date', nextDate);
    const previous = document.querySelector('#device-date-previous');
    const next = document.querySelector('#device-date-next');
    if (previous) previous.disabled = nextDate <= bounds.minimum;
    if (next) next.disabled = nextDate >= bounds.maximum;
  };
  document.querySelector('#device-date-previous')?.addEventListener('click', () => shiftGenerationDate(-1));
  document.querySelector('#device-date-next')?.addEventListener('click', () => shiftGenerationDate(1));
  document.querySelector('#device-identity-create')?.addEventListener('click', () => {
    const value = document.querySelector('#device-id-input')?.value.trim() || '';
    deviceState.deviceId = value;
    localStorage.setItem('vsp-browser-device-id', value);
    return deviceAction('device-identity-create', t('identityCreate'), async (flow) => {
      deviceState.device = await flow.createDevice(value);
      deviceState.message = `${t('deviceId')}: ${deviceState.device.deviceId}`;
    });
  });
  document.querySelector('#device-register')?.addEventListener('click', () => {
    const policyId = document.querySelector('#device-policy')?.value || '';
    return deviceAction('device-register', t('registerAction'), async (flow) => {
      deviceState.provisioned = await flow.registerDevice({ policyId });
      await refreshDeviceHistory(flow);
      deviceState.message = `${t('registered')}: ${deviceState.provisioned.registeredTxId}`;
    });
  });
  document.querySelector('#device-capture')?.addEventListener('click', () => {
    const periodDate = document.querySelector('#device-period-date')?.value || '';
    const mode = document.querySelector('#device-generation-mode')?.value || 'with-outliers';
    deviceState.generationDate = periodDate;
    deviceState.generationMode = mode;
    localStorage.setItem('vsp-generation-date', periodDate);
    localStorage.setItem('vsp-generation-mode', mode);
    return deviceAction('device-capture', t('captureAction'), async (flow) => {
      deviceState.measurement = await flow.generateDailyMeasurements({ periodDate, mode });
      deviceState.selectedDate = periodDate;
      deviceState.proofJob = null;
      deviceState.transaction = null;
      await refreshDeviceHistory(flow);
      deviceState.message = `${periodDate}: ${deviceState.measurement.records.length} samples / ${deviceState.measurement.outlierCount} outliers`;
    });
  });
  document.querySelector('#device-proof-request')?.addEventListener('click', () => deviceAction('device-proof-request', t('proofAction'), async (flow) => {
    deviceState.proofJob = await flow.requestProof({ admitNow: true, periodDate: deviceState.selectedDate });
    await refreshDeviceHistory(flow);
    deviceState.message = `${deviceState.proofJob.proofJobId}: ${deviceState.proofJob.status}`;
  }));
  document.querySelector('#device-submit')?.addEventListener('click', () => deviceAction('device-submit', t('submitAction'), async (flow) => {
    const submitted = await flow.proveAndSubmit((progress) => {
      deviceState.message = progress;
      const element = document.querySelector('#device-progress');
      if (element) element.textContent = progress;
    }, deviceState.selectedDate);
    deviceState.transaction = submitted;
    await refreshDeviceHistory(flow);
    deviceState.transaction ??= submitted;
    deviceState.message = `${t('confirmed')}: ${submitted.transactionId}`;
  }));
  document.querySelectorAll('.device-day-select').forEach((button) => button.addEventListener('click', () => {
    const periodDate = button.dataset.periodDate || '';
    return deviceAction('device-day-select', t('selectDay'), async (flow) => {
      await applySelectedDeviceDay(flow, periodDate);
      deviceState.message = periodDate;
    });
  }));
  document.querySelectorAll('.daily-proof-request').forEach((button) => button.addEventListener('click', () => {
    const periodDate = button.dataset.periodDate || '';
    return deviceAction('device-proof-request', t('requestDaily'), async (flow) => {
      await applySelectedDeviceDay(flow, periodDate);
      deviceState.proofJob = await flow.requestProof({ admitNow: true, periodDate });
      await refreshDeviceHistory(flow);
      deviceState.message = `${periodDate}: ${deviceState.proofJob.status}`;
    });
  }));
  document.querySelectorAll('.daily-submit').forEach((button) => button.addEventListener('click', () => {
    const periodDate = button.dataset.periodDate || '';
    return deviceAction('device-submit', t('submitDaily'), async (flow) => {
      await applySelectedDeviceDay(flow, periodDate);
      const submitted = await flow.proveAndSubmit((progress) => {
        deviceState.message = progress;
        const element = document.querySelector('#device-progress');
        if (element) element.textContent = progress;
      }, periodDate);
      deviceState.transaction = submitted;
      await refreshDeviceHistory(flow);
      deviceState.transaction ??= submitted;
      deviceState.message = `${t('confirmed')}: ${submitted.transactionId}`;
    });
  }));
}

function hourlyChart(windows, policy) {
  if (!windows.length) return '';
  const ordered = [...windows].sort((left, right) => left.periodStart.localeCompare(right.periodStart));
  const values = ordered.flatMap((window) => [window.minimum, window.maximum, window.average]);
  if (policy?.mode !== 'upper-bound') values.push(policy?.minimum);
  if (policy?.mode !== 'lower-bound') values.push(policy?.maximum);
  const finite = values.filter(Number.isFinite);
  const minimum = Math.min(...finite);
  const maximum = Math.max(...finite);
  const span = Math.max(1, maximum - minimum);
  const x = (index) => 20 + (index / Math.max(1, ordered.length - 1)) * 760;
  const y = (value) => 200 - ((value - minimum) / span) * 180;
  const line = (key) => ordered.map((window, index) => `${x(index).toFixed(1)},${y(window[key]).toFixed(1)}`).join(' ');
  const points = ordered.map((window, index) => `<circle class="${windowIsOutlier(window, policy) ? 'outlier' : ''}" cx="${x(index).toFixed(1)}" cy="${y(window.average).toFixed(1)}" r="4"><title>${escapeHtml(dateTime(window.periodStart))}: ${escapeHtml(window.average)} ${escapeHtml(window.unit)}</title></circle>`).join('');
  return `<svg class="chart" viewBox="0 0 800 220" role="img" aria-label="${escapeHtml(t('hourlySummary'))}"><polyline class="minimum-line" points="${line('minimum')}"></polyline><polyline class="maximum-line" points="${line('maximum')}"></polyline><polyline class="average-line" points="${line('average')}"></polyline>${points}</svg>
    <div class="legend"><span class="minimum-key">MIN</span><span class="average-key">AVG</span><span class="maximum-key">MAX</span><span class="outlier-key">${escapeHtml(t('outlierCount'))}</span></div>`;
}

function adminView(data) {
  const project = data.project;
  const dates = [...new Set([
    ...data.windows.map(windowDate),
    ...data.proofJobs.map((job) => job.periodDate),
  ])].sort((left, right) => right.localeCompare(left));
  if (!adminSelectedDate || !dates.includes(adminSelectedDate)) adminSelectedDate = dates[0] || '';
  const selectedDateIndex = dates.indexOf(adminSelectedDate);
  const newerDate = selectedDateIndex > 0 ? dates[selectedDateIndex - 1] : '';
  const olderDate = selectedDateIndex >= 0 && selectedDateIndex < dates.length - 1
    ? dates[selectedDateIndex + 1]
    : '';
  const windows = data.windows
    .filter((window) => windowDate(window) === adminSelectedDate)
    .sort((left, right) => left.periodStart.localeCompare(right.periodStart));
  const proofJob = data.proofJobs.find((job) => job.periodDate === adminSelectedDate);
  const policy = data.policies?.find((candidate) => candidate.policyId === windows[0]?.thresholdPolicyVersion)
    || data.policies?.[0];
  const dayAction = proofJob
    ? `<a class="button-link" href="#/verify/${encodeURIComponent(proofJob.proofJobId)}">${escapeHtml(t('verifyDaily'))}</a>`
    : `<span>${escapeHtml(t('none'))}</span>`;
  return `
    <div class="project-heading"><div><h2>${escapeHtml(localized(project.name, project.nameJa))}</h2>
      <p>${escapeHtml(t('adminIntro'))}</p></div><span class="network-label">LOCAL ADMIN</span></div>
    <div class="notice"><strong>[INFO]</strong><span>${escapeHtml(t('localOnly'))}</span></div>
    <section class="window"><div class="window-title">${escapeHtml(t('flow'))}</div><div class="window-body">${stepper(data.stepper)}</div></section>
    <section class="window section-gap"><div class="window-title">${escapeHtml(t('dailyHistory'))}</div><div class="window-body">
      <div class="daily-heading"><div class="daily-date-navigation"><button class="admin-day-nav" data-period-date="${escapeHtml(olderDate)}" ${olderDate ? '' : 'disabled'}>${escapeHtml(t('olderDay'))}</button><label>${escapeHtml(t('generationDate'))} <select id="admin-day-select">${dates.map((date) => `<option value="${escapeHtml(date)}" ${date === adminSelectedDate ? 'selected' : ''}>${escapeHtml(date)}</option>`).join('')}</select></label><button class="admin-day-nav" data-period-date="${escapeHtml(newerDate)}" ${newerDate ? '' : 'disabled'}>${escapeHtml(t('newerDay'))}</button></div><span>${dayAction}</span></div>
      ${hourlyChart(windows, policy)}
      ${table(
        [t('period'), t('count'), t('minimum'), t('maximum'), t('average'), t('commitment'), t('action')],
        windows.map((window) => `<tr class="${windowIsOutlier(window, policy) ? 'outlier' : ''}"><td class="nowrap">${escapeHtml(dateTime(window.periodStart))}<br>${escapeHtml(dateTime(window.periodEnd))}</td><td class="numeric">${escapeHtml(window.count)}</td><td class="numeric">${escapeHtml(window.minimum)} ${escapeHtml(window.unit)}</td><td class="numeric">${escapeHtml(window.maximum)} ${escapeHtml(window.unit)}</td><td class="numeric">${escapeHtml(window.average)} ${escapeHtml(window.unit)}</td><td class="hash">${escapeHtml(short(window.commitment))}</td><td>${dayAction}</td></tr>`),
      )}
    </div></section>
    <div class="page-grid wave-grid">
      <section class="window"><div class="window-title danger">${escapeHtml(t('anomalies'))}</div><div class="window-body">${table(
        [t('occurred'), t('transition'), t('policy')],
        data.anomalies.slice(0, 20).map((event) => `<tr><td class="nowrap">${escapeHtml(dateTime(event.occurredAt))}</td><td>${status(event.transition)}</td><td>${escapeHtml(event.thresholdPolicyVersion)}</td></tr>`),
      )}</div></section>
    </div>
    <section class="window section-gap"><div class="window-title">${escapeHtml(t('jobs'))}</div><div class="window-body">${table(
      [t('job'), t('period'), t('sampleCount'), t('observedHours'), t('stoppedHours'), t('thresholdResult'), t('status'), t('root'), t('tx'), t('action')],
      data.proofJobs.map((job) => `<tr><td class="hash">${escapeHtml(short(job.proofJobId, 24))}</td><td>${escapeHtml(job.periodDate)}</td><td class="numeric">${escapeHtml(job.sampleCount)}</td><td class="numeric">${escapeHtml(job.observedHourCount)}</td><td class="numeric">${escapeHtml(job.stoppedHourCount)}</td><td>${thresholdResult(job.thresholdSatisfied, job.observedHourCount)}</td><td>${status(job.status)}</td><td class="hash">${escapeHtml(short(job.attestationCommitment))}</td><td class="hash">${escapeHtml(short(job.attestTxId))}</td><td><a class="button-link" href="#/verify/${encodeURIComponent(job.proofJobId)}">${escapeHtml(t('inspect'))}</a></td></tr>`),
    )}</div></section>
    <section class="window section-gap"><div class="window-title">${escapeHtml(t('devices'))}</div><div class="window-body">${table(
      [t('devices'), t('sensor'), t('policy'), t('registry'), t('lastSeen')],
      data.devices.map((device) => `<tr><td>${escapeHtml(localized(device.name, device.nameJa))}<br><small>${escapeHtml(device.id)}</small></td><td>${escapeHtml(device.sensorType)} / ${escapeHtml(device.unit)}</td><td>${escapeHtml(device.thresholdPolicyVersion)}</td><td>${status(device.midnightRegistryStatus)}<br><small>v${escapeHtml(device.midnightRegistrationVersion ?? '—')} / ${escapeHtml(short(device.midnightDeviceCommitment))}</small></td><td class="nowrap">${escapeHtml(dateTime(device.lastSeenAt))}</td></tr>`),
    )}</div></section>`;
}

function attachAdminActions() {
  document.querySelectorAll('.admin-day-nav').forEach((button) => button.addEventListener('click', () => {
    const periodDate = button.dataset.periodDate || '';
    if (!periodDate || !adminData) return;
    adminSelectedDate = periodDate;
    main.innerHTML = withDashboardSyncView(adminView(adminData));
    attachAdminActions();
  }));
  document.querySelector('#admin-day-select')?.addEventListener('change', (event) => {
    adminSelectedDate = event.target.value;
    if (adminData) {
      main.innerHTML = withDashboardSyncView(adminView(adminData));
      attachAdminActions();
    }
  });
}

function check(ok, label) {
  return `<div class="check-row"><span class="check-code ${ok ? '' : 'waiting'}">${escapeHtml(t(ok ? 'checked' : 'waiting'))}</span><strong>${escapeHtml(label)}</strong></div>`;
}

function publicProofList(data, message = '') {
  return `<div class="project-heading"><div><h2>${escapeHtml(t('verifier'))}</h2><p>${escapeHtml(t('verifierIntro'))}</p></div><span class="network-label">${escapeHtml(t('publicView'))}</span></div>
    <section class="window verifier-form"><div class="window-title">${escapeHtml(t('latestProofs'))}</div><div class="window-body">
      <p>${escapeHtml(t('publicProofListIntro'))}</p>${message ? `<p>${escapeHtml(message)}</p>` : ''}
      ${table(
        [t('period'), t('sampleCount'), t('observedHours'), t('stoppedHours'), t('thresholdResult'), t('policyBounds'), t('status'), t('action')],
        (data?.proofs || []).map((proof) => `<tr><td><strong>${escapeHtml(proof.periodDate)}</strong><br><small class="hash">${escapeHtml(short(proof.proofJobId, 24))}</small></td><td class="numeric">${escapeHtml(proof.sampleCount)}</td><td class="numeric">${escapeHtml(proof.observedHourCount)}</td><td class="numeric">${escapeHtml(proof.stoppedHourCount)}</td><td>${thresholdResult(proof.thresholdResult, proof.observedHourCount)}</td><td>${escapeHtml(policyBounds(proof.policy))}</td><td>${status(proof.status)}</td><td><a class="button-link" href="#/verify/${encodeURIComponent(proof.proofJobId)}">${escapeHtml(t('viewDay'))}</a></td></tr>`),
      )}
    </div></section>`;
}

function redactedRawValues(data) {
  const sampleCount = Math.max(0, Number(data.sampleCount) || 0);
  const sampleNumbers = [...new Set([1, 2, 3, sampleCount])].filter((value) => value > 0);
  const rows = sampleNumbers.map((value, index) => `${index === sampleNumbers.length - 1 && value > 3 ? '<div class="raw-value-gap">⋮</div>' : ''}
    <div class="raw-value-row"><span>${escapeHtml(t('sample'))} ${String(value).padStart(4, '0')}</span><span class="raw-value-mask">${escapeHtml(t('redacted'))}</span></div>`).join('');
  return `<section class="window full-width raw-values-window"><div class="window-title danger">${escapeHtml(t('rawSensorValues'))}</div><div class="window-body">
    <div class="raw-values-redacted">
      <div class="raw-values-heading"><strong>${escapeHtml(t('rawSensorValues'))} (${escapeHtml(sampleCount)})</strong><span class="private-stamp"><span class="private-stamp-mark" aria-hidden="true">ZK</span><span><strong>${escapeHtml(t('rawValuesHidden'))}</strong><small>${escapeHtml(t('zkProtected'))}</small></span></span></div>
      <div class="raw-value-list" aria-hidden="true">${rows}</div>
      <p class="raw-values-explanation">${escapeHtml(t('rawValuesExplanation'))}</p>
    </div>
  </div></section>`;
}

function publicProofPipeline(data) {
  const checks = data.checks || {};
  const transaction = data.transactions?.attest || {};
  const publishedThresholdResult = data.observedHourCount === 0 || data.thresholdResult === 'stopped'
    ? t('stoppedResult')
    : data.thresholdResult === false || data.thresholdResult === 'outside-threshold'
      ? t('outsideResult')
      : t('withinResult');
  const allChecksComplete = [
    checks.dailyAttestationRecorded,
    checks.committedHourlyExtrema,
    checks.attestationVerified,
    checks.midnightConfirmed,
  ].every(Boolean);
  const stages = [
    {
      complete: checks.committedHourlyExtrema,
      label: t('pipelineCommitment'),
      detail: `${t('root')}: ${short(data.attestationCommitment, 28)}`,
    },
    {
      complete: checks.attestationVerified,
      label: t('pipelineCircuit'),
      detail: `${t('circuitVersion')}: ${data.circuitVersion}`,
    },
    {
      complete: checks.attestationVerified,
      label: t('pipelinePolicy'),
      detail: `${policyBounds(data.policy)} / ${publishedThresholdResult}`,
    },
    {
      complete: checks.midnightConfirmed,
      label: t('pipelineChain'),
      detailHtml: transaction.txHash
        ? explorerLink('transaction', transaction.txHash, data.network, short(transaction.txHash, 24))
        : escapeHtml(short(transaction.txId, 24)),
    },
    {
      complete: allChecksComplete,
      label: t('pipelineVerifier'),
      detail: `${[checks.dailyAttestationRecorded, checks.committedHourlyExtrema, checks.attestationVerified, checks.midnightConfirmed].filter(Boolean).length} / 4 ${t('checksComplete')}`,
    },
  ];
  return `<section class="window full-width proof-pipeline-window"><div class="window-title">${escapeHtml(t('proofPipeline'))}</div><div class="window-body">
    <p class="proof-pipeline-intro">${escapeHtml(t('proofPipelineIntro'))}</p>
    <ol class="public-proof-pipeline">${stages.map((stage, index) => `<li class="${stage.complete ? 'complete' : 'waiting'}">
      <span class="pipeline-code">${stage.complete ? '✓' : index + 1}</span>
      <strong>${escapeHtml(stage.label)}</strong>
      <small>${stage.detailHtml || escapeHtml(stage.detail)}</small>
    </li>`).join('')}</ol>
  </div></section>`;
}

function verifierView(list, data, chainVerification = { state: 'idle', error: '' }) {
  const confirmed = data.checks.midnightConfirmed;
  const chainNotice = chainVerification.state === 'checking'
    ? `<div class="dashboard-sync-state syncing"><div><strong>${escapeHtml(t('chainCheckInProgress'))}</strong><span>${escapeHtml(t('chainCheckInProgressDetail'))}</span></div></div><div class="progress-shell dashboard-sync-progress" aria-hidden="true"><div class="progress-bar"></div></div>`
    : chainVerification.state === 'complete'
      ? `<div class="dashboard-sync-state complete"><div><strong>${escapeHtml(t('chainCheckComplete'))}</strong><span>${escapeHtml(t('chainCheckCompleteDetail'))}</span></div></div>`
      : chainVerification.state === 'failed'
        ? `<div class="dashboard-sync-state failed"><div><strong>${escapeHtml(t('chainCheckFailed'))}</strong><span>${escapeHtml(chainVerification.error)}</span></div></div>`
        : '';
  return `${publicProofList(list)}
    ${chainNotice}
    <div class="page-grid section-gap">
      <section class="window"><div class="window-title ${confirmed ? 'success' : 'inactive'}">${escapeHtml(t('claim'))}</div><div class="window-body">
        <p class="claim-text">${escapeHtml(localized(data.claim, data.claimJa))}</p>
        ${!confirmed ? `<div class="notice"><strong>${escapeHtml(t('waiting'))}</strong><span>${escapeHtml(t('pendingClaim'))}</span></div>` : ''}
      </div></section>
      <section class="window"><div class="window-title">${escapeHtml(t('checks'))}</div><div class="window-body check-list">
        ${check(data.checks.dailyAttestationRecorded, t('dataset'))}${check(data.checks.committedHourlyExtrema, t('inclusion'))}
        ${check(data.checks.attestationVerified, t('threshold'))}${check(data.checks.midnightConfirmed, t('midnight'))}
      </div></section>
      <section class="window"><div class="window-title">${escapeHtml(t('publicData'))}</div><div class="window-body"><dl class="definition-grid">
        <dt>${escapeHtml(t('proofId'))}</dt><dd class="hash">${escapeHtml(data.proofJobId)}</dd><dt>${escapeHtml(t('period'))}</dt><dd>${escapeHtml(data.periodDate)}</dd>
        <dt>${escapeHtml(t('sampleCount'))}</dt><dd>${escapeHtml(data.sampleCount)}</dd><dt>${escapeHtml(t('observedHours'))}</dt><dd>${escapeHtml(data.observedHourCount)} / 24</dd>
        <dt>${escapeHtml(t('stoppedHours'))}</dt><dd>${escapeHtml(data.stoppedHourCount)} / 24</dd><dt>${escapeHtml(t('thresholdResult'))}</dt><dd>${thresholdResult(data.thresholdResult, data.observedHourCount)}</dd><dt>${escapeHtml(t('policyId'))}</dt><dd>${escapeHtml(data.thresholdPolicyVersion)}</dd>
        <dt>${escapeHtml(t('policyMode'))}</dt><dd>${escapeHtml(policyModeLabel(data.policy.mode))}</dd><dt>${escapeHtml(t('policyBounds'))}</dt><dd>${escapeHtml(policyBounds(data.policy))}</dd>
        <dt>${escapeHtml(t('policyVersion'))}</dt><dd>${escapeHtml(data.policy.version)}</dd><dt>${escapeHtml(t('sensor'))}</dt><dd>${escapeHtml(sensorTypeLabel(data.policy.sensorType))} / ${escapeHtml(data.policy.unit)}</dd>
        <dt>${escapeHtml(t('assignment'))}</dt><dd class="hash">${escapeHtml(data.assignmentKey)}</dd><dt>${escapeHtml(t('schemaVersion'))}</dt><dd>${escapeHtml(data.schemaVersion)}</dd>
        <dt>${escapeHtml(t('circuitVersion'))}</dt><dd>${escapeHtml(data.circuitVersion)}</dd><dt>${escapeHtml(t('root'))}</dt><dd class="hash">${escapeHtml(data.attestationCommitment)}</dd>
        <dt>${escapeHtml(t('status'))}</dt><dd>${status(data.status)}</dd>
        <dt>${escapeHtml(t('network'))}</dt><dd>${escapeHtml(data.network)}</dd><dt>${escapeHtml(t('contract'))}</dt><dd class="hash">${explorerLink('contract', data.contractAddress, data.network)}</dd>
        <dt>${escapeHtml(t('tx'))}</dt><dd class="hash">${escapeHtml(data.transactions.attest?.txId || '—')}</dd>
        <dt>${escapeHtml(t('txHash'))}</dt><dd class="hash">${explorerLink('transaction', data.transactions.attest?.txHash, data.network)}</dd>
        <dt>${escapeHtml(t('blockHeight'))}</dt><dd class="hash">${explorerLink('block', data.transactions.attest?.blockHeight, data.network)}</dd>
      </dl></div></section>
      <section class="window"><div class="window-title danger">${escapeHtml(t('privateData'))}</div><div class="window-body"><div class="privacy-box">
        ${escapeHtml(t('privateRawValues'))} ... ${escapeHtml(t('private'))}<br>${escapeHtml(t('privateHourlySummary'))} .... ${escapeHtml(t('private'))}<br>${escapeHtml(t('privateProofSecret'))} .... ${escapeHtml(t('private'))}<br>${escapeHtml(t('publicHourStatus'))} ....... ${escapeHtml(t('thresholdPublic'))}<br>${escapeHtml(t('publicThreshold'))} .... ${escapeHtml(t('thresholdPublic'))}
      </div></div></section>
      ${publicProofPipeline(data)}
      ${redactedRawValues(data)}
    </div>`;
}

function route() {
  const parts = location.hash.replace(/^#\/?/u, '').split('/');
  if (parts[0] === 'verify') return { name: 'verify', id: parts[1] || '' };
  if (parts[0] === 'device') return { name: 'device', id: '' };
  return { name: 'admin', id: '' };
}
function activate(name) {
  document.querySelectorAll('[data-nav]').forEach((link) => link.classList.toggle('active', link.dataset.nav === name));
  breadcrumb.textContent = t(name);
}
function renderError(error) {
  main.innerHTML = `<section class="window error-window"><div class="window-title danger">${escapeHtml(t('error'))}</div><div class="window-body"><p>${escapeHtml(t('failed'))}</p><p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p><button id="retry-button">${escapeHtml(t('retry'))}</button></div></section>`;
  document.querySelector('#retry-button')?.addEventListener('click', () => render());
}
async function render({ showLoading = true, startInitialSync = true } = {}) {
  const current = route();
  activate(current.name);
  if (showLoading) {
    main.innerHTML = `<section class="window"><div class="window-title">${escapeHtml(t('checking'))}</div><div class="window-body">${escapeHtml(t('loading'))}</div></section>`;
  }
  try {
    if (current.name === 'device') {
      await loadDeviceModule();
      footerSource.textContent = `${t('source')}: Device / Cloudflare / Midnight`;
      main.innerHTML = deviceView();
      attachDeviceActions();
    } else if (current.name === 'admin') {
      const data = await fetchJson(`/api/v1/projects/${encodeURIComponent(projectId)}/dashboard`, true);
      adminData = data;
      footerSource.textContent = `${t('source')}: ${data.source}`;
      main.innerHTML = withDashboardSyncView(adminView(data));
      attachAdminActions();
    } else if (!current.id) {
      const list = await fetchJson('/api/v1/public/proofs?limit=100');
      footerSource.textContent = `${t('source')}: public API`;
      main.innerHTML = withDashboardSyncView(publicProofList(list));
    } else {
      const [list, data] = await Promise.all([
        fetchJson('/api/v1/public/proofs?limit=100'),
        fetchJson(`/api/v1/public/proofs/${encodeURIComponent(current.id)}`),
      ]);
      footerSource.textContent = `${t('source')}: public API / Midnight Indexer`;
      if (data.status === 'confirmed' && data.transactions?.attest) {
        const pending = {
          ...data,
          resultVerified: false,
          checks: {
            dailyAttestationRecorded: false,
            committedHourlyExtrema: false,
            attestationVerified: false,
            midnightConfirmed: false,
          },
        };
        main.innerHTML = withDashboardSyncView(verifierView(
          list,
          pending,
          { state: 'checking', error: '' },
        ));
        try {
          const verified = await verifyPublicProofOnMidnight(data);
          const complete = Object.values(verified.checks).every(Boolean);
          main.innerHTML = withDashboardSyncView(verifierView(
            list,
            { ...data, resultVerified: complete, checks: verified.checks },
            complete
              ? { state: 'complete', error: '' }
              : { state: 'failed', error: t('chainCheckFailed') },
          ));
        } catch (error) {
          main.innerHTML = withDashboardSyncView(verifierView(
            list,
            pending,
            {
              state: 'failed',
              error: error instanceof Error ? error.message : String(error),
            },
          ));
        }
      } else {
        main.innerHTML = withDashboardSyncView(verifierView(list, data));
      }
    }
    updateReloadControl();
    if (showLoading) main.focus({ preventScroll: true });
    if (startInitialSync && current.name !== 'device' && dashboardSyncState === 'idle') {
      void startLocalDashboardSync();
    }
  } catch (error) { renderError(error); }
}

function applyLanguage() {
  document.documentElement.lang = locale();
  document.title = t('title');
  document.querySelector('#system-title').textContent = t('title');
  document.querySelector('#system-subtitle').textContent = t('subtitle');
  document.querySelector('#language-label').textContent = t('language');
  document.querySelector('#nav-admin').textContent = t('admin');
  document.querySelector('#nav-device').textContent = t('device');
  document.querySelector('#nav-verify').textContent = t('verifier');
  document.querySelector('#location-label').textContent = t('location');
  document.querySelector('#footer-privacy').textContent = t('privacy');
  languageSelect.options[0].textContent = t('system');
  languageSelect.value = selectedLanguage;
  renderWalletControl();
  updateReloadControl();
}
function renderWalletControl() {
  const connected = Boolean(deviceState.wallet);
  const connecting = deviceState.busy && deviceState.activeAction === 'wallet-connect-button';
  const walletLabel = connected
    ? `✓ ${deviceState.wallet.walletName} · ${short(deviceState.wallet.shieldedAddress, 18)}`
    : connecting ? t('walletConnecting') : t('walletConnect');
  walletConnectButton.textContent = walletLabel;
  walletConnectButton.title = connected
    ? `${t('walletConnected')}: ${deviceState.wallet.shieldedAddress}`
    : t('walletRequiredBody');
  walletConnectButton.disabled = connected || deviceState.busy;
  walletConnectButton.classList.toggle('connected', connected);
  walletConnectButton.classList.toggle('next-action', !connected && !connecting);
  walletConnectButton.classList.toggle('active-action', connecting);
  walletConnectButton.setAttribute('aria-pressed', String(connected));
}
async function health() {
  try {
    const data = route().name === 'device'
      ? (await loadDeviceModule(), { ok: true })
      : await fetchJson('/health');
    headerStatus.textContent = data.ok ? t('online') : t('error');
    headerStatus.classList.toggle('error', !data.ok);
  } catch { headerStatus.textContent = t('error'); headerStatus.classList.add('error'); }
}
function clock() {
  footerClock.textContent = new Intl.DateTimeFormat(locale() === 'ja' ? 'ja-JP' : 'en-GB', {
    dateStyle: 'short', timeStyle: 'medium', hour12: false,
  }).format(new Date());
}

languageSelect.addEventListener('change', () => {
  selectedLanguage = languageSelect.value;
  localStorage.setItem('vsp-language', selectedLanguage);
  applyLanguage();
  render();
});
walletConnectButton.addEventListener('click', () => deviceAction('wallet-connect-button', t('walletConnect'), async (flow) => {
  deviceState.wallet = await flow.connectWallet();
  deviceState.message = `${deviceState.wallet.walletName} / ${deviceState.wallet.networkId} / ${t('feeSponsoredLabel')}`;
}));
reloadButton.addEventListener('click', () => {
  if (isLocalDashboard() && route().name !== 'device') {
    void startLocalDashboardSync(true);
  } else {
    void render();
  }
});
window.addEventListener('hashchange', () => render());
if (!location.hash) location.hash = '#/device';
applyLanguage();
clock();
setInterval(clock, 1000);
health();
setInterval(health, 60_000);
render();
