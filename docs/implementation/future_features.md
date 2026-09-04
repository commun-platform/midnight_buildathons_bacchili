# Future Feature Backlog

[日本語](../ja/implementation/future_features.md)

Status: remaining plans with explicit current-state annotations as of 2026-09-05 JST
Product: BACCHIRI!━━Verifiable Measurement Layer

## 1. Purpose

This backlog separates work that requires a new Compact contract and redeployment from work that can
be added later in the Backend, Frontend, or operational tooling. Contract-first items are designed
before a long-lived deployment because adding them later changes circuits, proving artifacts,
contract addresses, and verification evidence.

Only text explicitly labeled as current state or implemented foundation is a current implementation
claim. Completion conditions remain future work.
Product and business outcomes are defined by the
[`three-wave roadmap`](../architecture/three_wave_roadmap.md). This backlog translates those outcomes
into implementation work; it does not replace the roadmap.

## 2. Contract foundation and remaining contract-first backlog

Operator Authority rotation was completed before this update. Device-owner authority remains the
contract-first priority.

### `FF-C01` Operator Authority rotation

| Field | Status |
| --- | --- |
| Priority | Implemented foundation |
| Current state | `operatorAuthorityVersion` and `rotateOperatorAuthority` are implemented, compiled, and deployed in the current eight-circuit Contract. The prior Authority stops authorizing after the versioned rotation is confirmed. |
| Target use case | An authorized Operator replaces the current Operator Authority without redeploying the whole registry. |
| Contract work | Add an Operator-authorized rotation circuit and versioned public state. The old secret must stop authorizing future administrative calls after confirmation. |
| Required tests | Wrong old secret, empty or unchanged new Authority, non-increasing version, successful rotation, rejection of the old secret, and acceptance of the new secret. |
| Completion evidence | Compact compile, simulator rejection tests, generated prover/verifier artifacts, client/type updates, and the current deployment are recorded in the [current release evidence](../submission/current_release_addendum.md). A live rotation should still be executed before relying on emergency rotation in partner operation. |

The contract authorizes the change by proving knowledge of the current Operator secret. Transaction
submission and DUST sponsorship remain separate from this administrative authority.

### `FF-C02` Device Owner Authority and threshold replacement

| Field | Plan |
| --- | --- |
| Priority | P0 — before Device-owner self-service threshold changes |
| Current constraint | The Operator can register a Policy, close the current Assignment, and register a higher-version non-overlapping successor. There is no separate Device Owner Authority or owner self-service transition. |
| Target use case | The Device owner changes the threshold for its own Device from the Frontend, while the Device runtime cannot change it automatically and third parties can identify the authoritative Assignment for each measurement period. |
| Contract work | Bind a separate Device Owner Authority during Device registration and add an owner-authorized threshold replacement transition over the existing close/successor rules. Keep it separate from `deviceAuthority`, define the cutover period, and preserve historical attestations. Include an Operator-controlled owner-recovery or ownership-transfer path. |
| Required tests | Wrong Owner Authority, owner of another Device, use of `deviceAuthority` as owner authority, unknown old/new Assignment, invalid cutover, overlapping active Assignments, historical-period acceptance, post-cutover old-Assignment rejection, and Owner Authority recovery. |
| Completion evidence | Compact compile, transition and boundary tests, regenerated artifacts, Backend mirror migration, client/type updates, redeployment record, and Preprod transaction evidence. |

The exact Owner Authority mechanism and ledger shape remain design decisions. Acceptance requires
separation between measurement submission and threshold administration, plus an unambiguous effective
Assignment per Device and measurement category.

## 3. Later contract option

| ID | Feature | Current decision | When to reconsider |
| --- | --- | --- | --- |
| `FF-C03` | Re-enable a disabled Device | Not scheduled. Current recovery registers a replacement Device with a new Commitment and Authority. | Add a dedicated recovery circuit only if operations must preserve the same Device identity after accidental disablement. |

## 4. Frontend, administration, and operations backlog

These items use the contract capabilities above but do not require further circuit changes.

| ID | Priority | Planned feature | Current state | Completion condition |
| --- | --- | --- | --- | --- |
| `FF-O01` | P0 | System-administration GUI | Commands retain rotation, disabling, recovery, and authority-management operations. The hosted review flow exposes only fixed Device/Assignment registration through an internal Operator path. | A separately protected system-operator application manages the remaining operations with explicit authorization, audit evidence, and no browser access to the Operator secret. |
| `FF-O02` | P0 | Device-owner threshold Frontend | Only the Operator can currently register Policies and Assignments. | The authenticated Device owner selects a Device, threshold, and effective period in the existing Frontend and explicitly approves the owner-authorized Midnight transition. The Browser, Backend, and Device never receive the Operator secret. |
| `FF-O03` | P0 | One-step threshold change workflow | Policy registration, Assignment registration, and D1 synchronization are separate operations. | One owner action creates the new immutable Policy, replaces the active Assignment, waits for Midnight confirmation, and only then publishes a new D1 configuration revision. Partial failure remains visible and retryable. |
| `FF-O04` | P1 | Startup configuration-revision synchronization | The authenticated configuration endpoint and monotonic revision exist, but installation is manually invoked. | On startup, the Edge Device compares the remote and locally verified revisions. It atomically installs a newer confirmed Policy/Assignment for its own Device, retains the previous version for historical work, and continues with the last verified unexpired configuration when offline. |
| `FF-O05` | P1 | Scheduled daily proof submission | `device:submit` is operator-invoked, although Proof Job admission is scheduled. | A completed day is prepared and submitted automatically with idempotent retry, while manual execution remains available for recovery. |
| `FF-O06` | P1 | Complete sponsored-transaction lifecycle | The exact transaction is retained and resumable while the Sponsor Wallet synchronizes; confirmed pending-file cleanup remains incomplete. | Confirmation removes or archives the pending file safely, and timeout, retry, and operator-visible failure states are monitored. |
| `FF-O07` | P2 | Guided Device Authority rotation | The Device generates a replacement public enrollment and the development operator runs the rotation and D1 synchronization. | The local administration GUI coordinates Device-side secret generation, public enrollment transfer, Midnight rotation, D1 synchronization, and rollback-safe status reporting without transferring the Device secret. |
| `FF-O08` | P1 | Sortable typed-ID migration | Current Device IDs are operator slugs, Batch/Event IDs embed timestamps, and Proof Job IDs are content-derived hashes. | New records use persisted UUIDv7 IDs with `dvc`, `zjb`, `mbt`, and `aev` prefixes; retries reuse the first ID; D1 separates `deviceCode`/`deviceName`; legacy and chain-bound records remain readable without silent rewriting; keyset pagination, index locality, restart recovery, and logical uniqueness are tested. |
| `FF-O09` | P0 | Production role and application separation | Wave 1 combines operator actions and third-party verification for judging. | Operator, third-party verifier, and system operator use separate applications or protected routes with least-privilege access. |
| `FF-O10` | P0 | Organization/project/role authorization | Wave 1 ownership and review authorization are PoC-scoped. | Organization, project, and role claims are enforced at every API and workflow transition, with tenant isolation and negative authorization tests. |
| `FF-O11` | P0 | Audit, diagnostics, and operations dashboard | An Access-protected read-only console now shows Sponsor Wallet synchronization and DUST, D1 workflow state, daily metrics, redacted customer-UC events, alert thresholds, Discord incidents, and Sponsor receipts. | Validate the alert policy during partner operation, add explicit audited recovery controls, and integrate longer-term log export if the measured support volume requires it. |
| `FF-O12` | P1 | Partner-pilot operations | No real partner workflow is operated as a production service in Wave 1. | A real field workflow runs for an agreed period with measured reliability, support effort, cost, customer value, and price feedback. |
| `FF-O13` | P1 | Horizontally scaled Proof Server pool | The deployment uses one named `standard-2` Proof Server Container, one concurrent Proof Queue consumer, and one global proof-admission lease. Increasing `max_instances` alone does not distribute work. | A configurable pool of stateless Proof Server instances uses explicit instance slots and D1-backed leases; Queue concurrency and admission capacity match the pool size; retries remain idempotent; busy instances are not assigned additional work; inactive instances still scale to zero; and a backlog load test demonstrates parallel processing without changing the singleton Sponsor Wallet. |
| `FF-O14` | P1 | Official Container rollout and Wallet-safe deployment | Both Containers currently use `max_instances: 1` without an explicit rollout grace period. The Sponsor Wallet already handles `SIGTERM`, periodic and shutdown checkpoints, job leases, and pending-transaction reconciliation, but deployment does not yet coordinate admission drain and Wallet handoff. | Use Cloudflare Container Rollouts and Worker Versions as the deployment foundation while retaining the existing Container names. Deploy a backward-compatible Worker before an image rollout; apply an explicit grace period and workload-appropriate rollout policy; stop new Sponsor admission; finish or reconcile in-flight work; persist and restore the encrypted Wallet checkpoint; and resume only after synchronization and readiness checks. Keep exactly one active signer per Wallet, prevent stale instances from submitting, distinguish rollout start from rollout completion, preserve backward-compatible D1/R2/Checkpoint state, and verify both forward rollout and controlled rollback. Proof Server rollout and stateful Sponsor Wallet handoff have separate procedures. |

The Device never chooses its own threshold during proof submission. It receives only a Policy and
Assignment already authorized by the owner and confirmed on Midnight. A new configuration becomes
effective at the next measurement-period boundary; pending or historical proofs keep the version to
which they were originally bound.

The Sponsor Wallet continues to add DUST only. It is neither the system administrator nor the Device
owner and cannot change the threshold or the Device-authorized transaction.

## 5. Product expansion backlog

| ID | Priority | Planned feature | Boundary |
| --- | --- | --- | --- |
| `FF-P01` | P2 | Additional measurement types | Noise, vibration, humidity, and other measurements require explicit encoding, unit, policy, input-validation, and evidence work before support is claimed. |
| `FF-P02` | P2 | Local and multi-source verifier hardening | The public view already queries the public Midnight Indexer and compares transaction/Contract state. A future verifier may execute the proof verifier locally and compare multiple independent Indexer sources. |
| `FF-P03` | P2 | Multi-organization administration | Organization-specific authorization, tenant isolation, approval policy, and audit ownership must be defined. Direct organization-held on-chain authority would require a separate contract design; Backend-mediated roles do not. |
| `FF-P04` | P1 | Hardware-protected identity and provenance | Add non-exportable identity, approved software/configuration evidence, and verifiable calibration, maintenance, replacement, and update history without claiming physical measurement truth. |
| `FF-P05` | P1 | Commercial service controls | Add service levels, backup/disaster recovery, usage metering, plans, billing, and support needed for repeatable multi-organization operation. |

## 6. Business validation backlog

| Stage | Completion evidence |
| --- | --- |
| Wave 2 partner pilot | An established company uses autonomously produced daily proofs in an existing workflow for an agreed period; reliability, support effort, operating cost, customer value, and viable pricing are measured. |
| Wave 3 PMF | Multiple paying customers use the service repeatedly, real recurring revenue exists, and at least one customer renews or expands while unit economics remain sustainable. |

## 7. Planned implementation order

1. Specify and implement `FF-C02`, including separate Owner and Device authorities, over the already deployed versioned Operator and Assignment lifecycle.
2. Recompile Compact, regenerate all affected artifacts, update clients and D1 mirrors, and redeploy.
3. Validate owner-authorized replacement and Operator recovery on Preprod without treating local tests as network evidence.
4. Before production identifiers and history are frozen, implement `FF-O08`, including the D1
   migration, Device write-ahead persistence, compatibility reads, and controlled Device/Commitment
   transition or a documented clean Preprod reset.
5. Complete production role/application separation and organization/project/role authorization
   around the already protected system-operations and MCP foundations.
6. Validate the implemented audit, redacted diagnostics, metrics, health monitoring, queue/retry
   visibility, and alerting under partner load; then add audited recovery controls.
7. Implement owner-authorized threshold changes, then publish confirmed configuration revisions for
   field startup synchronization.
8. Implement `FF-O14`, then add autonomous daily execution, sponsored-transaction cleanup, and
   controlled update/rollback.
9. Run the Wave 2 partner pilot and use measured reliability, support, cost, value, and pricing data
   as the gate for Wave 3 investment.
10. Add hardware-protected identity, lifecycle provenance, and commercial service controls, then
    validate recurring revenue, renewal, expansion, and unit economics before claiming PMF.
