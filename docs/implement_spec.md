# Measurement Data Authenticity Implementation Specification

[日本語版](ja/implement_spec.md)

## 1. Use Case

```text
Edge temperature sensor → Worker ingestion API → D1 time series
                                               ↓ once per local day
                                      Daily attestation workflow
                                               ↓
                              private state + ZKP + Midnight Preprod
                                               ↓
                                  third-party verification GUI
```

The device collector measures and uploads Celsius temperature values and exposes a loopback health endpoint. A separate device-wallet agent performs recurring Midnight submissions through the remote trusted prover. Compact compilation, proving-key generation, repository-wide verification, and contract deployment run only on the development server, never on the Raspberry Pi or in the browser.

## 2. Runtime Components

The Cloudflare Worker serves, from one origin:

- the framework-free English/Japanese SPA;
- Project, Device, Reading, and Attestation read APIs;
- a bearer-protected temperature ingestion API;
- Attestation Agent claim/result APIs;
- an hourly scheduled handler;
- an authenticated Proof Server Container gateway.

The system must not expose wallet credentials, bearer tokens, private thresholds, raw proof inputs, or an agent localhost endpoint to the GUI.

The collector package must not depend on Compact, Midnight wallet/contract SDKs, proof providers, Wrangler, or Docker. The device-wallet package may contain transaction runtime dependencies but no compiler or deployment command. The installer may install only those two device workspaces and must fail closed when ingestion configuration is missing. Development wallet material belongs in backupable `.env.development`; device wallet material belongs below `~/.midnight`, never in `.env.device`.

## 3. Language Behavior

- English is the canonical and fallback language.
- On first visit, the SPA selects Japanese only when `navigator.languages` includes `ja`; otherwise it selects English.
- Users can select System, English, or Japanese. The explicit choice is stored in `localStorage`.
- Project and device display names have English primary fields and nullable Japanese fields.
- Canonical documentation is in the repository root and `docs/`; Japanese translations are in `docs/ja/`.

## 4. Data Model

| Entity | Main fields |
| --- | --- |
| Project | localized name/organization, timezone, expected interval |
| Device | localized name/type, `temperature`, `°C`, last seen, private normal range |
| Reading | timestamps, value, local date, outlier flag, attestation ID |
| Attestation | period, counts, status, roots, dataset/verification Tx IDs, Explorer transaction hashes and block heights |

The initial configuration contains only `edge-temp-001`, displayed as **Temperature Sensor** or **温度センサー**. Migrations remove prior test readings, attestations, and unused device definitions. The API never substitutes generated readings when D1 is empty or unavailable.

API and scheduled code depend only on `SqlDatabase`. D1 is the current adapter; a future Turso/libSQL adapter must preserve the same interface and API responses.

## 5. Ingestion

`POST /api/v1/readings` requires `INGEST_API_TOKEN` and accepts a finite value plus an ISO 8601 timestamp. The device must exist, and `sensorType` and `unit` must exactly match its registered `temperature` and `°C` values. The Worker derives the project-local date, evaluates the private normal range, writes the reading, and updates `lastSeenAt` atomically.

## 6. Daily Attestation

During the project's local midnight hour, the scheduled handler creates the previous day's record:

```text
Pending → Aggregating → Proving → Submitted → Confirmed / Failed
```

All readings in that local date receive the same Attestation ID. The production contract supports fixed daily profiles of 24, 96, or 1,440 readings. Device and private-policy commitments are registered once; each day is then submitted with one full-day proof transaction.

## 7. Proof Claim

The production daily circuit proves:

> Every committed reading belongs to the signed daily dataset; sequence ordering is complete; and each reading is classified exactly once as normal or anomalous against the committed private policy.

The public evidence contains the persistent day root and a root over 24 hourly claims. Each hourly claim contains its root, sample count, normal count, anomaly count, and `allWithinRange` result. Raw values, nonces, and policy bounds remain private. Ed25519 signatures over each hourly root are verified outside the circuit and bound through an on-chain signature-bundle hash.

An operator may later append a signed reason hash for an anomalous hour. Reason revisions form an append-only `previousReasonHash` chain; plaintext explanations remain off-chain and are verified by canonical re-hashing in the GUI.

## 8. SPA Views

- **Project Overview:** latest real reading, last update, one Edge Device, collection counts, current and confirmed attestations.
- **Time-Series Data:** chart, table, outlier/status filters, and the associated transaction state.
- **Daily Proof History:** period, counts, processing state, Dataset Tx, and Verify Tx.
- **Third-Party Verification:** public ZKP result, root, contract, transaction IDs, block heights, supported Preprod Explorer links, and the privacy boundary.

The visual style uses high-contrast navy title bars, gray panels, explicit borders, tables, keyboard controls, and print-readable typography inspired by 1990s public-sector systems.

## 9. Acceptance Criteria

| Area | Requirement |
| --- | --- |
| Public API | Returns D1 data or an error, never generated values |
| Ingestion | Rejects missing auth, unknown devices, and sensor/unit mismatches |
| Scheduling | Uses project timezone and associates the previous local day |
| Privacy | Public verification omits raw values, policy bounds, nonces, and private state |
| Contract | Covers full-day classification, policy binding, sequence gaps, raw tampering, device signatures, and reason-chain tampering |
| Localization | English fallback, Japanese system detection, persistent manual choice |
| Delivery | Tests, type checks, contract compilation, and Worker dry-run succeed |
| Host separation | The Pi release excludes development apps and Compact sources; installation never invokes compilation, proving-key generation, deployment, Docker, Wrangler, or repository-wide verification |
