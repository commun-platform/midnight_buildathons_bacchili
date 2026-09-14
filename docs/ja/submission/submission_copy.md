# Wave 1 Submission Copy

[English](../../submission/submission_copy.md)

## Project Title

BACCHIRI!━━Verifiable Measurement Layer

## One-line Pitch

センサー値を第三者へ見せず、登録済みThresholdの範囲内かを証明します。

## Short Description

BACCHIRI!━━Verifiable Measurement Layerは、1日の運用Dataを24時間SlotごとのPrivateな最小値・最大値へ集約し、
各SlotのWITHIN、OUTSIDE、NO DATAをProofとして公開します。認可済みClientがMeasurement Recordを作成して
Midnight Transactionを認可し、Managed Sourceも同じProofとServer Walletの経路を使います。

## Problem

Measurement ResultはDashboard、CSV、Report、Cloud Systemで共有されます。ConstructionのNoise、Vibration、
TemperatureなどのReportは、Equipment Provider、Rental Company、Contractor、Project Owner、Auditorなど
複数組織で利用されます。そのため、Review側はReportを作った組織やSystemを信頼しなければならない場合があります。
本Projectが問うのは、運用前に登録したThreshold内に、その日のPrivate Hourly Minimum / Maximumが入っていたかという
限定されたCryptographic Questionです。

## Solution

- **Measurement Source:** Daily Recordを作り、Raw ValueとPrivate Proof Openingを認可済みClientに保持し、上限付きHourly SummaryをOperator Workflowへ送ります。
- **Review Interface:** Operator StepとThird-party Viewをまとめ、Private Valueを出さずにProof Flowを確認できます。
- **Managed Backend:** 認可済みSummaryとWorkflow Recordを保存し、Proof Requestを受けてTrusted ComponentとしてProofを生成します。
- **Midnight:** 運用期間と境界、24 Hourly Result、Public Threshold / Validity、Target Device Commitment、Count、Transaction Recordを記録します。

![Raw Dataの公開から必要最小限のEvidenceへ](../assets/review/privacy-value-proposition-ja.png)

## Wave 1 Progress

Wave 1では、Project単位のProof Subject / Policy登録、Synthetic Daily Record、固定24 SlotのPrivate Proof Input、
Proof Request管理、Managed Proof生成、User認可とService Fee処理を分離したMidnight Transaction、Operator / Third-party
Review Interfaceを実装しました。

現在は、Registered Managed Intake、Consolidated Server Wallet、Access保護Operations Console、Redacted Audit / Metrics、
Discord Alert、Private Read-only Support MCP、Public Transaction Verification MCPも実装済みです。Partner期間のProduction
MaturityはWave 2の成果です。

Review Commit `b72efb7d4df8384a9e8dd873b8e3a65f6e9e5fbd` を2026-09-14 JSTに検証しました。

- Proof Circuit 8回路をCompile。
- 運用Workspace Test 524件とManaged Source Mock Test 4件（合計528件）がPass。
- 全WorkspaceのType CheckとPortability CheckがPass。
- `npm ci && npm run verify:source`でSource Gateを再現可能。

現行8回路Contractは2026-09-03 JSTにDeploy済みです。Managed API OUTSIDE Transactionは
[35b8a83050d910ae94862be565c718b09764e51fd69979eaff1ed3dee93bb532](https://preprod.midnightexplorer.com/transactions/35b8a83050d910ae94862be565c718b09764eaff1ed3dee93bb532)
(Block 2,385,826)です。認証済みField Deviceは独立したWITHIN Recordを
[Block 2,385,898](https://preprod.midnightexplorer.com/transactions/7e93c537e85dbc16892716429b0f426e731999775b0cef460bd4b0d358c42b40)に記録しました。
Public Verification MCPはPublic Indexerから両Hashを解決しました。Source ValidationとLive Network Recordは別のEvidenceです。
詳細は[Current Release Addendum](current_release_addendum.md)を参照してください。

## Exact Proof Claim

Confirmed Daily Proofは、登録済み運用日の24時間Slotについて、Private Minimum / Maximumと登録済みThresholdからPublic Resultを確定します。
Day、Count、Device Commitment、Policy / Validity、Proof Input CommitmentもBindingします。

Physical SensorのIntegrity、Samplingの連続性、Readingを隠していないこと、Source側Aggregationの正しさは証明しません。現行構成では
Managed BackendとProof ServiceをTrusted Boundaryとし、Public VerifierはZK VerifierをLocal再実行せずConfirmed Contract Stateを比較します。

## Target Users and Adoption

最初のCommercial Use CaseはConstruction SiteのMeasurement Verificationです。Wave 1ではTemperature Measurement Pathを検証します。
Noise、Vibration、その他のMeasurement Typeは専用のThreshold、Input Format、Validation Ruleが必要で、現行Featureとは主張しません。

チームは既存EquipmentとSales / Rental Channelを使うIndustry PartnerとのField Proof of Conceptを検討しています。これはCommercialization
Progressであり、Technical Validationの完了ではありません。将来はCold Chain、Food / Pharmaceutical Storage、Research Equipment、Regulated Facilityにも展開します。

## Three-stage Delivery Plan

- **Wave 1 — Core Proof PoC:** Synthetic Measurement Source、Synthetic Daily Record、Review InterfaceでPrivacy Valueを検証。
- **Wave 2 — Operational Partner Pilot:** Real Field System接続、日次自動化、Organization / Role分離、Partner Loadでの運用基盤検証、Paid Pilot。
- **Wave 3 — Trust Minimization and PMF:** Hardware-protected Identity / Provenance、組織横断運用、Recurring RevenueとUnit Economicsの検証。

完全なProduct / Business Planは[Three-wave Roadmap](../../architecture/three_wave_roadmap.md)にあります。Wave 2 / Wave 3は計画項目です。

## Repository References

- Repository: [GitHub](https://github.com/commun-platform/midnight_buildathons_private_sensor2026)
- [Claim / Evidence Matrix](evidence_matrix.md)
- [Current Release Evidence](current_release_addendum.md)
- [Technical Gate Checklist](technical_gate_checklist.md)
- [Judge Review Guide](README.md)

RepositoryのPublic設定、`midnightntwrk` Topic、Submission Formの項目は提出時点で確認します。
