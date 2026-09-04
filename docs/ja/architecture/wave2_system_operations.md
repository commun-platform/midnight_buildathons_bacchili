# Wave 2 システム運用ダッシュボード

[English](../../architecture/wave2_system_operations.md)

## 1. 目的

システム運用ダッシュボードは、認可された運用・サポート担当者が配備ツールを開かず、次の3点を確認するための読み取り専用画面です。

1. Sponsor Walletは同期済みで、現在DUSTを支払えるか。
2. Device登録、Proof、Sponsor TXの要求がどこで待機・失敗しているか。
3. どの仮名化Wallet／Deviceが顧客UCを開始し、どのRequest、Job、結果が同じ操作に属するか。

画面は公開GUIと分離した保護Routeに置きます。Cloudflare Accessが画面とAPIの実行前に担当者を認証し、Workerも検証済みAccess Contextがなければ拒否します。

## 2. 情報モデル

### 2.1 Sponsor Walletのライブ状態

ContainerのHealth Contractから次を表示します。

- 起動中、同期中、入金待ち、DUST登録中、準備完了、エラーのPhase
- Supervisor状態、Wallet Processの生存、Healthの鮮度、連続Probe失敗、最終成功時刻
- Shielded、Unshielded、DUSTごとの`applied`、`highest`、Block差分、接続、完了
- specksから換算した実DUST残高（`1 DUST = 10^15 specks`）、Workerに記録された直近の
  Sponsored TX手数料、両者から算出する推定残り送信回数
- 診断用の使用可能・保留・全DUST UTXO数。UTXO数はDUST残高ではない
- 初期化時刻、最終状態時刻、現在のBoot ID
- 暗号化R2 CheckpointのSize、更新時刻、保存元、Phase、保存済みBlock進捗

画面は30秒ごとにLive状態を更新します。D1へは状態が変化した時、または正常状態の1時間ごとのHeartbeatだけを保存し、毎分Writeを発生させません。

### 2.2 処理状態

Application Workflowの正本はD1です。次の現在件数と最古の待機時間を状態別に表示します。

- Proof Job
- Sponsor TX Job
- Device登録Operation
- しきい値Policy登録Operation

Proof Serverの表示は、現在のProof Job Lifecycleと最終Proof成功時刻から判定します。管理画面を開いただけでは、停止中のProof Server Containerを起動しません。

実行中のSponsor TX Jobは、永続化した`sponsorStage`、`sponsorReasonCode`、
`sponsorStageUpdatedAt`、経過時間、試行回数、Lease、次回再試行時刻も表示します。時間のかかる
処理は開始前に段階をD1へ書き込むため、Wallet確認、同期／入金待ち、Checkpoint保存、
DUST付与と手数料用ZK証明、Midnight送信、確定待ち、自動再試行、Queue実行中断を区別できます。
ページ再読み込み後もD1から同じ理由を復元します。Browserは状態の閲覧者であり、再試行の実行主体ではありません。

ContainerからR2へのCheckpoint Stream全体は60秒、Sponsor TX準備は10分、送信は5分で打ち切ります。
Queue Consumerの15分上限より前に具体的な失敗理由を保存するためです。Scheduled処理は15分経過で中断を
表示し、16分経過後にSponsor成果物が一切ないJobだけを再試行します。成果物があるJobはこの経路で回収しません。
また、DUST未使用のWallet確認・Checkpoint段階には2分のWatchdogを設けます。Container RPCがRequestの中断を受け付けない場合でも、この段階なら安全に自動回収できます。
TX処理では、Walletが独立してUploadした最新の暗号化R2 Checkpointを、R2 Requestを行わずDUST予約前の復旧基準として固定します。
同期的なContainer Checkpoint再取得や、複数MiBのR2 Objectコピーは行いません。再試行可能または処理中のSponsor予約がある間は、定期処理・周期Upload・正常終了時UploadによるCheckpoint更新を止めます。送信完了または明示的な予約解放後に更新を再開します。これにより、DUST予約前の再開地点を保持したまま、QueueのTX経路からCheckpoint I/Oを除外します。

### 2.3 日次集計

D1の事実データから、過去7～90日をUTC日別に集計します。初期表示は30日です。

- Midnightへ登録されたDevice数
- 受付済みProof Job数
- ZKP生成完了数
- Sponsor TX送信数
- 失敗／Dead LetterとなったProof Job数
- 受付済み1時間集計窓数
- 集計窓が表すSensor Sample数

処理が0件の日も明示し、欠測と0件を混同しないグラフにします。

### 2.4 顧客UCのAPI証跡

状態を変更する顧客UCのAPI Requestには、Workerが`requestId`を発行します。Browserはユーザー操作開始時に`clientOperationId`を1つ発行し、その操作から呼ぶ全APIへ付けます。例えば、1回のPolicy登録ではChallengeと登録要求を、1日分の自動生成では24個の集計窓と異常遷移を同じIDで追跡できます。

監査イベントへ保存する項目は次だけです。

- 時刻、Method、正規化Route、HTTP Status、結果、処理時間
- `requestId`と検証済み`clientOperationId`
- Actor種別と安定識別子：Wallet公開鍵のSHA-256、Device ID、匿名／System
- 認証状態またはRouteから得られるProject、Device、Proof Job、Operation ID
- 必要な場合だけ、長さを制限したError Code

Authorization Header、Session Token、署名、Request／Response Body、Raw値、Private Opening、秘密鍵、Wallet Address、Sponsor Secretは監査Tableへ複製しません。読み取り専用Pollは対象外とし、認証失敗と状態変更要求は追跡対象にします。

## 3. 画面

### 3.1 概要

Headerに環境、生成時刻、自動更新状態、認証済み担当者を表示します。4つのSummary Cardで、総合状態、Sponsor Wallet Phase、待機処理、直近24時間の失敗を示します。Live Dataが更新予定を超えた場合は、正常表示ではなくStale警告に変えます。

### 3.2 Wallet同期

Shielded、Unshielded、DUSTの3本のProgress Rowに、`applied / highest`、差分、接続、完了を表示します。その下に初期化、Supervisor、残高、R2 Checkpointをまとめ、直近のHealth変化を新しい順で表示します。

### 3.3 処理状況と日次件数

Workflow Cardで状態別件数と最古の待機時間を表示します。日次GraphではDevice登録、Proof受付、ZKP完了、Sponsor TX送信、失敗をSeriesで分けます。補助Tableには値を開示せず、集計窓数とSample数だけを表示します。

### 3.4 監査ログ

新しい順に表示し、Actor識別子、Category、Action、結果、Project、Deviceで絞り込みます。各行に時刻、Actor、Action、対象、結果、HTTP Status、相関IDを表示します。詳細Panelから、カスタマー対応に必要な安全な完全識別子を確認できます。

読込中、更新中、データなし、Stale、権限なし、失敗を別の表示にします。更新中も最後に成功したSnapshotは消しません。

## 4. 保存と保持期間

Migration `0023_system_operations.sql`で次の5種類を管理します。

- `operational_events`：RedactedされたAPI、非同期Workflow、Health Event
- `system_health_snapshots`：状態変化と1時間ごとのHeartbeat
- `system_component_state`：重複保存を防ぐ最新分類状態
- `operations_alert_state`：Alertごとの未解決／解決済み状態
- `operations_notification_outbox`：冪等なDiscord配送JobとSponsor利用Receipt

Migration `0024_sponsor_processing_progress.sql`は、Sponsorの処理段階、理由、段階更新時刻を
`daily_proof_jobs`に追加します。これにより、Worker中断やDeploy後も原因を追跡できます。

Event、Health Snapshot、配送完了済み通知のオンライン保持期間は90日です。削除処理は既存のScheduled Workerから実行し、顧客Requestを待たせません。低Level診断は構造化Workers Logs、カスタマー対応用の安定した証跡はD1という役割分担です。

## 5. アラートとDiscord通知

通知判定に使うしきい値を先に管理画面へ表示します。Scheduled Workerは次を評価し、重複通知を防ぎます。

- Sponsor Walletを取得できない
- Block Lagが設定値以上、または未完了Channelが切断した状態（`0/0`停止を含む）で、適用済み同期進捗がWallet通知保護期間を通して変化していない
- 実DUST残高を直近の完了済みSponsored TX手数料で割った推定残り送信回数がしきい値以下になった
- ProofまたはSponsor待ちが件数と待機時間の両方のしきい値を超えた
- 直近5分のProof API Rate Limit応答がしきい値を超えた

初期配備では次を採用し、コード変更なしで設定値を調整できます。

| 監視対象 | 初期しきい値 |
|---|---:|
| 推定残りSponsored TX | 1件以下 |
| Wallet同期 | 250 Block以上のLagまたは未完了Channel切断 |
| Wallet系通知保護 | 5分間連続 |
| Proof滞留 | 8 Job以上かつ最古待機10分以上 |
| Sponsor滞留 | 16 Job以上かつ最古待機10分以上 |
| Proof HTTP 429 | 5分間に5回 |
| 未解決Alertの再通知 | 60分 |

間欠起動したWalletの`starting`と進捗中の`syncing`は正常状態であり、Discord Incidentを作りません。未同期かつ適用済み同期進捗が5分間変化しない場合だけ、同期停滞AlertをOpenします。DUST残量はWalletが`ready`または`waiting-for-funding`へ到達してから評価するため、起動途中の未確定残高は低DUST通知になりません。Healthをまったく取得できない状態と実際の低DUSTには5分間の通知保護を維持します。通知保護期間内に復旧した場合はOpen通知もResolved通知も発行しません。その他のAlertは即時通知です。通知済みの異常は、継続中に間隔を制限したReminder、復旧時にResolved通知を発行します。Workerは通知予定をD1 Outboxへ先に記録し、復旧時には未配送のOpen／Reminderを無効化します。このため、復旧後に古い異常通知が届きません。顧客Requestを待たせず、失敗時はBackoff付きで再送し、配送中にWorkerが中断した場合は10分後に配送Leaseを回収します。

Discord通知は日本語で配信し、冒頭に管理者判断として`対応不要`、`要監視`、`対応必要`のいずれかを表示します。各通知には原因、推奨対応、該当するCloudflare Containers、Queues、Observability画面への直接リンクを含めます。復旧通知は`対応不要`です。

Proof Jobが初めて`submitted`または`confirmed`になった時は、Sponsor Wallet利用Receiptを1件だけ発行します。Discord Embedには、取得可能な場合の仮名Wallet Fingerprint、Project、Device、対象日、Proof Job、Transaction HashとBlock、実DUST手数料、配送時点のWallet Phase、同期Lag、実DUST残高、推定残り送信回数を含めます。有効なPreprod Transaction HashはMidnight Explorerへ直接リンクします。Wallet Address、Authorization、署名済みTransaction Byte、Private測定値、秘密値は含めません。

`DISCORD_WEBHOOK_URL`は、設定CommandだけがGit管理外のRoot `.env`から読み、Cloudflare Worker Secretとして登録します。

```bash
cp .env.example .env
# .envへDISCORD_WEBHOOK_URLを設定する。
npm run cloudflare:config:discord
```

URLはHTTPSのDiscord Webhook形式を検証し、Consoleへ表示せず、D1や`wrangler.jsonc`へ保存せず、管理APIからも返しません。管理APIが返すのは設定済みかどうかとOutboxの状態別件数だけです。

既存の自動復旧も維持します。Scheduled WarmupによるWallet State復元、SupervisorによるProcess再起動、期限切れSponsor Jobの回収、Queue Retryを行います。通知保護期間を超えたIncidentは、自動復旧した場合もOpenとResolvedをDiscordへ報告します。

## 6. API

```text
GET /system-operations/                         Access保護された管理画面
GET /api/v1/system-operations/overview          Live HealthとWorkflow件数
GET /api/v1/system-operations/metrics?days=30   7～90日の日次集計
GET /api/v1/system-operations/events             Redacted監査イベント
GET /api/v1/proof-jobs/:proofJobId                Device認証済みJob状態とSponsor待機理由
```

全Responseは`Cache-Control: no-store`とRequest IDを持ちます。管理APIは読み取り専用です。

カスタマーサポート自動化は、別Workerである`midnight-support-mcp`から、この運用状態のRedact済みSubset
だけを参照します。このWorkerはHost全体をAccessで保護し、公開Proof Gateway配下には配置しません。
詳細は[MCPのセキュリティ境界](mcp_security_boundary.md)を参照してください。

### 6.1 Cloudflare Access配備条件

Workerは、対応するAccess ApplicationがRequestを認証するまで、意図的に`403`を返します。配備先HostnameにSelf-hosted Access Applicationを作成し、次の2 Pathを保護します。

```text
/system-operations/*
/api/v1/system-operations/*
```

認可する運用担当者またはIdP Groupだけを明示したAllow Policyを割り当てます。審査員向け検証画面と公開検証APIを利用可能なままにするため、Worker全体は保護しません。この外部Policyの作成には`Access: Apps and Policies Write`権限が必要で、通常のWrangler Worker配備Tokenには含まれません。有効化後に、許可Identity、拒否Identity、未認証APIの3ケースを確認します。

## 7. 完了条件

- Cloudflare Access Contextがなければ、画面と管理APIの両方が`403`になる。
- Sponsor WalletのBlock進捗、Supervisor鮮度、残高、R2 Checkpointを確認できる。
- Proof Serverを起動せず、Queue-backed Workflowの件数と最古待機を確認できる。
- Device、Proof、ZKP、Sponsor TX、失敗、集計窓、Sampleの日次件数を期間指定で表示できる。
- Wallet Fingerprint、Device ID、`requestId`、`clientOperationId`から状態変更UCを検索できる。
- Alertしきい値、未解決Incident、Discord設定状態、Outbox配送状態を通知開始前から確認できる。
- Queueが重複配送されても、Proof JobごとのSponsor Wallet利用Receiptは1件だけになる。
- Wallet同期、DUST残量、処理滞留、Proof API過多のAlertを再送・重複排除し、復旧時も通知する。
- 監査RecordにAuthorization、署名、Raw値、Request Bodyが入らないことをTestで保証する。
