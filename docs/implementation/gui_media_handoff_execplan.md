# Prepare the pitch and demo for the next GUI recording

This ExecPlan follows `.agents/PLANS.md` and is maintained as work proceeds.

## Purpose / Big Picture

The owner will record the new GUI later. Prepare a complete bilingual pitch, narration, captions, editing sequence, and reproducible build now, so the remaining work is selecting approved footage and checking its evidence. A preview must visibly identify every missing GUI shot. It must never imply that an unrecorded transaction has been confirmed.

## Progress

- [x] (2026-09-10) Read the current GUI labels, existing pitch sources, Cloudflare diagrams, and product claim boundaries.
- [x] (2026-09-10) Write one synchronized English/Japanese story and a five-shot capture guide, using current GUI labels and a prepared policy valid for the selected operational day.
- [x] (2026-09-10) Build editable eleven-slide decks, PDF exports, narrated preview videos, captions, narration/timing reports, and contact sheets. English is 196.916 seconds and Japanese is 192.500 seconds.
- [x] (2026-09-10) Exercise finalization with temporary synthetic test media; reject missing footage and inconsistent evidence. Thirteen tests pass, including a real FFprobe regression.
- [x] (2026-09-10) Inspect all slide contact sheets, full-size captioned frames, exported package relationships, and video decoding. Document the exact five-shot owner handoff and final build commands.

## Surprises & Discoveries

The original English pitch has nine slides while the Japanese technical reference has twelve. Their old generators do not reproduce the current pitch. New sibling artifacts and a shared story source avoid overwriting either baseline.

The GUI's one-day generator uses synthetic measurements. The field device's continuous collection is a separate operating path. The story must identify the browser demonstration as controlled data and the Cloudflare figures as the field architecture.

The deployed schedule starts eligible previous-day processing at 02:00 JST. Confirmation time depends on synchronization and processing. Request and confirmation can therefore require recordings on different days.

The reusable media probe originally omitted `codec_type`. The first real-footage integration was correctly stopped as having no recognized video stream, even though stubbed metadata tests passed. Adding `codec_type` to the shared FFprobe query and a one-frame real-video regression fixed the issue; the full synthetic integration then passed.

Japanese narration initially ran about four minutes. Shortening the spoken text while retaining the slide detail produced 192.500 seconds without accelerating speech. English remains 196.916 seconds. GUI video uses a wider view than the annotated deck still to preserve readable text. Caption space is reserved below the image, with the preview status always visible.

## Decision Log

- Decision: Prepare an approximately three-minute bilingual edition unless the owner chooses a different duration.
  Rationale: A concise story can include the core value, five GUI shots, both reviewed imagegen diagrams, proof limitations, and the partner-pilot next step.
  Date/Author: 2026-09-10, Codex.
- Decision: Generate preview placeholders instead of reusing historical GUI footage as current evidence.
  Rationale: The owner explicitly plans to provide new footage. Missing footage should remain visible and the final build should reject it.
  Date/Author: 2026-09-10, Codex.
- Decision: Keep production tooling in `tools/submission-media/`, generated working video in ignored `.demo-output/`, and review decks under `docs/`.
  Rationale: This changes presentation artifacts without altering deployed runtimes, schedules, or existing unrelated edits.
  Date/Author: 2026-09-10, Codex.
- Decision: A selected cut plays at original speed and may hold its last frame for the remainder of narration; the output report records the hold duration.
  Rationale: This accepts raw owner recordings without inventing processing transitions. Longer selected cuts extend the scene instead of silently accelerating actions.
  Date/Author: 2026-09-10, Codex.
- Decision: Require an explicit human evidence review and referenced public-verification report for final output, while documenting that the builder does not inspect pixels or query Midnight.
  Rationale: Metadata validation can reject mismatched identifiers but cannot replace the assistant's actual evidence review when footage arrives.
  Date/Author: 2026-09-10, Codex.

## Outcomes & Retrospective

Preparation is complete. The owner can now follow `docs/ja/submission/new_gui_recording_handoff.md` (or the English counterpart), record five unedited GUI scenes, and provide the operational date and final transaction hash. The assistant then reviews the evidence, fills the editing manifest, selects cuts and stills, and runs the prepared final export. Both preview videos already contain complete synthetic narration, captions, imagegen architecture and Wallet scenes, transitions, and five explicit missing-footage cards. The decks contain editable text and notes with matching stories; new GUI images are extracted from the same selected footage used in video.

No new GUI recording is claimed to exist. Publishing is a separate user-directed action. The earlier pitch, technical reference, Cloudflare extension, unrelated runtime edits, and deployment configuration remain outside this preparation's changes.

## Context and Orientation

`frontend/verification-portal/public/app.js` implements Device Workflow, Administrator, and Third-Party Verification. The Device page can register a browser Device, generate controlled synthetic daily measurements, request a proof, authorize processing, and link to public verification. `tools/submission-media/cloudflare-operations-content.json` and the images under `docs/assets/review/` and `docs/ja/assets/review/` already describe one-minute field sampling, hourly uploads, and scheduled Wallet operation. The Worker checks time and eligible jobs before starting the Wallet Container. The Wallet restores its encrypted checkpoint, synchronizes, processes eligible jobs sequentially, saves its checkpoint, and stops. A separate container generates proofs. The backend is trusted with private proof inputs; public viewers do not see sensor values. The proof does not establish physical accuracy or complete sampling.

## Plan of Work

Create `tools/submission-media/gui-finalization-story.json` as the common source of slides, narration, and shot requirements. Create an example recording manifest that records footage paths, cut points, review decisions, and public identifiers. A manifest is a JSON editing worksheet, completed by the assistant when footage arrives, not homework for the owner.

Create a deck renderer using native PowerPoint text and shapes, the existing PNG diagrams, and recorded GUI stills. Render equivalent PNGs for PDF and video. Create a Python orchestrator that validates the manifest, generates narration and subtitle timing, renders scene videos, and combines them. Preview mode inserts obvious missing-shot cards. Final mode requires all five reviewed shots, readable evidence, matching Device/date/policy/job/transaction identifiers, and a confirmed public verification result. Build output is separate from the older editions.

Write English and Japanese capture/handoff guides. Record each shot for at least thirty seconds, keeping the important state visible, and include three seconds of stillness around actions. The owner can provide one continuous recording or several files; the assistant performs cutting and manifest preparation. Capture acceptance and confirmation separately if needed, preserving the same job. Keep enrollment material and private sensor inputs outside the recording.

## Concrete Steps

Run all commands from the repository root. Development-only rendering dependencies are installed separately:

    npm install --prefix /tmp/midnight-pitch-media-deps --no-audit --no-fund pptxgenjs@4.0.1 jszip@3.10.1 pdf-lib@1.17.1

The build commands are:

    NODE_PATH=/tmp/midnight-pitch-media-deps/node_modules python3 tools/submission-media/build-gui-finalization.py en --reuse-audio
    NODE_PATH=/tmp/midnight-pitch-media-deps/node_modules python3 tools/submission-media/build-gui-finalization.py ja --reuse-audio
    python3 -m unittest discover -s tools/submission-media -p test_gui_finalization.py -v
    npm run verify:portability
    git diff --check

Each build ends with `complete: true`, eleven scenes, and five missing shots in `edit-manifest.json`. Matching cached audio avoids another network request. On a fresh machine, install `edge-tts==7.2.8` in a development-only virtual environment, omit `--reuse-audio`, and pass the interpreter with `--tts-python`. FFmpeg, FFprobe, Node.js, Python 3, the repository's sharp dependency, Noto Sans CJK JP, and DejaVu Sans are required.

When owner footage arrives, fill an ignored copy of `tools/submission-media/gui-recordings.example.json`. File paths resolve relative to that manifest; `in`, `out`, and `stillAt` are seconds in the original recording. Record full public identifiers and timezone-bearing capture/review times. Store the actual public verification review in the file named by `evidence.publicVerification.reference`. Run:

    python3 tools/submission-media/build-gui-finalization.py en --mode final --manifest .demo-output/new-gui-recordings/recordings.json --validate-only
    NODE_PATH=/tmp/midnight-pitch-media-deps/node_modules python3 tools/submission-media/build-gui-finalization.py en --mode final --manifest .demo-output/new-gui-recordings/recordings.json --reuse-audio

Repeat the final build with `ja`. Inspect the final outputs before declaring them complete. The detailed handoff documents record what must be visible in each shot and how to handle overnight processing.

## Validation and Acceptance

Both languages must yield eleven-slide editable PPTX and PDF decks, an H.264/AAC 1920-by-1080 video, complete SRT captions, exact narration text, and a scene timing report. Preview videos must show the missing GUI shots. A final build with the empty manifest must fail before rendering. A deliberately mismatched job or transaction must fail validation. A temporary clearly synthetic fixture may exercise cutting and still extraction but is never copied into deliverable footage or represented as live evidence. Decode the complete exported videos with ffmpeg and inspect all slide thumbnails and selected full-resolution frames. Check caption text against narration and check subtitle intervals for overlap. Run repository portability and whitespace checks; runtime tests are unnecessary for media-only changes.

## Idempotence and Recovery

New filenames preserve original decks and videos. Rebuilding may overwrite only the selected generated output directory. Cached narration is reusable only when its text and voice match. If a recording changes, its hash changes in the output report. Keep source recordings untouched. No deployment, Wallet transaction, or publication is part of this preparation.

## Artifacts and Notes

Review decks are `docs/submission/deck/bacchiri-new-gui-en-preview.{pptx,pdf}` and `docs/ja/submission/deck/bacchiri-new-gui-ja-preview.{pptx,pdf}`. Videos, SRT, narration Markdown, audio caches, contact sheets, checksums, and editing reports are beneath `.demo-output/gui-finalization-20260910/en/` and `ja/`. The linked English and Japanese handoff documents expose these files to the owner.

Validation evidence:

    13 tests passed, including real FFprobe stream identification.
    Empty final manifest: Build refused: Final output requires evidence.deviceId
    English: 11 slides, 11 notes, 70 resolved relationships, 150 native text runs; PDF 11 pages.
    Japanese: 11 slides, 11 notes, 70 resolved relationships, 133 native text runs; PDF 11 pages.
    English MP4: 196.916 seconds, H.264 1920x1080 30 fps, AAC 48 kHz mono, 7.25 MiB.
    Japanese MP4: 192.500 seconds, same stream format, 6.32 MiB.
    Japanese measured audio: -17.02 LUFS, -3.11 dBTP.
    All artifact hashes match; both complete videos decode without errors.
    Both handoff documents' local file links resolve.
    Repository portability and whitespace checks pass.

An isolated `/tmp/` synthetic integration used an unmistakably labeled test video with a changing frame counter. It exercised all five cuts, deck-still extraction, full-width video composition, frame holding, source hashing, and complete export decoding. Final metadata validation accepted the complete fixture and rejection tests rejected changed jobs/transactions. These fixture images and videos were not copied to deliverables.

## Interfaces and Dependencies

Use Python's standard library, ffmpeg/ffprobe, and edge-tts for narration and assembly. Use existing repository sharp plus development-host `pptxgenjs@4.0.1` and `pdf-lib@1.17.1` for slides and exports. The rendering tools must not be imported by Device or Cloudflare runtimes. The story file owns all spoken text; the manifest owns only recording metadata and evidence checks.

Revision note: Initial plan created after inspecting the current GUI and the mismatched historical language editions.

Revision note: Completed preparation, added concrete commands and artifact evidence, and documented the probe integration fix, concise Japanese narration, wider video layout, and explicit human verification boundary.
