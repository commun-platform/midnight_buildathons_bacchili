# デプロイおよびレビューRunbook

[English](../demo_runbook.md)

## 1. 準備

1. 開発サーバで`npm ci`と`npm run verify`を実行します。
2. `.env.development.example`を`.env.development`へコピーし、強い`DEVELOPMENT_PRIVATE_STATE_PASSWORD`を設定します。Local Worker開発用に`apps/proof-gateway/.dev.vars.example`を`apps/proof-gateway/.dev.vars`へコピーします。
3. `npm run cloudflare:deploy`でWorker、D1、GUI、Containerを作成します。
4. `npm run cloudflare:secret`、`npm run secret:ingest -w @midnight-demo/proof-gateway`、`npm run secret:attestation -w @midnight-demo/proof-gateway`で3つの独立したBindingを登録します。Proof Tokenを`.env.development`の`MIDNIGHT_PROOF_SERVER_TOKEN`へコピーし、`MIDNIGHT_PROOF_SERVER_URL`をDeploy済みWorker URLの末尾に`/proof`を付けた値へ設定します。
5. `npm run development:wallet`を実行し、直後に`.env.development`を安全にBackupします。表示されたAddressへ入金し、`npm run development:funding`で確認します。
6. `npm run development:deploy`を実行します。`.state/development/`は再開用Cacheとしてのみ保存します。返されたAddressを`npm run cloudflare:config:contract`で設定し、公開Labelを`npm run cloudflare:config:network`で設定します。
7. `./package_archive.sh`を実行します。ScriptはNetworkやDeployment Addressを埋め込まず、Compile済み`sensor-registry` Artifactを内部でExportします。`.device-release/archives/`に生成された`.tar.gz`と`.sha256`だけをPiへ転送します。

## 2. Edge Deviceの起動

```bash
sha256sum -c midnight-sensor-device-fw-<version>.tar.gz.sha256
tar -xzf midnight-sensor-device-fw-<version>.tar.gz
cd midnight-sensor-device-fw-<version>
cp .env.device.example .env.device
chmod 600 .env.device
# MIDNIGHT_PROOF_SERVER_URL/TOKEN、DEVICE_CONTRACT_ADDRESS、
# CLOUDFLARE_INGEST_URL/TOKEN、sensor identity/pathを設定する。
./installer.sh --ingest-url https://<worker>.workers.dev/api/v1/readings
npm run device:wallet
npm run device:funding
sudo systemctl status measurement-edge-agent
curl http://127.0.0.1:8788/health
sudo journalctl -u measurement-edge-agent -f
```

既定のSensor Pathは`/sys/class/thermal/thermal_zone0/temp`です。別のsysfs互換Sensorを使う場合は`TEMPERATURE_SENSOR_PATH`を変更します。WorkerにはSample ReadingやTransaction Fallbackがないため、このServiceが実値を正常にUploadするまでGUIは空です。

Wallet CommandはInstallerで選択した同じ非root Service Userとして実行します。Device Walletは`~/.midnight/midnight-cloudflare-demo/device-wallet/`配下だけに保存し、`.env.development`とは別にBackupします。Pi上で`npm run verify`、Compact Compile、Proof Benchmark、Development Wallet Command、Wrangler、Docker、Deploy Commandを実行してはいけません。Installerは永続journaldとHealth Snapshotを有効化します。強制再起動後は`sudo pi-forensics-report -1`を実行してください。

## 3. 運用Proofの送信

CollectorはProof Inputを構築せず、Wallet CLIもDaemonではありません。実際の`SensorRecord[]`または以前に準備した`PreparedDataset`を含むJSON Fileを指定します。

```bash
npm run device:submit -- --input /secure/path/to/real-records.json \
  --min 10 --max 35 --selected-index 0
npm run device:status
```

このCommandはDatasetを登録し、選択した1つの値を検証します。そのRootを登録済みの場合だけ`--verify-only`を使用してください。JSON OutputにはRegister／Verify Transaction Metadataが含まれますが、D1やWorker Attestation recordは更新しません。

## 4. Attestation Workflowの境界

CronはProjectの現地0時台に`pending` recordを作成し、前日のReadingを関連付けます。このRepositoryは外部Agent向けに次のProtected Endpointを公開します。

```text
POST /api/internal/attestations/claim
POST /api/internal/attestations/<attestation-id>/result
```

最初のclaimは`pending`を`aggregating`へ変更します。Result Endpointは`aggregating`、`proving`、`submitted`、`confirmed`、`failed`とRoot／Transaction Metadataを受け取ります。どちらも`ATTESTATION_API_TOKEN`を使用します。Polling Agent、D1からDatasetへの変換、Submission Bridge、Transaction Confirmation Watcher、Chain Validation Callbackは含まれていません。外部のTrusted Agentが実際にTransactionを検証するまで、recordを`confirmed`にしてはいけません。

## 5. レビュー手順

1. Project Overviewを開き、**Temperature Sensor**／**温度センサー**が唯一のDeviceであることを確認します。
2. Upload後に最新Cardと`lastSeenAt`が変わることを確認します。
3. Time-Series Dataを開き、Normal値とOutlier値をFilterします。
4. Cronがpending Attestationを作成した後にDaily Proof Historyを開きます。
5. 外部Agentが実際のConfirmed Transactionを報告済みの場合は、そのrecordを選んでThird-Party Verificationを開きます。
6. Raw Proof Value、Threshold、Nonce、Merkle Pathが表示されないことを確認します。CheckとTransaction MetadataはD1から読み取られ、BrowserはMidnightを独立して照会しません。
7. 報告されたDataset Tx、Verify Tx、Block Heightを`npm run device:status`およびMidnight Explorerと比較します。
8. HeaderでSystem、English、日本語を切り替え、Reload後も選択が保持されることを確認します。

## 6. QA証跡

```bash
npm run test -w @midnight-demo/shared
npm run test -w @midnight-demo/sensor-registry-contract
npm run test -w @midnight-demo/proof-gateway
npm run verify
```

Contract Testは有効なData、範囲外Data、Raw値改ざん、Merkle Path改ざんを対象にします。Worker Testは認証、Sensor Metadata検証、Redaction、Scheduling、Storage動作を対象にします。

`npm run verify`は運用`sensor-registry`経路を対象にします。実験用Daily Profileは分離され、開発サーバで明示的な`npm run attestation:compile`と`npm run benchmark:daily-proof`を必要とします。

## 7. 削除

```bash
npm run cloudflare:destroy
```

Cloudflareから`midnight-proof-gateway`が削除されたことを確認します。CacheやDataを安全に削除する前に、開発用`.env.development` Backupと、別系統のDevice Wallet Backupを保存してください。
