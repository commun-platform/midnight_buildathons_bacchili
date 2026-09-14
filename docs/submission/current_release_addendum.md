# Current Release Evidence Addendum

[日本語版](../ja/submission/current_release_addendum.md)

Status: documentation reconciled on 2026-09-11; live evidence retains the dates below.
Historical implementation baseline: `af90ad8`. Current working tree: `fb28ade` plus uncommitted changes.

The [final delivery summary](final_delivery.md) records 525 current source tests, the GUI correction, and the environment limitation affecting Container validation.

The final 2:18 English video and nine-slide pitch remain the concise Wave 1 product story. This
addendum records engineering and operational evidence completed after that capture so reviewers can
distinguish the filmed flow from the current repository and deployed Preprod system.

## Current Midnight evidence

The current eight-circuit `sensor-registry` contract is deployed on Midnight Preprod:

- Contract: `48636e2f7ae8b1705134b026ec0d5a910357cac990a60adce2c2672e1a78a732`
- Deployment transaction: [`00ea92883cba9ff8b753a3308d6d2127ac3f81c2643f09840a449588197a32cbdf`](https://preprod.midnightexplorer.com/transactions/00ea92883cba9ff8b753a3308d6d2127ac3f81c2643f09840a449588197a32cbdf)
- Deployed: 2026-09-03 JST

Two independent intake paths reached that contract through the consolidated Server Wallet:

| Intake path | Input | Public result | Confirmed evidence |
| --- | --- | --- | --- |
| Registered cloud API | 1,440 records, 24 observed hours | OUTSIDE; two hourly slots outside the registered 10–35 °C policy | [TX `35b8…32`](https://preprod.midnightexplorer.com/transactions/35b8a83050d910ae94862be565c718b09764e51fd69979eaff1ed3dee93bb532), block 2,385,826 |
| Authenticated field Device | 1,440 one-minute readings reduced to 24 private hourly extrema | WITHIN; all 24 hourly slots inside the registered policy | [TX `7e93…40`](https://preprod.midnightexplorer.com/transactions/7e93c537e85dbc16892716429b0f426e731999775b0cef460bd4b0d358c42b40), block 2,385,898 |

On 2026-09-05 JST, the public Verification MCP independently resolved both transaction hashes from
the Midnight Preprod Indexer. It matched the current Contract, Policy, Device-bound Assignment,
operational-day boundary, sample and observed-hour counts, all 24 hourly results, and successful
transaction state. Raw samples, hourly extrema, and proof nonces were not returned.

## Current operational additions

- **Walletless Managed API Attestation:** a registered HTTPS source is fetched for one fixed
  operational day, validated and reduced to 24 private slots, proved, funded, submitted, and exposed
  through the same public verification model. This proves the relationship to data received by the
  trusted service; it does not prove the upstream source's truthfulness.
- **Consolidated Server Wallet:** one private stateful Wallet runtime performs administration,
  managed-attestor, and DUST-sponsorship roles with separate authorization secrets and serialized
  mutations. The Proof Server remains a separate keyless Container.
- **Operations evidence:** an Access-protected console exposes Wallet synchronization, DUST,
  workflow backlog, daily processing metrics, and redacted customer-operation traces. Japanese
  Discord incidents use a notification grace period and sponsored submissions produce idempotent
  receipts.
- **Separated MCP boundary:** the private Support MCP runs in an Access-protected Worker with only a
  redacted D1 binding and six read-only tools. The public Verification MCP runs in a different Worker
  with no D1, R2, Queue, Container, Secret, or Service Binding and exposes only
  `verify_attestation_transaction`.

## September 7–9 field-operation evidence

Automatic daily submission is implemented and was installed on the field Device. A separate five-minute timer processes completed days, retries the same persisted private preparation, and skips days with confirmed receipts. The [dated execution record](../implementation/continuous_device_daily_attestation_execplan.md) contains this public evidence:

| Operational day (JST) | Real measurements | Observed slots | Block | Confirmed transaction |
| --- | ---: | ---: | ---: | --- |
| 2026-09-05 | 1,439 | 24 | 2,446,724 | `832152cf417a9d6228720822144c006e7a2db2a17f7b3fbf9152a3a1c2bbfc93` |
| 2026-09-06 | 1,439 | 24 | 2,446,764 | `26b7872adbecd1cf811fbb61b48f3177295c80bfddd3d8a5e51d95bd3ac97bb5` |

The recorded checks found WITHIN / verified=true, matched receipt identity, day boundary and counts to the ledger, and observed a repeat with no duplicate submission. The actual 1,439 measurements were not filled to 1,440. The September 9 [stop-protection record](../implementation/collector_stop_protection_execplan.md) confirms that direct stops were rejected while the same collector process continued measuring. The Sponsor's 02:00 JST schedule is processing start, not a confirmation deadline.

These are earlier observations. No live recheck or redeployment was performed on September 11, and these records do not establish partner-period reliability or uninterrupted operation.

## Source validation recorded through September 5

- Compact toolchain `0.31.1` compiled all 8 operational circuits.
- 496 automated tests passed across 12 workspaces and the deterministic mock source.
- All configured type checks and builds passed.
- API SCT, the 22-checkpoint GUI SCT, Wrangler dry-runs, and repository portability checks passed.
- MCP-specific validation passed: 3 shared public-verifier, 11 private Support MCP, and 5 public
  Verification MCP tests.

These checks validate the source at the implementation baseline. The two transaction records above
are separate live-network evidence. Neither local tests nor a Worker deployment is presented as a
substitute for a confirmed Midnight transaction.

## Submission interpretation

The browser-based simulated source remains the shortest judge walkthrough and the video therefore
remains valid. Managed API intake, field Device intake, system operations, and MCP access are
additional composable paths around the same on-chain proof claim. Production completion still
requires partner-period reliability evidence, organization/role isolation, long-term validation of the automated field
operation, and the Wave 2 controls listed in the roadmap.
