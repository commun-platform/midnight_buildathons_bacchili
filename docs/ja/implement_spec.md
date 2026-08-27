# 計測データ真贋性証明システム 実装仕様

[English documentation](../implement_spec.md)

## 1. 対象ユースケース

```text
Edge Device
  ↓ HTTPS telemetry
Cloudflare Worker ingestion API
  ↓
D1 time-series storage
  ↓ 1日1回
Daily Attestation Job
  ↓
Cloudflare Container Proof Server
  ↓
Raspberry PiのDevice Transaction Agent / 運用Wallet
  ↓
Midnight Preprod
  ↓
第三者Verification GUI
```

Device Collectorはセンサー値の送信とloopback health endpointに専念する。別packageのDevice Wallet Agentがremote trusted proverを使って継続的なMidnight Txを送る。Compact compile、proving key生成、全体検証、Contract deployは開発サーバだけで行い、Raspberry PiとBrowserでは実行しない。

Collector packageはCompact、Midnight Wallet／Contract SDK、Proof Provider、Wrangler、Dockerへ依存してはならない。Device Wallet packageはTx実行依存だけを持ち、compilerとdeploy commandを持たない。Installerはこの2つのdevice workspaceだけを導入し、ingestion設定不足時は明示的に失敗する。開発Walletはbackup可能な`.env.development`、デバイスWalletは`~/.midnight`配下に置き、`.env.device`へ復旧情報を入れない。

初期構成は`edge-temp-001`の1台だけとし、表示名は英語で`Temperature Sensor`、日本語で`温度センサー`とする。WorkerはD1が空または利用不能な場合でも疑似計測値を生成しない。

## 2. Cloudflare Worker

Workerは以下を同一オリジンで提供する。

- framework-free SPA assets
- Project / Device / Reading / Attestation参照API
- D1/Tursoを交換可能にする`SqlDatabase` Port
- Bearer認証付きtelemetry ingestion API
- Attestation Agentのclaim / result API
- D1 bindingとhourly scheduled handler
- 認証付きProof Server Container gateway

Vite、React、ブラウザ用Secret、Agent localhostへの直接接続は使用しない。

GUIの正本言語とfallbackは英語とする。初回はブラウザのシステム言語が日本語なら日本語、それ以外は英語を選び、System / English / 日本語の手動選択を`localStorage`へ保存する。

## 3. データモデル

| Entity | 主な項目 |
| --- | --- |
| Project | name、organization、timezone、expected interval |
| Device | device type、sensor type、unit、lastSeenAt、normal range |
| Reading | timestamp、value、outlier、local date、attestationId |
| Attestation | period、sample/expected/missing count、hour claims、proof status、日次Tx ID、Explorer用Tx Hash、block height |

Online状態は`lastSeenAt`と送信間隔から計算する。日次境界はProject timezoneで判定する。

APIとScheduled handlerは`SqlDatabase`だけに依存する。現在はD1 Adapterを使用し、将来のTurso/libSQL移行ではAdapterとFactoryだけを変更する。SQL migrationはSQLite/libSQL共通構文を維持する。

## 4. 日次Attestation

Scheduled handlerはProjectの現地時刻0時台に前日分を集計し、以下を作成する。

```text
Pending → Aggregating → Proving → Submitted → Confirmed / Failed
```

同じ現地日付のReadingは同じAttestationへ関連付ける。本番Contractは24件、96件、1,440件の固定日次Profileを持つ。Device CommitmentとPrivate Policy Commitmentを一度だけ登録し、以降は1日分を1つのProof Txで送信する。

## 5. ZKP Claim

本番日次回路が証明する内容は次のとおり。

> 署名対象の日次データセットに全Commitmentが含まれ、sequenceが連続し、各値がCommit済みPrivate Policyに対して正常または外れ値へ漏れなく一度だけ分類された。

Public Evidenceは`dayRoot`と24時間分のClaimを束ねる`hourClaimsRoot`を持つ。各Claimは`hourRoot`、sample/normal/anomaly count、`allWithinRange`を公開する。Raw値、nonce、Policy範囲は非公開である。時間RootへのEd25519署名は回路外で検証し、署名Bundle Hashをオンチェーン状態へ結合する。

外れ値理由は後から署名済みReason Hashとして追記する。変更は上書きせず`previousReasonHash`で連結し、説明本文はオフチェーンでCanonical Hashを再計算して検証する。

## 6. SPA画面

### プロジェクト概要

- 最新センサー値カードと最終更新日時
- Edge Device一覧、デバイス種別、接続状態
- 当日の受信、期待、欠損、外れ値件数
- 最新処理と直近のMidnight確認済みAttestation

### 時系列データ

- シンプルな折れ線グラフと表
- Device、sensor、outlier、proof status filter
- 各Readingの日次Attestation状態
- 確認済みまたは処理中のVerification画面リンク
- 確認済みTx、Block、ContractのPreprod Explorer外部リンク

### 日次証明履歴

- 対象日と処理状態
- sample / expected / missing / outlier count
- 日次Proof Txと、存在する場合は外れ値Reason Tx

### 第三者検証

- ZKP claim、24時間Claim、Device署名の検証結果
- Day Root、Hour Claims Root、Contract、Tx ID、block height
- Raw値、threshold、nonce、Private Stateが非公開であること

## 7. UI方針

1990年代の官公庁イントラネットを想起させる、紺色タイトルバー、灰色パネル、明示的な枠線、表中心のデザインとする。装飾性より情報階層、状態ラベル、キーボード操作、印刷時の可読性を優先する。

## 8. Privacy Boundary

- Operator API: Trusted Cloud内のRaw時系列値を扱う
- Public Verification API: Attestationの公開情報だけを返す
- Worker Secret: ingestion、attestation agent、proof gatewayで分離する
- Browser: Wallet mnemonic、Private State password、Bearer tokenを保持しない
- Midnight Public State: roots、commitments、period、count、signature bundle hash、verification resultのみ

## 9. 審査基準

| 審査 | 証跡 |
| --- | --- |
| Engineering | Worker API、D1、scheduled job、Container、Compact、Wallet SDK |
| QA | 正常、範囲外、Raw改ざん、Policy差替え、sequence欠損、署名改ざん、Reason Chain改ざん |
| Product | Edge telemetryから日次Privacy Attestationまでの一貫したUC |
| UX | 3画面＋第三者検証の単純なSPA |
| Communication | 処理状態、Privacy Boundary、日次Proof TxとReason Txを画面で説明 |

## 10. 実装フェーズと受入条件

1. **Data Plane**: Worker ingestion API、D1 schema、Project参照APIを実装する。
2. **Attestation Plane**: 現地日付の日次集計、Agent claim/result、Proof Container gatewayを実装する。
3. **Presentation Plane**: Worker Assetsでframework-free SPAを配信し、4画面をhash routeで切り替える。
4. **Privacy Plane**: operator data、Midnight Private State、public verification responseを分離する。

| 対象 | 自動テストの受入条件 |
| --- | --- |
| Public API | D1の実データまたは明示的なerrorを返し、生成値を返さない |
| Protected API | token未設定は503、不一致は401、正しいtokenだけ書き込みを許可する |
| Ingestion | ISO時刻を正規化し、登録済みtemperature/°Cとの一致とprivate normal rangeを検証する |
| Daily Job | Project timezoneの0時台だけ前日分を作り、Readingへ同じAttestation IDを設定する |
| Privacy | Public verification responseにRaw値、Policy範囲、nonce、Private Stateを含めない |
| Contract | 正常、分類完全性、Raw改ざん、Policy差替え、sequence欠損、Reason Chain改ざんを検証する |
| Delivery | 全workspaceのtest、typecheck、Worker dry-runが成功する |
| Host分離 | Pi用releaseに開発appとCompact sourceを含めず、導入時にCompile、proving key生成、Deploy、Docker、Wrangler、全workspace検証を一切呼ばない |
| Storage Adapter | `first`、`all`、変更行数、atomic batchの共通契約を満たす |

## 11. Storage移行

D1からTursoへの切替設計、schema互換ルール、cutover/rollback手順は[`storage_migration.md`](storage_migration.md)を正とする。APIレスポンス、GUI、Attestation Agentの契約は移行前後で変更しない。
