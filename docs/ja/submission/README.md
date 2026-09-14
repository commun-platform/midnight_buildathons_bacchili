# リポジトリ審査ガイド

BACCHIRI!━━Verifiable Measurement Layerをリポジトリだけで確認するための入口です。追跡対象の
ソース、テスト、実行コマンド、公開トランザクション記録だけを参照します。審査基準となる
コミットは `b72efb7d4df8384a9e8dd873b8e3a65f6e9e5fbd` です。

[English](../../submission/README.md)

## 最初に読む場所

| 確認したいこと | 正本 |
| --- | --- |
| 解決する課題と価値 | [トップREADME](../../../README.md) と [1ページ概要](one_page_brief.md) |
| 何を証明するか | [Claim / Evidence Matrix](evidence_matrix.md) |
| Privacy境界 | [Private-information Specification](../../security/private_spec.md) とContractソース |
| Proofの実装 | [Sensor Registry Contract](../../../midnight/contracts/sensor-registry/src/sensor-registry.compact) と [Witness](../../../midnight/contracts/sensor-registry/src/witnesses.ts) |
| 結果の検証方法 | [Public Verifier](../../../shared/public-attestation-verifier/src/index.ts) と [Release Addendum](current_release_addendum.md) |
| テスト内容 | [Technical Gate Checklist](technical_gate_checklist.md) と各Workspaceのテスト |
| 未完了の項目 | [Wave 1 Progress](wave1_progress.md) と [Judge Q&A](judge_qa.md) |

## Source Gateを再現する

Node.js 22と固定したCompact ToolchainがあるクリーンなCheckoutで実行します。

```bash
npm ci
npm run verify:source
```

`verify:source`はPortability Check、運用用 `sensor-registry` ContractのCompile、全Workspaceの
Test、Type Checkを順に実行します。Device Secret、Deployment Credential、Wallet Recovery Material、
稼働中Networkは必要ありません。現在の基準は8回路のCompile、運用Workspace Test 524件、Managed
Source Mock Test 4件（合計528件）です。

CompactをCompileしない範囲確認は次のコマンドで実行できます。

```bash
npm run verify:portability
npm run typecheck
npm run test:managed-source-mock
```

## Evidenceの境界

Submission文書のClaimは、追跡対象のSource、追跡対象のTest、または公開URLへ解決できるものだけを
Evidenceとします。いずれの参照もないClaimはこのRepository Reviewの対象にしません。公開Transaction
RecordはそのDeployment時点の日付付きEvidenceであり、SourceとTestの確認を置き換えるものではありません。

## 推奨する確認順

1. [1ページ概要](one_page_brief.md)でClaimとLimitationsを確認する。
2. [Evidence Matrix](evidence_matrix.md)の各行からSourceと拒否系Testへ進む。
3. `npm run verify:source`を実行し、[Technical Gate Checklist](technical_gate_checklist.md)を確認する。
4. [Release Addendum](current_release_addendum.md)で公開Recordの日付と境界を確認する。
5. 計画項目は[3段階Roadmap](../../architecture/three_wave_roadmap.md)で確認し、実装済みの動作と混同しない。

## リポジトリ要件

提出時にはリポジトリをPublicにし、Apache 2.0 Licenseを維持し、GitHub Topic `midnightntwrk`を設定
します。これらの公開設定はSource Gateとは別の外部Metadataとして確認します。
