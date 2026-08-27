# 計測データ真贋性証明システム Private State / Dual Ledger 仕様

[English documentation](../private_spec.md)

## 1. 目的

Edge Deviceから受信したセンサー値をTrusted Cloudで時系列管理し、Raw値や判定閾値をMidnightへ公開せず、条件を満たすことだけを第三者が検証できる状態にする。

```text
Edge Device → Cloudflare Worker → D1 private operator data
                                     ↓ daily orchestration
                              Attestation Agent / ZKP
                                     ↓
                            Midnight public ledger
                                     ↓
                          Public Verification GUI
```

## 2. Privacy Boundary

### Operator Private Data

Cloudflareの認証済みoperator領域で保持する。

- Raw Sensor Dataと受信時刻
- Project / Deviceの実ID
- 外れ値判定と非公開閾値
- Attestation処理エラー

D1はPublic Verification APIから直接参照させない。Edge ingestion、Attestation Agent、Proof Gatewayには用途別Bearer tokenを使用する。

### Midnight Private State

Raspberry Pi上のDevice Wallet Agentが暗号化運用Private Stateとして保持する。

- 日次Sensor Samples
- Sample nonce
- threshold min / max
- 24時間分の入力とCommitment nonce
- Private Policyのopening
- デバイスWallet mnemonicとDevice Private State password

これらを`.env.device`、`.env.development`、ブラウザ、Worker環境変数、Midnight Public Ledgerへ渡さない。デバイスcredentialsは`~/.midnight/midnight-cloudflare-demo/device-wallet/`だけに置く。別系統の開発／Deployer Walletは`.env.development`とその安全なbackupだけに置き、Pi用配布物へ含めない。

### Public State

Midnight Ledgerと第三者Verification APIには次だけを公開する。

```text
dayRoot / hourClaimsRoot
deviceCommitment
policyCommitment
signatureBundleHash
periodStart / periodEnd
sampleCount
daily anomalyCount
schemaVersion
verificationResult
transactionId / blockHeight
```

公開する時間Claim文書は`hourRoot`、`sampleCount`、`normalCount`、`anomalyCount`、`allWithinRange`を持ち、そのCanonical Compact Hashが`hourClaimsRoot`と一致しなければならない。1時間1件の場合にRaw値を漏らすため、min / max / averageとPolicy範囲は公開しない。

Device IDは直接公開せず、commitmentで表現する。

## 3. Dual Ledger

本システムの記録は二層に分離する。

| Ledger | 目的 | 主なデータ |
| --- | --- | --- |
| Cloud operational store（D1、将来Turso） | 運用・時系列参照 | Raw値、Device、受信時刻、処理状態 |
| Midnight | 改ざん検知可能な公開証跡 | commitment、期間、件数、検証結果 |

両者はRaw値で結合せず、日次`datasetRoot`とZK Proofで整合性を証明する。Operational storeの各Readingは内部`attestationId`で処理単位へ関連付ける。Storage移行後もPublic LedgerとPrivacy Boundaryは変更しない。

## 4. 日次Attestation

Project timezoneの現地0時台に、Worker scheduled handlerが前日分のAttestationを作成する。

```text
Pending → Aggregating → Proving → Submitted → Confirmed / Failed
```

Device Wallet Agentは各SampleのPersistent Commitment、24個の時間Root、1個の日次Rootを生成し、Proof Inputを暗号化Device Private Stateへ保存する。継続処理はremote trusted Proof Server経由の1つの全件Proof Txとし、登録／deployは開発サーバから初回に行う。Collector process自体はWalletとProof runtimeを読み込まない。

## 5. Compact Contract / Witness

24件、96件、1,440件Profileは同じ本番ロジックを持つ。`submitDailyAttestation`はWitnessから以下を受け取る。

```text
privateDay
operatorSecret
```

回路は次を検証する。

1. 全SampleのPersistent Commitment、時間Root、日次Rootを再計算する。
2. Private PolicyのCommitmentが登録済みPolicyと一致することを確認する。
3. 全日のsequenceに欠損、重複、並べ替えがないことを確認する。
4. 各時間で`normalCount + anomalyCount = sampleCount`を保証する。
5. 全検証成功時だけ`verified = true`をPublic Stateへ記録する。

Device Ed25519署名は設計どおり回路外で検証する。各署名は時間Root、件数、sequence範囲、schema version、firmware IDを含み、Bundle HashをAttestationへ保存する。第三者検証はMidnight Proofと24署名の両方を必須とする。

`appendOutlierReason`は日次Rootと時間にReason Hashを追記し、変更時は最新`previousReasonHash`との一致を強制する。

## 6. Proof Server Trust Model

### 現在の構成

採用する本番経路ではCloudflare Containerへprivate preimageを渡すため、CloudflareをTrusted Proverとして扱う。用途別Bearer Secretで制限し、GatewayはProof Inputをログまたは永続化せず、アクセスを監査可能にする。

### Production

将来Operator管理Proverへ置換する場合もContractとPublic Evidence Schemaは変更しない。BrowserにはPrivate InputやWallet Secretを渡さない。

## 7. GUI公開範囲

Operator向け画面は最新値と時系列値を表示できる。第三者Verification画面は以下だけを表示する。

- 対象期間、件数、処理状態
- 日次ZKP、24時間Claim、Device署名の成否
- Day Root、Hour Claims Root、contract address、Tx ID、block height
- Raw value、threshold、nonce、Private Stateが非公開である旨

Public APIレスポンスにRaw Sensor Dataを含めない。

## 8. テスト要件

- 正常: 全日と24時間Claimが成立し`Verified`
- 閾値違反: 外れ値へ漏れなく一度だけ分類される
- Raw改ざん: 日次Root不一致で`Rejected`
- Policy差替えとsequence欠損: `Rejected`
- Device／Operator署名改ざん: 回路外検証で`Rejected`
- Reason predecessor不一致: `Rejected`
- API境界: 無認証ingestion / agent更新を拒否
- 公開情報: Verification APIにRaw値・閾値・secretが含まれない

## 9. 完成条件

温度センサー実測値の受信、D1時系列保存、日次Attestation、Private State生成、Dataset登録、ZK検証、Midnight Tx、第三者GUIでの公開検証までを一連で実行できることを完成条件とする。
