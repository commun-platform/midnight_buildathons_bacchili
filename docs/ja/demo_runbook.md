# Wave 1 Demo Runbook

[English documentation](../demo_runbook.md)

## 1. 一度だけ行う準備

1. 開発サーバで`npm install`と`npm run verify`を完了する。
2. `.env.development.example`を`.env.development`へコピーし、強い`DEVELOPMENT_PRIVATE_STATE_PASSWORD`を設定する。
3. `npm run cloudflare:deploy`でWorker、D1、GUI、Containerを作成し、出力URLの末尾へ`/proof`を付けて`MIDNIGHT_PROOF_SERVER_URL`へ設定する。
4. `npm run cloudflare:secret`でGateway tokenを登録し、同じ値を`.env`の`MIDNIGHT_PROOF_SERVER_TOKEN`へ設定する。
5. `secret:ingest`と`secret:attestation`を実行し、送信API用とAgent連携用に別々のSecretを登録する。
6. 開発サーバで`npm run development:wallet`を実行し、直後に`.env.development`を暗号化／オフラインbackupする。表示するPreprod addressへ[Faucet](https://midnight-tmnight-preprod.nethermind.dev)からtNIGHTを送る。
7. `npm run development:funding`で入金を確認する。
8. `npm run development:deploy`でContract deployを完了する。addressは`npm run cloudflare:config:contract`でWorker環境へ設定し、Piの`.env.device`にある`DEVICE_CONTRACT_ADDRESS`にも渡す。公開network名は`npm run cloudflare:config:network`で設定する。`.state/development/`は再開用cacheであってWallet backupではない。
9. `./package_archive.sh`を実行する。deployment addressは埋め込まず、Compile済みartifactだけをscriptが内部exportするため、`.device-release/archives/`に生成された`.tar.gz`と`.sha256`だけをPiへ転送する。

Piではchecksumを検証してarchiveを展開し、`.env.device.example`から`.env.device`を作成する。endpoint、ingestion資格情報、sensor設定だけを置き、rootの`./installer.sh --ingest-url https://<worker>/api/v1/readings`で導入する。`npm run device:wallet`で独立した運用Walletを`~/.midnight/midnight-cloudflare-demo/device-wallet/`へ初期化する。Compact、`npm run verify`、Proof benchmark、開発Wallet、Wrangler、Docker、Deploy commandは実行しない。強制再起動後は`sudo pi-forensics-report -1`で直前bootを確認する。

## 2. GUI接続

ローカルD1 migrationとWorker SPAを起動します。

```bash
npm run dashboard:dev
```

GUIはAgentのlocalhostへ接続しません。Workerは疑似計測値や確認済みTxを補完しないため、D1に実データがない場合は空状態を表示します。systemdサービスの既定センサーは`/sys/class/thermal/thermal_zone0/temp`です。

## 3. 2〜3分の審査デモ

1. 「プロジェクト概要」で最新値、最終更新、Edge Device種別、受信件数を見せる。
2. Online判定がlocalhost healthではなく`lastSeenAt`基準であることを説明する。
3. 「時系列データ」で外れ値と証明状態を絞り込む。
4. 「日次証明履歴」で処理待ちとMidnight確認済みを比較する。
5. 確認済みTxを押し、第三者検証ページを表示する。
6. `Merkle inclusion`と`Private range`が確認済みで、Raw値、threshold、Merkle pathが非公開であることを示す。
7. Dataset Tx、Verify Tx、block heightを見せ、`npm run device:status`のPublic Stateと照合する。
8. ヘッダーでSystem / English / 日本語を切り替え、再読込後も明示選択が保持されることを確認する。

## 4. QA証跡

```bash
npm run test -w @midnight-demo/shared
npm run test -w @midnight-demo/sensor-registry-contract
npm run test -w @midnight-demo/proof-gateway
```

Contract testを単独実行する前にmanaged artifactがない場合は`npm run contract:compile`を実行します。

| Test | Expected |
| --- | --- |
| Normal sample | inclusion/range成立、`verified = true` |
| Out of range | circuit assertionでreject |
| Raw sample tamper | commitment不一致でreject |
| Merkle path tamper | dataset root不一致でreject |

## 5. Destroy

```bash
npm run cloudflare:destroy
```

削除後はCloudflare Dashboardで`midnight-proof-gateway`が存在しないことを確認します。開発Walletの`.env.development` backupと、別系統のデバイスWallet backupを保持してからcache／dataを安全に消去してください。

## 6. Privacy説明

- 現在: CloudflareバックエンドとContainerをTrusted Cloudとして扱う。
- Production: Raw値を保持するクラウド領域を認証・暗号化し、公開Verification APIはAttestation情報だけを返す。
- Dual ledger: Private StateとPublic Stateをデータコピーで同期せず、ZK proofで整合性を接続する。
- Operator GUI: 認証された運用者だけがRaw時系列値を閲覧する。
- Public Verifier GUI: Raw値、threshold、nonce、Merkle pathを応答にも画面にも含めない。
