# Final delivery — September 12, 2026

[日本語版](../ja/submission/final_delivery.md)

The current implementation, completed media, and recording preview are consolidated here. The source is the working tree based on `fb28ade`, including uncommitted changes. This is a local review handoff; public submission links and a frozen release commit are still pending.

## Deliverables

| Edition | Files | Status and intended use |
| --- | --- | --- |
| Completed English product pitch | [9-slide PPTX](deck/bacchiri-verifiable-measurement-layer-wave1-en.pptx), [PDF](deck/bacchiri-verifiable-measurement-layer-wave1-en.pdf), [2:18 MP4](../../.demo-output/submission-en-20260831/bacchiri-demo-pitch-en.mp4) | Concise historical GUI demonstration. Later field features are documented separately. |
| Cloudflare operations edition | [English 11-slide PPTX](deck/bacchiri-verifiable-measurement-layer-wave1-en-cloudflare-operations.pptx), [PDF](deck/bacchiri-verifiable-measurement-layer-wave1-en-cloudflare-operations.pdf), [3:20 MP4](../../.demo-output/cloudflare-operations-20260910/bacchiri-demo-pitch-en-cloudflare-operations.mp4) | Completed extended explanation with historical footage and labeled field-operation diagrams. |
| Japanese operations reference | [14-slide PPTX](../ja/submission/deck/bacchiri-verifiable-measurement-layer-wave1-ja-cloudflare-operations.pptx), [PDF](../ja/submission/deck/bacchiri-verifiable-measurement-layer-wave1-ja-cloudflare-operations.pdf), [4:16 MP4](../../.demo-output/cloudflare-operations-20260910/bacchiri-demo-pitch-ja-cloudflare-operations.mp4) | Completed technical reference; its structure differs from the English pitch. |
| English Wallet use-case presentation | [5:07 MP4](../../.demo-output/local-demo-tagline-en-20260912/bacchiri-local-demo-en.mp4), [17-slide PPTX with video](deck/bacchiri-local-demo-en.pptx), [PDF](deck/bacchiri-local-demo-en.pdf), [details](local_demo.md) | English narration, captions, graphics and GUI; fifteen motion scenes plus brand, slogan and thanks. The review deck uses movie frames and editable notes. Filming simulation, distributed separately from the earlier review ZIP. |
| Japanese Wallet use-case presentation | [5:25 MP4](../../.demo-output/local-demo-tagline-ja-20260912/bacchiri-local-demo-ja.mp4), [17-slide PPTX with video](../ja/submission/deck/bacchiri-local-demo-ja.pptx), [PDF](../ja/submission/deck/bacchiri-local-demo-ja.pdf) | The approved fifteen-scene motion presentation with a narrated brand/slogan/thanks closing. Editable deck text and shapes. Filming simulation, separate from the earlier review ZIP. |
| New GUI pitch | [English PPTX](deck/bacchiri-new-gui-en-preview.pptx), [PDF](deck/bacchiri-new-gui-en-preview.pdf), [MP4](../../.demo-output/gui-finalization-20260910/en/bacchiri-new-gui-en-preview.mp4); [Japanese PPTX](../ja/submission/deck/bacchiri-new-gui-ja-preview.pptx), [PDF](../ja/submission/deck/bacchiri-new-gui-ja-preview.pdf), [MP4](../../.demo-output/gui-finalization-20260910/ja/bacchiri-new-gui-ja-preview.mp4) | Eleven slides per language, about 3:17 / 3:12. **Preview: G01–G05 still contain recording placeholders.** |
| Architecture and narration | [Bilingual figures, standalone videos, captions, and production notes](cloudflare_operations_media.md) | Explains continuous collection and scheduled Wallet operation. 02:00 JST is processing start, not guaranteed confirmation. |
| Review archive | [ZIP](../../.demo-output/final-delivery-20260911/bacchiri-review-package-20260911.zip), [SHA256SUMS](../../.demo-output/final-delivery-20260911/SHA256SUMS) | Selected media grouped by edition, bilingual start page, inventory, and per-file hashes. Local ignored output. |
| Current Device firmware | [tar.gz](../../.device-release/archives/midnight-sensor-device-fw-0.1.0-review-20260911.tar.gz), [SHA-256](../../.device-release/archives/midnight-sensor-device-fw-0.1.0-review-20260911.tar.gz.sha256) | Built from current source; includes daily submission and stop protection. Not installed by this finalization. Kept separate from the media ZIP. |

Videos, ZIP, and firmware are local ignored artifacts. The links work in this workspace; a fresh clone must reproduce or separately obtain these outputs. Public URLs have not been substituted for local paths.

## Implementation reconciled with the deliverables

| Area | Current behavior | Evidence and limits |
| --- | --- | --- |
| Daily Device submission | A separate five-minute timer reads completed operational days after a five-minute closing margin, retains the exact private preparation, rotates bounded retry batches, defers queued work, and skips confirmed receipts. | [Daily submission source](../../edge-device/midnight-transaction-agent/src/daily-submission.ts), 43 transaction-agent tests. Missing measurements remain missing; 24 observed hours do not establish uninterrupted sampling. |
| Continuous collection | The collector and recovery timer reject direct manual stops. An explicit maintenance target coordinates upgrades and rollback. Collection and wallet work remain separate processes. | [Firmware guide](../operations/device_firmware.md), 20 collector/installer tests. Privileged administrators can still change systemd configuration; this is operational protection. |
| Wallet and notifications | The consolidated Server Wallet performs separately authorized administration, managed attestation, and fee sponsorship. The Sponsor role adds DUST only. Sponsor receipts include the configured verification-page URL. | [Operations guide](../architecture/wave2_system_operations.md), 247 Gateway tests. `PUBLIC_VERIFICATION_PORTAL_URL` is non-secret deployment configuration. A sent receipt does not itself establish network confirmation. |
| GUI Policy reload | Policy results update through **Refresh Policies**. The button becomes available again after the request, while unfinished Policy inputs and focus survive. | Fixed a missing button update in `refreshDeviceDynamicComponents`; the system test now exercises repeated explicit reload and rejects an unexpected background reload. |
| Privacy and day boundary | Raw field measurement streams and Device keys stay local. Authorized hourly summaries and private proof inputs reach the trusted Backend. Public viewers receive the registered operational date/boundary and results. | Corrected overview statements that implied all aggregates stayed on the Device or all operational days used UTC midnight. The proof does not establish sensor truth, completeness, or correct local aggregation. |

The [release addendum](current_release_addendum.md) includes the earlier live records: September 5 and 6 operational days each had 1,439 real measurements and confirmed in blocks 2,446,724 and 2,446,764 during September 7–8 verification. The September 9 stop-protection record confirms uninterrupted collection during the direct-stop rejection test. These are dated records, not a new September 11 live-device or Indexer check.

## Validation

| Check on the September 11 working tree | Result |
| --- | --- |
| Operational Compact compilation | PASS: toolchain `0.31.1`, 8 circuits |
| Repository tests | PASS: **525** in the combined source suites; initial full test run 512, followed by Dashboard 91 including 13 newly added local-demo tests |
| Workspace type checks and generated binding checks | PASS |
| Frontend and TypeScript builds | PASS; Dashboard tests/build repeated after the Policy button fix |
| Public/private MCP Worker dry-runs | PASS |
| Proof Gateway Worker bundle | PASS with `--containers-rollout none`; Container images excluded |
| Full `npm run verify` | **Incomplete:** all source tests/type checks passed, but Docker could not be launched for the Gateway Container image build |
| GUI system compatibility test | PASS: 22 rendered checkpoints after adapting the fixture to explicit Policy reload, queued registration, and the unified deferred proof action. [Fixture screenshots and result](../../.sct-output/dashboard/) |
| Media evidence/cut validation | PASS: 13 tests, including mismatched jobs/transactions, missing recordings, and pending-as-confirmed rejection |
| Firmware package | PASS: 103 release files, 36 runtime artifacts, archive member and checksum checks |
| Portability and whitespace | PASS: personal absolute path corrected; 366 relative document links resolved |

Test distribution: Shared 20; public verifier 3; Contract 18; Dashboard 91; Development CLI 5; Device Auth 6; collector/installer 20; Device Wallet Agent 43; Gateway 247; Sponsor Wallet 52; Support MCP 11; Verification MCP 5; mock source 4. The 13 recording tests and 4 packaging tests are additional to the 525 source tests. The current Dashboard test/typecheck/build and GUI SCT were rerun after the concurrent local-demo adapter was added. The API SCT aliases execute the same Gateway/Sponsor suites already included in this count.

Rebuild the same 33-file media selection with `python3 tools/submission-media/build-final-delivery.py`. The builder requires every selected file, rejects symlinks and path traversal, preserves edition labels, and verifies each archive member against its SHA-256. Run its four boundary tests with `python3 -m unittest discover -s tools/submission-media -p test_final_delivery.py -v`.

Use a development host with working Docker access for the remaining full deployment-package gate:

```bash
TMPDIR=/tmp WRANGLER_LOG_PATH=/tmp/bacchiri-wrangler-logs npm run verify
TMPDIR=/tmp npm run sct:gui
python3 -m unittest discover -s tools/submission-media -p test_gui_finalization.py -v
git diff --check
```

`WRANGLER_LOG_PATH` keeps tool logs in a writable location. The successful Worker-only check used `wrangler deploy --dry-run --containers-rollout none` with the repository deployment manifest; it is not a substitute for Docker image validation. No deployment, wallet operation, or new Midnight transaction was performed for this handoff.

## Remaining work

1. Supply G01–G05 for the new GUI edition and match Device, operational date, Policy, Proof Job, and confirmed transaction. Follow the [recording handoff](new_gui_recording_handoff.md); the preview must not be published as a completed current-GUI demonstration.
2. Run the full Container build gate on a host with Docker access, freeze the reviewed commit, and record its SHA.
3. Publish the chosen deck/video edition and fill the submission URLs. Confirm repository visibility, topic, and submission form requirements at submission time.
4. Validate reliability over a partner operating period, organization/role separation, and production recovery. Daily automation is implemented; those broader Wave 2 outcomes remain open.

The September 11 judge-pitch revision file is an unfinished editorial plan, not an additional produced edition. The available new-GUI artifacts listed here are the September 10 previews.
