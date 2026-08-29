# BACCHIRI!━━Verifiable Measurement Layer — Wave 1仕様

[English](../../architecture/wave1_spec.md)

状態：実装基準
最終更新：2026-08-29 JST

本書をWave 1の製品・実装仕様の正本とします。過去の設計文書と矛盾する場合、本書を優先します。

## 1. 製品目的

Wave 1はEdge Deviceを認証し、コストを抑えた運用Summaryを保存し、時間別Sensor Extremaを公開せずに1日分のMidnight ZK Claimを記録します。

標準Planの要件：

- Device固有のECDSA P-256 Identityで認証する
- 通常APIでは長期鍵ではなく、失効可能な24時間Opaque Sessionを使う
- Device IdentityとDevice Contract Authority秘密値をEdge Deviceに置く
- 全Raw ReadingをCloudflareへ書かずLocal保持する
- 1時間Aggregateと即時Anomaly状態遷移を送る
- Proof処理を02:00～06:00 JSTの営業時間にAdmissionする
- 24、96、1,440件またはより高頻度のSampleを同じ固定24 Slot回路で扱う
- 運用開始前にMidnightへ登録した公開しきい値だけを使う
- 値がない時間は不正ではなくSTOPPEDとして扱う
- 日次AttestationごとにDeviceが1つのMidnight TXをProof／認可／Bindする
- 専用Sponsor WalletがBind済みTXへDUST Feeだけを追加して送信する
- Sensor管理者画面と第三者検証画面を分ける

連続Real-time値は標準Plan対象外です。将来Premium Planで最新値Streamまたは専用Proof Capacityを追加しても、Wave 1 Attestation Claimは変更しません。

## 2. 用語

| 用語 | 意味 |
| --- | --- |
| Raw Sample | Deviceに保持するTimestamp付きReading 1件です。 |
| Hourly Operational Window | 管理者運用向けにUploadするCount、Minimum、Maximum、Averageです。ZK Public Inputではありません。 |
| Daily Extrema Input | Observed／STOPPEDの24時間Slotを持つ固定形状Private Objectです。 |
| STOPPED | Readingがない時間です。AbsentかつCount／値がZeroの正規表現にします。Threshold失敗ではありません。 |
| Threshold Policy | Mode、Bound、数値Scale、Sensor Type／Unit、Versionを定義するImmutableなPublic Midnight Stateです。 |
| Threshold Result | Private Hourly ExtremaとAssignment済みLedger Policyから証明するPublic Boolean `thresholdSatisfied`です。`true`は全Observed Hourが範囲内、`false`は少なくとも1時間が範囲外です。 |
| Policy Assignment | Policy、登録済みDevice Commitment、有効期間を結び付けるImmutable Stateです。 |
| Attestation Commitment | Private Daily Extrema InputとNonceへのPublic Commitmentです。 |
| Device Identity | Cloudflare認証とSession更新だけに使うP-256鍵です。 |
| Device Session | Challenge署名後に発行する、失効可能な24時間Opaque API Tokenです。 |
| Device Contract Authority | Daily Attestation Callを認可する別系統のPrivate Compact Authorityです。 |
| Device Transaction Identity | DUSTを支払わず、Proof済みTXのCoin／Encryption Public Key導出とBindに使うEdge Device上の別系統の鍵素材です。 |
| Sponsor Wallet | 登録済みNIGHTを保持し、DUSTを同期し、Device Bind済みTXへDUST Feeだけを追加して送信する専用Backend Walletです。 |
| Operator Authority | Device LifecycleとPolicy／Assignmentを管理するOperator専用Compact Authorityです。 |
| Deployment Wallet | Contract Deploy／管理用の開発ホストWalletです。 |
| Proof Job | Admission、Proof進捗、Attestation TXを管理する冪等なD1 Workflow Recordです。 |

## 3. 正確なProof Claimと非Claim

![ゼロ知識証明で分かること、非公開の情報、証明しないこと](../assets/review/zk-claim-boundary-ja.png)

Confirmed Daily Attestationは、一緒に記録したPublic Resultを証明します。

- WITHIN（`thresholdSatisfied = true`）：観測された全時間の提出最小値／最大値が登録済みしきい値の範囲内
- OUTSIDE（`thresholdSatisfied = false`）：観測された少なくとも1時間で、提出最小値または最大値が登録済みしきい値の範囲外

Readingがない時間はSTOPPEDとしてThreshold計算から除外します。24時間すべてSTOPPEDの場合、GUIは`observedHourCount = 0`からSTOPPEDを表示し、数学的に真となるLedger Booleanを正常稼働日として表示しません。OUTSIDEはProof成功結果です。Private Data不整合またはPrivate Dataと一致しないClaim Resultは失敗し、何も記録しません。

証明しないこと：

- 物理Sensorの真実性、校正、設置品質、耐Tamper性
- STOPPED時間にDeviceが稼働すべきだったか
- 連続Sampling、Sampling間に逸脱がなかったこと
- 全Physical Observationを保持したこと
- 申告Sample Countと物理測定件数の一致
- Firmwareの集計、Clock、Filter、Debounceの正しさ
- Off-chain Raw Storageの完全性／真正性

GUI／営業資料でWITHINを「すべての物理Sensor値が正常だった」と強めてはいけません。また、OUTSIDEを発生させた実値は開示しません。

## 4. Trust、Privacy、Runtime境界

![エッジデバイス、画面、バックエンド、Midnightの責任分担](../assets/review/wave1-system-overview-ja.png)

Wave 1ではCloudflare WorkerとProof Server ContainerをTrusted Backendとします。通信はTLSで保護します。Application E2E暗号化、FHE、mTLS、TPM Remote Attestation、Secure Boot Attestationは将来対象です。

```text
開発ホスト
├ Compact ContractをCompile／Deploy
├ Device登録／Rotation／無効化とPublic Policy／Assignment登録
├ Cloudflare ResourceとDevice Identity公開鍵を管理
├ Operator AuthorityとDeployment Wallet秘密値を分離保持
└ 結合試験とCost Benchmark

Edge Device
├ Edge Agent：Sampling、Local集計、Hourly Window／Anomaly送信
├ Wallet Agent：Private Daily Extrema準備、Proof Job要求／Poll
├ Device Identity、Device Contract Authority、Transaction IdentityをLocal保持
├ Contract Proofに認証済みCloudflare Proof Serverを使用
└ NIGHT、DUST生成、DUST同期なしでProof済みTXをBind

審査用Browser Device
├ Device IdentityとPrivate Daily OpeningをBrowser Private Storageに保持
├ Contract回路Proofに認証済みCloudflare Proof Serverを使用
└ Laceで`payFees: false`を指定しTXを承認／Bind

Cloudflare
├ Worker：認証、認可、API、Admission、GUI
├ D1：Registry、Session Hash、Summary、Event、Policy Mirror、Job／TX状態
├ Queue／DLQ：Proof Admission参照とRetry
├ Proof Server Container：Proof生成
├ Sponsor Wallet Container：DUST同期、FeeだけのBalance、TX送信
└ R2：任意のPublic Artifact／Report。Raw Readingは恒久保存しない

Midnight
└ Public Policy、Assignment、Verified Daily Attestationの正本
```

Edge DeviceではCompact Compile、Contract Deploy、Wrangler、Proof Server Hostを行いません。Public
Dashboard／第三者検証RouteへDevice Session、Wallet Material、Raw値、Private Extrema、Nonce、Witness、
Private Stateを渡しません。審査用Browser DeviceはDevice Workflow実行中、自身のDevice Identity、Session、
Private OpeningだけをBrowser Private Storageへ保持し、Public Verification APIからは一切返しません。

Edge Wallet AgentはDevice Session Tokenと`X-Proof-Job-Id`を付与し、Compact Contract Proofを認証済み
Cloudflare Containerへ送ります。その後、Proof済みで値移動を含まないTXをDUSTなしでBindします。Laceも
`balanceUnsealedTransaction(..., { payFees: false })`によって同じ責務分離を行います。Sponsor境界を越える
前に、Serialized Finalized TransactionはDevice認可済みContract CallへすでにBindされています。

Sponsor WalletはAuthenticated Proof Jobに対して適格なTXを1件だけ受理します。Rate、Status、Contract、
Circuit、Size、Replay Policyを検査し、`balanceFinalizedTransaction`を
`tokenKindsToBalance: ['dust']`で実行し、自身が追加したBalance部分だけへ署名し、MergeをFinalizeして
送信します。Bind済みDevice Callを変更したり、Device Contract Authority Proofを生成したりはできません。

Serialized Transaction Policyはdeny-by-defaultです。設定済み
`sensor-registry.submitDailyAttestation` Entry Pointへの`ContractCall`を1件だけ含むIntent 1件だけを
許可します。Reward、Deploy、Maintenance Action、Shielded／Unshielded Value Transfer、追加Call、
Device側が含めたDUST ActionはBalance前に拒否します。公式Wallet SDKがSponsorのDUST Feeを追加した後も
同じPolicyを再検査します。Device Commitment、Assignment、Period、Public Result、Private Hourly
ExtremaへのCommitmentは、信頼されないSponsor Request MetadataではなくContract Proofで拘束します。

Sponsor Wallet Containerを呼ぶ前に、Workerは認証済み`deviceId`と`proofJobId`に対するJST日次の
Sponsorship枠をD1へ原子的に予約します。標準上限はDeviceごとにJST 1日5件です。Operatorが登録する
審査用Deviceは、審査員が一連の操作を繰り返せるよう20件に設定します。予約Tableでは`proofJobId`が
Uniqueなので、同じJobのRetryは既存予約を返し、回数を追加消費しません。上限後の新しいJobは次のJST
0時までHTTP 429を返します。`GET /api/v1/sponsor-quota`は認証済みDevice自身の上限、使用数、残数、
リセット時刻、予約済みJob IDだけを返し、GUIの表示とButton制御に使います。

Deviceは最初のSponsor Request前に、FeeなしSerialized Transactionの同一Bytesをowner-only mode `0600`で
原子的に保存します。Workerは上限予約後、SponsorのReady確認より先にProof JobをTransaction HashとByte
LengthへBindします。Sponsor同期中も受理済みJobは`awaiting_sponsor`に残り、DeviceはStatusをPollして
Integrity確認済みの同一Bytesを再利用し、再Proofしません。Device Process再起動時に`proof_ready`とLocal
Pending Artifactが共存する場合も同じ復旧経路を使います。Bind後の別Transactionは拒否します。

SponsorshipのHTTP Requestは同期Wallet呼出しではなく、受理境界です。認証済みWorkerは最初に受理した
Serialized TransactionのHashをProof JobへBindし、非公開BytesをR2へ保存し、Queueには`proofJobId`だけを
投入して`202 Accepted`を返します。同一Requestの再送はWorkerで止め、追加の上限予約、R2 Write、Queue投入、
Wallet処理を行わず現在のJobを返します。同じ測定群への別Transactionは`409`で拒否します。Sponsor Queue
ConsumerはWallet Ready後だけContainerを呼び、Container内のWallet Mutationは直列実行します。

| 経路 | Contract回路Proof | Device Bind／承認 | DUST Fee | TX Submit |
| --- | --- | --- | --- | --- |
| Edge Device | 認証済みCloudflare Proof Server Container | Edge Wallet Agent、Feeなし | Sponsor Wallet | Sponsor WalletからMidnightへ送信 |
| Laceを使う審査用Browser Device | 認証済みCloudflare Proof Server Container | Lace、`payFees: false` | Sponsor Wallet | Sponsor WalletからMidnightへ送信 |

Proof Server ContainerはProof生成だけを担当し、Midnight Wallet Keyを保持しません。別のSponsor Wallet
ContainerはSponsorship用の鍵素材だけを保持し、Device Identity、Device Contract Authority、Private
Extrema、Nonce、Compact Private Stateを受け取りません。Edge DeviceはLocal Proof Server、NIGHT入金、
DUST登録、DUST残高、DUST履歴Scan、DUST Proofを必要としません。このため運用開始時にDeviceごとのDUST生成
待ちはありません。ただし、ActiveなDevice登録／Assignment、公開運用設定、Proof Job Admission、最新
Contract State取得、Proof生成、Sponsor Capacityは必要です。

SponsorのCold Sync中は、開発環境の1分Health Cronを契機に最大5分間隔で暗号化Wallet CheckpointをR2へ
保存し、Ready後は30分間隔にします。認証済みSponsorship Retryも同じStale Checkを呼べますが、R2 Write
頻度は増えません。Signalによる停止前には、Containerが利用可能な最新StateをSerializeし、Sponsor Process
内で導出したKeyで暗号化して、非公開の`state.internal` Container-to-Worker経路から送ります。Workerは固定
Binary形式、申告Size、Boot ID、停止理由を検証してからR2へ保存します。SeedはObjectにもMetadataにも含め
ません。置換後のContainerはWallet初期化前にCheckpointから復元し、永続化済みの進捗を最初から再生しません。
Signal Handlerを実行できない停止では、直近の定期Checkpointを復旧点にします。

PreprodのSponsor初期化は、現行の公式Public Network向けWallet SDK Patternに従います。Shieldedと
Unshielded ProgressはStrict Completeを必須とします。未登録NIGHT Coinを登録する前にはUnshieldedと
DUSTもStrict Completeを必須とし、その後だけ登録Fee見積り、DUST生成待ち、登録TX送信へ進みます。
Checkpointから復元済みでNIGHT登録済みのWalletは、Spend可能なDUST Coinを確認できれば登録を繰り返さず
再開できます。Spend可能なDUSTが存在するまでQueue済みTransactionをBalance／Submitしません。Health出力には3 Walletの接続、
完了、Replay位置を含めます。

Sponsor Containerでは軽量Health SupervisorをPID 1、公式Wallet SDKを低Priorityの別Child Processとして
動かします。`/health`はCPU負荷の高いReplay Event Loopを待たず、最後に取得できたWallet Snapshotと鮮度を
返します。Stale、Degraded、終了済みChildの状態は診断専用で、Transaction Sponsorshipを許可しません。
これはProcess／Scheduler分離であり、物理Coreの固定予約ではありません。Proof生成とFee Sponsorshipは秘密、
Failure Mode、Scaling Lifecycleが異なるため、Proof Serverは別Containerのままとします。

Wave 1ではSession、Reading、Counter、Job用のApplication Durable Objectを使いません。Container Platform内部で必須となるDurable Object BindingはApplication Session Storeではありません。

## 5. 鍵の分離

![API認証、Midnight取引署名、証明生成、配備権限の分離](../assets/review/key-authority-separation-ja.png)

| 鍵 | 保管場所 | 権限 |
| --- | --- | --- |
| Device Identity | Edge Device | P-256 Cloudflare Challenge署名だけ |
| Device Contract Authority | Edge Device | `submitDailyAttestation`だけ |
| Device Transaction Identity | Edge Device | 値移動を含まないTXのPublic KeyとBindだけ。Fee権限なし |
| Sponsor Wallet | Sponsor Wallet Container | Proof Job Policy下のDUSTだけのBalanceと送信 |
| Operator Authority | 開発ホスト | Device LifecycleとPolicy／Assignment管理 |
| Deployment Wallet | 開発ホスト | Contract Deployと開発管理 |

開発ホストとDeviceで秘密鍵を共有しません。開発ホストはDevice Identity秘密鍵を持ちません。Sponsor Walletは
Device Transaction Identity、Operator Authority、Deployment Walletと分離します。1つのKey Domainの
Rotationで別Domainを暗黙にRotationしてはいけません。

DeployにDevice Sessionは使いません。Authenticated Wrangler操作がRandomな30分`contract_deploy` Operator Proof Leaseを作り、D1にはSHA-256 Hashだけを保存し、Container 1台のCapacity上限を共有し、終了直後にRevokeします。

## 6. Device登録と認証

Wave 1ではPublic Self-registration／Activation Code Endpointを設けません。認証済みOperator／Factory操作で登録します。

1. `installer.sh`は完全なInstalled Device Identityを保持し、存在しない場合だけP-256 Pairを生成する。Partial StateはFail Closeする
2. PKCS#8 Private KeyとLocal Session FileをInstalled Device Home以下へOwner-onlyで置く
3. Public Enrollment BundleへDevice／Project／Key ID、Algorithm、Public JWK、Scope、作成時刻を出す
4. OperatorがPublic Compact Device AuthorityをMidnight Fleet Registryへ登録し、Device-bound Assignmentを作る
5. Confirmed Midnight Public StateをD1へMirrorし、その後だけP-256 Public Keyを登録する
6. Active Key置換には明示Rotation確認を要求し、そのSessionをRevokeする
7. Challenge／Session Round TripでActivationを完了し、Deviceが現行Public運用設定をWorkerから取得して
   Atomicに導入する

完全な順序とFail Close動作は[`device_registry.md`](../security/device_registry.md)を正本とします。D1 Inventory／P-256登録だけではSessionもIngestionも許可しません。

将来TPMでは内部生成した鍵のPublic Keyだけを同じEnrollment境界からExportします。

`POST /auth/challenge`は32 byte Random Nonceを作りTTLを5分とします。D1にはSHA-256 Hash、Device／Key Binding、Expiry、One-time消費Stateを保存します。DeviceはEndpoint、Device／Key／Challenge ID、Nonce、Timestamp、Sorted Scopeを含むVersion付きCanonical MessageへECDSA P-256／SHA-256で署名します。WorkerのClock Skew許容は±5分です。

`POST /auth/session`は24時間Opaque Bearer Tokenを返し、D1にはSHA-256 Hashだけを保存します。RequestごとにExpiry、Revocation、Key Status、Device／Project、Scopeを検査します。通常API CallでSequenceや`lastUsedAt`を書かず、Costを抑えます。必要に応じDevice／IP／Session単位でRate Limitします。ProductionはHTTPS-only、開発LoopbackだけHTTPを許可します。

Scope：

```text
measurement:write  anomaly:write  proof:request  proof:read
proof:generate     transaction:submit  configuration:read  device:status
```

## 7. Sensor DataとAnomaly Lifecycle

Raw Samplingは数秒間隔でも構いません。標準PlanのRaw ReadingはLocal保持します。Edge Agentは1時間に1回、冪等なAggregateを送ります。

```text
batchId, deviceId, projectId, sensorType, unit,
periodStart, periodEnd, count, minimum, maximum, average,
commitment, thresholdPolicyVersion
```

WorkerはAuthenticated Device／Project、Sensor Metadata、Policy Version、有限かつ順序が正しい値、Period、Count、Commitment形式、Unique `batchId`を検証します。D1にはHourly Aggregateを保存し、Raw Sampleごとには書きません。

審査用Browser Deviceは完了済みの過去30日間からJST日付を選び、1分間隔のRaw値を1,440件生成します。生成Raw値とPrivate OpeningはそのBrowserのIndexedDBだけに保持し、Cloudへは最大24件のHourly Windowだけを送ります。当日と未来日は選択対象外なので、生成データは必ず完了した日次Claimになります。Threshold内Modeと外れ値ModeはどちらもZKP成功経路であり、それぞれHourly Extremaを開示せずPublic WITHIN／OUTSIDE Resultを生成します。

AnomalyはDebounce済みState Transitionとして即時送信します。

```text
NORMAL -> ANOMALY_OPEN
ANOMALY_OPEN -> RECOVERED
```

Edge AgentがHysteresis、Cooldown、Local Rate Capを適用します。D1にはAppend-only Event MetadataとCurrent Stateを保存します。このWeb2 Alert Policyは運用上有用ですが、Daily Proofで使うMidnight Policyの代わりにはなりません。

## 8. Public Threshold Policy Lifecycle

運用開始前にOperator Authorityが次を登録します。

```text
ThresholdPolicy {
  mode: closed-range | upper-bound | lower-bound
  minimumCentiOffset
  maximumCentiOffset
  valueScale
  sensorTypeCode
  unitCode
  version
}

PolicyAssignment {
  policyId
  deviceCommitment
  validFrom
  validUntil       // zeroは無期限
  version
}
```

Policy／AssignmentはImmutableで、変更には新IDを使います。回路がどのRangeを適用したか第三者が識別できるようThresholdは公開します。DeviceのProof Job RequestにはPolicy／Assignment Identifierだけを含め、Boundは含めません。回路がAuthenticated Contract Ledger StateからPolicyを読み、Private Commitment OpeningへBindingします。

D1はAdmission前検査とGUI用にConfirmed Policy／Assignment MetadataをMirrorします。Proofの正本はMidnightであり、D1だけを変更しても不一致Proofは成功しません。

各Assignmentは1つの登録済みDevice Commitmentだけに属します。1つのFleet Registry Contractで複数Deviceを扱います。期間付き再Assignmentにより将来のRental／工期管理へ回路変更なしで拡張できますが、自動Overlap Governanceは対象外です。

## 9. Daily Extrema回路

![測定値を24個の時間枠へ集約し、値を隠したまましきい値と照合する](../assets/review/hourly-extrema-zkp-ja.png)

Wallet AgentはReadingをJST Hour 0～23へ分類し、欠測時間を自動的にCanonical STOPPED Slotにします。稼働予定の事前登録は行いません。

Private `DailyExtremaInput`はMeasurement Group／Device／Policy／Assignment Binding、正確な24時間Period、24個の`{present, minimum, maximum, sampleCount}`、Schema Version、Circuit Versionを持ちます。1つのNonceでPublic Persistent CommitmentをOpenします。

`submitDailyAttestation`はActive Fleet Registry Entry、そのDevice Contract Authority、Assignmentに埋め込まれた同一Device Commitment、期間、Commitment Opening、Public／PrivateのMeasurement Group／Device／Policy／Assignment／Period／Presence／Version Binding、Canonical STOPPED値、Observed SlotのPositive CountとExtrema順序、再計算したTotal／Observed Countを検証します。全Observed Private SlotとAssignment済みLedger Policyから`allWithin`を計算し、Public `thresholdSatisfied`と一致することを証明します。Ledger Keyは`deviceCommitment + measurementGroupId`から導出し、同じGroup ID、虚偽Result、Malformed Slotを拒否します。

回路は常に24 Slotを見るため、1日24、96、1,440件またはさらに高頻度へ変えても回路／Proving Keyは変わりません。Report CountはBindingされますがDevice申告値です。

## 10. Proof Admissionと処理

Default Proof Server Admission時間は02:00～06:00 JSTです。時間外もIngestion／Anomaly Alertは継続します。

1. DeviceがJST日次をCloseし、Private 24 Slot Attestationを準備
2. Deterministic `proofJobId`を作りPublic Metadataだけを送信
3. WorkerがD1 Policy／Assignment Mirrorを検査し、`daily_proof_jobs`へ`pending`で1件保存
4. 営業時間内にCronがDue RowをConditional Claimし、Job参照をQueueへ送信
5. Queue Consumerが短い`ready_for_input` Leaseを付与しContainerをWarm Up
6. Wallet AgentがJobをPollし、Admit後にPrivate `/check`／`/prove` BodyをStream
7. DeviceまたはLaceがFeeを支払わずProof済みTXをBindして一度Upload。WorkerはPrivate R2へ保存し、D1を`awaiting_sponsor`にしてJob参照だけをQueueへ入れ、`202 Accepted`を返す
8. Workerが認証済みDeviceの日次Sponsorship枠を冪等にD1へ予約。同一Retryは既存状態を返し、同じGroup IDでMetadata／TXが異なればProof／Feeの再消費前に`409 Conflict`
9. Sponsor Wallet同期後、ConsumerがPrivate R2 ArtifactとHashを再検証し、DUSTだけを追加して直ちにTX送信
10. D1へTX ID／Hash、Block Height、Sponsorship Attempt、次回Retry、Error Code、Confirmationを保存しDeviceからPoll可能にする

DeviceがOfflineならLease Expiry後にBacklogへ戻します。06:00以降は新規AdmissionせずIn-flight処理は完了可能です。Queueはat-least-onceなのでStable ID、Unique制約、Conditional State ChangeでRetryを冪等化します。Queue MessageにPrivate Inputを入れません。

初期CapacityはContainer 1台です。Cloudflare QueuesをPriority Queueとして扱いません。将来Premium SLAはPremium／Standard Queueを分離し、Starvation防止付きReserved Capacityを設けます。Scale判断は実測Proof時間、Memory、Queue Age、Failure Rate、Active Container Costで行います。

Proof State：

```text
pending -> dispatched -> ready_for_input -> proving -> proof_ready
        -> awaiting_sponsor -> sponsoring -> sponsored -> submitted -> confirmed
Sponsor未Ready／一時失敗 -> awaiting_sponsor
Device TX失効／競合 -> reproof_required -> pending
terminal failure -> dead_lettered
```

監督下の結合試験だけ、Authenticated Wranglerで`--confirm-integration-test`を指定し、Named Pending Job 1件を時間外Admissionできます。Public／Device APIではありません。

## 11. Storage配分

| Store | Wave 1用途 |
| --- | --- |
| Midnight Ledger | Public Policy、Assignment、Verified Daily Attestationの正本 |
| D1 | Tenant／Project／Device Registry、Device Public Key、Challenge／Session Hash、Hourly Summary、Anomaly State、Policy Mirror、Daily Proof Job、冪等なJST日次Sponsorship予約、TX State |
| Queue／DLQ | Proof Admission／Sponsor処理のJob参照だけ。Private Input／TX Bytesなし |
| R2 | PrivateなIntegrity-addressed Device／Sponsored TX、任意のPublic Proof Artifact／Report、暗号化Sponsor Wallet同期Checkpoint |
| Device Filesystem | Raw Reading、Aggregation／Outbox、Private Extrema Opening、Device Key、Compact Private State、冪等Sponsorship完了まで保持するowner-only・Integrity確認済みFeeなしTransaction。DUST Stateなし |
| Sponsor Wallet Storage | Deploy Secret経由のSponsor Seedと、Ephemeral Container Disk外の暗号化Wallet同期Checkpoint |
| KV | Wave 1必須用途なし。任意の低頻度Cacheだけ |

`daily_proof_jobs`はDevice／Dayおよび`Device + measurementGroupId`でUniqueです。同一RequestのRetryはProof／Sponsorを再実行せず既存Jobを返し、同じGroup IDでMetadata／TX Hashが異なれば拒否します。Midnightも派生Attestation IDを独立に拒否します。Legacy TableはMigration専用で、新しいOperational Proof Writeは行いません。

## 12. GUI

Framework-free GUIをReview／撮影用にLocal Hostでき、Workerからも配信できます。

管理者Stepper：

1. Device登録／認証
2. Hourly Data受信
3. Anomaly State表示
4. Daily Proof Job要求／Admission
5. Proof生成とDevice TX署名
6. Midnight Attestation Confirmed

管理者画面はHourly Operational Minimum／Maximum／Average／Count、Anomaly Marker、Observed／STOPPED時間、Proof／TX状態を表示できます。Raw SampleやPrivate Daily Openingは表示しません。
時系列はJST日付ごとにまとめ、新しい日を初期表示し、その日の日次Proof操作を同じ画面に表示します。

第三者画面は証明済みWITHIN／OUTSIDE／STOPPED Result、正確なClaim、Public Policy Mode／Bound／Unit／Version、Assignment、Commitment、Observed／STOPPED Count、Network、Contract Address、Attestation TXを表示します。Hourly Extrema／Nonceは表示せず、物理的完全性を示唆しません。
最初に日次Proof Jobを新しい順で表示し、選択した日付を直接開きます。

第三者画面には、意図的に黒塗りした**元のセンサー値**欄を設け、**第三者には非公開／値を見せずに証明**と
明示します。この欄には測定値を一切入れません。元の値はデバイスの非公開保存領域に残し、公開APIが
返すのは使用した件数と、非公開の時間別最小・最大を照合するための暗号学的なデータの指紋だけです。
**ゼロ知識証明（ZKP）の確認ステップ**は、第三者が外部から確認できる5段階、すなわち非公開の時間別集計と
証明の照合、ZK証明の正しさ、判定結果と公開しきい値の照合、Midnightへの記録、第三者による確認完了だけを
可視化します。Witness、元の値、時間別最小・最大、Nonce、Proof Byte、Proof Server内部処理は可視化も返却もしません。

確定済み記録でも、ブラウザはD1のStatusだけを証明として扱いません。まずRedacted済みPublic Recordを表示し、
同じTransaction ID／Hash／Blockの成功をPublic Midnight Indexerへ問い合わせます。その正確なBlockのFleet
Registry LedgerをDecodeし、Attestation Commitment、Verified Flag、24時間のPresence／Count、判定結果、
Policy、DeviceにBindingされたAssignmentを独立に照合します。値が1つでも異なる場合やPublic Lookup失敗時は
4つのCheckを未完了のままにします。時間がかかる直接照合は、WalletやPrivate Inputを使わず、時間上限と
Indeterminate Progress Indicator付きで実行します。

公開値が存在する場合、コントラクトアドレス、トランザクションハッシュ、数値のブロック番号をネットワーク別の
Midnight Explorerへのリンクにします。ブラウザ上のデバイスはMidnightの取引データから確定トランザクションハッシュを
取得して記録し、今後の確定済み記録でもEdge Deviceと同じExplorerリンクを提供します。

Local Host時の管理者／第三者画面は、同期より先に現行のRedacted Local D1 Snapshotを表示します。最初の
Data View表示時だけBackground同期を1回開始し、**再読込**で明示的に再試行します。同期中も現在のSnapshotを
消さず、Indeterminate Progress Indicatorで処理中／成功／失敗を示すため、遅い同期をGUI Freezeと誤認させません。
同じPage Session内のRoute変更ではImplicit同期を繰り返しません。

Cryptographically Validated Cloudflare Accessを設定するまで管理者EndpointはLoopback限定です。第三者Proof EndpointはPublicかつRedactedです。

## 13. CostとScalability

標準PlanのCloud Writeは概ねSensor Streamあたり1時間Aggregate 1件、Anomaly状態遷移、Daily Proof Job Lifecycle 1件、Daily Attestation TX 1件です。Local Sampling頻度を上げてもRaw SampleごとのD1 Writeや回路Size増加は発生しません。D1 Sessionは常時接続Durable Objectを避け、RequestごとにWriteしません。

CostはMAUに対して指数関数ではなく、Active Device数とProof頻度に概ね線形に増える構造とします。主要変数はProof／Container処理です。Overnight Backlogと明示Capacity上限により、DeviceからのBurstが無制限のCold Startを起こさないようにします。

Cost実測は標準運用Profileだけを記録します。1分ごとのRaw Sample 1,440件をDevice内で24時間分のPrivateな最小値／最大値Slotへ集約し、Proof Server Request 1回とMidnight Attestation TX 1回を実行します。24件／96件は固定回路で同じ処理になることを確認する同値性Testだけとし、個別のCost／価格行は作りません。標準Profileで次を記録します。

- Local Aggregation時間とPrivate State Size
- Compact Compile時間と最大RSS
- Prover／Verifier Key SizeとRequest Size
- Proof Server Cold／Warm時間、CPU、Memory
- Device Bind済みTXとSponsor Final TXのSize、Sponsorship時間、Confirmation時間、DUST Fee
- Worker、D1、Queue、R2、Container Usage
- Active Device 10,000台を含むFleet月額Model

各実測へTimestamp、Host／Device Model、OS、Software／Toolchain Version、Network、Sample Profile、Command、Wall Time、CPU、Memory、Artifact Size、Failure／Retry Noteを記録します。

## 14. Version、Deploy、Acceptance

現行Compatibility Pair：

```text
Compact toolchain 0.31.1
Compact language  0.23
daily schema      5
circuit           3
contract schema   3
D1 migrations     0017_release_stale_sponsor_reservations.sqlまで
```

旧Selected-Merkle-leaf／Singleton／WITHIN専用Fleet Registry Ledgerとは互換性がありません。採用には新Fleet Registry Deploy、
運用前のOperator限定Device／Policy／Device-bound Assignment TX、管理TX Evidence付きD1 Migration／Mirror
Sync、D1 Migration `0017`までの適用、Public Contract Address更新が必要です。旧固定24／96／1,440件`daily-attestation` Profileは開発専用Benchmarkです。

Wave 1 Acceptance：

- Installer生成Device Identityの登録と24時間Session認証が成功
- Hourly Aggregate Uploadと即時Anomaly Transitionを管理者が閲覧可能
- 1つの回路が24、96、1,440 Raw Sample由来Summaryを受理
- STOPPED時間は成功し、正しいWITHIN／OUTSIDE Resultを記録し、Malformed STOPPED／Observed Slotは失敗
- 範囲外DataをWITHIN、範囲内DataをOUTSIDEとClaimすると失敗
- Deviceが別Threshold Boundを指定できない
- Policy、Assignment、Device、Period、Presence、Count、Commitment改ざんが失敗
- Device認可済み・Sponsor Fee負担のWITHIN／OUTSIDE Preprod Attestation TXがConfirmedとなり第三者画面へ表示
- 第三者画面がPolicy／Statusを公開し、Hourly Extrema／Nonceを公開しない
- Cost／Version実測記録をBenchmark文書へ追加

将来対象はTPM／Secure Element、Remote Attestation、複数Sponsor WalletへのSharding、Premium Real-time値、Premium Proof Queue、Multi-tenant Assignment Governance、Remote管理者Accessです。
