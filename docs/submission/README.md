# BACCHIRI!━━Verifiable Measurement Layer — Wave 1 Submission Package

[日本語版](../ja/submission/README.md)

This directory contains the judging package. Video production is intentionally last so the recording can show the final implemented GUI and its actual interaction flow.

| Artifact | Status | File |
| --- | --- | --- |
| Detailed production design | Ready | [deliverables_plan.md](deliverables_plan.md) |
| Submission copy | Ready; public URLs pending | [submission_copy.md](submission_copy.md) |
| Evidence matrix | Ready; final commit pending | [evidence_matrix.md](evidence_matrix.md) |
| Wave 1 progress record | Ready | [wave1_progress.md](wave1_progress.md) |
| Technical gate checklist | Ready; external gates pending | [technical_gate_checklist.md](technical_gate_checklist.md) |
| Judge Q&A | Ready | [judge_qa.md](judge_qa.md) |
| One-page brief | Ready | [one_page_brief.md](one_page_brief.md) |
| Editable English deck | Ready | [PPTX](deck/bacchiri-verifiable-measurement-layer-wave1-en.pptx) |
| Review English deck | Ready | [PDF](deck/bacchiri-verifiable-measurement-layer-wave1-en.pdf) |
| Final GUI demo script | Ready for capture | [demo_script.md](demo_script.md) |
| Final GUI capture pack | Deferred until GUI freeze | [captures/](captures/) |
| Video pitch | Deferred until GUI freeze | Add final public link to submission_copy.md |

## Rebuild

Use the bundled workspace Node module path when pptxgenjs or pdf-lib is not installed in this repository:

    NODE_PATH=<workspace-dependencies-node-modules> node scripts/build-submission-decks.cjs
    NODE_PATH=<workspace-dependencies-node-modules> node scripts/build-submission-pdfs.cjs

The PPTX and PDF are generated independently from the same ten-slide core story plus two technical appendix sequence diagrams. The final GUI slide is an explicit placeholder until the GUI implementation is frozen.

## Finalization order

1. Freeze and validate the final GUI.
2. Produce the language-specific capture packs.
3. Replace core slide 8 in both decks and rebuild the PDFs.
4. Record English and Japanese videos from the final review commit.
5. Freeze the commit, rerun verification, publish the repository and decks, and fill every placeholder URL.
6. Confirm public visibility, Apache 2.0, the midnightntwrk topic, and the AKINDO form.
