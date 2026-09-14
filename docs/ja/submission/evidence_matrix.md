# Wave 1 Claim / Evidence Matrix

[English](../../submission/evidence_matrix.md)

Review Target: チェックアウトした `main` コミット（`git rev-parse HEAD`）
Source Validation: 2026-09-14 JST
Preprod Deploy: 2026-09-03 JST

各RowはProduct Claimを追跡対象のSource、Test、または日付付きPublic Transaction Recordへ対応付けます。Local生成物とPrivate Runtime StateはRepository Evidenceに含めません。

| ID | 審査用Claim | 追跡対象Source / Design | 再現可能なValidation | Public Record | Boundary |
| --- | --- | --- | --- | --- | --- |
| CLAIM-01 | Raw ReadingとPrivate OpeningはPrivate Sourceに残り、上限付きHourly SummaryはOperator Dataに限定 | Browser Source、Summary API、Field Aggregation、[Privacy Spec](../../security/private_spec.md) | Frontend、Gateway、Shared、Field Runtime Boundary Test | [Release Addendum](current_release_addendum.md)の日付付きIntake Record | Backendは認可済みSummaryを保存。Physical Truthや別Source排除は主張しない |
| CLAIM-02 | PolicyとDevice AssignmentをProof前に登録 | Contract Policy / Assignment Circuit、[Fleet Registry](../../security/device_registry.md) | Contract Compile、Simulator Test | 現行Contract DeployとRecord | Public Policy、Assignment、Day BoundaryはProof前に固定 |
| CLAIM-03 | Hourly ExtremaとNonceはPrivate Witness Data | [Contract Source](../../../midnight/contracts/sensor-registry/src/sensor-registry.compact)、Public Field Map | Compile、Redaction Test | Public VerifierはExtrema / Nonceを返さない | Trusted BackendはTransit中のPrivate Proof Inputを見る |
| CLAIM-04 | WITHIN / OUTSIDEは同じDaily Circuitで証明 | `submitDailyAttestation` CircuitとTest | 8回路Compile、成功 / Reject Test | Managed OUTSIDEとDevice WITHINの現行Contract Record | Sensorの真実性や完全性は証明しない |
| CLAIM-05 | Missing HourをNO DATAとして表す | [Wave 1 Spec](../../architecture/wave1_spec.md)、Daily Input Utility | Canonical No-data Slot Test | 対応SlotにNO DATAを公開 | Missing Dataは不正検知ではない |
| CLAIM-06 | User Authority、Field API Identity、Service Fee Authorityを分離 | Client認可、Identity、Transaction Agent、Sponsorship Boundary | Frontend、Identity、Transaction Agent、Gateway Test | 認可済みPreprod Transaction | Hardware保護Attestationは将来 |
| CLAIM-07 | Proof ServiceはUserの代理認可をできない | Proof Flow、Transaction Authorization Source | Boundary / Execution Lock Test | Proof生成後にCallを認可 | BackendはPrivate Proof Inputに対してTrusted |
| CLAIM-08 | Browser APIはPublic / 認可済みRedacted Stateだけを返す | Gateway API Test、Frontend責任設計 | Gateway / Dashboard Test | TX HashからDate、Result、Policy、Commitment、Block、TXをPublic Verifierが返す | Public VerifierはZK VerifierをLocal再実行しない |
| CLAIM-09 | 1,440 Reading / Dayを固定24 Slot Proofで扱う | Aggregation Utility、[Cost Benchmark](../../implementation/cost_benchmark.md) | 24 / 96 / 1,440 Fixed Shape Test | 認証済みDevice 1,440件WITHIN Record | 1 Source / DayはFleet Load Testではない |
| CLAIM-10 | 運用Compact ContractがCompile・Deploy済み | `midnight/contracts/sensor-registry`、Deploy Record | 8回路Compile | [現行Deploy Transaction](https://preprod.midnightexplorer.com/transactions/00ea92883cba9ff8b753a3308d6d2127ac3f81c2643f09840a449588197a32cbdf) | 非互換Source変更には新しいDeployとEvidenceが必要 |
| CLAIM-11 | Repository Verificationが再現可能 | Root Script、Workspace Script | `npm ci && npm run verify:source` | Deploy Recordは別Evidence | Container Image ValidationにはDockerが必要 |
| CLAIM-12 | Review InterfaceがMeasurement、Proof Status、Public Verificationを接続 | Dashboard Source、Route、Test | Dashboard Build / Test | TX Hash検証はD1なしでPublic Indexer Stateを読む | 統合Review UIはProduction Role分離ではない |
| CLAIM-13 | Registered Managed SourceがServer Wallet経由でAttestationを完了 | Managed Source Adapter、Queue Consumer、Private Artifact Boundary、Compact Authority、Server Wallet | Mock Source、Error分類、冪等性、Managed Flow Test | [Managed OUTSIDE Transaction](https://preprod.midnightexplorer.com/transactions/35b8a83050d910ae94862be565c718b09764e51fd69979eaff1ed3dee93bb532)、Block 2,385,826 | Backendと登録SourceはTrusted。Upstreamの真実性は保証しない |
| CLAIM-14 | Support AutomationとPublic VerificationをLeast Privilegeの別Workerへ分離 | MCP Security Boundary、Wrangler設定、Binding一覧、Access / Redaction設計 | Shared Verifier 3、Support MCP 11、Verification MCP 5 Test | Public MCPが現行Recordを解決。Private HostはAccess保護 | SupportはRedacted Operational State、Public MCPはOperational Bindingなし |

## Source Validation Command

```bash
npm ci
compact update 0.31.1
npm run verify:source
```

`verify:source`はソース限定レビュー境界、Portability、Operational Compact Compile、全Source Test、Workspace Type Checkを実行します。Device Secret、Wallet Recovery Material、Deployment Credential、稼働中Networkは使いません。

## Review TargetのTest内訳

| Workspace | 成功数 |
| --- | ---: |
| Shared | 20 |
| sensor-registry Contract | 18 |
| Public Attestation Verifier | 3 |
| Dashboard | 94 |
| Development CLI | 5 |
| Device Auth | 6 |
| Edge Agent | 20 |
| Device Wallet Agent | 43 |
| Proof Gateway | 247 |
| Sponsor Wallet | 52 |
| Support MCP | 11 |
| Verification MCP | 5 |
| **運用Workspace合計** | **524** |
| Managed Source Mock | 4 |
| **`npm test`合計** | **528** |

TestはSource Suiteの結果です。Public Transaction Recordは日付付きNetwork Evidenceであり、Local Testから推定しません。
