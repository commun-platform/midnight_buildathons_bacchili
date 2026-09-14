# 最終成果物まとめ — 2026年9月12日

[English](../../submission/final_delivery.md)

現行実装、完成済みの資料・動画、新GUIの録画待ちプレビューをここにまとめました。対象は`fb28ade`を基点とする未コミット差分込みの作業ツリーです。ローカルでレビューできる状態の引き渡しであり、提出先の公開URLと最終Commitの固定は残っています。

## 成果物一覧

| 版 | ファイル | 状態・用途 |
| --- | --- | --- |
| 完成済み英語ピッチ | [9枚PPTX](../../submission/deck/bacchiri-verifiable-measurement-layer-wave1-en.pptx)・[PDF](../../submission/deck/bacchiri-verifiable-measurement-layer-wave1-en.pdf)・[2分18秒MP4](../../../.demo-output/submission-en-20260831/bacchiri-demo-pitch-en.mp4) | 過去のGUI実演を使った短い製品説明。後から追加した実機機能は補足資料で説明。 |
| Cloudflare運用説明追加版・英語 | [11枚PPTX](../../submission/deck/bacchiri-verifiable-measurement-layer-wave1-en-cloudflare-operations.pptx)・[PDF](../../submission/deck/bacchiri-verifiable-measurement-layer-wave1-en-cloudflare-operations.pdf)・[3分20秒MP4](../../../.demo-output/cloudflare-operations-20260910/bacchiri-demo-pitch-en-cloudflare-operations.mp4) | 完成済み。過去の実演に、実機運用を説明する図を表示区分付きで追加。 |
| Cloudflare運用説明追加版・日本語 | [14枚PPTX](deck/bacchiri-verifiable-measurement-layer-wave1-ja-cloudflare-operations.pptx)・[PDF](deck/bacchiri-verifiable-measurement-layer-wave1-ja-cloudflare-operations.pdf)・[4分16秒MP4](../../../.demo-output/cloudflare-operations-20260910/bacchiri-demo-pitch-ja-cloudflare-operations.mp4) | 完成済みの技術参考資料。英語ピッチとは構成が異なる。 |
| Wallet連携UCデモ・英語最終版 | [5分7秒MP4](../../../.demo-output/local-demo-tagline-en-20260912/bacchiri-local-demo-en.mp4)・[動画入り17枚PPTX](../../submission/deck/bacchiri-local-demo-en.pptx)・[PDF](../../submission/deck/bacchiri-local-demo-en.pdf)・[詳細](local_demo.md) | 音声・字幕・図中の説明・操作画面を英語化。15場面とサービス名・スローガン・お礼の締め。資料は動画フレームと編集可能な発表者ノート。撮影用シミュレーション。以前のレビューZIPとは別配布。 |
| Wallet連携UCデモ・日本語最終版 | [5分25秒MP4](../../../.demo-output/local-demo-tagline-ja-20260912/bacchiri-local-demo-ja.mp4)・[動画入り17枚PPTX](deck/bacchiri-local-demo-ja.pptx)・[PDF](deck/bacchiri-local-demo-ja.pdf) | 承認済みの15場面にサービス名・スローガン・「ありがとう。」の締めを追加。PPTX本文と図形は編集可能。撮影用シミュレーション。以前のレビューZIPとは別配布。 |
| 新GUIピッチ | [日本語PPTX](deck/bacchiri-new-gui-ja-preview.pptx)・[PDF](deck/bacchiri-new-gui-ja-preview.pdf)・[MP4](../../../.demo-output/gui-finalization-20260910/ja/bacchiri-new-gui-ja-preview.mp4)、[英語PPTX](../../submission/deck/bacchiri-new-gui-en-preview.pptx)・[PDF](../../submission/deck/bacchiri-new-gui-en-preview.pdf)・[MP4](../../../.demo-output/gui-finalization-20260910/en/bacchiri-new-gui-en-preview.mp4) | 各11枚、日本語約3分12秒・英語約3分17秒。**G01〜G05は録画待ちの仮画面で、完成したGUI実演ではない。** |
| 構成図・ナレーション | [日英の図・単独説明動画・字幕・制作記録](cloudflare_operations_media.md) | 連続計測とWallet間欠運転を説明。午前2時は処理開始であり、確定時刻の保証ではない。 |
| レビュー用一式 | [ZIP](../../../.demo-output/final-delivery-20260911/bacchiri-review-package-20260911.zip)・[SHA256SUMS](../../../.demo-output/final-delivery-20260911/SHA256SUMS) | 版別に選別したメディア、日英の案内、ファイル一覧、個別チェックサムを同梱。Git管理外のローカル出力。 |
| 現行Deviceファームウェア | [tar.gz](../../../.device-release/archives/midnight-sensor-device-fw-0.1.0-review-20260911.tar.gz)・[SHA-256](../../../.device-release/archives/midnight-sensor-device-fw-0.1.0-review-20260911.tar.gz.sha256) | 日次送信と停止防止を含む現行ソースから生成。今回実機へは未導入。メディアZIPとは別配布。 |

動画・ZIP・ファームウェアはローカルのGit管理外ファイルです。この作業環境では開けますが、新規cloneだけでは揃いません。再生成または別途受け渡しが必要で、公開URLとしては扱いません。

## 実装との整合・改善点

| 対象 | 現在の動作 | 証拠と限界 |
| --- | --- | --- |
| 実機の日次自動送信 | 独立した5分タイマーで、終了から5分経過した運用日を処理。証明入力を永続保存し、待機中は処理を返し、日付を巡回して再試行し、確定レシートのある日は再送しない。 | [日次送信ソース](../../../edge-device/midnight-transaction-agent/src/daily-submission.ts)、Transaction Agent 43テスト。欠測は補完しない。24時間の観測枠があっても連続測定の証明にはならない。 |
| 連続収集 | Collectorと復旧タイマーへの直接停止を拒否。更新・ロールバックは明示的なMaintenance Targetを使う。収集とWallet処理は別プロセス。 | [ファームウェア手順](../operations/device_firmware.md)、Collector／Installer 20テスト。管理権限でsystemd設定を変更する操作まで防ぐものではない。 |
| Walletと通知 | 統合Server Walletが管理・Managed Attestation・Fee Sponsorshipを別々の認可で実行。Sponsor RoleはDUST付与専用。Sponsor通知に検証画面へのURLを追加。 | [運用説明](../architecture/wave2_system_operations.md)、Gateway 247テスト。`PUBLIC_VERIFICATION_PORTAL_URL`は非秘密の配備設定。送信レシート単体ではネットワーク確定を意味しない。 |
| GUIのPolicy再読み込み | 「しきい値を再読み込み」で状態を更新し、終了後に再度操作可能にする。入力途中の値とFocusを維持。 | `refreshDeviceDynamicComponents`のボタン更新漏れを修正。結合テストも繰り返しの明示操作に合わせ、自動ポーリングが発生しないことを検査。 |
| 非公開情報と日付境界 | 生の実測列とDevice鍵は実機内に保持。認可済み時間集計と証明入力はtrusted Backendへ渡し、第三者には運用日・登録済み境界・判定を表示。 | 集計値もすべて実機内に留まる、日付は常にUTC午前0時で区切る、と読める概要を修正。センサーの真正性、完全性、実機側集計の正しさは証明対象外。 |

[現行リリース補足](current_release_addendum.md)には、9月7〜8日の確認記録として、9月5日・6日の運用日それぞれ実測1,439件、Block 2,446,724・2,446,764の確定取引を追加しました。9月9日の停止防止記録は、停止拒否の確認中にも収集が継続した証拠です。いずれも当時の記録であり、今回9月11日に実機やIndexerを再確認した主張ではありません。

## 検証結果

| 9月11日の作業ツリーに対する検査 | 結果 |
| --- | --- |
| 運用Compactのコンパイル | 成功：Toolchain `0.31.1`、8回路 |
| リポジトリの自動テスト | **合計525件成功**：最初の全体実行512件に、追加されたローカルデモ13件を含むDashboard 91件の再検証を反映 |
| 型検査・生成Bindingの整合検査 | 成功 |
| Frontend・TypeScriptのビルド | 成功。Policyボタン修正後にDashboardテストとビルドを再実行 |
| 公開・非公開MCP Workerのdry-run | 成功 |
| Proof GatewayのWorker Bundle | `--containers-rollout none`で成功。Containerイメージは対象外 |
| `npm run verify`全体 | **未完了**：テスト・型検査は成功したが、Dockerを起動できずGatewayのContainerビルドで停止 |
| GUI結合テスト | 22画面Checkpoint成功。明示的なPolicy再読込、登録待ち、統合された非同期Proof操作にテストを整合。[テスト用画面と結果](../../../.sct-output/dashboard/) |
| メディアの証拠・カット検査 | 13件成功。Job／TXの不一致、録画不足、未確定を確定と扱う指定を拒否 |
| ファームウェア生成 | 成功：Release 103ファイル、Runtime Artifact 36件、Archive境界・チェックサム検査 |
| 可搬性・空白検査 | 成功。個人環境の絶対パスを修正し、文書の相対リンク366件に欠落なし |

525件の内訳：Shared 20、Public Verifier 3、Contract 18、Dashboard 91、Development CLI 5、Device Auth 6、Collector／Installer 20、Device Wallet Agent 43、Gateway 247、Sponsor Wallet 52、Support MCP 11、Verification MCP 5、疑似Source 4。録画検証13件・梱包検証4件は別枠です。並行追加されたローカルデモAdapterを含めて、Dashboardテスト・型検査・ビルドとGUI結合テストを再実行しています。API SCTの別名コマンドは、この集計に含まれるGateway／Sponsorの同じテストを実行します。

同じ33ファイルのメディア一式は`python3 tools/submission-media/build-final-delivery.py`で再生成できます。必須ファイル不足、シンボリックリンク、パス逸脱を拒否し、版名を維持してArchive内の各ファイルをSHA-256で照合します。梱包の境界検証4件は`python3 -m unittest discover -s tools/submission-media -p test_final_delivery.py -v`で実行します。

残る完全な配備パッケージ検証は、Dockerが利用できる開発環境で実行します。

```bash
TMPDIR=/tmp WRANGLER_LOG_PATH=/tmp/bacchiri-wrangler-logs npm run verify
TMPDIR=/tmp npm run sct:gui
python3 -m unittest discover -s tools/submission-media -p test_gui_finalization.py -v
git diff --check
```

`WRANGLER_LOG_PATH`でログを書込み可能な場所へ保存します。Workerだけの検証はリポジトリの配備Manifestに対し`wrangler deploy --dry-run --containers-rollout none`で成功しましたが、Containerイメージ検証の代わりにはなりません。今回、配備変更、Wallet操作、新しいMidnight取引の作成は行っていません。

## 残る作業

1. 新GUI版はG01〜G05を撮影し、Device・運用日・Policy・Proof Job・確定TXを照合する。[撮影引き継ぎ](new_gui_recording_handoff.md)に従い、現行プレビューを完成済み実演として公開しない。
2. Dockerを使える環境でContainerを含む完全な検査を通し、レビューしたCommitとSHAを固定する。
3. 採用する版の動画・デックを公開して提出URLを記入し、Repository公開状態・Topic・提出フォーム要件を提出時に確認する。
4. パートナーの運用期間を通じた信頼性、組織・Role分離、本番復旧を検証する。日次自動化は実装済みだが、Wave 2全体の完了にはこれらが必要。

9月11日付の審査ピッチ改訂ファイルは未完了の編集計画です。追加の完成版としては数えず、ここに記載した新GUI成果物は9月10日のプレビューです。
