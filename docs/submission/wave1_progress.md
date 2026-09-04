# Wave 1 Progress Record

[日本語版](../ja/submission/wave1_progress.md)

Period covered: 2026-08-27 to 2026-09-05 JST
Status: final English demo pitch produced; public submission URL pending

## How to read this record

The repository history begins on the Wave 1 opening date, so this document does not claim a feature-by-feature difference from an earlier public release. It reports only commits made during Wave 1 and validation performed against implementation baseline `af90ad8` through 2026-09-05.

Earlier transactions dated 2026-08-28 remain historical evidence for prior schemas. The current
source validation, 2026-09-03 eight-circuit deployment, and current-contract E2E transactions are
recorded separately so a source check is never presented as a network deployment.

## Built during Wave 1

| Area | Built | Verified |
| --- | --- | --- |
| Zero-knowledge proof | Check against a public threshold, determine WITHIN / OUTSIDE, and use a fixed format with 24 hourly slots | All 8 proof circuits compile; 18 contract tests pass |
| Supporting field integration | Measurement collection, hourly aggregation, API authentication, transaction authorization, update, and rollback code for later field operation | 16 collection, 6 authentication, and 32 transaction-agent tests pass; autonomous production operation is not claimed |
| Backend | Device and managed-cloud authentication, proof-request admission, workflow storage, proof generation, consolidated Server Wallet processing, and redacted/public APIs | 246 Gateway and 52 Server Wallet tests plus the Cloudflare pre-deployment check pass |
| Frontend | Combined review workflow with operator steps, a third-party public view, and English / Japanese display | 78 Frontend tests and the production build pass |
| Midnight integration | Public threshold, target proof subject, user-authorized and managed-attestor daily transactions | Simulator tests and current eight-circuit Preprod Managed API/Device transactions were confirmed |
| Operations and support | Access-protected health/metrics/audit console, Japanese Discord incidents and receipts, private Support MCP, and public Verification MCP | 3 shared-verifier, 11 Support MCP, and 5 Verification MCP tests pass; both current TX hashes were resolved by the public MCP |
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
7. A registered cloud API can now complete a walletless daily Attestation through the same fixed
   proof model and consolidated Server Wallet.
8. Operational evidence is now available through a protected console and private Support MCP, while
   public TX-hash verification runs in a separate storage-free Worker.

## Result verified through 2026-09-05

- Repository portability validation passed.
- All 8 `sensor-registry` proof circuits compiled.
- All 496 automated tests passed across 12 workspaces and the mock counterpart service.
- All workspace type checks and Frontend / TypeScript builds passed.
- The Cloudflare pre-deployment check passed.

The current eight-circuit Contract was deployed on 2026-09-03. A 1,440-record Managed API day
confirmed OUTSIDE in block 2,385,826, and a separate authenticated 1,440-reading Device day confirmed
WITHIN in block 2,385,898. The public Verification MCP rechecked both hashes from the Midnight
Indexer on 2026-09-05 without D1 or private inputs.

## Current limitations

- The Backend and Proof Server are trusted while handling private proof input.
- The third-party view directly queries the public Midnight Indexer and compares transaction and Contract state; it does not rerun the ZK verifier locally.
- The primary review flow uses a browser-based simulated measurement source; a field measurement system does not yet run the complete daily lifecycle autonomously.
- Operator and third-party views are combined for judging rather than separated by production roles and applications.
- Daily submission requires explicit user action.
- This proof alone does not guarantee physical sensor accuracy, continuous sampling, that no readings were withheld, or correct measurement-source aggregation.
- The English demo video is complete; publishing its submission URL and producing an optional Japanese adaptation remain external tasks.

## Next waves

- Wave 2 connects real field measurement systems, automates the complete daily lifecycle, completes organization/role separation, validates and hardens the implemented operations/support foundations, adds audited recovery controls, and targets a paid partner pilot.
- Wave 3 adds hardware-protected identity and provenance, commercial multi-organization operation, and PMF validation through recurring revenue, renewal, expansion, and sustainable unit economics.

Wave 2 and Wave 3 outcomes are plans; the operational foundations listed above were implemented early.
The canonical product and business plan is the [three-wave roadmap](../architecture/three_wave_roadmap.md).
Implementation-level priorities, including contract-first dependencies, are tracked in the
[future feature backlog](../implementation/future_features.md).
