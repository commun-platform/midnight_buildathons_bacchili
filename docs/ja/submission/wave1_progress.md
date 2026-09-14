# Wave 1 Progress Record

[English](../../submission/wave1_progress.md)

対象期間: 2026-08-27〜2026-09-14 JST
Review Commit: `b72efb7d4df8384a9e8dd873b8e3a65f6e9e5fbd`

## このRecordの読み方

Repository HistoryはWave 1開始日に始まるため、この文書はReview Commitに含まれる実装とValidationを記録します。
過去のPublic Releaseとの差分を推測しません。日付付きNetwork RecordはSource Checkとは分けて記載します。

## Wave 1で実装した領域

| 領域 | 実装 | 検証 |
| --- | --- | --- |
| Zero-knowledge Proof | Public Threshold Check、WITHIN / OUTSIDE、固定24時間Input、NO DATA | 8回路Compile、Contract Test 18件 |
| Field Integration | Measurement Collection、Hourly Aggregation、API認証、Transaction認可、Update、Rollback | Collector、Authentication、Transaction Agent TestがPass。自律した長期Production運用は主張しません |
| Backend | Device / Managed Cloud認証、Proof Request受付、Workflow保存、Proof生成、Consolidated Server Wallet、Redacted / Public API | Gateway 247件、Server Wallet 52件、Pre-deployment Check |
| Frontend | Operator Workflow、Public Third-party View、日英表示 | Frontend TestとProduction Build |
| Midnight Integration | Public Threshold、Proof Subject、User認可Transaction、Managed Attestation、Service Fee Sponsorship | Simulator Testと現行8回路Preprod Record |
| Operations / Support | Access保護Health / Metrics / Audit Console、通知、Private Support MCP、Public Verification MCP | Shared Verifier、Support MCP、Verification MCP Test |
| Safety | Tamper Rejection、Duplicate Prevention、Execution Lock、Config Downgrade Rejection、Corrupt State隔離 | 自動TestでFailure Caseを網羅 |

Source Location、Test、Validation Limitは[Claim / Evidence Map](evidence_matrix.md)を参照してください。

## Wave 1で行った主な改善

1. 1運用日を固定24時間へ正規化し、個別Reading数でProof Costが増えないようにしました。
2. RegistrationをProject単位にし、WITHIN / OUTSIDEを正しく扱えるようにしました。
3. API認証、Contract Authority、Midnight Transaction認可を分離しました。
4. Proof Request Workflowで重複実行を防ぎ、同時実行数を制限しました。
5. Operator StepとThird-party Evidenceを明示的なState Transitionで確認できるようにしました。
6. Field RuntimeでContent Validation、Version管理、失敗UpdateのRollback、Credential保護を行います。
7. Registered Managed Sourceが固定Proof ModelとServer Walletで日次Attestationを完了します。
8. Operations Evidenceを保護Console、Private Support MCP、Public Transaction Verificationへ分離しました。

## Review Commitで確認した結果

- Repository Portability CheckがPass。
- `sensor-registry`の8 Proof CircuitをCompile。
- 運用Workspace Test 524件とManaged Source Mock Test 4件（合計528件）がPass。
- 全WorkspaceのType CheckがPass。
- 日付付きPreprod Contract / Transaction Recordは[Release Addendum](current_release_addendum.md)に記載。

## 現在の限界

- Private Proof Inputを扱うBackendとProof ServerはTrusted Boundaryです。
- Public VerifierはPublic Contract / Transaction Stateを読みますが、ZK VerifierをLocal再実行しません。
- ProofはPhysical Sensorの正確性、連続Sampling、Readingを隠していないこと、Source Aggregationの正しさを保証しません。
- Operator ViewとThird-party ViewはReview用に統合しており、ProductionのRole / Application分離は未完了です。
- Field Deviceの自動処理は実装済みですが、Partner期間の信頼性と長期Production運用は未検証です。

## Next Waves

- **Wave 2:** Real Field System接続、日次Lifecycle自動化、Organization / Role分離、Partner Loadでの運用基盤検証、Paid Partner Pilot。
- **Wave 3:** Hardware-protected Identity / Provenance、組織横断運用、Recurring Revenue・Renewal・Expansion・Unit Economicsの検証。

Wave 2 / Wave 3は計画です。Product / Business Planの正本は[Three-wave Roadmap](../../architecture/three_wave_roadmap.md)です。
