# Cost model and reproducible benchmark scope

[日本語版](../ja/implementation/cost_benchmark.md)

This document defines the cost model that can be checked from the repository. It does not treat local
deployment logs, generated packages, browser output, or machine-specific timings as submission evidence.
Those values belong in an operator's private measurement record and are intentionally absent here.

## Fixed proof shape

The operational `sensor-registry` contract reduces one operational day to 24 hourly slots. Each observed
slot carries a private minimum, maximum, and reading count; an empty slot carries a NO DATA marker. The
proof circuit shape is therefore independent of whether the source sends 24, 96, or 1,440 raw readings.
Proof volume still grows with the number of active Devices and operational days.

The source of truth is [`sensor-registry.compact`](../../midnight/contracts/sensor-registry/src/sensor-registry.compact)
and the fixed-shape aggregation in [`shared/measurement-protocol`](../../shared/measurement-protocol/).
Run the operational compile with the pinned Compact toolchain:

```bash
npm run contract:compile
```

The compile produces 8 operational circuits. The development-only daily-attestation profiles under
`midnight/experiments/` are separate experiments and are not used by the deployed operational path.

## Runtime cost dimensions

| Dimension | What changes the cost | Boundary |
| --- | --- | --- |
| Raw sampling frequency | Local collection and hourly reduction work | It does not change the 24-slot circuit shape |
| Active Devices × days | Number of proofs and transactions | This is the primary scaling factor |
| Proof Server capacity | Concurrent proof jobs and queue wait | The current design bounds admission and serializes wallet mutations |
| Midnight transaction | One confirmed transaction per accepted daily attestation | DUST and network pricing are external, time-varying inputs |
| Cloudflare runtime | Worker requests, Queue dispatch, D1/R2 storage, and Container active time | Pricing depends on the selected account plan and retention policy |

## Planning equation

For a planning window, use:

```text
monthly total
  = active devices × attestations per device-month × cost per attestation
  + fixed platform costs
  + retained storage and support costs
```

Measure `cost per attestation` from a controlled run that records the current Cloudflare plan, proof
duration, Container CPU/memory, Queue attempts, D1/R2 bytes, and Midnight fee. Keep that record outside
the repository unless the raw inputs, command, toolchain, and account pricing are all publishable and
reproducible. Do not turn a single setup measurement into a customer price or a fleet-load claim.

## Reproducible source checks

The repository verifies the fixed proof shape and its failure cases through the operational contract and
shared tests:

```bash
npm ci
npm run verify:source
```

The source gate compiles the contract, runs the workspace tests, and type-checks the implementation. It
does not redeploy a Worker, spend DUST, or require a live network. A Docker-capable host is required only
for the optional full Container image gate described in the deployment runbook.

## Scale interpretation

The fixed 24-slot input controls circuit growth with raw sample count. It does not prove fleet capacity,
latency, or availability. A credible capacity study must vary active Devices, proof concurrency, retry
rate, confirmation delay, and retention period, then publish the complete inputs and environment used for
the measurement.
