# New GUI pitch and demo: recording handoff

[日本語版](../ja/submission/new_gui_recording_handoff.md)

Status: the story, bilingual narration, captions, imagegen diagrams, editable decks, and preview edit are prepared. Five owner-recorded GUI shots remain. The preview deliberately contains missing-footage cards and is not a completed GUI demonstration.

## Review the prepared edition

| Artifact | English | Japanese |
| --- | --- | --- |
| Editable 11-slide pitch | [PPTX](deck/bacchiri-new-gui-en-preview.pptx) | [PPTX](../ja/submission/deck/bacchiri-new-gui-ja-preview.pptx) |
| Review export | [PDF](deck/bacchiri-new-gui-en-preview.pdf) | [PDF](../ja/submission/deck/bacchiri-new-gui-ja-preview.pdf) |
| Narrated edit preview | [MP4, about 3:17](../../.demo-output/gui-finalization-20260910/en/bacchiri-new-gui-en-preview.mp4) | [MP4, about 3:12](../../.demo-output/gui-finalization-20260910/ja/bacchiri-new-gui-ja-preview.mp4) |
| Exact narration and timing | [Script](../../.demo-output/gui-finalization-20260910/en/narration.md) | [Script](../../.demo-output/gui-finalization-20260910/ja/narration.md) |
| Captions | [SRT](../../.demo-output/gui-finalization-20260910/en/bacchiri-new-gui-en-preview.srt) | [SRT](../../.demo-output/gui-finalization-20260910/ja/bacchiri-new-gui-ja-preview.srt) |

Video and working audio are local, ignored files. The new filenames preserve the historical submission and the earlier [Cloudflare operations edition](cloudflare_operations_media.md). The two diagram scenes use the already reviewed [imagegen artwork and prompts](../assets/review/cloudflare-operations-imagegen-prompts.md).

The eleven scenes cover value, reporting problem, registered Device, completed day, processing request, Cloudflare architecture, Wallet lifecycle, confirmed result, public verification, proof scope, and the next partner-pilot milestone. Slide text and speaker notes are editable. The two architecture figures remain raster images; PDF exports preserve the reviewed appearance. Install Noto Sans CJK JP and DejaVu Sans for the closest PowerPoint font match.

## What the owner records

Provide an unedited MP4 or MOV, either one continuous recording or separate files. No voiceover, background music, captions, or editing is required. Record at 1920 × 1080 and 30 fps when possible; use browser zoom around 125–150% so evidence remains readable in the export. Keep three seconds of stillness before and after actions. Capture about 30 seconds per shot, longer when scrolling is needed. The assistant selects the cuts and deck stills. One English GUI capture can serve both narration languages; a Japanese capture is also supported.

Use the deployed review portal and a prepared browser Device whose policy was already registered and valid for the selected completed operational date. Keep the same browser profile and its private proof input until the request is complete. A newly registered policy may require waiting for a later eligible measurement day; do not backdate registration or substitute an unrelated old result. Copy the operational date exactly as displayed, including its configured day boundary; do not infer it from the computer's calendar date.

The browser's **Auto Generate one day** action creates synthetic measurements. The narration identifies this as controlled test data. The separate Cloudflare diagrams explain the real field device's continuous collection path. To replace the GUI demonstration with a field-only workflow, revise the story and evidence requirements explicitly before building.

| Shot | Record this action and state | Keep visible | Approximate edited length, EN / JA |
| --- | --- | --- | --- |
| G01 | Open **Device Workflow** with the prepared registered Device and applied policy. Wallet connection and unlocking can be completed before recording. | Device identifier or commitment, policy identifier, public bounds and validity; selected project when relevant. | 15.5s / 13.0s |
| G02 | Select the prepared completed day using **View this day**. If demonstrating generation, record **Auto Generate one day** and the resulting day row. | Operational date, record count, threshold result, and **Private proof input available**. Keep private values collapsed. | 17.6s / 16.9s |
| G03 | Use the available **Generate ZKP / submit TX** action, approve the requested Device operation if prompted, and capture the accepted/pending job and processing schedule. Some states expose a separate **Request daily proof** action first. | Same Device/date, Proof Job ID, accepted or pending state, next processing start. | 16.8s / 16.9s |
| G04 | After processing, reopen the same day/job and hold the confirmed result on screen. This may be a separate recording on the next day. | Same Device/date/Proof Job ID, confirmed state, transaction hash. | 14.4s / 13.7s |
| G05 | In **Third-Party Verification**, preferably in a separate browser profile with no Device session, paste that transaction hash and click **Open proof**. Scroll slowly through the result. | Matching operational date, hourly WITHIN / OUTSIDE / NO DATA results, policy/validity, Device commitment, transaction, contract, and block evidence. | 19.2s / 19.4s |

An OUTSIDE test day is useful evidence if available: keep the public bounds visible and show the actual result. Do not force a success result or replace missing hours. The guide does not require exactly 1,440 records; display the real controlled count.

02:00 JST is the scheduled processing start, not a guaranteed confirmation time. Record G01–G03 first and G04–G05 after the same job confirms. The edit already labels the later confirmation shot and omits elapsed waiting time. No need to record the entire overnight wait or change Wallet operating mode. Keep credentials, recovery phrases, private keys, tokens, authorization headers, private hourly values, proof openings, and wallet-unlock inputs outside the recording. Public policy bounds and public evidence identifiers are expected on screen.

## What to send with the files

The original recording files, the displayed operational date, and the final transaction hash are enough to start the handoff. Add the Proof Job ID and recording date/time if convenient. Suggested names are `G01-device.mp4` through `G05-verifier.mp4`, but filenames are optional. The assistant fills the editing worksheet; the owner does not need to prepare JSON or cut the clips.

When footage arrives, the assistant reviews legibility and private-data exclusion, matches Device/date/policy/job/transaction evidence, checks the public Midnight result, chooses cut points and stills, and builds both language editions. If an essential state is absent, only that shot needs another recording. The current final build refuses missing or mismatched evidence; it does not fabricate confirmation.

## Reproduce the prepared edit

From the repository root, install development-host rendering dependencies separately from runtime workspaces:

```bash
npm install --prefix /tmp/midnight-pitch-media-deps --no-audit --no-fund pptxgenjs@4.0.1 jszip@3.10.1 pdf-lib@1.17.1
NODE_PATH=/tmp/midnight-pitch-media-deps/node_modules python3 tools/submission-media/build-gui-finalization.py en --reuse-audio
NODE_PATH=/tmp/midnight-pitch-media-deps/node_modules python3 tools/submission-media/build-gui-finalization.py ja --reuse-audio
```

The existing repository installation supplies `sharp`. FFmpeg/FFprobe, Node.js, Python 3, and the fonts above must be available. `--reuse-audio` uses the matching prepared MP3/SRT files without TTS network access. On a fresh host, create a development-only Python environment and install `edge-tts==7.2.8`, pass its Python with `--tts-python`, and omit `--reuse-audio`. For example:

```bash
python3 -m venv .demo-output/gui-finalization-tts
.demo-output/gui-finalization-tts/bin/python -m pip install edge-tts==7.2.8
NODE_PATH=/tmp/midnight-pitch-media-deps/node_modules python3 tools/submission-media/build-gui-finalization.py en --tts-python .demo-output/gui-finalization-tts/bin/python
```

The common story is [`gui-finalization-story.json`](../../tools/submission-media/gui-finalization-story.json). The builder exports PPTX/PDF, stills, a contact sheet, MP4, SRT, narration Markdown, `edit-manifest.json`, and `SHA256SUMS` beneath `.demo-output/gui-finalization-20260910/<locale>/`. The MP4 uses H.264/AAC, 1920 × 1080, 30 fps, narration normalized to −17 LUFS per scene, and burned-in captions. It contains synthetic narration, with no original recording audio. GUI video receives a larger view than the deck's annotated still.

Copy reviewed preview deck outputs from each locale's `slides/` directory to the linked `docs/.../deck/` filenames when regenerating the checked review copies. Do not run the historical submission generators against these new filenames.

## Finalization command for the assistant

Copy [`gui-recordings.example.json`](../../tools/submission-media/gui-recordings.example.json) to the ignored recording directory and fill it after inspecting the footage. `file` and the public-verification report `reference` resolve relative to this manifest. `in`, `out`, and `stillAt` are absolute seconds within the source recording; the still must lie inside the selected cut. `recordedAt` and `checkedAt` need an ISO date/time with timezone. Store full public identifiers, a confirmed transaction state, the reviewer's name, and the reviewed public-verification report. Never put private data in the manifest.

```bash
python3 tools/submission-media/build-gui-finalization.py en --mode final --manifest .demo-output/new-gui-recordings/recordings.json --validate-only
NODE_PATH=/tmp/midnight-pitch-media-deps/node_modules python3 tools/submission-media/build-gui-finalization.py en --mode final --manifest .demo-output/new-gui-recordings/recordings.json --reuse-audio
NODE_PATH=/tmp/midnight-pitch-media-deps/node_modules python3 tools/submission-media/build-gui-finalization.py ja --mode final --manifest .demo-output/new-gui-recordings/recordings.json --reuse-audio
```

The full selected cut plays at original speed. If narration lasts longer, the final frame is held; if the cut lasts longer, the scene grows. The report records held-frame duration and source hashes. Prefer cuts close to the prepared scene lengths to retain the approximately three-minute pacing. No processing transition is invented and no source file is modified. Different language editions can use different cuts if useful.

The builder validates recording metadata and the presence of a reviewed report. It does **not** independently query Midnight or recognize evidence inside pixels. The assistant must perform that evidence review, then inspect final video, audio, subtitles, and deck/PDF consistency before calling the deliverables complete. Publishing and submission links follow the user's later request.

## Preparation validation

Run `python3 -m unittest discover -s tools/submission-media -p test_gui_finalization.py -v` for evidence/cut rejection cases. An empty example manifest in `--mode final --validate-only` must fail. The prepared previews are decoded end to end with FFmpeg by the build itself. Caption text is checked against narration, timing is ordered, and the full export must remain within 200 ms of its scene timeline. No runtime or deployment configuration is changed by these tools.
