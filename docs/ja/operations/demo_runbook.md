# Wave 1 Deploy・Review Runbook

[English](../../operations/demo_runbook.md)

![準備、登録、収集、証明生成、デバイス署名、公開結果確認までの6段階](../assets/guides/judge-review-path-ja.png)

## 1. 開発ホスト

```bash
npm ci
npm run verify
cp .env.development.example .env.development
npm run development:wallet
npm run development:funding
npm run sponsor:wallet
npm run cloudflare:deploy
npm run cloudflare:config:network
npm run cloudflare:config:sponsor
./package_archive.sh
```

`.env.development`とOwner-only Sponsor Credential Fileは分離して安全にBackupします。運用開始前に
`sponsor:wallet`が表示したSponsor AddressだけへtNIGHTを送ります。Cloudflare DeployはWorker、D1 Migration
`0017`まで、Queue／DLQ、GUI、Proof Server Container、Sponsor Wallet Container、暗号化Sponsor Checkpoint用
R2 Bindingを作成します。`cloudflare:config:sponsor`はSeedを標準入力でWranglerへ渡し、表示しません。

## 2. Edge Device導入・登録

展開した運用Archiveの`.env.device`を設定します。廃止済みPer-reading EndpointではなくWorker Service Base URLを指定します。

```bash
sha256sum -c midnight-sensor-device-fw-<version>.tar.gz.sha256
tar -xzf midnight-sensor-device-fw-<version>.tar.gz
cd midnight-sensor-device-fw-<version>
cp .env.device.example .env.device
chmod 600 .env.device
# Worker／Proof URL、Device／Project ID、Sensor設定を記入
# DEVICE_CONTRACT_ADDRESSは空のままとし、認証済みDeviceが後から取得する
./installer.sh --no-start --ingest-url https://<worker>.workers.dev/api/v1/
```

InstallerはIdentity Fileがすべてない場合だけP-256 Device Identityを生成し、完全な既存Identityは保持し、一部だけ存在する場合は停止します。公開Enrollmentを確認します。

```bash
cd ~/.midnight/midnight-cloudflare-demo/current
npm run device:auth:show
```

`device-auth/enrollment.json`だけを開発ホストの保護された一時Pathへ転送します。`device-private-key.pk8`は転送しません。次のMidnight Device登録がD1へMirrorされるまでPendingとして保持します。Edge Device上で独立したCompact Contract Authorityを生成し、公開Enrollmentだけを表示します。

```bash
npm run device:authority:generate -- --network preprod \
  --confirm-contract-authority-generation
npm run device:authority:show -- --network preprod
```

公開`device-wallet/preprod/contract-authority/enrollment.json`の値だけをDevelopment Operatorへ渡します。`authority.json`は転送しません。別のDevelopment WalletとProcess内だけの30分Operator Proof LeaseでDeployします。このCommandはOwner-only Operator Authorityを作成し、Fleet RegistryをDeployし、初期Device、Public Policy、Device-bound AssignmentをMidnightへ登録してPublic StateをD1へMirrorします。

```bash
npm run development:deploy:cloudflare -- \
  --device-authority <public-32-byte-hex> \
  --policy-id temperature-v1 \
  --assignment-id edge-temp-001-temperature-v1-wave1 \
  --policy-mode closed-range --min 10 --max 35
npm run cloudflare:config:contract
```

Confirmed Midnight Mirrorが存在してからPending P-256 API Identityを有効化します。`--confirm-replace`は承認済みP-256 Rotationだけに使います。

```bash
npm run cloudflare:device:register -- --enrollment /secure/temp/enrollment.json
```

追加DeviceのLifecycle Commandと必須E2E Gateは[`device_registry.md`](../security/device_registry.md)を参照します。

`.state/development/deployment-preprod.json`へ記録された新AddressをWorker設定時に入力します。
Edge Deviceでは認証済みWorkerからAddressとそれに紐づくPolicy／Assignmentを取得し、その後Collectorを起動します。
`device:wallet`は任意のTransaction Identity確認であり、Chain接続、入金、DUST同期を行いません。

```bash
npm run device:configure
sudo systemctl start measurement-edge-agent
npm run device:wallet
curl http://127.0.0.1:8788/health
```

説明時は`SENSOR_MODE=synthetic`を設定できます。本番Defaultは`hardware`です。疑似値はDeviceから発生し、通常と同じ1時間集計／Anomaly経路を通ります。CloudflareへRaw Time-seriesは送りません。

Deviceには入金しません。専用Sponsor Walletは24時間同期します。ContainerはActivity Timeout時に停止せず期限を更新し、開発環境では1分間隔のCron TriggerがHealth確認とCrash／Rollout後の復旧を担います。同期進捗を取得できた後、Workerは同期中は最大5分に1回、Ready後は最大30分に1回、暗号化R2 Checkpointを保存します。`SIGTERM`または`SIGINT`を受けると、Containerは最新Stateを暗号化して非公開のContainer-to-Worker経路からR2へ退避してからWallet SDKを停止します。置換後のContainerはWallet初期化前に限りR2から復元します。NIGHT／DUSTは中央で管理します。02:00～06:00 JSTの時間帯はProof JobのAdmissionだけを制御し、Sponsor Walletの同期時間は制限しません。Sponsorは適格なDevice Bind済みTXへFeeだけを追加して送信します。Device Identity／Contract Authority SecretはSponsorへ送りません。

## 3. Proof Job・Midnight TX

Operatorが実Dataの`PreparedDailyExtremaAttestation`またはLocal `SensorRecord[]`を指定します。

```bash
npm run device:submit -- --input /secure/path/to/real-records.json \
  --period-date 2026-08-28 \
  --policy temperature-v1 \
  --assignment edge-temp-001-temperature-v1-wave1
```

DeterministicなD1 Proof Jobを作成してPollします。Default Admission Windowは02:00～06:00 JSTです。Admit後、Job ID付きでCloudflare Proof Serverへ接続し、PiでFeeなしTXをBindして認証済みSponsor Endpointへ送ります。SponsorがDUSTを追加してMidnightへSubmitし、Device TXとSponsored TXのEvidenceをD1へ保存します。Sponsor Policy境界を通れないLoopback-only Device Submitは拒否します。

監督下の結合試験に限り、認証済み開発Operatorは営業時間外にPending Jobを1件だけJob ID指定でAdmissionできます。Device APIではなく、明示的な確認Flagが必須です。Container 1台のCapacity Checkと2時間のPrivate Input Leaseは通常経路と同じです。本番運用ではScheduled Queue経路を使用します。

```bash
npm run development:admit-proof-job -- \
  --job-id <proofJobId> \
  --confirm-integration-test
```

コントラクトは公開判定を証明します。範囲内は、観測された全時間について提出した最小値・最大値が登録済みしきい値以内であること、範囲外は少なくとも1時間がしきい値外であることを意味します。対象日、観測時間、件数、版番号、登録済みしきい値、判定結果、取引証拠は公開します。欠測時間は公開の停止状態として扱います。時間別の最小値・最大値は開示しません。物理測定値の正しさ、測定の完全性、集計処理の正しさは証明しません。

標準UCのCost結合試験では、完了日について1分ごとの1,440値を生成します。DeviceはProof前に
24時間分のPrivateな時間別Extrema Slotへ集約します。

```bash
npm run device:benchmark -- --samples 1440 --period-date YYYY-MM-DD --run-id cost-1440-a --confirm-synthetic
```

## 4. Local Review GUI

Loopback Provisioning BridgeとWorker-hosted GUIを別Terminalで起動します。BridgeはOn-chain Device登録と
Policy Assignmentを行うDevelopment Operator境界であり、PublicなDevice管理EndpointとしてDeployしません。

```bash
npm run dashboard:sync
# Terminal 1
npm run dashboard:provisioning
# Terminal 2
npm run dashboard:dev
```

Wranglerの既定Portは`8787`です。使用中の場合は一度Buildし、Workspace Scriptへ空きLoopback Portを
指定します。Browser Deviceは引き続きPort `8790`のProvisioning Bridgeを使用します。

```bash
npm run dashboard:build
npm run dev -w @midnight-demo/proof-gateway -- \
  --port <free-port> --enable-containers=false
```

`dashboard:sync`がRemote D1から複製するのはProject／Device公開Metadata、Device公開鍵、Policy／Assignment Mirror、1時間集計、Anomaly State／Transition、Redacted Daily Proof Job Stateだけです。Reading、Session、Challenge、Token Hash、Operator Lease、Transaction Object Key、R2 Artifactは除外します。Ignored File `apps/proof-gateway/.dev.vars`には公開Network LabelとContract Addressだけを設定します。

Local Hostした管理者／第三者画面は、現行Local D1 Snapshotを直ちに表示します。最初にどちらかのData Viewを
開いたときだけ、GUIがLoopback Bridge経由の`dashboard:sync`をBackgroundで開始し、現在のEvidenceを消さずに
Progress Indicatorを表示します。画面遷移ではImplicit同期を繰り返しません。明示的な同期は**再読込**を使い、
成功／失敗を画面内に表示しながら、最後に利用できたSnapshotを維持します。

Browser Device Workflowでは、DApp Connector API 4.x互換Lace WalletをPreprodに設定した通常のChrome
Profileを使い、`http://127.0.0.1:<gui-port>/#/device`を開きます。画面の順序は次です。

LaceへのtNIGHT入金やtDUST生成は不要です。Laceは`payFees: false`でDevice TXを承認・Bindし、Sensor
Contract Proofは認証済みCloudflare Proof Server、DUST付与とSubmitは専用Sponsor Walletが担当します。
GUIはSponsorshipの処理段階とFee Evidenceを表示します。

1. Laceへ接続し、Wallet側でDApp接続を承認
2. Browser Private StorageへECDSA P-256 Device Identityを作成
3. 登録済みPublic Threshold Policyを選択し、Local Development Operator Bridge経由でDevice登録
4. 疑似Sensor値を1件取得し、Device SessionでUpload
5. 監督下のProof Jobを要求して即時Admission
6. Cloudflare Proof ServerでContract ZKPを生成し、LaceでFeeなしDevice TXを承認し、Sponsor Walletが
   DUSTを追加してTX送信
7. Confirm済みClaimを管理者Viewと第三者Viewで確認

LaceはBrowser Deviceの明示的なTX承認を担当し、Fee Payerではありません。Sponsor WalletはFeeだけを担当します。
Device登録とPolicy Bindingの管理権限は別のDevelopment Wallet／Operator Authorityに残します。Wallet接続と
Device TX承認は明示的なUser Confirmationです。

Dockerを意図的に停止し、GUI／D1だけ確認する場合：

```bash
cd apps/proof-gateway
npx wrangler dev --config wrangler.jsonc \
  --enable-containers=false --port 8790
```

このGUI／D1のみのFallbackでは`http://127.0.0.1:8790/#/admin`を開きます。Wave 1の管理者APIはLoopback以外を拒否します。第三者Route `#/verify/<proofJobId>`はPublic Redacted Proof APIを使用し、1時間集計を表示しません。Device WorkflowではPort `8790`をProvisioning Bridgeが使うため、上記2 Process構成を使用します。

Stepperの順序：Device登録・認証、1時間集計、Anomaly、Proof要求／Admission、Proof生成／Device承認／Sponsor Fee付与、Midnight Confirm。説明動画ではDevice発の疑似値、Proof前、Admission、Proof／Sponsorship、Confirm、値を開示しない第三者Claimを撮影します。

Confirm後、Local Dashboardを起動したまま、日本語GUI Walkthroughを再現可能なCommandで撮影します。

```bash
npm run dashboard:capture-demo -- \
  --proof-job-id <proofJobId>
```

Localに導入済みのChromeとFFmpegを使用し、Loopback URLだけを操作します。MP4、管理者Screenshot、第三者Screenshot、Checksum Metadataはgitignore済みの`.demo-output/`へ保存します。管理者から第三者Routeへの実際の遷移とScrollを記録し、Device Session、Wallet Material、Raw Sensor値、Private Hourly Extrema、Nonceは読み取りません。

第三者画面では、公開情報だけから構成した**ゼロ知識証明（ZKP）の確認ステップ**、**第三者には非公開**と示す
元のセンサー値の黒塗り欄、利用可能なコントラクト／トランザクション情報のMidnight Explorerリンクを少なくとも1つ撮影します。

## 5. 検証・Cleanup

```bash
npm run verify
npm run development:status
npm run device:status
```

Public TX EvidenceをMidnight Contract Stateと比較してからConfirmed扱いにします。非Production Cloudflare Resourceは`npm run cloudflare:destroy`で削除できます。State削除前に開発WalletとDevice Walletを別々にBackupします。
