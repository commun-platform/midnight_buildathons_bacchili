import { demo, demoPreferences, mountDemoBanner } from './demo-mode.js';

const localStorage = demo ? demoPreferences(window.localStorage) : window.localStorage;
mountDemoBanner(demo);

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
    adminIntro: 'Authenticated Device view: hourly summaries, anomaly transitions, and proof processing state.',
    localOnly: 'This view is limited to the Device authenticated by the Device Session.', adminBadge: 'DEVICE ADMIN',
    flow: 'Use-Case Progress', registered: 'Device registered and authenticated',
    received: 'Hourly summary received', anomaly: 'Current state retrieved', requested: 'Proof requested',
    generated: 'Proof generated and transaction sponsored', confirmed: 'Midnight transaction confirmed',
    done: 'DONE', waiting: 'WAIT', queued: 'QUEUED', nextAction: 'NEXT ACTION', inProgress: 'IN PROGRESS', devices: 'Devices', registry: 'Midnight registry', lastSeen: 'Last received', sensor: 'Sensor', policy: 'Policy',
    hourly: 'Hourly Aggregates', period: 'Period', count: 'Count', minimum: 'Minimum', maximum: 'Maximum',
    average: 'Average', commitment: 'Commitment', anomalies: 'Immediate Anomaly Transitions', transition: 'Transition',
    occurred: 'Occurred', jobs: 'Proof / Transaction Jobs', job: 'Proof Job', status: 'Status', root: 'Data fingerprint',
    tx: 'Attestation Transaction', action: 'Action', inspect: 'Public view', none: 'No records yet.',
    verifierIntro: 'Anyone can check the operational date, each hourly threshold result, and the applied public policy without seeing sensor values.', txProofViewer: 'Transaction proof viewer',
    proofId: 'Proof record ID', open: 'Check result', latest: 'Use latest local record', claim: 'Public Result', checks: 'What Was Checked',
    dataset: 'Daily proof record found', inclusion: 'Hidden hourly summary is tied to this proof',
    threshold: 'ZK proof matches all 24 published hourly results',
    midnight: 'Midnight transaction confirmed', publicData: 'Information Anyone Can Check', privateData: 'Information Hidden from Third Parties', private: 'HIDDEN',
    rawSensorValues: 'Raw Sensor Values', rawValuesHidden: 'HIDDEN FROM THIRD PARTIES',
    zkProtected: 'VALUES STAY PRIVATE',
    rawValuesExplanation: 'Individual readings stay on the Device. Third parties can see only how many readings were used and a cryptographic fingerprint of the hidden hourly summary.',
    sample: 'READING', redacted: 'HIDDEN',
    txHash: 'Transaction hash', blockHeight: 'Block height', openExplorer: 'Open in Midnight Explorer',
    txLookupLabel: 'Find proof by transaction hash', txLookupPlaceholder: '64-character Midnight transaction hash', txLookupAction: 'Open proof',
    txLookupFailed: 'No confirmed proof was found for that transaction hash.', txLookupSearching: 'Searching confirmed transactions...',
    proofPipeline: 'How This ZK Proof Was Checked',
    proofPipelineIntro: 'This view uses public information only. Hidden sensor values and proof secrets never appear here.',
    pipelineCommitment: 'Hidden hourly summary matches this proof', pipelineCircuit: 'ZK proof checked successfully',
    pipelinePolicy: 'Hourly results match the public policy', legacyPipelinePolicy: 'Legacy daily result matches the public policy', pipelineChain: 'Transaction found on Midnight',
    pipelineVerifier: 'Public verification complete',
    thresholdPublic: 'PUBLIC ON MIDNIGHT', privateRawValues: 'RAW SENSOR VALUES',
    privateHourlySummary: 'HOURLY MINIMUM / MAXIMUM', privateProofSecret: 'RANDOM PROOF SECRET',
    publicHourStatus: 'HOURLY WITHIN / OUTSIDE / NO DATA', publicThreshold: 'THRESHOLD RULE',
    network: 'Network', contract: 'Contract',
    sampleCount: 'Sensor readings used', observedHours: 'Observed hours', stoppedHours: 'NO DATA hours', policyId: 'Threshold setting ID',
    measurementDate: 'Operational date', hourlyResults: 'Hourly threshold results',
    hourlyResultsIntro: 'Each result is proved from the hidden hourly minimum and maximum. The values themselves remain private.',
    hourBand: 'Local operational time', hourResult: 'Result', hourlyWithin: 'WITHIN', hourlyOutside: 'OUTSIDE', hourlyNoData: 'NO DATA',
    legacyHourlyResults: 'This legacy record predates hourly public results. Only its aggregate daily result is available.',
    legacyThreshold: 'Legacy aggregate ZK result matches the registered threshold',
    policyMode: 'Threshold rule', policyBounds: 'Public threshold', policyVersion: 'Policy version',
    policyScale: 'Value scale', policyUnit: 'Unit', policyValidFrom: 'Effective from', policyValidUntil: 'Effective until', noStartDate: 'No start restriction', noExpiry: 'No end date',
    proofSubject: 'Proof subject (deviceCommitment)',
    modeClosedRange: 'Between minimum and maximum', modeUpperBound: 'At or below the maximum', modeLowerBound: 'At or above the minimum',
    sensorTemperature: 'Temperature',
    assignment: 'Applied policy record', schemaVersion: 'Schema version', circuitVersion: 'Circuit version',
    pendingClaim: 'The proof is pending and must not be represented as verified.', loading: 'Loading data. Please wait.',
    loadingLabel: 'LOADING', noDataLabel: 'NO DATA',
    loadingRecords: 'Loading the latest records', loadingRecordsDetail: 'Retrieving current data from the service.',
    noRecords: 'No records yet', noRecordsDetail: 'Loading is complete. New records will appear here.',
    loadingPolicies: 'Loading Threshold Policies', loadingPoliciesDetail: 'Checking this Project for registered Policies and active registration Jobs.',
    noPolicies: 'No Threshold Policies',
    loadingHistory: 'Loading daily sensor history', loadingHistoryDetail: 'Retrieving the latest sensor summaries and proof Jobs.',
    noHistory: 'No daily sensor history', noHistoryDetail: 'Sensor days will appear after measurements are uploaded.',
    loadingPublicProofs: 'Loading public proof records', loadingPublicProofsDetail: 'Retrieving the newest public records available for verification.',
    noPublicProofs: 'No public proof records', noPublicProofsDetail: 'Loading is complete. No proof has been published yet.',
    retry: 'Retry', failed: 'Could not load the requested view.',
    deviceIntro: 'Register this PC as a Device, capture a sensor value, create a ZK proof, and record the claim on Midnight.',
    deviceIdentity: 'Device Identity', midnightRegistration: 'Midnight registration', deviceRegister: 'Device registration', thresholdSetup: 'Threshold assignment', sensorCapture: 'Sensor value',
    proofCreate: 'ZK proof', chainRecord: 'Midnight record', proofAndRecord: 'ZK proof and Midnight record', walletConnect: 'Connect Midnight Wallet',
    walletConnecting: 'Connecting Wallet...', walletConnected: 'Wallet Connected',
    walletDisconnected: 'Wallet communication was closed. Unlock the Wallet and click Connect Midnight Wallet again. Reload this page if the connection does not reopen.',
    walletFailureStage: 'Failed stage',
    walletRequiredTitle: 'Midnight Wallet required',
    walletRequiredBody: 'Connect your Midnight Wallet from the button in the upper-right corner. The Device Workflow appears after the connection is authorized.',
    adminWalletRequiredBody: 'Connect your Midnight Wallet to identify the Device whose sensor history you administer.',
    adminDeviceRequiredTitle: 'Device registration required',
    adminDeviceRequiredBody: 'Register this Wallet-derived Device before opening its sensor history and proof processing records.',
    openDeviceWorkflow: 'Open Device Workflow',
    project: 'Project', projectSelect: 'Select Project', projectAdd: '+ New Project',
    projectName: 'Project name', projectCreate: 'Create Project', projectCancel: 'Cancel',
    projectTimeZone: 'Fixed UTC offset', projectDayStart: 'Operational day starts',
    projectLimit: 'Projects per Wallet', projectCreated: 'Project created',
    policyAdd: '+ New Policy', policyRefresh: 'Refresh Policies', policyRefreshHint: 'Use Refresh Policies to update queued registration results.', policyName: 'Policy name', policyCreate: 'Create Policy',
    policyCancel: 'Cancel', policyLimit: 'Policies in this Project', policyCreated: 'Policy registration queued', policyProcessingTiming: 'Processing timing',
    policyEmpty: 'Create a Threshold Policy for this Project before registering its Device.',
    policyCreating: 'This immutable public Threshold Policy is being registered on Midnight.',
    policyMinimum: 'Minimum (°C)', policyMaximum: 'Maximum (°C)', policyRegistrationTx: 'Policy registration TX',
    anomalyStepHelp: 'No manual action is required. Registration initializes NORMAL; uploaded outliers automatically change the current state.',
    currentAnomalyState: 'Current Device State', anomalyStateNormal: 'NORMAL — no active anomaly',
    anomalyStateOpen: 'ANOMALY — threshold exceeded', anomalyStateChangedAt: 'State updated',
    proofGeneratedAt: 'ZKP generated at',
    identityCreate: 'Create Device Identity', registerAction: 'Register Device and assign policy',
    progressChallenge: 'Requesting one-time registration challenge',
    progressWalletSignature: 'Waiting for Midnight Wallet signature',
    progressWalletVerification: 'Verifying Wallet authorization',
    progressQueued: 'Registration accepted and queued for server processing',
    nextProcessingStart: 'Next processing start',
    processingAlwaysOn: 'Starts on the next one-minute check',
    processingOnDemand: 'Queued work is checked every minute',
    processingCooldown: 'Container restart cooldown until',
    processingNow: 'Processing has started; the server continues automatically',
    queuedWorkflowHint: 'You can continue through Steps 3–4 now. Queued work starts automatically at the time shown below.',
    progressSponsorSync: 'Synchronizing Sponsor Wallet',
    progressSponsorReady: 'Sponsor Wallet ready',
    progressDeviceProof: 'Generating Device registration ZKP',
    progressDeviceSending: 'Sending Device registration TX',
    progressDeviceSubmitted: 'Device registration TX sent',
    progressDeviceConfirming: 'Waiting for Device registration TX confirmation',
    progressDeviceConfirmed: 'Device registration TX confirmed',
    progressAssignmentProof: 'Generating Threshold assignment ZKP',
    progressAssignmentSending: 'Sending Threshold assignment TX',
    progressAssignmentSubmitted: 'Threshold assignment TX sent',
    progressAssignmentConfirming: 'Waiting for Threshold assignment TX confirmation',
    progressAssignmentConfirmed: 'Threshold assignment TX confirmed',
    progressRetry: 'Temporary failure; waiting to retry with the same operation ID',
    progressComplete: 'Device registration and Threshold assignment complete',
    proofProgressConnecting: 'Reading the latest Midnight contract state',
    proofProgressBuilding: 'Building the Device transaction',
    proofProgressChecking: 'Checking the ZKP input',
    proofProgressGenerating: 'Generating the daily attestation ZKP',
    proofProgressWallet: 'Waiting for Wallet approval',
    proofProgressSponsoring: 'Sponsor request accepted by the server',
    proofProgressSponsorQueued: 'Waiting in the Sponsor processing queue',
    proofProgressSponsorWalletChecking: 'Checking Sponsor Wallet synchronization and DUST balance',
    proofProgressSponsorWalletSyncing: 'Waiting for Sponsor Wallet synchronization; the server will continue automatically',
    proofProgressSponsorFunding: 'Sponsor Wallet has no spendable DUST; waiting for funding',
    proofProgressSponsorCheckpoint: 'Saving Sponsor Wallet state before using DUST',
    proofProgressSponsorPreparing: 'Creating the DUST-balanced transaction and its fee proof',
    proofProgressSponsorRetry: 'Sponsor processing is waiting for an automatic server retry',
    proofProgressSponsorPreDustRetry: 'The server stopped before DUST was used. The job is safely queued for automatic retry.',
    proofProgressSponsorInterrupted: 'Sponsor processing stopped at the recorded stage; the server is waiting for a safe retry',
    proofProgressSubmitting: 'Submitting the transaction to Midnight',
    proofProgressRetrying: 'Contract state changed; regenerating ZKP/TX with the same Job ID',
    proofProgressConfirming: 'Waiting for Midnight transaction confirmation',
    proofProgressConfirmed: 'Midnight transaction confirmed',
    proofRequestUploading: 'Sending hourly summaries to the API ({completed}/{total})',
    proofRequestRegistering: 'Registering the ZKP generation and TX Job',
    proofRequestAccepted: 'Request accepted by the server',
    proofRequestTimedOut: 'Request acceptance timed out. Retry with the same sensor day; already received data is idempotent.',
    registrationJob: 'Registration Job', deviceRegistrationTx: 'Device registration TX', assignmentRegistrationTx: 'Threshold assignment TX',
    captureAction: 'Capture and upload', proofAction: 'Request proof processing', submitAction: 'Submit ZKP generation and TX processing', workflowRefresh: 'Refresh state', workflowRefreshing: 'Refreshing state...',
    retrySubmitAction: 'Regenerate proof and record TX',
    reproofReady: 'The previous TX was released. Regenerate the ZK proof and TX with the same Proof Job ID.',
    deviceId: 'Device ID (derived from Wallet)', wallet: 'Wallet', temperature: 'Temperature', progress: 'Processing status',
    identityRestored: 'Stored Device Identity restored', registrationRestored: 'Registered Device and policy assignment restored',
    autoGenerate: 'Auto Generate one day', generationDate: 'Operational date', previousSensorDay: '◀ Previous day', nextSensorDay: 'Next day ▶',
    generationMode: 'Generation mode', withOutliers: 'Random values with outliers (OUTSIDE proof)',
    withinThreshold: 'Within threshold (ZKP test)', outlierCount: 'Outliers', dailyHistory: 'Daily sensor history',
    selectDay: 'View this day', verifyDaily: 'Verify daily ZKP', requestDaily: 'Request daily proof',
    submitDaily: 'Generate ZKP / submit TX', thresholdResult: 'Threshold result',
    withinResult: 'WITHIN THRESHOLD', outsideResult: 'OUTSIDE THRESHOLD', stoppedResult: 'NO DATA',
    privateAvailable: 'Private proof input available', privateUnavailable: 'Private proof input is not stored in this browser',
    feeSponsored: 'The service Sponsor Wallet adds the DUST fee and submits the approved Device transaction.',
    feeSponsoredLabel: 'TRANSACTION FEE SPONSORED',
    sponsorQuotaTitle: 'Daily sponsored submissions (JST)', sponsorQuotaRemaining: 'remaining',
    sponsorQuotaUsed: 'used', sponsorQuotaReset: 'Resets',
    sponsorQuotaReached: 'The daily limit is reached. Already reserved proof jobs can still be retried.',
    alreadyAttested: 'This measurement group is already recorded on Midnight. It will not be submitted again.',
    completeDay: 'Complete day', incompleteDay: 'Day in progress', generationRange: 'Previous 30 completed days only', latestProofs: 'Daily proof records (newest first)',
    publicProofListIntro: 'Choose an operational date to check all 24 hourly results.', publicView: 'PUBLIC VIEW', checked: 'CHECKED', checksComplete: 'checks complete',
    statusPending: 'Waiting', statusAggregating: 'Collecting readings', statusProving: 'Creating ZK proof',
    statusSubmitted: 'Sent to Midnight', statusConfirmed: 'Recorded on Midnight', statusFailed: 'Could not complete',
    statusActive: 'Active', statusDisabled: 'Disabled', statusRevoked: 'Revoked', statusRegistered: 'Registered',
    statusRetired: 'No longer used', statusUnregistered: 'Not registered', statusDispatched: 'Sent for processing',
    statusProofReady: 'Proof ready', statusReadyForInput: 'Ready to create proof', statusRetryableFailed: 'Waiting to retry',
    statusSponsorRetryable: 'Waiting for Sponsor Wallet',
    statusReproofRequired: 'Regenerate ZKP/TX',
    statusDeadLettered: 'Closed',
    statusWaitingForRegistration: 'Queued after Device registration',
    submissionQueued: 'WAITING FOR ZKP GENERATION & TX SUBMISSION',
    submissionQueuedDetail: 'The server checks accepted work every minute and starts the required Containers only when work exists. Keep this page open; Wallet approval is requested when the Device transaction is ready.',
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
    adminIntro: '認証済みデバイスの管理画面：1時間集計、異常遷移、証明の処理状況を確認できます。',
    localOnly: 'Device Sessionで認証したデバイスの情報だけを表示します。', adminBadge: 'デバイス管理',
    flow: 'ユースケース進捗', registered: 'デバイス登録・認証', received: '1時間集計を受信',
    anomaly: '現在状態を取得（正常／異常）', requested: '証明を要求', generated: '証明を生成・Sponsorが手数料を付与',
    confirmed: 'Midnightへの記録完了', done: '完了', waiting: '待機', queued: '受付済み', nextAction: '次の操作', inProgress: '処理中', devices: 'デバイス', registry: 'Midnight登録',
    lastSeen: '最終受信', sensor: 'センサー', policy: 'しきい値ルール', hourly: '1時間集計値', period: '期間',
    count: '件数', minimum: '最小', maximum: '最大', average: '平均', commitment: 'データの指紋',
    anomalies: '即時異常遷移', transition: '遷移', occurred: '発生時刻', jobs: '証明・トランザクション処理',
    job: '証明処理', status: '状態', root: '照合用のデータ指紋', tx: '証明トランザクション', action: '操作',
    inspect: '第三者表示', none: 'まだ記録がありません。',
    verifierIntro: '第三者はセンサー値を見ることなく、運用日、24時間分の判定、適用された公開しきい値を確認できます。', txProofViewer: 'TX証明ビューワ',
    proofId: '証明記録ID', open: '結果を確認', latest: '最新の記録を使用', claim: '公開された結果',
    checks: '確認できたこと', dataset: '日次の証明記録がある', inclusion: '非公開の時間別集計と証明が一致',
    threshold: 'ZK証明と24時間分の公開判定が一致', midnight: 'Midnightへの記録を確認', publicData: '誰でも確認できる情報',
    privateData: '第三者には見えない情報', private: '非公開', thresholdPublic: 'MIDNIGHTで公開',
    privateRawValues: '元のセンサー値', privateHourlySummary: '時間別の最小値・最大値',
    privateProofSecret: '証明に使うランダムな秘密情報', publicHourStatus: '時間別の閾値以内・範囲外・計測なし', publicThreshold: 'しきい値ルール',
    network: 'ネットワーク', rawSensorValues: '元のセンサー値', rawValuesHidden: '第三者には非公開',
    zkProtected: '値を見せずに証明',
    rawValuesExplanation: '個別センサー値はデバイス内に残ります。第三者に見えるのは、使用した件数と、非公開の時間別集計を照合するためのデータの指紋だけです。',
    sample: '測定', redacted: '非公開',
    txHash: 'トランザクションハッシュ', blockHeight: 'ブロック番号', openExplorer: 'Midnight Explorerで確認',
    txLookupLabel: 'TX hashから証明を開く', txLookupPlaceholder: 'Midnightの64文字のトランザクションハッシュ', txLookupAction: '証明を表示',
    txLookupFailed: 'このTX hashに対応する確定済み証明は見つかりません。', txLookupSearching: '確定済みトランザクションを検索中...',
    proofPipeline: 'ゼロ知識証明（ZKP）の確認ステップ',
    proofPipelineIntro: 'この画面で使うのは公開情報だけです。非公開のセンサー値や証明用の秘密情報は表示されません。',
    pipelineCommitment: '非公開の時間別集計と証明を照合', pipelineCircuit: 'ZK証明が正しいことを確認',
    pipelinePolicy: '時間帯別判定と公開しきい値を照合', legacyPipelinePolicy: '旧形式の日次総合結果と公開しきい値を照合', pipelineChain: 'Midnightへの記録を確認',
    pipelineVerifier: '第三者による確認が完了',
    contract: 'コントラクト', sampleCount: '使用したセンサー値の件数', observedHours: '観測時間数', policyId: 'しきい値設定ID',
    stoppedHours: '計測なし時間数', measurementDate: '運用日', hourlyResults: '時間帯別結果',
    hourlyResultsIntro: '非公開の時間別最小値・最大値から各判定を証明しています。実測値自体は公開しません。',
    hourBand: '現地の運用時間帯', hourResult: '判定', hourlyWithin: '閾値以内', hourlyOutside: '範囲外', hourlyNoData: '計測なし',
    legacyHourlyResults: 'この旧形式の記録は時間帯別結果の公開前に作成されたため、日次の集約判定だけを確認できます。',
    legacyThreshold: '旧形式の日次総合ZK結果と登録しきい値が一致',
    policyMode: 'しきい値ルール', policyBounds: '公開しきい値',
    policyScale: 'スケール', policyUnit: '単位', policyValidFrom: '適用開始', policyValidUntil: '適用終了', noStartDate: '開始日の制限なし', noExpiry: '終了日なし',
    proofSubject: '証明対象（deviceCommitment）',
    modeClosedRange: '最小値から最大値まで', modeUpperBound: '最大値以下', modeLowerBound: '最小値以上',
    sensorTemperature: '温度',
    policyVersion: 'しきい値設定のバージョン', assignment: '適用したしきい値設定', schemaVersion: 'データ形式のバージョン', circuitVersion: 'ZK回路のバージョン',
    pendingClaim: '証明は処理中です。確認済みとして扱えません。',
    loading: 'データを読み込んでいます。', loadingLabel: '読込中', noDataLabel: 'データなし',
    loadingRecords: '最新の記録を読み込んでいます', loadingRecordsDetail: 'サービスから現在のデータを取得しています。',
    noRecords: 'まだ記録がありません', noRecordsDetail: '読み込みは完了しています。新しい記録はここに表示されます。',
    loadingPolicies: 'しきい値設定を読み込んでいます', loadingPoliciesDetail: 'このプロジェクトの登録済み設定と登録処理を確認しています。',
    noPolicies: 'しきい値設定がありません',
    loadingHistory: '日別センサー履歴を読み込んでいます', loadingHistoryDetail: '最新のセンサー集計と証明処理を取得しています。',
    noHistory: '日別センサー履歴がありません', noHistoryDetail: 'センサー値を送信すると、ここに日別履歴が表示されます。',
    loadingPublicProofs: '公開証明記録を読み込んでいます', loadingPublicProofsDetail: '第三者が確認できる最新の公開記録を取得しています。',
    noPublicProofs: '公開証明記録がありません', noPublicProofsDetail: '読み込みは完了しています。公開済みの証明はまだありません。',
    retry: '再試行', failed: '画面の読込みに失敗しました。',
    deviceIntro: 'このPCをデバイスとして登録し、センサー値の取得、ZK証明の作成、Midnightへの記録まで実行します。',
    deviceIdentity: 'デバイス認証鍵', midnightRegistration: 'Midnightへの登録', deviceRegister: 'デバイス登録', thresholdSetup: 'しきい値設定', sensorCapture: 'センサー値取得',
    proofCreate: 'ZK証明を作成', chainRecord: 'コントラクトに記録', proofAndRecord: 'ZK証明を生成してMidnightに記録', walletConnect: 'Midnight Walletを接続',
    walletConnecting: 'ウォレット接続中...', walletConnected: 'ウォレット接続済み',
    walletDisconnected: 'Walletとの通信が切断されました。Walletのロックを解除して、もう一度「Midnight Walletを接続」を押してください。再接続できない場合はページを再読み込みしてください。',
    walletFailureStage: '失敗した段階',
    walletRequiredTitle: 'Midnight Walletの接続が必要です',
    walletRequiredBody: '画面右上のボタンからMidnight Walletを接続してください。接続を承認するとデバイス操作画面が表示されます。',
    adminWalletRequiredBody: '管理対象のデバイスを識別するため、画面右上からMidnight Walletを接続してください。',
    adminDeviceRequiredTitle: 'デバイス登録が必要です',
    adminDeviceRequiredBody: 'センサー履歴と証明処理を確認する前に、このWalletから導出されたデバイスを登録してください。',
    openDeviceWorkflow: 'デバイス登録画面を開く',
    project: 'プロジェクト', projectSelect: 'プロジェクトを選択', projectAdd: '＋ 新規追加',
    projectName: 'プロジェクト名', projectCreate: 'プロジェクトを作成', projectCancel: 'キャンセル',
    projectTimeZone: '固定UTCオフセット', projectDayStart: '運用日の開始時刻',
    projectLimit: 'Walletごとのプロジェクト数', projectCreated: 'プロジェクトを作成しました',
    policyAdd: '＋ しきい値を新規追加', policyRefresh: 'しきい値を再読み込み', policyRefreshHint: '登録結果は「しきい値を再読み込み」を押すと更新されます。', policyName: 'しきい値設定名', policyCreate: 'しきい値を登録',
    policyCancel: 'キャンセル', policyLimit: 'このプロジェクトのしきい値数', policyCreated: 'しきい値登録を受け付けました', policyProcessingTiming: '処理開始の目安',
    policyEmpty: 'デバイス登録前に、このプロジェクトのしきい値を作成してください。',
    policyCreating: '変更できない公開しきい値をMidnightへ登録しています。',
    policyMinimum: '下限（°C）', policyMaximum: '上限（°C）', policyRegistrationTx: 'しきい値登録TX',
    anomalyStepHelp: '手動操作は不要です。登録時は「正常」で開始し、外れ値を含むデータを送ると現在状態が自動更新されます。',
    currentAnomalyState: 'デバイスの現在状態', anomalyStateNormal: '正常 — 発生中の異常なし',
    anomalyStateOpen: '異常 — しきい値超過中', anomalyStateChangedAt: '状態更新日時',
    proofGeneratedAt: 'ZKP生成日時',
    identityCreate: 'デバイス認証鍵を作成', registerAction: 'デバイス登録・しきい値設定',
    progressChallenge: '登録用のワンタイムチャレンジを取得中',
    progressWalletSignature: 'Midnight Walletの署名を待っています',
    progressWalletVerification: 'Walletの登録承認を検証中',
    progressQueued: '登録を受け付け、サーバー処理キューに追加しました',
    nextProcessingStart: '次回の処理開始',
    processingAlwaysOn: '次の1分Cronで処理を開始します',
    processingOnDemand: '受付済みJobを1分ごとに確認します',
    processingCooldown: 'Container再起動クールダウン終了',
    processingNow: '処理開始時刻を過ぎています。サーバーが自動で処理を続けます',
    queuedWorkflowHint: 'Step 3〜4はこのまま操作できます。待機中の処理は、以下の時刻から自動で開始します。',
    progressSponsorSync: 'Sponsor Walletを同期中',
    progressSponsorReady: 'Sponsor Walletの準備完了',
    progressDeviceProof: 'デバイス登録TX用のZKPを生成中',
    progressDeviceSending: 'デバイス登録TXを送信中',
    progressDeviceSubmitted: 'デバイス登録TXを送信済み',
    progressDeviceConfirming: 'デバイス登録TXの確定待ち',
    progressDeviceConfirmed: 'デバイス登録TXが確定しました',
    progressAssignmentProof: 'しきい値割当TX用のZKPを生成中',
    progressAssignmentSending: 'しきい値割当TXを送信中',
    progressAssignmentSubmitted: 'しきい値割当TXを送信済み',
    progressAssignmentConfirming: 'しきい値割当TXの確定待ち',
    progressAssignmentConfirmed: 'しきい値割当TXが確定しました',
    progressRetry: '一時的な失敗のため、同じ処理IDで再試行を待っています',
    progressComplete: 'デバイス登録としきい値割当が完了しました',
    proofProgressConnecting: '最新のMidnightコントラクト状態を取得中',
    proofProgressBuilding: 'デバイストランザクションを作成中',
    proofProgressChecking: 'ZKP入力を検査中',
    proofProgressGenerating: '日次Attestation用のZKPを生成中',
    proofProgressWallet: 'Walletの承認待ち',
    proofProgressSponsoring: 'スポンサー処理要求をサーバーが受け付けました',
    proofProgressSponsorQueued: 'スポンサー処理キューで順番を待っています',
    proofProgressSponsorWalletChecking: 'Sponsor Walletの同期状態とDUST残高を確認しています',
    proofProgressSponsorWalletSyncing: 'Sponsor Walletの同期完了待ちです。完了後にサーバーが自動継続します',
    proofProgressSponsorFunding: 'Sponsor Walletに使用可能なDUSTがないため、入金を待っています',
    proofProgressSponsorCheckpoint: 'DUST使用前のSponsor Wallet状態を保存しています',
    proofProgressSponsorPreparing: 'DUSTを付与したトランザクションと手数料用ZK証明を作成しています',
    proofProgressSponsorRetry: '一時的な失敗のため、サーバー側の自動再試行を待っています',
    proofProgressSponsorPreDustRetry: 'DUST使用前にサーバー処理が中断しました。安全に自動再試行待ちへ戻しています',
    proofProgressSponsorInterrupted: '記録済みの処理段階で停止しました。安全に再試行できる時刻をサーバーが待っています',
    proofProgressSubmitting: 'Midnightへトランザクションを送信中',
    proofProgressRetrying: 'コントラクト状態が更新されたため、同じJob IDでZKP/TXを再生成中',
    proofProgressConfirming: 'Midnightトランザクションの確定待ち',
    proofProgressConfirmed: 'Midnightトランザクションが確定しました',
    proofRequestUploading: '時間別集計をAPIへ送信中（{completed}/{total}）',
    proofRequestRegistering: 'ZKP生成・TX発行Jobを登録中',
    proofRequestAccepted: 'サーバーが処理要求を受け付けました',
    proofRequestTimedOut: '処理要求の受付確認がタイムアウトしました。同じ運用日で再試行できます。受信済みデータは重複登録されません。',
    registrationJob: '登録Job', deviceRegistrationTx: 'デバイス登録TX', assignmentRegistrationTx: 'しきい値割当TX',
    captureAction: '取得して送信', proofAction: '証明処理を開始', submitAction: 'ZKP生成・TX発行を依頼', workflowRefresh: '状態を再読み込み', workflowRefreshing: '状態を再読み込み中…',
    retrySubmitAction: 'ZK証明とトランザクションを再生成',
    reproofReady: '前回のTXは解放済みです。同じProof Job IDでZK証明とTXを再生成できます。',
    deviceId: 'デバイスID（ウォレットから自動生成）', wallet: 'ウォレット', temperature: '温度', progress: '処理状況',
    identityRestored: '保存済みのデバイス認証鍵を復元しました', registrationRestored: '登録済みデバイスとしきい値設定を復元しました',
    autoGenerate: '1日分を自動生成', generationDate: '運用日', previousSensorDay: '◀ 前日', nextSensorDay: '翌日 ▶',
    generationMode: '生成モード', withOutliers: 'ランダム値＋外れ値（しきい値外の証明）',
    withinThreshold: 'しきい値内（ZK証明の確認用）', outlierCount: '外れ値', dailyHistory: '日別センサー履歴',
    selectDay: 'この日を表示', verifyDaily: '日次ZK証明を確認', requestDaily: '日次証明を要求',
    submitDaily: 'ZK証明を生成・トランザクション送信', thresholdResult: 'しきい値結果',
    withinResult: 'しきい値内', outsideResult: 'しきい値外', stoppedResult: '計測なし',
    privateAvailable: 'このブラウザに非公開の証明入力あり', privateUnavailable: 'このブラウザに非公開の証明入力がありません',
    feeSponsored: 'サービスのSponsor WalletがDUST手数料を付与し、デバイスが承認したトランザクションを送信します。',
    feeSponsoredLabel: 'トランザクション手数料はスポンサー負担',
    sponsorQuotaTitle: 'スポンサー送信の日次上限（JST）', sponsorQuotaRemaining: '回利用可能',
    sponsorQuotaUsed: '回使用済み', sponsorQuotaReset: 'リセット',
    sponsorQuotaReached: '本日分の上限に達しました。予約済みの証明処理は引き続き再試行できます。',
    alreadyAttested: 'この測定グループはMidnightに記録済みです。再送信は行いません。',
    completeDay: '1日分完了', incompleteDay: '当日進行中', generationRange: '完了済みの過去30日間のみ', latestProofs: '日次証明記録（新しい順）',
    publicProofListIntro: '運用日を選び、24時間分の判定を確認してください。', publicView: '第三者向け画面', checked: '確認済み', checksComplete: '項目を確認済み',
    statusPending: '待機中', statusAggregating: 'センサー値を集計中', statusProving: 'ZK証明を作成中',
    statusSubmitted: 'Midnightへ送信済み', statusConfirmed: 'Midnightに記録済み', statusFailed: '処理に失敗',
    statusActive: '利用中', statusDisabled: '無効', statusRevoked: '利用停止', statusRegistered: '登録済み',
    statusRetired: '使用終了', statusUnregistered: '未登録', statusDispatched: '証明処理へ送信済み',
    statusProofReady: '証明作成済み', statusReadyForInput: '証明作成の準備完了', statusRetryableFailed: '再試行待ち',
    statusSponsorRetryable: 'Sponsor Walletの再開待ち',
    statusReproofRequired: 'ZKP/TXの再生成が必要',
    statusDeadLettered: '処理終了',
    statusWaitingForRegistration: 'デバイス登録後の処理待ち',
    submissionQueued: 'ZKP生成・TX発行処理待ち',
    submissionQueuedDetail: 'サーバーは受付済みJobを1分ごとに確認し、Jobがある場合だけ必要なContainerを起動します。このページを開いたままにすると、デバイスTXの準備後にWallet承認を求めます。',
    statusDeviceBound: 'デバイス承認済み', statusSponsoring: '手数料を付与中', statusSponsored: '手数料付与済み',
    viewDay: 'この日を確認', hourlySummary: '時間別 最小 / 最大 / 平均',
    olderDay: '◀ 古い日', newerDay: '新しい日 ▶',
  },
};

if (demo) {
  Object.assign(copy.en, {
    subtitle: 'USE-CASE DEMO / FILMING SIMULATION',
    deviceIntro: 'Authenticate with your Wallet, approve registration, and follow the daily proof workflow.',
    deviceId: 'Device ID (demo account)', wallet: 'Wallet',
    online: 'LOCAL DEMO', checked: 'SIMULATED', confirmed: 'Simulated confirmation complete',
    statusConfirmed: 'Simulated confirmation', thresholdPublic: 'PUBLIC OUTPUT / SIMULATION',
    chainCheckInProgress: 'Checking public evidence', chainCheckInProgressDetail: 'Matching the transaction, operational day and registered Policy.',
    chainCheckComplete: 'Public verification complete (simulation)', chainCheckCompleteDetail: 'The public result matches the selected day and registered Policy.',
    progressComplete: 'Device registration and Policy assignment complete (simulation)',
    proofProgressConfirmed: 'Transaction confirmed (simulation)', processingAlwaysOn: 'Processing the selected day',
    submissionQueued: 'PROOF AND TRANSACTION QUEUED', submissionQueuedDetail: 'Track the proof job here. The use case proceeds to Wallet approval when the Device transaction is ready.',
    policyCreating: 'Registering the immutable threshold Policy.', policyCreated: 'Policy registered — refresh Policies',
    syncCompleteDetail: 'The latest workflow records are displayed.', source: 'Measurement source',
    privacy: 'FILMING SIMULATION / Public conditions and results; private measurement values',
  });
  Object.assign(copy.ja, {
    subtitle: 'Wallet連携ユースケース / 撮影用シミュレーション',
    deviceIntro: 'Walletで認証し、登録内容を承認して、日次証明の処理へ進みます。',
    deviceId: 'デバイスID（撮影用アカウント）', wallet: 'ウォレット',
    online: 'LOCAL DEMO', checked: 'デモ確認', confirmed: '記録完了（撮影用）', statusConfirmed: '記録済み（撮影用）', thresholdPublic: '公開条件と判定',
    chainCheckInProgress: '公開証拠を照合中', chainCheckInProgressDetail: '取引、運用日、登録済みPolicyを照合します。',
    chainCheckComplete: '公開検証が完了（撮影用）', chainCheckCompleteDetail: '対象日と登録済みPolicyに対する公開判定が一致しました。',
    progressComplete: 'Device登録とPolicy割当が完了（撮影用）', proofProgressConfirmed: '取引を記録済み（撮影用）',
    processingAlwaysOn: '選択した運用日の処理を実行', submissionQueued: 'ZKP生成・TX発行処理待ち',
    submissionQueuedDetail: 'このページでJobの進行を確認します。デバイスTXの準備後は、Walletで内容を確認して承認する流れです。',
    policyCreating: '変更不能なしきい値Policyを登録しています。', policyCreated: 'Policy登録完了 — しきい値を再読み込み',
    syncCompleteDetail: '最新の処理記録を表示しています。', source: '計測データの取得元',
    privacy: '撮影用シミュレーション / 条件と判定を公開し、元の測定値を保護',
  });
}

let selectedLanguage = localStorage.getItem('vsp-language') || 'auto';
let deviceModule;
let deviceLoadPromise;
let adminData = null;
let adminSelectedDate = '';
let provisioningStatusRequestActive = false;
let queuedWorkflowStatusRequestActive = false;
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
  provisioning: null,
  submissionQueued: false,
  selectedDate: localStorage.getItem('vsp-selected-sensor-date') || '',
  generationDate: '',
  generationMode: localStorage.getItem('vsp-generation-mode') || 'with-outliers',
  busy: false,
  activeAction: '',
  message: '',
  error: '',
  deviceId: '',
  projectId: '',
  projects: [],
  maximumProjects: 10,
  projectCreateOpen: false,
  policyListState: 'idle',
  policyListError: '',
  policyOperations: [],
  maximumPolicies: 10,
  policyCreateOpen: false,
  selectedPolicyId: '',
  historyListState: 'ready',
  historyListError: '',
};

deviceState.generationDate = normalizedSensorDate(
  localStorage.getItem('vsp-generation-date') || defaultSensorDate(),
);

function utcDate(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function defaultSensorDate() {
  return sensorDateBounds().maximum;
}

function operationalDate(value = new Date()) {
  const boundary = deviceState.configuration?.operationalDay || {
    timeZoneOffsetMinutes: 0,
    localDayStartHour: 0,
  };
  return new Date(
    value.valueOf()
      + boundary.timeZoneOffsetMinutes * 60_000
      - boundary.localDayStartHour * 3_600_000,
  ).toISOString().slice(0, 10);
}

function shiftedCalendarDate(periodDate, days) {
  const [year, month, day] = periodDate.split('-').map(Number);
  return utcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

function sensorDateBounds(value = new Date()) {
  const current = operationalDate(value);
  return {
    minimum: shiftedCalendarDate(current, -30),
    maximum: shiftedCalendarDate(current, -1),
  };
}

function normalizedSensorDate(value) {
  const bounds = sensorDateBounds();
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && value >= bounds.minimum && value <= bounds.maximum
    ? value
    : bounds.maximum;
}

function windowDate(window) { return operationalDate(new Date(window.periodStart)); }

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
  if (demo) return `<span class="hash" title="SIMULATED — no chain record">${escapeHtml(display || "—")}</span>`;
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
function utcDateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? String(value) : new Intl.DateTimeFormat(
    locale() === 'ja' ? 'ja-JP' : 'en-GB',
    {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'UTC', timeZoneName: 'short',
    },
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
function statusText(value) {
  const normalized = String(value || 'pending').replaceAll('_', '-');
  const statusKey = {
    pending: 'statusPending', aggregating: 'statusAggregating', proving: 'statusProving', submitted: 'statusSubmitted',
    confirmed: 'statusConfirmed', failed: 'statusFailed', active: 'statusActive', disabled: 'statusDisabled',
    revoked: 'statusRevoked', registered: 'statusRegistered', retired: 'statusRetired', unregistered: 'statusUnregistered',
    dispatched: 'statusDispatched', 'proof-ready': 'statusProofReady', 'ready-for-input': 'statusReadyForInput',
    'device-bound': 'statusDeviceBound', sponsoring: 'statusSponsoring', sponsored: 'statusSponsored',
    'sponsor-retryable': 'statusSponsorRetryable',
    'retryable-failed': 'statusRetryableFailed',
    'reproof-required': 'statusReproofRequired',
    'dead-lettered': 'statusDeadLettered',
    'waiting-for-registration': 'statusWaitingForRegistration',
  }[normalized];
  return statusKey ? t(statusKey) : normalized.replaceAll('-', ' ');
}
function status(value) {
  const normalized = String(value || 'pending').replaceAll('_', '-');
  return `<span class="status status-${escapeHtml(normalized)}">${escapeHtml(statusText(value))}</span>`;
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
function dataStateView(state, {
  loadingTitle = t('loadingRecords'),
  loadingDetail = t('loadingRecordsDetail'),
  emptyTitle = t('noRecords'),
  emptyDetail = t('noRecordsDetail'),
  error = '',
} = {}) {
  if (state === 'loading' || state === 'refreshing') {
    return `<div class="data-state data-state-loading" role="status" aria-live="polite" aria-busy="true">
      <span class="data-state-spinner" aria-hidden="true"></span>
      <span class="data-state-copy"><small>${escapeHtml(t('loadingLabel'))}</small><strong>${escapeHtml(loadingTitle)}</strong><span>${escapeHtml(loadingDetail)}</span></span>
      <span class="data-state-progress" aria-hidden="true"></span>
    </div>`;
  }
  if (state === 'error') {
    return `<div class="data-state data-state-error" role="alert">
      <span class="data-state-mark" aria-hidden="true">!</span>
      <span class="data-state-copy"><small>${escapeHtml(t('error'))}</small><strong>${escapeHtml(t('failed'))}</strong><span>${escapeHtml(error)}</span></span>
    </div>`;
  }
  return `<div class="data-state data-state-empty" role="status">
    <span class="data-state-mark" aria-hidden="true">—</span>
    <span class="data-state-copy"><small>${escapeHtml(t('noDataLabel'))}</small><strong>${escapeHtml(emptyTitle)}</strong><span>${escapeHtml(emptyDetail)}</span></span>
  </div>`;
}

function table(headers, rows, options = {}) {
  const state = options.state || 'ready';
  if (!rows.length) return dataStateView(state, options);
  const refreshState = state === 'loading' || state === 'refreshing'
    ? dataStateView(state, options)
    : state === 'error'
      ? dataStateView(state, options)
      : '';
  return `${refreshState}<div class="data-table-wrap"><table class="data-table"><thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function renderDeviceScreen() {
  main.innerHTML = deviceView();
  attachDeviceActions();
}

function deviceViewSnapshot() {
  const template = document.createElement('template');
  template.innerHTML = deviceView();
  return template.content;
}

function patchDeviceElement(snapshot, selector) {
  const current = document.querySelector(selector);
  const next = snapshot.querySelector(selector);
  if (!current || !next) return;
  current.className = next.className;
  current.innerHTML = next.innerHTML;
  if ('disabled' in current && 'disabled' in next) current.disabled = next.disabled;
  if ('hidden' in current && 'hidden' in next) current.hidden = next.hidden;
  if ('value' in current && 'value' in next) current.value = next.value;
  for (const attribute of ['aria-busy', 'aria-current', 'aria-disabled', 'title']) {
    if (next.hasAttribute(attribute)) current.setAttribute(attribute, next.getAttribute(attribute));
    else current.removeAttribute(attribute);
  }
}

function refreshPolicyComponents() {
  if (route().name !== 'device' || !document.querySelector('.policy-management-window')) return;
  const snapshot = deviceViewSnapshot();
  for (const selector of [
    '#device-policy-count',
    '#device-policy-operation-state',
    '#device-policy-list',
    '#device-policy-add',
    '#device-policy-refresh',
    '#device-policy',
    '#device-threshold-display',
    '#device-identity-create',
    '#device-register',
  ]) patchDeviceElement(snapshot, selector);
}

function refreshRegistrationComponents({ includeHistory = false } = {}) {
  if (route().name !== 'device' || !document.querySelector('#registration-progress-slot')) return;
  const snapshot = deviceViewSnapshot();
  for (const selector of [
    '#device-alerts',
    '#device-stepper-content',
    '#registration-progress-slot',
    '#device-policy',
    '#device-threshold-display',
    '#device-identity-create',
    '#device-register',
    '#device-registration-refresh',
    '#device-capture',
    '#device-capture-refresh',
    '#device-submit',
    '#device-submit-refresh',
    '#device-history-refresh',
    '#device-progress',
  ]) patchDeviceElement(snapshot, selector);
  if (!includeHistory) return;
  const currentHistory = document.querySelector('.device-history');
  const nextHistory = snapshot.querySelector('.device-history');
  if (currentHistory && nextHistory) {
    currentHistory.innerHTML = nextHistory.innerHTML;
    attachDeviceHistoryActions();
    attachWorkflowRefreshButton('device-history-refresh');
  }
}

function refreshDeviceDynamicComponents({ includeHistory = true } = {}) {
  if (route().name !== 'device' || !document.querySelector('#device-stepper-content')) return;
  const snapshot = deviceViewSnapshot();
  for (const selector of [
    '#device-alerts',
    '#device-project-select',
    '#device-project-add',
    '#device-policy-count',
    '#device-policy-operation-state',
    '#device-policy-list',
    '#device-policy-add',
    '#device-policy-refresh',
    '#device-stepper-content',
    '#device-policy',
    '#device-threshold-display',
    '#registration-progress-slot',
    '#device-identity-create',
    '#device-identity-summary',
    '#device-register',
    '#device-registration-refresh',
    '#device-capture',
    '#device-capture-refresh',
    '#device-sensor-summary',
    '#device-proof-summary',
    '#device-submit',
    '#device-submit-refresh',
    '#device-history-refresh',
    '#device-chain-details',
  ]) patchDeviceElement(snapshot, selector);
  for (const selector of ['#device-project-create-form', '#device-policy-create-form']) {
    const current = document.querySelector(selector);
    const next = snapshot.querySelector(selector);
    if (current && next) current.hidden = next.hidden;
  }
  if (!includeHistory) return;
  const currentHistory = document.querySelector('.device-history');
  const nextHistory = snapshot.querySelector('.device-history');
  if (currentHistory && nextHistory) {
    currentHistory.innerHTML = nextHistory.innerHTML;
    attachDeviceHistoryActions();
    attachWorkflowRefreshButton('device-history-refresh');
  }
}

async function fetchJson(url) {
  if (demo) return demo.api(url);
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function normalizeRuntimeRoute() {
  const target = !location.hash ? '#/device' : '';
  if (!target) return true;
  location.hash = target;
  return false;
}

function applyRuntimeScope() {
  document.querySelector('#nav-device').hidden = false;
  document.querySelector('#nav-admin').hidden = false;
  walletConnectButton.hidden = false;
}

function updateReloadControl() {
  reloadButton.textContent = t('refresh');
  reloadButton.disabled = false;
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
  const registrationIsServerManaged = !deviceState.provisioned
    && ['queued', 'running', 'retrying'].includes(deviceState.provisioning?.status);
  const deviceRegistrationComplete = Boolean(deviceState.provisioned)
    || ['device_confirmed', 'assignment_zkp_generating', 'assignment_tx_submitting',
      'assignment_tx_submitted', 'assignment_confirmation_waiting', 'assignment_confirmed',
      'completed'].includes(deviceState.provisioning?.stage);
  const assignmentComplete = Boolean(deviceState.provisioned)
    || ['assignment_confirmed', 'completed'].includes(deviceState.provisioning?.stage);
  const steps = [
    { label: t('deviceRegister'), complete: deviceRegistrationComplete, queued: registrationIsServerManaged },
    { label: t('thresholdSetup'), complete: assignmentComplete, queued: registrationIsServerManaged },
    { label: t('sensorCapture'), complete: Boolean(deviceState.measurement), queued: false },
    { label: t('proofAndRecord'), complete: Boolean(deviceState.transaction), queued: deviceState.submissionQueued },
  ];
  const current = steps.findIndex((step) => !step.complete && !step.queued);
  return `<ol class="proof-stepper device-stepper">${steps.map((step, index) => {
    const state = step.complete ? 'done' : step.queued ? 'queued' : index === current ? 'nextAction' : 'waiting';
    return `
    <li class="${step.complete ? 'complete' : step.queued ? 'queued' : index === current ? 'current' : ''}"><span class="step-number">${step.complete ? '<span aria-hidden="true">✓</span><span class="visually-hidden">' + escapeHtml(t('done')) + '</span>' : index + 1}</span>
      <strong>${escapeHtml(step.label)}</strong><span class="step-state">${escapeHtml(t(state))}</span></li>`;
  }).join('')}</ol>`;
}

function provisioningProgressText(progress = deviceState.provisioning) {
  const labels = {
    challenge_requesting: 'progressChallenge',
    wallet_signature_requested: 'progressWalletSignature',
    wallet_authorization_verifying: 'progressWalletVerification',
    queued: 'progressQueued',
    sponsor_wallet_syncing: 'progressSponsorSync',
    sponsor_wallet_ready: 'progressSponsorReady',
    device_zkp_generating: 'progressDeviceProof',
    device_tx_submitting: 'progressDeviceSending',
    device_tx_submitted: 'progressDeviceSubmitted',
    device_confirmation_waiting: 'progressDeviceConfirming',
    device_confirmed: 'progressDeviceConfirmed',
    assignment_zkp_generating: 'progressAssignmentProof',
    assignment_tx_submitting: 'progressAssignmentSending',
    assignment_tx_submitted: 'progressAssignmentSubmitted',
    assignment_confirmation_waiting: 'progressAssignmentConfirming',
    assignment_confirmed: 'progressAssignmentConfirmed',
    retry_waiting: 'progressRetry',
    completed: 'progressComplete',
    failed: 'statusFailed',
  };
  if (progress?.stage && labels[progress.stage]) return t(labels[progress.stage]);
  return deviceState.provisioned ? t('progressComplete') : '—';
}

function submissionProgressText(progress) {
  const labels = {
    'connecting-contract': 'proofProgressConnecting',
    'connecting-canonical-indexer': 'proofProgressConnecting',
    'connecting-wallet-indexer': 'proofProgressConnecting',
    'contract-state-found': 'proofProgressConnecting',
    'loading-contract-deployment': 'proofProgressConnecting',
    'contract-connected': 'proofProgressConnecting',
    'building-transaction': 'proofProgressBuilding',
    'checking-proof-input': 'proofProgressChecking',
    'proof-input-checked': 'proofProgressChecking',
    'generating-proof': 'proofProgressGenerating',
    'proof-generated': 'proofProgressGenerating',
    'wallet-approval': 'proofProgressWallet',
    'requesting-sponsorship': 'proofProgressSponsoring',
    'sponsor-queued': 'proofProgressSponsorQueued',
    'sponsor-wallet-checking': 'proofProgressSponsorWalletChecking',
    'sponsor-wallet-syncing': 'proofProgressSponsorWalletSyncing',
    'sponsor-wallet-funding-required': 'proofProgressSponsorFunding',
    'sponsor-checkpointing': 'proofProgressSponsorCheckpoint',
    'sponsor-pre-dust-retry': 'proofProgressSponsorPreDustRetry',
    'sponsor-preparing': 'proofProgressSponsorPreparing',
    'sponsor-retry-wait': 'proofProgressSponsorRetry',
    'sponsor-interrupted': 'proofProgressSponsorInterrupted',
    'transaction-sponsored': 'proofProgressSubmitting',
    'submitting-transaction': 'proofProgressSubmitting',
    'transaction-submitted': 'proofProgressConfirming',
    'contract-state-changed-retrying': 'proofProgressRetrying',
    confirmed: 'proofProgressConfirmed',
  };
  return labels[progress] ? t(labels[progress]) : String(progress || '—');
}

function sponsorJobProgressText(job) {
  if (!job) return null;
  if (job.status === 'reproof_required') return t('reproofReady');
  if (job.sponsorStalled || job.sponsorStage === 'interrupted') {
    return submissionProgressText('sponsor-interrupted');
  }
  if (job.sponsorReasonCode === 'sponsor_wallet_syncing') {
    return submissionProgressText('sponsor-wallet-syncing');
  }
  if (job.sponsorReasonCode === 'sponsor_pre_dust_worker_interrupted') {
    return submissionProgressText('sponsor-pre-dust-retry');
  }
  if (
    job.sponsorReasonCode === 'sponsor_wallet_waiting_for_funding'
    || job.sponsorReasonCode === 'sponsor_wallet_no_spendable_dust'
  ) {
    return submissionProgressText('sponsor-wallet-funding-required');
  }
  const progressByStage = {
    queued: 'sponsor-queued',
    wallet_checking: 'sponsor-wallet-checking',
    checkpoint_persisting: 'sponsor-checkpointing',
    checkpoint_preserving: 'sponsor-checkpointing',
    transaction_preparing: 'sponsor-preparing',
    wallet_restarting: 'sponsor-retry-wait',
    retry_wait: 'sponsor-retry-wait',
    transaction_ready: 'transaction-sponsored',
    transaction_submitting: 'submitting-transaction',
    confirmation_waiting: 'transaction-submitted',
    completed: 'confirmed',
  };
  return progressByStage[job.sponsorStage]
    ? submissionProgressText(progressByStage[job.sponsorStage])
    : null;
}

function registrationProgressView() {
  const progress = deviceState.provisioning;
  if (!progress && !deviceState.provisioned) return '';
  const queued = progress?.status === 'queued';
  const active = ['running', 'retrying'].includes(progress?.status);
  const failed = progress?.status === 'failed' || progress?.stage === 'failed';
  const deviceTxId = progress?.deviceTxId || deviceState.provisioned?.registeredTxId || null;
  const assignmentTxId = progress?.assignmentTxId || deviceState.provisioned?.assignmentTxId || null;
  const progressIcon = active
    ? '<span class="action-spinner" aria-hidden="true"></span>'
    : queued
      ? '<span class="queued-clock" aria-hidden="true">◷</span>'
    : failed
      ? '<span class="action-error" aria-hidden="true">!</span>'
      : '<span class="action-check" aria-hidden="true">✓</span>';
  return `<div class="registration-progress ${failed ? 'registration-progress-failed' : ''}" role="status" aria-live="polite">
    <div>${progressIcon}<strong id="registration-progress-stage">${escapeHtml(provisioningProgressText())}</strong></div>
    <dl class="device-summary">${progress?.operationId ? `<dt>${escapeHtml(t('registrationJob'))}</dt><dd class="hash" id="registration-job-id">${escapeHtml(progress.operationId)}</dd>` : ''}
      <dt>${escapeHtml(t('status'))}</dt><dd>${status(progress?.status || (deviceState.provisioned ? 'registered' : 'pending'))}</dd>
      ${queued ? `<dt>${escapeHtml(t(processingSchedule()?.processingEligibleNow ? 'progress' : 'nextProcessingStart'))}</dt><dd class="processing-start-time">${escapeHtml(processingStartText())}</dd>` : ''}
      <dt>${escapeHtml(t('deviceRegistrationTx'))}</dt><dd class="hash" id="registration-device-tx">${escapeHtml(deviceTxId || '—')}</dd>
      <dt>${escapeHtml(t('assignmentRegistrationTx'))}</dt><dd class="hash" id="registration-assignment-tx">${escapeHtml(assignmentTxId || '—')}</dd></dl>
    ${queued ? `<div class="queued-workflow-hint">${escapeHtml(t('queuedWorkflowHint'))}</div>` : ''}
  </div>`;
}

function updateProvisioningProgress(progress) {
  deviceState.provisioning = progress;
  deviceState.message = provisioningProgressText(progress);
  refreshRegistrationComponents();
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
  // The server history is authoritative after a refresh. Keep the in-memory
  // Job only as a fallback so an older pre-confirmation object cannot replace
  // the same Job after D1 has reached confirmed.
  if (deviceState.proofJob) ensure(deviceState.proofJob.periodDate).proofJob ||= deviceState.proofJob;
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
  if (!day.proofJob || [
    'ready_for_input', 'proving', 'proof_ready', 'reproof_required',
  ].includes(day.proofJob?.status)) {
    const allowed = sponsorQuotaAllows(day.proofJob?.proofJobId);
    return `<button type="button" class="compact-button daily-submit" data-period-date="${escapeHtml(day.periodDate)}" ${allowed ? '' : 'disabled'} title="${allowed ? '' : escapeHtml(t('sponsorQuotaReached'))}">${escapeHtml(t('submitDaily'))}</button>`;
  }
  if (day.proofJob.errorCode === 'measurement_group_already_attested') {
    return `<span class="status status-dead-lettered" title="${escapeHtml(t('alreadyAttested'))}">${escapeHtml(t('alreadyAttested'))}</span>`;
  }
  return status(day.proofJob.status);
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
  return `<div class="notice sponsor-quota ${blocked ? 'device-error' : ''}"><strong>${escapeHtml(t('sponsorQuotaTitle'))}</strong>
    <span>${escapeHtml(quota.remaining)} ${escapeHtml(t('sponsorQuotaRemaining'))} / ${escapeHtml(quota.dailyLimit)} (${escapeHtml(quota.used)} ${escapeHtml(t('sponsorQuotaUsed'))})</span>
    <small>${escapeHtml(t('sponsorQuotaReset'))}: ${escapeHtml(dateTime(quota.resetAt))}</small>
    ${blocked ? `<span>${escapeHtml(t('sponsorQuotaReached'))}</span>` : ''}</div>`;
}

function deviceHistoryView(policy) {
  const days = deviceDays();
  const selected = selectedDeviceDay();
  const windows = [...(selected?.windows || [])].sort((left, right) => left.periodStart.localeCompare(right.periodStart));
  const localWindows = windows.length ? windows : (selected?.capture?.windows || []).map((window) => ({ ...window, unit: '°C' }));
  return `<section class="window full-width device-history"><div class="window-title"><span>${escapeHtml(t('dailyHistory'))}</span>${workflowRefreshButton('device-history-refresh', deviceState.busy || !deviceState.device)}</div><div class="window-body device-form">
    <div class="device-day-list">${table(
      [t('period'), t('sampleCount'), t('outlierCount'), t('status'), t('action')],
      days.map((day) => `<tr class="${day.periodDate === selected?.periodDate ? 'selected-row' : ''}"><td class="nowrap"><strong>${escapeHtml(day.periodDate)}</strong><br><button type="button" class="compact-button device-day-select" data-period-date="${escapeHtml(day.periodDate)}">${escapeHtml(t('selectDay'))}</button></td><td class="numeric">${escapeHtml(day.capture?.records?.length ?? day.proofJob?.sampleCount ?? day.windows.reduce((sum, window) => sum + window.count, 0))}</td><td class="numeric">${escapeHtml(day.capture?.outlierCount ?? '—')}</td><td>${thresholdResult(day.proofJob?.thresholdSatisfied ?? day.capture?.thresholdSatisfied, day.proofJob?.observedHourCount ?? day.capture?.attestation?.publicData?.observedHourCount)}<br>${day.proofJob ? status(day.proofJob.status) : status('aggregating')}<br><small>${escapeHtml(day.capture ? t('privateAvailable') : t('privateUnavailable'))}</small></td><td>${dailyProofAction(day)}</td></tr>`),
      {
        state: deviceState.historyListState,
        loadingTitle: t('loadingHistory'),
        loadingDetail: t('loadingHistoryDetail'),
        emptyTitle: t('noHistory'),
        emptyDetail: t('noHistoryDetail'),
        error: deviceState.historyListError,
      },
    )}</div>
    ${selected ? `<div class="device-hourly-summary"><div class="daily-heading"><strong>${escapeHtml(selected.periodDate)} — ${escapeHtml(t('hourlySummary'))}</strong><span>${dailyProofAction(selected)}</span></div>${table(
      [t('period'), t('count'), t('minimum'), t('maximum'), t('average'), t('commitment')],
      localWindows.map((window) => `<tr class="${windowIsOutlier(window, policy) ? 'outlier' : ''}"><td class="nowrap">${escapeHtml(dateTime(window.periodStart))}<br>${escapeHtml(dateTime(window.periodEnd))}</td><td class="numeric">${escapeHtml(window.count)}</td><td class="numeric">${escapeHtml(window.minimum)} ${escapeHtml(window.unit || '°C')}</td><td class="numeric">${escapeHtml(window.maximum)} ${escapeHtml(window.unit || '°C')}</td><td class="numeric">${escapeHtml(window.average)} ${escapeHtml(window.unit || '°C')}</td><td class="hash">${escapeHtml(short(window.commitment))}</td></tr>`),
    )}</div>` : ''}
  </div></section>`;
}

function nextDeviceAction() {
  if (!deviceState.wallet) return 'wallet-connect-button';
  if (!deviceState.device) return 'device-identity-create';
  if (!(deviceState.configuration?.policies || []).length) return 'device-policy-add';
  const registrationAccepted = Boolean(deviceState.provisioned)
    || ['queued', 'running', 'retrying'].includes(deviceState.provisioning?.status);
  if (!registrationAccepted) return 'device-register';
  if (!deviceState.measurement || deviceState.transaction) return 'device-capture';
  if (!deviceState.transaction && !deviceState.submissionQueued) return 'device-submit';
  return '';
}

function workflowButton(id, label, complete, disabled, queued = false) {
  const current = nextDeviceAction() === id;
  const active = deviceState.busy && deviceState.activeAction === id && !queued;
  const classes = ['workflow-action'];
  if (complete) classes.push('completed-action');
  if (queued) classes.push('queued-action');
  if (current) classes.push('next-action');
  if (active) classes.push('active-action');
  const state = active ? `${t('inProgress')}…` : queued ? t('queued') : current ? t('nextAction') : '';
  return `<button type="button" id="${escapeHtml(id)}" class="${classes.join(' ')}" ${disabled ? 'disabled' : ''} ${current ? 'aria-current="step"' : ''} ${active ? 'aria-busy="true"' : ''}>
    ${complete ? '<span class="action-check" aria-hidden="true">✓</span>' : queued ? '<span class="queued-clock" aria-hidden="true">◷</span>' : ''}${active ? '<span class="action-spinner" aria-hidden="true"></span>' : ''}<span>${escapeHtml(label)}</span>
    ${state ? `<span class="action-badge"${active ? ' role="status" aria-live="polite"' : ''}>${active ? '<span class="activity-dot" aria-hidden="true"></span>' : ''}${escapeHtml(state)}</span>` : ''}
  </button>`;
}

function workflowRefreshButton(id, disabled) {
  return `<button type="button" id="${escapeHtml(id)}" class="compact-button workflow-refresh-button" ${disabled ? 'disabled' : ''}>${escapeHtml(t('workflowRefresh'))}</button>`;
}

function fixedOffsetLabel(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function processingSchedule() {
  return deviceState.provisioning?.processingSchedule
    || deviceState.configuration?.processingSchedule
    || null;
}

function processingStartText() {
  const schedule = processingSchedule();
  if (!schedule) return '—';
  if (schedule.mode === 'always-on') return t('processingAlwaysOn');
  if (schedule.mode === 'on-demand') {
    const cooldownUntil = schedule.nextContainerStartAllowedAt;
    if (!cooldownUntil || Date.parse(cooldownUntil) <= Date.now()) return t('processingOnDemand');
    return `${t('processingCooldown')}: ${dateTime(cooldownUntil)}`;
  }
  if (schedule.processingEligibleNow) return t('processingNow');
  const startsAt = schedule.nextProcessingStartsAt;
  if (!startsAt || !Number.isFinite(Date.parse(startsAt))) return '—';
  const shifted = new Date(Date.parse(startsAt) + schedule.timeZoneOffsetMinutes * 60_000);
  const date = new Intl.DateTimeFormat(locale() === 'ja' ? 'ja-JP' : 'en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'UTC',
  }).format(shifted);
  return `${date} (${fixedOffsetLabel(schedule.timeZoneOffsetMinutes)})`;
}

function timeZoneOffsetOptions() {
  const browserOffset = Math.max(-840, Math.min(840, -new Date().getTimezoneOffset()));
  const selected = Math.round(browserOffset / 15) * 15;
  const values = Array.from({ length: 113 }, (_, index) => -840 + index * 15);
  return values.map((minutes) => `<option value="${minutes}" ${minutes === selected ? 'selected' : ''}>${fixedOffsetLabel(minutes)}</option>`).join('');
}

function localDayStartOptions() {
  return Array.from({ length: 24 }, (_, hour) => (
    `<option value="${hour}" ${hour === 0 ? 'selected' : ''}>${String(hour).padStart(2, '0')}:00</option>`
  )).join('');
}

function projectSelectorView() {
  const count = deviceState.projects.length;
  const atLimit = count >= deviceState.maximumProjects;
  const selectedProject = deviceState.projects.find((project) => project.projectId === deviceState.projectId);
  return `<section class="window project-selector-window"><div class="window-title">${escapeHtml(t('project'))}</div><div class="window-body project-selector-body">
    <label for="device-project-select">${escapeHtml(t('projectSelect'))}</label>
    <select id="device-project-select" ${deviceState.busy ? 'disabled' : ''}>${deviceState.projects.map((project) => (
      `<option value="${escapeHtml(project.projectId)}" ${project.projectId === deviceState.projectId ? 'selected' : ''}>${escapeHtml(localized(project.name, project.nameJa))}</option>`
    )).join('')}</select>
    <button type="button" class="compact-button project-add-button" id="device-project-add" ${deviceState.busy || atLimit ? 'disabled' : ''}>${escapeHtml(t('projectAdd'))}</button>
    <span class="project-count">${escapeHtml(t('projectLimit'))}: <strong>${escapeHtml(count)} / ${escapeHtml(deviceState.maximumProjects)}</strong></span>
    <form id="device-project-create-form" class="project-create-form" ${deviceState.projectCreateOpen ? '' : 'hidden'}>
      <label for="device-project-name">${escapeHtml(t('projectName'))}</label>
      <input id="device-project-name" name="projectName" maxlength="80" required autofocus>
      <label for="device-project-time-zone">${escapeHtml(t('projectTimeZone'))}</label>
      <select id="device-project-time-zone" name="timeZoneOffsetMinutes">${timeZoneOffsetOptions()}</select>
      <label for="device-project-day-start">${escapeHtml(t('projectDayStart'))}</label>
      <select id="device-project-day-start" name="localDayStartHour">${localDayStartOptions()}</select>
      <button type="submit" class="workflow-action next-action">${escapeHtml(t('projectCreate'))}</button>
      <button type="button" class="compact-button" id="device-project-cancel">${escapeHtml(t('projectCancel'))}</button>
    </form>
    ${selectedProject ? `<small>${escapeHtml(fixedOffsetLabel(selectedProject.timeZoneOffsetMinutes))} / ${escapeHtml(String(selectedProject.localDayStartHour).padStart(2, '0'))}:00–24h</small>` : ''}
  </div></section>`;
}

function activeDevicePolicy() {
  const policies = deviceState.configuration?.policies || [];
  const selectedId = deviceState.provisioned?.policyId || deviceState.selectedPolicyId;
  return policies.find((policy) => policy.policyId === selectedId) || policies[0] || null;
}

function policyManagementView() {
  const policies = deviceState.configuration?.policies || [];
  const registeredPolicyIds = new Set(policies.map((policy) => policy.policyId));
  const visibleOperations = deviceState.policyOperations.filter((operation) => (
    operation.status !== 'registered' || !registeredPolicyIds.has(operation.policyId)
  ));
  const activeOperations = deviceState.policyOperations.filter((operation) => (
    ['queued', 'running', 'retrying'].includes(operation.status)
  ));
  const count = policies.length + visibleOperations.filter((operation) => !registeredPolicyIds.has(operation.policyId)).length;
  const atLimit = count >= deviceState.maximumPolicies;
  const operationRows = visibleOperations.map((operation) => `<tr>
    <td>${escapeHtml(operation.name)}<br><small class="hash">${escapeHtml(short(operation.policyId, 24))}</small></td>
    <td>${escapeHtml(policyModeLabel(operation.mode))}<br>${escapeHtml(policyBounds({ ...operation, unit: '°C' }))}</td>
    <td>${status(operation.status)}<br><small>${escapeHtml(operation.stage.replaceAll('_', ' '))}</small>${['queued', 'running', 'retrying'].includes(operation.status) ? `<br><small class="processing-start-time">${escapeHtml(t('policyProcessingTiming'))}: ${escapeHtml(processingStartText())}</small>` : ''}</td>
    <td class="hash">${operation.policyTxId ? explorerLink('transaction', operation.policyTxId, deviceState.configuration?.network, short(operation.policyTxId, 24)) : '—'}${operation.error ? `<br><span class="device-error">${escapeHtml(operation.error)}</span>` : ''}</td>
  </tr>`);
  const registeredRows = policies.map((policy) => `<tr>
    <td>${escapeHtml(policy.name || policy.policyId)}<br><small class="hash">${escapeHtml(short(policy.policyId, 24))}</small></td>
    <td>${escapeHtml(policyModeLabel(policy.mode))}<br>${escapeHtml(policyBounds({ ...policy, unit: '°C' }))}</td>
    <td>${status('registered')}</td>
    <td class="hash">${explorerLink('transaction', policy.registeredTxId, deviceState.configuration?.network, short(policy.registeredTxId, 24))}</td>
  </tr>`);
  return `<section class="window policy-management-window"><div class="window-title">${escapeHtml(t('policy'))}</div><div class="window-body device-form">
    <div class="project-selector-body">
      <button type="button" class="compact-button project-add-button ${nextDeviceAction() === 'device-policy-add' ? 'next-action' : ''}" id="device-policy-add" ${deviceState.busy || atLimit ? 'disabled' : ''} ${nextDeviceAction() === 'device-policy-add' ? 'aria-current="step"' : ''}>${escapeHtml(t('policyAdd'))}</button>
      <button type="button" class="compact-button" id="device-policy-refresh" ${deviceState.busy ? 'disabled' : ''}>${escapeHtml(t('policyRefresh'))}</button>
      <span class="project-count" id="device-policy-count">${escapeHtml(t('policyLimit'))}: <strong>${escapeHtml(count)} / ${escapeHtml(deviceState.maximumPolicies)}</strong></span>
    </div>
    <small>${escapeHtml(t('policyRefreshHint'))}</small>
    <form id="device-policy-create-form" class="policy-create-form" ${deviceState.policyCreateOpen ? '' : 'hidden'}>
      <label>${escapeHtml(t('policyName'))}<input id="device-policy-name" name="policyName" maxlength="80" required autofocus></label>
      <label>${escapeHtml(t('policyMode'))}<select id="device-policy-mode" name="policyMode">
        <option value="closed-range">${escapeHtml(t('modeClosedRange'))}</option>
        <option value="upper-bound">${escapeHtml(t('modeUpperBound'))}</option>
        <option value="lower-bound">${escapeHtml(t('modeLowerBound'))}</option>
      </select></label>
      <label>${escapeHtml(t('policyMinimum'))}<input id="device-policy-minimum" name="policyMinimum" type="number" step="0.01" value="10" required></label>
      <label>${escapeHtml(t('policyMaximum'))}<input id="device-policy-maximum" name="policyMaximum" type="number" step="0.01" value="35" required></label>
      <div class="policy-form-actions"><button type="submit" class="workflow-action next-action">${escapeHtml(t('policyCreate'))}</button>
      <button type="button" class="compact-button" id="device-policy-cancel">${escapeHtml(t('policyCancel'))}</button></div>
    </form>
    <div id="device-policy-operation-state">${activeOperations.length ? `<div class="notice"><strong>${escapeHtml(t('inProgress'))}</strong><span>${escapeHtml(t('policyCreating'))}</span></div>` : ''}</div>
    <div id="device-policy-list">${table(
      [t('policy'), t('policyBounds'), t('status'), t('policyRegistrationTx')],
      [...operationRows, ...registeredRows],
      {
        state: deviceState.policyListState,
        loadingTitle: t('loadingPolicies'),
        loadingDetail: t('loadingPoliciesDetail'),
        emptyTitle: t('noPolicies'),
        emptyDetail: t('policyEmpty'),
        error: deviceState.policyListError,
      },
    )}</div>
  </div></section>`;
}

function deviceView() {
  const config = deviceState.configuration;
  const policy = activeDevicePolicy();
  const generationBounds = sensorDateBounds();
  const policyDescription = policy ? policyBounds({
    mode: policy.mode,
    minimum: policy.minimum,
    maximum: policy.maximum,
    unit: '°C',
  }) : '—';
  const result = deviceState.transaction;
  const registrationAccepted = Boolean(deviceState.provisioned)
    || ['queued', 'running', 'retrying'].includes(deviceState.provisioning?.status);
  const submitActionLabel = deviceState.proofJob?.status === 'reproof_required'
    ? t('retrySubmitAction')
    : t('submitAction');
  const heading = `<div class="project-heading"><div><h2>${escapeHtml(t('device'))}</h2><p>${escapeHtml(t('deviceIntro'))}</p></div>
      <span class="network-label">${escapeHtml(config?.network?.toUpperCase() || 'PREPROD')}</span></div>
    <div id="device-alerts">${deviceState.error ? `<div class="notice device-error"><strong>ERROR</strong><span>${escapeHtml(deviceState.error)}</span></div>` : ''}
    ${deviceState.message ? `<div class="notice"><strong>INFO</strong><span>${escapeHtml(deviceState.message)}</span></div>` : ''}</div>`;
  if (!deviceState.wallet) {
    return `${heading}<section class="window wallet-gate" aria-labelledby="wallet-gate-title">
      <div class="window-title" id="wallet-gate-title">${escapeHtml(t('walletRequiredTitle'))}</div>
      <div class="window-body wallet-gate-body"><div class="wallet-gate-icon" aria-hidden="true">W</div>
        <div><p>${escapeHtml(t('walletRequiredBody'))}</p><span class="network-label">MIDNIGHT / PREPROD</span></div>
      </div></section>`;
  }
  return `${heading}
    ${projectSelectorView()}
    ${policyManagementView()}
    <section class="window"><div class="window-title">${escapeHtml(t('flow'))}</div><div class="window-body" id="device-stepper-content">${deviceStepper()}</div></section>
    <div class="device-action-grid section-gap">
      <section class="window"><div class="window-title">1. ${escapeHtml(t('deviceIdentity'))}</div><div class="window-body device-form">
        <label>${escapeHtml(t('deviceId'))}<input id="device-id-input" maxlength="80" value="${escapeHtml(deviceState.deviceId)}" readonly></label>
        ${workflowButton('device-identity-create', t('identityCreate'), Boolean(deviceState.device), deviceState.busy || !deviceState.wallet || Boolean(deviceState.device))}
        <dl class="device-summary" id="device-identity-summary"><dt>${escapeHtml(t('wallet'))}</dt><dd>${escapeHtml(deviceState.wallet ? `${deviceState.wallet.walletName} / ${short(deviceState.wallet.shieldedAddress, 26)}` : '—')}</dd>
          <dt>Device Authority</dt><dd class="hash">${escapeHtml(short(deviceState.device?.deviceAuthority, 30))}</dd></dl>
      </div></section>
      <section class="window"><div class="window-title">2. ${escapeHtml(t('midnightRegistration'))}</div><div class="window-body device-form">
        <label>${escapeHtml(t('policy'))}<select id="device-policy" ${deviceState.provisioned || !policy || ['queued', 'running', 'retrying'].includes(deviceState.provisioning?.status) ? 'disabled' : ''}>${(config?.policies || []).map((item) => `<option value="${escapeHtml(item.policyId)}" ${item.policyId === policy?.policyId ? 'selected' : ''}>${escapeHtml(item.name || item.policyId)} / ${escapeHtml(policyBounds({ ...item, unit: '°C' }))}</option>`).join('')}</select></label>
        <div class="threshold-display" id="device-threshold-display"><strong>${escapeHtml(policyDescription)}</strong><small>${escapeHtml(policy?.registeredTxId || '—')}</small></div>
        <div class="workflow-action-row">${workflowButton('device-register', t('registerAction'), Boolean(deviceState.provisioned), deviceState.busy || !deviceState.device || !policy || Boolean(deviceState.provisioned) || ['queued', 'running', 'retrying'].includes(deviceState.provisioning?.status))}${workflowRefreshButton('device-registration-refresh', deviceState.busy || !deviceState.device || !policy)}</div>
        <div id="registration-progress-slot">${registrationProgressView()}</div>
        <div class="hash">Contract: ${escapeHtml(short(config?.contractAddress, 34))}</div>
      </div></section>
      <section class="window full-width"><div class="window-title">3. ${escapeHtml(t('sensorCapture'))}</div><div class="window-body device-form">
        <div class="daily-generator">
          <div class="device-date-field"><label for="device-period-date">${escapeHtml(t('generationDate'))}</label><div class="device-date-controls">
            <button type="button" class="compact-button" id="device-date-previous" ${deviceState.generationDate <= generationBounds.minimum ? 'disabled' : ''}>${escapeHtml(t('previousSensorDay'))}</button>
            <input id="device-period-date" type="date" min="${escapeHtml(generationBounds.minimum)}" max="${escapeHtml(generationBounds.maximum)}" value="${escapeHtml(deviceState.generationDate)}">
            <button type="button" class="compact-button" id="device-date-next" ${deviceState.generationDate >= generationBounds.maximum ? 'disabled' : ''}>${escapeHtml(t('nextSensorDay'))}</button>
          </div><small>${escapeHtml(t('generationRange'))}: ${escapeHtml(generationBounds.minimum)} – ${escapeHtml(generationBounds.maximum)}</small></div>
          <label>${escapeHtml(t('generationMode'))}<select id="device-generation-mode"><option value="with-outliers" ${deviceState.generationMode === 'with-outliers' ? 'selected' : ''}>${escapeHtml(t('withOutliers'))}</option><option value="within-threshold" ${deviceState.generationMode === 'within-threshold' ? 'selected' : ''}>${escapeHtml(t('withinThreshold'))}</option>${demo ? `<option value="missing-hours" ${deviceState.generationMode === 'missing-hours' ? 'selected' : ''}>18 hours + 6 NO DATA / 6時間欠測</option><option value="no-data" ${deviceState.generationMode === 'no-data' ? 'selected' : ''}>24 hours NO DATA / 全時間欠測</option>` : ''}</select></label>
        </div>
        <div class="workflow-action-row">${workflowButton('device-capture', t('autoGenerate'), Boolean(deviceState.measurement), deviceState.busy || !registrationAccepted)}${workflowRefreshButton('device-capture-refresh', deviceState.busy || !deviceState.device)}</div>
        <dl class="device-summary" id="device-sensor-summary"><dt>${escapeHtml(t('period'))}</dt><dd>${escapeHtml(deviceState.measurement?.periodDate || '—')}</dd>
          <dt>${escapeHtml(t('sampleCount'))}</dt><dd>${escapeHtml(deviceState.measurement?.records?.length ?? '—')}</dd>
          <dt>${escapeHtml(t('outlierCount'))}</dt><dd>${escapeHtml(deviceState.measurement?.outlierCount ?? '—')}</dd>
          <dt>${escapeHtml(t('thresholdResult'))}</dt><dd>${deviceState.measurement ? thresholdResult(deviceState.measurement.thresholdSatisfied, deviceState.measurement.attestation.publicData.observedHourCount) : '—'}</dd>
          <dt>Attestation</dt><dd class="hash">${escapeHtml(short(deviceState.measurement?.attestation?.publicData?.attestationCommitment, 30))}</dd></dl>
      </div></section>
      <section class="window full-width"><div class="window-title">4. ${escapeHtml(t('proofAndRecord'))}</div><div class="window-body device-form transaction-workflow">
        <div class="workflow-action-row">${workflowButton('device-submit', submitActionLabel, Boolean(deviceState.transaction), deviceState.busy || !deviceState.measurement || !deviceState.measurement.completeDay || Boolean(deviceState.transaction) || deviceState.submissionQueued || ['confirmed', 'dead_lettered'].includes(deviceState.proofJob?.status) || !sponsorQuotaAllows(deviceState.proofJob?.proofJobId), deviceState.submissionQueued)}${workflowRefreshButton('device-submit-refresh', deviceState.busy || !deviceState.device)}</div>
        <dl class="device-summary" id="device-proof-summary"><dt>${escapeHtml(t('job'))}</dt><dd class="hash">${escapeHtml(short(deviceState.proofJob?.proofJobId, 30))}</dd>
          <dt>${escapeHtml(t('status'))}</dt><dd>${deviceState.proofJob ? status(deviceState.proofJob.status) : '—'}</dd></dl>
        <div id="device-chain-details">
        <div class="transaction-progress"><strong>${escapeHtml(t('progress'))}:</strong> <span id="device-progress">${escapeHtml(deviceState.message || '—')}</span></div>
        ${deviceState.submissionQueued ? `<div class="notice queued-submission-notice"><strong>${escapeHtml(t('submissionQueued'))}</strong><span>${escapeHtml(t('submissionQueuedDetail'))}</span><small>${escapeHtml(t('nextProcessingStart'))}: ${escapeHtml(processingStartText())}</small></div>` : ''}
        <div class="hash transaction-id">TX: ${escapeHtml(result?.transactionId || '—')}</div>
        <div class="hash transaction-hash">${escapeHtml(t('txHash'))}: ${explorerLink('transaction', result?.transactionHash, config?.network, result?.transactionHash || '—')}</div>
        ${result?.sponsorTransactionId ? `<div class="hash sponsor-transaction">Sponsor TX: ${escapeHtml(result.sponsorTransactionId)} / ${escapeHtml(result.feeDust)} tDUST</div>` : ''}
        <div class="notice transaction-fee-notice"><strong>${escapeHtml(t('feeSponsoredLabel'))}</strong><span>${escapeHtml(t('feeSponsored'))}</span></div>
        ${sponsorQuotaView()}</div>
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
    ? {
      transactionId: day.proofJob.attestTxId,
      transactionHash: day.proofJob.attestTxHash || day.proofJob.transactionHash || null,
    }
    : null;
}

async function refreshDeviceHistory(flow) {
  if (!deviceState.provisioned) return;
  deviceState.historyListState = deviceState.history === null ? 'loading' : 'refreshing';
  deviceState.historyListError = '';
  try {
    deviceState.history = await flow.loadDeviceHistory();
    const days = deviceDays();
    const selected = days.some((day) => day.periodDate === deviceState.selectedDate)
      ? deviceState.selectedDate
      : days[0]?.periodDate;
    if (selected) await applySelectedDeviceDay(flow, selected);
    deviceState.sponsorQuota = await flow.loadSponsorQuota();
    deviceState.historyListState = 'ready';
  } catch (error) {
    deviceState.historyListState = 'error';
    deviceState.historyListError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

async function refreshProjectPolicies(flow, { showProgress = false } = {}) {
  if (!deviceState.wallet || !deviceState.projectId) return;
  deviceState.policyListState = deviceState.policyListState === 'ready' ? 'refreshing' : 'loading';
  deviceState.policyListError = '';
  if (showProgress) refreshPolicyComponents();
  const previousPolicyIds = (deviceState.configuration?.policies || []).map((policy) => policy.policyId).join('\n');
  try {
    const result = await flow.loadProjectPolicies();
    const currentPolicyIds = new Set((deviceState.configuration?.policies || []).map((policy) => policy.policyId));
    const operationPolicyIds = new Set(result.operations.map((operation) => operation.policyId));
    const discoveredPolicies = result.policies.filter((policy) => (
      !currentPolicyIds.has(policy.policyId) && !operationPolicyIds.has(policy.policyId)
    )).map((policy) => ({
      operationId: `policy-sync-${policy.policyId}`,
      projectId: deviceState.projectId,
      policyId: policy.policyId,
      name: policy.name,
      mode: policy.mode,
      minimum: policy.minimum,
      maximum: policy.maximum,
      status: 'registered',
      stage: 'configuration_sync_pending',
      policyKey: policy.policyKey,
      policyTxId: policy.registeredTxId,
      error: null,
      createdAt: '',
      updatedAt: '',
    }));
    deviceState.policyOperations = [...result.operations, ...discoveredPolicies];
    deviceState.maximumPolicies = result.maximumPolicies;
    if (showProgress) refreshPolicyComponents();
    const nextPolicyIds = result.policies.map((policy) => policy.policyId).join('\n');
    const nextConfiguration = nextPolicyIds !== previousPolicyIds
      ? await flow.refreshProjectConfiguration()
      : deviceState.configuration;
    deviceState.configuration = nextConfiguration;
    const synchronizedPolicyIds = new Set((nextConfiguration?.policies || []).map((policy) => policy.policyId));
    deviceState.policyOperations = deviceState.policyOperations.filter((operation) => (
      operation.status !== 'registered' || !synchronizedPolicyIds.has(operation.policyId)
    ));
    const storedPolicyId = localStorage.getItem(`vsp-selected-policy:${deviceState.projectId}`) || '';
    const available = deviceState.configuration?.policies || [];
    if (deviceState.provisioned?.policyId) {
      deviceState.selectedPolicyId = deviceState.provisioned.policyId;
    } else if (available.some((policy) => policy.policyId === storedPolicyId)) {
      deviceState.selectedPolicyId = storedPolicyId;
    } else if (available.some((policy) => policy.policyId === deviceState.selectedPolicyId)) {
      // Keep the in-memory selection.
    } else {
      deviceState.selectedPolicyId = available[0]?.policyId || '';
    }
    deviceState.policyListState = 'ready';
    deviceState.policyListError = '';
  } catch (error) {
    deviceState.policyListState = 'error';
    deviceState.policyListError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

async function loadDeviceModule() {
  if (demo) {
    deviceModule = { browserDeviceFlow: demo.flow };
    deviceState.configuration ||= await demo.flow.loadConfiguration();
    return demo.flow;
  }
  if (!deviceLoadPromise) {
    deviceLoadPromise = (async () => {
      deviceModule ||= await import('/device-flow.js?v=20260904-1');
      if (!deviceState.configuration) {
        deviceState.configuration = await deviceModule.browserDeviceFlow.loadConfiguration();
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
  if (demo) return demo.verifyPublicAttestation(data);
  deviceModule ||= await import('/device-flow.js?v=20260904-1');
  return deviceModule.verifyPublicAttestation(data);
}

async function loadPublicProofFromMidnight(transactionHash) {
  if (demo) return demo.loadPublicAttestationByTransactionHash(transactionHash);
  deviceModule ||= await import('/device-flow.js?v=20260904-1');
  return deviceModule.loadPublicAttestationByTransactionHash(transactionHash);
}

async function deviceAction(actionId, message, operation, preparedFlow = null) {
  const fullRender = [
    'wallet-connect-button',
    'device-project-select',
    'device-project-create',
    'reload-button',
  ].includes(actionId);
  deviceState.busy = true;
  deviceState.activeAction = actionId;
  deviceState.error = '';
  deviceState.message = message;
  renderWalletControl();
  if (route().name === 'device') {
    if (fullRender) renderDeviceScreen();
    else refreshDeviceDynamicComponents({ includeHistory: false });
  }
  let flow = preparedFlow;
  let completed = false;
  try {
    flow ||= await loadDeviceModule();
    await operation(flow);
    completed = true;
  } catch (error) {
    if (flow?.isWalletConnectionLost?.(error)) {
      const failureStage = flow.walletConnectionFailureStage?.(error) || 'unknown';
      console.error('wallet_connection_lost', { failureStage, error });
      flow.resetWalletConnection();
      deviceState.wallet = null;
      deviceState.projects = [];
      deviceState.projectId = '';
      deviceState.deviceId = '';
      resetProjectDeviceState();
      deviceState.error = `${t('walletDisconnected')} ${t('walletFailureStage')}: ${failureStage}`;
    } else {
      deviceState.error = error instanceof Error ? error.message : String(error);
    }
  } finally {
    deviceState.busy = false;
    deviceState.activeAction = '';
    if (completed && deviceState.message === message) refreshDeviceMessageForLocale();
    renderWalletControl();
    if (route().name === 'device') {
      if (fullRender) renderDeviceScreen();
      else refreshDeviceDynamicComponents();
    } else if (completed && fullRender && route().name === 'admin') {
      await render({ showLoading: false });
    }
  }
}

async function refreshDeviceRegistrationState(flow) {
  const completed = await flow.resumePendingDeviceRegistration(updateProvisioningProgress);
  if (!completed) return false;
  deviceState.provisioned = completed;
  const deferred = await flow.loadDeferredWorkflow();
  if (deferred) {
    deviceState.measurement = deferred.capture;
    deviceState.selectedDate = deferred.capture.periodDate;
    deviceState.submissionQueued = deferred.workflow.submissionRequested;
    deviceState.proofJob = await flow.requestProof({
      admitNow: false,
      periodDate: deferred.capture.periodDate,
    });
  }
  await refreshDeviceHistory(flow);
  deviceState.message = `${t('registered')}: ${completed.registeredTxId}`;
  deviceState.error = '';
  return true;
}

async function refreshDeviceWorkflowState(flow) {
  const completed = await refreshDeviceRegistrationState(flow);
  if (!completed && deviceState.provisioned) await refreshDeviceHistory(flow);
  refreshDeviceMessageForLocale();
}

function attachWorkflowRefreshButton(id) {
  document.querySelector(`#${id}`)?.addEventListener('click', () => {
    void deviceAction(id, t('workflowRefreshing'), async (flow) => {
      await refreshDeviceWorkflowState(flow);
      deviceState.message = t('syncComplete');
    });
  });
}

async function refreshPendingDeviceRegistration() {
  if (
    provisioningStatusRequestActive
    || deviceState.busy
    || !deviceState.wallet
    || !deviceState.device
    || deviceState.provisioned
  ) return;
  provisioningStatusRequestActive = true;
  try {
    const flow = await loadDeviceModule();
    await refreshDeviceRegistrationState(flow);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (deviceState.provisioning?.status === 'failed') {
      deviceState.error = detail;
    }
  } finally {
    provisioningStatusRequestActive = false;
    if (deviceState.provisioned) refreshDeviceDynamicComponents();
    else refreshRegistrationComponents();
  }
}

async function submitDeviceDay(flow, periodDate) {
  let submitted;
  try {
    submitted = await flow.proveAndSubmit((progress) => {
      deviceState.message = submissionProgressText(progress);
      deviceState.submissionQueued = new Set([
        'sponsor-queued',
        'sponsor-wallet-syncing',
        'sponsor-wallet-funding-required',
        'sponsor-pre-dust-retry',
        'sponsor-retry-wait',
        'sponsor-interrupted',
        'transaction-submitted',
      ]).has(progress);
      refreshDeviceDynamicComponents({ includeHistory: false });
    }, periodDate);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!detail.includes('measurement group already attested')) throw error;
    await refreshDeviceHistory(flow);
    const recovered = deviceState.proofJob;
    if (
      recovered?.status === 'dead_lettered'
      && recovered.errorCode === 'measurement_group_already_attested'
    ) {
      deviceState.message = t('alreadyAttested');
      return;
    }
    if (
      !recovered?.attestTxId
      || !['sponsored', 'submitted', 'confirmed'].includes(recovered.status)
    ) throw error;
    deviceState.transaction ??= {
      transactionId: recovered.attestTxId,
      transactionHash: recovered.attestTxHash || recovered.transactionHash || null,
    };
    deviceState.message = `${statusText(recovered.status)}: ${recovered.attestTxId}`;
    return;
  }
  deviceState.transaction = submitted;
  await refreshDeviceHistory(flow);
  deviceState.transaction = submitted;
  deviceState.submissionQueued = false;
  deviceState.message = `${t('confirmed')}: ${submitted.transactionId}`;
}

async function requestProofAndRecord(flow, periodDate) {
  try {
    if (!deviceState.proofJob) {
      deviceState.proofJob = await flow.requestProof({
        admitNow: false,
        periodDate,
        onAcceptanceProgress(progress) {
          if (progress.stage === 'uploading') {
            deviceState.message = t('proofRequestUploading')
              .replace('{completed}', String(progress.completed))
              .replace('{total}', String(progress.total));
          } else {
            deviceState.message = t(progress.stage === 'registering'
              ? 'proofRequestRegistering'
              : 'proofRequestAccepted');
          }
          const element = document.querySelector('#device-progress');
          if (element) element.textContent = deviceState.message;
        },
      });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (
      error?.name === 'TimeoutError'
      || /(?:timed?\s*out|timeout|aborted)/iu.test(detail)
    ) throw new Error(t('proofRequestTimedOut'), { cause: error });
    throw error;
  }
  flow.queueDeferredSubmission(periodDate);
  deviceState.submissionQueued = true;
  deviceState.message = `${t('submissionQueued')} — ${processingStartText()}`;
  if (demo) setTimeout(() => void refreshQueuedProofWorkflow(), 600);
}

async function refreshQueuedProofWorkflow() {
  if (
    queuedWorkflowStatusRequestActive
    || deviceState.busy
    || !deviceState.wallet
    || !deviceState.provisioned
    || !deviceState.submissionQueued
    || !deviceState.proofJob
    || deviceState.transaction
    || deviceState.proofJob.status === 'waiting_for_registration'
  ) return;
  queuedWorkflowStatusRequestActive = true;
  try {
    const flow = await loadDeviceModule();
    deviceState.proofJob = await flow.refreshProofJob(deviceState.proofJob.proofJobId);
    if (['ready_for_input', 'proving', 'proof_ready', 'reproof_required'].includes(deviceState.proofJob.status)) {
      deviceState.submissionQueued = false;
      refreshDeviceDynamicComponents();
      await deviceAction('device-submit', t('submitAction'), (currentFlow) => (
        submitDeviceDay(currentFlow, deviceState.selectedDate)
      ));
      return;
    }
    if (deviceState.proofJob.status === 'dead_lettered') {
      deviceState.submissionQueued = false;
      deviceState.error = deviceState.proofJob.errorCode || t('statusFailed');
    } else {
      deviceState.message = `${deviceState.proofJob.proofJobId}: ${statusText(deviceState.proofJob.status)}`;
    }
    refreshDeviceDynamicComponents();
  } catch (error) {
    deviceState.error = error instanceof Error ? error.message : String(error);
    refreshDeviceDynamicComponents();
  } finally {
    queuedWorkflowStatusRequestActive = false;
  }
}

function resetProjectDeviceState() {
  deviceState.device = null;
  deviceState.provisioned = null;
  deviceState.measurement = null;
  deviceState.proofJob = null;
  deviceState.transaction = null;
  deviceState.history = null;
  deviceState.sponsorQuota = null;
  deviceState.provisioning = null;
  deviceState.submissionQueued = false;
  deviceState.policyListState = 'idle';
  deviceState.policyListError = '';
  deviceState.policyOperations = [];
  deviceState.policyCreateOpen = false;
  deviceState.selectedPolicyId = '';
  deviceState.historyListState = 'ready';
  deviceState.historyListError = '';
  adminData = null;
}

async function restoreActiveProject(flow) {
  await refreshProjectPolicies(flow);
  const restored = await flow.restoreDevice(deviceState.deviceId);
  deviceState.device = restored?.device || null;
  deviceState.provisioned = restored?.provisioned || null;
  deviceState.error = restored?.warning || '';
  if (!restored) return null;
  if (!restored.provisioned) {
    deviceState.provisioned = await flow.resumePendingDeviceRegistration(updateProvisioningProgress);
  }
  const deferred = await flow.loadDeferredWorkflow();
  if (deferred) {
    deviceState.measurement = deferred.capture;
    deviceState.selectedDate = deferred.capture.periodDate;
    deviceState.proofJob = deferred.job;
    deviceState.submissionQueued = deferred.workflow.submissionRequested;
  }
  if (deviceState.provisioned && deferred) {
    deviceState.proofJob = await flow.requestProof({
      admitNow: false,
      periodDate: deferred.capture.periodDate,
    });
  }
  if (deviceState.provisioned) await refreshDeviceHistory(flow);
  if (deviceState.provisioned) deviceState.selectedPolicyId = deviceState.provisioned.policyId;
  return restored;
}

function attachDeviceHistoryActions() {
  document.querySelectorAll('.device-day-select').forEach((button) => button.addEventListener('click', () => {
    const periodDate = button.dataset.periodDate || '';
    return deviceAction('device-day-select', t('selectDay'), async (flow) => {
      await applySelectedDeviceDay(flow, periodDate);
      deviceState.message = periodDate;
    });
  }));
  document.querySelectorAll('.daily-submit').forEach((button) => button.addEventListener('click', () => {
    const periodDate = button.dataset.periodDate || '';
    return deviceAction('device-submit', t('submitDaily'), async (flow) => {
      await applySelectedDeviceDay(flow, periodDate);
      await requestProofAndRecord(flow, periodDate);
    });
  }));
}

function attachDeviceActions() {
  document.querySelector('#device-project-select')?.addEventListener('change', (event) => {
    const selectedProjectId = event.target.value;
    if (!selectedProjectId || selectedProjectId === deviceState.projectId) return;
    void deviceAction('device-project-select', t('projectSelect'), async (flow) => {
      const selected = await flow.selectProject(selectedProjectId);
      deviceState.projectId = selectedProjectId;
      deviceState.configuration = selected.configuration;
      deviceState.deviceId = selected.deviceId;
      deviceState.projectCreateOpen = false;
      resetProjectDeviceState();
      const restored = await restoreActiveProject(flow);
      deviceState.message = restored
        ? deviceState.provisioned ? t('registrationRestored') : t('identityRestored')
        : `${t('projectSelect')}: ${deviceState.projects.find((item) => item.projectId === selectedProjectId)?.name || selectedProjectId}`;
    });
  });
  document.querySelector('#device-project-add')?.addEventListener('click', () => {
    deviceState.projectCreateOpen = true;
    document.querySelector('#device-project-create-form').hidden = false;
    document.querySelector('#device-project-name')?.focus();
  });
  document.querySelector('#device-project-cancel')?.addEventListener('click', () => {
    deviceState.projectCreateOpen = false;
    document.querySelector('#device-project-create-form').hidden = true;
  });
  document.querySelector('#device-project-create-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = form.get('projectName')?.toString().trim() || '';
    const timeZoneOffsetMinutes = Number(form.get('timeZoneOffsetMinutes'));
    const localDayStartHour = Number(form.get('localDayStartHour'));
    if (!name || !Number.isSafeInteger(timeZoneOffsetMinutes) || !Number.isSafeInteger(localDayStartHour)) return;
    void deviceAction('device-project-create', t('projectCreate'), async (flow) => {
      const created = await flow.createProject({ name, timeZoneOffsetMinutes, localDayStartHour });
      deviceState.projects = [...deviceState.projects, created.project];
      deviceState.maximumProjects = created.maximumProjects;
      deviceState.projectId = created.project.projectId;
      deviceState.configuration = created.configuration;
      deviceState.deviceId = created.deviceId;
      deviceState.projectCreateOpen = false;
      resetProjectDeviceState();
      await refreshProjectPolicies(flow);
      deviceState.message = `${t('projectCreated')}: ${created.project.name}`;
    });
  });
  document.querySelector('#device-policy-add')?.addEventListener('click', () => {
    deviceState.policyCreateOpen = true;
    document.querySelector('#device-policy-create-form').hidden = false;
    document.querySelector('#device-policy-name')?.focus();
  });
  document.querySelector('#device-policy-refresh')?.addEventListener('click', () => {
    void deviceAction('device-policy-refresh', t('policyRefresh'), async (flow) => {
      await refreshProjectPolicies(flow, { showProgress: true });
      deviceState.message = t('syncComplete');
    });
  });
  document.querySelector('#device-policy-cancel')?.addEventListener('click', () => {
    deviceState.policyCreateOpen = false;
    document.querySelector('#device-policy-create-form').hidden = true;
  });
  const updatePolicyBoundInputs = () => {
    const mode = document.querySelector('#device-policy-mode')?.value || 'closed-range';
    const minimum = document.querySelector('#device-policy-minimum');
    const maximum = document.querySelector('#device-policy-maximum');
    if (minimum) {
      minimum.disabled = mode === 'upper-bound';
      minimum.required = mode !== 'upper-bound';
    }
    if (maximum) {
      maximum.disabled = mode === 'lower-bound';
      maximum.required = mode !== 'lower-bound';
    }
  };
  document.querySelector('#device-policy-mode')?.addEventListener('change', updatePolicyBoundInputs);
  updatePolicyBoundInputs();
  document.querySelector('#device-policy-create-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = form.get('policyName')?.toString().trim() || '';
    const mode = form.get('policyMode')?.toString() || 'closed-range';
    const minimum = mode === 'upper-bound' ? null : Number(form.get('policyMinimum'));
    const maximum = mode === 'lower-bound' ? null : Number(form.get('policyMaximum'));
    if (!name || (minimum !== null && !Number.isFinite(minimum)) || (maximum !== null && !Number.isFinite(maximum))) return;
    void deviceAction('device-policy-create', t('policyCreate'), async (flow) => {
      const operation = await flow.createPolicy({ name, mode, minimum, maximum });
      deviceState.policyOperations = [operation, ...deviceState.policyOperations];
      deviceState.policyListState = 'ready';
      deviceState.policyListError = '';
      deviceState.selectedPolicyId = operation.policyId;
      localStorage.setItem(`vsp-selected-policy:${deviceState.projectId}`, operation.policyId);
      deviceState.policyCreateOpen = false;
      deviceState.message = `${t('policyCreated')}: ${operation.name}`;
    });
  });
  const shiftGenerationDate = (days) => {
    const input = document.querySelector('#device-period-date');
    if (!input?.value) return;
    const bounds = sensorDateBounds();
    const shifted = utcDate(new Date(Date.parse(`${input.value}T00:00:00.000Z`) + days * 24 * 60 * 60 * 1000));
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
    return deviceAction('device-identity-create', t('identityCreate'), async (flow) => {
      deviceState.device = await flow.createDevice(deviceState.deviceId);
      deviceState.message = `${t('deviceId')}: ${deviceState.device.deviceId}`;
    });
  });
  document.querySelector('#device-register')?.addEventListener('click', () => {
    const policyId = document.querySelector('#device-policy')?.value || '';
    return deviceAction('device-register', t('registerAction'), async (flow) => {
      try {
        deviceState.provisioned = await flow.registerDevice(
          { policyId },
          updateProvisioningProgress,
        );
      } catch (error) {
        deviceState.provisioning = {
          ...(deviceState.provisioning || {}),
          stage: 'failed',
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
        throw error;
      }
      if (deviceState.provisioned) {
        await refreshDeviceHistory(flow);
        deviceState.message = `${t('registered')}: ${deviceState.provisioned.registeredTxId}`;
      } else {
        deviceState.message = provisioningProgressText();
      }
    });
  });
  attachWorkflowRefreshButton('device-registration-refresh');
  attachWorkflowRefreshButton('device-capture-refresh');
  attachWorkflowRefreshButton('device-submit-refresh');
  attachWorkflowRefreshButton('device-history-refresh');
  document.querySelector('#device-policy')?.addEventListener('change', (event) => {
    deviceState.selectedPolicyId = event.target.value;
    localStorage.setItem(`vsp-selected-policy:${deviceState.projectId}`, deviceState.selectedPolicyId);
    refreshPolicyComponents();
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
      deviceState.submissionQueued = false;
      await refreshDeviceHistory(flow);
      deviceState.message = `${periodDate}: ${t('sampleCount')} ${deviceState.measurement.records.length} / ${t('outlierCount')} ${deviceState.measurement.outlierCount}`;
    });
  });
  document.querySelector('#device-submit')?.addEventListener('click', () => (
    deviceAction('device-submit', t('submitAction'), async (flow) => {
      await requestProofAndRecord(flow, deviceState.selectedDate);
    })
  ));
  attachDeviceHistoryActions();
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
  const currentAnomalyState = data.anomalyState;
  const currentAnomalyLabel = currentAnomalyState?.state === 'anomaly_open'
    ? t('anomalyStateOpen')
    : currentAnomalyState?.state === 'normal'
      ? t('anomalyStateNormal')
      : t('waiting');
  return `
    <div class="project-heading"><div><h2>${escapeHtml(localized(project.name, project.nameJa))}</h2>
      <p>${escapeHtml(t('adminIntro'))}</p></div><span class="network-label">${escapeHtml(t('adminBadge'))}</span></div>
    <div class="notice"><strong>[INFO]</strong><span>${escapeHtml(t('localOnly'))}</span></div>
    <section class="window"><div class="window-title">${escapeHtml(t('flow'))}</div><div class="window-body">${stepper(data.stepper)}<p class="step-help">${escapeHtml(t('anomalyStepHelp'))}</p></div></section>
    <section class="window section-gap current-device-state ${currentAnomalyState?.state === 'anomaly_open' ? 'current-device-state-anomaly' : ''}"><div class="window-title">${escapeHtml(t('currentAnomalyState'))}</div><div class="window-body"><strong>${escapeHtml(currentAnomalyLabel)}</strong>${currentAnomalyState ? `<span>${escapeHtml(t('anomalyStateChangedAt'))}: ${escapeHtml(dateTime(currentAnomalyState.changedAt))}</span>` : ''}</div></section>
    <section class="window section-gap"><div class="window-title">${escapeHtml(t('dailyHistory'))}</div><div class="window-body">
      <div class="daily-heading"><div class="daily-date-navigation"><button class="admin-day-nav" data-period-date="${escapeHtml(olderDate)}" ${olderDate ? '' : 'disabled'}>${escapeHtml(t('olderDay'))}</button><label>${escapeHtml(t('generationDate'))} <select id="admin-day-select">${dates.map((date) => `<option value="${escapeHtml(date)}" ${date === adminSelectedDate ? 'selected' : ''}>${escapeHtml(date)}</option>`).join('')}</select></label><button class="admin-day-nav" data-period-date="${escapeHtml(newerDate)}" ${newerDate ? '' : 'disabled'}>${escapeHtml(t('newerDay'))}</button></div><span>${dayAction}</span></div>
      ${hourlyChart(windows, policy)}
      ${table(
        [t('period'), t('count'), t('minimum'), t('maximum'), t('average'), t('commitment'), t('action')],
        windows.map((window) => `<tr class="${windowIsOutlier(window, policy) ? 'outlier' : ''}"><td class="nowrap">${escapeHtml(dateTime(window.periodStart))}<br>${escapeHtml(dateTime(window.periodEnd))}</td><td class="numeric">${escapeHtml(window.count)}</td><td class="numeric">${escapeHtml(window.minimum)} ${escapeHtml(window.unit)}</td><td class="numeric">${escapeHtml(window.maximum)} ${escapeHtml(window.unit)}</td><td class="numeric">${escapeHtml(window.average)} ${escapeHtml(window.unit)}</td><td class="hash">${escapeHtml(short(window.commitment))}</td><td>${dayAction}</td></tr>`),
      )}
    </div></section>
    <div class="page-grid wave-grid">
      <section class="window admin-anomalies"><div class="window-title danger">${escapeHtml(t('anomalies'))}</div><div class="window-body">${table(
        [t('occurred'), t('transition'), t('policy')],
        data.anomalies.slice(0, 20).map((event) => `<tr><td class="nowrap">${escapeHtml(dateTime(event.occurredAt))}</td><td>${status(event.transition)}</td><td>${escapeHtml(event.thresholdPolicyVersion)}</td></tr>`),
      )}</div></section>
    </div>
    <section class="window section-gap"><div class="window-title">${escapeHtml(t('jobs'))}</div><div class="window-body">${table(
      [t('job'), t('period'), t('sampleCount'), t('observedHours'), t('stoppedHours'), t('thresholdResult'), t('status'), t('proofGeneratedAt'), t('root'), t('tx'), t('action')],
      data.proofJobs.map((job) => `<tr><td class="hash">${escapeHtml(short(job.proofJobId, 24))}</td><td>${escapeHtml(job.periodDate)}</td><td class="numeric">${escapeHtml(job.sampleCount)}</td><td class="numeric">${escapeHtml(job.observedHourCount)}</td><td class="numeric">${escapeHtml(job.stoppedHourCount)}</td><td>${thresholdResult(job.thresholdSatisfied, job.observedHourCount)}</td><td>${status(job.status)}</td><td class="nowrap">${escapeHtml(dateTime(job.proofGeneratedAt))}</td><td class="hash">${escapeHtml(short(job.attestationCommitment))}</td><td class="hash">${escapeHtml(short(job.attestTxId))}</td><td><a class="button-link" href="#/verify/${encodeURIComponent(job.proofJobId)}">${escapeHtml(t('inspect'))}</a></td></tr>`),
    )}</div></section>
    <section class="window section-gap"><div class="window-title">${escapeHtml(t('devices'))}</div><div class="window-body">${table(
      [t('devices'), t('sensor'), t('policy'), t('registry'), t('lastSeen')],
      data.devices.map((device) => `<tr><td>${escapeHtml(localized(device.name, device.nameJa))}<br><small>${escapeHtml(device.id)}</small></td><td>${escapeHtml(device.sensorType)} / ${escapeHtml(device.unit)}</td><td>${escapeHtml(device.thresholdPolicyVersion)}</td><td>${status(device.midnightRegistryStatus)}<br><small>v${escapeHtml(device.midnightRegistrationVersion ?? '—')} / ${escapeHtml(short(device.midnightDeviceCommitment))}</small></td><td class="nowrap">${escapeHtml(dateTime(device.lastSeenAt))}</td></tr>`),
    )}</div></section>`;
}

function administratorAccessGate() {
  const walletConnected = Boolean(deviceState.wallet);
  const title = walletConnected ? t('adminDeviceRequiredTitle') : t('walletRequiredTitle');
  const body = walletConnected ? t('adminDeviceRequiredBody') : t('adminWalletRequiredBody');
  return `
    <div class="project-heading"><div><h2>${escapeHtml(t('admin'))}</h2>
      <p>${escapeHtml(t('adminIntro'))}</p></div><span class="network-label">${escapeHtml(t('adminBadge'))}</span></div>
    <section class="window wallet-gate" id="admin-access-gate" aria-labelledby="admin-access-gate-title">
      <div class="window-title" id="admin-access-gate-title">${escapeHtml(title)}</div>
      <div class="window-body wallet-gate-body"><div class="wallet-gate-icon" aria-hidden="true">${walletConnected ? 'D' : 'W'}</div>
        <div><p>${escapeHtml(body)}</p>${walletConnected
          ? `<a class="button-link next-action" id="admin-open-device" href="#/device">${escapeHtml(t('openDeviceWorkflow'))}</a>`
          : '<span class="network-label">MIDNIGHT / PREPROD</span>'}</div>
      </div>
    </section>`;
}

function attachAdminActions() {
  document.querySelectorAll('.admin-day-nav').forEach((button) => button.addEventListener('click', () => {
    const periodDate = button.dataset.periodDate || '';
    if (!periodDate || !adminData) return;
    adminSelectedDate = periodDate;
    main.innerHTML = adminView(adminData);
    attachAdminActions();
  }));
  document.querySelector('#admin-day-select')?.addEventListener('change', (event) => {
    adminSelectedDate = event.target.value;
    if (adminData) {
    main.innerHTML = adminView(adminData);
      attachAdminActions();
    }
  });
}

function check(ok, label) {
  return `<div class="check-row"><span class="check-code ${ok ? '' : 'waiting'}">${escapeHtml(t(ok ? 'checked' : 'waiting'))}</span><strong>${escapeHtml(label)}</strong></div>`;
}

function publicProofList(data, message = '', transactionHash = '') {
  return `<div class="project-heading"><div><h2>${escapeHtml(t('verifier'))}</h2><p>${escapeHtml(t('verifierIntro'))}</p></div><span class="network-label">${escapeHtml(t('publicView'))}</span></div>
    <section class="window verifier-form"><div class="window-title">${escapeHtml(t(Array.isArray(data?.proofs) ? 'latestProofs' : 'txProofViewer'))}</div><div class="window-body">
      <form id="transaction-hash-form">
        <label>${escapeHtml(t('txLookupLabel'))}<input id="transaction-hash-input" name="transactionHash" type="text" inputmode="text" autocomplete="off" spellcheck="false" minlength="64" maxlength="66" pattern="(?:0x)?[0-9a-fA-F]{64}" placeholder="${escapeHtml(t('txLookupPlaceholder'))}" value="${escapeHtml(transactionHash)}" required></label>
        <button type="submit">${escapeHtml(t('txLookupAction'))}</button>
      </form>
      <p id="transaction-hash-message" role="status" aria-live="polite">${message ? escapeHtml(message) : ''}</p>
      ${Array.isArray(data?.proofs) ? `<p>${escapeHtml(t('publicProofListIntro'))}</p>
      ${table(
        [t('period'), t('sampleCount'), t('observedHours'), t('stoppedHours'), t('thresholdResult'), t('policyBounds'), t('proofGeneratedAt'), t('status'), t('action')],
        data.proofs.map((proof) => `<tr><td><strong>${escapeHtml(proof.periodDate)}</strong><br><small class="hash">${escapeHtml(short(proof.proofJobId, 24))}</small></td><td class="numeric">${escapeHtml(proof.sampleCount)}</td><td class="numeric">${escapeHtml(proof.observedHourCount)}</td><td class="numeric">${escapeHtml(proof.stoppedHourCount)}</td><td>${thresholdResult(proof.thresholdResult, proof.observedHourCount)}</td><td>${escapeHtml(policyBounds(proof.policy))}</td><td class="nowrap">${escapeHtml(dateTime(proof.proofGeneratedAt))}</td><td>${status(proof.status)}</td><td><a class="button-link" href="#/verify/${encodeURIComponent(proof.proofJobId)}">${escapeHtml(t('viewDay'))}</a></td></tr>`),
        {
          state: 'ready',
          loadingTitle: t('loadingPublicProofs'),
          loadingDetail: t('loadingPublicProofsDetail'),
          emptyTitle: t('noPublicProofs'),
          emptyDetail: t('noPublicProofsDetail'),
        },
      )}` : ''}
    </div></section>`;
}

function attachPublicProofActions() {
  const form = document.querySelector('#transaction-hash-form');
  if (!form || form.dataset.attached === 'true') return;
  form.dataset.attached = 'true';
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('#transaction-hash-input');
    const message = document.querySelector('#transaction-hash-message');
    const submit = form.querySelector('button[type="submit"]');
    const transactionHash = String(input?.value || '').trim();
    if (!form.reportValidity()) return;
    if (message) message.textContent = t('txLookupSearching');
    if (submit) submit.disabled = true;
    try {
      location.hash = `#/verify-tx/${encodeURIComponent(transactionHash.replace(/^0x/iu, '').toLowerCase())}`;
    } catch {
      if (message) message.textContent = t('txLookupFailed');
      if (submit) submit.disabled = false;
    }
  });
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

function hourlyResultLabel(result) {
  if (result === 'within-threshold') return t('hourlyWithin');
  if (result === 'outside-threshold') return t('hourlyOutside');
  return t('hourlyNoData');
}

function hourlyResultView(data) {
  if (!Array.isArray(data.hourResults) || data.hourResults.length !== 24) {
    return `<section class="window full-width"><div class="window-title inactive">${escapeHtml(t('hourlyResults'))}</div><div class="window-body"><div class="notice"><strong>${escapeHtml(t('legacyHourlyResults'))}</strong></div></div></section>`;
  }
  const localDayStartHour = Number(data.operationalDay?.localDayStartHour) || 0;
  const offsetMinutes = Number(data.operationalDay?.timeZoneOffsetMinutes) || 0;
  const localHour = (total) => `${String(total % 24).padStart(2, '0')}:00${total >= 24 ? ' (+1)' : ''}`;
  const rows = data.hourResults.map((result, hour) => {
    const start = localHour(localDayStartHour + hour);
    const end = localHour(localDayStartHour + hour + 1);
    const safeResult = ['within-threshold', 'outside-threshold', 'no-data'].includes(result)
      ? result
      : 'no-data';
    return `<tr><td class="nowrap"><strong>${escapeHtml(start)}–${escapeHtml(end)}</strong></td><td><span class="hour-result ${escapeHtml(safeResult)}">${escapeHtml(hourlyResultLabel(safeResult))}</span></td></tr>`;
  }).join('');
  return `<section class="window full-width"><div class="window-title">${escapeHtml(t('hourlyResults'))}</div><div class="window-body">
    <p>${escapeHtml(t('hourlyResultsIntro'))} <strong>${escapeHtml(fixedOffsetLabel(offsetMinutes))} / ${escapeHtml(String(localDayStartHour).padStart(2, '0'))}:00–24h</strong></p>
    <div class="hourly-results-scroll"><table class="data-table hourly-results-table"><thead><tr><th>${escapeHtml(t('hourBand'))}</th><th>${escapeHtml(t('hourResult'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
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
      label: t(data.hourlyResultsAvailable === false ? 'legacyPipelinePolicy' : 'pipelinePolicy'),
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
  const chainRecorded = data.status === 'confirmed' && Boolean(data.transactions?.attest);
  const chainNotice = chainVerification.state === 'checking'
    ? `<div class="dashboard-sync-state syncing"><div><strong>${escapeHtml(t('chainCheckInProgress'))}</strong><span>${escapeHtml(t('chainCheckInProgressDetail'))}</span></div></div><div class="progress-shell dashboard-sync-progress" aria-hidden="true"><div class="progress-bar"></div></div>`
    : chainVerification.state === 'complete'
      ? `<div class="dashboard-sync-state complete"><div><strong>${escapeHtml(t('chainCheckComplete'))}</strong><span>${escapeHtml(t('chainCheckCompleteDetail'))}</span></div></div>`
      : chainVerification.state === 'failed'
        ? `<div class="dashboard-sync-state failed"><div><strong>${escapeHtml(t('chainCheckFailed'))}</strong><span>${escapeHtml(chainVerification.error)}</span></div></div>`
        : '';
  return `${publicProofList(list, '', data.transactions?.attest?.txHash || '')}
    ${chainNotice}
    <div class="page-grid section-gap">
      <section class="window"><div class="window-title ${chainRecorded ? 'success' : 'inactive'}">${escapeHtml(t('claim'))}</div><div class="window-body">
        <p class="claim-text">${escapeHtml(localized(data.claim, data.claimJa))}</p>
        ${!chainRecorded ? `<div class="notice"><strong>${escapeHtml(t('waiting'))}</strong><span>${escapeHtml(t('pendingClaim'))}</span></div>` : ''}
      </div></section>
      <section class="window"><div class="window-title">${escapeHtml(t('checks'))}</div><div class="window-body check-list">
        ${check(data.checks.dailyAttestationRecorded, t('dataset'))}${check(data.checks.committedHourlyExtrema, t('inclusion'))}
        ${check(data.checks.attestationVerified, t(data.hourlyResultsAvailable === false ? 'legacyThreshold' : 'threshold'))}${check(data.checks.midnightConfirmed, t('midnight'))}
      </div></section>
      <section class="window"><div class="window-title">${escapeHtml(t('publicData'))}</div><div class="window-body"><dl class="definition-grid">
        ${data.proofJobId ? `<dt>${escapeHtml(t('proofId'))}</dt><dd class="hash">${escapeHtml(data.proofJobId)}</dd>` : ''}<dt>${escapeHtml(t('measurementDate'))}</dt><dd>${escapeHtml(data.periodDate)}</dd>
        <dt>${escapeHtml(t('proofSubject'))}</dt><dd class="hash">${escapeHtml(data.deviceCommitment)}</dd>
        <dt>${escapeHtml(t('sampleCount'))}</dt><dd>${escapeHtml(data.sampleCount)}</dd><dt>${escapeHtml(t('observedHours'))}</dt><dd>${escapeHtml(data.observedHourCount)} / 24</dd>
        <dt>${escapeHtml(t('stoppedHours'))}</dt><dd>${escapeHtml(data.stoppedHourCount)} / 24</dd><dt>${escapeHtml(t('thresholdResult'))}</dt><dd>${thresholdResult(data.thresholdResult, data.observedHourCount)}</dd><dt>${escapeHtml(t('policyId'))}</dt><dd>${escapeHtml(data.thresholdPolicyVersion)}</dd>
        <dt>${escapeHtml(t('policyMode'))}</dt><dd>${escapeHtml(policyModeLabel(data.policy.mode))}</dd><dt>${escapeHtml(t('policyBounds'))}</dt><dd>${escapeHtml(policyBounds(data.policy))}</dd>
        <dt>${escapeHtml(t('policyVersion'))}</dt><dd>${escapeHtml(data.policy.version)}</dd><dt>${escapeHtml(t('policyScale'))}</dt><dd>${escapeHtml(data.policy.valueScale)}</dd>
        <dt>${escapeHtml(t('policyUnit'))}</dt><dd>${escapeHtml(data.policy.unit)}</dd><dt>${escapeHtml(t('sensor'))}</dt><dd>${escapeHtml(sensorTypeLabel(data.policy.sensorType))}</dd>
        <dt>${escapeHtml(t('policyValidFrom'))}</dt><dd>${data.assignmentValidFrom ? escapeHtml(utcDateTime(data.assignmentValidFrom)) : escapeHtml(t('noStartDate'))}</dd><dt>${escapeHtml(t('policyValidUntil'))}</dt><dd>${data.assignmentValidUntil ? escapeHtml(utcDateTime(data.assignmentValidUntil)) : escapeHtml(t('noExpiry'))}</dd>
        <dt>${escapeHtml(t('assignment'))}</dt><dd class="hash">${escapeHtml(data.assignmentKey)}</dd><dt>${escapeHtml(t('schemaVersion'))}</dt><dd>${escapeHtml(data.schemaVersion)}</dd>
        <dt>${escapeHtml(t('circuitVersion'))}</dt><dd>${escapeHtml(data.circuitVersion)}</dd><dt>${escapeHtml(t('root'))}</dt><dd class="hash">${escapeHtml(data.attestationCommitment)}</dd>
        <dt>${escapeHtml(t('status'))}</dt><dd>${status(data.status)}</dd>
        ${data.proofGeneratedAt ? `<dt>${escapeHtml(t('proofGeneratedAt'))}</dt><dd>${escapeHtml(utcDateTime(data.proofGeneratedAt))}</dd>` : ''}
        <dt>${escapeHtml(t('network'))}</dt><dd>${escapeHtml(data.network)}</dd><dt>${escapeHtml(t('contract'))}</dt><dd class="hash">${explorerLink('contract', data.contractAddress, data.network)}</dd>
        <dt>${escapeHtml(t('tx'))}</dt><dd class="hash">${escapeHtml(data.transactions.attest?.txId || '—')}</dd>
        <dt>${escapeHtml(t('txHash'))}</dt><dd class="hash">${explorerLink('transaction', data.transactions.attest?.txHash, data.network)}</dd>
        <dt>${escapeHtml(t('blockHeight'))}</dt><dd class="hash">${explorerLink('block', data.transactions.attest?.blockHeight, data.network)}</dd>
      </dl></div></section>
      <section class="window"><div class="window-title danger">${escapeHtml(t('privateData'))}</div><div class="window-body"><div class="privacy-box">
        ${escapeHtml(t('privateRawValues'))} ... ${escapeHtml(t('private'))}<br>${escapeHtml(t('privateHourlySummary'))} .... ${escapeHtml(t('private'))}<br>${escapeHtml(t('privateProofSecret'))} .... ${escapeHtml(t('private'))}<br>${escapeHtml(t('publicHourStatus'))} ....... ${escapeHtml(t('thresholdPublic'))}<br>${escapeHtml(t('publicThreshold'))} .... ${escapeHtml(t('thresholdPublic'))}
      </div></div></section>
      ${hourlyResultView(data)}
      ${publicProofPipeline(data)}
      ${redactedRawValues(data)}
    </div>`;
}

function route() {
  const parts = location.hash.replace(/^#\/?/u, '').split('/');
  if (parts[0] === 'verify') return { name: 'verify', id: parts[1] || '' };
  if (parts[0] === 'verify-tx') return { name: 'verify', id: '', txHash: parts[1] || '' };
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

function refreshDeviceMessageForLocale() {
  if (deviceState.submissionQueued) {
    deviceState.message = `${t('submissionQueued')} — ${processingStartText()}`;
    return;
  }
  if (deviceState.provisioning && !deviceState.provisioned && !deviceState.measurement) {
    deviceState.message = provisioningProgressText();
    return;
  }
  if (deviceState.busy) return;
  if (deviceState.transaction) {
    deviceState.message = `${t('confirmed')}: ${deviceState.transaction.transactionId}`;
  } else if (deviceState.proofJob) {
    deviceState.message = sponsorJobProgressText(deviceState.proofJob)
      || `${deviceState.proofJob.proofJobId}: ${statusText(deviceState.proofJob.status)}`;
  } else if (deviceState.measurement) {
    const periodDate = deviceState.selectedDate || deviceState.generationDate;
    deviceState.message = `${periodDate}: ${t('sampleCount')} ${deviceState.measurement.records.length} / ${t('outlierCount')} ${deviceState.measurement.outlierCount}`;
  } else if (deviceState.provisioned) {
    deviceState.message = t('registrationRestored');
  } else if (deviceState.device) {
    deviceState.message = t('identityRestored');
  } else if (deviceState.wallet) {
    deviceState.message = `${deviceState.wallet.walletName} / ${deviceState.wallet.networkId} / ${t('feeSponsoredLabel')}`;
  }
}

async function render({ showLoading = true } = {}) {
  const current = route();
  activate(current.name);
  if (showLoading) {
    const publicRoute = current.name === 'verify';
    main.innerHTML = `<section class="window"><div class="window-title">${escapeHtml(t('checking'))}</div><div class="window-body">${dataStateView('loading', publicRoute ? {
      loadingTitle: t('loadingPublicProofs'),
      loadingDetail: t('loadingPublicProofsDetail'),
    } : {})}</div></section>`;
  }
  try {
    if (current.name === 'device') {
      await loadDeviceModule();
      footerSource.textContent = `${t('source')}: Device / Cloudflare / Midnight`;
      renderDeviceScreen();
    } else if (current.name === 'admin') {
      if (!deviceState.wallet || !deviceState.provisioned) {
        footerSource.textContent = `${t('source')}: Device Session`;
        main.innerHTML = administratorAccessGate();
      } else {
        const flow = await loadDeviceModule();
        const data = await flow.loadAdministratorDashboard();
        adminData = data;
        footerSource.textContent = `${t('source')}: ${data.source}`;
        main.innerHTML = adminView(data);
        attachAdminActions();
      }
    } else if (current.txHash) {
      main.innerHTML = `<section class="window"><div class="window-title">${escapeHtml(t('checking'))}</div><div class="window-body">
        <div class="dashboard-sync-state syncing"><div><strong>${escapeHtml(t('chainCheckInProgress'))}</strong><span>${escapeHtml(t('chainCheckInProgressDetail'))}</span></div></div>
        <div class="progress-shell dashboard-sync-progress" aria-hidden="true"><div class="progress-bar"></div></div>
      </div></section>`;
      const list = {};
      const data = await loadPublicProofFromMidnight(current.txHash);
      footerSource.textContent = `${t('source')}: Midnight transaction / block / Contract state`;
      main.innerHTML = verifierView(list, data, { state: 'complete', error: '' });
    } else if (!current.id) {
      const list = await fetchJson('/api/v1/public/proofs?limit=100').catch(() => ({ proofs: [] }));
      footerSource.textContent = `${t('source')}: Midnight Indexer / optional public index`;
      main.innerHTML = publicProofList(list);
    } else {
      const [list, data] = await Promise.all([
        fetchJson('/api/v1/public/proofs?limit=100'),
        fetchJson(`/api/v1/public/proofs/${encodeURIComponent(current.id)}`),
      ]);
      footerSource.textContent = `${t('source')}: public API / Midnight Indexer`;
      if (
        data.status === 'confirmed'
        && data.transactions?.attest
        && data.schemaVersion === 7
        && data.circuitVersion === 5
        && Array.isArray(data.hourResults)
        && data.hourResults.length === 24
      ) {
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
        main.innerHTML = verifierView(
          list,
          pending,
          { state: 'checking', error: '' },
        );
        try {
          const verified = await verifyPublicProofOnMidnight(data);
          const complete = Object.values(verified.checks).every(Boolean);
          main.innerHTML = verifierView(
            list,
            { ...data, resultVerified: complete, checks: verified.checks },
            complete
              ? { state: 'complete', error: '' }
              : { state: 'failed', error: t('chainCheckFailed') },
          );
        } catch (error) {
          main.innerHTML = verifierView(
            list,
            pending,
            {
              state: 'failed',
              error: error instanceof Error ? error.message : String(error),
            },
          );
        }
      } else {
        main.innerHTML = verifierView(list, data);
      }
    }
    updateReloadControl();
    if (current.name === 'verify') attachPublicProofActions();
    if (showLoading) main.focus({ preventScroll: true });
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
  applyRuntimeScope();
  refreshDeviceMessageForLocale();
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
    const data = await fetchJson('/health');
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
walletConnectButton.addEventListener('click', () => {
  const loadedFlow = deviceModule?.browserDeviceFlow || null;
  const connectionPromise = loadedFlow?.connectWallet();
  void deviceAction('wallet-connect-button', t('walletConnect'), async (flow) => {
    deviceState.wallet = await (connectionPromise || flow.connectWallet());
    deviceState.projects = deviceState.wallet.projects;
    deviceState.maximumProjects = deviceState.wallet.maximumProjects;
    deviceState.projectId = deviceState.wallet.selectedProjectId;
    deviceState.configuration = deviceState.wallet.configuration;
    deviceState.deviceId = deviceState.wallet.deviceId;
    resetProjectDeviceState();
    const restored = await restoreActiveProject(flow);
    if (restored) {
      deviceState.deviceId = restored.device.deviceId;
      refreshDeviceMessageForLocale();
      return;
    }
    deviceState.message = `${deviceState.wallet.walletName} / ${deviceState.wallet.networkId} / ${t('feeSponsoredLabel')}`;
  }, loadedFlow);
});
reloadButton.addEventListener('click', () => {
  if (route().name !== 'device' || !deviceState.wallet || !deviceState.projectId) {
    void render();
    return;
  }
  void deviceAction('reload-button', t('refreshing'), async (flow) => {
    const selected = await flow.selectProject(deviceState.projectId);
    deviceState.configuration = selected.configuration;
    deviceState.deviceId = selected.deviceId;
    resetProjectDeviceState();
    await restoreActiveProject(flow);
    deviceState.message = t('syncComplete');
  });
});
window.addEventListener('hashchange', () => {
  if (normalizeRuntimeRoute()) void render();
});
if (demo) {
  const flow = await loadDeviceModule();
  deviceState.wallet = await flow.connectWallet();
  deviceState.projects = deviceState.wallet.projects;
  deviceState.projectId = deviceState.wallet.selectedProjectId;
  deviceState.deviceId = deviceState.wallet.deviceId;
  deviceState.configuration = deviceState.wallet.configuration;
  await restoreActiveProject(flow);
}
const routeReady = normalizeRuntimeRoute();
applyLanguage();
clock();
setInterval(clock, 1000);
health();
setInterval(health, 60_000);
setInterval(() => void refreshPendingDeviceRegistration(), 5_000);
setInterval(() => void refreshQueuedProofWorkflow(), 5_000);
if (routeReady) render();
