# システム構成

[English](../system_architecture.md)

この文書は本番日次Attestation経路と、残るStorage移行を示します。実線は実装済みの連携、破線は任意の将来置換です。

## デプロイ構成

```mermaid
flowchart LR
    Browser["運用者／第三者ブラウザ"]

    subgraph Edge["Edge Device — 信頼する計測境界"]
        Sensor["温度センサー"]
        Collector["リソース制限付きsystemd Collector<br/>Wallet／Compact／Proverなし"]
        DeviceAgent["運用Transaction Agent<br/>独立デバイスWallet"]
        Signer["計測署名鍵<br/>Secure Element推奨"]

        Sensor --> Collector
        Signer -. "時間Rootへ署名" .-> Collector
        Collector -. "準備済みPrivate Dataset" .-> DeviceAgent
    end

    subgraph Operator["開発サーバ — Build／Deploy境界"]
        Compiler["Compact Compiler<br/>回路 + Proving Key"]
        Release["運用専用Device Release"]
        Agent["Development CLI<br/>Compile + Deploy"]
        Wallet["開発／Deployer Wallet<br/>.env.development"]

        Compiler --> Agent
        Compiler --> Release
        Wallet --> Agent
    end

    subgraph Cloudflare["Cloudflare — 現在のTrusted Cloud境界"]
        Worker["Worker<br/>Ingestion API + Read API + SPA + Cron"]
        StoragePort["SqlDatabase Port"]
        D1[("D1<br/>現在の時系列DB")]
        Turso[("Turso / libSQL<br/>将来のDB")]
        Container["Proof Server Container<br/>本番Trusted Prover"]

        Worker --> StoragePort
        StoragePort --> D1
        StoragePort -. "将来Adapter" .-> Turso
    end

    subgraph Midnight["Midnight Preprod"]
        Contract["Sensor Registry<br/>Compact Contract"]
        PublicLedger[("Public Ledger<br/>Root + 期間 + 件数 + 結果 + Tx")]
        Contract --> PublicLedger
    end

    Collector -->|"HTTPS計測データ"| Worker
    Collector -. "時間Root + デバイス署名" .-> Worker
    Browser -->|"同一Origin GUI／API"| Worker
    Worker -->|"認証済み日次Claim"| DeviceAgent
    DeviceAgent -->|"状態 + 公開結果"| Worker
    DeviceAgent -->|"認証済みPrivate Proof Input"| Container
    DeviceAgent -->|"デバイスWalletから送信"| Contract
    Agent -->|"初回deploy"| Contract
    Release -. "compile済みruntimeだけ転送" .-> DeviceAgent
    Worker -->|"公開検証データのみ"| Browser
```

Cloudflare ContainerはPrivate Proof Inputを受け取るため、本番のTrusted Boundaryに含めます。Gatewayはアクセスを認証し、Proof Inputをログまたは永続化してはいけません。Operator管理Proverへの置換は将来Optionです。

## 日次真贋性証明

```mermaid
flowchart TD
    Reading["Canonical Private Reading<br/>device + timestamp + sequence + temperature"]
    Nonce["測定ごとの秘密Nonce"]
    Leaf["Leaf Commitment"]
    HourRoot["Persistent時間Root"]
    Signature["デバイスEd25519署名<br/>Root + 時間 + 件数 + 連番範囲"]
    DailyProof["1日1回のZKP"]
    HourClaims["24時間分のClaim<br/>正常件数 + 外れ値件数<br/>allWithinRange"]
    DayRoot["日次Dataset Root"]
    PublicResult["Midnight Public State<br/>Root + 期間 + 件数 + 検証結果"]
    Reason["追記専用の外れ値理由<br/>担当者署名 + 理由Hash"]

    Reading --> Leaf
    Nonce --> Leaf
    Leaf --> HourRoot
    HourRoot --> Signature
    Reading --> DailyProof
    Nonce --> DailyProof
    HourRoot --> DailyProof
    Signature --> SignatureCheck["回路外署名検証"]
    DailyProof --> HourClaims
    DailyProof --> DayRoot
    HourClaims --> PublicResult
    DayRoot --> PublicResult
    SignatureCheck --> PublicResult
    Reason -. "日次Root + 時間と関連付け" .-> PublicResult
```

回路は全CommitmentとRootを再計算し、sequence完全性、Private Policyとの結合、時間別分類の完全性を証明します。Ed25519デバイス署名は回路外で検証し、Bundle HashをMidnight Attestationへ保存します。第三者検証では両方を必須とします。

## 信頼境界とデータ

| 境界 | Private／Publicデータ | 責務 |
| --- | --- | --- |
| Edge Device | Sensor値、ingestion token、デバイス運用Wallet、暗号化運用Private State | 計測、認証付き送信、remote prover経由の継続Tx、永続診断。Compiler／Deploy／local proverなし |
| 開発サーバ | Compact source／artifact、proving key、`.env.development`のWallet backup | Build、test、benchmark、Contract deploy、運用専用配布物生成 |
| D1／将来Turso | 運用Raw値、受信時刻、処理状態、外れ値理由 | 時系列運用と運用者監査 |
| Cloudflare Worker | API認証、日次起票、Attestation状態、公開レスポンス | オーケストレーション。ブラウザへ秘密を公開しない |
| Midnight | Dataset Root、Device Commitment／公開鍵登録、期間、件数、証明結果、Tx情報 | 改ざん検知可能な第三者検証 |

## 実装状況

- **実装済み:** Development／Device Collector／Device Walletのworkspace分離、Wallet保管先分離、運用専用release builder、リソース制限と永続診断付きsystemd Collector、Worker配信SPA／API、D1 Adapter、Cloudflare Trusted Proof Gateway、固定Profileの日次全件回路source、署名付き時間Root、分類完全性、追記型Reason Hash。
- **残る連携:** 本番Contract/ProfileのDeploy、Preprod実Tx測定、GUIへの全Evidence表示、Turso Adapter。
