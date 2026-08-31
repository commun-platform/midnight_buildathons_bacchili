# BACCHIRI!━━Verifiable Measurement Layer — Wave 1 Submission Package

[日本語版](../ja/submission/README.md)

This directory contains the judging package. The final English demo pitch was produced from the implemented GUI; only its public submission URL remains to be added.

| Artifact | Status | File |
| --- | --- | --- |
| Detailed production design | Ready | [deliverables_plan.md](deliverables_plan.md) |
| Submission copy | Ready; public URLs pending | [submission_copy.md](submission_copy.md) |
| Evidence matrix | Ready; final commit pending | [evidence_matrix.md](evidence_matrix.md) |
| Wave 1 progress record | Ready | [wave1_progress.md](wave1_progress.md) |
| Technical gate checklist | Ready; external gates pending | [technical_gate_checklist.md](technical_gate_checklist.md) |
| Judge Q&A | Ready | [judge_qa.md](judge_qa.md) |
| One-page brief | Ready | [one_page_brief.md](one_page_brief.md) |
| Editable English deck | Ready; synchronized with the 2:18 pitch | [PPTX](deck/bacchiri-verifiable-measurement-layer-wave1-en.pptx) |
| Review English deck | Ready; synchronized with the 2:18 pitch | [PDF](deck/bacchiri-verifiable-measurement-layer-wave1-en.pdf) |
| Final GUI demo script | Used for the English pitch | [demo_script.md](demo_script.md) |
| Final GUI capture pack | Ready; six reviewed stills plus submission thumbnail | [captures/](captures/) |
| English video pitch | Produced (2:18); public URL pending | `bacchiri-demo-pitch-en.mp4`; add the final public link to [submission_copy.md](submission_copy.md) |

## Deck source and legacy generator

The final English nine-slide PPTX is the editable source synchronized with the video; the PDF is its
review export. `tools/submission-media/build-submission-decks.cjs` and
`build-submission-pdfs.cjs` reproduce the earlier twelve-page bilingual technical deck and are retained
only for historical/reference material. They do **not** reproduce the final pitch and must not be run
against the submitted English filenames.

The current English PPTX and PDF use the same nine-slide story as the 2:18 video: value, trust problem, use-case order, proof-subject/policy binding, private sensor evidence, proof generation, user/service authority separation, third-party verification, and the exact claim boundary.

## Finalization order

1. Freeze the final commit and rerun repository verification.
2. Confirm that the capture pack contains no secret or private proof input.
3. Publish the completed English video, deck, PDF, and thumbnail.
4. Fill every placeholder URL in the submission copy and top README.
5. Confirm public visibility, Apache 2.0, the midnightntwrk topic, and the logged-in AKINDO form.
6. Produce a separate Japanese video/deck only if the review audience requires it.
