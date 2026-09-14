# Wave 1 repository review plan

[日本語版](../ja/submission/deliverables_plan.md)

The repository review should make the product claim, implementation, limits, and reproducible checks
easy to follow. The review target is the checked-out `main` commit; record its exact SHA with
`git rev-parse HEAD`.

## Review requirements

| Requirement | Repository evidence | Completion gate |
| --- | --- | --- |
| Public GitHub repository | Root README, Apache 2.0 license, repository topic | Repository is publicly readable and has `midnightntwrk` at submission time |
| Clear project explanation | [Top README](../../README.md), [submission copy](submission_copy.md), [one-page brief](one_page_brief.md) | Value, architecture, setup, Midnight integration, limitations, and evaluation path are explicit |
| Meaningful Midnight functionality | [Compact contract](../../midnight/contracts/sensor-registry/src/sensor-registry.compact), witnesses, transaction agent, public verifier | Contract compiles with the pinned toolchain and rejection cases pass |
| Quality and reliability | Workspace tests, portability check, source gate | `npm ci && npm run verify:source` succeeds from a clean checkout |
| Dated deployment evidence | [Release addendum](current_release_addendum.md), [evidence matrix](evidence_matrix.md) | Public transaction records are linked with dates and claim boundaries |
| Honest roadmap | [Wave 1 progress](wave1_progress.md), [three-wave roadmap](../architecture/three_wave_roadmap.md) | Planned work is labeled separately from current behavior |

## Rubric mapping

| Category | Weight | Primary repository evidence |
| --- | ---: | --- |
| Engineering & Implementation | 40% | Eight-circuit compilation, privacy boundary, authorized Device / managed transactions, separated public and private MCP Workers |
| Quality Assurance & Reliability | 15% | Source tests, tamper rejection, fixed 24-slot input, retry and idempotency controls, reproducible source gate |
| Product & Vision | 15% | Privacy problem, target users, exact claim, and roadmap |
| User Experience & Design | 15% | Operator workflow, public verifier, explicit states, and evidence boundary in the frontend source |
| Communication | 10% | Focused README, one-page brief, architecture diagrams, claim matrix, and judge Q&A |
| Business Development & Viability | 5% | Construction measurement entry point, partner-pilot plan, and staged adoption model |

## Evidence path

1. Read the [one-page brief](one_page_brief.md) for the customer value and exact claim.
2. Follow each claim to source and rejection tests in the [evidence matrix](evidence_matrix.md).
3. Inspect the [Compact contract](../../midnight/contracts/sensor-registry/src/sensor-registry.compact), [witnesses](../../midnight/contracts/sensor-registry/src/witnesses.ts), and [public verifier](../../shared/public-attestation-verifier/src/index.ts).
4. Run the source gate and compare the result with the [technical checklist](technical_gate_checklist.md).
5. Use the [release addendum](current_release_addendum.md) for dated public records and their limits.

## Evidence policy

Only tracked files, reproducible command results, and public URLs belong in the repository review
evidence. A claim that cannot be reproduced or linked is marked open.
