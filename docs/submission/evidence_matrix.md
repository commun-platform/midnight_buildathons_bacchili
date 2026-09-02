# Wave 1 Evidence Matrix

[日本語版](../ja/submission/evidence_matrix.md)

Validation date: 2026-09-02 JST
Local baseline: current working tree
Preprod evidence date: 2026-09-02 JST

Local source validation and recorded Preprod transactions are intentionally separate. The latest
runtime evidence is a new Device-originated operational-day attestation, not an inference from the
Worker/GUI deployment.

| ID | Review claim | Source / design evidence | Current local validation | Runtime / Preprod evidence | Boundary |
| --- | --- | --- | --- | --- | --- |
| CLAIM-01 | Raw readings and the private opening remain at the private source; bounded hourly summaries are restricted operator data, not third-party evidence | browser-private simulated capture, summary APIs, supporting field aggregation, privacy specification | Frontend, Gateway, Shared, and field-runtime boundary tests passed | 1,440 synthetic readings reduced and uploaded as bounded summaries in the recorded run | The trusted Backend stores authorized summaries; Wave 1 does not claim autonomous field operation or prove that no alternate collection path exists |
| CLAIM-02 | The operational policy and Device assignment are registered before proof | sensor-registry policy and assignment circuits; Fleet Registry specification | Contract compile and 15 simulator tests passed | Operational-day policy and Device-bound assignment recorded on Preprod | Public policy, assignment, and day boundary are fixed before proving |
| CLAIM-03 | The 24 hourly extrema and nonce are private witness data | sensor-registry source; public-field map | Compile succeeded; redaction tests passed | Public verifier record omits extrema and nonce | Trusted Backend sees the private proof request in transit |
| CLAIM-04 | Truthful WITHIN and OUTSIDE results use the same daily circuit | submitDailyAttestation circuit and tests | 28,699 rows, k=15; success and rejection tests passed | Previous OUTSIDE and current operational-day WITHIN results confirmed | Does not prove sensor truth or completeness |
| CLAIM-05 | Missing hours are represented as NO DATA | Wave 1 specification and daily input utilities | Canonical no-data slot test passed | Public result exposes a NO DATA status for the corresponding UTC hour | Missing data is not fraud detection |
| CLAIM-06 | User transaction authority, field API identity, and service fee authority are separate | browser authorization and supporting field-agent boundaries | Frontend, identity-agent, and transaction-agent tests passed | Authorized Preprod transaction recorded | Hardware-protected attestation is future work |
| CLAIM-07 | The proof service cannot authorize as the user | proof flow and transaction-authorization source | Boundary and execution-lock tests passed | Recorded flow authorizes the call after proof generation | Backend remains trusted for proof input |
| CLAIM-08 | Browser APIs expose only public or authorized redacted state | Gateway API tests and frontend responsibility design | 151 Gateway and 69 Dashboard tests passed | Public verifier accepts a TX hash and shows the operational date/boundary, 24 hourly results, policy/validity, Device Commitment, block, and TX | Browser directly compares public Indexer transaction and Contract action state but does not rerun the ZK verifier locally |
| CLAIM-09 | The PoC handles 1,440 readings/day with one fixed 24-slot proof | aggregation utilities and cost benchmark | 24 / 96 / 1,440 fixed-shape tests passed | Device-originated 1,440-reading operational-day WITHIN TX confirmed in block 2,369,094 | One simulated source/day is not a fleet load test |
| CLAIM-10 | The required operational Compact contract compiles | midnight/contracts/sensor-registry | All 6 circuits compiled on 2026-09-02 | Operational-day contract and attestation confirmed on Preprod | The validated change set is frozen on the current `main` branch |
| CLAIM-11 | Repository verification passes | root verify script and workspace scripts | 355 tests, typecheck, build, Wrangler dry-run passed | Worker version `68a511ba-0703-479c-91df-8cdb5c19c4a5` deployed on 2026-09-02 JST | Initial restricted Docker dry-run could not update buildx state; the host-access dry-run passed |
| CLAIM-12 | The GUI connects the simulated measurement workflow to public verification | dashboard source, routes, and tests | Dashboard build and 69 tests passed | TX-hash-only hosted verification completed without a D1 API request | Combined review UI is not production role separation; English demo pitch produced, public URL pending |

## Current validation command

    TMPDIR=/tmp npm run verify

The explicit TMPDIR is required in this WSL environment so tsx creates its IPC socket below /tmp rather than a Windows Temp mount. The first run compiled Compact successfully and then stopped with ENOTSUP during IPC creation; the rerun above completed successfully.

## Test distribution

| Workspace | Passed |
| --- | ---: |
| Shared | 20 |
| sensor-registry Contract | 15 |
| Dashboard | 69 |
| Development CLI | 5 |
| Device Auth | 6 |
| Edge Agent | 15 |
| Device Wallet Agent | 32 |
| Proof Gateway | 151 |
| Sponsor Wallet | 42 |
| Total | 355 |

## Recorded Preprod reference

- Contract: 0abb6d408a5b8fedbdab9e0fff59f1a5570d3c94af0059bf44b36b3669ee9ddd
- Transaction hash: 92569ab4d9c49661dcca78253b785c2a154672285231244cae14c4a0caf604a3
- Block height: 2,369,094
- Result: WITHIN, verified=true, thresholdSatisfied=true
- Public policy: 10–35 °C
- Raw readings, hourly extrema, and nonce: not disclosed

The final release audit must replace the local baseline description with a frozen commit SHA and rerun the same command.
