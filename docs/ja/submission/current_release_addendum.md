# 現行リリース証拠補足

[English](../../submission/current_release_addendum.md)

状態：2026-09-11に資料を更新。Live証拠は各項目の確認日を参照。
旧実装基準Commit：`af90ad8`。現行作業ツリーは`fb28ade`＋未コミット差分。

[最終成果物まとめ](final_delivery.md)に最新の525テスト、GUI修正、Container検査の環境制約を記載しています。

完成済みの英語2分18秒動画と9枚Pitchは、Wave 1の製品価値を簡潔に伝える正本として維持します。本書は、
撮影後に追加された技術・運用Evidenceをまとめ、動画のFlowと現行Repository／Preprodシステムを区別する
ための補足資料です。

## 現行Midnight証拠

現行8回路の`sensor-registry` ContractはMidnight Preprodへ配備済みです。

- Contract：`48636e2f7ae8b1705134b026ec0d5a910357cac990a60adce2c2672e1a78a732`
- 配備TX：[`00ea92883cba9ff8b753a3308d6d2127ac3f81c2643f09840a449588197a32cbdf`](https://preprod.midnightexplorer.com/transactions/00ea92883cba9ff8b753a3308d6d2127ac3f81c2643f09840a449588197a32cbdf)
- 配備日：2026-09-03 JST

異なる2つの受付経路から、統合Server Walletを経て現行Contractまで到達しました。

| 受付経路 | 入力 | 公開結果 | 確定Evidence |
| --- | --- | --- | --- |
| 登録済みCloud API | 1,440 Record、観測24時間 | OUTSIDE。登録済み10–35 °C Policyに対して2時間が範囲外 | [TX `35b8…32`](https://preprod.midnightexplorer.com/transactions/35b8a83050d910ae94862be565c718b09764e51fd69979eaff1ed3dee93bb532)、Block 2,385,826 |
| 認証済み現場Device | 1分間隔1,440件を24個の非公開時間別Extremaへ集約 | WITHIN。24時間すべて登録済みPolicy内 | [TX `7e93…40`](https://preprod.midnightexplorer.com/transactions/7e93c537e85dbc16892716429b0f426e731999775b0cef460bd4b0d358c42b40)、Block 2,385,898 |

2026-09-05 JSTに、公開Verification MCPから両方のTX hashをMidnight Preprod Indexerへ問い合わせ、現行
Contract、Policy、Device-bound Assignment、運用日境界、Sample／観測時間数、24時間分の判定、成功済み
TX状態が一致することを再確認しました。Raw Sample、時間別Extrema、Proof Nonceは返却されません。

## 現行の運用機能

- **Wallet不要のManaged API Attestation：** 登録済みHTTPS Sourceから固定運用日を取得し、検査、24個の
  非公開Slotへの集約、Proof生成、Fee付与、送信、公開検証までを同じモデルで処理します。Trusted Serviceが
  受信した値との関係を証明するものであり、上流Sourceの真正性までは証明しません。
- **統合Server Wallet：** 1つのPrivateでStatefulなWallet Runtimeが、管理、Managed Attestor、DUST
  Sponsorの役割を、分離した認可Secretと直列化した更新処理で実行します。Proof Serverは鍵を持たない別
  Containerのままです。
- **運用Evidence：** Access保護されたConsoleで、Wallet同期、DUST、Workflow Backlog、日次処理Metric、
  Redact済み顧客操作Traceを確認できます。Discord障害通知は保護時間を持ち、Sponsor送信は冪等なReceiptを
  生成します。
- **MCPの分離：** 非公開Support MCPはAccess保護された別Workerで動き、Redact済みD1 Bindingと6つの
  Read-only Toolだけを持ちます。公開Verification MCPはD1、R2、Queue、Container、Secret、Service
  Bindingを持たない別Workerで、`verify_attestation_transaction`だけを公開します。

## 9月7〜9日の実機運用追加記録

日次自動送信は実装・実機導入済みです。Collectorとは別の5分タイマーが完了日を処理し、保存した同じ証明入力で再試行し、確定後はレシートで重複送信を防ぎます。次は[当時の実行記録](../../implementation/continuous_device_daily_attestation_execplan.md)に記録された公開証拠です。

| 運用日（JST） | 実測件数 | 観測時間枠 | Block | 確定TX |
| --- | ---: | ---: | ---: | --- |
| 2026-09-05 | 1,439 | 24 | 2,446,724 | `832152cf417a9d6228720822144c006e7a2db2a17f7b3fbf9152a3a1c2bbfc93` |
| 2026-09-06 | 1,439 | 24 | 2,446,764 | `26b7872adbecd1cf811fbb61b48f3177295c80bfddd3d8a5e51d95bd3ac97bb5` |

当時の検証では両方がWITHIN／verified=trueで、Deviceレシートと公開Ledgerの識別子・日付境界・件数が一致し、再実行時の二重送信もありませんでした。1,439件を1,440件へ補完した主張ではありません。9月9日には[停止防止を追加](../../implementation/collector_stop_protection_execplan.md)し、直接停止の拒否中も同じCollectorプロセスで測定が進むことを確認しています。午前2時のSponsor処理開始は確定時刻の保証ではありません。

これらは当時の確認記録です。9月11日にLive再検証や再配備を行ったものではなく、パートナー運用期間の信頼性や無停止を保証しません。

## 9月5日までの基準Source検証

- Compact Toolchain `0.31.1`で運用8回路すべてのCompileに成功。
- 12 Workspaceと決定的な疑似対向Sourceにまたがる496 Testがすべて成功。
- 全構成WorkspaceのType Check／Buildに成功。
- API SCT、22 CheckpointのGUI SCT、Wrangler dry-run、Repository Portability検査に成功。
- MCP単位では、共通Public Verifier 3件、非公開Support MCP 11件、公開Verification MCP 5件が成功。

Source検証は上記実装基準Commitに対する証拠です。2件のTXは、それとは別のLive Network Evidenceです。
Local TestやWorker配備を、確定済みMidnight TXの代わりには扱いません。

## 提出資料としての読み方

Browser疑似計測元は審査員が最短で理解できるFlowであり、既存動画は引き続き有効です。Managed API、現場
Device、System Operations、MCPは、同じOn-chain Proof Claimを再利用する追加のComposable Pathです。
本番完成には、Partner運用期間の信頼性Evidence、組織／Role分離、自動化済みの現場運用の長期検証、Roadmapに示すWave 2
Controlが引き続き必要です。
