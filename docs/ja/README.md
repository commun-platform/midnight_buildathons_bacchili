# 計測データ真贋性証明システム

[English documentation](../../README.md)

Edge Deviceの温度実測値をCloudflare D1へ保存し、プライバシーを保ったAttestationをMidnight Preprodへ記録するシステムです。開発とデバイス運用はworkspace、配布物、Walletのすべてを分離します。

## 実行境界

```text
開発サーバ                                     Raspberry Pi／デバイス運用
  Compact compile・proving key生成               センサー収集・認証付き送信
  全テスト・Proof benchmark                      継続的なTransaction送信
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
| Raspberry Pi／デバイス | センサー読取り・送信、独立した運用Walletによる継続Tx、loopback health、障害解析ログ | Compact compiler、proving key生成、ローカルProof Server、Docker、Contract deploy、開発Wallet、全workspace test |
| Cloudflare | Worker API、D1、SPA、scheduler、実行時Proof Server Container | 開発Wallet／デバイスWalletの復旧情報 |

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

日次Attestationの固定Profileも開発サーバだけでコンパイルします。Profileごとに別のkeyが必要です。

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

Piへ渡すのは`.device-release/archives/midnight-sensor-device-fw-<version>.tar.gz`と`.sha256`だけです。Archiveは単一のtop-level directoryを持ち、rootに実行可能な`installer.sh`を含みます。Manifest検証により開発workspace、Compact source、dev tool、秘密fileの混入を拒否します。開発checkout全体、`.env.development`、`.dev.vars`、`.state/development/`、開発Wallet、Private開発inputはPiへ置かず、Gitにもcommitしません。

## Raspberry Pi／Edge導入

Piが読む設定は`.env.device`です。endpoint、deploy済みContract address、ingestion資格情報、sensor設定だけを置きます。Wallet復旧情報はenvから一切読み込まず、`~/.midnight/midnight-cloudflare-demo/device-wallet/`へowner-only権限で保存します。このWalletは開発・deploy用Walletとは別物です。

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
- device collectorとdevice wallet workspaceだけの依存関係を導入
- 小さなdevice単体テストだけを実行
- リソース上限付き`measurement-edge-agent.service`を登録
- journald永続化と1分ごとの接続／リソースsnapshotを有効化

旧`--proof-server-url`、`--skip-compact-install`、`--skip-verify`は明示的に拒否します。`compact`、`contract:compile`、全体`verify`、Wrangler、Docker、deploy、Wallet初期化は一切呼びません。`.host-role`へ`device`を記録し、開発・Contract commandを処理開始前に拒否します。

運用Walletはservice userとして明示的に初期化し、表示されたaddressへfundした後、継続的なデバイスTxだけに使います。

```bash
npm run device:wallet
npm run device:funding
npm run device:submit -- --input data/<prepared-real-dataset>.json
npm run device:status
```

`device:submit`は実測値から準備したinputが必須で、疑似計測値を生成しません。デバイスcredentials directoryは、開発側の`.env.development`とは別系統でバックアップします。

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

## Security Boundary

開発Walletは`.env.development`だけを復旧元とし、暗号化／オフラインbackupを保持します。独立したデバイスWalletは`~/.midnight/midnight-cloudflare-demo/device-wallet/`だけに置きます。`.env.device`にはWallet mnemonic／seedを置きません。Piへ渡すのはcompile済みruntime artifactであり、Compact sourceやkey生成toolchainは渡しません。Browser APIにも秘密値を公開しません。

詳細は[`system_architecture.md`](system_architecture.md)、[`private_spec.md`](private_spec.md)、[`demo_runbook.md`](demo_runbook.md)を参照してください。

## References

- [Midnight developer documentation](https://docs.midnight.network/)
- [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare Containers documentation](https://developers.cloudflare.com/containers/)
