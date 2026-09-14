# Current source delivery — 2026-09-14

[日本語版](../ja/submission/final_delivery.md)

This document reconciles the implementation and the review evidence in the checked-out `main`
commit (`git rev-parse HEAD`). It is a repository source handoff: every technical claim
below points to tracked code, tracked tests, or a public transaction record.

## What is implemented

| Area | Current behavior | Tracked evidence and boundary |
| --- | --- | --- |
| Daily Device submission | Reads completed operational days after a closing margin, retains the exact private preparation, rotates bounded retry batches, defers queued work, and skips confirmed receipts. | [Daily submission source](../../edge-device/midnight-transaction-agent/src/daily-submission.ts) and 43 transaction-agent tests. Missing measurements remain missing; 24 observed hours do not establish uninterrupted sampling. |
| Continuous collection | Collector and recovery timer reject direct manual stops. A maintenance target coordinates upgrades and rollback. Collection and transaction work remain separate processes. | [Firmware guide](../operations/device_firmware.md) and 20 collector/installer tests. Privileged administrators can still change systemd configuration. |
| Wallet and notifications | The consolidated Server Wallet separates administration, managed attestation, and fee sponsorship. The Sponsor role adds DUST only. Receipts include the configured verification-page URL. | [Operations guide](../architecture/wave2_system_operations.md) and 247 Gateway tests. A sent receipt does not establish network confirmation. |
| Policy reload | **Refresh Policies** updates policy results while unfinished inputs and focus survive. The control becomes available again after the request. | Dashboard source and regression coverage for repeated explicit reload. |
| Privacy and day boundary | Raw field streams and Device keys stay local. Authorized hourly summaries and private proof inputs reach the trusted Backend. Public viewers receive the registered operational date/boundary and results. | [Private-information specification](../security/private_spec.md), [contract source](../../midnight/contracts/sensor-registry/src/sensor-registry.compact), and [claim matrix](evidence_matrix.md). The proof does not establish sensor truth, completeness, or correct local aggregation. |

## Public deployment records

The release evidence addendum records the current eight-circuit Contract and the dated Preprod records
that were checked through the public Indexer. Those records demonstrate a deployed state at a point in
time; they do not imply that a fresh network transaction was performed for this source handoff.

- 2026-09-05 operational day: 1,439 real measurements; confirmed in block `2,446,724`.
- 2026-09-06 operational day: 1,439 real measurements; confirmed in block `2,446,764`.
- 2026-09-09 stop-protection check: direct-stop request rejected while collection remained active.

See the [release addendum](current_release_addendum.md) and [evidence matrix](evidence_matrix.md) for
transaction hashes, dates, source boundaries, and public verification links.

## Validation at the review target

| Check | Result |
| --- | --- |
| Operational Compact compilation | PASS: pinned toolchain `0.31.1`, 8 circuits |
| Source tests | PASS: 524 tests across the operational workspaces |
| Managed-source mock tests | PASS: 4 tests |
| Workspace type checks | PASS |
| Portability and whitespace checks | PASS |
| Source gate | `npm run verify:source` runs the checks above from a clean checkout |
| Full deployment gate | Not asserted here; Container image validation requires a Docker-capable host |

The source test count is recorded for this review target. Run the gate from the repository
root:

```bash
npm ci
compact update 0.31.1
npm run verify:source
```

## Known limits

- The Backend and Proof Server are trusted while handling private proof input.
- The public verifier reads public Contract and transaction state; it does not rerun the ZK verifier locally.
- The proof checks the registered threshold against the supplied 24-slot summaries. It does not prove physical sensor accuracy, uninterrupted sampling, absence of withheld readings, or correct aggregation.
- The browser workflow is a review-oriented source of synthetic measurements. Field-device automation and operational controls are implemented, while partner-period reliability remains unproven.
- Public repository visibility, the `midnightntwrk` topic, and other submission metadata are checked outside the source gate at submission time.
