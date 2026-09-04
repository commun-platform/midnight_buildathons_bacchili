# 開発環境

[English](../../operations/development_environment.md)

本書は開発専用のSetup、Compile、検証、Deploy準備、配布物生成を扱います。Edge Deviceへの導入とRuntime運用は[Device Firmware](device_firmware.md)、End-to-Endの実行順序は[Deploy・Review Runbook](demo_runbook.md)へ分離しています。

## 前提条件

- Node.js `22.15.0`以上
- Compact Developer Tools `0.5.2`、toolchain `0.31.1`
- 認証済みWrangler Access
- Deploy用のfund済みMidnight Preprod開発Wallet

## 初期Setupと検証

```bash
npm ci
compact update 0.31.1
cp tools/midnight-operator/.env.development.example \
  tools/midnight-operator/.env.development
cp backend/cloudflare/deployment/.dev.vars.example \
  backend/cloudflare/deployment/.dev.vars
npm run contract:compile
npm run verify
```

Contract ArtifactとProving Keyは開発環境で生成し、Edge Deviceでは生成しません。開発Walletの復旧元は`tools/midnight-operator/.env.development`です。暗号化またはOfflineでBackupしてください。`.state/development/`は同期・Deploy再開用Cacheであり、Wallet Backupではありません。旧混在Layoutから移行する場合は、新Walletを初期化する前に`npm run development:wallet:migrate`を実行します。

## 開発専用Benchmark Profile

実験用固定日次ProfileはBenchmark CLIだけで使います。`npm run verify`、Device Firmware、運用`sensor-registry`送信経路には含まれません。

```bash
ATTESTATION_SAMPLE_COUNTS=24 npm run attestation:compile
```

実測値と標準1,440 Reading手順は[Cost Benchmark](../implementation/cost_benchmark.md)へ記録します。24／96件Runは固定回路の同値性Evidenceであり、別Cost Profileではありません。

## DeployとDevice Release

```bash
npm run cloudflare:deploy
npm run development:wallet
npm run development:funding
npm run development:deploy:cloudflare -- \
  --device-authority <public-32-byte-hex> \
  --policy-id <new-policy-id> \
  --assignment-id <new-assignment-id>
npm run cloudflare:config:network
npm run cloudflare:config:contract
npm run development:status
./edge-device/release/package_archive.sh
```

Contract置換時は、D1監査Mirrorに存在しないIDを使用します。以前のDeployから保持されているPolicy IDまたは
Assignment IDと衝突する場合、Proof Capacityを取得する前にCommandが停止します。

Network LabelとDeploy済みContract AddressはWorker環境Bindingであり、Commitしません。`edge-device/release/package_archive.sh`はCompile済みArtifactをExportし、秘密情報を含まない運用Archiveを生成します。Edge Deviceへ渡すのは生成ArchiveとChecksumだけです。`tools/midnight-operator/.env.development`、`.dev.vars`、`.state/development/`、開発Wallet復旧情報、Private開発Inputは転送しません。

Device登録、Policy Assignment、監督下Reviewの完全な順序は[Deploy・Review Runbook](demo_runbook.md)を参照してください。

## Sponsor Wallet Runtime・停止復旧の実測

2026-08-29にNode.js `22.15.0`、Wallet SDK `1.2.0`、Midnight.js `4.1.1`、Wrangler `4.127.0`、
Cloudflare Containers SDK `0.3.7`で復旧経路を実測しました。Local Testは秘密ではない固定Test Seed、同期中の
Preprod Wallet、R2互換の非公開HTTP Receiverを使用しました。Production Containerの起動時間やImage Pull
時間の測定ではありません。

| 処理 | 実測結果 |
| --- | --- |
| 増分Diagnostic Image Overlay Build | Wall 0.78秒、User 0.08秒、System 0.07秒、最大RSS 63,616 KiB |
| 同期中の最新State Serialize | 6 ms |
| Checkpoint暗号化・Upload | 87,331 bytes、Upload 9 ms |
| Wallet SDK停止 | 15 ms |
| `docker stop`全体 | 0.45秒、Exit Code 0、OOM Killなし |

同じVersionを使い、2026-08-29にCloudflare Container上でも実測しました。`standard-4`は成立性確認のために
意図的に余裕を持たせた基準であり、本番の最小推奨Sizeではありません。

| Cloudflare処理 | 実測結果 |
| --- | --- |
| `basic`初回Replay | 割当0.25 vCPU中0.241～0.244 core（96.4～97.6%）、RSS 212,576～215,864 KiB、Health Probeが飢餓状態 |
| `standard-4`割当 | 4 vCPU、Memory 12 GiB、Disk 20 GB、Private Networkの1 instance |
| `standard-4`初回Replay | 1.00～1.15 CPU core、RSS約295～306 MB、CPU Throttlingは観測されず |
| Preprod Replay中のHealth Supervisor | `/health`を5並列実行して各0.851～1.151 ms、すべてHTTP 200 |
| Wallet Facade初期化 | 0.901秒 |
| Preprod WebSocket確立 | 1.025～1.260秒 |
| Shielded／Unshielded Base同期 | 192.711秒、Unshielded Index 576,777・Shielded Index 1,463,245で完了 |
| `standard-4`設定のみのDeploy | Wall 16.98秒、Local最大RSS 382,336 KiB |
| Supervisor実装後のRepository全体`npm run verify` | Wall 58.32秒、User 59.38秒、System 12.15秒、最大RSS 865,416 KiB、全Check成功 |
| 同Verify内のSponsor Wallet Container Image Build | Wall 22.9秒 |

2026-08-31にSponsor Walletの割当だけを`standard-2`へ変更し、同じSoftware Versionと暗号化R2 Checkpointで
Production相当のWarm Restoreを再計測しました。

| `standard-2`処理 | 実測結果 |
| --- | --- |
| 割当 | 1 vCPU、Memory 6 GiB、Disk 12 GB、Private Networkの1 instance |
| Restore対象の暗号化R2 Checkpoint | 5,363,987 bytes、2026-08-31 06:44:32 UTC時点の`ready` Checkpoint |
| Checkpoint RestoreからWallet `ready` | Initialization開始から完了まで85.536秒 |
| Initialization CPU | 1.028秒のDiagnostic Sampleで0.975 core、Throttling Eventなし |
| Initialization Process Memory | Wallet Child RSS約299～354 MB、Supervisor RSS 94,976 KiB |
| Initialization中のHealth | Wallet Status Probeが8回連続Timeoutし49.842秒Stale。外側Supervisor `/health`は3～7 msでHTTP 200を維持 |
| Restore後のCheckpoint Cache | 5,363,987 bytesを1.083秒で保存 |
| Ready後最初の2回のCron確認 | `ready`、Warmup 0.760～0.789秒、Supervisor `healthy`、連続Probe失敗0、使用可能DUST Coinあり |
| Resize後のAPI Regression | Proof Gateway 111件、Sponsor Wallet 42件が成功。Sponsor／Device登録／Policy登録のActive Backlogなし |

MemoryはBottle Neckではありません。Wallet SDKはRestoreと追随中に約1 CPU coreを必要とするため、1 vCPUの
`standard-2`ではCPUを使い切り、Cached Wallet Statusが一時的にStaleになります。一方、分離したSupervisorは
HTTP 200を返し続け、Queue JobはWalletが`ready`になるまで保留されます。同期完了後は`standard-2`で1分ごとの
Health確認を正常に維持しました。Wave 1ではCostを優先した実測Sizeとして`standard-2`を採用します。
ProductionのRestart SLOで85.536秒のWarm Restoreまたは一時的なWallet `degraded`を許容できない場合は、
`standard-4`を高速復旧Optionとして残します。

改修前のNetwork不調条件では220,225-byte Checkpointを10 msで退避できましたが、SDKのWebSocket停止がLocalの
60秒停止期限までに完了しませんでした。このため実装はState退避を最初に行い、その後のSDK停止待ちを45秒へ
制限します。Serialize待ちと実行中Mutation待ちにも個別の上限があります。CloudflareのSignal停止ではこの即時
経路を使い、Signalを処理できないProcessには同期中5分間隔のCheckpointを復旧点として残します。
