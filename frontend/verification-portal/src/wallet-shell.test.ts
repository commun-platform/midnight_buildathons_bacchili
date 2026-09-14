import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const deviceFlow = fs.readFileSync(new URL('./device-flow.ts', import.meta.url), 'utf8');
const midnightDevice = fs.readFileSync(new URL('./midnight-device.ts', import.meta.url), 'utf8');
const publicVerifier = fs.readFileSync(new URL('./public-verifier.ts', import.meta.url), 'utf8');
const gatewayWorker = fs.readFileSync(
  new URL('../../../backend/cloudflare/proof-gateway-worker/src/index.ts', import.meta.url),
  'utf8',
);
const gatewayConfiguration = fs.readFileSync(
  new URL('../../../backend/cloudflare/deployment/wrangler.jsonc', import.meta.url),
  'utf8',
);
const sponsorDockerfile = fs.readFileSync(
  new URL('../../../backend/cloudflare/sponsor-wallet-container/Dockerfile', import.meta.url),
  'utf8',
);

describe('Midnight Wallet shell', () => {
  it('keeps the Wallet action in the upper-right header controls', () => {
    expect(html).toMatch(/<div class="header-controls">[\s\S]*id="wallet-connect-button"/u);
    expect(styles).toContain('.header-controls');
    expect(styles).toContain('.wallet-connect-button');
  });

  it('gates the Device Workflow until the Wallet is connected', () => {
    expect(script).toContain('if (!deviceState.wallet)');
    expect(script).toContain('walletRequiredBody');
    expect(script).not.toContain("workflowButton('device-wallet-connect'");
    expect(script).toContain("deviceAction('wallet-connect-button'");
  });

  it('restores registration only for the Wallet that originally registered the Device', () => {
    expect(midnightDevice).toContain("'VSP-BROWSER-WALLET-IDENTITY-V1'");
    expect(midnightDevice).toContain('walletKeySha256: await textSha256(walletIdentity.verifyingKey)');
    expect(deviceFlow).toContain('operationConfiguration.device.provisioningWalletKeySha256 !== currentWallet.walletKeySha256');
    expect(deviceFlow).toContain('deriveBrowserWalletDeviceId(currentWallet.walletKeySha256, projectId)');
    expect(script).toContain('deviceState.deviceId = deviceState.wallet.deviceId;');
    expect(script).toContain('const restored = await flow.restoreDevice(deviceState.deviceId);');
    expect(script).not.toContain('vsp-browser-device-id');
    expect(script).not.toContain('crypto.randomUUID()');
    expect(script).toContain('id="device-id-input" maxlength="80"');
    expect(script).toContain('readonly');
    expect(script).not.toContain('if (!deviceState.device && deviceState.deviceId)');
  });

  it('selects Wallet-owned Projects and exposes a server-enforced ten Project limit', () => {
    expect(script).toContain('id="device-project-select"');
    expect(script).toContain('id="device-project-add"');
    expect(script).toContain('deviceState.projects.length');
    expect(deviceFlow).toContain("endpoint(config.serviceUrl, '/api/v1/projects')");
    expect(deviceFlow).toContain('session.maximumProjects !== 10');
  });

  it('creates immutable Project-scoped Policies and restores their asynchronous state', () => {
    expect(script).toContain('id="device-policy-add"');
    expect(script).toContain('id="device-policy-create-form"');
    expect(script).toContain('step="0.01"');
    expect(script).toContain("localStorage.setItem(`vsp-selected-policy:${deviceState.projectId}`");
    expect(script).toContain('id="device-policy-refresh"');
    expect(script).toContain("deviceAction('device-policy-refresh'");
    expect(script).toContain("policyProcessingTiming: '処理開始の目安'");
    expect(script).toContain("t('policyProcessingTiming')");
    expect(script).toContain("processingAlwaysOn: '次の1分Cronで処理を開始します'");
    expect(script).not.toContain('refreshPendingPolicyOperations');
    expect(deviceFlow).toContain("endpoint(config.serviceUrl, '/api/v1/policies/challenge')");
    expect(deviceFlow).toContain("endpoint(config.serviceUrl, '/api/v1/policies')");
    expect(deviceFlow).toContain('browserPolicyCanonicalMessage(authorization)');
    expect(deviceFlow).toContain('maximumPolicies !== 10');
    expect(styles).toContain('.policy-create-form');
  });

  it('distinguishes loading from an empty collection and updates only affected components', () => {
    expect(script).toContain('function dataStateView(state');
    expect(script).toContain("loadingLabel: 'LOADING'");
    expect(script).toContain("noDataLabel: 'NO DATA'");
    expect(script).toContain("loadingLabel: '読込中'");
    expect(script).toContain("noDataLabel: 'データなし'");
    expect(script).toContain('state: deviceState.policyListState');
    expect(script).toContain('state: deviceState.historyListState');
    expect(script).toContain('function refreshPolicyComponents()');
    expect(script).toContain('function patchDeviceElement(snapshot, selector)');
    expect(script).toContain("'#device-policy-list'");
    expect(script).not.toContain('captureDeviceDraft');
    expect(script).not.toContain('renderDeviceScreen({ preserveDraft: true })');
    expect(styles).toContain('.data-state-loading');
    expect(styles).toContain('.data-state-empty');
    expect(styles).toContain('.data-state-progress');
  });

  it('refreshes Policy state only through the explicit Policy reload action', () => {
    expect(script).toContain("policyRefresh: 'しきい値を再読み込み'");
    expect(script).toContain("policyRefreshHint: '登録結果は「しきい値を再読み込み」を押すと更新されます。'");
    expect(script).toContain("await refreshProjectPolicies(flow, { showProgress: true })");
    expect(script).not.toContain('setInterval(() => void refreshPendingPolicyOperations()');
    expect(script).not.toContain('policyStatusRequestActive');
    expect(script).not.toContain('policyRenderStateFingerprint');
  });

  it('reloads authoritative and private Device state after Wallet reconnection', () => {
    expect(script).toContain('async function restoreActiveProject(flow)');
    expect(script).toContain('await refreshProjectPolicies(flow)');
    expect(script).toContain('await flow.restoreDevice(deviceState.deviceId)');
    expect(script).toContain('if (deviceState.provisioned) await refreshDeviceHistory(flow)');
    expect(deviceFlow).toContain('loadDeviceIdentity(deviceId, config.projectId)');
    expect(deviceFlow).toContain('listDailyCaptures(config.projectId, device.deviceId)');
    expect(deviceFlow).toContain("localStorage.getItem(`vsp-selected-project:${wallet.walletKeySha256}`)");
  });

  it('starts Wallet authorization from the click task and recovers a closed connector channel', () => {
    expect(script).toContain('const connectionPromise = loadedFlow?.connectWallet();');
    expect(script).toContain('flow?.isWalletConnectionLost?.(error)');
    expect(script).toContain('flow.resetWalletConnection();');
    expect(script).toContain('walletConnectionFailureStage?.(error)');
    expect(deviceFlow).toContain('const challengePromise = fetch(');
    expect(deviceFlow).toContain('const walletPromise = connectBrowserWallet(');
    expect(deviceFlow).toMatch(/const walletPromise = connectBrowserWallet[\s\S]*await Promise\.all/u);
    expect(deviceFlow).toContain('resetWalletConnection');
    expect(midnightDevice).toContain("'authorization'");
    expect(midnightDevice).toContain("'identity-signature'");
  });

  it('shows current normal/anomaly state without requiring an anomaly event', () => {
    expect(script).toContain("anomaly: '現在状態を取得（正常／異常）'");
    expect(script).toContain("anomalyStateNormal: '正常 — 発生中の異常なし'");
    expect(script).toContain('data.anomalyState');
    expect(styles).toContain('.current-device-state');
  });

  it('shows the actual ZKP generation timestamp in daily Proof records', () => {
    expect(script).toContain("proofGeneratedAt: 'ZKP generated at'");
    expect(script).toContain('dateTime(job.proofGeneratedAt)');
    expect(deviceFlow).toContain('proofGeneratedAt: result.proofCompletedAt');
  });

  it('uses fee-free Lace approval and a dedicated Sponsor Wallet', () => {
    expect(midnightDevice).toContain('{ payFees: false }');
    expect(midnightDevice).toContain('/sponsor');
    expect(midnightDevice).not.toContain('getDustBalance');
    expect(midnightDevice).not.toContain('api.submitTransaction');
    expect(script).not.toContain('hasSpendableDust');
    expect(script).not.toContain('refreshConnectedWalletBalance');
    expect(script).toContain("feeSponsoredLabel: 'TRANSACTION FEE SPONSORED'");
    expect(script).toContain("feeSponsoredLabel: 'トランザクション手数料はスポンサー負担'");
  });

  it('shows and enforces the authenticated Device daily Sponsor quota', () => {
    expect(deviceFlow).toContain("endpoint(config.serviceUrl, '/api/v1/sponsor-quota')");
    expect(deviceFlow).toContain("authenticatedHeaders('transaction:submit')");
    expect(script).toContain('function sponsorQuotaAllows(proofJobId)');
    expect(script).toContain('quota.remaining > 0 || quota.reservedProofJobIds.includes');
    expect(script).toContain("sponsorQuotaTitle: 'Daily sponsored submissions (JST)'");
    expect(script).toContain("sponsorQuotaTitle: 'スポンサー送信の日次上限（JST）'");
    expect(script).toContain("t('sponsorQuotaReached')");
    expect(script).toContain('notice sponsor-quota');
    expect(styles).toContain('.transaction-workflow');
    expect(styles).toContain('.sponsor-quota');
  });

  it('keeps the Sponsor Wallet inbound private while allowing official native WSS', () => {
    const sponsorContainer = gatewayWorker.slice(
      gatewayWorker.indexOf('export class ServerWalletContainer'),
      gatewayWorker.indexOf('function json('),
    );
    expect(sponsorContainer).toContain('enableInternet = true');
    expect(sponsorContainer).toContain('interceptHttps = false');
    expect(sponsorContainer).toContain("'proof.internal'");
    expect(sponsorContainer).toContain("'indexer.preprod.midnight.network'");
    expect(sponsorContainer).toContain("'rpc.preprod.midnight.network'");
    expect(sponsorContainer).toContain('ServerWalletContainer.outboundByHost =');
    expect(sponsorContainer).not.toContain('static outboundByHost');
    expect(sponsorContainer).toContain('async onActivityExpired(): Promise<void>');
    expect(sponsorContainer).toContain('await super.onActivityExpired()');
    expect(sponsorContainer).not.toContain('this.renewActivityTimeout()');
    expect(sponsorContainer).not.toContain('await this.stop()');
    expect(sponsorContainer).not.toContain('await this.destroy()');
    expect(sponsorDockerfile).not.toContain('NODE_EXTRA_CA_CERTS');
    expect(sponsorDockerfile).not.toContain('SSL_CERT_FILE');
    expect(sponsorDockerfile).toContain(
      'ENV SPONSOR_ZK_CONFIG_PATH=/app/midnight/contracts/sensor-registry/src/managed/sensor-registry',
    );
    expect(sponsorDockerfile).toContain('$SPONSOR_ZK_CONFIG_PATH/keys/registerDevice.verifier');
    expect(gatewayWorker).toContain(
      "SPONSOR_ZK_CONFIG_PATH: '/app/midnight/contracts/sensor-registry/src/managed/sensor-registry'",
    );
    expect(gatewayWorker).toContain("parts[4] === 'sponsor'");
    expect(gatewayWorker).not.toContain("url.pathname === '/api/v1/sponsor-wallet/health'");
    expect(gatewayWorker).not.toContain("url.pathname === '/api/v1/sponsor-wallet/restore'");
    expect(gatewayConfiguration).not.toMatch(/(?:route|custom_domain).*sponsor-wallet/iu);
  });

  it('retains the confirmed transaction while refreshed history catches up', () => {
    expect(script).toMatch(/deviceState\.transaction = submitted;\s+await refreshDeviceHistory\(flow\);\s+deviceState\.transaction = submitted;/u);
    expect(script).toContain("${t('confirmed')}: ${submitted.transactionId}");
  });

  it('rebuilds a stale transaction with the same Proof Job ID and explains each stage', () => {
    expect(midnightDevice).toContain('contract_state_changed_reproof_required');
    expect(deviceFlow).toContain("onProgress?.('contract-state-changed-retrying')");
    expect(deviceFlow).toContain('proofJobId: measurement.proofJobId');
    expect(script).toContain("'contract-state-changed-retrying': 'proofProgressRetrying'");
    expect(script).toContain("proofProgressGenerating: '日次Attestation用のZKPを生成中'");
    expect(script).toContain("proofProgressSponsoring: 'スポンサー処理要求をサーバーが受け付けました'");
    expect(script).toContain("proofProgressSponsorPreparing: 'DUSTを付与したトランザクションと手数料用ZK証明を作成しています'");
    expect(script).toContain("'sponsor-interrupted': 'proofProgressSponsorInterrupted'");
    expect(script).toContain('submissionProgressText(progress)');
    expect(script).toContain('function sponsorJobProgressText(job)');
    expect(script).toContain("job.sponsorReasonCode === 'sponsor_wallet_syncing'");
    expect(script).toContain('sponsorJobProgressText(deviceState.proofJob)');
    expect(midnightDevice).toContain('const deadline = Date.now() + 45 * 60_000');
    expect(script).toContain("'reproof_required'");
  });

  it('uses same-origin Worker APIs without a localhost provisioning bridge', () => {
    expect(deviceFlow).toContain("endpoint(window.location.origin, '/api/v1/provisioning/configuration')");
    expect(deviceFlow).toContain("endpoint(config.serviceUrl, '/api/v1/provisioning/challenge')");
    expect(deviceFlow).toContain("endpoint(config.serviceUrl, '/api/v1/provisioning/devices')");
    expect(deviceFlow).toContain("typeof currentWallet.api.signData !== 'function'");
    expect(deviceFlow).not.toContain('hintUsage');
    expect(midnightDevice).not.toContain('hintUsage');
    expect(deviceFlow).toContain("endpoint(config.serviceUrl, '/api/v1/device/dashboard')");
    expect(deviceFlow).toContain("/api/v1/proof-jobs/${encodeURIComponent(job.proofJobId)}/admit");
    expect(script).not.toContain('127.0.0.1:8790');
    expect(script).not.toContain('X-VSP-Local-Admin');
  });

  it('shows intentionally redacted Raw Sensor Values in the public verifier', () => {
    expect(script).toContain('function redactedRawValues(data)');
    expect(script).toContain('raw-values-redacted');
    expect(script).toContain('aria-hidden="true"');
    expect(script).toContain('Individual readings stay on the Device');
    expect(script).toContain("rawValuesHidden: 'HIDDEN FROM THIRD PARTIES'");
    expect(script).toContain("rawValuesHidden: '第三者には非公開'");
    expect(script).toContain('VALUES STAY PRIVATE');
    expect(script).toContain("rawSensorValues: '元のセンサー値'");
    expect(script).not.toContain('NOT DISCLOSED');
    expect(styles).toContain('.raw-value-mask');
  });

  it('visualizes only public ZKP verification stages', () => {
    expect(script).toContain('function publicProofPipeline(data)');
    expect(script).toContain('How This ZK Proof Was Checked');
    expect(script).toContain('This view uses public information only');
    expect(script).toContain('checks.committedHourlyExtrema');
    expect(script).toContain('checks.attestationVerified');
    expect(script).toContain('checks.midnightConfirmed');
    expect(styles).toContain('.public-proof-pipeline');
  });

  it('independently checks the public transaction and Contract state on Midnight', () => {
    expect(script).toContain('verifyPublicProofOnMidnight(data)');
    expect(script).toContain('loadPublicProofFromMidnight(current.txHash)');
    expect(script).toContain("parts[0] === 'verify-tx'");
    expect(script).toContain("{ state: 'checking', error: '' }");
    expect(script).toContain("chainCheckInProgress: 'Midnightを直接確認中'");
    expect(script).toContain('progress-shell dashboard-sync-progress');
    expect(styles).toContain('.dashboard-sync-state > div');
    expect(styles).toContain('.dashboard-sync-state.complete');
    expect(publicVerifier).toContain('provider.watchForTxData(input.transactions.attest.txId)');
    expect(publicVerifier).toContain("type: 'blockHeight'");
    expect(publicVerifier).toContain('decodeLedger(contractState.data)');
    expect(publicVerifier).toContain('pureCircuits.deriveAttestationId(');
    expect(publicVerifier).toContain('state.attestations.member(attestationId)');
    expect(publicVerifier).toContain('state.policyAssignments.member(assignmentKey)');
    expect(publicVerifier).toContain('transaction.status === SucceedEntirely');
    expect(publicVerifier).toContain('transactions(offset: $offset)');
    expect(publicVerifier).toContain('variables: { offset: { hash: transactionHash } }');
    expect(publicVerifier).toContain('previousState.attestations.member(key)');
    expect(publicVerifier).toContain('publicAttestationFromLedgerTransition(');
  });

  it('presents internal threshold and sensor values with approachable labels', () => {
    expect(script).toContain('function policyModeLabel(value)');
    expect(script).toContain("modeClosedRange: '最小値から最大値まで'");
    expect(script).toContain("sensorTemperature: '温度'");
    expect(script).toContain('policyModeLabel(data.policy.mode)');
    expect(script).toContain('sensorTypeLabel(data.policy.sensorType)');
  });

  it('offers previous and next day controls within the allowed generation range', () => {
    expect(script).toContain('id="device-date-previous"');
    expect(script).toContain('id="device-date-next"');
    expect(script).toContain('const shiftGenerationDate = (days) =>');
    expect(script).toContain('localStorage.setItem(\'vsp-generation-date\', nextDate)');
    expect(styles).toContain('.device-date-controls');
  });

  it('makes long-running Device actions visibly active', () => {
    expect(script).toContain('aria-busy="true"');
    expect(script).toContain('class="action-spinner"');
    expect(script).toContain('class="activity-dot"');
    expect(script).toContain('role="status" aria-live="polite"');
    expect(styles).toContain('@keyframes workflow-spinner');
    expect(styles).toContain('from { transform: translateZ(0) rotate(0deg); }');
    expect(styles).toContain('to { transform: translateZ(0) rotate(360deg); }');
    expect(styles).toContain('@keyframes workflow-progress-travel');
    expect(styles).toContain('@keyframes workflow-activity-pulse');
    expect(styles).toContain('will-change: transform');
    expect(styles).toContain('.workflow-action.active-action::after');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('animates API acceptance and uses a static queued state for server-owned waits', () => {
    expect(script).toContain('const active = deviceState.busy && deviceState.activeAction === id && !queued;');
    expect(script).toContain("proofRequestUploading: '時間別集計をAPIへ送信中（{completed}/{total}）'");
    expect(script).toContain("proofRequestRegistering: 'ZKP生成・TX発行Jobを登録中'");
    expect(script).toContain("proofRequestTimedOut: '処理要求の受付確認がタイムアウトしました。");
    expect(script).toContain("'sponsor-wallet-syncing'");
    expect(script).toContain("'sponsor-queued'");
    expect(script).toContain('refreshDeviceDynamicComponents({ includeHistory: false })');
    expect(script).not.toContain('if (ready) return submitDeviceDay(flow, periodDate)');
    expect(deviceFlow).toContain('onAcceptanceProgress?: (progress: ProofRequestAcceptanceProgress) => void');
    expect(deviceFlow).toContain("stage: 'uploading',");
    expect(deviceFlow).toContain('completed: index + 1');
  });

  it('shows the actual Device and Threshold transaction stages', () => {
    expect(script).toContain("progressDeviceProof: 'デバイス登録TX用のZKPを生成中'");
    expect(script).toContain("progressDeviceSending: 'デバイス登録TXを送信中'");
    expect(script).toContain("progressDeviceConfirming: 'デバイス登録TXの確定待ち'");
    expect(script).toContain("progressAssignmentProof: 'しきい値割当TX用のZKPを生成中'");
    expect(script).toContain("progressAssignmentSending: 'しきい値割当TXを送信中'");
    expect(script).toContain("progressAssignmentConfirming: 'しきい値割当TXの確定待ち'");
    expect(script).toContain('id="registration-device-tx"');
    expect(script).toContain('id="registration-assignment-tx"');
    expect(script).toContain("['device_confirmed', 'assignment_zkp_generating'");
    expect(styles).toContain('.registration-progress');
    expect(script).toContain("progress?.status === 'failed'");
    expect(script).toContain('class="action-error"');
    expect(styles).toContain('.registration-progress-failed');
  });

  it('releases the browser after registration Job acceptance and only polls Job state', () => {
    expect(deviceFlow).toContain("if ('operationId' in submitted)");
    expect(deviceFlow).toContain('storePendingProvisioning(submitted');
    expect(deviceFlow).toContain('return null;');
    expect(deviceFlow).toContain('async function readProvisioningStatus(');
    expect(deviceFlow).not.toContain('provisioningTimeoutMs');
    expect(deviceFlow).not.toContain('while (Date.now() < deadline)');
    expect(script).toContain('async function refreshPendingDeviceRegistration()');
    expect(script).toContain('setInterval(() => void refreshPendingDeviceRegistration(), 5_000)');
    expect(script).toContain("['queued', 'running', 'retrying'].includes(deviceState.provisioning?.status)");
    expect(script).toContain('id="registration-job-id"');
    expect(script).toContain("nextProcessingStart: 'Next processing start'");
    expect(script).toContain('processingStartText()');
    expect(script).toContain("queued: 'QUEUED'");
  });

  it('allows the judge to queue the combined Steps 3–4 while Device registration is pending', () => {
    expect(script).toContain('const registrationAccepted = Boolean(deviceState.provisioned)');
    expect(script).not.toContain("if (!deviceState.provisioned && ['queued', 'running', 'retrying'].includes(deviceState.provisioning?.status)) return '';");
    expect(script).toContain('deviceState.proofJob = await flow.requestProof({');
    expect(script).toContain('admitNow: false,');
    expect(script).toContain('flow.queueDeferredSubmission(periodDate)');
    expect(script).toContain("proofAndRecord: 'ZK証明を生成してMidnightに記録'");
    expect(script).toContain("submissionQueued: 'ZKP生成・TX発行処理待ち'");
    expect(script).not.toContain('id="device-proof-request"');
    expect(script).toContain('setInterval(() => void refreshQueuedProofWorkflow(), 5_000)');
    expect(deviceFlow).toContain('function pendingMeasurementContext()');
    expect(deviceFlow).toContain('if (provisioned) await uploadDailyCapture(captured, operationId)');
    expect(deviceFlow).toContain("status: 'waiting_for_registration'");
    expect(deviceFlow).toContain('deferredProvisioningOperationId: deferred.operationId');
  });

  it('restores an already submitted attestation instead of retrying its Contract call', () => {
    expect(script).toContain("detail.includes('measurement group already attested')");
    expect(script).toContain("recovered?.status === 'dead_lettered'");
    expect(script).toContain("recovered.errorCode === 'measurement_group_already_attested'");
    expect(script).toContain("['sponsored', 'submitted', 'confirmed'].includes(recovered.status)");
    expect(script).toContain('deviceState.transaction ??= { transactionId: recovered.attestTxId }');
    expect(script).toContain('submitDeviceDay(currentFlow, deviceState.selectedDate)');
    expect(script).toContain('if (!deviceState.proofJob) {');
    expect(deviceFlow).toContain("phase: 'failed'");
    expect(deviceFlow).toContain("errorCode: 'measurement_group_already_attested'");
    expect(midnightDevice).toContain('contractState.attestations.member(attestationId)');
  });

  it('re-localizes persisted Device status when the language changes', () => {
    expect(script).toContain('function refreshDeviceMessageForLocale()');
    expect(script).toContain('refreshDeviceMessageForLocale();');
    expect(script).toContain('if (completed && deviceState.message === message) refreshDeviceMessageForLocale();');
    expect(script).toContain("deviceState.message = t('registrationRestored')");
    expect(script).toContain('statusText(deviceState.proofJob.status)');
  });

  it('makes a released stale transaction visibly retryable after Wallet restoration', () => {
    expect(script).toContain("job.status === 'reproof_required'");
    expect(script).toContain("retrySubmitAction: 'Regenerate proof and record TX'");
    expect(script).toContain("reproofReady: 'The previous TX was released.");
    expect(script).toContain("deviceState.proofJob?.status === 'reproof_required'");
    expect(script).toContain("['ready_for_input', 'proving', 'proof_ready', 'reproof_required']");
  });

  it('shows the full hosted Device, authenticated administrator, and verifier workflow', () => {
    expect(script).toContain("const target = !location.hash ? '#/device' : ''");
    expect(script).toContain("document.querySelector('#nav-device').hidden = false");
    expect(script).toContain("document.querySelector('#nav-admin').hidden = false");
    expect(script).toContain('const data = await flow.loadAdministratorDashboard()');
    expect(script).toContain("adminBadge: 'DEVICE ADMIN'");
    expect(styles).toContain('[hidden] { display: none !important; }');
  });

  it('links public chain evidence to the network-specific Midnight Explorer', () => {
    expect(script).toContain("return 'https://preprod.midnightexplorer.com'");
    expect(script).toContain("if (kind === 'transaction') return `${base}/transactions/${encoded}`");
    expect(script).toContain("if (kind === 'contract') return `${base}/contracts/${encoded}`");
    expect(script).toContain("if (kind === 'block' && /^\\d+$/u.test(String(value))) return `${base}/blocks/${encoded}`");
    expect(script).toContain('target="_blank" rel="noopener noreferrer"');
    expect(script).toContain("explorerLink('transaction', data.transactions.attest?.txHash, data.network)");
    expect(midnightDevice).toContain('publicDataProvider.watchForTxData(sponsorship.transactionId)');
    expect(midnightDevice).toContain('blockHeight: confirmation.blockHeight');
    expect(deviceFlow).toContain('txHash: result.transactionHash');
    expect(deviceFlow).toContain('blockHeight: result.blockHeight');
    expect(deviceFlow).not.toContain("blockHeight: 'confirmed-by-indexer'");
  });

  it('does not let stale in-memory proof state replace refreshed server history', () => {
    expect(script).toContain(
      'ensure(deviceState.proofJob.periodDate).proofJob ||= deviceState.proofJob',
    );
    expect(script).not.toContain(
      'ensure(deviceState.proofJob.periodDate).proofJob = deviceState.proofJob',
    );
  });
});
