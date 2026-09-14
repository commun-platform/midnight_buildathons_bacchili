# Finish the demo with its brand and create the English edition

This living plan follows `.agents/PLANS.md`.

## Purpose / Big Picture

Both Japanese and English audiences should see a polished demo ending with the service name, its slogan, and thanks. The user approved the Japanese motion presentation, requested a spoken closing, and then requested an English edition. Finish both requests: preserve the reviewed Japanese main movie, append a branded end card, and create English narration, captions, graphic labels, and readable English GUI footage for the same Wallet use cases.

## Progress

- [x] (2026-09-12) Corrected all three English service-name synthesis inputs to バッチリ while preserving Bacchiri captions. Rebuilt and validated the 307.621-second MP4 and seventeen-slide PPTX/PDF. Thirteen other main narration files are byte-identical.
- [x] (2026-09-12) Applied the explicitly approved データに信頼を。検証を、誰にでも。 / Trust in data. Proof for everyone. to both language endings. Rebuilt both decks and refreshed all delivery records. Final English is 307.188 seconds; Japanese is 325.021354 seconds.

- [x] (2026-09-12) Inspected the approved Japanese movie and available English GUI/capture support. Generated the Japanese closing speech using the existing voice.
- [x] (2026-09-12) Appended the Japanese closing (324.755 seconds total) and rebuilt the seventeen-slide PPTX/PDF. Original main audio packets and captions remain unchanged.
- [x] (2026-09-12) Translated all graphics and narration, recorded English GUI with 29 passing checks, and rendered the English main movie plus its closing (306.688 seconds total). Generated the seventeen-slide English review PPTX/PDF.
- [x] (2026-09-12) Reviewed both endings, all sixteen English scene compositions and the 27 camera stops. Balanced English subtitle lines and corrected Operations close-ups. Verified both final MP4s, PPTX media hashes, seventeen-page PDFs, checksums and all 166 delivery-page links. Stopped the task-owned server on port 8792.

## Surprises & Discoveries

The original Python environment is a virtual environment whose interpreter is a symlink. Resolving the interpreter path removes the virtual-environment context and hides edge-tts; use an absolute path without resolving symlinks. The GUI supports English for Device/Administrator/Verifier and Managed API, but demo labels and Operations contain Japanese. English filming needs a recorded, documented text-localization layer for those remaining labels. The Japanese subtitle wrapper splits by characters, so English captions instead use word-aware wrapping and direct sentence timings from the speech service. English GUI narration uses 0.96× speech speed and bounded pauses between sentences; recordings keep their original timing.

## Decision Log

Append the Japanese end card in a new output directory so the approved 15-scene movie remains available. The Japanese words are: バッチリ。測定値を渡さず、判定の根拠を届ける。ありがとう。 The English closing uses BACCHIRI, the corresponding slogan, and Thank you. Preserve actual Wallet authentication and approval explanations; never introduce wallet-free demo commentary. Date: 2026-09-12.

The English review deck uses full-resolution frames from the finished movie and editable speaker notes, with the complete MP4 embedded on slide 17. This preserves the approved motion compositions; its static visual elements are flattened. The Japanese deck retains editable text and shapes. Date: 2026-09-12.

## Outcomes & Retrospective

Latest approved delivery: `.demo-output/local-demo-tagline-en-20260912/` (307.188 seconds, SHA256 `28b1350763296e3fb5a177abcdbe461c377ca3fb58eeb770feb33f16f73fe26a`) and `.demo-output/local-demo-tagline-ja-20260912/` (325.021354 seconds, SHA256 `58ffb32fa3274d19c1e4c410f8aa112d420ff50c7142ccb80dc373ea97c2a18f`). Both end with the new approved tagline and thanks. Both decks have 17 slides/pages with exact embedded final MP4s. Full decode, source audio/video packet prefixes and subtitle prefixes pass; all final captions match narration (English 60 cues, Japanese 47). Three English synthesis inputs explicitly say バッチリ; thirteen unrelated main narration files are unchanged. Visual inspection of both end cards and the centered editable Japanese closing found no clipping. Delivery manifests/checksums include the short closing clips and English pronunciation receipt. All 170 local links in the six current delivery pages resolve.

Initial bilingual edition (superseded below by the pronunciation and tagline revisions):

Completed Japanese (324.754688 seconds) and English (306.687696 seconds) MP4/SRT/narration and seventeen-slide PPTX/PDF editions. Both final movies fully decode at 1920×1080/30fps with AAC mono 48000 Hz. Subtitles match the scripts (Japanese 46 cues; English 60), and each PPTX embeds the exact delivered MP4. The Japanese main video/audio elementary streams and SRT are unchanged prefixes. Each capture passed 29 checks, with no browser errors. The existing 14 media tests, portability check, syntax/whitespace checks and 166 document links pass. Delivery manifests and SHA256SUMS are saved beside both final movies. No deployment or publication was performed.

## Context and Orientation

`tools/submission-media/build-local-demo-presentation.py` renders the reviewed Japanese motion movie from `.demo-output/local-demo-wallet-uc-20260911/`. The approved output is `.demo-output/local-demo-presentation-20260912/`, movie SHA256 `b1937b8529d921603ab05c8434119431ce395e9ddcc610be6143426556f577f2`. `local-demo-story.json` is its 15-scene narration; `local-demo-focus.json` records narrated GUI target timings. `build-local-demo-deck.cjs` checks capture/story/movie hashes before embedding the MP4 into an editable PPTX. `capture-local-demo.mjs --language en` selects English in the GUI and captures actual controls on the isolated static server. Generated filming state and transaction results remain simulation metadata, separate from historical evidence.

## Plan of Work

Create `local-demo-ending.json` and an ending renderer using the same Japanese voice and dark/mint typography. Append the short ending, extend SRT and narration, retain the source hashes, and extend the deck with a closing slide and updated embedded movie.

Next add English story/layout content and the remaining filming text translations. Keep translations limited to recorded display text, without changing actions or results. Record all scenes with `--language en`, inspect changed geometry, and define camera targets against that recording. Render English narration with a consistent English voice. Use the Japanese compositions and progressive diagrams, adjusting text size and timing to English speech. Finish with an English end card.

Finally export English PPTX/PDF, validate complete movie decoding, subtitles against narration, output dimensions, preserved Japanese source content, capture checks, and embedded media hashes. Update Japanese and English delivery pages with both editions.

## Concrete Steps

Run all commands from the repository root. The speech interpreter is `.demo-output/submission-en-20260831/.venv/bin/python` (edge-tts 7.2.8). Do not resolve its symlink. FFmpeg/libass, Noto Sans CJK JP, Chrome, and the repository Node dependencies are available. PPTX dependencies are in `/tmp/bacchiri-wallet-media-deps/node_modules`.

    node tools/submission-media/serve-local-demo.mjs --port 8792
    node tools/submission-media/capture-local-demo.mjs --base-url http://127.0.0.1:8792 --output-dir .demo-output/local-demo-english-capture-20260912 --language en
    python3 -m unittest discover -s tools/submission-media -p 'test_local_demo*.py' -v
    npm run verify:portability
    git diff --check

    python3 tools/submission-media/build-local-demo-ending.py
    NODE_PATH=/tmp/bacchiri-wallet-media-deps/node_modules node tools/submission-media/build-local-demo-deck.cjs --output-dir .demo-output/local-demo-final-20260912/slides --frames-dir .demo-output/local-demo-final-20260912/frames --video .demo-output/local-demo-final-20260912/bacchiri-local-demo-ja.mp4 --ending tools/submission-media/local-demo-ending.json
    python3 tools/submission-media/build-local-demo-english.py --audio-only
    python3 tools/submission-media/build-local-demo-english.py --resume --reuse-audio
    python3 tools/submission-media/build-local-demo-ending.py --locale en --source-dir .demo-output/local-demo-english-20260912 --output-dir .demo-output/local-demo-english-final-20260912
    NODE_PATH=/tmp/bacchiri-wallet-media-deps/node_modules node tools/submission-media/build-local-demo-review-deck.cjs

Stop only the task-owned server when recording completes.

## Validation and Acceptance

The Japanese movie's final spoken words must be the requested brand, slogan, and ありがとう. The English version must have English speech, subtitles, and presentation labels, and end with Thank you. Both need a readable end card with time to absorb the slogan. Inspect representative full-size frames and movement samples. Verify 1920×1080/30fps, complete video/audio decoding, exact subtitle text, all capture acceptance checks, and equality of the delivered MP4 and the movie inside each PPTX. Do not claim these checks before running them.

## Idempotence and Recovery

Use new final/English output directories, leaving reviewed source editions intact. Reuse matching speech cache entries. Failed captures can resume only with matching source and language metadata; a changed localization requires fresh recording. Do not deploy, operate real Wallets, or contact anyone.

## Artifacts and Notes

The Japanese closing audio is 7.68 seconds. Its speech cues are 0.1–1.6 (brand), 1.6–5.962 (slogan), and 5.962–7.625 (thanks), before adding the final visual hold.

## Interfaces and Dependencies

Use Python standard library and existing media helpers for speech, captions, hashes, and encoding. Store English content and ending copy in JSON. Add explicit locale/story/ending inputs to deck rendering without weakening its capture and source validation. Record any translation used during filming in the capture evidence.

Revision note (2026-09-12): Created to combine the pending Japanese ending with the newly requested English edition.

Final review note (2026-09-12): English character wrapping initially left single-word second lines. Balanced word-aware wrapping fixed this. English Operations scrolled to daily metrics earlier than the Japanese reference; camera holds and focus labels now follow the English recording. The final English review deck faithfully uses movie frames and does not claim editable visual elements.

Pronunciation follow-up (2026-09-12): The user reported that English Bacchiri sounded like バカリ. `local-demo-pronunciation.json` explicitly supplies バッチリ to the multilingual voice. `local-demo-speech.py` retains synthesizer inputs/subtitles in `pronunciation-source/` and maps the subtitle spelling back to Bacchiri. Rebuild value, problem and closing speech with the existing voice, keeping other speech caches. The revised final destination is `.demo-output/local-demo-english-pronunciation-20260912/`; pass that directory as `--output-dir` to the ending renderer and `--source-dir` to the review-deck renderer so the previous final MP4 remains available. The prior editions and canonical English deck were backed up under `.demo-output/local-demo-english-before-pronunciation-20260912/`. Use the normal English generation/ending/review-deck commands above; generate changed speech with `--audio-only` before `--reuse-audio`. Verify three mapped occurrences, canonical English captions, full decoding and the embedded MP4 hash.

Tagline follow-up (2026-09-12): Proposed Japanese データに信頼を。検証を、誰にでも。 with English Trust in data. Proof for everyone. The user explicitly accepted the recommended wording and asked generation to continue. Keep the three pronunciation corrections. Both main movies can be retained; only their endings need new narration and card text. Canonical decks were copied into `.demo-output/local-demo-before-tagline-20260912/` before updating.

Approved tagline build commands (2026-09-12):

    python3 tools/submission-media/build-local-demo-ending.py --locale ja --source-dir .demo-output/local-demo-presentation-20260912 --output-dir .demo-output/local-demo-tagline-ja-20260912
    python3 tools/submission-media/build-local-demo-ending.py --locale en --source-dir .demo-output/local-demo-english-20260912 --output-dir .demo-output/local-demo-tagline-en-20260912
    NODE_PATH=/tmp/bacchiri-wallet-media-deps/node_modules node tools/submission-media/build-local-demo-deck.cjs --output-dir .demo-output/local-demo-tagline-ja-20260912/slides --frames-dir .demo-output/local-demo-tagline-ja-20260912/frames --video .demo-output/local-demo-tagline-ja-20260912/bacchiri-local-demo-ja.mp4 --ending tools/submission-media/local-demo-ending.json
    NODE_PATH=/tmp/bacchiri-wallet-media-deps/node_modules node tools/submission-media/build-local-demo-review-deck.cjs --source-dir .demo-output/local-demo-tagline-en-20260912

Validation receipts were refreshed after decoding both final files, checking packet preservation and comparing the canonical deck archives. Japanese closing text now uses explicit centered alignment in both editable PPTX and SVG/PDF exports. `node --check tools/submission-media/build-local-demo-deck.cjs` and `git diff --check` pass.
