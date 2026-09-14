# Complete a wallet-free local GUI demonstration and pitch

Editorial revision: The user subsequently requested actual Wallet use-case narration, including authentication and approval. The revised direction and deliverables are tracked in `docs/implementation/wallet_uc_video_revision_execplan.md`; the earlier filming-oriented explanation below is historical.


This living ExecPlan follows `.agents/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective current.

## Purpose / Big Picture

The user can start the current BACCHIRI GUI locally, try every user-facing use case without installing or approving a Wallet, and reset it for another demonstration. A recorded walkthrough and an editable Japanese pitch deck use screenshots from this running GUI. All simulated data and transaction outcomes are explicitly labeled; this recording is not evidence of a new Midnight transaction.

## Progress

- [x] (2026-09-11) Inspected current GUI routes, action reference, existing pitch and recording handoff, and available browser/media programs.
- [x] (2026-09-11) Defined loopback-only demo entry, separate demo state, current-screen reuse, and artifact ownership.
- [x] (2026-09-11) Implemented all five view adapters and gates; dashboard suite passed 94 tests in 12 files, including 16 local demo tests, and dashboard typecheck passed.
- [x] (2026-09-11) Japanese browser rehearsal passed all nine scenes and 28 checks, with no page errors or blocked network requests. Final recording adds the real Reset-button recovery check.
- [x] (2026-09-11 12:40Z) Captured nine Japanese GUI clips (193.208 seconds total) at 1920×1080/H.264/24fps, plus stills. All 47 browser checks passed; zero page/console errors and zero blocked outbound attempts. Full clip decode and hashes passed.
- [x] (2026-09-11) Built a 306.854667-second Japanese H.264/AAC 1080p/30fps film, aligned SRT and narration, and final 16-slide editable PPTX/PDF with the exact MP4 embedded.
- [x] (2026-09-11) Inspected slide and video contact sheets and full-size subtitle frames; corrected orphan subtitle line breaks. Verified 16 slides, valid XML, embedded-video SHA identity, all new guide links, 94 dashboard tests, typecheck, 8 media tests, portability and clean diff whitespace. Added bilingual guides and delivery hashes.

## Surprises & Discoveries

The worktree already contains substantial unrelated changes, including a prepared 11-slide media preview. Preserve those changes and previews. The existing finalization script deliberately requires real Preprod evidence and cannot be used with synthetic evidence; create a separate explicitly local-demo edition instead of weakening its checks.

Independent review found stale-deck/video provenance gaps; video now binds the completed capture and story hashes, and embedded media must match the successfully decoded edit manifest. Eight media acceptance tests reject incomplete captures, failed checks, outbound attempts, changed videos/stills, and validation-only runs.

Final recording encountered a Chrome screenshot timeout during navigation, while GUI errors and outbound requests remained zero. The capture tool now serializes screenshots, pauses capture during navigation, and resumes only after checking preserved clip/still hashes and identical Device, day, Policy, Job and synthetic TX. Recorder attempt history remains in the capture manifest; this is a capture recovery, not a change to a simulated result.

Browser rehearsal exposed a capture-driver issue: Ctrl+A needed a native key code to replace numeric field contents. The capture now checks exact numeric bounds and waits for the rendered confirmation, not merely a saved state flag. A final state audit also preserved a prior anomaly across a fully missing day, because absence of readings cannot establish recovery.

The default shell sandbox cannot launch because `bwrap` is missing. Reviewed elevated commands work. Linux Chrome, FFmpeg, FFprobe, Node and Python are installed. The workspace dependency tool reports Windows packages; prefer existing Linux media dependencies when present.

## Decision Log

Decision: preserve the current HTML/CSS/screens and supply a local data adapter, enabled only for an explicit `?demo=1` on a loopback host. Rationale: the user asked to demonstrate the current GUI; no production authorization changes are required. Date: 2026-09-11.

Decision: cover all five GUI views as well as the five documented core UC (authenticate, save hourly summaries, request/generate a proof, submit a sponsored transaction, public verification). Rationale: “all UC” includes current managed API and operations screens. Date: 2026-09-11.

Decision: final media use a new local-demo filename, permanent simulation labeling, and synthetic identifiers. Rationale: completed demo media must not be mistaken for real on-chain validation. Existing real-evidence gates stay intact. Date: 2026-09-11.

## Outcomes & Retrospective

All five GUI adapters and local server are implemented. Dashboard tests and typecheck pass; portability check passes. Fifteen Japanese narrative segments and subtitles are generated. Final Japanese browser capture passed 47 checks across nine recorded scenes, including real Reset navigation and preservation of ordinary browser storage. Nine raw clips fully decode and source hashes match. Final delivery is complete: 5:07 Japanese video, SRT, 16-slide PPTX with matching embedded movie, PDF, raw clips, current GUI demo, bilingual reproduction guides and delivery hashes. Source/privacy boundaries remain intact. No real proof, Wallet operation or chain transaction was performed for this edition. The local server remains available on port 8790; stopping it requires only Ctrl+C.

## Context and Orientation

`frontend/verification-portal/public/index.html`, `app.js`, and `styles.css` serve the current Device, Administrator, and public verification screens. Separate directories `managed-proof/` and `system-operations/` serve the other two views. Real browser transaction code is built from `frontend/verification-portal/src/`; the demo must avoid importing or invoking Wallet/proving code. `docs/implementation/gui_action_reference.md` describes controls and privacy boundaries. Development-only media programs belong in `tools/submission-media/`. Generated recordings are ignored under `.demo-output/`; reviewable decks belong in `docs/ja/submission/deck/`.

An adapter is a small JavaScript module that supplies the same data and method names as live services. Demo state is synthetic project, policy, device, daily data and job records saved under a demo-specific browser storage key. A loopback host means localhost, 127.0.0.1, or ::1 on this computer. UC means a complete user action and its observable outcome.

## Plan of Work

First add `public/demo-mode.js` and small explicit hooks in each existing screen. Reuse real UI controls and local calculations where appropriate, substituting synthetic records and time-bounded simulated job transitions. Guard all demo activation before any real session, Wallet, fetch or Indexer call. Display a bilingual simulation notice, links between the five views and a reset control.

Next add `tools/submission-media/serve-local-demo.mjs` to serve only public GUI files on 127.0.0.1:8790, without a Worker or remote proxy. Add `capture-local-demo.mjs` to run a temporary Chrome profile, activate the UI by clicks, enter form values, save screenshots and record time-preserving clips. Collect observable pass/fail checks and network activity. Tests must reject production-host activation and confirm demo data never enters live storage or request paths.

Finally create a separate local-demo story, deck renderer and video editor. Use captured Device registration, daily summary, request, simulated completion, public verifier, scenario, managed API and operations screens. Retain existing architecture diagrams, identify architecture vs simulation, and explain the proof boundary and partner-pilot goals without new production claims. Produce editable Japanese PPTX, PDF, captioned narrated MP4 and a manifest with source hashes. The deck initially has 15 narrative slides; after the MP4 is finished, `--video` appends a 16th slide embedding the video directly in PPTX and a matching poster in PDF.

## Concrete Steps

Run all commands from the repository root (`midnight_cloudflare_demo/`), the directory containing `package.json`.

    npm run dashboard:demo

Open `http://127.0.0.1:8790/?demo=1#/device`. Expected: current GUI, an explicit local-demo banner, no Wallet prompt, synthetic project/policy/device setup and operable use cases.

    npm run test -w @midnight-demo/dashboard
    npm run typecheck -w @midnight-demo/dashboard
    node tools/submission-media/capture-local-demo.mjs

Japanese narration is generated with `python3 tools/submission-media/build-local-demo-video.py --audio-only`. The complete video uses the same command with `--reuse-audio` after screenshots, raw clips and slides exist. Deck rendering uses `node tools/submission-media/build-local-demo-deck.cjs` with the development presentation dependency directory in `NODE_PATH`. Use existing FFmpeg and development-only dependencies; do not add media dependencies to deployed components.

## Validation and Acceptance

A fresh browser must create/select a project and policy, register a device, generate a completed synthetic day, request and progress a simulated proof, view the same job's simulated transaction, and use that identifier in Third-Party Verification. Outside values must remain OUTSIDE, missing hours must remain NO DATA, and mismatched/tampered input must reject. Administrator, managed API and operations views must be usable. Refresh must preserve only demo state; reset must reset only demo state. No real Wallet object, live API request or chain submission is permitted during the walkthrough. A non-loopback URL with `?demo=1` must not activate demo behavior.

The capture manifest must document current GUI interactions and no remote requests/page errors. Video must decode completely, have audible Japanese narration and aligned readable captions, and use no placeholder screens. PDF/PPTX must include actual recorded screenshots and no claim of live verification from a simulated record. Visually inspect representative exported slides and video frames, and verify all intended files exist.

## Idempotence and Recovery

Rerun in a fresh temporary Chrome profile or use the demo reset control. Stop the local server with Ctrl+C. No live runtime restart, deployment, wallet restore or chain write is needed. Preserve prior media; keep this edition in `.demo-output/local-demo-20260911/` and new named deck files. If an output fails, fix its source and regenerate that output instead of modifying a success label or evidence record.

## Artifacts and Notes

Expected screenshots: `.demo-output/local-demo-20260911/frames/device.png`, `day.png`, `request.png`, `confirmed.png`, `verify.png`, `scenarios.png`, `managed.png`, `operations.png`. Raw GUI clips use the corresponding scene names under `raw/`. Final names and validation evidence will be added at completion.

## Interfaces and Dependencies

The demo module exports its host/query gate, synthetic adapter, and demo state functions for direct tests. Main GUI loads it before real device-flow imports or API calls. Local capture uses Chrome DevTools Protocol (the browser's local automation interface) with the existing `ws` package. FFmpeg produces H.264/AAC MP4. The pitch renderer uses existing development-only `pptxgenjs`, `pdf-lib` and `sharp` packages. None are imported by deployed runtimes.

Revision 2026-09-11: Added an optional embedded-video slide so the final deck can play the demonstration without an external link.

Revision 2026-09-11: Initial plan records current GUI scope, simulated-evidence boundaries and separate media pipeline, based on user authorization for a wallet-free local demonstration.

Revision 2026-09-11: Final visual review balanced Japanese subtitle lines; all media re-rendered and the new video SHA matched the final PPTX embedding. Delivery manifest and SHA256SUMS record the reviewable outputs.
