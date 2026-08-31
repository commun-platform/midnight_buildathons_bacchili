# Privacy・Public Claim境界

[English](../../security/private_spec.md)

正本は[`wave1_spec.md`](../architecture/wave1_spec.md)です。Wave 1はRaw Sensor値をDevice内に保持し、Cloudflareへ送るのは1時間集計、Anomaly状態遷移、Commitment、Workflow Metadataだけです。

![ZK Proofが証明する範囲、非公開に保つ情報、証明対象外の責任を分離した図](../assets/review/zk-claim-boundary-ja.png)

審査上の中心は、緑・青・赤の3領域を混同しないことです。ゼロ知識証明は、**提出された非公開の時間別最小値・最大値が、登録済みしきい値の範囲内かどうか**を証明します。生のセンサー値や時間別の最小値・最大値は非公開ですが、それだけで物理センサーの真正性、校正、設置品質、連続測定を証明するものではありません。後者はデバイス、ファームウェア、設置および運用監査の責任です。

![データと閲覧者の組合せで整理した保存先と公開範囲](../assets/review/data-location-disclosure-ja.png)

この図は「保存」と「通過」を分けています。Raw値、Private Extrema、Witness、秘密鍵はEdge内に保持し、Frontendは秘密値を保存しません。QueueはJob参照だけを持ち、Private Proving RequestはAdmission後にProof Serverを通過するだけです。Public PolicyとAttestation Evidenceの正本はMidnightです。

## 非公開Data

- Device Identity秘密鍵と平文Opaque Session Token
- Device／Development Midnight Wallet Secret
- Raw Sensor値とPrepared Private Daily Extrema
- Hourly Minimum／Maximum、Commitment Nonce、Witness、Private State
- Transit中以外のProof Request Body

Raw値はTX ConfirmとLocal Retention Policyが削除を許可するまでDevice内に保持できます。D1、R2、Queue Message、Worker Log、Browser Storageへ書きません。

センサーデバイス管理者GUIはDevice Sessionを要求し、そのDeviceの1時間Minimum／Maximum／Average／Count、Anomaly Transition、Device状態、Proof／TX状態だけを表示します。第三者Public APIにこれら集計値を含めません。

Public Proof画面はPeriod、Sample Count、Daily Attestation Commitment、仮名Proof Job ID、Policy Mode／Public Bound／ID／Version／Assignment、Observed／STOPPED Count、証明済みWITHIN／OUTSIDE Result、Attestation TX ID／Hash、Block Height、Network、Contract Addressを表示できます。Observed HourがZeroの場合はSTOPPEDを導出表示します。

運用ContractはThreshold Mode、Minimum／Maximum、Scale、Sensor／Unit Code、Policy Assignment、`thresholdSatisfied`をPublic Ledger Stateへ保存します。そのため製品説明でもThreshold PolicyとWITHIN／OUTSIDE Resultは公開と明記します。ZKが隠すのは提出済みHourly ExtremaとCommitment Nonceであり、OUTSIDEを発生させたHour／実値は開示しません。

Cloudflare Worker／Proof Server ContainerはTransit中のPrivate Proving Requestを扱うTrusted Componentです。Workerは転送前にAuthorization Headerを除去し、BodyをLog／D1／R2／Queueへ保存せずStreamします。DeviceまたはLaceがDevice TX Keyを保持し、FeeなしTXを明示承認します。PrivateなSponsor Wallet ContainerはDUST付与／送信用の分離Sponsor Seedと、固定されたBrowser登録回路用のOperator Authority秘密値を保持します。どちらもPublic RouteやBrowserへ公開しません。

2つのContainer Secretは実行時入力であり、Container Imageの内容ではありません。本番WorkerがCloudflare
Secret Bindingから取得し、Sponsor Wallet Container起動時の環境変数として渡します。Docker Build
Contextと生成Imageには、Sponsor Seed、Operator Authority秘密値、`.env`、`.dev.vars`、Wallet
Checkpoint、Wallet Stateを含めてはいけません。Compile済みCompact Prover／Verifier ArtifactはBuild
Artifactであり、秘密鍵素材ではありません。Local開発ではGit Ignore済みの`.dev.vars`等でCloudflare
Secret Bindingを代替できますが、CommitまたはImageへのCopyは禁止します。
