# Revise the demo around the actual Wallet use cases

This living plan follows `.agents/PLANS.md`.

## Purpose / Big Picture

The user wants the Japanese demo to explain the actual product flow, including Wallet connection and approvals. Viewers should understand Device registration, private daily inputs, proof requests, Device transaction approval, Sponsor fee payment, and public verification. Filming implementation details must not replace that explanation. The deliverable is a freshly recorded and narrated MP4, matching subtitles, and an updated presentation containing that exact movie.

## Progress

- [x] (2026-09-11) Locate the previous 5:07 movie, story, renderers, recording controls, and visible copy that needs revision.
- [x] (2026-09-11) Revise narration, slide text, and filming-mode display text to explain the real Wallet use cases.
- [x] (2026-09-11) Record all nine clips in one session (29 passing browser checks, no browser errors); generate revised narration and the initial fifteen slides with no layout warnings.
- [x] (2026-09-11) Render the 315.655-second movie, verify subtitles and full decoding, embed the exact MP4 in the sixteen-slide PPTX, validate the sixteen-page PDF, and update delivery links and twelve checksums.

## Surprises & Discoveries

The prior capture had 47 checks because it accumulated checks across an interrupted run and replay; the fresh capture has 29 checks in one uninterrupted run. All scenarios are preserved.

The old recording contains the rejected wording in its persistent banner, connected-account label, and Managed API trust label. Replacing narration alone cannot fix the movie. The production GUI already explains Wallet authorization and the separate Sponsor fee contribution; the filming overrides obscured these roles.

## Decision Log

The user's revision supersedes the previous editorial direction in `docs/implementation/local_demo_media_execplan.md`. Re-record the existing browser controls with corrected display text. Preserve the explicit filming simulation badge and the recorder's isolated backend and Wallet checks in its metadata. Describe connection and approval as steps of the real use case, with the capture beginning at its prepared connected-account state. Do not invent a Wallet extension or claim a newly confirmed real transaction. Save the revision below `.demo-output/local-demo-wallet-uc-20260911/` and preserve the previous edition. These decisions keep the requested explanation accurate while preserving the original capture for recovery.

## Outcomes & Retrospective

The revised Japanese movie is complete at `.demo-output/local-demo-wallet-uc-20260911/bacchiri-local-demo-ja.mp4` (315.654667 seconds, H.264/AAC, 1920×1080, 30fps). All nine raw clips decode and match their captured hashes. The current five GUI views passed 29 checks in one uninterrupted session, with no page, console, or external-request errors. The dashboard's 94 tests and typecheck, eight media acceptance tests, repository portability, and whitespace checks passed.

The sixteen-slide PowerPoint embeds the exact delivered MP4; its PDF has sixteen pages. Source story, narration, subtitles, and presentation text passed the revised-copy audit. Device and Managed API capture frames, the scene contact sheet, and completed-movie frames were visually inspected. The English and Japanese media guides and final delivery indexes now link to the revision. Twelve artifact and evidence checksums pass. The movie SHA-256 is `3a77444e9841afdd72c65fc1485e275a16216a6a974dca0384dae93553097fe2`.

No requested work remains. The previous recording is preserved in its original directory, and the temporary port-8791 server is stopped after production. The main lesson is that a narration revision also requires recapture when the rejected copy is embedded in the visible GUI.

## Context and Orientation

`tools/submission-media/local-demo-story.json` owns fifteen scenes and Japanese narration. `build-local-demo-deck.cjs` renders editable PowerPoint text, slide images, and PDF. `build-local-demo-video.py` generates speech, captions, and the movie from actual browser clips. `capture-local-demo.mjs` operates the five current GUI views using Chrome and records nine clips plus stills. Its capture manifest records checks and file hashes, which are fingerprints used to verify that the presentation and movie refer to the same recording. `frontend/verification-portal/public/demo-mode.js`, the demo copy block in `app.js`, and the demo initialization in `managed-proof/managed-proof.js` own the filming display text. Preserve their existing loopback-only activation and separated local storage.

## Plan of Work

First revise the story around Wallet authentication, registration approval, daily input, proof-request progress, transaction approval, Sponsor DUST payment, and third-party verification. DUST is the network fee resource. Keep the managed-service Wallet role distinct from the user's Device Wallet. Replace the repeated filming limitations on slides with concise use-case explanations and one consistent simulation label. Change only demo presentation copy and its matching capture assertion, leaving production authorization behavior intact.

Next start a dedicated static server on port 8791. Record all scenes into the revised output directory so no old banner remains. Generate narration from the revised story, render the initial slides, then render the movie. Finally regenerate the presentation with the movie embedded, inspect key frames and subtitles, validate all files, and update the English and Japanese media guides.

## Concrete Steps

Run all commands from the repository root, `midnight_cloudflare_demo/`.

    node tools/submission-media/serve-local-demo.mjs --port 8791
    node tools/submission-media/capture-local-demo.mjs --base-url http://127.0.0.1:8791 --output-dir .demo-output/local-demo-wallet-uc-20260911
    python3 tools/submission-media/build-local-demo-video.py --output-dir .demo-output/local-demo-wallet-uc-20260911 --audio-only
    NODE_PATH=/tmp/bacchiri-wallet-media-deps/node_modules node tools/submission-media/build-local-demo-deck.cjs --output-dir .demo-output/local-demo-wallet-uc-20260911/slides --frames-dir .demo-output/local-demo-wallet-uc-20260911/frames --no-copy
    python3 tools/submission-media/build-local-demo-video.py --output-dir .demo-output/local-demo-wallet-uc-20260911 --reuse-audio
    NODE_PATH=/tmp/bacchiri-wallet-media-deps/node_modules node tools/submission-media/build-local-demo-deck.cjs --output-dir .demo-output/local-demo-wallet-uc-20260911/slides --frames-dir .demo-output/local-demo-wallet-uc-20260911/frames --video .demo-output/local-demo-wallet-uc-20260911/bacchiri-local-demo-ja.mp4

The presentation dependencies are development-only `pptxgenjs` and `pdf-lib`, installed below `/tmp/bacchiri-wallet-media-deps`; `sharp` comes from the existing repository installation. The existing `.demo-output/submission-en-20260831/.venv/bin/python` supplies `edge-tts==7.2.8` for public narration text. Chrome, FFmpeg, and FFprobe are installed system executables.

## Validation and Acceptance

Run `npm run test -w @midnight-demo/dashboard`, `npm run typecheck -w @midnight-demo/dashboard`, `python3 -m unittest discover -s tools/submission-media -p test_local_demo_video.py -v`, `npm run verify:portability`, and `git diff --check`. The actual recording must pass all browser checks without page or console errors. Inspect Device and Managed API frames to confirm corrected visible wording. All raw clips and the final MP4 must decode. The narration and SRT must match, explain Wallet authentication and approval, and omit the rejected claims. The final presentation must have sixteen slides, no layout warnings, and an embedded movie whose bytes match the delivered MP4. Record lengths and hashes from generated files rather than carrying forward the old edition's numbers.

## Idempotence and Recovery

The prior edition remains untouched. If recording is interrupted, use the existing `--resume` option only for the incomplete revised capture; it verifies previous clip hashes and replayed identifiers. Audio is reused only if text, voice, and settings match. Renderer validation rejects stale story or capture hashes. Stop only the static server started for this revision. Do not alter concurrent unrelated work, deployed infrastructure, wallet secrets, or the real-evidence finalization path.

## Artifacts and Notes

The delivered file will be `.demo-output/local-demo-wallet-uc-20260911/bacchiri-local-demo-ja.mp4`. Matching SRT, narration, capture evidence, validation, and checksums will be adjacent. Updated presentation copies will remain at `docs/ja/submission/deck/bacchiri-local-demo-ja.pptx` and `.pdf`.

## Interfaces and Dependencies

No production API or authentication interfaces change. The existing story schema, capture manifest, edit manifest, and presentation manifest remain compatible. The movie renderer should take its edition identifier from the story instead of hardcoding the earlier edition.

Revision note (2026-09-11): Created for the user's explicit request to restore the actual Wallet use-case explanation throughout the demo.

Completion note (2026-09-11): Finished the Wallet use-case revision, including recapture, narration, captions, MP4, embedded presentation, PDF, integrity evidence, and updated handoff links.
