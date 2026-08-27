# Private State and Dual-Ledger Specification

[日本語版](ja/private_spec.md)

## 1. Objective

The system stores Edge Device temperature readings for operations while allowing third parties to verify a limited claim without publishing raw values or private policy thresholds on Midnight.

```text
Temperature Sensor → authenticated Worker → private operational database
                                              ↓ daily dataset
                                    Attestation Agent / ZKP
                                              ↓
                                    Midnight public ledger
                                              ↓
                                  Public verification view
```

## 2. Privacy Boundaries

### Operational Private Data

The authenticated cloud operator boundary contains:

- raw temperature values and receive timestamps;
- project and device identifiers;
- private normal-range policy and outlier decisions;
- processing and submission errors.

D1 is never directly exposed to public clients. Ingestion, attestation control, and proof gateway access use separate bearer secrets.

### Midnight Private State

Encrypted operational state on the Raspberry Pi device-wallet host contains:

- daily temperature samples;
- sample nonces;
- minimum and maximum thresholds;
- all 24 hourly inputs and their commitment nonces;
- the private policy opening;
- the device-wallet recovery material and device private-state password.

These values must not enter `.env.device`, `.env.development`, browser storage, browser-visible environment variables, Worker logs, or Midnight public state. Device credentials live only below `~/.midnight/midnight-cloudflare-demo/device-wallet/`. The separate development/deployer wallet lives only in `.env.development` and its secure backup; it never enters the Pi operational release.

### Public State

Only the following values may be published by the contract or verification API:

```text
dayRoot
hourClaimsRoot
deviceCommitment
policyCommitment
signatureBundleHash
periodStart / periodEnd
sampleCount
daily anomalyCount
schemaVersion
verificationResult
transactionId / blockHeight
```

The public hourly-claim document contains `hourRoot`, `sampleCount`, `normalCount`, `anomalyCount`, and `allWithinRange`. Its canonical Compact hash must equal `hourClaimsRoot`. Minimum, maximum, average, raw values, and policy bounds are not public because a one-reading hour would otherwise disclose the raw measurement.

The public ledger represents a device using a commitment rather than its direct operational identifier.

## 3. Dual Ledger

| Ledger | Purpose | Data |
| --- | --- | --- |
| D1, future Turso | Operations and time-series queries | Raw values, device, time, workflow state |
| Midnight | Tamper-evident public evidence | Commitments, period, count, result |

The two ledgers are linked by the daily dataset root and a zero-knowledge proof, not by copying raw values. Each operational Reading references its internal Attestation ID. Migrating D1 to Turso must not change the public ledger schema or privacy boundary.

## 4. Daily Attestation

The Worker schedules an Attestation for the previous date during each project's local midnight hour:

```text
Pending → Aggregating → Proving → Submitted → Confirmed / Failed
```

The device-wallet Attestation Agent builds persistent sample commitments, 24 hourly roots, and one day root, then stores proof inputs as encrypted device private state. One recurring transaction submits the full-day proof through the remote trusted Proof Server. Registration/deployment work is performed once from the development server. The collector process itself never loads the wallet or proof runtime.

## 5. Compact Contract

The generated 24, 96, and 1,440-reading profiles share the same production logic. `submitDailyAttestation` receives private hourly measurements, nonces, and the policy opening.

```text
privateDay
operatorSecret
```

The circuit recomputes every persistent measurement commitment, hourly root, day root, and hourly claim. It verifies the private policy commitment, sequence continuity, and `normalCount + anomalyCount = sampleCount` for every hour. It sets public `verified` only after all checks succeed.

Device Ed25519 signatures are intentionally verified outside the circuit. The signed bundle includes each hourly root, count, sequence range, schema version, and firmware ID; its hash is stored with the attestation. A third party must require both the Midnight proof and all device signatures to pass.

`appendOutlierReason` stores a reason hash for a day root and hour. Updates cannot overwrite an earlier record and must reference the latest `previousReasonHash`.

## 6. Trust Model

The selected production path uses the Cloudflare Container as a trusted prover because private preimages reach it. Access must remain bearer-protected, proof inputs must not be logged or persisted by the gateway, and Container/Worker access must be auditable. A future operator-controlled prover can replace this trust boundary without changing the contract.

## 7. GUI Exposure

The operator GUI may display raw time-series values after appropriate access control is added. The third-party view displays only the period, counts, proof checks, roots, signature status, contract address, transaction IDs, and block heights. It explicitly labels raw values, thresholds, nonces, and private inputs as private.

## 8. Required Tests

- A valid full day produces `verified = true` and 24 hourly claims.
- Every out-of-range value is counted exactly once.
- Tampered raw data fails the signed day root.
- Policy substitution and sequence gaps are rejected.
- Device and operator signature changes are rejected off-circuit.
- An invalid reason predecessor is rejected.
- Unauthorized ingestion and agent updates are rejected.
- Public verification responses contain no raw value, threshold, nonce, or Merkle path.
