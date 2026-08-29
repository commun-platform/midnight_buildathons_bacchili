# BACCHIRI!━━Verifiable Measurement Layer — Wave 1 審査提出物

[English](../../submission/README.md)

このディレクトリに審査成果物を集約します。動画は、完成した画面で実際の操作を見せるため、意図的に最後に制作します。

| 成果物 | 状態 | ファイル |
| --- | --- | --- |
| 詳細制作設計 | 作成済み | [deliverables_plan.md](deliverables_plan.md) |
| 提出文 | 作成済み、公開URL待ち | [submission_copy.md](submission_copy.md) |
| 主張と証拠の対応表 | 作成済み、最終コミット待ち | [evidence_matrix.md](evidence_matrix.md) |
| Wave 1進捗 | 作成済み | [wave1_progress.md](wave1_progress.md) |
| 提出前の技術確認表 | 作成済み、外部確認待ち | [technical_gate_checklist.md](technical_gate_checklist.md) |
| 審査員向けQ&A | 作成済み | [judge_qa.md](judge_qa.md) |
| 1ページ概要 | 作成済み | [one_page_brief.md](one_page_brief.md) |
| 編集用日本語スライド | 作成済み | [PPTX](deck/bacchiri-verifiable-measurement-layer-wave1-ja.pptx) |
| 閲覧用日本語スライド | 作成済み | [PDF](deck/bacchiri-verifiable-measurement-layer-wave1-ja.pdf) |
| Cloudflare UC別技術補足 | 作成済み | [説明](../architecture/cloudflare_use_cases.md)・[PPTX](deck/cloudflare-use-cases-ja.pptx)・[PDF](deck/cloudflare-use-cases-ja.pdf) |
| 最終画面の録画台本 | 撮影準備済み | [demo_script.md](demo_script.md) |
| 最終画面の画像素材 | 画面確定まで保留 | [captures/](captures/) |
| 紹介動画 | 画面確定まで保留 | 完成後に[submission_copy.md](submission_copy.md)へ公開リンクを追加 |

## スライドの再生成

リポジトリに`pptxgenjs`／`pdf-lib`がない場合は、Codex作業環境のNode.jsモジュールパスを指定します。

    NODE_PATH=<workspace-dependencies-node-modules> node scripts/build-submission-decks.cjs
    NODE_PATH=<workspace-dependencies-node-modules> node scripts/build-submission-pdfs.cjs

PPTXとPDFは、同じ主要10ページと技術補足2ページから個別に生成します。第8ページは最終画面が確定するまで撮影枠として明示します。

Cloudflare UC別技術補足は、次のコマンドで5枚のSVG／PNG、PPTX、PDFを一括再生成します。

    NODE_PATH=<workspace-dependencies-node-modules> node scripts/build-cloudflare-uc-materials.cjs

## 最終化の順序

1. 最終画面を確定して検証する。
2. 言語別の画面画像を作る。
3. 日英スライドの第8ページを差し替え、PDFも再生成する。
4. 最終確認用コミットから日英動画を録画する。
5. コミットを固定して検証を再実行し、リポジトリとスライドを公開して仮URLを置き換える。
6. 公開設定、Apache 2.0、`midnightntwrk`トピック、AKINDO提出フォームを確認する。
