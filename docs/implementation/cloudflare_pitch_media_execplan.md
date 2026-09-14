# Add Cloudflare architecture and scheduled Wallet operation to pitch media

This living ExecPlan follows `.agents/PLANS.md`. All dates refer to 2026-09-10 unless otherwise stated.

## Purpose / Big Picture

Viewers should understand which parts of BACCHIRI run on Cloudflare and why its Server Wallet runs only when eligible work exists. Deliver two imagegen illustrations per selected language, add them to the existing pitch decks, and produce narrated video scenes integrated with the existing demo. A reviewer must distinguish continuous sensor collection, hourly uploads, and the daily 02:00 Japan-time processing start.

## Progress

- [x] Inspected current implementation and live public configuration: scheduled mode, UTC offset 540, start minute 120, one-minute Worker coordination.
- [x] Located English nine-slide and Japanese twelve-slide decks, PDF counterparts, existing demo videos, and narration tooling under ignored `.demo-output/`.
- [x] Loaded imagegen skill and repository plan instructions. Asked an optional language preference; bilingual assets are the default.
- [x] Generated, inspected, and persisted four opaque 1672 × 941 imagegen figures, correcting wrong architecture arrow endpoints and rejecting a Wallet draft with erroneous alpha.
- [x] Built additive English 11-slide and Japanese 14-slide deck editions with speaker notes and matching PDFs; original slide/media/note parts are preserved byte for byte.
- [x] Generated bilingual synthetic narration and exact captions, standalone insertion scenes, and extended demo videos using the original recordings.
- [x] Inspected rendered PDF pages and video frames, fixed oversized SRT caption rendering using a 1080p ASS canvas, and validated slide relationships, durations, full media decoding, source hashes, and documentation links.

## Surprises & Discoveries

The English pitch has nine slides while the Japanese reference has twelve. Existing deck build scripts describe older content, so regenerating whole decks would discard the current review sequence. The established English video and its narration environment are in `.demo-output/submission-en-20260831/`; the Japanese recording is in `.demo-output/submission-ja-20260830/`. These directories are ignored and may not be available on a fresh checkout.

The initial architecture image sent private proof input into D1 and bypassed the Midnight box for sponsored transactions; imagegen edits corrected both. The first Wallet image unexpectedly contained an alpha channel and severe cutout artifacts; regeneration with an explicitly opaque background fixed it. FFmpeg's default SRT subtitle canvas enlarged the caption font until it covered the figure footer; explicit 1920 × 1080 ASS captions and a separate lower caption area fixed the output. Japanese TTS sentence timestamps overlap slightly, so display intervals are clamped at the next sentence start without changing narration text.

## Decision Log

Decision: add sibling editions rather than overwrite existing reviewed binaries. Preserve original pages, audio, captions, and the distinction between historical GUI recording and current field integration. Reason: the user requested additions, and the frozen baseline remains useful evidence.

Decision: generate two readable figures per language with built-in imagegen, following the existing navy, cyan, orange, violet, and green presentation palette. Reason: one figure explains ownership; the second explains timing without crowding a single slide.

Decision: do not add cost percentages, mainnet claims, or guaranteed completion times. The live system is Midnight Preprod; 02:00 JST is the start of eligible processing. The trusted backend receives private proof inputs, while raw measurement streams and Device authority keys remain on the Device.

## Outcomes & Retrospective

The requested media additions are complete in English and Japanese. Each language has two imagegen PNGs, an extended PPTX/PDF with two new figures, a standalone narrated explanation with SRT captions, and a full demo with those scenes inserted before the closing claim boundary. English full video duration is 200.294 seconds and the standalone is 62.157 seconds. Japanese full video duration is 256.465 seconds and the standalone is 74.978 seconds. All four MP4s decode fully as H.264/AAC at 1920 × 1080 and 30 fps. Original recorded narration and baseline binaries are preserved. New files have local paths documented in `docs/submission/cloudflare_operations_media.md` and its Japanese translation; videos have not been published externally. No runtime or deployment changes were made for this task.

## Context and Orientation

`backend/cloudflare/deployment/wrangler.jsonc` declares Workers APIs and SPA assets, D1 SQL state, Queues and retries, R2 storage, Cron, and two Container bindings. A Container is a process that can start and stop independently of the always-available Worker API. One runs the Proof Server; the other runs the Server Wallet, whose Sponsor role pays DUST fees for Device-authorized transactions. `backend/cloudflare/proof-gateway-worker/src/index.ts` checks D1 for eligible work before warming the Wallet, waits for synchronization, processes one eligible operation, and stops after eligible work drains. A checkpoint is an encrypted saved Wallet state restored on the next start, stored in R2. `edge-device/sensor-collector/src/collector.ts` samples every 60 seconds, keeps raw readings locally, and uploads closed hourly summaries plus anomaly transitions. The separate Device daily service retries every five minutes, preparing completed days after a five-minute closing margin. These timings must remain distinct in all copy.

Existing image assets live in `docs/assets/review/` and `docs/ja/assets/review/`. Existing decks are `docs/submission/deck/bacchiri-verifiable-measurement-layer-wave1-en.{pptx,pdf}` and their `docs/ja/submission/deck/` Japanese counterparts. Scripts for reproducible local production belong in `tools/submission-media/`. Do not modify runtime code or deployment settings.

## Plan of Work

Milestone one produces two built-in imagegen diagrams: a Device–Cloudflare–Midnight map and a Wallet lifecycle sequence. Record complete prompts and technical checks in a new generation manifest. Persist selected original PNGs inside the language-specific asset directories. Confirm that the graphics show JOB check before Wallet startup and separate Proof Server from Server Wallet.

Milestone two builds sibling extended deck editions by inserting new full-slide figures with useful speaker notes. Preserve the original editable slide parts and existing notes. Insert architecture and lifecycle together adjacent to the existing Wallet explanation. Create PDFs by copying original pages and inserting new image pages in the matching sequence, avoiding a dependency on desktop Office.

Milestone three uses the existing narration workflow and public, non-sensitive script to produce captioned explanatory scenes. Integrate scenes into a sibling edition of the existing video, preserving its historical-recording context. Save standalone scenes and captions as well as full videos, and document runtime and insertion positions. If voice synthesis is unavailable, report that limitation explicitly and still produce a clearly labeled captioned draft; do not label silence as narration.

## Concrete Steps

Run all repository commands from its root. The exact production commands are:

    npm install --prefix .demo-output/media-deps --no-audit --no-fund jszip@3.10.1 pdf-lib@1.17.1
    NODE_PATH="$PWD/.demo-output/media-deps/node_modules" node tools/submission-media/build-cloudflare-operations-decks.cjs
    python3 tools/submission-media/build-cloudflare-operations-video.py en --reuse-audio
    python3 tools/submission-media/build-cloudflare-operations-video.py ja --reuse-audio

The implementation run installed the same pinned JavaScript dependencies in a temporary task directory and used it through NODE_PATH. `--reuse-audio` requires matching text, MP3, and SRT files in `.demo-output/cloudflare-operations-20260910/narration/`. For a fresh audio build, omit that flag and pass `--tts-python <interpreter-with-edge-tts>`. The English voice is `en-US-EmmaMultilingualNeural`; Japanese is `ja-JP-NanamiNeural`. Source video overrides support `--source-video` and `--insert-at`. The existing source recording must be supplied if it is absent on a fresh checkout.

## Validation and Acceptance

Open each generated diagram and inspect spelling, arrows, labels, boundaries, and legibility at slide size. Confirm the Cloudflare ownership region includes Workers, D1, Queues, Cron, R2, Proof Server Container, and Server Wallet Container. Confirm private values are hidden from public viewers without claiming that the trusted prover never sees private inputs. Check output PPTX slide counts and preservation of original parts, PDF counts and dimensions, speaker notes, video H.264/AAC streams, caption timings, and selected video frames. Run `git diff --check` and the repository portability check for new source files. No runtime test suite is required for media-only additions.

## Idempotence and Recovery

Use sibling versioned names for generated images and extended decks/videos. Keep baseline media intact. Generated temporary audio, render intermediates, and local production dependencies belong under `.demo-output/cloudflare-operations-20260910/`. Never read or include credentials, raw sensor streams, private proof files, or Wallet material. No deployment, publication, messaging, or chain transaction is part of this task.

## Artifacts and Notes

Live public configuration confirmed `mode=scheduled`, `timeZoneOffsetMinutes=540`, `processingStartsAtMinute=120`, and `processingCadenceSeconds=60`. The latest confirmed field record is the September 9 operational day, confirmed around September 10 02:10 JST; do not imply all hours were observed, since six hours are explicitly no-data.

Validation evidence: English PPTX has 11 slides, 60 parseable XML parts, and 79 resolved internal relationship targets. Japanese PPTX has 14 slides, 74 parseable XML parts, and 98 resolved internal relationship targets. PDF counts are 11 and 14. Baseline English video SHA-256 remains `88734c8e0a6a8c966c1267faa4352ee2b899d573fc1ed576d075d01bb4b5e6ab`; Japanese remains `da3ef116d48cda658d89ea7bef004db62a78b4a2567e76baa6377643f183bb4e`. Each output MP4 has its own checksum and a JSON production manifest in `.demo-output/cloudflare-operations-20260910/`. Repository portability and `git diff --check` pass. The reviewed video frames show readable captions below, rather than over, the figures.

## Interfaces and Dependencies

Use built-in `image_gen.imagegen` for requested diagrams. Use ZIP/XML manipulation and established presentation/PDF libraries to retain the current deck. Use FFmpeg and FFprobe for video assembly and stream validation. Reuse the existing English TTS environment when feasible. Media production is a development-host responsibility and introduces no Device or deployed Worker dependency.

Revision 2026-09-10: Initial plan after inspecting live timing and locating the current decks and recorded source media.

Revision 2026-09-10 completion: Recorded all delivered assets, real durations, corrected rendering issues, reusable commands, and final validation. No required implementation or local media work remains.
