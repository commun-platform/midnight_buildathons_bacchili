# Wave 1 Technical Gate Checklist

[English](../../submission/technical_gate_checklist.md)

最終実装確認: 2026-09-04 JST
公開検証Live再確認: 2026-09-05 JST

| Gate | Status | Evidence / Action |
| --- | --- | --- |
| 運用Compact Contract | PASS | midnight/contracts/sensor-registry/src/sensor-registry.compact |
| Compact Compile | PASS | 8 Circuit、submitDailyAttestation 28,699 rows、k=15 |
| Repository Test | PASS | 12 Workspaceと疑似対向Serviceで496 / 496成功 |
| Typecheck | PASS | 設定済み全Workspace |
| Production Build | PASS | Dashboard、CLI、Device Workspace |
| Cloudflare Package検証 | PASS | Proof Gateway、Support MCP、Verification MCPのWrangler dry-run成功。配備済み公開MCPから現行2 TXを確認 |
| Source Portability | PASS | Machine固有Path / Deploy値なし |
| Apache License 2.0本文 | PASS | 公式Apache 2.0本文からRoot LICENSEを追加 |
| Midnight Attribution | PASS | README / 提出資料でCompact、Midnight、Proof境界を明示 |
| 日英分離 | PASS | 文書、図版、Deck Outputを分離 |
| Public Repository | PENDING EXTERNAL | 公開後に確認 |
| GitHub Topic midnightntwrk | PASS | GitHub Repositoryで設定済みと確認 |
| 実装基準Commit | PASS | `af90ad8`。文書追従Commitは別途記録 |
| 現行Contract配備 | PASS | 8回路Contract配備と現行Managed API／Device TX EvidenceをRelease補足へ記録 |
| MCP最小権限境界 | PASS | 非公開Support／公開Verificationを別Worker化し、3 + 11 + 5 Test成功 |
| 最終GUI Screenshot | PASS（LOCAL） | 審査済み英語Still 6枚と1920×1080 Submission Thumbnailを`docs/submission/captures/`へ保存済み |
| Demo / Video Pitch | PASS（LOCAL） | 英語H.264／AAC 1080p動画`bacchiri-demo-pitch-en.mp4`（2分18秒）を作成済み、公開URL設定は外部作業 |
| Slide Package | PASS（LOCAL） | 英語9枚PPTX／9 Page PDFは動画Storyを維持してSlide 7を更新。日本語Technical Referenceは12枚／12 Pageを維持し、Slide 8へ同じ境界のSponsor Wallet構成と限定付き`standard-4` Cost比較を追加 |
| Slide Public Link | PENDING EXTERNAL | 生成Deck / PDFを公開後URL追加 |
| AKINDO Form / Official Rules | PENDING EXTERNAL | 締切時刻、制限、Team、Link Fieldを再確認 |

## 最終Release Command

    git status --short
    TMPDIR=/tmp npm run verify
    git diff --check

Submission READMEに記載する文書Link監査、全図版のFull-size確認、Secret / Private Benchmark StateがTrackされていないことを確認し、次を記録します。

- 実装基準と文書Commit SHA
- Repository URL / Public設定
- midnightntwrk Topic
- Deck URL
- Video URL
- 検証日と実行者

AKINDO提出に必要なPENDING EXTERNALが残る間はReadyと判定しません。
