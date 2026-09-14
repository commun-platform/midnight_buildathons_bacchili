# BACCHIRI!━━Verifiable Measurement Layer

[English](../../submission/one_page_brief.md)

## Customer Value

**センサー値を第三者へ見せず、登録済みThresholdの範囲内かを証明します。**

Construction MeasurementはEquipment Provider、Rental Company、Contractor、Project Owner、Auditorなど複数組織で利用されます。
Raw MeasurementをReviewへ渡すと、必要以上の情報を開示することがあります。

BACCHIRI!━━Verifiable Measurement Layerは、ValueをPrivateに保ちながらResultを確認できるVerification Layerです。既存の
Measurement EquipmentやManagement Systemを置き換えません。

![Private Valueを保ったThreshold Compliance](../assets/review/privacy-value-proposition-ja.png)

## PrivateとPublic

| Private | Public |
| --- | --- |
| Raw Sensor Value | Operational Date / Registered Day Boundary、`deviceCommitment` |
| Hourly Minimum / Maximum | ThresholdのBounds、Unit、Scale、Version、Validity |
| Proof Nonce | 24 Hourly WITHIN / OUTSIDE / NO DATA Result、Count |
| Device Signing Key、Wallet Information | Midnight Transaction、Block Record |

## How it works

1. User認可ClientがDaily Measurement Recordを作り、Raw ValueとPrivate OpeningをPrivate Stateに保持します。
2. Readingを24 Hourly Slotへ集約し、上限付きSummaryを認可済みOperator Workflowへ送ります。
3. Trusted Managed Backendが制限付きSummaryを保存し、Proofを生成します。
4. UserがTransactionを認可し、ServiceがServer WalletでFeeを処理します。
5. Midnightが24 Hourly Result、Policy / Validity、Device Commitment、Transaction Evidenceを記録します。

## Review Targetでの確認

- Compact Toolchain `0.31.1`で8 Proof CircuitをCompile。
- 運用Workspace Test 524件とManaged Source Mock Test 4件（合計528件）がPass。
- Type Check、Portability Check、再現可能なSource GateがPass。
- 現行8回路ContractをMidnight PreprodへDeploy。
- Managed OUTSIDE日と認証済みDevice WITHIN日を日付付きRecordとして保持し、どちらも24 Slot Proofへ集約。
- Public Verification MCPがPublic IndexerからTransaction Hashを解決し、Private Valueを返さない。

## このProofだけでは証明しないこと

Physical Sensorの正確な値、24時間の連続Sampling、Measurement Sourceの正しいAggregationは証明しません。Proof生成中のHourly
Minimum / MaximumはTrusted Managed Backendが扱います。Public VerifierはPublic Midnight Stateを比較し、ZK VerifierをLocal再実行しません。

## Adoption Path

Wave 1はReview用PoCとしてCore Proofを検証し、Managed IntakeとOperations Foundationを含みます。Wave 2はReal Field System接続、
日次自動化、Organization / Role分離、Partner Loadでの検証、Paid Pilotを進めます。Wave 3はHardware-protected Identity / Provenanceで
Source Trustを減らし、Recurring Revenueと持続可能なUnit EconomicsでProduct-market Fitを検証します。[Canonical Roadmap](../../architecture/three_wave_roadmap.md)を参照してください。

技術参照は[Repository Review Guide](README.md)、[Claim Matrix](evidence_matrix.md)、[Current Release Addendum](current_release_addendum.md)にまとめています。
