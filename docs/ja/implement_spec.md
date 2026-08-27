# 計測データ真贋性証明システム 実装仕様

[English](../implement_spec.md)

## 1. 対象ユースケース

```text
Edge温度センサー → Worker Ingestion API → D1時系列データ
                                             ↓ 現地日付ごとに1回
                                    pending Attestation record

準備済みの実Dataset → Device Wallet CLI → Remote Prover → Sensor Registry
                                               ↓
                                      Midnight Public State
```

Device Collectorは継続して摂氏温度を計測・送信し、loopback Health Endpointを提供します。別のDevice Wallet CLIが、明示的に指定された実DatasetをRemote Trusted Prover経由でMidnightへ送信します。Compact compile、proving key生成、repository全体の検証、Contract deployは開発サーバだけで実行し、Raspberry PiやBrowserでは実行しません。

WorkerにはAttestation Agent向けのclaim／result endpointがありますが、このrepositoryには常駐Agentが実装されていません。そのため、外部Agentが処理を引き継がない限り、CronはD1に`pending` recordを作成した時点で停止します。

## 2. Runtime Component

Cloudflare Workerは同一Originで以下を提供します。

- framework-freeの日英SPA
- Project、Device、Reading、Attestationの参照API
- Bearer認証付き温度Ingestion API
- 外部Agent向けのBearer認証付きAttestation claim／result API
- hourly scheduled handler
- 認証付きProof Server Container Gateway

GUIへWallet Credential、Bearer Token、Private Threshold、Raw Proof Input、Agent Control Endpointを公開してはいけません。

Collector packageはCompact、Midnight Wallet／Contract SDK、Proof Provider、Wrangler、Dockerへ依存してはなりません。Device Wallet packageはTransaction Runtimeの依存を含められますが、CompilerやDeploy commandを持ちません。Installerが導入できるのは、この2つのDevice Workspaceだけです。Ingestion設定が不足している場合は安全側に失敗します。開発WalletはBackup可能な`.env.development`、Device Walletは`~/.midnight`配下へ置き、`.env.device`には保存しません。

## 3. 言語動作

- 正本言語とFallbackは英語です。
- 初回表示では`navigator.languages`に`ja`が含まれる場合だけ日本語を選び、それ以外は英語を選びます。
- System、English、日本語を手動選択でき、明示した選択は`localStorage`へ保存します。
- ProjectとDeviceの表示名は英語のPrimary Fieldとnullableな日本語Fieldを持ちます。
- 正本ドキュメントはrepository rootと`docs/`、日本語訳は`docs/ja/`に置きます。

## 4. データモデル

| Entity | 主な項目 |
| --- | --- |
| Project | 多言語name／organization、timezone、expected interval |
| Device | 多言語name／type、`temperature`、`°C`、last seen、Trusted Cloud内のnormal range |
| Reading | timestamp、value、local date、outlier flag、attestation ID |
| Attestation | period、count、status、root、Dataset／Verification Tx ID、Explorer Transaction Hash、Block Height |

初期構成は`edge-temp-001`の1台だけで、**Temperature Sensor**または**温度センサー**と表示します。Migrationは過去のTest Reading、Attestation、未使用Device定義を削除します。D1が空または利用不能な場合でも、APIは生成したReadingへ置き換えません。

APIとScheduled Codeは`SqlDatabase`だけに依存します。現在のAdapterはD1です。将来のTurso／libSQL Adapterも同じInterfaceとAPI Responseを維持する必要があります。

## 5. Ingestion

`POST /api/v1/readings`は`INGEST_API_TOKEN`を必須とし、`projectId`、`deviceId`、`sensorType`、`value`、`unit`、ISO 8601形式の`recordedAt`を受け取ります。Deviceは指定Projectへ登録済みで、`sensorType`と`unit`は登録済みの`temperature`と`°C`に完全一致する必要があります。WorkerはProjectの現地日付を導出し、Trusted Cloud内のNormal Rangeを評価して、1つのD1 batchでReadingを保存し`lastSeenAt`を更新します。

## 6. Daily Attestation

Projectの現地時刻0時台に、Scheduled Handlerは前日分のReadingを数え、存在しなければ決定的なAttestation recordを1件作成し、未割当のReadingを関連付けます。

```text
Pending → Aggregating → Proving → Submitted → Confirmed / Failed
```

実装済みのCron経路は`pending`で終了します。`POST /api/internal/attestations/claim`は最古のpending recordをatomicに`aggregating`へ移し、`POST /api/internal/attestations/:id/result`は以降のstatusとTransaction Metadataを受け取ります。どちらも`ATTESTATION_API_TOKEN`を必要とします。これらのAPI自体はProof Inputの構築、Device Walletの呼び出し、Transaction確認、Midnight照会を行いません。

## 7. 運用Proof Claim

Deploy対象の`sensor-registry` Contractには、2つのTransaction Circuitがあります。

- `registerDataset`はMerkle Root、Device Commitment、期間、Sample Count、Schema Versionを公開します。
- `verifySensorValue`は選択した1つのSensor LeafとNonceをPrivateに開き、深さ11のMerkle Pathを再計算し、その温度をPrivateな最小値・最大値と比較します。

検査に成功すると、DatasetのPublicな`verified` flagとContractのGlobal Verification Resultがtrueになります。運用Circuitが証明するのは選択値の包含と範囲であり、全日分の完全性や全Readingの分類ではありません。

`device:submit`は`PreparedDataset`または実際の`SensorRecord[]`を受け取ります。配列Inputは`--min`、`--max`、`--selected-index`でLocalに準備し、`--verify-only`を指定すると登録を省略します。準備済みPrivate DataはDevice Wallet Directory配下で暗号化します。

別の`daily-attestation` GeneratorとBenchmarkは、24／96／1,440 sampleの固定Profile、全日分のRoot、Hourly Claim、回路外Ed25519 Evidence、追記型Reason Hashを実装します。これらは開発専用の実験であり、Device FirmwareやWorker Lifecycleでは使用しません。

## 8. SPA画面

- **Project Overview:** 最新の実Reading、最終更新、1台のEdge Device、収集件数、現在とconfirmedのAttestation。
- **Time-Series Data:** chart、table、outlier／status filter、関連するTransaction状態。
- **Daily Proof History:** 期間、件数、処理状態、Dataset Tx、Verify Tx。
- **Third-Party Verification:** AgentがD1へ報告したstatus、root、Contract設定、Transaction ID、Block Height、対応するPreprod Explorer Link、Privacy Boundary。

Visual Styleは1990年代の官公庁システムを想起させる、高Contrastの紺色Title Bar、灰色Panel、明示的なBorder、Table、Keyboard Control、印刷可能なTypographyとします。Browserは現在、Midnight Indexerを照会せず、Proof／Signatureを独立して検証しません。TrustedなAttestation Result APIを通じて保存されたPublic Fieldを表示します。

## 9. 受入条件

| 対象 | 要件 |
| --- | --- |
| Public API | D1 DataまたはErrorを返し、生成値を返さない |
| Ingestion | 認証なし、未知のDevice、Sensor／Unit不一致を拒否する |
| Scheduling | Project Timezoneを使い、pending recordを作成し、前日のReadingを関連付ける |
| Privacy | Public VerificationからRaw値、Policy範囲、Nonce、Private Stateを除外する |
| 運用Contract | 未知Root、重複登録、選択Leaf改ざん、Merkle Path改ざん、無効な範囲、範囲外の選択値を拒否する |
| Daily Benchmark | 全日分類、署名、Reason Chain Logicを別途試験し、運用Contractとして扱わない |
| Localization | 英語Fallback、日本語System検出、手動選択の永続化 |
| Delivery | 開発Host上の`npm run verify`で`sensor-registry`のcompile／test、全Workspaceのtypecheck、Worker dry-runを実行する。Daily Profileには明示的な`npm run attestation:compile`が必要 |
| Host分離 | Pi用Releaseに開発AppとCompact Sourceを含めず、導入時にCompile、Proving Key生成、Deploy、Docker、Wrangler、Repository全体のVerifyを呼ばない |
| 残る連携 | 外部Attestation Agent、D1からPrepared Datasetへの変換、自動Result報告／確認、Browserでの独立検証、Turso Adapter |
