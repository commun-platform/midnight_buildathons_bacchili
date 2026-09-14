# Wave 1 Evidence Matrix

For the current artifact inventory, September 11 validation, and remaining work, see the [final delivery summary](final_delivery.md). References to `af90ad8` and 496 tests describe the baseline recorded through September 5.

[日本語版](../ja/submission/evidence_matrix.md)

Validation date: 2026-09-05 JST
Implementation baseline: `af90ad8`
Preprod evidence date: 2026-09-03 JST

Local source validation and recorded Preprod transactions are intentionally separate. The runtime
evidence includes both a Device-originated operational-day attestation and a walletless Managed API
Attestation; neither is inferred from a Worker/GUI deployment.

| ID | Review claim | Source / design evidence | Current local validation | Runtime / Preprod evidence | Boundary |
| --- | --- | --- | --- | --- | --- |
| CLAIM-01 | Raw readings and the private opening remain at the private source; bounded hourly summaries are restricted operator data, not third-party evidence | browser-private simulated capture, summary APIs, supporting field aggregation, privacy specification | Frontend, Gateway, Shared, and field-runtime boundary tests passed | 1,440 synthetic readings reduced and uploaded as bounded summaries in the recorded run | The trusted Backend stores authorized summaries; Wave 1 does not claim autonomous field operation or prove that no alternate collection path exists |
| CLAIM-02 | The operational policy and Device assignment are registered before proof | sensor-registry policy and assignment circuits; Fleet Registry specification | Contract compile and 18 simulator tests passed | Operational-day policy and Device-bound assignment recorded on Preprod | Public policy, assignment, and day boundary are fixed before proving |
| CLAIM-03 | The 24 hourly extrema and nonce are private witness data | sensor-registry source; public-field map | Compile succeeded; redaction tests passed | Public verifier record omits extrema and nonce | Trusted Backend sees the private proof request in transit |
| CLAIM-04 | Truthful WITHIN and OUTSIDE results use the same daily circuit | submitDailyAttestation circuit and tests | 28,699 rows, k=15; success and rejection tests passed | Current Contract records include Managed API OUTSIDE and authenticated Device WITHIN | Does not prove sensor truth or completeness |
| CLAIM-05 | Missing hours are represented as NO DATA | Wave 1 specification and daily input utilities | Canonical no-data slot test passed | Public result exposes a NO DATA status for the corresponding operational-hour slot | Missing data is not fraud detection |
| CLAIM-06 | User transaction authority, field API identity, and service fee authority are separate | browser authorization and supporting field-agent boundaries | Frontend, identity-agent, and transaction-agent tests passed | Authorized Preprod transaction recorded | Hardware-protected attestation is future work |
| CLAIM-07 | The proof service cannot authorize as the user | proof flow and transaction-authorization source | Boundary and execution-lock tests passed | Recorded flow authorizes the call after proof generation | Backend remains trusted for proof input |
| CLAIM-08 | Browser APIs expose only public or authorized redacted state | Gateway API tests and frontend responsibility design | 246 Gateway and 78 Dashboard tests passed | Public verifier accepts a TX hash and shows the operational date/boundary, 24 hourly results, policy/validity, Device Commitment, block, and TX | Browser directly compares public Indexer transaction and Contract action state but does not rerun the ZK verifier locally |
| CLAIM-09 | The PoC handles 1,440 readings/day with one fixed 24-slot proof | aggregation utilities and cost benchmark | 24 / 96 / 1,440 fixed-shape tests passed | Current authenticated Device 1,440-reading WITHIN TX confirmed in block 2,385,898 | One source/day is not a fleet load test |
| CLAIM-10 | The required operational Compact contract compiles and is deployed | midnight/contracts/sensor-registry and deployment record | All 8 circuits compiled | Current eight-circuit Contract deployed on 2026-09-03; Managed API and Device attestations confirmed against it | Future incompatible source changes require a new deployment and evidence |
| CLAIM-11 | Repository verification passes | root verify script and workspace scripts | 496 tests, typecheck, build, API SCT, 22-checkpoint GUI SCT, Wrangler dry-run, and portability passed | Current Proof Gateway/GUI and separate MCP Workers were deployed; the public MCP live-check resolved both current TX hashes on 2026-09-05 | Local validation and deployed runtime checks remain distinct evidence |
| CLAIM-12 | The GUI connects the simulated measurement workflow to public verification | dashboard source, routes, and tests | Dashboard build and 78 tests passed | TX-hash-only hosted verification completed without a D1 API request | Combined review UI is not production role separation; English demo pitch produced, public URL pending |
| CLAIM-13 | A registered cloud API can complete a walletless Managed Attestation | Managed Source adapter, Queue consumer, encrypted private R2 artifact, separated Compact authority, consolidated Server Wallet, and independent `/managed-proof/` GUI | Mock counterpart, failure classification, idempotency, and Managed GUI tests passed | Current Contract TX in block 2,385,826 represents 1,440 records and 24 observed hours; public MCP verification found two truthful OUTSIDE slots without D1 | The Backend and registered source remain trusted; the source's truthfulness is not guaranteed |
| CLAIM-14 | Support automation and public verification have separate least-privilege Workers | MCP security boundary, independent Wrangler configurations, binding inventories, Access and redaction design | 3 shared verifier, 11 Support MCP, and 5 Verification MCP tests plus both Wrangler dry-runs passed | Unauthenticated private-host requests are blocked; the public MCP exposes one TX-hash tool and resolved both current records | Support results are the latest redacted D1 observations, not live Container control; public MCP has no operational binding |

## Current validation command

    TMPDIR=/tmp npm run verify

The explicit TMPDIR is required in this WSL environment so tsx creates its IPC socket below /tmp rather than a Windows Temp mount. The first run compiled Compact successfully and then stopped with ENOTSUP during IPC creation; the rerun above completed successfully.

## Test distribution

| Workspace | Passed |
| --- | ---: |
| Shared | 20 |
| sensor-registry Contract | 18 |
| Public Attestation Verifier | 3 |
| Dashboard | 78 |
| Development CLI | 5 |
| Device Auth | 6 |
| Edge Agent | 16 |
| Device Wallet Agent | 32 |
| Proof Gateway | 246 |
| Sponsor Wallet | 52 |
| Support MCP | 11 |
| Verification MCP | 5 |
| Mock Measurement Source | 4 |
| Total | 496 |

## Historical Preprod reference

- Contract: 0abb6d408a5b8fedbdab9e0fff59f1a5570d3c94af0059bf44b36b3669ee9ddd
- Transaction hash: 92569ab4d9c49661dcca78253b785c2a154672285231244cae14c4a0caf604a3
- Block height: 2,369,094
- Result: WITHIN, verified=true, thresholdSatisfied=true
- Public policy: 10–35 °C
- Raw readings, hourly extrema, and nonce: not disclosed

Managed API acceptance reference:

- Proof Job: `proof-b7cce717a5a6d8d3ed30fbcb610dfcce520ded59d74a640cca4648ddbdc3890c`
- Transaction hash: [`7464966f8ecbcd9088564e8ec1d8e130fa240795fc4d68496109a49d375b49a7`](https://preprod.midnightexplorer.com/transactions/7464966f8ecbcd9088564e8ec1d8e130fa240795fc4d68496109a49d375b49a7)
- Block height: 2,375,455
- Input/result: 1,440 API records, 24 observed hours, 24 WITHIN results
- Public verification: four checks passed; no D1 API request was used in the TX-hash path

Autonomous post-fix regression reference:

- Proof Job: `proof-de93c256b03322e49702ba144d0628814c5b1bf59284ae2131e1256dad0b332b`
- Transaction hash: [`42e77f4e65ee03fe634feffdbba634e9099b220f55ed0b1de0a66391f718b12d`](https://preprod.midnightexplorer.com/transactions/42e77f4e65ee03fe634feffdbba634e9099b220f55ed0b1de0a66391f718b12d)
- Block height: 2,380,338
- Input/result: 1,440 API records, 24 observed hours, 24 WITHIN results
- Execution: scheduled automatically; fetch attempt 1, proof attempt 1, no manual retry

## Current eight-circuit references

- Contract: `48636e2f7ae8b1705134b026ec0d5a910357cac990a60adce2c2672e1a78a732`
- Deployment TX: [`00ea92883cba9ff8b753a3308d6d2127ac3f81c2643f09840a449588197a32cbdf`](https://preprod.midnightexplorer.com/transactions/00ea92883cba9ff8b753a3308d6d2127ac3f81c2643f09840a449588197a32cbdf)
- Managed API OUTSIDE: [`35b8a83050d910ae94862be565c718b09764e51fd69979eaff1ed3dee93bb532`](https://preprod.midnightexplorer.com/transactions/35b8a83050d910ae94862be565c718b09764e51fd69979eaff1ed3dee93bb532), block 2,385,826, 1,440 records, 24 observed hours, 2 outside slots
- Authenticated Device WITHIN: [`7e93c537e85dbc16892716429b0f426e731999775b0cef460bd4b0d358c42b40`](https://preprod.midnightexplorer.com/transactions/7e93c537e85dbc16892716429b0f426e731999775b0cef460bd4b0d358c42b40), block 2,385,898, 1,440 readings, 24 observed hours
- Public verification recheck: 2026-09-05 JST, all five ledger checks passed for both hashes; no D1 or private input used

The final release audit must record the documentation commit that follows implementation baseline
`af90ad8` and rerun the same validation command if executable source changes.
