# 審査図版の生成記録

[English](../../../assets/review/generation_manifest.md)

生成方法: Codex内蔵画像生成（画像生成モード）
図版形式: 16:9の審査用図版
最終サイズ: 1672 × 941 PNG
共通デザイン: 濃紺のグリッド、白、水色、紫、抑えた緑・黄・赤
共通制約: 硬派な技術資料、一般語は日本語、特定ボード製品名・開発ホスト・人物・企業ロゴ・暗号資産コイン・写真表現・透かし・過度なネオン装飾なし

## privacy-value-proposition-ja.png

Prompt Set:

- 5秒で顧客価値が分かる左右2分割の図。
- 見出しは「センサー値を開示せず、しきい値以内であることを示す」。
- 左は生のセンサー値を第三者へ共有して不要な開示が起きる従来経路。
- 右は値をエッジデバイスへ保持し、ゼロ知識証明で登録済みしきい値と照合する経路。
- 第三者が確認できる対象日・しきい値・判定結果と、確認できないセンサー値を明示。

## hourly-extrema-zkp-ja.png

Prompt Set:

- センサー値、1時間ごとの集約、値を隠したまま照合、必要な情報だけ公開の4段階。
- 1時間ごとの最小値・最大値・件数を、1日24個の時間枠にそろえる。
- 時間別最小値・最大値は非公開、登録済みしきい値は公開、結果は範囲内または範囲外だけ。
- 結論は「しきい値を満たす」だけに限定せず、「登録済みしきい値と照合し、範囲内・範囲外を判定」と記載。
- センサー精度、測定の完全性、集計処理の正しさは証明しないと明記。

## zk-claim-boundary-ja.png

Prompt Set:

- 1・2枚目だけをデザイン参照にし、旧4枚目は参照せず独立生成。
- 見出しは「ゼロ知識証明で分かること・分からないこと」。
- 「証明すること」「非公開のまま」「証明しないこと」の3列だけで構成。
- 「対象日の24時間分」は使わず、「観測した各時間の判定」と記載し、連続測定まで証明するような誤解を避ける。
- 「公開しきい値との一致」は使わず、「登録済みしきい値との照合」と記載。
- 「提出Extrema」は使わず、「提出した時間別の最小値・最大値」と記載。
- 正確な証明内容は、対象日の時間別最小値・最大値が登録済みしきい値を満たすことに限定。
- 凝縮書体、番号付きCard、Bevel、Glow、装飾的Frameを使わない。

## wave1-system-overview-ja.png

Prompt Set:

- 1・2枚目だけをデザイン参照にし、旧5枚目は参照せず独立生成。
- エッジデバイス、画面、バックエンド、Midnightの役割だけを4つの枠で表示。
- データ経路と処理順序は載せず、6・7ページとの重複をなくす。
- バックエンドは「公開記録の保管・証明生成」、Midnightは「しきい値・対象デバイス・判定記録」と平易に表示。
- 各枠は役割を1行だけに限定。

## data-location-disclosure-ja.png

Prompt Set:

- 「データ × 閲覧者：保存先と公開範囲」の5列×7行表。
- 生のセンサー値、時間別の最小値・最大値、証明メタデータ、公開しきい値、判定結果、署名済み取引を比較。
- 証明の付帯情報は、対象日・観測時間・件数・仕様の版番号を具体的に表示。
- 管理者、第三者、Midnightの公開／認証後のみ／非公開を緑・黄・紫で表示。
- 「Redactedメタデータ」は使わず、公開情報・認証後のみ・非公開という平易な区分だけを使う。
- Midnightを第三者が確認する基準、D1を画面表示用と明記。
- 現行バックエンドは証明生成中だけ時間別最小値・最大値を扱い、保存しないことを脚注に明記。

## daily-proof-flow-ja.png

Prompt Set:

- 1・2枚目だけをデザイン参照にし、旧7枚目は参照せず独立生成。
- 日次証明の運用を5段階だけに限定。
- 収集・集約、証明生成、取引署名、Midnight記録、第三者確認の順序だけを表示。
- 第三者が確認するものは、対象日・公開しきい値・判定結果・Midnight取引記録と明記。
- 非公開の時間別最小値・最大値は第三者に見せない。

## engineering-evidence-ja.png

Prompt Set:

- 2 × 2の技術的な実証結果。
- 6つの証明回路のコンパイル、182件の自動テスト、型検査・ビルド、Cloudflare配備前検査を表示。
- 2026-08-29 JSTの現行ソース検証と、2026-08-28のMidnight事前公開ネットワーク記録を分離。
- 回路行数、関数名、`k`値など、顧客価値の理解に不要な内部指標は載せない。

## three-wave-roadmap-ja.png

Prompt Set:

- Wave 1は検証済み、Wave 2・3は計画として3列で分離。
- 24個の時間枠の最小値・最大値、Midnight事前公開ネットワークでの範囲内・範囲外確認を日本語で表示。
- 今後の項目もブラウザ独立検証、署名付き来歴証明、校正記録、セキュアハードウェアなど日本語化。
- 最下部は「技術実証 → 建設現場での実証実験 → 販売・レンタル導入」。

## device-session-sequence-ja.png

Prompt Set:

- 4つの登場要素: エッジデバイス、画面、バックエンド、Midnight。
- 見出しは「ユースケース1：デバイス認証からAPI利用まで」。
- 認証要求・署名・APIセッションは画面を通らず、エッジデバイスとバックエンド間だけ。
- 5分・使い捨ての32バイト乱数、ECDSA P-256署名、Midnight登録状態確認、24時間APIセッションを表示。
- D1はSHA-256ハッシュだけを保持し、APIセッションは暗号鍵ではなく24時間有効な認証情報と明記。

## daily-attestation-key-sequence-ja.png

Prompt Set:

- 4つの登場要素: エッジデバイス、画面、バックエンド、Midnight。
- APIセッション、Midnight取引署名鍵、バックエンドでの証明生成、公開しきい値、対象デバイスを使う箇所を表示。
- 生のセンサー値から時間別最小値・最大値、証明生成、デバイス署名、Midnight確定、公開画面までを10段階で表示。
- 証明用乱数は公開しないと明記。
- 第三者が見るのは対象日・公開しきい値・判定結果・Midnight取引記録で、センサー値は見えないと明記。

## cloudflare-uc01〜05-*-ja.svg／.png

生成方法: `scripts/build-cloudflare-uc-materials.cjs`でSVGを作成し、1672×941 PNG、5ページPPTX、5ページPDFへ変換。画像生成モデルは不使用。

- 1枚に全経路を詰め込まず、認証、1時間Summary、日次ZKP、署名・送信、第三者確認の5 UCへ分割。
- 各ページは同じ配置を保ち、UC順にリソースを追加。現在のUCで使うリソースと線だけを明るく表示。
- 各ページの文章はタイトル、1行の説明、短い線ラベル、最下部の着目点だけに限定。
- UC 3は、非公開MIN／MAXが証明中だけ通過し、D1、Queues、R2へ保存されない点を強調。
- UC 4は、デバイスが取引内容を署名し、Sponsor WalletがDUSTだけを追加する責任分離を強調。
- UC 5は、第三者が対象日・公開しきい値・判定結果・Midnight取引記録だけを見る点を強調。
- Cron Trigger、Rate Limiter、Observability、Durable Objects、Instanceサイズ、再試行条件は図から外し、`system_architecture.md`の説明用表へ分離。
- Cloudflare Product Iconは、Cloudflare公式Docsリポジトリの`src/icons/`にあるWorkers、D1、Queues、Containers、R2のSVG Pathを使用。
- Icon source revision: `cloudflare/cloudflare-docs` commit `3feb9a48ac3b20803e7d672f546bebf4b5b65a30`。
- Source: <https://github.com/cloudflare/cloudflare-docs/tree/3feb9a48ac3b20803e7d672f546bebf4b5b65a30/src/icons>
- License／attribution: Cloudflare Docs content is provided under CC BY 4.0. <https://github.com/cloudflare/cloudflare-docs/blob/3feb9a48ac3b20803e7d672f546bebf4b5b65a30/LICENSE>
