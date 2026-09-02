# Documentation Guide

## Submission

- [Wave 1 judging deliverables plan](submission/deliverables_plan.md): rubric mapping, artifact specifications, deck and demo structure, evidence, and completion gates.
- [Submission copy](submission/submission_copy.md): project pitch, problem, solution, Midnight fit, progress, exact claim, and final link placeholders.
- [Evidence matrix](submission/evidence_matrix.md): claim-by-claim source, local, Preprod, and validation-boundary evidence.
- [Wave 1 progress](submission/wave1_progress.md): dated implementation delta, material iterations, limitations, and roadmap.
- [Technical gate checklist](submission/technical_gate_checklist.md): local PASS results and external publication gates.
- [Judge Q&A](submission/judge_qa.md): concise answers for privacy, trust, scale, product, and business questions.
- [One-page brief](submission/one_page_brief.md): compact live-pitch handout.
- [Final GUI demo script](submission/demo_script.md): exact action sequence, narration, redaction, shots, and fallback policy.
- [English judging deck](submission/deck/bacchiri-verifiable-measurement-layer-wave1-en.pdf): final nine-slide pitch synchronized with the 2:18 English video; the editable PPTX is in the same directory.

[日本語版](ja/README.md)

The documentation is grouped by review purpose. Start with architecture, then use the other sections when the reviewer needs security, operational, or implementation evidence.

## Architecture

- [Wave 1 specification](architecture/wave1_spec.md): normative product scope, claim, boundaries, and acceptance criteria.
- [Three-wave product and business roadmap](architecture/three_wave_roadmap.md): Core Proof PoC, operational partner pilot, and PMF outcomes.
- [System architecture](architecture/system_architecture.md): Edge Device, Frontend, Backend, and Midnight responsibilities.
- [Hourly extrema attestation](architecture/hourly_extrema_attestation_proposal.md): fixed 24-slot circuit and daily proof flow.
- [Wave 2 system operations console](architecture/wave2_system_operations.md): Access-protected Wallet synchronization, processing, metrics, and audit design.

## Security

- [Privacy and public claim boundary](security/private_spec.md): private data, public evidence, and explicit non-claims.
- [Device authentication](security/device_authentication.md): P-256 challenge/session protocol and key storage.
- [Fleet device registry](security/device_registry.md): enrollment, rotation, disabling, and authority lifecycle.

## Operations

- [Development environment](operations/development_environment.md): development-only setup, compilation, verification, deployment preparation, and release creation.
- [Deployment and review runbook](operations/demo_runbook.md): ordered deployment, enrollment, proof, and review procedure.
- [Device firmware](operations/device_firmware.md): package, installation, rollback, and device runtime boundary.

## Implementation and evidence

- [Implementation map](implementation/implement_spec.md): specification-to-code, API, storage, and contract-field mapping.
- [GUI action and processing reference](implementation/gui_action_reference.md): every reviewer control, execution location, asynchronous state, reload behavior, and privacy boundary.
- [Operational ZK circuit specification](implementation/zk_circuit_spec.md): six proof circuits, private/public inputs, checks, ledger effects, diagrams, and explicit non-claims.
- [Operational day boundary](architecture/operational_day_boundary.md): fixed 24-slot proofs with a pre-registered fixed UTC offset and local start hour.
- [Transaction-hash verification specification](implementation/transaction_hash_verification.md): trust anchors, public ledger field meanings, the 24-hour proof relation, normative third-party verification steps, and a real Preprod conformance vector.
- [Future feature backlog](implementation/future_features.md): contract-first changes, later operational features, priorities, and completion conditions.
- [Midnight fee sponsorship](implementation/fee_sponsorship.md): DUST-only fee payer, key boundaries, asynchronous Wallet synchronization, exact-byte transaction hold, retries, and current integration status.
- [Cost benchmark](implementation/cost_benchmark.md): measured results and planning model.
- [Storage migration](implementation/storage_migration.md): optional D1-to-Turso adapter and cutover design.

Generated slide diagrams are stored under [`assets/review/`](assets/review/), and documentation-specific figures under [`assets/guides/`](assets/guides/). Japanese assets are kept separately under [`ja/assets/review/`](ja/assets/review/) and [`ja/assets/guides/`](ja/assets/guides/).
