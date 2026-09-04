# API連携簡易証明モード 実装方針書

## 1. 目的

顧客の既存クラウドAPIから固定24時間分の計測値を取得し、顧客にMidnight Walletを要求せずに
しきい値判定を証明する。既存のSensor Registryコントラクト、登録済みPolicy、Proof Server、
非同期Job、PrivateなServer Wallet、第三者検証経路を再利用する。

既存の審査用GUIは変更しない。簡易証明モードは独立した`/managed-proof/`ページと
`/api/v1/managed-sources` APIで提供する。

## 2. 信頼境界

Managed Backendは、対向APIの認証、応答検証、正規化、時間別集約、Private Witnessの準備、
Proof要求を行うTrusted Componentとする。Midnightは、Privateな時間別最大・最小が公開した
時間別判定およびオンチェーン登録済みPolicyと一致することを検証する。

API連携モードは、顧客API、その上流デバイス、物理センサーが正しい測定値を生成したことを保証しない。
Connector認証は設定済みAPIアカウントを識別し、応答検証・冪等記録・監査証跡は処理を追跡可能にするが、
測定元の真正性を証明するものではない。

対向APIからしきい値を受け取らない。処理時には登録済みPolicy Assignmentを参照し、Compact
回路もSensor Registry上の同じPolicyを参照する。

秘密値の責務を分ける。

- Connector Credential：対向APIだけを認証し、D1保存前に暗号化する。
- Managed Attestor Root：Managed Sourceごとに異なるDevice Contract Authorityを導出する。
- Managed Attestor Root：Source由来のDevice Identityとして日次証明を認可する。
- Operator Authority：Device、Policy、Assignmentの管理処理を認可する。
- Server Wallet：DUSTを保持し、許可済みTXの作成・証明・手数料付与・送信を行う。

`midnight-server-wallet`は、1つのWallet SDK Instanceと1つのContainer Applicationである。1つの
Wallet Seedと、独立した2つのCompact認可秘密値を受け取り、すべてのWallet更新処理を直列化し、暗号化した
同期Checkpointを1つだけ保持する。これはProcess分離よりContainer費用とChain再生費用の削減を優先する
設計判断である。Proof Serverは別Containerのままとする。Server WalletはDUST付与・送信前に、設定済み
Contractと許可Circuitを検証し、Public HTTP Routeを持たない。

## 3. 処理構成

```text
Cloudflare Access認証済み管理者
  -> Managed Source登録API
     -> D1へConnector設定とJob状態
     -> Connector Credentialは暗号化

Cronまたはテスト実行
  -> Managed Source Queue: fetch-window
     -> 対向HTTPS APIから[periodStart, periodEnd)を取得
     -> Schema・Source・期間・単位・重複を検証
     -> メモリ上で24時間枠へ集約
     -> PrivateなServer Walletの準備Route
        -> 24時間枠のPrivate WitnessとCommitmentを生成
     -> D1へ時間別運用集計
     -> R2へ準備済みPrivate 24時間枠Artifact
     -> 日次Proof Jobを1件作成

Managed Source Queue: attest-window
  -> PrivateなServer WalletのAttestation Route
     -> Source固有Contract Authorityを導出
     -> submitDailyAttestationを構築
     -> Proof ServerでZKP生成
     -> 許可されたコントラクト呼出し形式を検証
     -> DUST付与・送信・Indexer確定待ち
  -> D1をConfirmedへ更新
  -> 既存の第三者検証APIで公開検証
```

QueueへはIDだけを入れる。Credential、Raw値、Private extrema、Nonce、Wallet秘密値は入れない。

## 4. 登録

管理者はSource ID、表示名、Project、登録済みPolicy、Adapter、HTTPS Endpoint、対向Sensor ID、
認証方式、Credential、Sensor Type、Unit、開始運用日、取得猶予時間を登録する。

サービスはProjectとSource IDから内部Proof Subject IDを決定的に生成する。D1 Device Mirrorを
`unregistered`で作成し、Operator認可されたMidnight登録をQueueへ入れる。PrivateなServer Walletは
`MANAGED_ATTESTOR_ROOT_SECRET`からSource固有の公開Contract Authorityを導出し、その公開値とOperator
Authorityを使って`registerDevice`と`registerPolicyAssignment`を作成・証明・手数料付与・送信する。
秘密のDevice AuthorityはWorkerへ返さない。両TX確定後にSourceを`active`にする。

同一内容の再登録は既存結果を返し、同じIDへの異なる固定設定は`409 Conflict`とする。

## 5. 固定24時間範囲

処理範囲は登録済みAssignmentから自動計算する。

```text
periodStart = operationalPeriodStart(periodDate, timeZoneOffset, localDayStartHour)
periodEnd   = periodStart + 24時間
対象範囲    = [periodStart, periodEnd)
```

任意のfrom/to指定は受け付けない。定期処理は`periodEnd + fetchDelayMinutes`以降に開始する。
管理者向けテスト／Backfill APIは`periodDate`だけを受け付ける。

「24時間分が溜まる」は1,440件揃うことではなく、24時間の対象期間が終了することを意味する。
欠損時間は`NO DATA`、有効な空レスポンスは24時間すべて停止として証明する。

## 6. 正規化・保存

`fixed-window-json-v1` Adapterは、固定範囲GET、HTTP確認、Body上限、Schema確認、Source／期間確認、
Sample ID・時刻・有限値・単位確認、重複排除、範囲外拒否、24枠集約を順番に実行する。正規化した
値はPrivateなContainer Binding経由でServer Walletへ渡し、既存形式のPrivate Witnessと
Commitmentを準備する。Source固有Contract AuthorityはWorkerへ返さない。その後、D1/R2保存と
Proof Job作成を行う。

Raw sampleは集約後に保持しない。D1の時間別count/minimum/maximum/averageは、認証済み管理者だけが
監査目的で閲覧する非公開の内部情報であり、第三者検証APIや公開Proofには含めない。R2にはProofに必要な
24枠、Nonce、Commitmentに束縛するMetadataだけをAES-256-GCMで認証暗号化して保存する。Confirmed後は
Private Artifactを削除し、失敗Artifactは7日後に削除する。削除失敗時はD1参照を残して定期処理で再試行する。

## 7. 冪等性

| 境界 | 冪等キー |
| --- | --- |
| Source登録 | `projectId + sourceId` |
| 日次実行 | `sourceId + periodDate` |
| 時間別集計 | `deviceId + periodStart + periodEnd` |
| Proof Job | 決定的なRun ID |
| Contract | `deviceCommitment + measurementGroupId` |

D1状態を処理の正とする。Consumerは期待する旧状態を条件にLeaseを取得し、完了済み・不要な重複
Messageをackする。FetchのLeaseは2分とする。登録・Proof送信前には対象の権限WalletとSponsor Walletを最大10秒で確認し、
未同期／無応答なら試行回数を消費せず60秒後にQueue再試行する。Container更新処理は5分で打ち切り、
中断したClaimは6分後に回収する。中断後は既存R2 Artifactを再利用し、NonceやCommitmentを作り直さない。

## 8. エラー処理

| 条件 | 取扱い |
| --- | --- |
| DNS・接続・TLS・Timeout | 一時障害。上限付き指数Backoffで再試行 |
| HTTP 408・425・429・5xx | 一時障害。上限付き`Retry-After`を考慮 |
| HTTP 401・403 | 設定修正が必要。`action_required`で自動再試行停止 |
| HTTP 404 | Endpoint／Source ID確認が必要 |
| Redirect | 明示登録されていない転送として拒否 |
| Body／件数上限超過 | Data error。修正まで停止 |
| JSON／Schema不正 | Data error。修正まで停止 |
| Source／期間Echo不一致 | Data error。修正まで停止 |
| Sensor Type／Unit不一致 | Data error。修正まで停止 |
| 範囲外時刻／有限でない値 | Data error。修正まで停止 |
| 同一内容の重複Sample | 1件へまとめて続行 |
| 同じIDで内容が異なるSample | Data error。修正まで停止 |
| 時間欠損／空の日 | 正常。`NO DATA`として証明 |
| Queue重複配送 | D1状態を確認して副作用を再実行せずack |
| Proof Server停止／Busy | Private Artifactを保持して再試行 |
| 権限Wallet／Sponsor Wallet未同期 | Container更新処理へ入らず、試行回数を消費せず60秒後に再試行 |
| DUST不足 | 再試行し、運用Alertを発報 |
| Policy Assignment不整合 | `action_required`。別しきい値への差替えは禁止 |
| 同じMeasurement Groupが記録済み | Chain証跡を復元し、再送しない |
| Submit結果不明 | 既知TX identityをIndexerで照合してから再試行 |

Error・Auditには固定Error Codeと秘匿済み要約だけを残す。

## 9. 独立GUI

`/managed-proof/`では、Project／Policy選択、Source登録、オンチェーン登録状況、日付指定テスト、
Fetch・検証・集約・Proof・権限Wallet・Sponsor Wallet・確定の進捗、管理者向け時間別集計、第三者検証／Explorer
リンクを表示する。Loading、Empty、Action Required、Retrying、Queued、Completedを区別する。

## 10. 完了条件

疑似対向API仕様は
[`mock_measurement_source_api.md`](../implementation/mock_measurement_source_api.md)を使用する。
正常1,440件、外れ値、欠損、空日、全エラー分類、各冪等境界、中断再開を自動試験する。

最終的にPreprodでManaged Sourceの実TXをConfirmedにし、既存第三者検証で確認する。さらに
Repository全Test／Typecheck／Build、API SCT、既存Browser審査フロー、稼働中Edge Deviceの回帰を
完了条件とする。

## 11. デプロイ設定

Workerをデプロイする前に、専用Queue、DLQ、Private R2 Bucketを作成する。

```bash
npm run cloudflare:resources:managed-attestation
```

`MANAGED_ATTESTOR_ROOT_SECRET`、`MANAGED_CONNECTOR_CREDENTIAL_KEY`、
`MANAGED_ARTIFACT_ENCRYPTION_KEY`には、互いに異なる32 byte値を使用する。権限`0600`の無視対象`.env`へ
手動設定するか、次のコマンドで未設定値だけを一度生成し、復旧情報として厳重に保管する。これらと既存の
`SPONSOR_WALLET_SEED`を、値を画面へ表示せずWorker Secretへ設定する。Wallet Seedは
`midnight-server-wallet`だけが使い、Compact認可秘密値と暗号化鍵は引き続き別々に管理する。

```bash
npm run cloudflare:config:managed-attestation -- --generate
npm run cloudflare:deploy
```

Source登録後にManaged Attestor Rootを作り直してはならない。Source固有Contract Authorityを
決定的に導出する元だからである。通常のWorker再デプロイでは既存Secretは変更されない。

## 12. Preprod受入実績

本章は当時配備した6回路ContractとWorkerの履歴証跡である。互換性のない現行8回路Sourceと分離Wallet
Runtimeは、Live動作として説明する前に再配備と新しいE2E証跡が必要である。

2026-09-03 JSTに、Compact Toolchain `0.31.1`、Proof Server `8.1.0`、Wallet SDK `1.2.0`、
Midnight.js `4.1.1`、Wrangler `4.127.0`、Gateway Version
`9cf41713-9bfd-4c7c-9f12-289b0252169d`でManaged API全経路を実行した。

| Evidence | 実測結果 |
| --- | --- |
| Source登録 | Device／Policy Assignmentを67.318秒で確定 |
| 固定期間Fetch | HTTP 200、115,047 bytes、1,440件 |
| 集約 | 観測24時間、各時間60件、停止Slotなし |
| Proof Server | 要求時に起動。主`/prove`呼出し45.667秒 |
| Proof生成 | 2026-09-03 01:08:40.250 JST |
| Midnight確定 | 2026-09-03 01:09:11.230 JST、Block 2,375,455 |
| Sponsor Fee | 703,370,000,000,001 specks |
| Repository検証 | Compact 6回路、417 Test、全Type Check／Build／Wrangler dry-run成功 |

確定Proof Jobは
`proof-b7cce717a5a6d8d3ed30fbcb610dfcce520ded59d74a640cca4648ddbdc3890c`、
Transaction Hashは
[`7464966f8ecbcd9088564e8ec1d8e130fa240795fc4d68496109a49d375b49a7`](https://preprod.midnightexplorer.com/transactions/7464966f8ecbcd9088564e8ec1d8e130fa240795fc4d68496109a49d375b49a7)
である。TX Hashだけを使う英語版第三者GUIで、Ledger 4検査とUI 5 Stageがすべて完了した。
Browser Resource TraceはPublic Preprod Indexerへ接続し、D1 APIを使用しなかった。Public Responseは
24時間別Result、Policy、Assignment、Commitment、Transaction、Blockを含む一方、Raw Reading、
時間別Extrema、Nonce、Connector Credential、Wallet Secretを含まなかった。

この実行では、D1 Audit TriggerのWriteも`meta.changes`へ加算されるためQueue Claimは正数を成功と
判定すること、および同一Cloudflare Zoneの別Workerが提供するPublic APIを通常の外部APIと同じ経路で
呼ぶにはCloudflare公式の
[`global_fetch_strictly_public`](https://developers.cloudflare.com/workers/runtime-apis/fetch/)
が必要なことも確認した。顧客Endpointは任意のPublic HTTPS APIなので、テスト専用Service Bindingでは
なくPublic ModeをGatewayへ設定する。

上限付きRecovery修正をGateway Version `dc5f990d-9943-4242-8066-21a55645aab9`として配備し、次の
日次処理を手動Run要求・手動再試行なしで確認した。Cronは2026-09-02 UTC分を09:15:54 JSTに作成し、
Fetch試行1回目で09:15:59に同じ115,047 bytes／1,440件を取得した。Proof試行1回目で09:16:55に
ZKPを生成し、09:17:20にBlock 2,380,338で確定した。すべてのManaged Runは`confirmed`であり、
未解決の運用Alertは0件だった。

自動RunのProof Jobは
`proof-de93c256b03322e49702ba144d0628814c5b1bf59284ae2131e1256dad0b332b`、Transaction Hashは
[`42e77f4e65ee03fe634feffdbba634e9099b220f55ed0b1de0a66391f718b12d`](https://preprod.midnightexplorer.com/transactions/42e77f4e65ee03fe634feffdbba634e9099b220f55ed0b1de0a66391f718b12d)
である。Sponsor Feeは704,620,000,000,001 specks、TX Sizeは9,371 bytesだった。TX Hashだけを使う
第三者GUIはLedger 4検査に再度成功し、Resource TraceはPublic Preprod Indexerへ接続してD1 APIを
使用しなかった。
