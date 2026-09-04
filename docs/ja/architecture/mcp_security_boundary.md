# MCPのセキュリティ境界

[English](../../architecture/mcp_security_boundary.md)

## 1. 目的

本システムでは、Model Context Protocolサーバーを用途別に2つへ分離します。公開Proof Gatewayの
URL PathだけではSecurity Boundaryとして不十分なため、公開機能と非公開機能を、異なるHost、
異なるBinding、異なるAccess Policyを持つ別々のCloudflare Workerとして配備します。

| Worker | 利用者 | Endpoint | 参照できる情報 |
| --- | --- | --- | --- |
| `midnight-support-mcp` | 認可済みカスタマーサポート担当者 | 設定済み`SUPPORT_MCP_HOST` + `/mcp` | Redact済みD1運用状態だけ |
| `midnight-verification-mcp` | 公開 | 設定済み`VERIFICATION_MCP_HOST` + `/mcp` | Midnight Preprodの公開TX／Contract Stateだけ |

どちらも`midnight-proof-gateway`のRouteではありません。2つのMCP Worker間にService Bindingはなく、
公開Workerへ非公開ToolをCompileしません。

## 2. 非公開カスタマーサポートMCP

Cloudflare Accessは`SUPPORT_MCP_HOST`に設定したHostの`/mcp`だけでなくHost全体を保護します。
Allow Policyは承認済みの`support@commun-platform.com`だけを含み、MCP Client向けに
Managed OAuthを有効にします。さらにWorker内で次の二段目の認可を行います。

1. Access TeamのRemote JWKSで`Cf-Access-Jwt-Assertion`を検証する。
2. Issuer、RS256、当該Access Application固有のAudienceを検証する。
3. D1の`system_operator_grants`に有効なGlobal `viewer`または`operator`権限があることを確認する。
4. Tool名、認証済み担当者、結果、所要時間を`operational_events`へ監査記録する。

JWTなし、不正JWT、Audience不一致、D1権限なし、想定外Host／Browser Originは、照会前に拒否します。
Access ApplicationをWorkerより先に作成し、配備時にはHost、Audience、Managed OAuth、単一Email
Policyが一致しなければ配備を停止します。

非公開Workerが持つのはD1 Bindingだけです。R2、Queue、Container、Secret、Service Bindingは
持ちません。暗号化Wallet Checkpointを読んだりContainerを起動したりできません。Wallet情報は、
運用Backendが事前にD1へ記録した最終観測状態であり、Live起動結果ではありません。

### 2.1 読み取り専用Tool

- `get_system_overview`：Project、Device、Policy、Proof Job、登録、Alertの件数
- `get_server_wallet_status`：最終観測した同期、DUST／NIGHT残高、Phase、処理時刻、Checkpoint状態
- `get_job_statistics`：指定期間内の受付、ZKP生成、確定、失敗の日次件数
- `find_proof_jobs`：安全なProof Job状態と公開TX証跡
- `search_operational_events`：仮名識別子から顧客API／Workflowを追跡
- `get_managed_source_status`：接続先URLやCredentialを除外したCloud連携状態

全Toolを読み取り専用、非破壊、冪等として宣言します。SQLは取得Columnを明記し、Authorization、
署名、Wallet Seed／秘密鍵、Connector Credential、Raw Sample、時間別最小／最大、Private Proof
Input、署名済みTX Byte、R2 Object Key、暗号化Artifactを返しません。MCPのTool入力／出力Bodyも
監査Rowへ保存しません。

## 3. 公開TX検証MCP

公開WorkerにはD1、R2、Queue、Container、Secret、Service Bindingがありません。Cloudflareの
Rate Limiterと、公開情報であるSensor Registry Contract AddressのAllowlistだけを持ちます。
提供するToolは1つです。

- `verify_attestation_transaction(transactionHash)`

Public Midnight Preprod Indexerへ問い合わせ、Allowlist対象Contractの成功済み
`submitDailyAttestation`を1件だけ受理します。そのTXのPublic Contract StateをDecodeし、対応する
Schema／Circuit Version、登録済みPolicy、Device-bound Assignment、有効期間、運用日境界、24時間分の
公開判定、観測時間数、日次結果の整合性を検査します。

結果が示すのは、MidnightがTXを受理し、対応する公開AttestationがContract Stateへ記録されたことです。
Raw値、時間別最小／最大、Proof Nonce、Private Witnessは開示せず、Midnight外でZKP生成を再実行した
とは主張しません。

EndpointはHostと`/mcp`を固定し、POSTだけを許可します。Requestは16 KiB以下、Browser Originは
Allowlist方式、ResponseはNo-store、接続元IPごとに1分60回までです。

Cloudflareは`.wasm`を`WebAssembly.Module`としてImportしますが、MidnightのBrowser Wrapperは
Instance化済みのWasm Namespaceを前提とします。この差は公開Worker専用Adapterで初期化し、Wrangler
Aliasも公開Workerだけへ適用します。Midnight SDK Versionと生成済みContract Artifactは変更しません。

## 4. 配備順序

非公開WorkerをHost全体のAccess Applicationより先に配備してはいけません。

```bash
# Git管理外の.envからCloudflare Account Credentialを読みます。Token値は表示しません。
npm run cloudflare:mcp:configure-access

# 返された秘密ではないAudienceを
# backend/cloudflare/deployment/wrangler.support-mcp.jsoncへ設定します。

npm run cloudflare:mcp:test
npm run cloudflare:mcp:build
npm run cloudflare:mcp:deploy
```

`cloudflare:mcp:deploy`は、非公開Workerの配備前にAccess設定を再検査します。公開Workerはこの確認が
成功した後に配備します。Contract再配備時は`ALLOWED_SENSOR_REGISTRY_CONTRACTS`をReviewして更新し、
公開WorkerへD1権限を追加しません。

## 5. 完了条件

- 未認証Clientから非公開Hostの全PathをAccessが遮断する。
- Worker自身もAccess JWT不正、またはD1権限なしを拒否する。
- 非公開MCPのTool一覧が読み取り専用6 Toolだけである。
- 公開MCPのTool一覧が`verify_attestation_transaction`だけである。
- 公開Workerが運用StorageやRuntime Bindingを持たない。
- 公開検証成功時はTX、Block、Contract、Policy、Assignment、24時間別結果とPrivacy表示だけを返す。
- 不正Hash、失敗TX、非許可Contract、非対応Schema、Public State不整合を拒否する。

Cloudflare公式資料は[Remote MCP server](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/)、
[Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)、
[Access JWT検証](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)、
[WorkersのWebAssembly Module](https://developers.cloudflare.com/workers/runtime-apis/webassembly/javascript/)を参照してください。
