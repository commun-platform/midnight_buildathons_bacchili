# Wave 1 Technical Gate Checklist

[English](../../submission/technical_gate_checklist.md)

Review Target: チェックアウトした `main` コミット（`git rev-parse HEAD`）
最終Source Validation: 2026-09-14 JST

| Gate | Status | Evidence / Action |
| --- | --- | --- |
| Operational Compact Contract | PASS | [`sensor-registry.compact`](../../../midnight/contracts/sensor-registry/src/sensor-registry.compact) |
| Compact Compile | PASS | 固定Toolchain `0.31.1`、8回路をCompile |
| Repository Source Test | PASS | 運用Workspace合計524件 |
| Managed Source Mock Test | PASS | 4件（`npm test`合計528件） |
| Type Check | PASS | 設定済み全Workspace |
| Source Portability | PASS | `npm run verify:portability` |
| Whitespace / Link Check | PASS | `git diff --check`、追跡対象Document Link解決 |
| Apache 2.0 License | PASS | Root [`LICENSE`](../../../LICENSE) |
| Midnight Attribution | PASS | Top READMEとArchitecture DocumentにCompact、Midnight、Proof境界を記載 |
| Current Deployment Record | PASS | [Release Addendum](current_release_addendum.md)の日付付きContract / Transaction Record |
| Public Verification Boundary | PASS | [Public Verifier](../../../shared/public-attestation-verifier/src/index.ts)はPublic Stateだけを返す |
| MCP Least Privilege | PASS | Private SupportとPublic VerificationのWorkerを分離。3 + 11 + 5 Test |
| 再現可能なSource Command | PASS | `npm ci && npm run verify:source` |
| GitHub Source Check | PASS | [Source Validation Workflow](../../../.github/workflows/source-validation.yml)がPush / Pull Requestでソース境界、Portability、Deterministic Mock Source Checkを実行 |
| Public Repository Visibility | PASS | 提出レビュー時のRepository MetadataがPublic |
| GitHub Topic `midnightntwrk` | PASS | Repository Metadataで確認済み |

## Source Gate

Node.js 22と固定Compact Toolchainを用意し、Repository Rootから実行します。

```bash
npm ci
compact update 0.31.1
npm run verify:source
git diff --check
```

Source GateはOperational ContractのCompile、Workspace Test、TypeScript、Portabilityを確認します。
Device Secret、Wallet Recovery Material、Deployment Credential、稼働中Networkは使用しません。

## 公開Recordの範囲

Release AddendumのPublic Transaction Recordは日付付きのDeployment Evidenceです。Clean Checkoutの
Source Gateの代わりにはなりません。新しいDeploymentやContainer Image BuildはこのChecklistで主張
しません。Full Deployment Package GateにはDocker環境が必要です。
