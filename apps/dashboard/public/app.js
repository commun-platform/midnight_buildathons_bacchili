const projectId = 'measurement-authenticity-01';
const main = document.querySelector('#main-content');
const breadcrumb = document.querySelector('#breadcrumb');
const headerStatus = document.querySelector('#header-status');
const footerSource = document.querySelector('#footer-source');
const footerClock = document.querySelector('#footer-clock');
const reloadButton = document.querySelector('#reload-button');
const languageSelect = document.querySelector('#language-select');

const languageStorageKey = 'measurement-proof-language';
const supportedLocales = new Set(['en', 'ja']);
const midnightExplorerBaseUrl = 'https://preprod.midnightexplorer.com';

const messages = {
  en: {
    systemTitle: 'Measurement Data Authenticity Proof System',
    systemSubtitle: 'MEASUREMENT DATA AUTHENTICITY PROOF / MIDNIGHT PREPROD',
    skipLink: 'Skip to main content',
    language: 'Language',
    systemLanguage: 'System',
    navDashboard: 'Project Overview',
    navReadings: 'Time-Series Data',
    navAttestations: 'Daily Proof History',
    refresh: 'Refresh',
    location: 'Location:',
    footerPrivacy: 'Private values are not stored on the Midnight Public Ledger',
    sourceChecking: 'Data source: checking',
    sourceLabel: 'Data source: {source}',
    sourceD1: 'Cloudflare D1',
    sourceTurso: 'Turso',
    timezone: 'Reference timezone: {timezone}',
    latestReadings: 'Latest Measurements (Project Devices)',
    noLatestReadings: 'Waiting for the first temperature measurement from the Edge Device.',
    lastUpdated: 'Last updated {time}',
    outlierBracket: ' [OUTLIER]',
    edgeDevices: 'Edge Devices',
    deviceName: 'Device Name',
    type: 'Type',
    sensor: 'Sensor',
    lastReceived: 'Last Received',
    status: 'Status',
    todayReception: "Today's Reception",
    targetDate: 'Date',
    receivedCount: 'Received',
    expectedCount: 'Expected',
    estimatedMissing: 'Estimated Missing',
    outliers: 'Outliers',
    connected: 'Connected',
    records: '{count} records',
    devicesCount: '{online} / {total} devices',
    collectionProgressAria: "Today's collection progress",
    collectionProgress: 'Collection progress {value}%',
    latestDailyAttestation: 'Latest Daily Attestation',
    processingStatus: 'Processing Status',
    sampleCount: 'Samples',
    midnightTx: 'Midnight Tx',
    pending: 'Pending',
    showProofDetails: 'Show Proof Details',
    noDailyAttestation: 'No daily attestation is available.',
    latestConfirmedProof: 'Latest Midnight-Confirmed Proof',
    verificationResult: 'Verification Result',
    compliantVerified: 'Compliant (ZKP Confirmed)',
    nonCompliant: 'Non-compliant',
    merkleRoot: 'Merkle Root',
    verifyTx: 'Verify Tx',
    openThirdParty: 'Open Third-Party Verification',
    noConfirmedProof: 'No confirmed proof is available.',
    all: 'All',
    device: 'Device',
    sensorType: 'Sensor Type',
    outlierFilter: 'Outlier',
    onlyOutliers: 'Outliers Only',
    onlyNormal: 'Normal Only',
    proofStatus: 'Proof Status',
    apply: 'Apply',
    noChartData: 'There is not enough data to draw the chart.',
    chartAria: 'Time-series chart for the selected sensor',
    maximum: 'Max {value}',
    minimum: 'Min {value}',
    receivedValue: 'Received Value',
    outlier: 'Outlier',
    searchCriteria: 'Search Criteria',
    timeSeriesChart: 'Time-Series Chart (up to 60 records)',
    readingList: 'Measurement List / {count} records',
    measuredAt: 'Measured At',
    value: 'Value',
    dailyProof: 'Daily Proof',
    transactionVerification: 'Tx / Verification',
    normal: 'Normal',
    verifyTransaction: 'Verify Tx',
    processStatus: 'Process Status',
    noReadings: 'No measurements match the selected criteria.',
    dailyHistory: 'Daily Attestation History',
    explanationLabel: '[INFO]',
    explanationText: 'Each sensor row from the same day is associated with the same attestation.',
    receivedExpected: 'Received / Expected',
    missing: 'Missing',
    datasetTx: 'Dataset Tx',
    operation: 'Action',
    details: 'Details',
    noHistory: 'No attestation history is available.',
    thirdPartyVerification: 'Third-Party Verification / {date}',
    thirdPartySubtitle: 'Displays the Midnight result using public information only.',
    zkpResult: 'ZKP Verification Result',
    datasetRegistered: 'Daily Dataset Registered',
    datasetRegisteredDescription: 'The Merkle Root and period are registered on Midnight.',
    merkleInclusion: 'Merkle Inclusion',
    merkleInclusionDescription: 'The selected value is included in the registered dataset.',
    privateRange: 'Private Range',
    privateRangeDescription: 'The value is within policy without disclosing the value or thresholds.',
    midnightConfirmation: 'Midnight Confirmation',
    midnightConfirmationDescription: 'The verification transaction is confirmed on Preprod.',
    publicAttestation: 'Public Attestation Information',
    contract: 'Contract',
    datasetBlock: 'Dataset Block',
    verifyBlock: 'Verify Block',
    privacyBoundary: 'Privacy Boundary / Non-Public Information',
    private: 'PRIVATE',
    publicFields: 'PUBLIC FIELDS',
    publicFieldMerkleRoot: 'Merkle Root',
    publicFieldPeriod: 'Period',
    publicFieldSampleCount: 'Sample Count',
    publicFieldVerificationResult: 'Verification Result',
    publicFieldTransactionId: 'Tx ID',
    statusWindow: 'Status',
    loadingBody: 'Loading data. Please wait.',
    systemError: 'System Error',
    fetchFailed: 'Could not retrieve data.',
    retry: 'Retry',
    routeDashboard: 'Project Overview',
    routeReadings: 'Time-Series Data',
    routeAttestations: 'Daily Proof History',
    routeVerify: 'Third-Party Verification',
    loadingTitle: '{title} - Loading',
    missingAttestation: 'Attestation ID is missing.',
    healthOnline: 'SYSTEM: ONLINE',
    healthDegraded: 'SYSTEM: DEGRADED',
    healthError: 'SYSTEM: CONNECTION ERROR',
    statusPending: 'Pending',
    statusAggregating: 'Aggregating',
    statusProving: 'Generating Proof',
    statusSubmitted: 'Tx Submitted',
    statusConfirmed: 'Confirmed',
    statusFailed: 'Failed',
    statusOnline: 'Online',
    statusDelayed: 'Delayed',
    statusOffline: 'Offline',
    sensorTemperature: 'Temperature',
    mainNavigation: 'Main navigation',
    openInMidnightExplorer: 'Open in Midnight Explorer (new tab)',
  },
  ja: {
    systemTitle: '計測データ真贋性証明システム',
    systemSubtitle: '計測データ真贋性証明 / MIDNIGHT PREPROD',
    skipLink: '本文へ移動',
    language: '言語',
    systemLanguage: 'システム',
    navDashboard: 'プロジェクト概要',
    navReadings: '時系列データ',
    navAttestations: '日次証明履歴',
    refresh: '最新情報に更新',
    location: '現在位置:',
    footerPrivacy: 'Private値はMidnight Public Ledgerへ保存されません',
    sourceChecking: 'データソース: 確認中',
    sourceLabel: 'データソース: {source}',
    sourceD1: 'Cloudflare D1',
    sourceTurso: 'Turso',
    timezone: '基準時刻: {timezone}',
    latestReadings: '最新センサー値（プロジェクト所属デバイス）',
    noLatestReadings: 'Edge Deviceから最初の温度データが届くまで待機しています。',
    lastUpdated: '最終更新 {time}',
    outlierBracket: ' [外れ値]',
    edgeDevices: 'Edge Device 一覧',
    deviceName: 'デバイス名',
    type: '種別',
    sensor: 'センサー',
    lastReceived: '最終受信日時',
    status: '状態',
    todayReception: '本日の受信状況',
    targetDate: '対象日',
    receivedCount: '受信件数',
    expectedCount: '期待件数',
    estimatedMissing: '欠損見込',
    outliers: '外れ値',
    connected: '接続中',
    records: '{count} 件',
    devicesCount: '{online} / {total} 台',
    collectionProgressAria: '本日の受信進捗',
    collectionProgress: '収集進捗 {value}%',
    latestDailyAttestation: '最新の日次Attestation',
    processingStatus: '処理状態',
    sampleCount: '対象件数',
    midnightTx: 'Midnight Tx',
    pending: '処理待ち',
    showProofDetails: '証明詳細を表示',
    noDailyAttestation: '日次Attestationはまだありません。',
    latestConfirmedProof: '直近のMidnight確認済み証明',
    verificationResult: '検証結果',
    compliantVerified: '適合（ZKP確認済み）',
    nonCompliant: '不適合',
    merkleRoot: 'Merkle Root',
    verifyTx: 'Verify Tx',
    openThirdParty: '第三者検証ページを開く',
    noConfirmedProof: '確認済み証明はありません。',
    all: 'すべて',
    device: 'デバイス',
    sensorType: 'センサー種別',
    outlierFilter: '外れ値',
    onlyOutliers: '外れ値のみ',
    onlyNormal: '正常値のみ',
    proofStatus: '証明状態',
    apply: '条件を適用',
    noChartData: 'グラフ表示に必要なデータがありません。',
    chartAria: '選択中センサーの時系列グラフ',
    maximum: '最大 {value}',
    minimum: '最小 {value}',
    receivedValue: '受信値',
    outlier: '外れ値',
    searchCriteria: '検索条件',
    timeSeriesChart: '時系列グラフ（最大60件）',
    readingList: 'センサー値一覧 / {count}件',
    measuredAt: '測定日時',
    value: '値',
    dailyProof: '日次証明',
    transactionVerification: 'Tx・検証',
    normal: '正常',
    verifyTransaction: 'Txを検証',
    processStatus: '処理状況',
    noReadings: '指定条件に該当するセンサー値はありません。',
    dailyHistory: '日次Attestation処理履歴',
    explanationLabel: '[説明]',
    explanationText: '同一日の日次データに属する各センサー行は、同じAttestationへ関連付けられます。',
    receivedExpected: '受信/期待',
    missing: '欠損',
    datasetTx: 'Dataset Tx',
    operation: '操作',
    details: '詳細',
    noHistory: 'Attestation履歴はありません。',
    thirdPartyVerification: '第三者検証 / {date}',
    thirdPartySubtitle: '公開情報のみを使用してMidnight上の確認結果を表示します。',
    zkpResult: 'ZKP検証結果',
    datasetRegistered: '日次データセット登録',
    datasetRegisteredDescription: 'Merkle Rootと期間がMidnightへ登録されている',
    merkleInclusion: 'Merkle Inclusion',
    merkleInclusionDescription: '選択値が登録済みデータセットに含まれる',
    privateRange: 'Private Range',
    privateRangeDescription: '値と閾値を公開せず、規定範囲内である',
    midnightConfirmation: 'Midnight Confirmation',
    midnightConfirmationDescription: '検証TxがPreprodで確認されている',
    publicAttestation: '公開Attestation情報',
    contract: 'Contract',
    datasetBlock: 'Dataset Block',
    verifyBlock: 'Verify Block',
    privacyBoundary: 'Privacy Boundary / 非公開情報',
    private: '非公開',
    publicFields: '公開項目',
    publicFieldMerkleRoot: 'Merkle Root',
    publicFieldPeriod: '期間',
    publicFieldSampleCount: '件数',
    publicFieldVerificationResult: '検証結果',
    publicFieldTransactionId: 'Tx ID',
    statusWindow: '処理状況',
    loadingBody: 'データを読み込んでいます。しばらくお待ちください。',
    systemError: 'システムエラー',
    fetchFailed: 'データを取得できませんでした。',
    retry: '再試行',
    routeDashboard: 'プロジェクト概要',
    routeReadings: '時系列データ',
    routeAttestations: '日次証明履歴',
    routeVerify: '第三者検証',
    loadingTitle: '{title} - 読込中',
    missingAttestation: 'Attestation IDが指定されていません',
    healthOnline: 'システム: 正常',
    healthDegraded: 'システム: 注意',
    healthError: 'システム: 接続エラー',
    statusPending: '処理待ち',
    statusAggregating: '集計中',
    statusProving: '証明生成中',
    statusSubmitted: 'Tx送信済み',
    statusConfirmed: '確認済み',
    statusFailed: '失敗',
    statusOnline: 'オンライン',
    statusDelayed: '遅延',
    statusOffline: 'オフライン',
    sensorTemperature: '温度',
    mainNavigation: 'メインメニュー',
    openInMidnightExplorer: 'Midnight Explorerで開く（新しいタブ）',
  },
};

const state = {
  summary: null,
  readings: [],
  attestations: [],
  filters: {
    device: '',
    sensor: '',
    outlier: '',
    status: '',
  },
};

function getStoredLanguage() {
  try {
    const value = localStorage.getItem(languageStorageKey);
    return value === 'en' || value === 'ja' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

function systemLocale() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const language of languages) {
    const candidate = String(language ?? '').toLowerCase().split('-')[0];
    if (supportedLocales.has(candidate)) return candidate;
  }
  return 'en';
}

let languagePreference = getStoredLanguage();
let locale = languagePreference === 'auto' ? systemLocale() : languagePreference;

function t(key, parameters = {}) {
  const template = messages[locale]?.[key] ?? messages.en[key] ?? key;
  return Object.entries(parameters).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
    template,
  );
}

function localeTag() {
  return locale === 'ja' ? 'ja-JP' : 'en-US';
}

function localized(primary, japanese) {
  return locale === 'ja' && japanese ? japanese : primary;
}

function formatNumber(value) {
  return Number(value).toLocaleString(localeTag());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return escapeHtml(value);
  return new Intl.DateTimeFormat(localeTag(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function shortHash(value) {
  if (!value) return '—';
  return `${value.slice(0, 12)}...${value.slice(-8)}`;
}

function explorerUrl(resource, value) {
  const paths = {
    transaction: 'transactions',
    block: 'blocks',
    contract: 'contracts',
  };
  const rawValue = String(value);
  const normalizedValue = (
    (resource === 'transaction' || resource === 'contract') && /^[a-f\d]{64}$/i.test(rawValue)
  ) ? `0x${rawValue}` : rawValue;
  return `${midnightExplorerBaseUrl}/${paths[resource]}/${encodeURIComponent(normalizedValue)}`;
}

function explorerLink(resource, value, options = {}) {
  if (value === null || value === undefined || value === '') {
    return escapeHtml(options.fallback ?? '—');
  }
  const rawValue = String(value);
  const rawLabel = String(options.label ?? rawValue);
  const label = options.short ? shortHash(rawLabel) : rawLabel;
  const accessibleLabel = `${rawLabel} — ${t('openInMidnightExplorer')}`;
  return `<a class="explorer-link hash" href="${explorerUrl(resource, rawValue)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(accessibleLabel)}" title="${escapeHtml(t('openInMidnightExplorer'))}">${escapeHtml(label)} <span aria-hidden="true">↗</span></a>`;
}

function transactionExplorerLink(transaction, options = {}) {
  if (!transaction?.txId) return escapeHtml(options.fallback ?? '—');
  const resource = transaction.txHash ? 'transaction' : 'block';
  const value = transaction.txHash ?? transaction.blockHeight;
  if (!value) return `<span class="hash">${escapeHtml(options.short ? shortHash(transaction.txId) : transaction.txId)}</span>`;
  return explorerLink(resource, value, { ...options, label: transaction.txId });
}

function explorerHomeLink(label) {
  return `<a class="network-label" href="${midnightExplorerBaseUrl}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(t('openInMidnightExplorer'))}">${escapeHtml(label)} <span aria-hidden="true">↗</span></a>`;
}

function statusLabel(status) {
  const labels = {
    pending: 'statusPending',
    aggregating: 'statusAggregating',
    proving: 'statusProving',
    submitted: 'statusSubmitted',
    confirmed: 'statusConfirmed',
    failed: 'statusFailed',
    online: 'statusOnline',
    delayed: 'statusDelayed',
    offline: 'statusOffline',
  };
  return t(labels[status] ?? 'statusPending');
}

function sensorLabel(sensor) {
  const labels = {
    temperature: 'sensorTemperature',
  };
  return labels[sensor] ? t(labels[sensor]) : sensor;
}

function statusTag(status) {
  const safe = ['pending', 'aggregating', 'proving', 'submitted', 'confirmed', 'failed', 'online', 'delayed', 'offline']
    .includes(status) ? status : 'pending';
  return `<span class="status status-${safe}">${escapeHtml(statusLabel(safe))}</span>`;
}

function sourceLabel(source) {
  if (source === 'd1') return t('sourceD1');
  if (source === 'turso') return t('sourceTurso');
  return source;
}

function updateFooterSource() {
  footerSource.textContent = state.summary
    ? t('sourceLabel', { source: sourceLabel(state.summary.source) })
    : t('sourceChecking');
}

function applyShellTranslations() {
  document.documentElement.lang = locale;
  document.title = t('systemTitle');
  document.querySelector('#skip-link').textContent = t('skipLink');
  document.querySelector('#system-title').textContent = t('systemTitle');
  document.querySelector('#system-subtitle').textContent = t('systemSubtitle');
  document.querySelector('#language-label').textContent = t('language');
  document.querySelector('#nav-dashboard').textContent = t('navDashboard');
  document.querySelector('#nav-readings').textContent = t('navReadings');
  document.querySelector('#nav-attestations').textContent = t('navAttestations');
  document.querySelector('#main-nav').setAttribute('aria-label', t('mainNavigation'));
  document.querySelector('#location-label').textContent = t('location');
  document.querySelector('#footer-privacy').textContent = t('footerPrivacy');
  reloadButton.textContent = t('refresh');
  languageSelect.options[0].textContent = t('systemLanguage');
  languageSelect.value = languagePreference;
  updateFooterSource();
}

async function fetchJson(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: 'application/json', ...(options?.headers ?? {}) },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function loadSummary(force = false) {
  if (!state.summary || force) {
    state.summary = await fetchJson(`/api/v1/projects/${encodeURIComponent(projectId)}/summary`);
    updateFooterSource();
  }
  return state.summary;
}

function setActiveNavigation(route) {
  document.querySelectorAll('[data-nav]').forEach((link) => {
    link.classList.toggle('active', link.dataset.nav === route);
  });
}

function projectHeader(summary) {
  return `
    <div class="project-heading">
      <div>
        <h2>${escapeHtml(localized(summary.project.name, summary.project.nameJa))}</h2>
        <p>${escapeHtml(localized(summary.project.organization, summary.project.organizationJa))} / ${escapeHtml(t('timezone', { timezone: summary.project.timezone }))}</p>
      </div>
      ${explorerHomeLink('MIDNIGHT PREPROD')}
    </div>`;
}

function metricCards(readings) {
  return readings.map((reading) => `
    <article class="metric-card">
      <h3>${escapeHtml(localized(reading.deviceName, reading.deviceNameJa))} / ${escapeHtml(sensorLabel(reading.sensorType))}</h3>
      <p class="metric-value">${escapeHtml(reading.value)} <small>${escapeHtml(reading.unit)}</small></p>
      <p class="metric-meta">${escapeHtml(t('lastUpdated', { time: formatDateTime(reading.recordedAt) }))}${reading.isOutlier ? escapeHtml(t('outlierBracket')) : ''}</p>
    </article>`).join('');
}

function dashboardView(summary) {
  const collection = summary.collection;
  const completion = collection.expectedCount > 0
    ? Math.min((collection.receivedCount / collection.expectedCount) * 100, 100)
    : 0;
  const latest = summary.latestAttestation;
  const confirmed = summary.lastConfirmedAttestation;
  return `
    ${projectHeader(summary)}
    <div class="page-grid">
      <section class="window full-width">
        <div class="window-title">${escapeHtml(t('latestReadings'))}</div>
        <div class="window-body">
          ${summary.latestReadings.length
            ? `<div class="metric-grid">${metricCards(summary.latestReadings)}</div>`
            : `<div class="empty-state">${escapeHtml(t('noLatestReadings'))}</div>`}
        </div>
      </section>

      <section class="window">
        <div class="window-title">${escapeHtml(t('edgeDevices'))}</div>
        <div class="window-body">
          <div class="data-table-wrap">
            <table class="data-table">
              <thead><tr><th>${escapeHtml(t('deviceName'))}</th><th>${escapeHtml(t('type'))}</th><th>${escapeHtml(t('sensor'))}</th><th>${escapeHtml(t('lastReceived'))}</th><th>${escapeHtml(t('status'))}</th></tr></thead>
              <tbody>
                ${summary.devices.map((device) => `
                  <tr>
                    <td>${escapeHtml(localized(device.name, device.nameJa))}<br><small>${escapeHtml(device.id)}</small></td>
                    <td>${escapeHtml(localized(device.deviceType, device.deviceTypeJa))}</td>
                    <td>${escapeHtml(sensorLabel(device.sensorType))}</td>
                    <td class="nowrap">${formatDateTime(device.lastSeenAt)}</td>
                    <td>${statusTag(device.connectionState)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <aside class="window">
        <div class="window-title">${escapeHtml(t('todayReception'))}</div>
        <div class="window-body">
          <dl class="definition-grid">
            <dt>${escapeHtml(t('targetDate'))}</dt><dd>${escapeHtml(collection.date)}</dd>
            <dt>${escapeHtml(t('receivedCount'))}</dt><dd class="numeric">${escapeHtml(t('records', { count: formatNumber(collection.receivedCount) }))}</dd>
            <dt>${escapeHtml(t('expectedCount'))}</dt><dd class="numeric">${escapeHtml(t('records', { count: formatNumber(collection.expectedCount) }))}</dd>
            <dt>${escapeHtml(t('estimatedMissing'))}</dt><dd class="numeric">${escapeHtml(t('records', { count: formatNumber(collection.missingCount) }))}</dd>
            <dt>${escapeHtml(t('outliers'))}</dt><dd class="numeric">${escapeHtml(t('records', { count: formatNumber(collection.outlierCount) }))}</dd>
            <dt>${escapeHtml(t('connected'))}</dt><dd class="numeric">${escapeHtml(t('devicesCount', { online: collection.onlineDeviceCount, total: collection.deviceCount }))}</dd>
          </dl>
          <div class="progress-shell" aria-label="${escapeHtml(t('collectionProgressAria'))}">
            <div class="progress-bar" style="width:${completion.toFixed(2)}%"></div>
          </div>
          <p class="progress-label">${escapeHtml(t('collectionProgress', { value: completion.toFixed(1) }))}</p>
        </div>
      </aside>

      <section class="window">
        <div class="window-title inactive">${escapeHtml(t('latestDailyAttestation'))}</div>
        <div class="window-body">
          ${latest ? `
            <dl class="definition-grid">
              <dt>${escapeHtml(t('targetDate'))}</dt><dd>${escapeHtml(latest.periodDate)}</dd>
              <dt>${escapeHtml(t('processingStatus'))}</dt><dd>${statusTag(latest.status)}</dd>
              <dt>${escapeHtml(t('sampleCount'))}</dt><dd>${escapeHtml(t('records', { count: formatNumber(latest.sampleCount) }))}</dd>
              <dt>${escapeHtml(t('midnightTx'))}</dt><dd>${transactionExplorerLink(latest.verifyTx, { short: true, fallback: t('pending') })}</dd>
            </dl>
            <p><button type="button" class="compact-button" data-open-attestation="${escapeHtml(latest.id)}">${escapeHtml(t('showProofDetails'))}</button></p>`
            : `<div class="empty-state">${escapeHtml(t('noDailyAttestation'))}</div>`}
        </div>
      </section>

      <section class="window">
        <div class="window-title success">${escapeHtml(t('latestConfirmedProof'))}</div>
        <div class="window-body">
          ${confirmed ? `
            <dl class="definition-grid">
              <dt>${escapeHtml(t('targetDate'))}</dt><dd>${escapeHtml(confirmed.periodDate)}</dd>
              <dt>${escapeHtml(t('verificationResult'))}</dt><dd>${confirmed.verificationResult ? `<strong>${escapeHtml(t('compliantVerified'))}</strong>` : escapeHtml(t('nonCompliant'))}</dd>
              <dt>${escapeHtml(t('merkleRoot'))}</dt><dd class="hash">${escapeHtml(shortHash(confirmed.merkleRoot))}</dd>
              <dt>${escapeHtml(t('verifyTx'))}</dt><dd>${transactionExplorerLink(confirmed.verifyTx, { short: true, fallback: t('pending') })}</dd>
            </dl>
            <p><button type="button" class="compact-button" data-open-attestation="${escapeHtml(confirmed.id)}">${escapeHtml(t('openThirdParty'))}</button></p>`
            : `<div class="empty-state">${escapeHtml(t('noConfirmedProof'))}</div>`}
        </div>
      </section>
    </div>`;
}

function filterOptions(summary) {
  const devices = summary.devices.map((device) => `
    <option value="${escapeHtml(device.id)}" ${state.filters.device === device.id ? 'selected' : ''}>${escapeHtml(localized(device.name, device.nameJa))}</option>`).join('');
  const sensors = [...new Set(summary.devices.map((device) => device.sensorType))].map((sensor) => `
    <option value="${escapeHtml(sensor)}" ${state.filters.sensor === sensor ? 'selected' : ''}>${escapeHtml(sensorLabel(sensor))}</option>`).join('');
  return `
    <div class="filter-panel">
      <label>${escapeHtml(t('device'))}
        <select id="filter-device"><option value="">${escapeHtml(t('all'))}</option>${devices}</select>
      </label>
      <label>${escapeHtml(t('sensorType'))}
        <select id="filter-sensor"><option value="">${escapeHtml(t('all'))}</option>${sensors}</select>
      </label>
      <label>${escapeHtml(t('outlierFilter'))}
        <select id="filter-outlier">
          <option value="" ${state.filters.outlier === '' ? 'selected' : ''}>${escapeHtml(t('all'))}</option>
          <option value="true" ${state.filters.outlier === 'true' ? 'selected' : ''}>${escapeHtml(t('onlyOutliers'))}</option>
          <option value="false" ${state.filters.outlier === 'false' ? 'selected' : ''}>${escapeHtml(t('onlyNormal'))}</option>
        </select>
      </label>
      <label>${escapeHtml(t('proofStatus'))}
        <select id="filter-status">
          <option value="" ${state.filters.status === '' ? 'selected' : ''}>${escapeHtml(t('all'))}</option>
          ${['pending', 'aggregating', 'proving', 'submitted', 'confirmed', 'failed'].map((status) => `
            <option value="${status}" ${state.filters.status === status ? 'selected' : ''}>${escapeHtml(statusLabel(status))}</option>`).join('')}
        </select>
      </label>
      <button type="button" id="apply-filters">${escapeHtml(t('apply'))}</button>
    </div>`;
}

function chartSvg(readings) {
  const chronological = [...readings].slice(0, 60).reverse();
  if (chronological.length < 2) return `<div class="empty-state">${escapeHtml(t('noChartData'))}</div>`;
  const values = chronological.map((reading) => Number(reading.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = chronological.map((reading, index) => {
    const x = 20 + (index / (chronological.length - 1)) * 760;
    const y = 195 - ((Number(reading.value) - min) / range) * 165;
    return { x, y, outlier: reading.isOutlier };
  });
  return `
    <svg class="chart" viewBox="0 0 800 220" role="img" aria-label="${escapeHtml(t('chartAria'))}" preserveAspectRatio="none">
      <polyline points="${points.map((point) => `${point.x},${point.y}`).join(' ')}"></polyline>
      ${points.map((point) => `<circle class="${point.outlier ? 'outlier' : ''}" cx="${point.x}" cy="${point.y}" r="4"></circle>`).join('')}
      <text x="8" y="18" font-size="12">${escapeHtml(t('maximum', { value: max }))}</text>
      <text x="8" y="214" font-size="12">${escapeHtml(t('minimum', { value: min }))}</text>
    </svg>
    <div class="legend"><span>${escapeHtml(t('receivedValue'))}</span><span class="outlier-key">${escapeHtml(t('outlier'))}</span></div>`;
}

function readingsView(summary, response) {
  const readings = response.readings;
  return `
    ${projectHeader(summary)}
    <section class="window">
      <div class="window-title">${escapeHtml(t('searchCriteria'))}</div>
      <div class="window-body">${filterOptions(summary)}</div>
    </section>
    <section class="window" style="margin-top:10px">
      <div class="window-title inactive">${escapeHtml(t('timeSeriesChart'))}</div>
      <div class="window-body">${chartSvg(readings)}</div>
    </section>
    <section class="window" style="margin-top:10px">
      <div class="window-title">${escapeHtml(t('readingList', { count: formatNumber(readings.length) }))}</div>
      <div class="window-body">
        ${readings.length ? `
          <div class="data-table-wrap">
            <table class="data-table">
              <thead><tr><th>${escapeHtml(t('measuredAt'))}</th><th>Edge Device</th><th>${escapeHtml(t('type'))}</th><th>${escapeHtml(t('value'))}</th><th>${escapeHtml(t('outlier'))}</th><th>${escapeHtml(t('dailyProof'))}</th><th>${escapeHtml(t('transactionVerification'))}</th></tr></thead>
              <tbody>
                ${readings.map((reading) => `
                  <tr class="${reading.isOutlier ? 'outlier' : ''}">
                    <td class="nowrap">${formatDateTime(reading.recordedAt)}</td>
                    <td>${escapeHtml(localized(reading.deviceName, reading.deviceNameJa))}<br><small>${escapeHtml(reading.deviceId)}</small></td>
                    <td>${escapeHtml(sensorLabel(reading.sensorType))}</td>
                    <td class="numeric"><strong>${escapeHtml(reading.value)}</strong> ${escapeHtml(reading.unit)}</td>
                    <td>${reading.isOutlier ? `<strong>[${escapeHtml(t('outlier'))}]</strong>` : escapeHtml(t('normal'))}</td>
                    <td>${statusTag(reading.attestationStatus)}</td>
                    <td>${reading.attestationId
                      ? `<button type="button" class="compact-button" data-open-attestation="${escapeHtml(reading.attestationId)}">${escapeHtml(reading.verifyTxId ? t('verifyTransaction') : t('processStatus'))}</button>`
                      : escapeHtml(t('pending'))}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`
          : `<div class="empty-state">${escapeHtml(t('noReadings'))}</div>`}
      </div>
    </section>`;
}

function attestationsView(summary, response) {
  const attestations = response.attestations;
  return `
    ${projectHeader(summary)}
    <section class="window">
      <div class="window-title">${escapeHtml(t('dailyHistory'))}</div>
      <div class="window-body">
        <div class="notice"><strong>${escapeHtml(t('explanationLabel'))}</strong><span>${escapeHtml(t('explanationText'))}</span></div>
        ${attestations.length ? `
          <div class="data-table-wrap">
            <table class="data-table">
              <thead><tr><th>${escapeHtml(t('targetDate'))}</th><th>${escapeHtml(t('status'))}</th><th>${escapeHtml(t('receivedExpected'))}</th><th>${escapeHtml(t('missing'))}</th><th>${escapeHtml(t('outlier'))}</th><th>${escapeHtml(t('datasetTx'))}</th><th>${escapeHtml(t('verifyTx'))}</th><th>${escapeHtml(t('operation'))}</th></tr></thead>
              <tbody>
                ${attestations.map((attestation) => `
                  <tr>
                    <td class="nowrap">${escapeHtml(attestation.periodDate)}</td>
                    <td>${statusTag(attestation.status)}</td>
                    <td class="numeric">${formatNumber(attestation.sampleCount)} / ${formatNumber(attestation.expectedCount)}</td>
                    <td class="numeric">${formatNumber(attestation.missingCount)}</td>
                    <td class="numeric">${formatNumber(attestation.outlierCount)}</td>
                    <td>${transactionExplorerLink(attestation.registerTx, { short: true })}</td>
                    <td>${transactionExplorerLink(attestation.verifyTx, { short: true })}</td>
                    <td><button type="button" class="compact-button" data-open-attestation="${escapeHtml(attestation.id)}">${escapeHtml(t('details'))}</button></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`
          : `<div class="empty-state">${escapeHtml(t('noHistory'))}</div>`}
      </div>
    </section>`;
}

function checkRow(ok, title, description) {
  return `
    <div class="check-row">
      <span class="check-code ${ok ? '' : 'waiting'}">${ok ? 'OK' : 'WAIT'}</span>
      <div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></div>
    </div>`;
}

function publicFieldLabel(field) {
  const keys = {
    merkleRoot: 'publicFieldMerkleRoot',
    period: 'publicFieldPeriod',
    sampleCount: 'publicFieldSampleCount',
    verificationResult: 'publicFieldVerificationResult',
    transactionId: 'publicFieldTransactionId',
  };
  return t(keys[field] ?? field);
}

function verificationView(response) {
  const attestation = response.attestation;
  const checks = response.checks;
  const confirmed = attestation.status === 'confirmed';
  const privateValue = t('private');
  return `
    <div class="project-heading">
      <div><h2>${escapeHtml(t('thirdPartyVerification', { date: attestation.periodDate }))}</h2><p>${escapeHtml(t('thirdPartySubtitle'))}</p></div>
      ${explorerHomeLink(response.network)}
    </div>
    <div class="page-grid">
      <section class="window">
        <div class="window-title ${confirmed ? 'success' : 'inactive'}">${escapeHtml(t('zkpResult'))}</div>
        <div class="window-body">
          <p><strong>${escapeHtml(localized(response.claim, response.claimJa))}</strong></p>
          <div class="check-list">
            ${checkRow(checks.datasetRegistered, t('datasetRegistered'), t('datasetRegisteredDescription'))}
            ${checkRow(checks.merkleInclusion, t('merkleInclusion'), t('merkleInclusionDescription'))}
            ${checkRow(checks.privateRange, t('privateRange'), t('privateRangeDescription'))}
            ${checkRow(checks.midnightConfirmed, t('midnightConfirmation'), t('midnightConfirmationDescription'))}
          </div>
        </div>
      </section>

      <aside class="window">
        <div class="window-title">${escapeHtml(t('publicAttestation'))}</div>
        <div class="window-body">
          <dl class="definition-grid">
            <dt>${escapeHtml(t('processingStatus'))}</dt><dd>${statusTag(attestation.status)}</dd>
            <dt>${escapeHtml(t('sampleCount'))}</dt><dd>${escapeHtml(t('records', { count: formatNumber(attestation.sampleCount) }))}</dd>
            <dt>${escapeHtml(t('merkleRoot'))}</dt><dd class="hash">${escapeHtml(attestation.merkleRoot ?? t('pending'))}</dd>
            <dt>${escapeHtml(t('contract'))}</dt><dd>${explorerLink('contract', response.contractAddress)}</dd>
            <dt>${escapeHtml(t('datasetTx'))}</dt><dd>${transactionExplorerLink(attestation.registerTx, { fallback: t('pending') })}</dd>
            <dt>${escapeHtml(t('datasetBlock'))}</dt><dd>${explorerLink('block', attestation.registerTx?.blockHeight)}</dd>
            <dt>${escapeHtml(t('verifyTx'))}</dt><dd>${transactionExplorerLink(attestation.verifyTx, { fallback: t('pending') })}</dd>
            <dt>${escapeHtml(t('verifyBlock'))}</dt><dd>${explorerLink('block', attestation.verifyTx?.blockHeight)}</dd>
          </dl>
        </div>
      </aside>

      <section class="window full-width">
        <div class="window-title danger">${escapeHtml(t('privacyBoundary'))}</div>
        <div class="window-body">
          <div class="privacy-box">
            RAW SENSOR VALUES .... ${escapeHtml(response.privacy.rawSensorValues === 'private' ? privateValue : response.privacy.rawSensorValues)}<br>
            THRESHOLD POLICY ..... ${escapeHtml(response.privacy.thresholdPolicy === 'private' ? privateValue : response.privacy.thresholdPolicy)}<br>
            MERKLE PATH .......... ${escapeHtml(response.privacy.merklePath === 'private' ? privateValue : response.privacy.merklePath)}<br>
            ${escapeHtml(t('publicFields').toUpperCase())} ........ ${escapeHtml(response.privacy.publicFields.map(publicFieldLabel).join(', '))}
          </div>
        </div>
      </section>
    </div>`;
}

function attachCommonActions() {
  document.querySelectorAll('[data-open-attestation]').forEach((button) => {
    button.addEventListener('click', () => {
      location.hash = `#/verify/${encodeURIComponent(button.dataset.openAttestation)}`;
    });
  });
}

function attachFilterActions() {
  document.querySelector('#apply-filters')?.addEventListener('click', () => {
    state.filters.device = document.querySelector('#filter-device')?.value ?? '';
    state.filters.sensor = document.querySelector('#filter-sensor')?.value ?? '';
    state.filters.outlier = document.querySelector('#filter-outlier')?.value ?? '';
    state.filters.status = document.querySelector('#filter-status')?.value ?? '';
    void renderRoute(true);
  });
}

function loading(title) {
  main.innerHTML = `
    <section class="loading-window window" aria-live="polite">
      <div class="window-title">${escapeHtml(title)}</div>
      <div class="window-body">${escapeHtml(t('loadingBody'))}</div>
    </section>`;
}

function renderError(error) {
  main.innerHTML = `
    <section class="window error-window" role="alert">
      <div class="window-title danger">${escapeHtml(t('systemError'))}</div>
      <div class="window-body">
        <p class="error-text">${escapeHtml(t('fetchFailed'))}</p>
        <p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p>
        <button type="button" id="retry-button">${escapeHtml(t('retry'))}</button>
      </div>
    </section>`;
  document.querySelector('#retry-button')?.addEventListener('click', () => void renderRoute(true));
}

function currentRoute() {
  const value = location.hash.replace(/^#\/?/, '');
  const [route = 'dashboard', id] = value.split('/');
  if (!['dashboard', 'readings', 'attestations', 'verify'].includes(route)) return { route: 'dashboard' };
  return { route, id };
}

function routeLabel(route) {
  return t({
    dashboard: 'routeDashboard',
    readings: 'routeReadings',
    attestations: 'routeAttestations',
    verify: 'routeVerify',
  }[route] ?? 'routeDashboard');
}

async function renderRoute(force = false) {
  const { route, id } = currentRoute();
  const activeRoute = route === 'verify' ? 'attestations' : route;
  setActiveNavigation(activeRoute);
  const label = routeLabel(route);
  breadcrumb.textContent = label;
  loading(t('loadingTitle', { title: label }));
  try {
    if (route === 'verify') {
      if (!id) throw new Error(t('missingAttestation'));
      const response = await fetchJson(`/api/v1/attestations/${encodeURIComponent(id)}`);
      main.innerHTML = verificationView(response);
    } else {
      const summary = await loadSummary(force);
      if (route === 'dashboard') {
        main.innerHTML = dashboardView(summary);
      } else if (route === 'readings') {
        const params = new URLSearchParams(Object.entries(state.filters).filter(([, value]) => value));
        const response = await fetchJson(`/api/v1/projects/${encodeURIComponent(projectId)}/readings?${params}`);
        state.readings = response.readings;
        main.innerHTML = readingsView(summary, response);
        attachFilterActions();
      } else {
        const response = await fetchJson(`/api/v1/projects/${encodeURIComponent(projectId)}/attestations`);
        state.attestations = response.attestations;
        main.innerHTML = attestationsView(summary, response);
      }
    }
    attachCommonActions();
    main.focus({ preventScroll: true });
  } catch (error) {
    renderError(error);
  }
}

async function checkHealth() {
  try {
    const response = await fetchJson('/health');
    headerStatus.textContent = response.ok ? t('healthOnline') : t('healthDegraded');
    headerStatus.classList.toggle('error', !response.ok);
  } catch {
    headerStatus.textContent = t('healthError');
    headerStatus.classList.add('error');
  }
}

function updateClock() {
  footerClock.textContent = new Intl.DateTimeFormat(localeTag(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

languageSelect.addEventListener('change', () => {
  languagePreference = ['auto', 'en', 'ja'].includes(languageSelect.value)
    ? languageSelect.value
    : 'auto';
  try {
    localStorage.setItem(languageStorageKey, languagePreference);
  } catch {
    languagePreference = 'auto';
  }
  locale = languagePreference === 'auto' ? systemLocale() : languagePreference;
  applyShellTranslations();
  updateClock();
  void checkHealth();
  void renderRoute(true);
});

reloadButton.addEventListener('click', () => void renderRoute(true));
window.addEventListener('hashchange', () => void renderRoute());
if (!location.hash) location.hash = '#/dashboard';
applyShellTranslations();
void checkHealth();
void renderRoute();
updateClock();
setInterval(updateClock, 1_000);
setInterval(() => void checkHealth(), 30_000);
