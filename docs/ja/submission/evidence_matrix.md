# Wave 1 Evidence Matrix

最新版の成果物一覧・9月11日の検証結果・未完了項目は[最終成果物まとめ](final_delivery.md)を参照してください。`af90ad8`と496件の記載は9月5日までの基準記録です。

[English](../../submission/evidence_matrix.md)

検証日: 2026-09-05 JST
実装基準: `af90ad8`
Preprod Evidence日: 2026-09-03 JST

Local Source検証と記録済みPreprod Transactionは意図的に分けます。Runtime EvidenceにはDevice起点の
運用日AttestationとWallet不要Managed API Attestationがあり、いずれもWorker／GUI Deployからの推定では
ありません。

| ID | 審査用Claim | Source / Design Evidence | 現行Local検証 | Runtime / Preprod Evidence | Boundary |
| --- | --- | --- | --- | --- | --- |
| CLAIM-01 | Raw ReadingとPrivate OpeningはPrivate Sourceに残し、上限付き時間別Summaryは第三者Evidenceではなく制限付きOperator Dataとして扱う | Browser Privateな疑似Capture、Summary API、補助的な現場集約、Privacy仕様 | Frontend、Gateway、Shared、現場Runtime Boundary Test成功 | 記録済みRunで1,440件の疑似Readingを集約して上限付きSummaryをUpload | Trusted Backendは認可済みSummaryを保存する。Wave 1は現場自律運用や別経路が存在しないことまで主張しない |
| CLAIM-02 | PolicyとDevice AssignmentをProof前に登録する | Policy / Assignment Circuit、Fleet Registry仕様 | Contract Compile、Simulator 18 Test成功 | 運用日Policy / Device-bound AssignmentをPreprod記録 | Public Policy、Assignment、運用日起点をProof前に固定 |
| CLAIM-03 | 24時間ExtremaとNonceはPrivate Witnessである | sensor-registry、Public Field Map | CompileとRedaction Test成功 | Public Verifier RecordにExtrema / Nonceなし | Trusted BackendはTransit中のProof Inputを見る |
| CLAIM-04 | 真のWITHIN / OUTSIDEを同一Daily Circuitで証明する | submitDailyAttestationとTest | 28,699 rows、k=15、成功 / Reject Test成功 | 現行ContractにManaged API OUTSIDEと認証済みDevice WITHINを確認 | Sensorの真実性や完全性は証明しない |
| CLAIM-05 | Missing Hourを「計測なし」として表す | Wave 1仕様、Daily Input Utility | Canonicalな計測なしSlot Test成功 | 対応するUTC時間のPublic Resultを「計測なし」として公開 | Missing Dataは不正検知ではない |
| CLAIM-06 | User Transaction Authority、現場API Identity、Service Fee Authorityを分離する | Browser認可と補助的な現場Agent Boundary | Frontend、Identity Agent、Transaction Agent Test成功 | 認可済みPreprod Transaction記録 | Hardware保護Attestationは将来 |
| CLAIM-07 | Proof ServiceはUserの代理認可をできない | Proof Flow、Transaction Authorization Source | Boundary / Execution Lock Test成功 | Proof生成後にUserがCallを認可 | BackendはProof Inputに対してTrusted |
| CLAIM-08 | Browser APIはPublic / 認可済みRedacted Stateだけを返す | Gateway API Test、Frontend責任設計 | Gateway 246、Dashboard 78 Test成功 | Public VerifierにTX hash、運用日／境界、24時間別結果、Policy／有効期間、Device Commitment、Block、TX | BrowserはPublic IndexerのTX／Contract Action Stateを直接照合するがZK VerifierをLocal再実行しない |
| CLAIM-09 | PoCで1,440 Reading / Dayを固定24 Slot Proofとして扱う | Aggregation、Cost Benchmark | 24 / 96 / 1,440 Fixed Shape Test成功 | 現行の認証済みDevice 1,440件WITHIN TXをBlock 2,385,898で確定 | 1 Source / DayはFleet Load Testではない |
| CLAIM-10 | 必須の運用Compact ContractがCompile・配備されている | midnight/contracts/sensor-registry、配備記録 | 8 Circuit全てCompile成功 | 現行8回路Contractを2026-09-03に配備し、Managed API／Device Attestationを確定 | 今後の非互換Source変更には新しい配備・Evidenceが必要 |
| CLAIM-11 | Repository Verificationが成功する | Root verify、Workspace Script | 496 Test、Typecheck、Build、API SCT、22 Checkpoint GUI SCT、Wrangler dry-run、Portability成功 | 現行Proof Gateway／GUIと別MCP Workerを配備。2026-09-05に公開MCPが現行2 TXをLive確認 | Local検証と配備Runtime確認は別Evidence |
| CLAIM-12 | GUIが疑似計測WorkflowとPublic Verificationを接続する | Dashboard Source、Route、Test | Dashboard Build、78 Test成功 | D1 APIなしでTX Hash単独のHosted検証完了 | 統合審査UIは本番Role分離ではない。英語デモ動画を作成済み、公開URL待ち |
| CLAIM-13 | 登録済みCloud APIからWallet不要Managed Attestationを完走できる | Managed Source Adapter、Queue Consumer、暗号化Private R2 Artifact、分離Compact Authority、統合Server Wallet、独立`/managed-proof/` GUI | 疑似対向、Error分類、冪等性、Managed GUI Test成功 | 現行ContractのBlock 2,385,826に1,440件／観測24時間を記録。公開MCPはD1なしで正しい2時間OUTSIDEを確認 | Backendと登録済みSourceはTrustedだが、取得元の真実性は保証しない |
| CLAIM-14 | Support自動化と公開検証を最小権限の別Workerへ分離する | MCP Security Boundary、別Wrangler設定、Binding一覧、Access／Redaction設計 | 共通Verifier 3件、Support MCP 11件、Verification MCP 5件、両Wrangler dry-run成功 | 非認証Private Hostを遮断。公開MCPはTX Hash Tool 1つだけを公開し現行2 Recordを確認 | Support結果はRedact済みD1最終観測でありLive Container操作ではない。公開MCPは運用Bindingなし |

## 現行検証Command

    TMPDIR=/tmp npm run verify

このWSL環境では、tsxのIPC SocketをWindows Temp Mountではなく/tmpへ生成するためTMPDIRを明示します。初回RunはCompact Compile成功後、IPC生成のENOTSUPで停止しました。上記の再実行は最後まで成功しています。

## Test内訳

| Workspace | 成功数 |
| --- | ---: |
| Shared | 20 |
| sensor-registry Contract | 18 |
| Public Attestation Verifier | 3 |
| Dashboard | 78 |
| Development CLI | 5 |
| Device Auth | 6 |
| Edge Agent | 16 |
| Device Wallet Agent | 32 |
| Proof Gateway | 246 |
| Sponsor Wallet | 52 |
| Support MCP | 11 |
| Verification MCP | 5 |
| Mock Measurement Source | 4 |
| 合計 | 496 |

## 履歴Preprod Reference

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

## 現行8回路Reference

- Contract: `48636e2f7ae8b1705134b026ec0d5a910357cac990a60adce2c2672e1a78a732`
- 配備TX: [`00ea92883cba9ff8b753a3308d6d2127ac3f81c2643f09840a449588197a32cbdf`](https://preprod.midnightexplorer.com/transactions/00ea92883cba9ff8b753a3308d6d2127ac3f81c2643f09840a449588197a32cbdf)
- Managed API OUTSIDE: [`35b8a83050d910ae94862be565c718b09764e51fd69979eaff1ed3dee93bb532`](https://preprod.midnightexplorer.com/transactions/35b8a83050d910ae94862be565c718b09764e51fd69979eaff1ed3dee93bb532)、Block 2,385,826、1,440件、観測24時間、範囲外2時間
- 認証済みDevice WITHIN: [`7e93c537e85dbc16892716429b0f426e731999775b0cef460bd4b0d358c42b40`](https://preprod.midnightexplorer.com/transactions/7e93c537e85dbc16892716429b0f426e731999775b0cef460bd4b0d358c42b40)、Block 2,385,898、1,440件、観測24時間
- 公開検証再確認: 2026-09-05 JST、両Hashで5 Ledger Check成功、D1／Private Input不使用

最終Release監査では実装基準`af90ad8`に続く文書Commitを記録し、実行Sourceを変更した場合は同じ検証
Commandを再実行します。
