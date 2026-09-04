# Wave 1 Evidence Matrix

[English](../../submission/evidence_matrix.md)

検証日: 2026-09-03 JST
Local Baseline: 現行Working Tree
Preprod Evidence日: 2026-09-03 JST

Local Source検証と記録済みPreprod Transactionは意図的に分けます。Runtime EvidenceにはDevice起点の
運用日AttestationとWallet不要Managed API Attestationがあり、いずれもWorker／GUI Deployからの推定では
ありません。

| ID | 審査用Claim | Source / Design Evidence | 現行Local検証 | Runtime / Preprod Evidence | Boundary |
| --- | --- | --- | --- | --- | --- |
| CLAIM-01 | Raw ReadingとPrivate OpeningはPrivate Sourceに残し、上限付き時間別Summaryは第三者Evidenceではなく制限付きOperator Dataとして扱う | Browser Privateな疑似Capture、Summary API、補助的な現場集約、Privacy仕様 | Frontend、Gateway、Shared、現場Runtime Boundary Test成功 | 記録済みRunで1,440件の疑似Readingを集約して上限付きSummaryをUpload | Trusted Backendは認可済みSummaryを保存する。Wave 1は現場自律運用や別経路が存在しないことまで主張しない |
| CLAIM-02 | PolicyとDevice AssignmentをProof前に登録する | Policy / Assignment Circuit、Fleet Registry仕様 | Contract Compile、Simulator 15 Test成功 | 運用日Policy / Device-bound AssignmentをPreprod記録 | Public Policy、Assignment、運用日起点をProof前に固定 |
| CLAIM-03 | 24時間ExtremaとNonceはPrivate Witnessである | sensor-registry、Public Field Map | CompileとRedaction Test成功 | Public Verifier RecordにExtrema / Nonceなし | Trusted BackendはTransit中のProof Inputを見る |
| CLAIM-04 | 真のWITHIN / OUTSIDEを同一Daily Circuitで証明する | submitDailyAttestationとTest | 28,699 rows、k=15、成功 / Reject Test成功 | 以前のOUTSIDEと現行運用日のWITHINを確認 | Sensorの真実性や完全性は証明しない |
| CLAIM-05 | Missing Hourを「計測なし」として表す | Wave 1仕様、Daily Input Utility | Canonicalな計測なしSlot Test成功 | 対応するUTC時間のPublic Resultを「計測なし」として公開 | Missing Dataは不正検知ではない |
| CLAIM-06 | User Transaction Authority、現場API Identity、Service Fee Authorityを分離する | Browser認可と補助的な現場Agent Boundary | Frontend、Identity Agent、Transaction Agent Test成功 | 認可済みPreprod Transaction記録 | Hardware保護Attestationは将来 |
| CLAIM-07 | Proof ServiceはUserの代理認可をできない | Proof Flow、Transaction Authorization Source | Boundary / Execution Lock Test成功 | Proof生成後にUserがCallを認可 | BackendはProof Inputに対してTrusted |
| CLAIM-08 | Browser APIはPublic / 認可済みRedacted Stateだけを返す | Gateway API Test、Frontend責任設計 | Gateway 224、Dashboard 75 Test成功 | Public VerifierにTX hash、運用日／境界、24時間別結果、Policy／有効期間、Device Commitment、Block、TX | BrowserはPublic IndexerのTX／Contract Action Stateを直接照合するがZK VerifierをLocal再実行しない |
| CLAIM-09 | PoCで1,440 Reading / Dayを固定24 Slot Proofとして扱う | Aggregation、Cost Benchmark | 24 / 96 / 1,440 Fixed Shape Test成功 | Device起点の運用日1,440件WITHIN TXをBlock 2,369,094で確定 | 1疑似計測元 / DayはFleet Load Testではない |
| CLAIM-10 | 必須の運用Compact ContractがCompileする | midnight/contracts/sensor-registry | 2026-09-03に8 Circuit全てCompile成功 | 旧6回路の運用日ContractとAttestationをPreprod確認 | 互換性のない8回路ContractはPreprod再配備が必要 |
| CLAIM-11 | Repository Verificationが成功する | Root verify、Workspace Script | 448 Test、Typecheck、Build、API SCT、22 Checkpoint GUI SCT、Wrangler dry-run成功 | 旧Worker Version `dc5f990d-9943-4242-8066-21a55645aab9`を2026-09-03 JSTにDeploy | 現行Hardening変更はLocal検証済み、未配備 |
| CLAIM-12 | GUIが疑似計測WorkflowとPublic Verificationを接続する | Dashboard Source、Route、Test | Dashboard Build、75 Test成功 | D1 APIなしでTX Hash単独のHosted検証完了 | 統合審査UIは本番Role分離ではない。英語デモ動画を作成済み、公開URL待ち |
| CLAIM-13 | 登録済みCloud APIからWallet不要Managed Attestationを完走できる | Managed Source Adapter、Queue Consumer、暗号化Private R2 Artifact、分離した権限／Sponsor Wallet経路、独立`/managed-proof/` GUI | 疑似対向、Error分類、冪等性、Managed GUI Test成功 | 旧Preprod配備で1,440件の日次処理を2日連続確定。修正後の自動RunはFetch／Proof各1試行でBlock 2,380,338に確定し、TX Hash GUIはD1 APIなしでPublic Indexerへ接続 | Backendと登録済みSourceはTrustedだが、取得元の真実性は保証しない |

## 現行検証Command

    TMPDIR=/tmp npm run verify

このWSL環境では、tsxのIPC SocketをWindows Temp Mountではなく/tmpへ生成するためTMPDIRを明示します。初回RunはCompact Compile成功後、IPC生成のENOTSUPで停止しました。上記の再実行は最後まで成功しています。

## Test内訳

| Workspace | 成功数 |
| --- | ---: |
| Shared | 20 |
| sensor-registry Contract | 18 |
| Dashboard | 75 |
| Development CLI | 5 |
| Device Auth | 6 |
| Edge Agent | 15 |
| Device Wallet Agent | 32 |
| Proof Gateway | 224 |
| Sponsor Wallet | 49 |
| Mock Measurement Source | 4 |
| 合計 | 448 |

## 記録済みPreprod Reference

- Contract: 0abb6d408a5b8fedbdab9e0fff59f1a5570d3c94af0059bf44b36b3669ee9ddd
- Transaction Hash: 92569ab4d9c49661dcca78253b785c2a154672285231244cae14c4a0caf604a3
- Block Height: 2,369,094
- Result: WITHIN、verified=true、thresholdSatisfied=true
- Public Policy: 10–35 °C
- Raw Reading、時間別Extrema、Nonce: 非開示

Managed API受入Reference:

- Proof Job: `proof-b7cce717a5a6d8d3ed30fbcb610dfcce520ded59d74a640cca4648ddbdc3890c`
- Transaction Hash: [`7464966f8ecbcd9088564e8ec1d8e130fa240795fc4d68496109a49d375b49a7`](https://preprod.midnightexplorer.com/transactions/7464966f8ecbcd9088564e8ec1d8e130fa240795fc4d68496109a49d375b49a7)
- Block高: 2,375,455
- 入力／結果: API 1,440件、観測24時間、24時間すべてWITHIN
- Public検証: 4検査成功。TX Hash経路はD1 APIを使用せずPublic Indexerへ接続

修正後の自動回帰Reference:

- Proof Job: `proof-de93c256b03322e49702ba144d0628814c5b1bf59284ae2131e1256dad0b332b`
- Transaction Hash: [`42e77f4e65ee03fe634feffdbba634e9099b220f55ed0b1de0a66391f718b12d`](https://preprod.midnightexplorer.com/transactions/42e77f4e65ee03fe634feffdbba634e9099b220f55ed0b1de0a66391f718b12d)
- Block高: 2,380,338
- 入力／結果: API 1,440件、観測24時間、24時間すべてWITHIN
- 実行: Cronによる自動作成、Fetch試行1回、Proof試行1回、手動Retryなし

最終Release監査ではLocal Baselineを固定Commit SHAへ置き換え、同じCommandを再実行します。
