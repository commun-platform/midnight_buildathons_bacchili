# Current release evidence addendum

[日本語版](../ja/submission/current_release_addendum.md)

Status: reconciled on 2026-09-14 JST
Review target: the checked-out `main` commit (`git rev-parse HEAD`)

This addendum records dated Midnight and field-operation evidence that can be checked independently
from the source gate. It does not mix a local run or generated workspace output into the repository
evidence set.

## Current Midnight evidence

The current eight-circuit `sensor-registry` Contract is deployed on Midnight Preprod:

- Contract: `48636e2f7ae8b1705134b026ec0d5a910357cac990a60adce2c2672e1a78a732`
- Deployment transaction: [`00ea92883cba9ff8b753a3308d6d2127ac3f81c2643f09840a449588197a32cbdf`](https://preprod.midnightexplorer.com/transactions/00ea92883cba9ff8b753a3308d6d2127ac3f81c2643f09840a449588197a32cbdf)
- Deployed: 2026-09-03 JST

Two authorized intake paths reached that Contract through the consolidated Server Wallet:

| Intake path | Input | Public result | Confirmed evidence |
| --- | --- | --- | --- |
| Registered cloud API | 1,440 records, 24 observed hours | OUTSIDE; two hourly slots outside the registered 10–35 °C policy | [TX `35b8…32`](https://preprod.midnightexplorer.com/transactions/35b8a83050d910ae94862be565c718b09764e51fd69979eaff1ed3dee93bb532), block 2,385,826 |
| Authenticated field Device | 1,440 one-minute readings reduced to 24 private hourly extrema | WITHIN; all 24 hourly slots inside the registered policy | [TX `7e93…40`](https://preprod.midnightexplorer.com/transactions/7e93c537e85dbc16892716429b0f426e731999775b0cef460bd4b0d358c42b40), block 2,385,898 |

On 2026-09-05 JST, the public Verification MCP resolved both hashes from the Midnight Preprod Indexer.
It matched the Contract, Policy, Device-bound Assignment, operational-day boundary, sample and
observed-hour counts, all 24 hourly results, and successful transaction state. Raw samples, hourly
extrema, and proof nonces were not returned.

## Implemented operational paths

- **Registered Managed API attestation:** an authorized HTTPS source is fetched for one fixed
  operational day, validated and reduced to 24 private slots, proved, funded by the Server Wallet,
  submitted, and exposed through the same public verification model. This proves the relationship to
  data received by the trusted service; it does not prove the upstream source's truthfulness.
- **Consolidated Server Wallet:** one private stateful Wallet runtime performs administration, managed
  attestor, and DUST-sponsorship roles with separate authorization secrets and serialized mutations.
  The Proof Server remains a separate keyless Container.
- **Operations evidence:** an Access-protected console exposes Wallet synchronization, DUST, workflow
  backlog, daily processing metrics, and redacted customer-operation traces. Japanese Discord incidents
  use a notification grace period and sponsored submissions produce idempotent receipts.
- **Separated MCP boundary:** the private Support MCP runs in an Access-protected Worker with only a
  redacted D1 binding and six read-only tools. The public Verification MCP runs in a different Worker
  with no D1, R2, Queue, Container, Secret, or Service Binding and exposes only
  `verify_attestation_transaction`.

## September 7–9 field-operation records

Automatic daily submission is implemented on the field Device. A separate five-minute timer processes
completed days, retries the same persisted private preparation, and skips days with confirmed receipts.

| Operational day (JST) | Real measurements | Observed slots | Block | Confirmed transaction |
| --- | ---: | ---: | ---: | --- |
| 2026-09-05 | 1,439 | 24 | 2,446,724 | `832152cf417a9d6228720822144c006e7a2db2a17f7b3fbf9152a3a1c2bbfc93` |
| 2026-09-06 | 1,439 | 24 | 2,446,764 | `26b7872adbecd1cf811fbb61b48f3177295c80bfddd3d8a5e51d95bd3ac97bb5` |

The records matched receipt identity, day boundary, counts, and the ledger result, and a repeat did not
create a duplicate submission. The actual count was 1,439 rather than 1,440. The current firmware
configuration rejects direct collector stops while collection is active; this behavior is covered by the
collector and installer tests. The Sponsor's 02:00 JST schedule is processing start, not a confirmation
deadline.

These are dated observations. They do not establish partner-period reliability or uninterrupted
operation, and no new live recheck or redeployment is asserted for this review target.

## Source validation

- Compact toolchain `0.31.1` compiled all 8 operational circuits.
- 524 operational workspace tests and 4 managed-source mock tests passed at the review target (528 total).
- All configured type checks and portability checks passed.
- MCP validation passed: 3 shared public-verifier, 11 private Support MCP, and 5 public Verification MCP tests.

Run the clean-checkout source gate with:

```bash
npm ci
npm run verify:source
```

The source gate and the two transaction records are separate kinds of evidence. Neither local tests nor
a Worker deployment substitutes for a confirmed Midnight transaction.

## Claim boundary

The proof checks the registered threshold against the supplied fixed 24-slot summaries. It does not
prove physical sensor accuracy, uninterrupted sampling, absence of withheld readings, or correct
measurement-source aggregation. The Backend and Proof Server are trusted while handling private proof
input, and the public verifier reads public Contract state without rerunning the ZK verifier locally.
