# GUI action and processing reference

This appendix defines what each reviewer-facing GUI control does and where that work runs. The
normative product and privacy boundaries remain in the [Wave 1 specification](../architecture/wave1_spec.md).

## Common controls

| Control | Browser | Worker and storage | Midnight / asynchronous result |
| --- | --- | --- | --- |
| **Connect Midnight Wallet** | Connects a compatible Browser Wallet, requests a five-minute Project challenge, and signs the canonical Project Session message. No private key leaves the Wallet. | Verifies the public-key signature, associates only Projects owned by that Wallet, and issues a 24-hour opaque Project Session. D1 stores only the token hash. | No transaction is submitted. After connection, the Device Workflow is shown and the last selected Project is restored if it still belongs to the Wallet. |
| **Language** | Changes English/Japanese labels and stores the preference locally. | No API call. | No chain operation. |
| **Device Workflow / Administrator / Third-Party Verification** | Changes the hash route. | The Device and Administrator routes load Device-scoped data with the Device Session. The Third-Party route loads only redacted public records. | Opening a confirmed third-party record also performs a bounded direct Midnight Indexer lookup. |
| **Refresh** | Clears transient in-memory UI state, reconnects the currently selected route to its authoritative data source, and keeps non-secret selection preferences. It does not replay an old Wallet signature. | Reloads Project, Policy, Device, hourly summary, current anomaly state, Proof Job, and transaction state from Worker/D1 after Wallet reconnection. | Pending Policy, registration, proof, and sponsored-TX operations continue on the server. The GUI only resumes polling their stable operation or Job IDs. |

## Project and Policy controls

| Control | Preconditions and browser work | Worker, D1, Queue, and Container work | Result and limits |
| --- | --- | --- | --- |
| **Project selector** | Requires a connected Wallet. Derives the Browser Device ID again from the selected `projectId` and public Wallet-key hash. | `GET /api/v1/provisioning/configuration?projectId=...` checks Project ownership through the Project Session and returns only that Project's Policies and deployment configuration. | The same Wallet and Project always restore the same Device ID. Device, Policy, capture, and Job state are isolated by Project. |
| **+ New Project** | Opens the name form; **Create Project** submits the trimmed name and **Cancel** makes no change. | `POST /api/v1/projects` creates the Wallet-owned D1 Project. Both Worker admission and a D1 trigger enforce the limit. | Maximum 10 Projects per Wallet. A new Project starts without Policies and requires Policy creation before Device registration. No Midnight transaction is needed. |
| **+ New Policy** | Opens name, mode, and bound fields. Modes are closed range, upper bound only, and lower bound only. Temperature inputs use 0.01 °C steps. **Register Policy** gets a one-time challenge and asks the Browser Wallet to sign the exact Project, Policy ID, mode, centi-degree bounds, nonce, and timestamp; **Cancel** makes no change. | The Worker verifies Project ownership, freshness, one-time nonce, canonical values, signature, and quota. It writes a stable Policy operation and enqueues its ID. The Sponsor Wallet Container uses the private Operator Authority to call `registerThresholdPolicy`; after Indexer confirmation, D1 stores the public Policy mirror for that Project. | Maximum 10 registered plus pending Policies per Project. A registered Policy is immutable; a different threshold is a new Policy. Queue/retry progress survives browser closure and is restored by operation ID. Bounds are public on Midnight. |
| **Policy selector in Midnight registration** | Selects one registered Policy and persists that non-secret preference for the active Project. | No write until Device registration. | The selected Policy becomes immutable for that Device assignment. |

List state is explicit throughout the GUI. **LOADING** includes an animated indicator and means that the
authoritative source is still being queried; **NO DATA** is static and appears only after a successful query
returns zero rows. The same distinction is used for Policies, Device daily history, Administrator tables, and
public Proof records. Policy status polling keeps a registered or in-flight row visible until the refreshed
Project configuration contains it. Background status refreshes preserve unfinished Project and Policy form
values, selection, and keyboard focus by patching only the affected status/list components; they do not
re-render the page or replace either form DOM node.

## Device Workflow controls

| Control | Browser / Device-side work | Worker, storage, Queue, Container, and Midnight work | Completion shown by the GUI |
| --- | --- | --- | --- |
| **Create Device Identity** | Uses the deterministic Wallet/Project Device ID. Generates or restores the Device P-256 private key and Device Authority secret in browser IndexedDB. | No secret is uploaded. | The check mark means the local identity is available. Reload recovery requires the same browser storage and Wallet/Project. |
| **Register Device and assign policy** | Obtains a five-minute one-time challenge. The Browser Wallet signs the canonical Device, Project, P-256 public identity, Device Authority commitment, selected Policy, nonce, and timestamp. | The Worker verifies the Wallet signature and Project ownership, stores a stable registration operation, and queues it. The private Operator path registers the Device and Device-bound Policy Assignment on Midnight. Only after Indexer confirmation does D1 activate the Device key, assignment mirror, Device Session path, and initial `normal` anomaly state. | The button returns after durable acceptance. Queued/running/retrying state is shown as a background Job, not as a blocked browser action. Device and Assignment transaction links appear after confirmation. |
| **Previous day / date / Next day** | Selects one completed operational day within the previous 30 days. | No API write. | The current and future operational days cannot be generated because the claim covers a complete 24-hour period. |
| **Generation mode** | Chooses all values within the Policy or a deterministic demonstration containing outliers. | No API write until generation. | Both modes are valid proof paths: the public result becomes WITHIN or OUTSIDE. |
| **Auto Generate 1,440 values** | Generates one private sample per minute, computes true hourly minimum, maximum, average (`sum / count`), count, 24-slot private input, commitment, and nonce. Raw values and the opening stay in IndexedDB. | Uploads at most 24 hourly operational summaries and only state transitions. D1 maintains the current `normal`/`anomaly` state; it does not receive the 1,440 raw values or private extrema opening. | The day appears in Daily Sensor History. The Administrator step for current state completes even when no anomaly event has occurred, because every registered Device has an explicit current state. |
| **Select** on a daily history row | Restores that day's private capture from IndexedDB when available and selects its server-side summary/Job. | Loads Device-scoped history from D1. | A different date can be generated and tested repeatedly. Missing local private data remains visibly unavailable and cannot be proved by that browser. |
| **Request Daily ZKP** | Builds the public Job request from the selected day's commitment, Policy/Assignment IDs, period, presence, count, circuit version, and claimed Boolean result. It never sends threshold bounds as proof inputs. | `POST /api/v1/proof-jobs` creates or returns the idempotent Device/day and measurement-group Job. Admission is persisted in D1 and may be handled through Queue scheduling. | The returned stable Proof Job ID and status survive reload. Duplicate identical requests return the existing Job; conflicting reuse is rejected. |
| **Generate ZKP, sign, and record on Midnight** | Loads the private capture, invokes the official Compact/Midnight Browser Wallet path through the Worker-hosted Proof Server, and asks the connected Wallet to sign the proved fee-free transaction with `payFees: false`. | The Worker streams proving traffic without storing the body. It stores the accepted exact transaction bytes in private R2, reserves per-Wallet daily quota, and queues only the Job ID. The Sponsor Wallet revalidates the allow-listed transaction shape, adds only DUST, submits it, and updates D1 while the browser polls. | The GUI shows animated progress, actual ZKP generation time, Sponsor status, and confirmed transaction evidence. A server-side retry does not require the browser to remain open; a failed signature-expired operation is explicitly retryable. |

## Administrator controls

| Control | Processing and displayed source |
| --- | --- |
| **Older day / date selector / Newer day** | Changes the selected UTC date inside already loaded Device-scoped history. Hourly minimum, maximum, average, count, commitment, current normal/anomaly state, and daily Job/TX state come from authenticated Worker/D1 APIs. Raw samples and the private opening are absent. |
| **Daily Proof action** | Uses the same Request/Generate actions described above for the selected Device day; it does not create a second workflow or bypass Device authorization. |
| Explorer links | Contract, Policy registration, Device registration, Assignment, and attestation transaction identifiers link to the network-specific Midnight Explorer when public evidence is available. |

## Third-Party Verification controls

| Control | Browser and public API | Midnight verification and privacy result |
| --- | --- | --- |
| **Transaction hash / Verify** | The browser queries the public Midnight Indexer by hash, confirms the transaction/block, finds the called Contract, and decodes the state transition at that block. No Wallet or D1 lookup is required. | The selected record shows the UTC date, 24 hourly results, applied policy and validity, Device Commitment, block, and transaction evidence. |
| Automatic **How this ZK proof was checked** sequence | Shows an indeterminate progress indicator while the browser queries the public Midnight Indexer with a timeout. | It independently matches successful TX/hash/block, decodes the contract ledger at that block, and compares commitment, verified flag, presence/counts, result, Policy, and Device-bound Assignment. Any mismatch keeps verification incomplete. |
| **Raw Sensor Values** panel | Displays a deliberate redaction labelled **Hidden from third parties / Values stay private**. | The public API contains no raw sample, hourly extrema, nonce, witness, proof-server body, or Wallet secret. The panel is explanatory and cannot reveal a value. |
| Explorer links | Opens public transaction, block, or contract evidence. | Explorer evidence supplements the direct Indexer comparison; a D1 `confirmed` string alone is never treated as proof. |

## Reload and failure behavior

- Project and Policy selection are non-secret local preferences. Project ownership, Policies, Device registration,
  current anomaly state, hourly summaries, Jobs, and TX status are re-read from Worker/D1.
- Device identity and generated raw values/private openings are restored only from this browser's IndexedDB.
- Project, Policy, Device-registration, and sponsored-submission operations use stable IDs. Closing or reloading
  the page does not cancel Queue/Container work.
- A one-time challenge or Wallet signature is never silently replayed. If the server marks an operation failed,
  the GUI shows the error and enables a new explicit action where a fresh signature is required.
