# Make the BACCHIRI pitch concrete for judges


This ExecPlan follows `.agents/PLANS.md` and is maintained throughout the September 11, 2026 revision.

## Purpose / Big Picture


A judge should understand who uses BACCHIRI, what another organization can check, why Midnight matters, and how the next partner pilot tests business value. The revised Japanese and English pitch will start with an explicitly illustrative construction-site reporting situation, follow one daily report through the existing five GUI scenes, and end with an adoption path through existing measurement providers. Reviewable outputs are an editable eleven-slide PPTX, PDF, narrated preview, and a short judging brief. The GUI footage remains visibly pending; this task improves the prepared pitch and does not manufacture operational evidence.

## Progress


- [x] (2026-09-11) Read the existing story, renderer, media builder, recording handoff, repository plans, and documented business scope. Recorded the existing dirty worktree.
- [ ] Revise both languages around a concrete reporting situation and three judge takeaways.
- [ ] Improve the use-case slide and keep the proof result ahead of technical explanation.
- [ ] Generate both decks, narration, subtitles, and preview videos in a new dated output directory.
- [ ] Inspect rendered output, validate timing and media, update review links and record evidence.

## Surprises & Discoveries


The existing story spends two scenes on infrastructure before showing confirmation and independent verification. Its use-case language names generic operators and reviewers. All five GUI shots are placeholders, so a preview must continue to identify the planned footage. The newest Japanese and English decks are both eleven slides; the older Japanese fourteen-slide technical reference is a separate artifact.

## Decision Log


Decision: use construction-site reporting as the proposed business setting, while describing temperature as the demonstrated measurement path. Noise and vibration require additional input definitions and validation and remain future work. Rationale: this is the documented initial market, without implying deployed construction customers or completed sensor integrations. Date: 2026-09-11.

Decision: retain the five existing shot identifiers and evidence validation. Show the full business outcome before explaining its infrastructure, keep private inputs and trusted-backend boundaries accurate, and avoid invented contracts, savings, prices, or product features. Date: 2026-09-11.

Decision: preserve September 10 preview files and produce September 11 outputs. Reuse the existing image assets and editable code-drawn shapes. No generated raster image is needed for the workflow illustration. Date: 2026-09-11.

## Outcomes & Retrospective


Work is in progress. Completion means both languages have synchronized artifacts with the revised story and clearly identified missing GUI footage; it does not mean the final recorded demo is complete.

## Context and Orientation


`tools/submission-media/gui-finalization-story.json` owns bilingual slide copy, narration, scene IDs and the five recording slots G01 through G05. `render-gui-finalization-deck.cjs` creates editable PowerPoint text and shapes, matching PNG pages and a PDF. `build-gui-finalization.py` generates synthetic narration through the existing edge-tts environment, checks subtitles against the script, composes H.264/AAC video, and writes a timeline and hashes. It rejects final mode without reviewed matching evidence. Existing outputs are in `.demo-output/gui-finalization-20260910/` and `docs/{ja/,}submission/deck/`.

The on-chain proof binds private hourly extrema to registered conditions and public hourly results. Public viewers do not receive sensor values. The present proof backend receives private proof inputs and is trusted. Sensor truth, complete sampling and correct source aggregation are outside the claim. The browser compares public transaction and contract records; it does not rerun the zero-knowledge verifier. Current operation uses Midnight Preprod, and 02:00 Japan time starts eligible processing rather than guaranteeing confirmation.

## Plan of Work


Milestone one rewrites scene copy and narration in both languages. The opening must name the construction operator and commissioning party, describe the reporting handoff as an envisioned application, and leave the judge with three points: useful evidence without third-party raw-value disclosure, a condition/result relationship checked by Midnight, and an adoption route through existing equipment and cloud providers. A small Markdown judging brief will preserve a spoken opening, audience questions, proof boundaries and pilot metrics without asserting an official judging rubric.

Milestone two adjusts the renderer to make the use case a visible workflow, moves confirmation and verification directly after the request, and builds September 11 siblings. The output retains eleven slides and the five existing recording slots. Technology scenes explain their user value and remain short. Build the Japanese edition first for a readability check, then the English edition. Update the recording handoff links to the newest outputs and keep old files intact.

Milestone three inspects every slide through contact sheets and selected full pages, checks that captions and narration match, and lets the existing builder fully decode each video. Run the existing thirteen media evidence tests and repository portability/whitespace checks. Do not rerun deployed runtime suites for editorial-only work.

## Concrete Steps


Work from the repository root containing `package.json`. Reuse `/tmp/midnight-pitch-media-deps/node_modules` for presentation dependencies and `.demo-output/submission-en-20260831/.venv/bin/python` for narration when available. Build into the new dated directory:

    NODE_PATH=/tmp/midnight-pitch-media-deps/node_modules python3 tools/submission-media/build-gui-finalization.py ja --output-dir .demo-output/judge-pitch-20260911
    NODE_PATH=/tmp/midnight-pitch-media-deps/node_modules python3 tools/submission-media/build-gui-finalization.py en --output-dir .demo-output/judge-pitch-20260911
    python3 -m unittest discover -s tools/submission-media -p test_gui_finalization.py -v
    npm run verify:portability
    git diff --check

Confirm the actual portability script name from `package.json` before running. For repeat rendering, add `--reuse-audio` only after the exact revised narration has been generated. Copy reviewed PPTX/PDF siblings to language-specific `docs/.../deck/` directories and document exact paths and durations at completion.

## Validation and Acceptance


Opening slides must answer who acts and what they check without relying on the narrator. Confirmation and third-party verification should appear before the infrastructure explanation. Every deck has eleven pages and readable text; both videos have five explicitly pending GUI slots and no invented screenshot. The subtitle text must equal the spoken script, and final duration must match the sum of scenes within 200 milliseconds. Fully decode H.264/AAC output and inspect subtitle placement. The empty example manifest must remain rejected for final delivery. Claims about noise/vibration, commercial use and time savings must be labeled as future integration or pilot validation.

## Idempotence and Recovery


Keep the previous dated preview directory untouched and snapshot the original story and renderer into the new ignored output directory before editing. Repeating the build replaces only the new dated outputs. Restore from those snapshots if needed. No runtime settings, wallets, service operations, deployment, publication or private data access belong to this task.

## Artifacts and Notes


The existing working tree includes unrelated Worker, release and device changes. Only submission media, related handoff documents and this plan are in scope. Final paths, durations and validation evidence will be added after successful rendering.

## Interfaces and Dependencies


Retain scene IDs, `kind`, `shot`, localized `cards`, `title`, `takeaway`, `narration`, and diagram `image` paths. The renderer uses PptxGenJS, pdf-lib and sharp. The media builder uses Python, FFmpeg, FFprobe and the existing edge-tts voice environment. Avoid new runtime dependencies. Native PowerPoint shapes and the existing diagrams remain editable or replaceable through their source files.

Revision 2026-09-11: Initial plan for the user-authorized judging and real-world-use revision.
