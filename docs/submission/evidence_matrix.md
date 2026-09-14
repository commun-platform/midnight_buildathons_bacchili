# Wave 1 claim and evidence matrix

[日本語版](../ja/submission/evidence_matrix.md)

Review commit: `b72efb7d4df8384a9e8dd873b8e3a65f6e9e5fbd`
Source validation date: 2026-09-14 JST
Preprod deployment date: 2026-09-03 JST

Each row maps a product claim to tracked source, tracked tests, or a dated public transaction record.
Local generated output and private runtime state are not submission evidence.

| ID | Review claim | Tracked source / design | Reproducible validation | Public record | Boundary |
| --- | --- | --- | --- | --- | --- |
| CLAIM-01 | Raw readings and the private opening remain at the private source; bounded hourly summaries are restricted operator data | Browser source, summary API, field aggregation, [privacy specification](../security/private_spec.md) | Frontend, Gateway, Shared, and field-runtime boundary tests | Dated intake records in the [release addendum](current_release_addendum.md) | Trusted Backend stores authorized summaries; no claim of physical truth or alternate-source exclusion |
| CLAIM-02 | Policy and Device assignment are registered before proof | Contract policy and assignment circuits; [Fleet Registry](../security/device_registry.md) | Contract compilation and simulator tests | Current Contract deployment and records | Public policy, assignment, and day boundary are fixed before proving |
| CLAIM-03 | Hourly extrema and nonce are private witness data | [Contract source](../../midnight/contracts/sensor-registry/src/sensor-registry.compact); public-field map | Compile and redaction tests | Public verifier omits extrema and nonce | Trusted Backend sees private proof input in transit |
| CLAIM-04 | WITHIN and OUTSIDE use the same daily circuit | `submitDailyAttestation` circuit and tests | 8 circuits compile; success and rejection tests pass | Current Contract records include managed OUTSIDE and Device WITHIN | Does not prove sensor truth or completeness |
| CLAIM-05 | Missing hours are represented as NO DATA | [Wave 1 specification](../architecture/wave1_spec.md) and daily input utilities | Canonical no-data slot tests | Public result exposes NO DATA for the corresponding slot | Missing data is not fraud detection |
| CLAIM-06 | User authority, field API identity, and service fee authority are separate | Client authorization, identity, transaction-agent, and sponsorship boundaries | Frontend, identity, transaction-agent, and Gateway tests | Authorized Preprod transactions | Hardware-protected attestation remains future work |
| CLAIM-07 | The proof service cannot authorize as the user | Proof flow and transaction-authorization source | Boundary and execution-lock tests | Recorded flow authorizes after proof generation | Backend remains trusted for private proof input |
| CLAIM-08 | Browser APIs expose only public or authorized redacted state | Gateway API tests and frontend responsibility design | Gateway and Dashboard suites | Public verifier accepts a TX hash and returns public date, results, policy, commitment, block, and TX | Public verifier does not rerun the ZK verifier locally |
| CLAIM-09 | The PoC handles 1,440 readings/day with one fixed 24-slot proof | Aggregation utilities and [cost benchmark](../implementation/cost_benchmark.md) | Fixed-shape 24 / 96 / 1,440 tests | Authenticated Device 1,440-reading WITHIN record | One source/day is not a fleet load test |
| CLAIM-10 | The required operational Compact contract compiles and is deployed | `midnight/contracts/sensor-registry` and deployment record | All 8 circuits compile | [Current deployment transaction](https://preprod.midnightexplorer.com/transactions/00ea92883cba9ff8b753a3308d6d2127ac3f81c2643f09840a449588197a32cbdf) | Incompatible source changes require a new deployment and evidence |
| CLAIM-11 | Repository verification is reproducible | Root scripts and workspace scripts | `npm ci && npm run verify:source`; portability, tests, and type checks pass | Deployment records remain separate | Full Container image validation requires Docker and is not asserted by the source gate |
| CLAIM-12 | The review interface connects measurement, proof status, and public verification | Dashboard source, routes, and tests | Dashboard build and test suite pass | TX-hash verification reads public Indexer state without D1 | Combined review UI is not production role separation |
| CLAIM-13 | A registered managed source can complete an attestation through the Server Wallet | Managed Source adapter, Queue consumer, private artifact boundary, Compact authority, and Server Wallet | Mock source, failure classification, idempotency, and managed-flow tests | [Managed OUTSIDE transaction](https://preprod.midnightexplorer.com/transactions/35b8a83050d910ae94862be565c718b09764e51fd69979eaff1ed3dee93bb532), block 2,385,826 | Backend and registered source remain trusted; upstream truthfulness is not guaranteed |
| CLAIM-14 | Support automation and public verification have separate least-privilege Workers | MCP security boundary, Wrangler configurations, binding inventories, Access and redaction design | 3 shared verifier, 11 Support MCP, and 5 Verification MCP tests | Public MCP resolves both current records; private host is Access-protected | Support output is redacted operational state; public MCP has no operational binding |

## Source validation command

```bash
npm ci
npm run verify:source
```

`verify:source` runs portability checks, operational Compact compilation, all source tests, and workspace
type checks. It uses no Device secrets, wallet recovery material, deployment credentials, or live network.

## Test distribution at the review commit

| Workspace | Passed |
| --- | ---: |
| Shared | 20 |
| sensor-registry Contract | 18 |
| Public Attestation Verifier | 3 |
| Dashboard | 94 |
| Development CLI | 5 |
| Device Auth | 6 |
| Edge Agent | 20 |
| Device Wallet Agent | 43 |
| Proof Gateway | 247 |
| Sponsor Wallet | 52 |
| Support MCP | 11 |
| Verification MCP | 5 |
| **Operational workspace total** | **524** |
| Managed-source mock | 4 |
| **`npm test` total** | **528** |

The test count is a source-suite count at the review commit. Public transaction records are dated
network evidence and are not inferred from local tests.
