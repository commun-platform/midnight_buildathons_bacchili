# Reconcile and package the review deliverables

This ExecPlan follows `.agents/PLANS.md` and must retain its progress, findings, decisions, and outcomes as work proceeds.

## Purpose / Big Picture

Reviewers need one reliable entry point to the current implementation, completed presentation editions, and the new GUI preview that still needs five recordings. This work reconciles English and Japanese documentation with the existing source changes, repairs concrete verification failures, and produces a local review archive plus current Device firmware. Each artifact must identify its status without implying a new deployment or live network check.

## Progress

- [x] (2026-09-11) Inspected the dirty working tree based on `fb28ade`, submission indexes, media builders, daily submission, and recorded Device evidence.
- [x] (2026-09-11) Ran 13 media tests successfully and found a portability failure caused by a personal absolute path in a pending editorial plan.
- [x] (2026-09-11) Reconciled bilingual delivery summaries, indexes, source privacy/day boundaries, dated live evidence, and baseline validation references.
- [x] (2026-09-11) Ran 512 initial source tests, all type checks and frontend/TypeScript builds. Completed Worker-only dry-runs; recorded the full Container build gate as incomplete because Docker Desktop WSL integration is unavailable.
- [x] (2026-09-11) Corrected the real Policy reload button defect and outdated GUI fixture. Passed all 22 rendered checkpoints. The concurrent local-demo addition passed 91 Dashboard tests (13 new), typecheck and build, bringing the combined source total to 525.
- [x] (2026-09-11) Built firmware `0.1.0-review-20260911`; verified 103 release files and 36 runtime artifacts without installation.
- [x] (2026-09-11) Packaged 33 selected media files, bilingual instructions, manifest, and SHA-256 checksums; 4 packaging boundary tests passed in addition to the 13 recording tests. Verified 6 PPTX/PDF pairs, 7 video formats/durations, both preview manifests, and relative document links.

## Surprises & Discoveries

The submission indexes still lead with the September 5 implementation baseline `af90ad8` and 496 tests. The current tree includes September 7 automatic daily submission and September 9 collector stop protection. The September 11 judging-pitch revision is only a plan: the available GUI previews are the September 10 edition. The first full verification stopped at `docs/implementation/judge_pitch_revision_execplan.md:58` because a personal Linux home path violates portability rules.

The README boundary table incorrectly says all hourly extrema and proof inputs stay on the Edge Device. The implemented authenticated workflow uploads bounded summaries and sends private proof inputs to the trusted Backend; public viewers receive neither. The consolidated Server Wallet also handles administration and managed attestation, although its sponsorship role adds fees only.

The GUI fixture still expected automatic Policy polling, WAIT registration labels, and a separate proof-request button. Current source uses explicit Policy refresh, QUEUED registration while later actions remain available, and a unified deferred proof request/submission action. Updating the fixture exposed a real issue: `refreshDeviceDynamicComponents` omitted `#device-policy-refresh`, leaving that button disabled after its first completed request. Including it fixes repeated refresh without replacing the draft form. The final fixture additionally implements the current deferred-workflow methods and asserts a single Proof Job request.

Concurrent work added a loopback-only local-demo adapter and 13 Dashboard tests. Those changes were preserved and included in the subsequent Dashboard checks and GUI SCT. Its recording/rendering work is still in progress and is linked as a separate simulation edition; it is not included in the selected media archive.

## Decision Log

- Decision: Preserve completed media and clearly label the unrecorded GUI preview. Rationale: no new five-shot recording is present, and old footage cannot establish the current GUI flow. Date: 2026-09-11.
- Decision: Validate source locally and cite earlier live evidence with its original dates. Rationale: this finalization request does not require changing the running Device or creating new Midnight transactions. Date: 2026-09-11.
- Decision: Package only explicit presentation, narration, caption, and summary files. Rationale: bulk archiving ignored directories could include private runtime or recording state. Firmware uses the existing verified operational archive builder separately. Date: 2026-09-11.
- Decision: Report Worker-only dry-run separately from full verification. Rationale: Wrangler supports `--containers-rollout none`, which validates the Worker package without Docker, but it cannot establish Container image build correctness. No deployment configuration was weakened to make the root gate appear successful. Date: 2026-09-11.

## Outcomes & Retrospective

The local review handoff is complete. `docs/submission/final_delivery.md` and its Japanese counterpart provide the current status, actual validation scope, live-evidence dates, and outstanding work. `.demo-output/final-delivery-20260911/bacchiri-review-package-20260911.zip` contains 33 selected media files plus README, manifest and checksums; the ZIP is approximately 152 MiB. `.device-release/archives/midnight-sensor-device-fw-0.1.0-review-20260911.tar.gz` is approximately 42 MiB and remains separate. The repository builder `tools/submission-media/build-final-delivery.py` reproduces the selection and verifies archive member hashes.

Source validation totals 525 distinct tests across the initial 512-test run and the subsequent 91-test Dashboard run, which adds 13 local-demo tests. All 22 GUI checkpoints and 17 recording/packaging tests passed. The six deck/PDF pairs have matching counts of 9, 12, 11, 14, 11 and 11. All seven videos have H.264/AAC, 1920 × 1080, 30 fps. Both GUI preview manifests match the current story hash and correctly mark five missing recordings. Both preview contact sheets were visually inspected.

Remaining external work is explicitly documented: Docker-enabled full Container validation, a frozen review commit, five real-evidence GUI shots for the new GUI edition, and public submission links. The concurrent local simulation has its own unfinished media production plan. No new live Device check, firmware installation, deployment, or Midnight transaction occurred during this finalization.

## Context and Orientation

`docs/submission/README.md` and `docs/ja/submission/README.md` index submission editions. Their `current_release_addendum.md` files describe source and recorded Preprod evidence. `README.md` and `docs/ja/README.md` provide the public project overview. `tools/submission-media/` contains development-only renderers and thirteen existing recording-validation tests. Local rendered videos live under ignored `.demo-output/`. `edge-device/release/package_archive.sh` builds operational firmware and rejects overwriting an existing archive.

## Plan of Work

Milestone one repairs portability and misleading overview statements, adds bilingual final delivery summaries, and links them from the main indexes. Summaries explain completed media versus previews, the daily retry and maintenance behavior, the trusted Backend boundary, and the source/deployment distinction.

Milestone two runs `TMPDIR=/tmp npm run verify`, the media tests, and `npm run sct:gui`. The full verification includes operational compilation, tests, type checks, builds and Wrangler deployment simulations. If a check fails, repair the demonstrated problem and rerun the affected gate. Build a uniquely versioned firmware archive after compilation, without installation.

Milestone three assembles an explicitly listed set of review documents, decks, videos, captions, and diagrams into a local ZIP. Preserve clear edition directories, include a file manifest with SHA-256 hashes and the dirty source baseline, and verify that each archive member matches its source. Complete the bilingual validation record using actual results.

## Concrete Steps

From the repository root:

    TMPDIR=/tmp npm run verify
    python3 -m unittest discover -s tools/submission-media -p test_gui_finalization.py -v
    TMPDIR=/tmp npm run sct:gui
    bash -n edge-device/release/device-installer.sh
    ./edge-device/release/package_archive.sh --version 0.1.0-review-20260911
    git diff --check

The complete root verify stopped during the Gateway Container image build after source tests and type checks passed. The successful restricted follow-up was:

    WRANGLER_LOG_PATH=/tmp/bacchiri-wrangler-logs ./node_modules/.bin/wrangler deploy --dry-run --containers-rollout none --outdir backend/cloudflare/proof-gateway-worker/dist --config backend/cloudflare/deployment/wrangler.jsonc
    TMPDIR=/tmp npm run test -w @midnight-demo/dashboard
    npm run typecheck -w @midnight-demo/dashboard
    npm run build -w @midnight-demo/dashboard
    python3 -m unittest discover -s tools/submission-media -p test_final_delivery.py -v
    python3 tools/submission-media/build-final-delivery.py

Store logs in `/tmp/bacchiri-final-*.log` and the review package in `.demo-output/final-delivery-20260911/`. Update final delivery documents with the actual firmware and review archive filenames. Do not include logs containing private state in the package.

## Validation and Acceptance

Both language indexes must link to a summary identifying the current implementation and honest completion state. The source suite and media rejection tests must pass. The GUI system test uses controlled fixtures and must be labeled as such. A new firmware archive must pass its built-in file boundary and checksum checks. Open every selected PPTX as a ZIP, compare PDF page counts and media metadata with documented editions, and visually inspect the existing preview contact sheets. The review archive must contain only listed deliverables; recompute every member hash after reading the archive.

## Idempotence and Recovery

Keep existing source changes and historical artifacts. Documentation edits are reversible. A new dated review directory avoids replacing historical outputs. The firmware builder refuses replacement; use a new version suffix if a later source correction needs another build. No remote state, Device service, secret, or wallet change is part of this work.

## Artifacts and Notes

Initial source baseline: `fb28ade` with pre-existing tracked modifications and untracked daily-submission/media files. Initial media validation: 13 tests passed. The initial failed repository check is a documentation portability error, not a failed contract test.

## Interfaces and Dependencies

Use the repository's pinned npm dependencies, Compact toolchain `0.31.1`, existing Python media tools, FFprobe, and Python standard-library ZIP/hash utilities. No new runtime dependency or contract change is required.

Revision 2026-09-11: Created to reconcile existing implementation and media editions and produce a concrete review handoff.

Revision 2026-09-11 completion: Recorded the actual GUI defect and fixture updates, concurrent local-demo validation, verified packages and media, and the Docker environment limit. Remaining recording, publication and deployment gates are stated in the delivery summaries without claiming a frozen or deployed release.

Final audit: all 366 checked relative documentation links resolve; repository portability and whitespace checks pass; external SHA-256 verification succeeds for both the review ZIP and firmware archive.
