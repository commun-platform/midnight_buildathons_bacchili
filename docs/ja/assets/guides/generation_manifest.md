# 文書用図版の生成記録

[English](../../../assets/guides/generation_manifest.md)

追跡対象のReview図版は、Codex内蔵画像生成または決定的なSVG→PNG Rendererで生成します。このManifestはSourceと挿入先を記録し、
Localで生成した出力をRepository Evidenceとして扱いません。

追跡対象のSVG／PNG図版をレビュー用アセットとして保持します。生成入力とLocal Renderer出力はレビューEvidenceに含めません。
出力: 1672 × 941 PNG、16:9
共通Design: 濃紺の技術文書、細いGrid、白文字、Cyan / Purple、抑えたGreen / Amber / Red、平面的な線画
共通除外: 人物、企業Logo、Coin、写真、透かし、Raspberry Pi、開発Host構成、過剰なNeon装飾

## 挿入先

| 図版 | 主な文書 |
| --- | --- |
| 審査の4論点 | `submission/judge_qa.md` |
| 仕様からEvidenceまで | `implementation/implement_spec.md` |
| 固定24時間枠と拡張性 | `implementation/cost_benchmark.md` |
| Review Path | `operations/demo_runbook.md`、`submission/README.md`、`submission/deliverables_plan.md` |
| DeviceとThresholdのLifecycle | `security/device_registry.md` |
| Edgeの安全なRelease Lifecycle | `operations/device_firmware.md` |
| On-demand ZK ProofとMidnight記録 | `operations/sponsor_wallet_operating_hours.md` |

長文の`architecture/wave1_spec.md`にも、Claim、Runtime Boundary、Key Separation、Daily Circuitの各節へReview図版を再利用します。Indexや短いChecklistは表またはText Diagramの方が明確なため、装飾図を増やしません。

## 追跡対象の図版

### `judge-qa-map-ja.png`

何を証明するか、何を公開しないか、何を証明しないか、現在確認できることの4論点を示します。Browserの限界はWave 2計画として分離します。

### `implementation-traceability-ja.png`

要件、実装、Data Boundary、Evidenceの4段階を示します。Evidenceは検証済み8回路Source、運用Test 524件、Deterministic Mock Test 4件、日付付きPublic Recordに限定します。

### `fixed-24-slot-scaling-ja.png`

24、96、1,440件以上のLocal Readingを固定24 Slotへ集約します。Circuit Shapeは固定のまま、Proof数はActive Device × 日数で増えます。

### `judge-review-path-ja.png`

準備、登録、Collection、Proof生成、Device署名、Public Resultの6 Stepを示し、PrivateとPublicを下部で分離します。

### `device-policy-lifecycle-ja.png`

Device登録、Public Threshold登録、Assignment、日次運用、Rotation / Disableを示します。OperatorによるLifecycle管理とDeviceによるTransaction署名を分離します。

### `edge-release-lifecycle-ja.png`

検証済みPackage、Checksum / Manifest、Versioned Install、Current有効化、Health Check、Rollbackを示します。Compact Compiler、Deployment Credential、Secret SeedはDevice Packageへ含めません。

### `on-demand-zkp-midnight-architecture-ja.png`

Browser WalletとManaged Source、Worker / D1、Private Artifact、On-demand Server Wallet、Proof Server、Midnight、Public Verificationを4領域で示します。Wallet同期Gate、安全なCheckpoint停止、Restart Cooldown、Private Raw ValueとPublic Verification Metadataの境界を明示します。
