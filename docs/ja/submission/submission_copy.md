# Wave 1 提出文

[English](../../submission/submission_copy.md)

## プロジェクト名

BACCHIRI!━━Verifiable Measurement Layer

## 一言で言うと

センサー値を第三者に見せず、登録済みしきい値の範囲内かどうかを証明します。

## 短い説明

BACCHIRI!━━Verifiable Measurement Layerは、疑似のUTC 1日分を非公開の時間別最小値・最大値にまとめ、24時間それぞれの「しきい値以内／範囲外／計測なし」を公開します。Wave 1の審査経路では、ユーザーが認可したブラウザクライアントを疑似計測元とし、Midnight取引を認可します。

## 課題

計測結果は管理画面、CSV、帳票、クラウドシステムを通じて共有されます。建設業界では、騒音、振動、温度などの帳票を、機器提供会社、レンタル会社、施工会社、発注者、監査者など複数組織が利用します。そのため、確認者は帳票を作った組織やシステムを信頼するしかない場合があります。本プロジェクトが暗号学的に確認する問いは、「対象日の時間別最小値・最大値が、運用前に登録したしきい値を満たしたか」です。

## 解決方法

- 疑似計測元：疑似の日次計測データを作り、Raw値と非公開Proof Openingをユーザー認可済みBrowser内に保持し、上限付き時間別Summaryを認可済み運用者Workflowへ送ります。
- 審査画面：運用操作と第三者確認を一つにまとめ、秘密値を見せずにPoC全体を確認できるようにします。
- 管理されたバックエンド：認可済み時間別SummaryとWorkflow記録の保存、証明依頼、証明生成を担うWave 1の信頼対象です。
- Midnight：運用日／登録済み境界、24個の時間帯判定、公開しきい値／有効期間、Device Commitment、取引記録を保持します。

![生データ開示から必要最小限の証拠へ](../../ja/assets/review/privacy-value-proposition-ja.png)

## Midnightを使う理由

「公開しない値」と「誰でも確認できる判定記録」を分けられるからです。時間別の最小値・最大値と証明用乱数は非公開です。公開するのは、運用日／登録済み境界、24個の時間帯Status、しきい値／有効期間、Device Commitment、件数、取引記録です。判定に使うしきい値と運用日境界は証明時に自由指定せず、運用開始前に登録した値を使います。

## Wave 1の進捗

Wave 1では、審査可能なCore Proof PoCとして、Project単位の証明対象・Policy登録、疑似の日次計測データ、固定24 Slotの非公開Proof Input、Proof Request管理、管理された証明生成、User認可・Service Fee負担のMidnight取引、運用者／第三者の統合審査画面を構築しました。

リポジトリには、現場側Runtimeの認証、収集、取引、配布、Rollback実装も含まれます。これは次段階に向けたIntegration Evidenceであり、Wave 1では長期間の自律現場運用や本番Role分離まで完了したとは主張しません。

2026-08-31 JSTに現在の作業中ソースを検証した結果:

- 6つの証明回路がすべてコンパイル成功
- 345件の自動テストがすべて成功
- 全構成領域の型検査とビルドが成功
- Cloudflare配備前検査が成功

2026-08-28 JSTのMidnight事前公開ネットワーク記録には、範囲内と範囲外の両方が含まれます。1日1,440件の測定値を使った範囲外判定の取引は次のとおりです。

- Contract: 8338d5588fe5662fce86ce3c221f0bd5260a14cdbf372c1dddd58be41e5b3c68
- Transaction: 00e12efda5f33b4804f3659a811d2f5e86c9ce838255a63028d41df85cb0762da9
- Block: 2,302,213

Source検証と日付付きMidnight事前公開ネットワーク記録は別の証拠です。現行Worker／GUIは2026-08-31 JSTにDeploy済みですが、文書更新だけを目的とした新しいDaily Attestationは作っていません。

## 正確に何を証明するか

確定済み日次証明は、運用日の各時間枠の非公開最小値・最大値から、その時間帯の「しきい値以内／範囲外／計測なし」を証明します。同時に、運用日／登録済み境界、件数、Device Commitment、登録済みしきい値／有効期間、証明入力のCommitmentを紐付けます。

物理センサーの真正性、連続測定、未提出データがないこと、計測元側の集計の正しさは証明しません。現行構成では、管理されたバックエンドと証明サービスを信頼対象とします。ブラウザはPublic Midnight Indexerへ直接問い合わせて確定Contract Stateを照合しますが、Browser内でZK Verifierを再実行したりWitnessを開示したりはしません。

## 対象利用者と導入

最初の事業ユースケースとして協議しているのは建設現場の計測結果検証です。Wave 1で検証済みなのは温度計測の経路です。騒音や振動などに展開するには、計測種別ごとのしきい値定義、入力形式、検査規則の追加が必要です。新しい機器や販売網を一から作るのではなく、既存の計測機器とクラウド運用へ検証機能を追加します。

既存の機器と販売・レンタル網を利用する現場実証に向け、業界事業者と協議を進めています。これは事業化の進捗であり、完了済みの技術検証ではありません。同じ証明の仕組みは将来、低温物流、食品・医薬品保管、研究設備、規制対象設備にも展開できます。

## 3段階の展開計画

- Wave 1 — Core Proof PoC：疑似計測元、疑似の日次計測データ、一つの審査用統合画面で非公開証明の中核価値を検証します。
- Wave 2 — Operational Partner Pilot：実際の現場計測システムを接続し、日次運用の自律化、Role・画面分離、本番認証・認可、監査、解析、監視、復旧を実装して、有償パートナー実証を行います。
- Wave 3 — Trust Minimization and PMF：Hardware保護Identityと来歴を追加し、複数組織・複数現場で商用運用して、継続売上、契約更新、利用拡大、持続可能なUnit Economicsを検証します。

現行BrowserはPublic Midnight TX／Contract Stateを独立照合します。製品・事業計画の正本は[3 Waveロードマップ](../architecture/three_wave_roadmap.md)です。Wave 2とWave 3は現行機能ではなく計画です。

## 提出リンク

- リポジトリ: 最終公開GitHub URLを追加
- 日本語スライド: [PPTX](deck/bacchiri-verifiable-measurement-layer-wave1-ja.pptx) / [PDF](deck/bacchiri-verifiable-measurement-layer-wave1-ja.pdf)
- 英語スライド: [PPTX](../../submission/deck/bacchiri-verifiable-measurement-layer-wave1-en.pptx) / [PDF](../../submission/deck/bacchiri-verifiable-measurement-layer-wave1-en.pdf)
- 紹介動画: `bacchiri-demo-pitch-en.mp4`（2分18秒）を作成済み、提出用公開URLを追加
- 主張と証拠の対応表: [evidence_matrix.md](evidence_matrix.md)
- 審査の入口: [README](../../../README.md)

## 提出前に必ず確認すること

- 仮リンクを公開URLへ置き換える。
- 審査対象コミットを固定し、SHAを記録する。
- リポジトリの公開設定と`midnightntwrk`トピックを確認する。
- AKINDOの締切時刻、入力欄の制限、公式ルールを確認する。
- 完成した英語動画を公開し、提出用URLを掲載する。
