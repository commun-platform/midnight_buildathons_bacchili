# Wave 1 Technical Gate Checklist

[日本語版](../ja/submission/technical_gate_checklist.md)

Last local check: 2026-08-31 JST

| Gate | Status | Evidence / action |
| --- | --- | --- |
| Operational Compact contract exists | PASS | contracts/sensor-registry/src/sensor-registry.compact |
| Compact compilation | PASS | 6 circuits compiled; submitDailyAttestation 28,699 rows, k=15 |
| Repository tests | PASS | 287 / 287 passed across nine workspaces |
| Type checking | PASS | All configured workspaces |
| Production builds | PASS | Dashboard, CLI, Device workspaces |
| Cloudflare package validation | PASS | Wrangler deploy dry-run and deployed Worker version `d88891bc-17b3-40c1-9771-5fc92fbd9cc0` |
| Source portability | PASS | No machine-specific source paths or deployment values |
| Apache License 2.0 text | PASS | Root LICENSE added from the official Apache 2.0 text |
| Midnight attribution | PASS | README and submission materials identify Compact, Midnight, and the proof boundary |
| English / Japanese separation | PASS | Separate docs, figures, and deck outputs |
| Public repository visibility | PENDING EXTERNAL | Confirm after publishing |
| GitHub topic midnightntwrk | PENDING EXTERNAL | Add and confirm on the public repository |
| Final submission commit | PENDING | Freeze after GUI implementation and final capture |
| Final GUI screenshots | PENDING | Capture after GUI implementation stabilizes |
| Demo / video pitch | DEFERRED | User requested video production last |
| Slide public link | PENDING EXTERNAL | Publish generated deck or PDF and add URL |
| AKINDO form and Official Rules | PENDING EXTERNAL | Recheck deadline time, limits, team and link fields |

## Final release commands

    git status --short
    TMPDIR=/tmp npm run verify
    git diff --check

Run the documentation link audit described in the submission README, inspect every generated figure at full size, verify that no secret or private benchmark state is tracked, then record:

- final commit SHA;
- repository URL and visibility;
- midnightntwrk topic;
- deck URLs;
- video URLs;
- validation date and operator.

Do not mark the submission ready while any PENDING EXTERNAL item required by the AKINDO form remains unresolved.
