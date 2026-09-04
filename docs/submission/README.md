# BACCHIRI!━━Verifiable Measurement Layer — Wave 1 Submission Package

[日本語版](../ja/submission/README.md)

This directory contains the judging package. The final English demo pitch was produced from the
implemented GUI. Later engineering evidence is kept in a separate release addendum so the filmed
story, current source, and current Preprod deployment are not conflated.

| Artifact | Status | File |
| --- | --- | --- |
| Detailed production design | Ready | [deliverables_plan.md](deliverables_plan.md) |
| Submission copy | Ready; public URLs pending | [submission_copy.md](submission_copy.md) |
| Evidence matrix | Ready; implementation baseline `af90ad8` recorded | [evidence_matrix.md](evidence_matrix.md) |
| Current release addendum | Ready; covers post-capture Managed API, Device, operations, MCP, and current-Contract evidence | [current_release_addendum.md](current_release_addendum.md) |
| Wave 1 progress record | Ready | [wave1_progress.md](wave1_progress.md) |
| Technical gate checklist | Ready; external gates pending | [technical_gate_checklist.md](technical_gate_checklist.md) |
| Judge Q&A | Ready | [judge_qa.md](judge_qa.md) |
| One-page brief | Ready | [one_page_brief.md](one_page_brief.md) |
| Editable English deck | Ready; slide 7 includes current Sponsor Wallet architecture and bounded cost evidence | [PPTX](deck/bacchiri-verifiable-measurement-layer-wave1-en.pptx) |
| Review English deck | Ready; independent nine-page review export | [PDF](deck/bacchiri-verifiable-measurement-layer-wave1-en.pdf) |
| Japanese Technical Reference | Reference only; slide 8 includes the localized current architecture and bounded cost evidence | [PPTX](../ja/submission/deck/bacchiri-verifiable-measurement-layer-wave1-ja.pptx) · [PDF](../ja/submission/deck/bacchiri-verifiable-measurement-layer-wave1-ja.pdf) |
| Final GUI demo script | Used for the English pitch | [demo_script.md](demo_script.md) |
| Final GUI capture pack | Ready; six reviewed stills plus submission thumbnail | [captures/](captures/) |
| English video pitch | Produced (2:18); public URL pending | `bacchiri-demo-pitch-en.mp4`; add the final public link to [submission_copy.md](submission_copy.md) |

## Deck source and legacy generator

The final English nine-slide PPTX is the editable source synchronized with the video; the PDF is its
review export. `tools/submission-media/build-submission-decks.cjs` and
`build-submission-pdfs.cjs` reproduce the earlier twelve-page bilingual technical deck and are retained
only for historical/reference material. They do **not** reproduce the final pitch and must not be run
against the submitted English filenames.

The current English PPTX and PDF use the same nine-slide story as the 2:18 video: value, trust problem,
use-case order, proof-subject/policy binding, private sensor evidence, proof generation, user/service
authority separation, third-party verification, and the exact claim boundary. Slide 7 now uses the
current-system architecture to show the on-demand server-side Sponsor Wallet as an engineering result:
it pays DUST only, does not receive Device Authority or private raw values, checkpoints before
stopping, and avoids idle Container time. The cost callout is an explicitly bounded planning estimate.

The deck intentionally does not add operations-console or MCP detail after the video was frozen.
Those implemented extensions and their current eight-circuit Preprod records are documented in the
[current release evidence addendum](current_release_addendum.md) and [evidence matrix](evidence_matrix.md).

`build-on-demand-zkp-architecture.cjs` generates the editable English SVG and 1672 × 941 PNG.

`build-on-demand-zkp-architecture-ja.cjs` creates a separate Japanese localization without overwriting
the original Japanese guide figure. `include-on-demand-architecture-in-ja-reference.cjs` replaces only
slide/page 8 of the twelve-slide Japanese Technical Reference; it does not redefine that reference deck
as the final submission pitch.

## Finalization order

1. Freeze the final commit and rerun repository verification.
2. Confirm that the capture pack contains no secret or private proof input.
3. Publish the completed English video, deck, PDF, and thumbnail.
4. Fill every placeholder URL in the submission copy and top README.
5. Confirm public visibility, Apache 2.0, the midnightntwrk topic, and the logged-in AKINDO form.
6. Produce a Japanese nine-slide pitch synchronized with the video only if the review audience requires it; the localized Technical Reference slide is already available.
