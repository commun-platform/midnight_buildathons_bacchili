# Wave 1 Evidence Matrix

[English](../../submission/evidence_matrix.md)

検証日: 2026-08-31 JST
Local Baseline: b68a3b7ec662a7f00a6e7beebf3b66f8a68a8fc5を基点とする現行Working Tree
Preprod Evidence日: 2026-08-28 JST

Local Source検証と記録済みPreprod Transactionは意図的に分けます。2026-08-31 JSTのWorker／GUI Deployは、既存の日付付きAttestationを新しく生成したという意味ではありません。

| ID | 審査用Claim | Source / Design Evidence | 現行Local検証 | Runtime / Preprod Evidence | Boundary |
| --- | --- | --- | --- | --- | --- |
| CLAIM-01 | Raw ReadingとPrivate OpeningはPrivate Sourceに残し、上限付き時間別Summaryは第三者Evidenceではなく制限付きOperator Dataとして扱う | Browser Privateな疑似Capture、Summary API、補助的な現場集約、Privacy仕様 | Frontend、Gateway、Shared、現場Runtime Boundary Test成功 | 記録済みRunで1,440件の疑似Readingを集約して上限付きSummaryをUpload | Trusted Backendは認可済みSummaryを保存する。Wave 1は現場自律運用や別経路が存在しないことまで主張しない |
| CLAIM-02 | PolicyとDevice AssignmentをProof前に登録する | Policy / Assignment Circuit、Fleet Registry仕様 | Contract Compile、Simulator 13 Test成功 | Schema-5 Policy / Device-bound AssignmentをPreprod記録 | Contract変更なし、Worker／GUIは2026-08-31 JSTにDeploy |
| CLAIM-03 | 24時間ExtremaとNonceはPrivate Witnessである | sensor-registry、Public Field Map | CompileとRedaction Test成功 | Public Verifier RecordにExtrema / Nonceなし | Trusted BackendはTransit中のProof Inputを見る |
| CLAIM-04 | 真のWITHIN / OUTSIDEを同一Daily Circuitで証明する | submitDailyAttestationとTest | 28,699 rows、k=15、成功 / Reject Test成功 | 両結果を2026-08-28に確認 | Sensorの真実性や完全性は証明しない |
| CLAIM-05 | Missing Hourを「計測なし」として表す | Wave 1仕様、Daily Input Utility | Canonicalな計測なしSlot Test成功 | 対応するUTC時間のPublic Resultを「計測なし」として公開 | Missing Dataは不正検知ではない |
| CLAIM-06 | User Transaction Authority、現場API Identity、Service Fee Authorityを分離する | Browser認可と補助的な現場Agent Boundary | Frontend、Identity Agent、Transaction Agent Test成功 | 認可済みPreprod Transaction記録 | Hardware保護Attestationは将来 |
| CLAIM-07 | Proof ServiceはUserの代理認可をできない | Proof Flow、Transaction Authorization Source | Boundary / Execution Lock Test成功 | Proof生成後にUserがCallを認可 | BackendはProof Inputに対してTrusted |
| CLAIM-08 | Browser APIはPublic / 認可済みRedacted Stateだけを返す | Gateway API Test、Frontend責任設計 | Gateway 147、Dashboard 66 Test成功 | Public VerifierにTX hash、運用日／境界、24時間別結果、Policy／有効期間、Device Commitment、Block、TX | BrowserはPublic IndexerのTX／Contract Stateを直接照合するがZK VerifierをLocal再実行しない |
| CLAIM-09 | PoCで1,440 Reading / Dayを固定24 Slot Proofとして扱う | Aggregation、Cost Benchmark | 24 / 96 / 1,440 Fixed Shape Test成功 | 1,440 Reading OUTSIDE TX確認 | 1疑似計測元 / DayはFleet Load Testではない |
| CLAIM-10 | 必須の運用Compact ContractがCompileする | midnight/contracts/sensor-registry | 2026-08-31に6 Circuit全てCompile成功 | 過去のSchema-3 Deploy確認 | 最終提出Commit SHAは未固定 |
| CLAIM-11 | Repository Verificationが成功する | Root verify、Workspace Script | 345 Test、Typecheck、Build、Wrangler dry-run成功 | 2026-09-01 JSTにWorker Version `486db124-ae9f-4bbc-9303-329999538c13`をDeploy | 制限付きDocker dry-runはbuildx状態更新だけ拒否され、Host Accessでの再実行は成功 |
| CLAIM-12 | GUIが疑似計測WorkflowとPublic Verificationを接続する | Dashboard Source、Route、Test | Dashboard Build、52 Test成功 | 日付付きCaptureが審査Flowを表示 | 統合審査UIは本番Role分離ではない。英語デモ動画を作成済み、公開URL待ち |

## 現行検証Command

    TMPDIR=/tmp npm run verify

このWSL環境では、tsxのIPC SocketをWindows Temp Mountではなく/tmpへ生成するためTMPDIRを明示します。初回RunはCompact Compile成功後、IPC生成のENOTSUPで停止しました。上記の再実行は最後まで成功しています。

## Test内訳

| Workspace | 成功数 |
| --- | ---: |
| Shared | 18 |
| sensor-registry Contract | 13 |
| Dashboard | 65 |
| Development CLI | 5 |
| Device Auth | 6 |
| Edge Agent | 14 |
| Device Wallet Agent | 29 |
| Proof Gateway | 147 |
| Sponsor Wallet | 42 |
| 合計 | 339 |

![Engineering Evidenceと検証境界](../../ja/assets/review/engineering-evidence-ja.png)

## 記録済みPreprod Reference

- Contract: 8338d5588fe5662fce86ce3c221f0bd5260a14cdbf372c1dddd58be41e5b3c68
- Transaction: 00e12efda5f33b4804f3659a811d2f5e86c9ce838255a63028d41df85cb0762da9
- Block Height: 2,302,213
- Result: OUTSIDE、verified=true、thresholdSatisfied=false
- Public Policy: 10–35 °C
- Raw Reading、時間別Extrema、Nonce: 非開示

最終Release監査ではLocal Baselineを固定Commit SHAへ置き換え、同じCommandを再実行します。
