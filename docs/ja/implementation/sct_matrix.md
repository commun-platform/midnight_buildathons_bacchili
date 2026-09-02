# システム互換性試験マトリクス

[English](../../implementation/sct_matrix.md)

Wave 1はDeploy済みPreprod最終審査の前に、2段階の決定的SCTを実行します。

```bash
npm run sct:api
npm run sct:gui
npm run sct
```

| UC | API SCT Evidence | 実描画GUI SCT Evidence |
| --- | --- | --- |
| Wallet Projectの選択／作成 | One-time Wallet署名、Hash化24時間Session、関連Project一覧、Project作成、Wallet／Project別Device ID、API上限、D1の10 Project Trigger | Projectプルダウン、**＋ 新規追加**、`1 / 10`表示、新Project固有Device ID、既存Projectへの切替 |
| 一覧の読込中／データなし | 対象外（表示動作） | 新Projectの空Policy Response後は静的な**データなし**、Policy Background確認中はAnimation付き**読込中**を表示し、編集中Policyの値とFocusが両方の再描画を跨いで保持されること |
| Wallet導出Device ID／P-256 Device Identity／24時間Session | Domain分離した決定的導出、Server側Wallet／Device不一致拒否、Challenge Replay、登録Evidence、Scope、Device分離 | Wallet Gate、読取専用導出ID、P-256 Identity、別Walletの古いBrowser Stateを復元しないこと |
| 非同期Midnight登録 | `202` Operation、Token保護Status、Wallet同期中の遅延再Queue、Terminal Error | Job ID表示、`IN PROGRESS`解除、Stepperは`WAIT`、後続Device／Assignment TX ID、Terminal Error時のみBrowser再試行を有効化 |
| 非公開1,440値から24時間集計 | Aggregate Validation、Device所有History | 選択可能なUTC 2日、選択日ごとに1,440件と時間別Rowが正確に24件 |
| Anomaly Transition | 認証済みAnomaly、Dashboard分離 | 管理者画面のAnomaly Row、6段階完了 |
| Proof Admission／生成 | 営業時間、認可、Result Validation、Proof Server境界 | Admit済みJobからZKP／TX Actionが有効化 |
| Sponsored TX | Quota、同一Byte冪等性、R2／Queue、Wallet Ready、Intent Allow-list、Checkpoint、Retry、Replay Protection時の送信結果回収、Backend所有Indexer確定 | History再読込後もSponsor TX／Fee Evidence表示 |
| Public検証／Privacy | ConfirmedかつTX ID／Hash／Block完備のみのHash検索、正しい24時間別結果、Private Field拒否 | TX hash検索、UTC日付、24個のしきい値以内／範囲外／計測なし、適用しきい値／有効期間、Device Commitment、Indexer進捗、Explorer Link、Private Extrema非表示 |

GUI SCTは本番SPA Assetを配信し、外部Wallet／Preprod Responseだけを決定的Test Doubleへ置換します。Cleanな
Headless Chrome Profileを使い、Git対象外の`.sct-output/dashboard/`へEvidenceを保存します。SCT成功だけでは
実Preprod TX送信を主張しません。実LaceとMidnight Explorer Evidenceを伴うDeploy済みRunbookが必要です。
