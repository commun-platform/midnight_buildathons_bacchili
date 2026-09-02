# 最終GUI Demo Script

[English](../../submission/demo_script.md)

状態: 最終GUIを使った英語デモ動画を作成済み
実時間: 2分18秒
出力: `bacchiri-demo-pitch-en.mp4`。必要な場合だけ日本語版を別途制作

## 録画時の不変条件

- Final Review Commitだけを録画する。
- 管理されたReview Deviceと完了日を使う。
- Mnemonic、Key、Session、Token、Private Extrema、Nonce、Proof Body、Environment Fileを表示しない。
- システムが都合のよいResultを強制しないことを示せるため、真のOUTSIDE Dayを優先する。
- OUTSIDE表示ではPublic Policyも同時に見せる。
- 記録済みPreprod Resultを使う場合は、その事実と日付を明示する。
- BrowserはPublic Midnight TX／Contract Stateを直接照合しますが、ZK Verifierを再実行しないと正確に説明する。

![最終画面の動画で示す6段階と、公開・非公開情報の境界](../assets/guides/judge-review-path-ja.png)

## 最終2分18秒StoryboardとNarration

| 時間 | 画面 / 操作 | 日本語Narration |
| --- | --- | --- |
| 0:00–0:11.984 | Title／Value Slide | 監査者がSensor値を受け取らずにThreshold Resultを確認できるかを問い、BACCHIRIを検証可能な計測Layerとして紹介する。 |
| 0:11.984–0:32.392 | Minimum Evidence説明Slide | 組織をまたぐ帳票共有の課題と、信頼に必要なEvidenceだけを共有する価値を説明する。 |
| 0:32.392–0:48.816 | Device Workflow GUI、素材0:20.500–0:36.924 | User管理Account、Device Identity、計測前に紐付けたPolicyを示す。 |
| 0:48.816–1:06.296 | Private Sensor Evidence説明Slide | Raw Reading、順序付き24 SlotのHourly MIN／MAX、Canonicalな計測なし時間を説明する。このSceneではProof TX画面を出さない。 |
| 1:06.296–1:22.216 | ZK Proof GUI、素材3:58.000–4:13.920 | Midnightへ事前登録したThresholdに対するProof生成を示す。 |
| 1:22.216–1:39.864 | Device Approval GUI、素材4:58.000–5:15.648 | 正確なPayloadへのUser認可と、Service側のFee負担を分離して示す。 |
| 1:39.864–1:58.664 | Third-party GUIとExplorer、素材5:54.000–6:12.800 | TX hashを貼り付け、Private値を隠したままUTC日付、24個の時間帯別結果、適用Policy／有効期間、Device Commitment、Block、TX Evidenceを示す。 |
| 1:58.664–2:18.040 | Exact Claim Boundary Slide | Midnightが証明する範囲を説明し、物理Sensor精度、完全なSampling、計測元側Aggregationの正しさを明示的に除外する。 |

## 正確なGUI操作順序

1. Review用に準備したClean Browser Profileから開始する。
2. Language、Title、Network、Review Commit Markerを確認する。
3. Midnight Walletを接続をClickし、Review Accountだけを認可する。
4. Device Workflowを開く。
5. 準備済みDeviceをRestoreするか、管理されたReview Deviceを作成する。
6. Enrollment Secretを出さず、Device RegistrationとPolicy Assignmentを確認する。
7. 準備済みCompleted Dayを選択する。
8. Reading CountとPrivate Input Available表示を見せ、Private値は開かない。
9. 日次Proofを要求をClickする。
10. Proof Job IDとStatus TransitionをCaptureする。
11. ZKPを生成してTX送信をClickする。
12. Confirmedまで待ち、短縮TX IDとResultをCaptureする。
13. 日次ZKPを検証をClickする。
14. Policy Bound、24個のUTC時間帯別結果、Device Commitment、Confirmed State、TX IDを見せる。
15. Top Navigationから第三者検証を開き、TX hashを貼り付け、Private Inputなしで同じUTC日付、時間帯別結果、Policy／有効期間、Device Commitment、Block、TXを確認する。

## 必須Shot

| ID | Shot | 必須内容 |
| --- | --- | --- |
| GUI-01 | Product Overview | Final Title、Network、Warningなし |
| GUI-02 | Wallet Gate | 明示的接続、Wallet Secretなし |
| GUI-03 | Device Registered | Device / Policy / Assignment Status |
| GUI-04 | Completed Day | 1,440 Readingまたは最終Control Count、OUTSIDEならOutlier Count |
| GUI-05 | Proof Requested | Proof Job ID、Admitted / Ready |
| GUI-06 | Proof Generated | Proving / Proof-ready |
| GUI-07 | Transaction Confirmed | Result、短縮TX ID |
| GUI-08 | Public Verifier | TX hash検索、UTC日付、24個の時間帯別結果、Policy／有効期間、Device Commitment、Block、TX |
| GUI-09 | Negative / Boundary | OUTSIDEまたは明示的Tamper Reject |
| EVD-01 | Compile | 6 Circuit、submitDailyAttestation Rows |
| EVD-02 | Test | 339成功 |

## Fallback Policy

録画時にPreprodが利用できない場合、Frozen Review Commitと文書化済みPublic Review State同期から作成したCaptureを使います。画面へ 記録済みPreprod Evidence · 2026-08-28 JST と表示します。Pending表示をConfirmedへ編集したり、新規確認のように演出しません。

## 最終Capture Gate

- GUI実装をFreezeしBuild済み。
- SecretなしのFinal Review Dataを準備済み。
- 編集なしで15 Stepを一度Rehearsal済み。
- Public Verifier Resultと選択Device Dayが一致。
- Transaction / Contract IDがEvidence Matrixと一致。
- 日英Narration、Caption、Slide Assetを分離。
- Video URLを日英Submission CopyとTop READMEへ追加。
