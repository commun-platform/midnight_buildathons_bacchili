# 計測データ真贋性証明システム Private State／Dual Ledger仕様

[English](../private_spec.md)

## 1. 目的

本システムは、Edge Deviceの温度Readingを運用目的で保存しつつ、Raw値やPrivateなPolicy ThresholdをMidnightへ公開せずに、限定されたClaimを第三者が検証できるようにします。

```text
温度センサー → 認証付きWorker → Privateな運用Database
                                      ↓ 現地0時台のCron
                            pending Attestation record

準備済みの実Dataset → Device Wallet／ZKP → Midnight Public Ledger
```

2つの経路はどちらも実装済みですが、pendingのD1 recordとDevice Wallet commandを接続する常駐Attestation Agentは含まれていません。現在、D1へ書き戻される結果はTrustedな外部Callerから提供されます。

## 2. Privacy Boundary

### 運用Private Data

認証済みCloud Operator境界は以下を保持します。

- Raw温度値と受信Timestamp
- ProjectとDeviceのIdentifier
- PrivateなNormal Range PolicyとOutlier判定
- 処理ErrorとSubmit Error

ClientはWorker APIを通じてのみD1へAccessします。ただし、[GUI公開範囲](#7-gui公開範囲)に記載するとおり、現在のRead APIにはUser認証層がありません。Ingestion、Attestation Control、Proof Gatewayには別々のBearer Secretを使用します。

### Midnight Private State

Raspberry PiのDevice Wallet Host上にある暗号化運用Stateは、送信したPrepared Datasetごとに以下を保持します。

- 提供された全Sensor Record
- 選択したSample IndexとNonce
- 選択したSampleの深さ11のMerkle Path
- 最小・最大Threshold
- Device WalletのRecovery MaterialとDevice Private State Password

これらを`.env.device`、`.env.development`、Browser Storage、Browserから見える環境変数、Worker Log、Midnight Public Stateへ入れてはいけません。Device Credentialは`~/.midnight/midnight-cloudflare-demo/device-wallet/`配下だけに置きます。別系統の開発／Deployer Walletは`.env.development`とその安全なBackupだけに置き、Piの運用Releaseへ含めません。

### Public State

運用`sensor-registry` Contractは以下を公開します。

```text
datasetRoot
deviceCommitment
periodStart / periodEnd
sampleCount
schemaVersion
dataset.verified
registrationCount / verificationCount
lastVerifiedRoot / verificationResult
```

Worker Verification APIは、D1にあるAgent報告のTransaction ID、Transaction Hash、Block Height、Count、Workflow Statusも返す場合があります。最小値、最大値、Raw値、選択したNonce、Merkle PathはPublic Verification Responseに含まれません。

Public Ledgerでは直接の運用Device IDではなくCommitmentでDeviceを表現します。

開発専用のDaily Benchmarkは、より大きな提案Public Schema（`dayRoot`、`hourClaimsRoot`、Policy／Signature Bundle Commitment、Hourly Count、Reason Hash）を持ちます。これらは運用Contractや現在のDashboard連携には含まれません。

## 3. Dual Ledger

| Ledger | 目的 | データ |
| --- | --- | --- |
| D1、将来Turso | 運用と時系列Query | Raw値、Device、時刻、Workflow状態 |
| Midnight | 運用Public Contract State | Dataset Root、Device Commitment、期間、件数、Verified Flag、Counter |

各運用Readingは内部Attestation IDを参照できます。Attestation rowはProtected Result APIから提供されたMerkle RootとTransaction Metadataを保存できますが、現在のWorkerはそのRootを導出せず、TransactionをSubmitせず、提供されたChain Resultを独立して検証しません。D1からTursoへ移行してもPublic Ledger SchemaとPrivacy Boundaryを変更してはいけません。

## 4. Daily Attestation

Workerは各Projectの現地0時台に、前日分のAttestationを起票します。

```text
Pending → Aggregating → Proving → Submitted → Confirmed / Failed
```

Cronは`pending` recordを作成してReadingを関連付けます。Protected APIにより外部Agentがclaimし、後続Stateを報告できますが、その外部AgentはこのRepositoryには実装されていません。収録されているDevice Wallet CLIは、代わりに明示的なPrepared Datasetを受け取り、そのPrivate部分を暗号化Device Private Stateとして保存し、Remote Trusted Proof Serverを通じて`registerDataset`と`verifySensorValue`を送信します。Collector Process自体はWalletやProof Runtimeを読み込みません。

## 5. Compact Contract

運用`sensor-registry` ContractはPublicなDataset Metadataを登録し、Privateに選択した1つのLeafを検証します。

```text
private selected SensorLeaf
private selected nonce
private minimum / maximum
private Merkle path
```

Circuitは選択したPersistent CommitmentとMerkle Rootを再計算し、Thresholdの順序と選択温度の範囲を検査します。すべての検査に成功した場合だけ、登録済みDatasetのPublicな`verified` flagを設定します。全Recordが存在すること、順序どおりであること、範囲内であることは証明しません。

生成される24、96、1,440 ReadingのDaily Profileは、完全なHourly Classification、Policy Commitment、回路外Device Signature、追記型Reason Hashという拡張設計を実装します。開発用Test／Benchmarkだけで使用し、ArtifactはPi ReleaseへExportされず、そのPublic Evidenceを現在のWorker Workflowは保存しません。

Benchmark Contract内の`appendOutlierReason`は、Day RootとHourにReason Hashを保存し、Revisionは最新の`previousReasonHash`を参照します。

## 6. Trust Model

選択済みの運用経路はPrivate PreimageがCloudflare Containerへ届くため、ContainerをTrusted Proverとして扱います。AccessはBearerで保護し、Proof InputをGatewayでLog／永続化せず、Container／WorkerへのAccessを監査可能にする必要があります。D1 BackendもRaw ReadingとNormal Range Policyを扱うTrusted Boundaryです。将来、Contractを変更せずにOperator管理Proverへ置き換えられます。

## 7. GUI公開範囲

現在のRead APIとSPAにはUser認証層がないため、Public DeployするとD1の時系列参照Viewも公開されます。Raw ReadingをOperator限定として扱う前にAccess Controlを追加してください。Third-Party Viewは期間、件数、Agent報告のProof Check、Root、設定済みContract Address、Transaction ID、Block Heightだけを表示します。Midnightを照会せず、Signatureも独立して検証しません。

## 8. テスト要件

- 運用Testは有効な選択Leafを受け入れ、範囲外値、Raw値改ざん、Commitment改ざん、Merkle Path改ざんを拒否します。
- Daily Benchmark Testは別途、24時間分のClaim、分類件数、Policy差替え、Sequence欠損、Signature、無効なReason Predecessorを検証します。
- 無認証のIngestionとAgent Updateを拒否します。
- Public Verification ResponseにRaw値、Threshold、Nonce、Merkle Pathを含めません。
