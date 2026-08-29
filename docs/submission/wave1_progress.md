# Wave 1 Progress Record

[日本語版](../ja/submission/wave1_progress.md)

Period covered: 2026-08-27 to 2026-08-29 JST
Status: implementation continues; the video will be recorded after the final GUI is ready

## How to read this record

The repository history begins on the Wave 1 opening date, so this document does not claim a feature-by-feature difference from an earlier public release. It reports only commits made during Wave 1 and validation performed against the current working source on 2026-08-29.

Current source validation and Midnight preproduction-network transactions recorded on 2026-08-28 are separate evidence. They do not mean the current source was redeployed on the same day.

## Built during Wave 1

| Area | Built | Verified |
| --- | --- | --- |
| Zero-knowledge proof | Check against a public threshold, determine WITHIN / OUTSIDE, and use a fixed format with 24 hourly slots | All 6 proof circuits compile; 12 contract tests pass |
| Edge Device | Sensor collection, hourly aggregation, API authentication, transaction signing, update, and rollback | 13 collection, 5 authentication, and 23 wallet tests pass |
| Backend | Device authentication, proof-request admission, workflow-state storage, proof generation, and APIs that return public information only | 32 Backend API tests and the Cloudflare pre-deployment check pass |
| Frontend | Administrator workflow, third-party public view, and English / Japanese display | 26 Frontend tests and the production build pass |
| Midnight integration | Public threshold, target Device, and a Device-signed daily transaction | Simulator tests and the 2026-08-28 preproduction-network transactions were confirmed |
| Safety | Tamper rejection, duplicate prevention, execution locking, configuration-downgrade rejection, and corrupt-state quarantine | These failure cases are included in the 182 automated tests |
| Judge materials | Architecture, privacy boundary, demo procedure, measured cost, English / Japanese figures, and submission package | Documents are categorized and cross-links are checked |

See the [claim-to-evidence map](evidence_matrix.md) for detailed commits and validation locations.

## Important improvements made in Wave 1

1. One day is normalized into a fixed 24-hour format so the proof circuit does not grow with the number of individual readings.
2. The path expanded from one Device and a WITHIN-only result to multi-Device registration with truthful WITHIN and OUTSIDE results.
3. API authentication, on-contract Device authority, and Midnight transaction signing were separated.
4. Direct submission became a proof-request workflow that prevents duplicate execution and limits concurrency.
5. A static review page became separate bilingual workflows for administrator operation and third-party review.
6. The Edge Device package gained content validation, version management, rollback after a failed update, and credential protection.

## Result verified on 2026-08-29

![Wave 1 evidence summary](../assets/review/engineering-evidence-en.png)

- Repository portability validation passed.
- All 6 `sensor-registry` proof circuits compiled.
- All 182 automated tests passed across 8 workspaces.
- All workspace type checks and Frontend / TypeScript builds passed.
- The Cloudflare pre-deployment check passed.

Midnight preproduction-network records from 2026-08-28 include both WITHIN and OUTSIDE. The OUTSIDE example produced from 1,440 readings was reduced on the Edge Device to 24 hourly slots and confirmed as one proof and one Device-signed transaction.

## Current limitations

- The current source was not redeployed to the Midnight preproduction network during this documentation run.
- The Backend and Proof Server are trusted while handling private proof input.
- The third-party view displays public information and Midnight transaction identifiers, but it does not independently verify the proof in the browser or query Midnight directly.
- Daily submission requires an explicit operator action; the Device wallet is not a continuously running submission service.
- This proof alone does not guarantee physical sensor accuracy, continuous sampling, that no readings were withheld, or correct Edge Device aggregation.
- Final GUI captures and English / Japanese videos will be produced after the GUI implementation stabilizes.

## Next waves

![Three-stage delivery plan](../assets/review/three-wave-roadmap-en.png)

- Wave 2 plans independent browser verification, signed data provenance, operational automation, failure recovery, and multi-Device monitoring.
- Wave 3 plans calibrated-device proof, firmware identity, secure-hardware integration, audit exports, and cross-organization verification.
- The adoption path is a construction-site field trial followed by integration into existing sales and rental channels.

Wave 2 and Wave 3 are plans, not current features.
Implementation-level priorities, including contract-first dependencies, are tracked in the
[future feature backlog](../implementation/future_features.md).
