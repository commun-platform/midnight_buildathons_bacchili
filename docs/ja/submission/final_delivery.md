# 現行Source Delivery — 2026-09-14

[English](../../submission/final_delivery.md)

この文書は、コミット `b72efb7d4df8384a9e8dd873b8e3a65f6e9e5fbd` に含まれる実装とReview Evidenceを
対応付けます。以下の技術的Claimは、追跡対象のCode、追跡対象のTest、または公開Transaction Recordへ
解決できます。

## 実装済みの動作

| 領域 | 現在の動作 | 追跡対象のEvidenceと境界 |
| --- | --- | --- |
| Deviceの日次Submit | 終了Margin後に完了した運用日を読み、Private Preparationを保持し、Retry Batchを上限付きで回転し、待機中の処理を延期し、確認済みReceiptを再実行しません。 | [Daily Submission Source](../../../edge-device/midnight-transaction-agent/src/daily-submission.ts) とTransaction Agent Test 43件。欠測は欠測のままで、24時間分の観測だけで連続取得は証明しません。 |
| Continuous Collection | CollectorとRecovery Timerは直接停止を拒否します。Maintenance TargetがUpgradeとRollbackを調整し、CollectionとTransaction処理を分離します。 | [Firmware Guide](../../operations/device_firmware.md) とCollector / Installer Test 20件。Privileged AdministratorはSystemd設定を変更できます。 |
| Walletと通知 | 統合Server WalletがAdministration、Managed Attestation、Fee Sponsorshipを分離します。Sponsor RoleはDUSTだけを追加します。Receiptには設定済みVerification Page URLが入ります。 | [Operations Guide](../../architecture/wave2_system_operations.md) とGateway Test 247件。送信済みReceiptだけではNetwork Confirmationになりません。 |
| Policy Reload | **Refresh Policies**でPolicy結果を更新し、未入力の項目とFocusを保持します。Request後にControlを再び使用できます。 | Dashboard Sourceと、明示的なReloadを繰り返すRegression Test。 |
| Privacyと日境界 | Field StreamのRaw値とDevice KeyはLocalに残ります。認可されたHourly SummaryとPrivate Proof InputはTrusted Backendへ送られます。Public Viewerには登録済みの運用日境界と結果だけを返します。 | [Private-information Specification](../../security/private_spec.md)、[Contract Source](../../../midnight/contracts/sensor-registry/src/sensor-registry.compact)、[Claim Matrix](evidence_matrix.md)。Sensorの真偽、完全性、Local Aggregationの正しさは証明しません。 |

## 公開Deployment Record

[Release Addendum](current_release_addendum.md)に、8回路ContractとPublic Indexerで確認した日付付きPreprod
Recordをまとめています。これはある時点のDeployment Stateを示すもので、このSource Handoffのために新しい
Network Transactionを実行したことを意味しません。

- 2026-09-05運用日: 実測1,439件、Block `2,446,724`でConfirmed。
- 2026-09-06運用日: 実測1,439件、Block `2,446,764`でConfirmed。
- 2026-09-09 Stop Protection確認: Collection中の直接停止RequestをRejected。

Transaction Hash、日付、Source境界、公開Verification Linkは[Release Addendum](current_release_addendum.md)と
[Evidence Matrix](evidence_matrix.md)を参照してください。

## Review CommitでのValidation

| Check | 結果 |
| --- | --- |
| Operational Compact Compile | PASS: 固定Toolchain `0.31.1`、8回路 |
| Source Test | PASS: 運用Workspace合計528件 |
| Managed Source Mock Test | PASS: 4件 |
| Workspace Type Check | PASS |
| Portability / Whitespace Check | PASS |
| Source Gate | クリーンなCheckoutで `npm run verify:source` を実行 |
| Full Deployment Gate | ここでは主張しません。Container Image検証にはDocker環境が必要です。 |

Source Rootから次を実行します。

```bash
npm ci
npm run verify:source
```

## 既知の限界

- Private Proof Inputを扱うBackendとProof ServerはTrusted Boundaryです。
- Public VerifierはPublic Contract / Transaction Stateを読みますが、ZK VerifierをLocalで再実行しません。
- Proofが確認するのは登録済みThresholdと24 Slot Summaryの関係です。Physical Sensorの正確性、取得の連続性、欠落値の隠匿がないこと、Aggregationの正しさは証明しません。
- Browser WorkflowはReview用のSynthetic Measurement Sourceです。Field Deviceの自動処理と運用制御は実装済みですが、Partner期間の信頼性は未検証です。
- Public Repository、`midnightntwrk` Topic、その他のSubmission MetadataはSource Gateとは別に提出時点で確認します。
