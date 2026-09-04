# Wave 1 Technical Gate Checklist

[日本語版](../ja/submission/technical_gate_checklist.md)

Last implementation check: 2026-09-04 JST
Live public-verification recheck: 2026-09-05 JST

| Gate | Status | Evidence / action |
| --- | --- | --- |
| Operational Compact contract exists | PASS | midnight/contracts/sensor-registry/src/sensor-registry.compact |
| Compact compilation | PASS | 8 circuits compiled; submitDailyAttestation 28,699 rows, k=15 |
| Repository tests | PASS | 496 / 496 passed across 12 workspaces and the mock counterpart service |
| Type checking | PASS | All configured workspaces |
| Production builds | PASS | Dashboard, CLI, Device workspaces |
| Cloudflare package validation | PASS | Proof Gateway, Support MCP, and Verification MCP Wrangler dry-runs passed; deployed public MCP resolved both current TX hashes |
| Source portability | PASS | No machine-specific source paths or deployment values |
| Apache License 2.0 text | PASS | Root LICENSE added from the official Apache 2.0 text |
| Midnight attribution | PASS | README and submission materials identify Compact, Midnight, and the proof boundary |
| English / Japanese separation | PASS | Separate docs, figures, and deck outputs |
| Public repository visibility | PENDING EXTERNAL | Confirm after publishing |
| GitHub topic midnightntwrk | PASS | Confirmed on the GitHub repository |
| Implementation baseline | PASS | `af90ad8`; documentation follow-up is recorded separately |
| Current Contract deployment | PASS | Eight-circuit Contract deployment and current Managed API/Device TX evidence are listed in the release addendum |
| MCP least-privilege boundary | PASS | Private Support and public Verification MCP Workers are separate; 3 + 11 + 5 tests passed |
| Final GUI screenshots | PASS (LOCAL) | Six reviewed English stills and a 1920×1080 submission thumbnail are under `docs/submission/captures/` |
| Demo / video pitch | PASS (LOCAL) | English H.264/AAC 1080p video produced: `bacchiri-demo-pitch-en.mp4` (2:18); public URL remains external |
| Slide package | PASS (LOCAL) | English 9-slide PPTX / 9-page PDF retain the video story and update slide 7; Japanese Technical Reference remains 12 slides / 12 pages and updates slide 8 with the localized Sponsor Wallet architecture and the same bounded `standard-4` cost comparison |
| Slide public link | PENDING EXTERNAL | Publish the generated deck/PDF and add the public URL |
| AKINDO form and Official Rules | PENDING EXTERNAL | Recheck deadline time, limits, team and link fields |

## Final release commands

    git status --short
    TMPDIR=/tmp npm run verify
    git diff --check

Run the documentation link audit described in the submission README, inspect every generated figure at full size, verify that no secret or private benchmark state is tracked, then record:

- final commit SHA;
- implementation baseline and documentation commit SHA;
- repository URL and visibility;
- midnightntwrk topic;
- deck URLs;
- video URLs;
- validation date and operator.

Do not mark the submission ready while any PENDING EXTERNAL item required by the AKINDO form remains unresolved.
