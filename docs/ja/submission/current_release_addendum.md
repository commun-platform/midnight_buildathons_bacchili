# 現行Release Evidence Addendum

[English](../../submission/current_release_addendum.md)

Status: 2026-09-14 JSTに整理
Review Commit: `b72efb7d4df8384a9e8dd873b8e3a65f6e9e5fbd`

このAddendumは、Source Gateとは独立に確認できる日付付きのMidnightおよびField Operation Evidenceを
記録します。Local Runや生成されたWorkspace出力をRepository Evidenceへ混ぜません。

## Current Midnight Evidence

現行8回路の `sensor-registry` ContractはMidnight PreprodへDeploy済みです。

- Contract: `48636e2f7ae8b1705134b026ec0d5a910357cac990a60adce2c2672e1a78a732`
- Deployment Transaction: [`00ea92883cba9ff8b753a3308d6d2127ac3f81c2643f09840a449588197a32cbdf`](https://preprod.midnightexplorer.com/transactions/00ea92883cba9ff8b753a3308d6d2127ac3f81c2643f09840a449588197a32cbdf)
- Deploy日: 2026-09-03 JST

2つの認可済みIntake Pathが、統合Server Walletを経由して同じContractへ到達しました。

| Intake Path | Input | Public Result | Confirmed Evidence |
| --- | --- | --- | --- |
| Registered Cloud API | 1,440件、24 Observed Hours | OUTSIDE。登録済み10–35 °C Policyの範囲外が2 Slot | [TX `35b8…32`](https://preprod.midnightexplorer.com/transactions/35b8a83050d910ae94862be565c718b09764e51fd69979eaff1ed3dee93bb532)、Block 2,385,826 |
| Authenticated Field Device | 1,440件の1分値を24 Private Hourly Extremaへ集約 | WITHIN。24 SlotすべてがPolicy内 | [TX `7e93…40`](https://preprod.midnightexplorer.com/transactions/7e93c537e85dbc16892716429b0f426e731999775b0cef460bd4b0d358c42b40)、Block 2,385,898 |

2026-09-05 JSTにPublic Verification MCPがMidnight Preprod Indexerから両Hashを独立に解決しました。Contract、
Policy、Device-bound Assignment、運用日境界、Sample / Observed Hour Count、24 Slot結果、Transaction Stateが
一致することを確認しています。Raw Sample、Hourly Extrema、Proof Nonceは返しません。

## 実装済みの運用経路

- **Registered Managed API Attestation:** 認可済みHTTPS Sourceから固定運用日のDataを取得し、Validation、24
  Private Slotへの集約、Proof生成、Server WalletによるFee処理、Submit、Public Verificationまでを実行します。
  これはTrusted Serviceが受け取ったDataとの関係を証明しますが、Upstream Sourceの真実性は証明しません。
- **Consolidated Server Wallet:** 1つのPrivate Stateful Wallet RuntimeがAdministration、Managed Attestor、DUST
  Sponsorshipを別々のAuthorization SecretとSerialized Mutationで処理します。Proof ServerはKeyless Containerとして分離します。
- **Operations Evidence:** Access保護ConsoleがWallet同期、DUST、Workflow Backlog、日次Metric、Redacted Traceを表示します。
  日本語Discord Incidentには通知Grace Periodがあり、Sponsored SubmissionはIdempotent Receiptを作成します。
- **分離したMCP境界:** Private Support MCPはRedacted D1 Bindingだけを持つAccess保護Worker、Public Verification MCPは
  D1、R2、Queue、Container、Secret、Service Bindingを持たない別Workerで、`verify_attestation_transaction`だけを公開します。

## 9月7–9日のField Operation Record

Field Deviceには日次Submitの自動処理を実装しています。5分間隔のTimerが完了日を処理し、同じPrivate Preparationを
Retryし、Confirmed済みReceiptの日はSkipします。

| 運用日 (JST) | 実測数 | Observed Slot | Block | Confirmed Transaction |
| --- | ---: | ---: | ---: | --- |
| 2026-09-05 | 1,439 | 24 | 2,446,724 | `832152cf417a9d6228720822144c006e7a2db2a17f7b3fbf9152a3a1c2bbfc93` |
| 2026-09-06 | 1,439 | 24 | 2,446,764 | `26b7872adbecd1cf811fbb61b48f3177295c80bfddd3d8a5e51d95bd3ac97bb5` |

Receipt Identity、日境界、Count、Ledger Resultが一致し、再実行で重複Submitが発生しないことを確認しました。実測値は
1,440ではなく1,439件です。[Stop Protection Record](../../implementation/collector_stop_protection_execplan.md)では、
Collection中の直接StopがRejectedされ、Collectorが継続したことを確認しています。Sponsorの02:00 JSTは処理開始時刻であり、
Confirmation Deadlineではありません。

これらは日付付きの観測Recordです。Partner期間の信頼性や連続稼働を証明せず、このReview Commitで新しいLive Recheckや
Redeployを行ったとは主張しません。

## Source Validation

- Compact Toolchain `0.31.1`で運用8回路をCompile。
- Review Commitで運用Workspace Test 524件とManaged Source Mock Test 4件（合計528件）がPass。
- 設定済みType CheckとPortability CheckがPass。
- MCP ValidationがPass: Shared Public Verifier 3件、Private Support MCP 11件、Public Verification MCP 5件。

Clean CheckoutのSource Gate:

```bash
npm ci
npm run verify:source
```

Source Gateと2つのTransaction Recordは別種のEvidenceです。Local TestやWorker DeploymentがConfirmed Midnight
Transactionの代わりになることはありません。

## Claim Boundary

Proofが確認するのは、登録済みThresholdと固定24 Slot Summaryの関係です。Physical Sensorの正確性、取得の連続性、
欠落値の隠匿がないこと、Measurement Source Aggregationの正しさは証明しません。Private Proof Inputを扱うBackendと
Proof ServerはTrusted Boundaryであり、Public VerifierはZK VerifierをLocalで再実行せずPublic Contract Stateを読み取ります。
