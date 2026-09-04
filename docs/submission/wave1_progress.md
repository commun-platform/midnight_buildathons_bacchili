# Wave 1 Progress Record

[日本語版](../ja/submission/wave1_progress.md)

Period covered: 2026-08-27 to 2026-09-02 JST
Status: final English demo pitch produced; public submission URL pending

## How to read this record

The repository history begins on the Wave 1 opening date, so this document does not claim a feature-by-feature difference from an earlier public release. It reports only commits made during Wave 1 and validation performed against the current working source through 2026-09-02.

Current source validation and Midnight preproduction-network transactions recorded on 2026-08-28 are separate evidence. They do not mean the current source was redeployed on the same day.

## Built during Wave 1

| Area | Built | Verified |
| --- | --- | --- |
| Zero-knowledge proof | Check against a public threshold, determine WITHIN / OUTSIDE, and use a fixed format with 24 hourly slots | All 8 proof circuits compile; 18 contract tests pass |
| Supporting field integration | Measurement collection, hourly aggregation, API authentication, transaction authorization, update, and rollback code for later field operation | 16 collection, 6 authentication, and 32 transaction-agent tests pass; autonomous production operation is not claimed |
| Backend | Device authentication, proof-request admission, workflow-state storage, proof generation, and APIs that return public information only | 246 Backend API tests and the Cloudflare pre-deployment check pass |
| Frontend | Combined review workflow with operator steps, a third-party public view, and English / Japanese display | 78 Frontend tests and the production build pass |
| Midnight integration | Public threshold, target proof subject, and a user-authorized daily transaction | Simulator tests and the 2026-08-28 preproduction-network transactions were confirmed |
| Safety | Tamper rejection, duplicate prevention, execution locking, configuration-downgrade rejection, and corrupt-state quarantine | These failure cases are included in the 496 automated tests |
| Judge materials | Architecture, privacy boundary, demo procedure, measured cost, English / Japanese figures, and submission package | Documents are categorized and cross-links are checked |

See the [claim-to-evidence map](evidence_matrix.md) for detailed commits and validation locations.

## Important improvements made in Wave 1

1. One day is normalized into a fixed 24-hour format so the proof circuit does not grow with the number of individual readings.
2. The path expanded from one proof subject and a WITHIN-only result to project-scoped registration with truthful WITHIN and OUTSIDE results.
3. API authentication, on-contract authority, and Midnight transaction authorization were separated.
4. Direct submission became a proof-request workflow that prevents duplicate execution and limits concurrency.
5. A static page became a bilingual review flow that combines operator steps and third-party evidence for low-friction judging.
6. The supporting field-runtime package gained content validation, version management, rollback after a failed update, and credential protection.

## Result verified on 2026-09-02

- Repository portability validation passed.
- All 8 `sensor-registry` proof circuits compiled.
- All 496 automated tests passed across 12 workspaces and the mock counterpart service.
- All workspace type checks and Frontend / TypeScript builds passed.
- The Cloudflare pre-deployment check passed.

Midnight preproduction-network records from 2026-08-28 include both WITHIN and OUTSIDE. The OUTSIDE example produced from 1,440 synthetic readings was reduced to 24 hourly slots and confirmed as one proof and one authorized transaction.

## Current limitations

- The current Worker and GUI were deployed on 2026-09-02 JST; separately dated attestations remain the chain evidence used by this document.
- The Backend and Proof Server are trusted while handling private proof input.
- The third-party view directly queries the public Midnight Indexer and compares transaction and Contract state; it does not rerun the ZK verifier locally.
- The primary review flow uses a browser-based simulated measurement source; a field measurement system does not yet run the complete daily lifecycle autonomously.
- Operator and third-party views are combined for judging rather than separated by production roles and applications.
- Daily submission requires explicit user action.
- This proof alone does not guarantee physical sensor accuracy, continuous sampling, that no readings were withheld, or correct measurement-source aggregation.
- The English demo video is complete; publishing its submission URL and producing an optional Japanese adaptation remain external tasks.

## Next waves

- Wave 2 connects real field measurement systems, automates the complete daily lifecycle, separates user roles and applications, adds production authorization, audit, diagnostics, monitoring, recovery, and an operations dashboard, and targets a paid partner pilot.
- Wave 3 adds hardware-protected identity and provenance, commercial multi-organization operation, and PMF validation through recurring revenue, renewal, expansion, and sustainable unit economics.

Wave 2 and Wave 3 are plans, not current features.
The canonical product and business plan is the [three-wave roadmap](../architecture/three_wave_roadmap.md).
Implementation-level priorities, including contract-first dependencies, are tracked in the
[future feature backlog](../implementation/future_features.md).
