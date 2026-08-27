# 計測データ真贋性証明システム

[English documentation](../../README.md)

Edge Deviceの温度実測値をCloudflare D1へ保存するシステムです。デバイス運用Wallet CLIは、準備済みDatasetをMidnightの`sensor-registry`へ登録し、選択した1件のPrivate SampleについてMerkle inclusionと範囲を検証できます。Workerは日次Attestation workflow recordも作成しますが、そのrecordとデバイスWallet送信を接続する常駐Agentはまだ含まれていません。開発とデバイス運用はworkspace、配布物、Walletのすべてを分離します。

## 実行境界

```text
開発サーバ                                     Raspberry Pi／デバイス運用
  Compact compile・proving key生成               センサー収集・認証付き送信
  全テスト・Proof benchmark                      明示的なDataset Transaction送信
  Cloudflare・Contract deploy                    独立したデバイス運用Wallet
  開発・deploy用Wallet                           localhost health・永続診断ログ
             │                                             │
             └──── Cloudflare Worker + Proof Container ────┘
                                      │
                                Midnight Preprod
```

| ホスト | 実行する処理 | 実行禁止の処理 |
| --- | --- | --- |
| 開発サーバ | Compact compile、proving key生成、全テスト、benchmark、Wrangler、開発Wallet同期、Contract deploy、デバイス配布物生成 | 常時センサー収集、デバイスWallet利用 |
| Raspberry Pi／デバイス | センサー読取り・送信、独立した運用Walletによる準備済みDatasetの明示的Tx、loopback health、障害解析ログ | Compact compiler、proving key生成、ローカルProof Server、Docker、Contract deploy、開発Wallet、全workspace test |
| Cloudflare | Worker API、D1、SPA、日次pending record作成、実行時Proof Server Container | 開発Wallet／デバイスWalletの復旧情報 |

Proof ServerがTxごとに行う証明生成と、Compact compilerが事前に行う回路・key生成は別処理です。どちらもPiでは実行しません。

## Monorepo

```text
apps/development/operator-cli/  開発Wallet・deploy・benchmark
apps/device/edge-agent/         Raspberry Pi用温度Collector
apps/device/wallet-agent/       デバイス運用Wallet・submit・status
apps/dashboard/public/          Worker配信の2言語SPA
apps/proof-gateway/             Worker API・D1 migration・Proof Container
contracts/                      Compact Contract・生成Profile・テスト
packages/shared/                Commitment・Merkle utility・fixture
ops/pi-forensics/               永続journal・Pi health snapshot
docs/                           英語の正本文書
docs/ja/                        日本語訳
```

## 開発サーバ

このホストにはNode.js `22.15.0`以上、Compact Developer Tools `0.5.2`とtoolchain `0.31.1`、Wrangler認証、deploy用のfund済み開発Walletが必要です。

```bash
npm ci
compact update 0.31.1
cp .env.development.example .env.development
cp apps/proof-gateway/.dev.vars.example apps/proof-gateway/.dev.vars

# Contract artifactとproving keyはここで生成する。Edgeでは実行しない
npm run contract:compile
npm run verify
```

開発Walletの復旧元は`.env.development`です。`npm run development:wallet`の初回実行時にmnemonicをmode `0600`でatomicに保存します。このファイルを暗号化またはオフラインで必ずバックアップしてください。`.state/development/`は同期・deployの再開用cacheであり、Wallet backupではありません。旧混在構成からは、開発サーバ上で新Walletを作る前に`npm run development:wallet:migrate`を実行します。

実験的な日次Attestation固定Profileも開発サーバだけでコンパイルします。これはbenchmark CLI用であり、`npm run verify`、デバイスF/W、現在の`sensor-registry`送信経路には含まれません。Profileごとに別のkeyが必要です。

```bash
ATTESTATION_SAMPLE_COUNTS=24 npm run attestation:compile
```

### 初回deployとデバイス配布物

Compile、deploy、配布物生成は開発サーバで行います。Contractまたはruntime code／artifactを変更した場合だけ再実行します。

```bash
npm run cloudflare:deploy
npm run cloudflare:secret
npm run secret:ingest -w @midnight-demo/proof-gateway
npm run secret:attestation -w @midnight-demo/proof-gateway

npm run development:wallet
npm run development:funding
npm run development:deploy
npm run cloudflare:config:network
npm run cloudflare:config:contract
npm run development:status

# 上のpromptで公開network名とdeploy済みContract addressを設定する。
# 値はWorker環境bindingでありrepositoryへcommitしない。
# その後、Compile済みartifactを内部exportして秘密情報を含まないF/W archiveを作る。
./package_archive.sh
```

`PROOF_GATEWAY_TOKEN`はProof request、`INGEST_API_TOKEN`はsensor upload、`ATTESTATION_API_TOKEN`は内部claim／result APIを保護します。最後のtokenは外部Attestation Agentを接続する場合だけ必要であり、そのpolling Agentはこのrepositoryに実装されていません。

Piへ渡すのは`.device-release/archives/midnight-sensor-device-fw-<version>.tar.gz`と`.sha256`だけです。Archiveは単一のtop-level directoryを持ち、rootに実行可能な`installer.sh`を含みます。Manifest検証により開発workspace、Compact source、dev tool、秘密fileの混入を拒否します。開発checkout全体、`.env.development`、`.dev.vars`、`.state/development/`、開発Wallet、Private開発inputはPiへ置かず、Gitにもcommitしません。

## Raspberry Pi／Edge導入

展開したArchiveの`.env.device`は導入Inputとしてだけ使用します。Installerはこれを`~/.midnight/midnight-cloudflare-demo/config/device.env`へ移し、Version別Runtimeを`releases/`配下へ導入して、有効Releaseを`current`で参照します。Wallet復旧情報はenvから一切読み込まず、同じRootの`device-wallet/`へowner-only権限で保存します。このWalletは開発・deploy用Walletとは別物です。

開発サーバ側でWorkerのingestion secretを設定し、一致するingestion URLとtokenだけをPiへ渡します。

```bash
sha256sum -c midnight-sensor-device-fw-<version>.tar.gz.sha256
tar -xzf midnight-sensor-device-fw-<version>.tar.gz
cd midnight-sensor-device-fw-<version>
cp .env.device.example .env.device
chmod 600 .env.device
# deploy済みContract address、remote proof URL/token、ingestion資格情報、
# sensor設定を記入し、mnemonic/seed項目は追加しない。

./installer.sh
```

URLはinstaller引数でも設定できます。

```bash
./installer.sh --ingest-url https://<worker>.workers.dev/api/v1/readings
```

Edge installerが行うのは次だけです。

- 運用専用配布物と開発サーバ生成済みContract artifactのintegrityを検証
- 検証済みReleaseを`~/.midnight/midnight-cloudflare-demo/releases/<version>-<manifest-hash>/`へ導入
- staging用`.env.device`を`~/.midnight/midnight-cloudflare-demo/config/device.env`へ移動
- dependency導入とDevice Test成功後だけ`current`をatomicに更新し、旧Targetを`previous`として保存
- device collectorとdevice wallet workspaceだけの依存関係を導入
- 小さなdevice単体テストだけを実行
- リソース上限付き`measurement-edge-agent.service`を登録
- journald永続化と1分ごとの接続／リソースsnapshotを有効化

旧`--proof-server-url`、`--skip-compact-install`、`--skip-verify`は明示的に拒否します。`compact`、`contract:compile`、全体`verify`、Wrangler、Docker、deploy、Wallet初期化は一切呼びません。Device Release Manifestとsystemdの`MIDNIGHT_HOST_ROLE=device`により、開発・Contract commandを処理開始前に拒否します。

Upgrade成功後は、次のCommandで1つ前のReleaseへ戻せます。

```bash
~/.midnight/midnight-cloudflare-demo/current/installer.sh --rollback
```

`previous`を検証し、`current`と`previous`のSymlinkを入れ替え、Collectorを再起動してHealthを確認します。Release Directoryは、OperatorがInactive Versionを明示的に削除するまで保持します。

運用Walletはservice userとして明示的に初期化し、表示されたaddressへfundした後、実測値からDatasetを準備した場合にだけ明示的に送信します。

```bash
cd ~/.midnight/midnight-cloudflare-demo/current
npm run device:wallet
npm run device:funding
npm run device:submit -- --input data/<prepared-real-dataset>.json
npm run device:status
```

`device:submit`は`PreparedDataset` JSONまたは実測`SensorRecord[]`を受け取ります。配列の場合、Private Range Proofの入力は`--min`、`--max`、`--selected-index`で選択し、既定値は`10`、`35`、中央のrecordです。`--verify-only`はDataset登録を省略します。このcommandは疑似計測値を生成せず、WorkerのAttestation recordも自動更新しません。`config/device.env`と`device-wallet/`は、開発側の`.env.development`とは別系統でバックアップします。

```bash
sudo systemctl status measurement-edge-agent
sudo journalctl -u measurement-edge-agent -f
curl http://127.0.0.1:8788/health
```

強制再起動後は直前bootを確認できます。

```bash
sudo pi-forensics-report -1
```

Reportにはkernelの電源／温度／OOM／Storage event、Network／SSH event、定期health snapshotが含まれます。Wi-Fi識別子、認証情報、Wallet、Rawセンサー値、Application Secretは記録しません。

systemdを使わないEdge単体開発は次だけです。

```bash
npm run edge:test
npm run edge:serve
```

## 現在の連携状況

- End-to-end実装済み: 認証付き温度送信、D1参照、日次pending record作成、2言語dashboard、remote Proof Gateway、開発Walletによるdeploy、デバイスWalletによる明示的な`registerDataset`／`verifySensorValue` Tx。
- 開発用実験として実装済み: 24／96／1,440件の固定日次回路、署名付き時間Evidence、追記型Outlier Reason Hash。
- 未接続: Workerのpending recordをclaimし、対応するPrivate Inputを組み立て、`device:submit`を実行して結果をWorkerへ返す常駐Attestation Agent。これがない間、dashboardの`confirmed`は信頼するAgentがD1へ報告した状態であり、BrowserがMidnightを独立照会した結果ではありません。

## Security Boundary

開発Walletは`.env.development`だけを復旧元とし、暗号化／オフラインbackupを保持します。独立したデバイスWalletは`~/.midnight/midnight-cloudflare-demo/device-wallet/`だけに置きます。導入後の運用設定は`config/device.env`で、staging用`.env.device`は削除され、Wallet mnemonic／seedを含みません。Piへ渡すのはcompile済みruntime artifactであり、Compact sourceやkey生成toolchainは渡しません。Browser APIにも秘密値を公開しません。

詳細は[`system_architecture.md`](system_architecture.md)、[`private_spec.md`](private_spec.md)、[`demo_runbook.md`](demo_runbook.md)を参照してください。

## References

- [Midnight developer documentation](https://docs.midnight.network/)
- [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare Containers documentation](https://developers.cloudflare.com/containers/)
