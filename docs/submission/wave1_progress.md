# Wave 1 progress record

[日本語版](../ja/submission/wave1_progress.md)

Period covered: 2026-08-27 to 2026-09-14 JST
Review commit: `b72efb7d4df8384a9e8dd873b8e3a65f6e9e5fbd`

## How to read this record

The repository history begins on the Wave 1 opening date, so this document reports the implementation
and validation that are present in the review commit. It does not infer a feature-by-feature difference
from an earlier public release. Dated network records are listed separately from source checks.

## Built during Wave 1

| Area | Built | Verified |
| --- | --- | --- |
| Zero-knowledge proof | Public-threshold check, WITHIN / OUTSIDE result, fixed 24-hour input, and NO DATA handling | All 8 proof circuits compile; 18 contract tests pass |
| Field integration | Measurement collection, hourly aggregation, API authentication, transaction authorization, update, and rollback | Collector, authentication, and transaction-agent test suites pass; autonomous long-running production operation is not claimed |
| Backend | Device and managed-cloud authentication, proof-request admission, workflow storage, proof generation, consolidated Server Wallet processing, and redacted/public APIs | 247 Gateway and 52 Server Wallet tests plus pre-deployment checks pass |
| Frontend | Operator workflow, public third-party view, and English / Japanese display | Frontend tests and production build pass |
| Midnight integration | Public threshold, proof subject, user-authorized transaction, managed attestation, and service fee sponsorship | Simulator tests and current eight-circuit Preprod records confirmed |
| Operations and support | Access-protected health/metrics/audit console, notifications, private Support MCP, and public Verification MCP | Shared verifier, Support MCP, and Verification MCP suites pass |
| Safety | Tamper rejection, duplicate prevention, execution locking, configuration-downgrade rejection, and corrupt-state quarantine | Failure cases are covered by the automated suites |

See the [claim-to-evidence map](evidence_matrix.md) for source locations, tests, and validation limits.

## Important improvements made in Wave 1

1. One operational day uses a fixed 24-hour format so proof cost does not grow with individual readings.
2. Registration is project-scoped and supports truthful WITHIN and OUTSIDE results.
3. API authentication, on-contract authority, and Midnight transaction authorization are separated.
4. Submission uses a proof-request workflow that prevents duplicate execution and limits concurrency.
5. The review interface combines operator steps and third-party evidence with explicit state transitions.
6. Field runtime code validates content, manages versions, rolls back failed updates, and protects credentials.
7. A registered managed source completes a daily attestation through the same fixed proof model and Server Wallet.
8. Operations evidence is split between a protected console, private Support MCP, and public transaction verification.

## Result verified at the review commit

- Repository portability validation passed.
- All 8 `sensor-registry` proof circuits compiled.
- 524 operational workspace tests and 4 managed-source mock tests passed (528 total).
- All workspace type checks passed.
- Dated Preprod Contract and transaction records are listed in the [release addendum](current_release_addendum.md).

## Current limitations

- The Backend and Proof Server are trusted while handling private proof input.
- The public verifier reads public Contract and transaction state; it does not rerun the ZK verifier locally.
- The proof does not guarantee physical sensor accuracy, continuous sampling, absence of withheld readings, or correct source-side aggregation.
- Operator and third-party views are combined for review; production role and application separation remains open.
- Field-device automation is implemented, while partner-period reliability and long-running production operation remain unproven.

## Next waves

- **Wave 2:** connect real field measurement systems, automate the complete daily lifecycle, complete organization/role separation, validate the operations and support foundations under partner load, and target a paid partner pilot.
- **Wave 3:** add hardware-protected identity and provenance, operate across organizations and sites, and validate recurring revenue, renewal, expansion, and sustainable unit economics.

Wave 2 and Wave 3 outcomes are plans. The canonical product and business plan is the [three-wave roadmap](../architecture/three_wave_roadmap.md).
