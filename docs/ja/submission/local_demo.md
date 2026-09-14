# 日英の審査向けプレゼンと操作デモ

[English](../../submission/local_demo.md)

9月12日の最終版は、15場面のモーションプレゼンと、サービス名・スローガン・お礼の締めで構成しています。日本語版に加え、音声・字幕・図中の説明・操作画面を英語に揃えた版も完成しました。

大きな見出し、説明に合わせて現れる図、明暗の切り替え、27か所の操作画面への拡大を組み合わせています。上部に「価値・操作・仕組み・次へ」の現在位置を示し、説明中の項目を枠で強調します。集計は24時間のマス、承認と送信はDevice → Sponsor → Midnightの役割分担、異常系は範囲外・欠測・拒否の違いで説明します。

英語の発音修正版では、冒頭・課題説明・締めの3か所で、同じナレーターに読みを「バッチリ」と明示しています。画面と字幕のサービス名表記は「Bacchiri」です。

## 完成ファイル

| 言語 | 動画 | プレゼン資料 | 字幕・台本 |
| --- | --- | --- | --- |
| 英語 | [MP4・5分7秒・1080p/30fps](../../../.demo-output/local-demo-tagline-en-20260912/bacchiri-local-demo-en.mp4) | [動画入り17枚PPTX](../../submission/deck/bacchiri-local-demo-en.pptx)・[PDF](../../submission/deck/bacchiri-local-demo-en.pdf) | [SRT](../../../.demo-output/local-demo-tagline-en-20260912/bacchiri-local-demo-en.srt)・[台本](../../../.demo-output/local-demo-tagline-en-20260912/narration.md) |
| 日本語 | [MP4・5分25秒・1080p/30fps](../../../.demo-output/local-demo-tagline-ja-20260912/bacchiri-local-demo-ja.mp4) | [動画入り17枚PPTX](deck/bacchiri-local-demo-ja.pptx)・[PDF](deck/bacchiri-local-demo-ja.pdf) | [SRT](../../../.demo-output/local-demo-tagline-ja-20260912/bacchiri-local-demo-ja.srt)・[台本](../../../.demo-output/local-demo-tagline-ja-20260912/narration.md) |

英語の締めは **“Bacchiri. Trust in data. Proof for everyone. Thank you.”**、日本語は **「バッチリ。データに信頼を。検証を、誰にでも。ありがとう。」** です。

締めだけをすぐ確認するには、[英語の短い動画](../../../.demo-output/local-demo-tagline-en-20260912/closing.mp4)・[日本語の短い動画](../../../.demo-output/local-demo-tagline-ja-20260912/closing.mp4)をご利用ください。

PPTXの16枚目は締めの画面、17枚目は完成動画です。PDFの最終ページは動画の静止画になります。英語の資料は動画と同じ構図の高解像度フレームを使い、発表者ノートに台本を収録しています。英語の画面要素は一枚の画像で、ノートは編集できます。日本語PPTXは本文と図形を編集できます。[英語の場面一覧](../../../.demo-output/local-demo-tagline-en-20260912/slides/contact-sheet.png)・[日本語の資料一覧](../../../.demo-output/local-demo-tagline-ja-20260912/slides/contact-sheet.png)でも確認できます。

動画・字幕・制作記録はGit管理外のローカル成果物です。新規cloneだけでは揃わないため、再生成または別途受け渡しが必要です。公開提出URLではありません。

## 内容と確認結果

実際のUCに沿って、Walletによる認証・登録承認、非公開の日次集計、証明依頼、WalletでのDevice取引承認、SponsorによるDUST手数料負担、第三者検証を説明しています。録画は接続済みアカウントの状態から始まり、Walletとのインタラクションを含む業務の流れを紹介します。

5つの現行GUIを、実際のブラウザ操作で撮影しています。画面には撮影用シミュレーションの表示があり、撮影用データと模擬の処理結果を使っています。過去のPreprod実証拠とは分けています。英語では残っていた運用画面などの日本語を、撮影時だけ表示文言として英訳しました。操作や結果を変更せず、翻訳辞書とスクリプトのハッシュを撮影記録に残しています。

日本語版は承認済みの約5分16秒の本編に約9.4秒の締めを追加し、本編の音声パケットと字幕を保持しています。英語版には専用の音声と字幕時刻を用意し、単語の途中で字幕が折れないようにしました。操作映像は撮影時の時間関係を保ち、説明が長い場面は最後のフレームを保持します。

日英それぞれ29項目のブラウザ確認が成功し、ブラウザ例外とコンソールエラーは0件でした。完成動画の全編デコード、1080p/30fps、台本と字幕の一致、拡大表示の範囲、PPTX内動画とMP4の一致を確認しています。制作ツールの既存テスト14件と、リポジトリの境界チェックも成功しました。

- 英語：[撮影記録](../../../.demo-output/local-demo-tagline-en-20260912/capture-evidence.json)・[編集記録](../../../.demo-output/local-demo-tagline-en-20260912/edit-manifest.json)・[メディア検証](../../../.demo-output/local-demo-tagline-en-20260912/media-validation.json)・[成果物一覧](../../../.demo-output/local-demo-tagline-en-20260912/delivery-manifest.json)・[SHA256SUMS](../../../.demo-output/local-demo-tagline-en-20260912/SHA256SUMS)
- 日本語：[撮影記録](../../../.demo-output/local-demo-tagline-ja-20260912/capture-evidence.json)・[編集記録](../../../.demo-output/local-demo-tagline-ja-20260912/edit-manifest.json)・[メディア検証](../../../.demo-output/local-demo-tagline-ja-20260912/media-validation.json)・[成果物一覧](../../../.demo-output/local-demo-tagline-ja-20260912/delivery-manifest.json)・[SHA256SUMS](../../../.demo-output/local-demo-tagline-ja-20260912/SHA256SUMS)

GUI実装の94テストと型検査は、以前の撮影作業で確認した記録です。今回の追加変更はメディア制作、撮影用の英語表示と成果物案内です。

## 起動・再生成

`npm run dashboard:demo` を実行し、[ローカルGUI](http://127.0.0.1:8790/?demo=1#/device)を開きます。終了はCtrl+Cです。別ポートは `npm run dashboard:demo -- --port 8792` で指定できます。

Device Workflow、管理者、第三者検証、Managed API Proof、System Operationsへ移動できます。ProjectとPolicyを作り、Deviceを登録して、終了した運用日の撮影用データを生成し、証明依頼・進行確認・公開判定の確認へ進みます。別の日で範囲外や欠測を選べます。[補足の英語録画](../../../.demo-output/local-demo-tagline-en-20260912/raw/recovery.mp4)は、失敗したRunの再試行を示します。

撮影用状態は `bacchiri-local-demo-v1:` に保存し、リセットはその領域だけを消します。`?demo=1` はループバックでのみ有効です。専用サーバーはAPI要求とブラウザの外部接続を遮断します。本来のWallet認証・承認処理は変更していません。

日英の生成コマンドと必要な依存環境は[英語の再生成手順](../../submission/local_demo.md#reproduce-the-final-editions)にまとめています。翻訳や撮影を変える場合は、新しい出力先を使い、説明と画面位置・タイミングの対応を確認してください。以前の日本語モーション版は `.demo-output/local-demo-presentation-20260912/` に保存しています。
