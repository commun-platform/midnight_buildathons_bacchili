# Give the demo a clear visual story and varied pacing

This living ExecPlan follows `.agents/PLANS.md`. Keep Progress, discoveries, decisions, and outcomes current.

## Purpose / Big Picture

Judges should understand the value of BACCHIRI and see which GUI detail demonstrates each claim. The previous movie repeats full-screen slides and identical outline effects. Deliver a newly composed 1080p Japanese movie with large type, progressive diagrams, readable GUI close-ups, and a visible narrative journey. Preserve the approved narration describing Wallet authentication and approval. The output is filming simulation, not new chain evidence.

## Progress

- [x] (2026-09-12) Inspected the approved 315.65-second Wallet movie, the 63 focus cues, the raw GUI recordings, and current deck validation.
- [x] (2026-09-12) Created and inspected distinct motion layouts: bold opening, light sender/receiver comparison, five-step journey, GUI close-ups, 24-hour grid, Wallet role flow, exception labels, and progressive system diagrams.
- [x] (2026-09-12) Rendered all 15 scenes. Inspected 15 representative frames and 81 samples across 27 close-ups; checked 5,331 GUI camera frames remain inside the recorded viewport.
- [x] (2026-09-12) Exported the complete MP4, verified original audio packets and SRT, embedded it into the 16-slide PPTX, checked the 16-page PDF, and updated Japanese/English delivery guidance.

## Surprises & Discoveries

The raw GUI is 1920×1080 but most controls are arranged in two columns. Full-view presentation makes them difficult to read. The focus plan already records safe positions and times around scrolls; reuse those observations while changing the composition. The approved baseline includes extra holds after shorter clips; keep that timeline so narration needs no regeneration.

ASS overlays render above the GUI video. The screenshot frame therefore needs a header strip and an outline, rather than a filled panel covering the footage. Prototypes caught this before review export. A complete repeated layout still felt uniform, so aggregation, approval, and exceptions received distinct side diagrams. Three light scenes create visible chapter/topic contrast without changing the narration.

## Decision Log

Use authored vector motion graphics and actual recorded GUI, with no new illustrative raster assets. They communicate data relationships more directly than decoration. Use a new renderer and output directory so previous editions remain reviewable. Keep original audio packets and SRT, and preserve truthful capture metadata and existing deck evidence gates. GUI close-ups change framing, not playback speed or the order of actions. Date: 2026-09-12.

Keep the editable explanatory slides in the PPTX and embed the newly composed movie on slide 16. The movie's new layouts are also visible in its contact sheet; do not describe the static deck as having native PowerPoint animations. Date: 2026-09-12.

## Outcomes & Retrospective

Delivered `.demo-output/local-demo-presentation-20260912/bacchiri-local-demo-ja.mp4`: 315.654667 seconds, 1920×1080, 30 fps, H.264/AAC, 26,515,027 bytes. SHA256 is `b1937b8529d921603ab05c8434119431ce395e9ddcc610be6143426556f577f2`. Full decoding, unchanged AAC packets, exact SRT bytes, and PPTX embedded-video equality pass. All 15 scenes have redesigned compositions, with 27 GUI close-ups. The 14 existing media tests pass; application tests were not rerun because this revision changes no application behavior. The source capture's 29 checks remain intact. No required media work remains.

## Context and Orientation

`tools/submission-media/local-demo-story.json` contains the approved Japanese narration for 15 scenes. `.demo-output/local-demo-wallet-uc-20260911/` contains the validated source MP4, capture evidence, raw GUI clips, and captions. `tools/submission-media/local-demo-focus.json` contains the manually reviewed GUI target rectangles. `build-local-demo-deck.cjs` produces the editable PPTX and PDF, requiring matching capture, story and movie hashes. Never weaken those checks. Current unrelated application edits are outside this task.

The new `tools/submission-media/build-local-demo-presentation.py` will author ASS, a timed vector/text overlay format rendered by FFmpeg. A camera specification describes which rectangle of the original browser recording is shown at a given time. Smooth movements connect these rectangles; static holds give the viewer time to read.

## Plan of Work

First build a self-contained motion renderer with a bold opening, a sender/receiver comparison, an animated five-step journey, GUI detail compositions, simplified implementation and Wallet diagrams, and a concrete partner-evaluation ending. Prototype representative scenes and inspect their frames at readable resolution.

Next compose all scenes against the original audio timeline. Keep a dedicated caption band and a small filming label. Store camera and annotation provenance in the edit manifest. Validate source hashes, complete decoding, dimensions, frame rate, identical narration packets and identical subtitles. Generate a contact sheet for the 15 scenes.

Finally embed the new MP4 into the existing editable PPTX, regenerate PDF, inspect the embedded media hash, and update the Japanese and English delivery links. Archive the new files and their checksums in `.demo-output/local-demo-presentation-20260912/`.

## Concrete Steps

Run commands from the repository root. Python 3 and FFmpeg with libass are installed. Noto Sans CJK JP supplies Japanese type. The existing temporary Node dependencies contain pptxgenjs and pdf-lib; the repository supplies sharp.

    python3 tools/submission-media/build-local-demo-presentation.py --preview value --preview device --preview wallet
    python3 tools/submission-media/build-local-demo-presentation.py --resume
    NODE_PATH=/tmp/bacchiri-wallet-media-deps/node_modules node tools/submission-media/build-local-demo-deck.cjs --output-dir .demo-output/local-demo-presentation-20260912/slides --frames-dir .demo-output/local-demo-presentation-20260912/frames --video .demo-output/local-demo-presentation-20260912/bacchiri-local-demo-ja.mp4
    python3 -m unittest discover -s tools/submission-media -p 'test_local_demo*.py' -v
    npm run verify:portability
    git diff --check

## Validation and Acceptance

The opening must state the value in large type, the five UC nodes must activate in narration order, GUI shots must enlarge the actual narrated control without pointing at unrelated content during a scroll, and diagrams must distinguish Device authorization, Sponsor fees, and backend trust. Captions must remain unobscured. Inspect full-size samples and a contact sheet from every scene, plus camera transition frames. The completed video must decode without errors, remain 1920×1080 at 30 fps, and retain the original audio packet hash and SRT hash. The PPTX embedded MP4 must match the delivered movie exactly.

## Idempotence and Recovery

Keep baseline and focus editions untouched. Generate only within the new output directory; resume may reuse a segment only if its recorded render signature matches current inputs. Failed exports can be rerun. No deployment, external message, real transaction, or Wallet operation is necessary.

## Artifacts and Notes

Source movie SHA256 is `3a77444e9841afdd72c65fc1485e275a16216a6a974dca0384dae93553097fe2`. Source capture SHA256 is `3b6c751790446a040ab20f79f51aace3163dfe5cb0fcf11c6ed9cc0d13aec755`. The source has 29 successful browser acceptance checks and no browser errors. Record new export measurements here after validation.

The new output directory contains `presentation-contact-sheet.png`, `presentation-review-samples.json`, `camera-review-samples.json`, `media-validation.json`, `delivery-manifest.json`, and `SHA256SUMS`. The review directory includes full-size representative frames and eight contact sheets covering camera arrival, midpoint and end. The fifteen delivery/evidence checksums can be checked with `sha256sum -c .demo-output/local-demo-presentation-20260912/SHA256SUMS` from the repository root. Canonical presentation files are `docs/ja/submission/deck/bacchiri-local-demo-ja.pptx` and `.pdf`.

## Interfaces and Dependencies

The renderer accepts `--source-dir`, `--output-dir`, repeatable `--preview`, and `--resume`. It uses Python standard library, FFmpeg/ffprobe and the existing story/focus formats. The final edit manifest retains the baseline fields required by the deck, adds motion/camera provenance, and reports actual validation outcomes. All paths in committed documentation are repository-relative.

Revision note (2026-09-12): Created in response to the request for a stylish, less monotonous, judge-readable presentation.

Completion note (2026-09-12): Recorded the final movie measurements, all-scene visual review, camera bounds, verified deck embedding, and updated bilingual delivery links.
