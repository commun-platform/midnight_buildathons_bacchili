# Midnight Sensor Device Firmware

このpackageはEdge Device用のデバイス運用runtimeだけを含みます。開発PC上で`./edge-device/release/package_archive.sh`から生成し、開発Wallet、Compact source／compiler、proving key生成tool、Cloudflare deploy code、Browser applicationは含めません。

![検証済みパッケージの作成、版ごとの導入、稼働確認、復旧までの安全なリリース手順](../assets/guides/edge-release-lifecycle-ja.png)

## 含まれる運用機能

- 温度collectorとloopback health endpoint
- デバイス専用ECDSA P-256 Identityと短命Cloudflare API Session
- deploy済みContractを使うDevice Transaction Identity CLIと日次記録用Timer
- 開発PCで生成してintegrity manifestを付けたCompact runtime artifact
- `installer.sh`、systemd installer、永続障害解析log

開発／Deployer WalletとSponsor Walletはこのpackageへ含めません。導入済みRuntime、設定、Device Identity、
Transaction Identity、Compact Private StateはEdge Device上の
`~/.midnight/midnight-cloudflare-demo/`配下へ集約します。P-256秘密鍵は`device-auth/`、
Transaction Credentialは`device-wallet/`だけに生成し、どちらもEnvironment Fileへは絶対に置きません。
DeviceはNIGHT、DUST登録、同期済みDUST Stateを保持しません。

## Edge Deviceへの導入

```bash
tar -xzf midnight-sensor-device-fw-<version>.tar.gz
cd midnight-sensor-device-fw-<version>
cp .env.device.example .env.device
chmod 600 .env.device
```

Staging用`.env.device`へRemote Proof Server URL、Worker Ingestion URL、Device／Project ID、Sensor設定を記入し、`DEVICE_CONTRACT_ADDRESS`は空のままにします。公開鍵有効化後、`npm run device:configure`がWorkerへ認証し、現行Contract、Network、Policy、Assignment MetadataをAtomicに導入します。F/W ArchiveはDeployment非依存です。固定API Token、秘密鍵、Mnemonic、Seedは追加しません。検証後、InstallerはこのFileを`~/.midnight/midnight-cloudflare-demo/config/device.env`へ移し、Staging Copyを削除します。

Staging Fileを作るのは初回導入時だけです。Upgradeは導入済み`config/device.env`を再利用します。新しいArchiveに異なるStaging Fileがある場合、Installerはどちらを優先するか推測せず拒否します。

```bash
./installer.sh --no-start
```

InstallerはDevice設定、鍵、Release、Symlink、Serviceを変更する前に、選択した導入経路で必要な
Commandを一括検査します。通常経路ではFile Utility、systemd／Journal、Health Check、各特権Commandの
非対話sudo許可、Node.js `>= 22.15.0`、npm Runtimeを確認します。Debian系Hostで不足がある場合は、
そのCommandを提供するPackageだけを導入し、全検査を再実行します。`iw`、`vcgencmd`、Dockerのような
任意の診断情報は導入を妨げません。事前検査に失敗した場合、Project Stateを変更する前に不足Commandを
まとめて表示します。

InstallerはRelease ManifestとContract Artifact Manifestを検証し、Releaseを`releases/<version>-<manifest-hash>/`へCopyしてから、Device Auth、Collector、Device Wallet Workspaceのproduction dependencyだけを導入します。これらの検証とDevice Testが成功した場合だけ`current`を切り替え、旧Targetを`previous`にします。Device Identityの全Fileがない場合だけP-256鍵を生成し、完全な既存Identityは保持して検証し、一部だけ存在する場合は安全側に停止します。収集Serviceと実行ごとに終了する日次送信Service、それぞれの復旧・再試行Timerを導入します。Compact compile、proving key生成、Docker、Contract deploy、Wallet初期化、開発tool導入は行いません。

Transaction Stateを変更するCommandは、`device-wallet/`配下のowner-only Process Lockを使用します。
2つ目のTransaction、Submission、Benchmark CommandはStateを開く前に失敗します。異常終了で残った
Lockは、記録されたPIDが動作していない場合だけ回収します。

導入後の構成:

```text
~/.midnight/midnight-cloudflare-demo/
├── config/device.env
├── current -> releases/<active-release>
├── previous -> releases/<previous-release>
├── releases/<version>-<manifest-hash>/
├── device-auth/
├── device-wallet/
└── data/（または設定済みEdge Data Directory）
```

Collector State、Local Raw Measurement、Delivery Outboxはowner-only Storageを使用します。State更新は
Temporary Fileへ書き、同期してからAtomic Renameします。異常な電源断で`collector-state.json`が破損した
場合、Collectorは`collector-state.json.corrupt-<timestamp>`として保持し、Raw／Outbox Fileを削除せず
新しいStateで開始し、復旧をPersistent Journalへ記録します。

Installerが初回導入時にP-256 Device Identityを生成します。`enrollment.json`だけを開発ホストへ転送して`npm run cloudflare:device:register -- --enrollment ...`で登録した後、Serviceを開始します。公開の登録Endpointはなく、開発ホスト上でDevice鍵を生成しません。

```bash
cd ~/.midnight/midnight-cloudflare-demo/current
# Device上でInstallerが生成した公開Enrollment情報を確認します。
npm run device:auth:show
sudo systemctl start measurement-edge-agent
```

導入後は展開元Archiveを削除できます。2つのSymlinkを入れ替えてRollbackするには次を実行します。

```bash
~/.midnight/midnight-cloudflare-demo/current/installer.sh --rollback
```

このTree外へ残るのはOS統合だけです。Systemd Unit、永続Journal設定／Report Helper、および適切なVersionがHostにない場合のInstaller管理Node.js Runtimeです。Project Source、Device設定、Wallet StateはこれらのOS Fileと一緒に保存しません。

導入後の確認:

```bash
sudo systemctl status measurement-edge-agent
curl http://127.0.0.1:8788/health
sudo journalctl -u measurement-edge-agent -f
```

## 連続稼働と日次自動記録

通常導入では`measurement-edge-agent.timer`が毎分、収集Serviceを起動します。すでに稼働中なら
処理は継続し、再起動しません。予期しないProcess終了にはService自身の再起動設定で対応します。
Collectorと復旧Timerには`RefuseManualStop=yes`を設定し、直接の`systemctl stop`／`restart`を拒否します。
意図した停止には後述の保守Targetを使用します。`--no-start`は新しいProcessを起動せず、
既存Collectorを維持したままUnitを有効化します。登録済みDeviceで通常運用を開始するCommandは次のとおりです。

```bash
sudo systemctl start measurement-edge-agent.service measurement-edge-agent.timer measurement-edge-agent-daily.timer
```

`measurement-edge-agent-daily.timer`は5分ごとに別Processで`device:daily-submit`を実行します。
認証済みAssignmentの日付境界に従い、日が終了して5分経過したデータだけを対象にします。
UTC日付別のNDJSON Fileをまたいで実測値を読み、24時間分の最小値・最大値を集計します。
欠測時間はSTOPPEDのまま記録し、停止期間を架空の測定値で補完しません。自動送信はHardware Modeと
登録済みDevice Transaction Identityを必要とします。Assignment有効期間の途中から始まる日は除外します。

送信前に、再試行に必要な秘密の集計結果とNonceを実機内の
`device-wallet/daily-attestations/<scope>/<date>.prepared.json`へ権限`0600`で永続保存します。
Raw値と秘密の最小値・最大値は公開APIやLogへ出しません。再試行では元データの一致を検査し、
同じProof Jobと保存済みTransactionを再利用します。Sponsorの受付時刻前は速やかに終了して次回に再試行します。
Midnight Indexerで確定を確認してから`<date>.receipt.json`を保存し、確定済みの日は再送しません。
1回の実行では未確定日を最大7日処理します。証明生成中や通信障害中もCollectorは独立して収集を継続します。

```bash
sudo systemctl list-timers 'measurement-edge-agent*'
sudo journalctl -u measurement-edge-agent-daily.service -n 30 --no-pager
cd ~/.midnight/midnight-cloudflare-demo/current
npm run device:daily-submit -- --max-days 7
```

意図した保守停止には専用Targetを使用します。両Timerと両Serviceの停止完了を待ちます。
このTargetは起動時に有効化せず、通常の起動Commandで保守状態から復帰します。

```bash
sudo systemctl start measurement-edge-agent-maintenance.target
# 保守終了後:
sudo systemctl start measurement-edge-agent.service measurement-edge-agent.timer measurement-edge-agent-daily.timer
```

再起動後も保守停止を維持する場合は、停止後に両TimerとCollector Serviceを`systemctl disable`し、
再開前に有効化し直します。Upgradeは依存Package導入・Test後、検証済みReleaseへの切替時だけ
Serviceを短時間停止します。Rollback時も日次処理を停止してから切り替えます。日次機能のない旧Releaseでは
日次ServiceのFile存在条件により処理をSkipします。保護済みUnitの更新・Rollbackには修正版Installerを使用します。
旧Installerの`restart`はServiceが停止済みでも拒否されるため、保守状態へ移行するだけでは使用できません。
systemd保護設定のみを反映したDeviceでは、変更しないRuntime Archive内に旧Installerが残ります。
次回の更新・Rollbackには停止保護対応を含めて新しくPackage化したFirmwareのInstallerを使用してください。

Proof、Demo、監視Taskの完了時も連続計測を維持します。連続運用の開始前に、Collector停止を含む古い
一日試験の自動Taskを削除または更新してください。2026年9月8日の停止原因は、旧試験Heartbeat
`edge-24h-zkp-tx`によるCollectorと復旧Timerの明示停止でした。同Heartbeatは削除済みです。
停止保護により、この古い停止Commandは計測を止めずに拒否されます。管理者が明示的に保守状態へ移行したり、
Unit設定を変更したりする操作を禁止するものではありません。稼働確認では`lastMeasurementAt`と時間帯内の件数の
進行を確認します。HTTP 200と`ok: true`だけでは新しい計測が成功しているとは判断できません。

Attestationが必要な場合は、Installerで選択した同じ非root Service Userとして、別系統のDevice
Transaction Identityを明示的に初期化します。Recovery Materialはowner-onlyのCredentials Fileへ保存し、
標準出力には表示しません。直後に`device-wallet/`全体をOffline Backupしてください。Deviceへの入金や
DUST同期手順はありません。

```bash
cd ~/.midnight/midnight-cloudflare-demo/current
npm run device:authority:generate -- --network preprod \
  --confirm-contract-authority-generation
npm run device:authority:show -- --network preprod
npm run device:wallet
npm run device:submit -- --input /path/to/prepared-real-dataset.json
npm run device:status
```

Development OperatorがContractをDeployする前にContract Authorityを一度だけ生成します。公開`enrollment.json`だけを転送し、Secretを含む`authority.json`はEdge Deviceから出しません。`device:submit`は実際の`SensorRecord[]`または`PreparedDailyExtremaAttestation`を受け取ります。配列Inputは認証済みAssignment境界から24個のObserved／計測なしSlotへ集計し、指定できるのは運用日と登録済みPolicy／Assignment IDだけです。Threshold Boundや別の境界は送信できません。Submitは日次Scheduled Proof Jobを1件作成または再利用します。Collectorは1時間AggregateとAnomaly TransitionだけをUploadし、Raw Readingは送りません。

PreprodのCost結合試験を明示的に行う場合、標準の1日分をDeviceのMemory内に生成します。1分ごとの
Private Raw値1,440件をDevice内で24時間分の時間別最小値・最大値Slotへ集約し、同じ運用Walletと
Remote Proof Server経路へ送信します。`--confirm-synthetic`が必須です。CLIは固定回路の同値性確認用に
24／96件も受け付けますが、別のCost Profileにはしません。

```bash
npm run device:benchmark -- --samples 1440 --period-date YYYY-MM-DD --run-id cost-1440-a --confirm-synthetic
# 固定24 Slot回路を変えず、指定した運用時間Slotを計測なしにする。
npm run device:benchmark -- --samples 1440 --missing-hours 2,3,11,19 \
  --period-date YYYY-MM-DD --run-id missing-hours-a --confirm-synthetic
# 運用日全体を停止として表す。
npm run device:benchmark -- --samples 1440 --missing-hours all \
  --period-date YYYY-MM-DD --run-id stopped-day-a --confirm-synthetic
```

`--missing-hours`には重複しない運用Slot番号`0`～`23`、または`all`を指定します。任意の
`--outlier-value`は欠損除外後の最初の観測値へ適用されるため、計測なしと正しいしきい値外判定を
同時に試験できます。

各Submissionは運用前に登録済みのPublic Policyを使い、実際の`submitDailyAttestation` Transactionを
Proof／Bindします。FeeなしのFinalized Transactionを認証済みSponsor Endpointへ送り、Sponsor Walletが
DUSTだけを追加してMidnightへ送信します。疑似値やPrivate Hourly ExtremaはD1へUploadしません。Timing、
Public Attestation Commitment、Observed／STOPPED Count、Sponsorship時間、Fee、Transaction Metadataだけを
含むRedacted Resultを`device-wallet/benchmarks/`配下へ保存し、Raw疑似Sampleは暗号化されたDevice Private
Stateだけに保持します。最初のSponsor Request前に、FeeなしSerialized Transactionをmode `0600`で
`device-wallet/pending-transactions/`へ原子的に保持します。同じProof JobのRetryはIntegrity確認済みの
同一Bytesを再Proofせず再利用し、同じJobに対する別Transactionは拒否します。新しいAttestationごとに
一意な`--run-id`を使用してください。

`config/device.env`、`device-auth/`、`device-wallet/`全体を、開発PCの`tools/midnight-operator/.env.development` Backupとは別に
保管してください。Device Credentialは混在させたり開発ホストへコピーしたりしません。Sponsor Walletの
Recovery Sourceは両Hostから分離管理します。Release DirectoryとSymlinkは、署名／Checksum検証済み
Firmware Archiveから再作成できます。
