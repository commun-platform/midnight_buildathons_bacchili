# BACCHIRI!━━Verifiable Measurement Layer — Wave 1 審査提出物

Walletによる認証・承認を含む実際のUCを、操作の拡大・段階的な図解で紹介する日英の最終版（英語5分7秒・日本語5分25秒）は[ローカルデモとピッチ](local_demo.md)を参照してください。サービス名・スローガン・お礼の締めも追加済みです。模擬動作の版として、過去の実証拠と区別しています。

最新版の成果物一覧・9月11日の検証結果・未完了項目は[最終成果物まとめ](final_delivery.md)を参照してください。`af90ad8`と496件の記載は9月5日までの基準記録です。

[English](../../submission/README.md)

このディレクトリに審査成果物を集約します。完成した画面を使った英語デモ動画は作成済みです。撮影後の
Engineering Evidenceは別の現行リリース補足へまとめ、動画のStory、現行Source、現行Preprod配備を
混同しない構成にします。

| 成果物 | 状態 | ファイル |
| --- | --- | --- |
| 詳細制作設計 | 作成済み | [deliverables_plan.md](deliverables_plan.md) |
| 提出文 | 作成済み、公開URL待ち | [submission_copy.md](submission_copy.md) |
| 主張と証拠の対応表 | 作成済み、実装基準`af90ad8`を記録 | [evidence_matrix.md](evidence_matrix.md) |
| 現行リリース証拠補足 | 撮影後のManaged API、Device、運用、MCP、現行Contract Evidenceを反映済み | [current_release_addendum.md](current_release_addendum.md) |
| Wave 1進捗 | 作成済み | [wave1_progress.md](wave1_progress.md) |
| 提出前の技術確認表 | 作成済み、外部確認待ち | [technical_gate_checklist.md](technical_gate_checklist.md) |
| 審査員向けQ&A | 作成済み | [judge_qa.md](judge_qa.md) |
| 1ページ概要 | 作成済み | [one_page_brief.md](one_page_brief.md) |
| 最終英語Pitch Deck | Slide 7へServer側Sponsor Walletの現行構成と限定付きCost Evidenceを追加済み | [PPTX](../../submission/deck/bacchiri-verifiable-measurement-layer-wave1-en.pptx)・[PDF](../../submission/deck/bacchiri-verifiable-measurement-layer-wave1-en.pdf) |
| 日本語Technical Reference | 参考資料。Slide 8へ日本語の現行Sponsor Wallet構成と限定付きCost Evidenceを追加済み。提出対象は最終英語9枚 | [PPTX](deck/bacchiri-verifiable-measurement-layer-wave1-ja.pptx)・[PDF](deck/bacchiri-verifiable-measurement-layer-wave1-ja.pdf) |
| Cloudflare UC別技術補足 | 作成済み | [説明](../architecture/cloudflare_use_cases.md)・[PPTX](deck/cloudflare-use-cases-ja.pptx)・[PDF](deck/cloudflare-use-cases-ja.pdf) |
| Cloudflare運用説明追加版 | imagegen図2枚・追加スライド・ナレーション付き説明を日英で作成 | [成果物と制作記録](cloudflare_operations_media.md) |
| 新GUIの録画準備 | 日英11枚のデック、約3分の音声・字幕付き仮編集、5場面の撮影手順を用意。新映像待ち | [確認用ファイルと撮影手順](new_gui_recording_handoff.md) |
| 最終画面の録画台本 | 英語動画で使用済み | [demo_script.md](demo_script.md) |
| 最終画面の画像素材 | 審査済み英語Still 6枚とSubmission Thumbnailを作成済み | [captures/](captures/) |
| 英語紹介動画 | 作成済み（2分18秒）、公開URL待ち | `bacchiri-demo-pitch-en.mp4`の公開リンクを[submission_copy.md](submission_copy.md)へ追加 |

## Deck Sourceと旧Generator

最終英語9枚PPTXを、2分18秒動画と同期した編集用正本とします。PDFはその審査用Exportです。
`tools/submission-media/build-submission-decks.cjs`と`build-submission-pdfs.cjs`は旧12 Pageの日英Technical Deckを
再現するために残しており、最終Pitchを再現しません。提出用英語Filenameに対して実行してはいけません。

最終英語PitchのSlide 7は、動画と同じUser認可／Service Fee分離を保ちながら、オンデマンドのServer側
Sponsor Wallet、D1／R2、独立したProof Server、限定付きCost Evidenceを1枚に統合します。
`build-on-demand-zkp-architecture.cjs`が編集可能な英語SVGと1672 × 941 PNGを生成し、
`include-on-demand-architecture-in-pitch.cjs`が最終9枚PPTX／PDFのSlide／Page 7だけを検査付きで
差し替えます。

元のDeckには、動画確定後の運用ConsoleやMCPの詳細を追加していません。9月10日の[Cloudflare運用説明追加版](cloudflare_operations_media.md)では、実機の収集時刻とWalletの間欠運転を別名のデック・動画へ追加しました。これらの実装済み拡張と現行8回路
Preprod証跡は、[現行リリース証拠補足](current_release_addendum.md)と
[証拠対応表](evidence_matrix.md)で確認できます。

`build-on-demand-zkp-architecture-ja.cjs`は、元の日本語ガイド画像を上書きせず、英語Pitch図と同じ
主張境界を持つ編集可能な日本語SVGと1672 × 941 PNGを生成します。
`include-on-demand-architecture-in-ja-reference.cjs`は、日本語12枚Technical Referenceの
Slide／Page 8だけを検査付きで差し替えます。この参考Deckを最終提出Pitchへ変更するものではありません。

Cloudflare UC別技術補足は、次のコマンドで5枚のSVG／PNG、PPTX、PDFを一括再生成します。

    NODE_PATH=<workspace-dependencies-node-modules> node tools/submission-media/build-cloudflare-uc-materials.cjs

## 最終化の順序

1. 現在のRoadmap／文書Commitを固定して検証を再実行する。
2. 完成した英語動画、最終英語9枚Deck／PDF、Thumbnailを公開する。
3. リポジトリとスライドを公開して仮URLを置き換える。
4. 公開設定、Apache 2.0、`midnightntwrk`トピック、AKINDO提出フォームを確認する。
5. 新GUI版を採用する場合はG01〜G05を撮影・照合してから最終版として書き出す。日英プレビューは作成済みで、日本語Technical Referenceとは別の版です。
