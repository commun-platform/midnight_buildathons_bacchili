# Measurement Data Authenticity Implementation Specification

[日本語版](ja/implement_spec.md)

## 1. Use Case

```text
Edge temperature sensor → Worker ingestion API → D1 time series
                                               ↓ once per local day
                                      pending Attestation record

Prepared real dataset → device-wallet CLI → remote prover → Sensor Registry
                                               ↓
                                      public Midnight state
```

The device collector continuously measures and uploads Celsius temperature values and exposes a loopback health endpoint. A separate device-wallet CLI performs an explicitly requested Midnight submission for a prepared real dataset through the remote trusted prover. Compact compilation, proving-key generation, repository-wide verification, and contract deployment run only on the development server, never on the Raspberry Pi or in the browser.

The Worker has claim/result endpoints for an Attestation Agent, but no always-on agent is implemented in this repository. Cron scheduling therefore stops after creating a `pending` D1 record unless an external agent takes over.

## 2. Runtime Components

The Cloudflare Worker serves, from one origin:

- the framework-free English/Japanese SPA;
- Project, Device, Reading, and Attestation read APIs;
- a bearer-protected temperature ingestion API;
- bearer-protected Attestation Agent claim/result APIs for an external agent;
- an hourly scheduled handler;
- an authenticated Proof Server Container gateway.

The system must not expose wallet credentials, bearer tokens, private thresholds, raw proof inputs, or an agent control endpoint to the GUI.

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
| Device | localized name/type, `temperature`, `°C`, last seen, trusted-cloud normal range |
| Reading | timestamps, value, local date, outlier flag, attestation ID |
| Attestation | period, counts, status, roots, dataset/verification Tx IDs, Explorer transaction hashes and block heights |

The initial configuration contains only `edge-temp-001`, displayed as **Temperature Sensor** or **温度センサー**. Migrations remove prior test readings, attestations, and unused device definitions. The API never substitutes generated readings when D1 is empty or unavailable.

API and scheduled code depend only on `SqlDatabase`. D1 is the current adapter; a future Turso/libSQL adapter must preserve the same interface and API responses.

## 5. Ingestion

`POST /api/v1/readings` requires `INGEST_API_TOKEN` and accepts `projectId`, `deviceId`, `sensorType`, `value`, `unit`, and an ISO 8601 `recordedAt`. The device must exist in that project, and `sensorType` and `unit` must exactly match its registered `temperature` and `°C` values. The Worker derives the project-local date, evaluates the trusted-cloud normal range, writes the reading, and updates `lastSeenAt` in one D1 batch.

## 6. Daily Attestation

During the project's local midnight hour, the scheduled handler counts the previous day's readings, creates one deterministic Attestation record if absent, and associates previously unassigned readings with it:

```text
Pending → Aggregating → Proving → Submitted → Confirmed / Failed
```

The implemented Cron path ends at `pending`. `POST /api/internal/attestations/claim` atomically moves the oldest pending record to `aggregating`; `POST /api/internal/attestations/:id/result` accepts later status and transaction metadata. Both require `ATTESTATION_API_TOKEN`. These APIs do not build proof inputs, call the device wallet, confirm a transaction, or query Midnight themselves.

## 7. Operational Proof Claim

The deployed `sensor-registry` contract has two transaction circuits:

- `registerDataset` publishes a Merkle root, device commitment, period bounds, sample count, and schema version.
- `verifySensorValue` privately opens one selected sensor leaf and nonce, recomputes the depth-11 Merkle path, and checks the selected temperature against private minimum and maximum bounds.

After the checks pass, the dataset's public `verified` flag and the contract's global verification result are set to true. The operational circuit proves selected-value inclusion and range, not full-day completeness or classification of every reading.

`device:submit` accepts a `PreparedDataset` or a real `SensorRecord[]`. Array input is prepared locally with `--min`, `--max`, and `--selected-index`; `--verify-only` skips registration. Prepared private data is encrypted below the device wallet directory.

The separate `daily-attestation` generator and benchmark implement fixed 24/96/1,440-sample full-day profiles, hourly claims, off-circuit Ed25519 evidence, and append-only reason hashes. They are development-only experiments and are not used by the device firmware or Worker lifecycle.

## 8. SPA Views

- **Project Overview:** latest real reading, last update, one Edge Device, collection counts, current and confirmed attestations.
- **Time-Series Data:** chart, table, outlier/status filters, and the associated transaction state.
- **Daily Proof History:** period, counts, processing state, Dataset Tx, and Verify Tx.
- **Third-Party Verification:** agent-reported D1 status, root, contract configuration, transaction IDs, block heights, supported Preprod Explorer links, and the privacy boundary.

The visual style uses high-contrast navy title bars, gray panels, explicit borders, tables, keyboard controls, and print-readable typography inspired by 1990s public-sector systems. The browser does not currently query the Midnight indexer or validate a proof/signature independently; it renders the public fields stored through the trusted Attestation result API.

## 9. Acceptance Criteria

| Area | Requirement |
| --- | --- |
| Public API | Returns D1 data or an error, never generated values |
| Ingestion | Rejects missing auth, unknown devices, and sensor/unit mismatches |
| Scheduling | Uses project timezone, creates a pending record, and associates the previous local day |
| Privacy | Public verification omits raw values, policy bounds, nonces, and private state |
| Operational contract | Rejects unknown roots, duplicate registration, selected-leaf tampering, Merkle-path tampering, invalid bounds, and out-of-range selected values |
| Daily benchmark | Separately exercises full-day classification, signatures, and reason-chain logic; it is not the operational contract |
| Localization | English fallback, Japanese system detection, persistent manual choice |
| Delivery | On a development host, `npm run verify` compiles/tests `sensor-registry`, type-checks workspaces, and performs the Worker dry-run; daily profiles require explicit `npm run attestation:compile` |
| Host separation | The Pi release excludes development apps and Compact sources; installation never invokes compilation, proving-key generation, deployment, Docker, Wrangler, or repository-wide verification |
| Remaining integration | External Attestation Agent, D1-to-prepared-dataset conversion, automatic result reporting/confirmation, independent browser verification, and Turso adapter |
