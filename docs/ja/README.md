# BACCHIRI!━━Verifiable Measurement Layer

> センサー値を見せず、しきい値の範囲内かどうかを証明する。

## 審査成果物

[Wave 1審査成果物設計](submission/deliverables_plan.md)に、必須提出物、審査配点、スライド、実演、検証証拠、制作順序、完了条件をまとめています。

[English documentation](../../README.md)

![センサー値を開示せず、しきい値の範囲内かどうかを示す](assets/review/privacy-value-proposition-ja.png)

実装基準Commit `af90ad8`は、8つの運用回路のCompile、496件の自動Test、全構成領域のType Check／Build、API SCT、22 CheckpointのGUI SCT、Cloudflare配備前検査に成功しています。現行8回路Contractは2026-09-03にMidnight Preprodへ配備済みです。Wallet不要のManaged API経路と認証済み現場Device経路の両方が、統合Server Walletを通じて確定済みTXへ到達し、公開Verification MCPからD1やPrivate Inputを使わず再検証できました。以前の日付付きTXは旧Schemaの履歴Evidenceとして分離します。

| 審査成果物 | 文書 |
| --- | --- |
| 提出文 | [Wave 1提出文](submission/submission_copy.md) |
| 日本語Technical Reference | [PPTX](submission/deck/bacchiri-verifiable-measurement-layer-wave1-ja.pptx)・[PDF](submission/deck/bacchiri-verifiable-measurement-layer-wave1-ja.pdf) — 提出対象は最終英語9枚 |
| Cloudflare UC別技術補足 | [説明](architecture/cloudflare_use_cases.md)・[PPTX](submission/deck/cloudflare-use-cases-ja.pptx)・[PDF](submission/deck/cloudflare-use-cases-ja.pdf) |
| 主張と検証証拠 | [証拠対応表](submission/evidence_matrix.md) |
| 現行リリース補足 | [撮影後の実装・Preprod Evidence](submission/current_release_addendum.md) |
| Wave進捗 | [Wave 1進捗](submission/wave1_progress.md) |
| 想定質問 | [審査員向けQ&A](submission/judge_qa.md) |
| 英語デモ動画 | `bacchiri-demo-pitch-en.mp4`（2分18秒）を作成済み、提出用公開URL待ち — [録画台本と撮影記録](submission/demo_script.md) |

## 製品と最初のユースケース

顧客へ提供する価値はシンプルです。**センサー値を第三者に見せず、登録済みしきい値の範囲内かどうかを証明します**。

BACCHIRI!━━Verifiable Measurement Layerは、管理画面、CSV、帳票、クラウドシステムを使う既存の計測業務へ、値を隠したまま判定を確認できる証明層を追加します。計測機器や既存システムを置き換えません。

最初の事業ユースケースとして協議しているのは、建設現場の計測結果検証です。騒音、振動、温度などの帳票は、機器提供会社、レンタル会社、施工会社、発注者、監査者など複数組織をまたぎます。Wave 1で検証済みなのは温度計測の経路です。ほかの計測種別には、対応するしきい値定義、入力形式、検査規則の追加が必要であり、現行機能としては主張しません。

既存の計測機器と販売・レンタル網を使う現場実証に向け、業界事業者との協議を進めています。これは事業化の進捗であり、完了済みの技術検証ではありません。

このシステムの要点は、**生のセンサー値を公開せず、提出された時間別の最小値・最大値が、運用開始前に登録したしきい値の範囲内かどうかだけを証明する**ことです。Wave 1の主要審査経路では、ユーザー認可済みBrowser Clientが疑似計測元として動き、Raw値とPrivate Openingを保持し、上限付き時間別Summaryを認可済み運用者Workflowへ送ります。Trustedな管理Backendはその制限付きSummaryを保存して証明処理を行います。第三者が確認する基準は、Midnightに記録された公開しきい値、証明対象、確定済み判定です。現場RuntimeはWave 2へ向けたIntegration Evidenceであり、主要審査経路ではありません。

![センサー値を1時間ごとの最小値・最大値へまとめ、値を隠したまま判定する](assets/review/hourly-extrema-zkp-ja.png)

審査時は、まず[正確に証明すること・しないこと](architecture/wave1_spec.md#3-正確なproof-claimと非claim)、次に[システム構成](architecture/system_architecture.md)、最後に[日次運用手順](operations/demo_runbook.md)を確認してください。

文書は目的別に分類しています。

審査提出用の提出文、日英スライド、検証証拠、Wave 1進捗、提出前確認、Q&A、最終画面の録画台本は[submission/](submission/)に集約しています。

| 分類 | 内容 |
| --- | --- |
| [`architecture/`](architecture/) | 製品仕様、4領域の構成、Cloudflare UC別構成、24個の時間枠を使う日次証明 |
| [`security/`](security/) | 非公開情報の境界、鍵と認証、複数デバイスの管理 |
| [`operations/`](operations/) | 開発環境、配備・確認手順、デバイス用ソフトウェアの導入・復旧 |
| [`implementation/`](implementation/) | 仕様と実装の対応、8つの運用ZK回路、将来機能バックログ、DUST送信手数料のスポンサー、ウォレット同期中のトランザクション保留、費用実測、保存先の移行設計 |

実装済みの運用可視化、Wallet同期、処理件数、顧客UCのAPI証跡と、Wave 2で残る運用強化は[システム運用ダッシュボード仕様](architecture/wave2_system_operations.md)にまとめています。
[MCPのセキュリティ境界](architecture/mcp_security_boundary.md)には、非公開サポートMCPと公開TX検証MCPを別Workerへ分離する構成、認証認可、返却禁止情報、配備順序をまとめています。
[Sponsor Wallet日次処理](operations/sponsor_wallet_operating_hours.md)には、24時間受付、JST 02:00の締切バッチ、依存順制御、安全な停止、切替コマンドをまとめています。

日本語のスライド図版は[`assets/review/`](assets/review/)、文書専用図版は[`assets/guides/`](assets/guides/)に集約し、英語図版とは分離しています。

本リポジトリは、Wave 1のCore Proof PoCを実装します。主要な審査経路では、ユーザーが認可したブラウザクライアントを疑似計測元として使い、疑似の日次計測データと、計測期間より前に登録した判定条件との関係を証明します。Midnightには元の値ではなく、公開判定条件、証明対象、判定結果、取引記録を残します。現場側Runtimeの補助実装も含みますが、長期間の自律運用はWave 2の目標であり、Wave 1の主要Claimではありません。

運用コントラクト`sensor-registry`は、UTCの24個の時間帯それぞれに「しきい値以内／範囲外／計測なし」を公開し、その判定が非公開の最小値・最大値と一致することを証明します。日次の真偽値は総合結果として残します。実際の測定値は公開しません。この証明だけでは、センサー自体の正確さ、連続して測定した事実、測定漏れがないこと、デバイス側の集計が正しいことまでは保証しません。

| 第三者に表示する項目 | 何を示すか |
| --- | --- |
| 計測日 | `YYYY-MM-DD`。Projectへ事前登録した固定UTC Offsetと開始時刻から24時間を決めます。 |
| 時間帯別結果 | UTCの1時間ごとに、しきい値以内／範囲外／計測なしを表示します。 |
| 適用しきい値 | 下限・上限・単位・スケール・バージョン・有効期間です。 |
| 証明対象 | `deviceCommitment`。証明としきい値の適用設定を同じ仮名デバイスに結び付けます。 |

TX hashを貼り付けると、Browserは成功したMidnight TX、そのBlock、該当BlockのContract State差分からこれらを取得します。この検証経路はD1、Wallet、Private Proof Inputを必要としません。

## 基本用語

| 用語 | 本リポジトリでの意味 |
| --- | --- |
| Wave 1 | `wave1_spec.md`で定義する、現在のCore Proof PoC範囲です。 |
| Cloudflare | API、D1データベース、証明処理の受付、画面、証明生成サーバーを動かすバックエンドです。現状では信頼対象です。 |
| Midnight | コントラクトの取引を検証し、しきい値・対象デバイス・判定結果などの公開記録を保持するネットワークです。 |
| エッジデバイス | センサー収集、API認証、Midnight取引への署名を行う現場側の実行環境です。 |
| 生の測定値 | 日時、温度、湿度を含む個々の値です。Wave 1審査経路ではBrowser Privateな計測元に、補助的な現場経路ではLocalに保持します。 |
| 1時間ごとの集計／状態変化 | 1時間単位の要約と、正常・異常が切り替わった時点の通知です。個々の測定値そのものではありません。 |
| 1日分の非公開入力 | 観測済みまたは計測なしの24個の時間枠です。観測済みの枠には最小値、最大値、測定件数が入ります。 |
| 時間帯別結果 | UTCの1時間に対する公開状態です。しきい値以内／範囲外／計測なしのいずれかで、最小値・最大値は公開しません。 |
| コミットメント | 1日分の非公開入力と証明用乱数を、元の値を逆算できない形で結び付けた値です。 |
| しきい値 | 判定方法、上下限、単位、センサー種別、版番号を含む公開設定です。運用開始前にMidnightへ登録し、証明時にデバイスが別の値へ変更することはできません。 |
| デバイスへのしきい値設定 | どのデバイスにどのしきい値を適用するかと、その有効期間を運用開始前に登録したものです。 |
| ゼロ知識証明 | 各時間の最小値・最大値と証明用乱数を公開せず、観測された全時間が登録済みしきい値を満たすか検査する証明です。 |
| Compact／`sensor-registry` | CompactはMidnightのコントラクト言語です。`sensor-registry`は本リポジトリの運用コントラクトです。 |
| Cloudflare D1 | デバイス登録、APIセッション、集計、証明処理、取引状態を保存するSQLデータベースです。生の測定値は保存しません。 |
| 証明処理 | 非公開入力の送信許可から、証明生成、取引結果までを管理する一連の処理です。 |
| 証明生成サーバー | コントラクト用の証明を生成するCloudflare上のサーバーです。デバイスの署名鍵は持ちません。 |
| API認証鍵／Midnight取引署名鍵 | 用途が異なる2つの鍵です。前者はCloudflare APIへの認証、後者はデバイスがMidnight取引を承認したことの署名に使います。 |
| Server Wallet／Sponsor Role | 1つのBackend Midnight Walletが同期状態を共有し、管理・Managed Attestor処理を直列化し、適格なDevice Bind済みTXへDUSTだけを追加します。論理認可Secretは分離します。 |
| 証明記録 | 公開する判定内容と、それを裏付ける証明・取引をまとめた記録です。別コントラクト`daily-attestation`は費用実験用であり、通常の運用経路ではありません。 |

## 推奨する読書順

| 順序 | 文書 | 目的 |
| --- | --- | --- |
| 1 | 本README | 製品目的、証明内容、リポジトリ構成、現在状態を把握します。 |
| 2 | [Wave 1仕様](architecture/wave1_spec.md)、[3 Waveロードマップ](architecture/three_wave_roadmap.md)、[複数デバイスの登録](security/device_registry.md) | 現行PoC、将来到達点、On-chain Authority境界を分けて確認します。 |
| 3 | [システム構成](architecture/system_architecture.md) | 各構成要素とデータ保存先を確認します。 |
| 4 | [非公開情報の境界](security/private_spec.md) | 非公開入力、管理者向け情報、第三者への公開情報を区別します。 |
| 5 | [仕様と実装の対応](implementation/implement_spec.md)、[GUI操作と処理場所](implementation/gui_action_reference.md)、[ZK回路仕様](implementation/zk_circuit_spec.md)、[運用日の境界](architecture/operational_day_boundary.md)、[TX hashによる第三者検証](implementation/transaction_hash_verification.md)、[送信手数料のスポンサー](implementation/fee_sponsorship.md) | 設計とコードの対応、固定24 Slotの開始時刻、非公開の24時間証明が公開時間帯別結果になる仕組み、D1に依存しないビューワの構築手順、DUSTだけを負担する権限を確認します。 |
| 6 | [デバイス認証](security/device_authentication.md)と[デバイス用ソフトウェア](operations/device_firmware.md) | 初期登録、APIセッション、導入、復旧を理解します。 |
| 7 | [開発環境](operations/development_environment.md)と[実演手順](operations/demo_runbook.md) | 準備後、順番に配備して動作確認します。 |
| 8 | [費用実測](implementation/cost_benchmark.md) | 標準1,440件／日の実測と10,000台の計画値を確認します。 |
| 9 | [将来機能バックログ](implementation/future_features.md) | コントラクトを先に変更する項目と、後から追加する運用機能を区別します。 |
| 10 | [保存先の移行設計](implementation/storage_migration.md) | 将来D1からTursoへ切り替える設計を確認します。 |

## システム境界の要約

![エッジデバイス、画面、バックエンド、Midnightの責任分担](assets/review/wave1-system-overview-ja.png)

この図には補助的な現場Runtime境界も含みます。Wave 1の主要審査経路は、Frontendを疑似計測元として使い、
Trusted Backend、Midnightへ進みます。現場の自律運用と、運用者・第三者・System Operator Applicationの本番分離は
Wave 2の到達点です。

| 領域 | 主な責任 | 明確な境界 |
| --- | --- | --- |
| エッジデバイス | センサー収集、生の測定値の保持、24時間分の集計、API認証、Midnight取引への署名 | 生の測定値、時間別の最小値・最大値、証明用入力、署名鍵を内部に保持 |
| 画面 | User認可済み疑似計測Workflowと第三者Public View | 疑似CaptureをBrowser Private Stateに保持し、第三者ViewへはRedacted Public Evidenceだけを表示 |
| バックエンド | 認証、API入力検査、処理状態保存、同時実行数制限、証明生成、管理、Managed Attestation、Fee Sponsorship | 証明生成中は非公開入力を扱う信頼対象。管理、Managed API認可、DUSTだけを付与するSponsorは別の論理Authorityで拘束し、Sponsor RoleはDevice Callを変更・代理認可できない。 |
| Midnight | しきい値、対象デバイス、コミットメント、確定済み判定の記録 | 第三者が確認する公開記録を保持し、生のセンサー値は保存しない |

詳細な信頼境界とデータの流れは[システム構成](architecture/system_architecture.md)を参照してください。

## Midnightとの連携

運用コントラクトは`sensor-registry`で、現在の日次提出処理は`submitDailyAttestation`です。コントラクトは運用前に登録した公開しきい値と対象デバイスを読み込み、24個の非公開時間枠を検査し、各時間帯の判定と日次の総合結果をMidnightへ記録します。User管理Accountまたは現場Transaction AgentはFeeなしCallを認可でき、Managed API Modeは別のManaged Attestor Authorityを使います。統合Server Walletはこれらの処理を直列化し、適格なCallへDUSTだけを追加して送信します。Sponsor RoleはDevice Contract Authority Proofを生成したり、認可済み内容を変更したりできません。

ブラウザには、ユーザー管理のMidnight Accountを使う疑似計測Workflow、運用者向けの処理状況、第三者向けの公開画面があります。TX hashを貼り付けると、確定済みRecordを特定し、Public Midnight Indexerへ直接問い合わせます。同じTX／BlockのContract Ledgerから運用日／登録済み境界、24個の時間帯別結果、適用しきい値／有効期間、Device Commitmentを照合します。Raw Sensor値やPrivate Openingは使いません。Browser内でCompact Proof Verifierを再実行するのではなく、MidnightがTX受理時に検証した公開Stateを確認します。

## モノレポの境界

最上位ディレクトリだけで、コードの実行場所または所有者を判断できる構成です。開発端末だけで使うツールを配備サービスとして扱わず、同じサーバー実装をローカル用に複製しません。

```text
frontend/
  verification-portal/               Browser Bundle・Worker配信Static Assets
backend/
  cloudflare/
    proof-gateway-worker/             Worker API・Queue Consumer・Storage Adapter
    support-mcp-worker/               Access保護されたカスタマーサポートMCP
    verification-mcp-worker/          公開Midnight TX検証MCP
    sponsor-wallet-container/         Fee専用Midnight Wallet Runtime
    d1-schema/migrations/             Backend永続Schemaの履歴
    deployment/wrangler.jsonc         Worker・D1・R2・Queue・Container・Assets
edge-device/
  sensor-collector/                   温度収集・1時間集計・Local Health
  device-identity/                    P-256 Identity・短命API Session
  midnight-transaction-agent/         Device承認・Proof Input・Submit・Status
  release/                            Archive生成・Installer・Rollback・検証
  diagnostics/pi-forensics/           Device Firmware同梱の任意診断機能
midnight/
  contracts/sensor-registry/          運用Compact Contract・Witness・Simulator Test
  experiments/daily-attestation-cost/ 開発専用の固定Profile費用実験
shared/
  measurement-protocol/               Commitment・集計・Provisioning Message
  public-attestation-verifier/        D1非依存の公開Midnight TX Decode・検証
tools/
  midnight-operator/                  Local開発Wallet・Midnight管理
  cloudflare-admin/                   Local Provisioning・Secret設定Command
  benchmarks/                         Local Compile・運用費用の計測
  submission-media/                   Slide・PDF・Still・Demo Capture生成
  repository-checks/                  Host境界・Portability検査
tests/
  system/dashboard-workflow/          境界横断Browser SCT
docs/                                  英語の正本文書。日本語訳はdocs/ja/
```

Unit Testは所有するComponentの近くに置き、複数境界を通すCompatibility Testだけを`tests/system`へ置きます。`tools/`は開発端末でのみ動作し、Device FirmwareとContainer Imageには入りません。`edge-device/release/package_archive.sh`は、Edge Runtime、必要なShared Protocol、検証済みContract Artifact、診断機能だけを含むInstaller-rooted Archiveを生成します。

## 運用手順

個別の運用手順は、概要文書から次へ分離しています。

| 手順 | 文書 |
| --- | --- |
| 開発前提条件、コンパイル、検証、配布物の生成 | [開発環境](operations/development_environment.md) |
| エッジデバイス用パッケージ、導入、更新、復旧、ウォレット、稼働確認 | [デバイス用ソフトウェア](operations/device_firmware.md) |
| 配備、初期登録、証明処理、取引、確認の実行順序 | [配備・確認手順](operations/demo_runbook.md) |
| DUST送信手数料、ウォレットの非同期同期、トランザクション保留、再試行 | [送信手数料のスポンサー](implementation/fee_sponsorship.md) |
| コンパイルと証明処理の実測、費用計画 | [費用実測](implementation/cost_benchmark.md) |

## 審査員向けの短時間検証

ソースコードの検証には、デバイスの秘密情報やMidnight事前公開ネットワーク用ウォレットは不要です。

```bash
npm ci
npm run contract:compile
TMPDIR=/tmp npm run verify
```

期待結果は、運用する8つの証明回路のコンパイル、496件の自動テスト、全構成領域の型検査とビルド、Cloudflareへの配備前検査の成功です。これは現在のソースコードを検証する手順であり、日付付きMidnight取引を再配備・再実行するものではありません。画面、デバイス初期登録、証明生成、署名、取引を含む実演は[配備・確認手順](operations/demo_runbook.md)に従います。

## 現在の連携状況

- 現行8回路ContractはPreprodで稼働しています。登録済みCloud APIと認証済み現場Deviceから、それぞれ1,440件の1日分を統合Server Wallet経由で送信し、2026-09-05に両方のTX hashを公開Verification MCPで再確認しました。詳細は[現行リリース証拠](submission/current_release_addendum.md)を参照してください。
- Wallet不要のManaged API Modeは、完了済みの固定運用日を取得・検査して24個のPrivate Slotへ集約し、同じProof／公開検証モデルを再利用します。上流API値の物理的真正性は主張しません。
- Access保護された運用Console、Redact済み顧客操作Audit、日次Metric、日本語Discord障害／Receipt、非公開Support MCPは実装済みの基盤です。Wave 2ではPartner運用期間の検証、組織／Role分離、監査付き復旧操作、長期安定運用を完成させます。
- 公開Verification MCPは運用DBやRuntime Bindingを持たず、TX hash検証Toolを1つだけ公開します。結果はD1ではなくPublic Midnight Indexerから取得します。
- 日次提出には運用担当者の操作が必要です。`device:submit`は証明処理を要求して状態を確認しますが、デバイス用ウォレットは常時自動送信する仕組みではありません。
- 24件、96件、1,440件の入力で同じ固定形状の回路を使えること、時刻情報への署名、外れ値理由を追記保存する仕組みは開発用実験として実装済みです。
- ブラウザはPublic Midnight Indexerへ直接問い合わせ、同じTX／BlockのContract StateからCommitment、Result、Policy、Device-bound Assignmentを照合します。Browser内でZK Verifierを再実行したりWitnessを開示したりはしません。

## 3段階の展開

[製品・事業ロードマップ](architecture/three_wave_roadmap.md)は、次の成果順に進めます。

![3 Wave製品・事業ロードマップ](assets/review/three-wave-roadmap-ja.png)

- Wave 1 — Core Proof PoC：疑似計測元と審査用統合画面で、非公開証明の中核価値を検証します。
- Wave 2 — Operational Partner Pilot：実際の現場計測システムを接続して日次処理を自律化し、組織／Roleを分離し、実装済みの監査、解析、監視、Alert、Support MCP、復旧、運用Console基盤を有償Partner Pilotで強化します。
- Wave 3 — Trust Minimization and PMF：ハードウェア保護Identityと来歴を導入し、複数組織・複数現場で商用運用して、継続売上、契約更新、利用拡大、持続可能なUnit Economicsを検証します。

一部の運用基盤は先行実装済みですが、Wave 2とWave 3の成果目標は計画段階です。製品・提出資料はCapabilityで表現し、具体的な製品、Infrastructure Service、Algorithm、参照Hardwareは、再現に必要な実装・運用文書だけに記載します。

## 秘密情報の管理境界

開発用ウォレットはGit管理外の`tools/midnight-operator/.env.development`だけを復旧元とし、暗号化したオフラインバックアップを保持します。デバイス用ウォレットは`~/.midnight/midnight-cloudflare-demo/device-wallet/`だけに置きます。統合Server Walletは配備Secretと暗号化同期Checkpointを使い、管理、Managed Attestor、Device／Sponsor境界は別々のCompact認可Secretで維持します。復旧元をD1、R2平文、Worker Source、Device Firmwareへ保存しません。導入後の運用設定は`config/device.env`で、準備用の`edge-device/release/.env.device`は削除され、復旧用単語列や秘密鍵の種は含みません。エッジデバイスへ渡すのはコンパイル済みの実行物だけで、Compactのソースや鍵生成ツールは渡しません。ブラウザ向けAPIにも秘密値を公開しません。

詳細は[`system_architecture.md`](architecture/system_architecture.md)、[`private_spec.md`](security/private_spec.md)、[`demo_runbook.md`](operations/demo_runbook.md)を参照してください。

## 参考資料

本Repositoryは[Apache License 2.0](../../LICENSE)で提供します。

- [Midnight developer documentation](https://docs.midnight.network/)
- [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare Containers documentation](https://developers.cloudflare.com/containers/)
