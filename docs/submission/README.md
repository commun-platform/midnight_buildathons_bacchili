# Repository review guide

This guide is the source-only entry point for reviewing BACCHIRI!━━Verifiable Measurement Layer.
It points to files, tests, commands, and public transaction records that are part of this repository's
technical review. The review target is the checked-out `main` commit; record its exact SHA with
`git rev-parse HEAD`.

[日本語版](../ja/submission/README.md)

## Start here

| Review question | Source of truth |
| --- | --- |
| What problem does the product solve? | [Top README](../../README.md) and [one-page brief](one_page_brief.md) |
| What exactly is proved? | [Claim and evidence matrix](evidence_matrix.md) |
| Where is the privacy boundary? | [Private-information specification](../security/private_spec.md) and the contract source |
| How is the proof implemented? | [Sensor Registry contract](../../midnight/contracts/sensor-registry/src/sensor-registry.compact) and [witnesses](../../midnight/contracts/sensor-registry/src/witnesses.ts) |
| How can the result be checked? | [Public verifier](../../shared/public-attestation-verifier/src/index.ts) and [release addendum](current_release_addendum.md) |
| What was tested? | [Technical gate checklist](technical_gate_checklist.md) and the workspace test suites |
| What remains open? | [Wave 1 progress](wave1_progress.md) and [judge Q&A](judge_qa.md) |

## Reproduce the source gate

From a clean checkout with Node.js 22 and the pinned Compact toolchain:

```bash
npm ci
compact update 0.31.1
npm run verify:source
```

`verify:source` runs the source-only review boundary, portability checks, compiles the operational `sensor-registry` contract, runs
the repository test suites, and type-checks every workspace. It does not require Device secrets,
deployment credentials, wallet recovery material, or a live network. The current baseline is 8
compiled circuits and 524 operational workspace tests, plus 4 managed-source mock tests (528 total).

For a narrower check that does not compile Compact:

```bash
npm run verify:portability
npm run typecheck
npm run test:managed-source-mock
```

The GitHub source workflow runs `npm run verify:review`, portability, and the deterministic
Managed Source mock because hosted runners do not contain the pinned Compact Developer Tools by
default. The full compile and workspace suite remain reproducible with `npm run verify:source` on a
development host after `compact update 0.31.1`.

## Evidence boundary

Claims in the submission docs must resolve to tracked source, tracked tests, or a public URL. A claim
without one of those references is not part of this repository review. A public transaction record is
dated evidence for that deployment; it does not replace the source and test checks above.

## Review order

1. Read the exact claim and limitations in the [one-page brief](one_page_brief.md).
2. Follow the claim rows to source and rejection tests in the [evidence matrix](evidence_matrix.md).
3. Run `npm run verify:source` and inspect the [technical gate checklist](technical_gate_checklist.md).
4. Compare the current public records and their boundaries in the [release addendum](current_release_addendum.md).
5. Use the [three-wave roadmap](../architecture/three_wave_roadmap.md) for planned work; planned work is not presented as shipped behavior.

## Repository requirements

The repository must be publicly readable at submission time, retain the Apache 2.0 license, and use
the GitHub topic `midnightntwrk`. Those publication settings are external repository metadata and
are checked separately from the source gate.
