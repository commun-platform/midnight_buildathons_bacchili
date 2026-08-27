# Private State and Dual-Ledger Specification

[日本語版](ja/private_spec.md)

## 1. Objective

The system stores Edge Device temperature readings for operations while allowing third parties to verify a limited claim without publishing raw values or private policy thresholds on Midnight.

```text
Temperature Sensor → authenticated Worker → private operational database
                                              ↓ local-midnight Cron
                                    pending Attestation record

Prepared real dataset → device wallet / ZKP → Midnight public ledger
```

The two paths are both implemented, but an always-on Attestation Agent connecting the pending D1 record to the device-wallet command is not included. Any result written back to D1 currently comes from a trusted external caller.

## 2. Privacy Boundaries

### Operational Private Data

The authenticated cloud operator boundary contains:

- raw temperature values and receive timestamps;
- project and device identifiers;
- private normal-range policy and outlier decisions;
- processing and submission errors.

Clients access D1 only through Worker APIs; however, the current read APIs have no user-authentication layer, as noted in [GUI Exposure](#7-gui-exposure). Ingestion, attestation control, and proof gateway access use separate bearer secrets.

### Midnight Private State

Encrypted operational state on the Raspberry Pi device-wallet host contains, for each submitted prepared dataset:

- all supplied sensor records;
- the selected sample index and nonce;
- the selected sample's depth-11 Merkle path;
- minimum and maximum thresholds;
- the device-wallet recovery material and device private-state password.

These values must not enter `.env.device`, `.env.development`, browser storage, browser-visible environment variables, Worker logs, or Midnight public state. Device credentials live only below `~/.midnight/midnight-cloudflare-demo/device-wallet/`. The separate development/deployer wallet lives only in `.env.development` and its secure backup; it never enters the Pi operational release.

### Public State

The operational `sensor-registry` contract publishes:

```text
datasetRoot
deviceCommitment
periodStart / periodEnd
sampleCount
schemaVersion
dataset.verified
registrationCount / verificationCount
lastVerifiedRoot / verificationResult
```

The Worker verification API may additionally return agent-reported transaction IDs, transaction hashes, block heights, counts, and workflow status from D1. Minimum, maximum, raw values, the selected nonce, and Merkle path are not part of the public verification response.

The public ledger represents a device using a commitment rather than its direct operational identifier.

The development-only daily benchmark has a larger proposed public schema (`dayRoot`, `hourClaimsRoot`, policy and signature-bundle commitments, hourly counts, and reason hashes). Those values are not part of the operational contract or current dashboard integration.

## 3. Dual Ledger

| Ledger | Purpose | Data |
| --- | --- | --- |
| D1, future Turso | Operations and time-series queries | Raw values, device, time, workflow state |
| Midnight | Operational public contract state | Dataset root, device commitment, period, count, verified flag, counters |

Each operational Reading can reference its internal Attestation ID. The Attestation row can store a Merkle root and transaction metadata supplied through the protected result API, but the Worker does not currently derive that root, submit the transaction, or independently verify the supplied chain result. Migrating D1 to Turso must not change the public ledger schema or privacy boundary.

## 4. Daily Attestation

The Worker schedules an Attestation for the previous date during each project's local midnight hour:

```text
Pending → Aggregating → Proving → Submitted → Confirmed / Failed
```

Cron creates the `pending` record and associates readings. Protected APIs let an external agent claim it and report later states, but that external agent is not implemented here. The included device-wallet CLI instead takes an explicit prepared dataset, stores its private portion as encrypted device private state, and sends `registerDataset` plus `verifySensorValue` through the remote trusted Proof Server. The collector process itself never loads the wallet or proof runtime.

## 5. Compact Contract

The operational `sensor-registry` contract registers public dataset metadata and verifies one privately selected leaf:

```text
private selected SensorLeaf
private selected nonce
private minimum / maximum
private Merkle path
```

The circuit recomputes the selected persistent commitment and Merkle root, validates the threshold ordering, and checks the selected temperature range. It sets the registered dataset's public `verified` flag only after those checks succeed. It does not prove that every record is present, ordered, or within range.

The generated 24, 96, and 1,440-reading daily profiles implement the fuller design: complete hourly classification, policy commitment, off-circuit device signatures, and append-only reason hashes. They are exercised by development tests/benchmarks only. Their artifacts are not exported to the Pi release and their public evidence is not stored by the current Worker workflow.

Within that benchmark contract, `appendOutlierReason` stores a reason hash for a day root and hour; revisions reference the latest `previousReasonHash`.

## 6. Trust Model

The selected operational path uses the Cloudflare Container as a trusted prover because private preimages reach it. Access must remain bearer-protected, proof inputs must not be logged or persisted by the gateway, and Container/Worker access must be auditable. The D1 backend is also trusted with raw readings and normal-range policy. A future operator-controlled prover can replace the proving trust boundary without changing the contract.

## 7. GUI Exposure

The current read APIs and SPA have no user-authentication layer, so a public deployment exposes the D1 time-series read views. Add access control before treating raw readings as operator-only. The third-party view displays only period, counts, agent-reported proof checks, roots, configured contract address, transaction IDs, and block heights. It does not query Midnight or validate signatures independently.

## 8. Required Tests

- Operational tests accept a valid selected leaf and reject an out-of-range value, raw-value tampering, commitment tampering, and Merkle-path tampering.
- Daily benchmark tests separately cover 24 hourly claims, classification counts, policy substitution, sequence gaps, signatures, and invalid reason predecessors.
- Unauthorized ingestion and agent updates are rejected.
- Public verification responses contain no raw value, threshold, nonce, or Merkle path.
