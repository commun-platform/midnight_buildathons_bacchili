# Bilingual judge presentation and GUI demo

[日本語](../ja/submission/local_demo.md)

The September 12 final editions contain fifteen motion scenes and a narrated closing. English speech, subtitles, graphics and GUI text are now available alongside the Japanese edition. Both explain the actual Wallet use cases: authentication and registration approval, private daily aggregation, proof requests, Device transaction approval, Sponsor DUST payment and independent verification.

Large headlines, progressive diagrams, chapter navigation, alternating dark and light scenes, and 27 GUI close-ups help viewers follow the explanation. A 24-hour grid explains aggregation; Device → Sponsor → Midnight explains approval and submission; separate labels distinguish out-of-range, missing and rejected inputs. Fine outlines identify the controls being discussed. Each edition ends with the service name, slogan and thanks.

The English pronunciation revision explicitly supplies **バッチリ** to the same multilingual narrator for all three spoken service names (opening, problem and closing). The displayed name and subtitles remain **Bacchiri**.

## Finished media

| Language | Movie | Presentation | Captions and script |
| --- | --- | --- | --- |
| English | [MP4 — 5:07, 1080p/30fps](../../.demo-output/local-demo-tagline-en-20260912/bacchiri-local-demo-en.mp4) | [17-slide PPTX with movie](deck/bacchiri-local-demo-en.pptx), [PDF](deck/bacchiri-local-demo-en.pdf) | [SRT](../../.demo-output/local-demo-tagline-en-20260912/bacchiri-local-demo-en.srt), [narration](../../.demo-output/local-demo-tagline-en-20260912/narration.md) |
| Japanese | [MP4 — 5:25, 1080p/30fps](../../.demo-output/local-demo-tagline-ja-20260912/bacchiri-local-demo-ja.mp4) | [17-slide PPTX with movie](../ja/submission/deck/bacchiri-local-demo-ja.pptx), [PDF](../ja/submission/deck/bacchiri-local-demo-ja.pdf) | [SRT](../../.demo-output/local-demo-tagline-ja-20260912/bacchiri-local-demo-ja.srt), [narration](../../.demo-output/local-demo-tagline-ja-20260912/narration.md) |

English closing: **“Bacchiri. Trust in data. Proof for everyone. Thank you.”** Japanese closing: **「バッチリ。データに信頼を。検証を、誰にでも。ありがとう。」**

For a quick review, play the [English closing clip](../../.demo-output/local-demo-tagline-en-20260912/closing.mp4) or [Japanese closing clip](../../.demo-output/local-demo-tagline-ja-20260912/closing.mp4).

Slide 16 is the closing; slide 17 embeds the complete movie. PDF shows a poster on the last page. The English review deck uses full-resolution movie frames so the visual composition matches the film; those slide images are flattened, while speaker notes are editable. The Japanese deck retains editable text and shapes. The [English scene overview](../../.demo-output/local-demo-tagline-en-20260912/slides/contact-sheet.png) and [Japanese deck overview](../../.demo-output/local-demo-tagline-ja-20260912/slides/contact-sheet.png) help review the content.

The files are local artifacts. The movies, captions and production manifests are ignored by Git and must be transferred separately or regenerated. They are not public submission URLs.

## Recording context and validation

The browser recording starts with a prepared connected-account state. Narration follows Wallet interactions in the actual product workflow. Five current GUI views are captured using their real browser controls and synthetic filming state. The on-screen simulation label identifies that context; proof and transaction results in the recording are simulated. Historical Preprod evidence stays separate.

The Japanese main movie retains the approved 315.655-second presentation, with a 9.367-second closing added. Its original AAC packets and SRT remain unchanged as the prefix of the final edition. The English version has its own recording and speech timings, word-aware captions, and short sentence pauses to allow reading. GUI recordings retain their original timing, with a final-frame hold where needed.

Both captures pass 29 browser checks with no page/console errors. The media checks verify complete decode, 1920×1080/30fps, captions against the narration, camera bounds, and the exact MP4 embedded in each PPTX. The existing fourteen media acceptance tests and repository portability check pass. Final records are available here:

- English: [capture](../../.demo-output/local-demo-tagline-en-20260912/capture-evidence.json), [edit](../../.demo-output/local-demo-tagline-en-20260912/edit-manifest.json), [validation](../../.demo-output/local-demo-tagline-en-20260912/media-validation.json), [delivery manifest](../../.demo-output/local-demo-tagline-en-20260912/delivery-manifest.json), [SHA256SUMS](../../.demo-output/local-demo-tagline-en-20260912/SHA256SUMS).
- Japanese: [capture](../../.demo-output/local-demo-tagline-ja-20260912/capture-evidence.json), [edit](../../.demo-output/local-demo-tagline-ja-20260912/edit-manifest.json), [validation](../../.demo-output/local-demo-tagline-ja-20260912/media-validation.json), [delivery manifest](../../.demo-output/local-demo-tagline-ja-20260912/delivery-manifest.json), [SHA256SUMS](../../.demo-output/local-demo-tagline-ja-20260912/SHA256SUMS).

The prior Japanese GUI implementation checks (94 tests and typechecking) belong to the earlier capture work. This bilingual edit changes media tooling, filming text and delivery guidance.

## Run the filming GUI

Run `npm run dashboard:demo`, then open [the local GUI](http://127.0.0.1:8790/?demo=1#/device). Stop it with Ctrl+C. Use `npm run dashboard:demo -- --port 8792` for another port.

Navigate through Device Workflow, Administrator, Third-Party Verification, Managed API Proof and System Operations. Create a Project and Policy, register the Device, select a completed operational day and generate filming measurements. Follow proof progress and its transaction identifier, then verify the public results. Separate days demonstrate out-of-range and missing measurements. Administrator exposes authorized hourly aggregates; the public view omits their values. Managed API shows sources and runs; Operations shows health, metrics and events. A [supplementary English clip](../../.demo-output/local-demo-tagline-en-20260912/raw/recovery.mp4) shows failure and retry.

The explicit `?demo=1` switch is valid only on loopback. Filming state has its own `bacchiri-local-demo-v1:` storage prefix; reset clears only that state. The static server blocks API routes and outbound browser connections. Production authentication and approval behavior is unchanged. English capture injects a loopback-only text localization layer for remaining Operations and filming labels; its dictionary and script hashes are recorded in the capture manifest.

## Reproduce the final editions

Run commands from the repository root. Dependencies are FFmpeg/FFprobe with libass, Noto Sans CJK JP, Chrome, Python with `edge-tts==7.2.8`, Node and the existing `ws`/`sharp` packages. Deck builders also need `pptxgenjs` and `pdf-lib`; set `NODE_PATH` to their development installation. The existing speech environment is `.demo-output/submission-en-20260831/.venv/bin/python`; use `--tts-python` to select another interpreter. Only the public narration text is sent to the speech service.

The approved Japanese source assets in `.demo-output/local-demo-wallet-uc-20260911/` are required for the Japanese composition and the English scene-duration reference. `local-demo-story.json`, `local-demo-focus.json`, `local-demo-english.json` and `local-demo-ending.json` define the content. Keep reviewed captures intact; use a fresh output directory for a new recording and pass matching directory arguments to subsequent steps.

```sh
# Japanese motion composition, narrated closing, and updated deck
python3 tools/submission-media/build-local-demo-presentation.py --resume
python3 tools/submission-media/build-local-demo-ending.py --locale ja --source-dir .demo-output/local-demo-presentation-20260912 --output-dir .demo-output/local-demo-tagline-ja-20260912
node tools/submission-media/build-local-demo-deck.cjs --output-dir .demo-output/local-demo-tagline-ja-20260912/slides --frames-dir .demo-output/local-demo-tagline-ja-20260912/frames --video .demo-output/local-demo-tagline-ja-20260912/bacchiri-local-demo-ja.mp4 --ending tools/submission-media/local-demo-ending.json

# English capture: run a local server first, and choose a fresh directory
node tools/submission-media/capture-local-demo.mjs --base-url http://127.0.0.1:8792 --output-dir .demo-output/local-demo-english-capture-20260912 --language en
python3 tools/submission-media/build-local-demo-english.py --audio-only
python3 tools/submission-media/build-local-demo-english.py --resume --reuse-audio
python3 tools/submission-media/build-local-demo-ending.py --locale en --source-dir .demo-output/local-demo-english-20260912 --output-dir .demo-output/local-demo-tagline-en-20260912
node tools/submission-media/build-local-demo-review-deck.cjs --source-dir .demo-output/local-demo-tagline-en-20260912
```

`--preview value --preview device --preview wallet` renders representative English scenes. Matching speech caches and render signatures can be reused. Changed filming text requires a fresh capture, and a new capture requires reviewing its timing and camera geometry. The separate real-evidence finalization workflow retains its reviewed Preprod requirements.
