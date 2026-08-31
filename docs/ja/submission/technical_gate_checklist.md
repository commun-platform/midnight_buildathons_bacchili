# Wave 1 Technical Gate Checklist

[English](../../submission/technical_gate_checklist.md)

最終Local確認: 2026-08-31 JST

| Gate | Status | Evidence / Action |
| --- | --- | --- |
| 運用Compact Contract | PASS | contracts/sensor-registry/src/sensor-registry.compact |
| Compact Compile | PASS | 6 Circuit、submitDailyAttestation 28,699 rows、k=15 |
| Repository Test | PASS | 9 Workspaceで287 / 287成功 |
| Typecheck | PASS | 設定済み全Workspace |
| Production Build | PASS | Dashboard、CLI、Device Workspace |
| Cloudflare Package検証 | PASS | Wrangler Deploy dry-run、Worker Version `d88891bc-17b3-40c1-9771-5fc92fbd9cc0`をDeploy済み |
| Source Portability | PASS | Machine固有Path / Deploy値なし |
| Apache License 2.0本文 | PASS | 公式Apache 2.0本文からRoot LICENSEを追加 |
| Midnight Attribution | PASS | README / 提出資料でCompact、Midnight、Proof境界を明示 |
| 日英分離 | PASS | 文書、図版、Deck Outputを分離 |
| Public Repository | PENDING EXTERNAL | 公開後に確認 |
| GitHub Topic midnightntwrk | PENDING EXTERNAL | Public Repositoryで追加・確認 |
| 最終提出Commit | PENDING | GUI実装・最終Capture後に固定 |
| 最終GUI Screenshot | PENDING | GUI安定後にCapture |
| Demo / Video Pitch | DEFERRED | User指示により最後に制作 |
| Slide Public Link | PENDING EXTERNAL | 生成Deck / PDFを公開後URL追加 |
| AKINDO Form / Official Rules | PENDING EXTERNAL | 締切時刻、制限、Team、Link Fieldを再確認 |

## 最終Release Command

    git status --short
    TMPDIR=/tmp npm run verify
    git diff --check

Submission READMEに記載する文書Link監査、全図版のFull-size確認、Secret / Private Benchmark StateがTrackされていないことを確認し、次を記録します。

- Final Commit SHA
- Repository URL / Public設定
- midnightntwrk Topic
- Deck URL
- Video URL
- 検証日と実行者

AKINDO提出に必要なPENDING EXTERNALが残る間はReadyと判定しません。
