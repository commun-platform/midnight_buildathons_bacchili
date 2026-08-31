# Future Feature Backlog

[日本語](../ja/implementation/future_features.md)

Status: planned work; not part of the current implemented claim as of 2026-08-30 JST
Product: BACCHIRI!━━Verifiable Measurement Layer

## 1. Purpose

This backlog separates work that requires a new Compact contract and redeployment from work that can
be added later in the Backend, Frontend, or operational tooling. Contract-first items are designed
before a long-lived deployment because adding them later changes circuits, proving artifacts,
contract addresses, and verification evidence.

Nothing in this document is a claim of current implementation.

## 2. Contract-first backlog

These are the two current priorities that require changes to `sensor-registry`.

### `FF-C01` Operator Authority rotation

| Field | Plan |
| --- | --- |
| Priority | P0 — before production administration is delegated to the Backend |
| Current constraint | `operatorAuthority` is fixed at construction. Loss or compromise of the private Operator secret has no in-contract recovery path. |
| Target use case | An authorized Operator replaces the current Operator Authority without redeploying the whole registry. |
| Contract work | Add an Operator-authorized rotation circuit and versioned public state. The old secret must stop authorizing future administrative calls after confirmation. |
| Required tests | Wrong old secret, empty or unchanged new Authority, non-increasing version, successful rotation, rejection of the old secret, and acceptance of the new secret. |
| Completion evidence | Compact compile, simulator rejection tests, generated prover/verifier artifacts, client/type updates, redeployment record, and Preprod transaction evidence. |

The contract authorizes the change by proving knowledge of the current Operator secret. Transaction
submission and DUST sponsorship remain separate from this administrative authority.

### `FF-C02` Device Owner Authority and threshold replacement

| Field | Plan |
| --- | --- |
| Priority | P0 — before Device-owner self-service threshold changes |
| Current constraint | Only the Operator can register a Policy and Assignment. Assignments are immutable and may overlap, so registering a new Assignment does not retire an older one that is still valid. |
| Target use case | The Device owner changes the threshold for its own Device from the Frontend, while the Device runtime cannot change it automatically and third parties can identify the authoritative Assignment for each measurement period. |
| Contract work | Bind a separate Device Owner Authority during Device registration and add an owner-authorized threshold replacement transition. Keep it separate from `deviceAuthority`, define the cutover period, and reject the retired Assignment for periods on or after cutover while preserving historical attestations. Include an Operator-controlled owner-recovery or ownership-transfer path. |
| Required tests | Wrong Owner Authority, owner of another Device, use of `deviceAuthority` as owner authority, unknown old/new Assignment, invalid cutover, overlapping active Assignments, historical-period acceptance, post-cutover old-Assignment rejection, and Owner Authority recovery. |
| Completion evidence | Compact compile, transition and boundary tests, regenerated artifacts, Backend mirror migration, client/type updates, redeployment record, and Preprod transaction evidence. |

The exact Owner Authority mechanism and ledger shape remain design decisions. Acceptance requires
separation between measurement submission and threshold administration, plus an unambiguous effective
Assignment per Device and measurement category.

## 3. Later contract option

| ID | Feature | Current decision | When to reconsider |
| --- | --- | --- | --- |
| `FF-C03` | Re-enable a disabled Device | Not scheduled. Current recovery registers a replacement Device with a new Commitment and Authority. | Add a dedicated recovery circuit only if operations must preserve the same Device identity after accidental disablement. |

## 4. Frontend, local administration, and operations backlog

These items use the contract capabilities above but do not require further circuit changes.

| ID | Priority | Planned feature | Current state | Completion condition |
| --- | --- | --- | --- | --- |
| `FF-O01` | P0 | System-administration GUI | Commands retain rotation, disabling, recovery, and authority-management operations. The hosted review flow exposes only fixed Device/Assignment registration through an internal Operator path. | A separately protected GUI manages the remaining Operator operations with explicit authorization, audit evidence, and no browser access to the Operator secret. |
| `FF-O02` | P0 | Device-owner threshold Frontend | Only the Operator can currently register Policies and Assignments. | The authenticated Device owner selects a Device, threshold, and effective period in the existing Frontend and explicitly approves the owner-authorized Midnight transition. The Browser, Backend, and Device never receive the Operator secret. |
| `FF-O03` | P0 | One-step threshold change workflow | Policy registration, Assignment registration, and D1 synchronization are separate operations. | One owner action creates the new immutable Policy, replaces the active Assignment, waits for Midnight confirmation, and only then publishes a new D1 configuration revision. Partial failure remains visible and retryable. |
| `FF-O04` | P1 | Startup configuration-revision synchronization | The authenticated configuration endpoint and monotonic revision exist, but installation is manually invoked. | On startup, the Edge Device compares the remote and locally verified revisions. It atomically installs a newer confirmed Policy/Assignment for its own Device, retains the previous version for historical work, and continues with the last verified unexpired configuration when offline. |
| `FF-O05` | P1 | Scheduled daily proof submission | `device:submit` is operator-invoked, although Proof Job admission is scheduled. | A completed day is prepared and submitted automatically with idempotent retry, while manual execution remains available for recovery. |
| `FF-O06` | P1 | Complete sponsored-transaction lifecycle | The exact transaction is retained and resumable while the Sponsor Wallet synchronizes; confirmed pending-file cleanup remains incomplete. | Confirmation removes or archives the pending file safely, and timeout, retry, and operator-visible failure states are monitored. |
| `FF-O07` | P2 | Guided Device Authority rotation | The Device generates a replacement public enrollment and the development operator runs the rotation and D1 synchronization. | The local administration GUI coordinates Device-side secret generation, public enrollment transfer, Midnight rotation, D1 synchronization, and rollback-safe status reporting without transferring the Device secret. |
| `FF-O08` | P1 | Sortable typed-ID migration | Current Device IDs are operator slugs, Batch/Event IDs embed timestamps, and Proof Job IDs are content-derived hashes. | New records use persisted UUIDv7 IDs with `dvc`, `zjb`, `mbt`, and `aev` prefixes; retries reuse the first ID; D1 separates `deviceCode`/`deviceName`; legacy and chain-bound records remain readable without silent rewriting; keyset pagination, index locality, restart recovery, and logical uniqueness are tested. |

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

## 6. Planned implementation order

1. Specify and implement `FF-C01` and `FF-C02`, including separate Operator, Owner, and Device authorities, together with rejection tests.
2. Recompile Compact, regenerate all affected artifacts, update clients and D1 mirrors, and redeploy.
3. Validate the new contract lifecycle on Preprod without treating local tests as network evidence.
4. Before production identifiers and history are frozen, implement `FF-O08`, including the D1
   migration, Device write-ahead persistence, compatibility reads, and controlled Device/Commitment
   transition or a documented clean Preprod reset.
5. Implement the loopback system-administration GUI without moving the Operator secret to Cloudflare.
6. Implement owner-authorized threshold changes, then publish confirmed configuration revisions for Edge startup synchronization.
7. Add daily automation, sponsored-transaction cleanup, and monitoring.
8. Add product-expansion items only after their proof and trust boundaries are specified.
