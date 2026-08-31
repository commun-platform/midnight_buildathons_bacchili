# BACCHIRI!━━Verifiable Measurement Layer — Wave 1 審査提出物

[English](../../submission/README.md)

このディレクトリに審査成果物を集約します。完成した画面を使った英語デモ動画は作成済みで、提出用の公開URL設定だけが残っています。

| 成果物 | 状態 | ファイル |
| --- | --- | --- |
| 詳細制作設計 | 作成済み | [deliverables_plan.md](deliverables_plan.md) |
| 提出文 | 作成済み、公開URL待ち | [submission_copy.md](submission_copy.md) |
| 主張と証拠の対応表 | 作成済み、最終コミット待ち | [evidence_matrix.md](evidence_matrix.md) |
| Wave 1進捗 | 作成済み | [wave1_progress.md](wave1_progress.md) |
| 提出前の技術確認表 | 作成済み、外部確認待ち | [technical_gate_checklist.md](technical_gate_checklist.md) |
| 審査員向けQ&A | 作成済み | [judge_qa.md](judge_qa.md) |
| 1ページ概要 | 作成済み | [one_page_brief.md](one_page_brief.md) |
| 日本語Technical Reference | 参考資料。提出対象は最終英語9枚 | [PPTX](deck/bacchiri-verifiable-measurement-layer-wave1-ja.pptx)・[PDF](deck/bacchiri-verifiable-measurement-layer-wave1-ja.pdf) |
| Cloudflare UC別技術補足 | 作成済み | [説明](../architecture/cloudflare_use_cases.md)・[PPTX](deck/cloudflare-use-cases-ja.pptx)・[PDF](deck/cloudflare-use-cases-ja.pdf) |
| 最終画面の録画台本 | 英語動画で使用済み | [demo_script.md](demo_script.md) |
| 最終画面の画像素材 | 審査済み英語Still 6枚とSubmission Thumbnailを作成済み | [captures/](captures/) |
| 英語紹介動画 | 作成済み（2分18秒）、公開URL待ち | `bacchiri-demo-pitch-en.mp4`の公開リンクを[submission_copy.md](submission_copy.md)へ追加 |

## Deck Sourceと旧Generator

最終英語9枚PPTXを、2分18秒動画と同期した編集用正本とします。PDFはその審査用Exportです。
`tools/submission-media/build-submission-decks.cjs`と`build-submission-pdfs.cjs`は旧12 Pageの日英Technical Deckを
再現するために残しており、最終Pitchを再現しません。提出用英語Filenameに対して実行してはいけません。

Cloudflare UC別技術補足は、次のコマンドで5枚のSVG／PNG、PPTX、PDFを一括再生成します。

    NODE_PATH=<workspace-dependencies-node-modules> node tools/submission-media/build-cloudflare-uc-materials.cjs

## 最終化の順序

1. 現在のRoadmap／文書Commitを固定して検証を再実行する。
2. 完成した英語動画、最終英語9枚Deck／PDF、Thumbnailを公開する。
3. リポジトリとスライドを公開して仮URLを置き換える。
4. 公開設定、Apache 2.0、`midnightntwrk`トピック、AKINDO提出フォームを確認する。
5. 審査Audienceから求められた場合だけ、日本語版を最終英語9枚から別制作する。
