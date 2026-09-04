# Managed API Attestation Implementation Plan

## 1. Purpose

Managed API Attestation proves a fixed 24-hour measurement window obtained from an existing
customer cloud API without requiring the customer to operate a Midnight wallet. The mode reuses
the Sensor Registry contract, registered threshold policies, the Proof Server, the asynchronous job
model, the private Server Wallet runtime, and the public third-party
verification path.

The existing review application remains unchanged. Managed API Attestation is exposed through an
independent `/managed-proof/` page and dedicated `/api/v1/managed-sources` APIs.

## 2. Trust and privacy boundary

The managed backend is trusted to authenticate the source API, normalize its response, prepare the
private hourly extrema, and invoke the proof. Midnight verifies that the committed private extrema
match the public hourly outcomes and the threshold policy already assigned on-chain. Managed API
mode does **not** prove that the customer API, its upstream device, or a physical sensor produced
truthful readings. Connector authentication identifies the configured API account, while response
validation, idempotency, and audit records make processing accountable; none of them establish
measurement-source authenticity.

The external API never supplies threshold bounds. The managed workflow loads the registered policy
and assignment, and the Compact circuit loads the same policy from the Sensor Registry state.

The following secrets remain separate:

- Connector credentials authenticate one external API and are encrypted before D1 persistence.
- Managed Attestor root derives one distinct Device Contract Authority per managed source.
- Managed Attestor root authorizes daily attestations for a source-derived Device identity.
- Operator Authority authorizes Device, Policy, and Assignment administration.
- Server Wallet holds DUST and authors, proves, funds, and submits the allowlisted transactions.

`midnight-server-wallet` is one Wallet SDK instance and one Container application. It receives one
Wallet seed plus the two independent Compact authorization secrets, serializes every Wallet
mutation, and persists one encrypted synchronization checkpoint. This intentionally trades process
isolation for materially lower Container and chain-replay cost. The Proof Server remains a separate
Container. The Server Wallet validates the configured contract and exact allowlisted circuit before
adding DUST or submitting a transaction; it exposes no public HTTP route.

## 3. Runtime boundaries

```text
Cloudflare Access administrator
  -> Managed Source API
     -> D1 connector metadata and job state
     -> encrypted connector credential

Cron / explicit test run
  -> Managed Source Queue: fetch-window
     -> HTTPS source API [periodStart, periodEnd)
     -> schema, identity, range, unit, and duplicate validation
     -> in-memory 24-slot aggregation
     -> private Server Wallet preparation route
        -> build the 24-slot private witness and commitment
     -> D1 hourly operational summaries
     -> prepared private 24-slot artifact in R2
     -> one daily Proof Job

Managed Source Queue: attest-window
  -> private Server Wallet attestation route
     -> derive the source-specific Contract Authority
     -> load the registered policy assignment
     -> call submitDailyAttestation
     -> private Proof Server Container
     -> validate the exact allowlisted contract call
     -> add DUST, submit, and wait for Indexer confirmation
  -> D1 confirmed Proof Job
  -> existing public third-party verification API
```

Queue messages contain identifiers only. Connector credentials, source readings, private extrema,
nonces, and wallet secrets are never included in Queue messages or audit events.

## 4. Managed source registration

An authenticated administrator registers a managed source with:

- source ID, display name, Project, and registered Policy;
- adapter type and version;
- HTTPS endpoint and source-side sensor identifier;
- authentication type and credential;
- sensor type and unit;
- first operational date and fetch delay.

The service deterministically derives the internal proof-subject ID from the Project and source ID.
Registration creates a D1 Device mirror in `unregistered` state and queues an Operator-authorized
Midnight registration. The private Server Wallet derives the source-specific public Contract
Authority from `MANAGED_ATTESTOR_ROOT_SECRET`, then uses that public value and the Operator Authority
to author, prove, fund, and submit `registerDevice` and `registerPolicyAssignment`. No private Device
Authority is returned to the Worker. After both
transactions are confirmed, D1 is updated and the source becomes `active`.

Registration is idempotent. Repeating the same request returns the existing source. Reusing an ID
with different immutable configuration returns `409 Conflict`.

## 5. Fixed operational window

Each run processes exactly one operational date. Its interval is derived from the registered
assignment:

```text
periodStart = operationalPeriodStart(periodDate, timeZoneOffset, localDayStartHour)
periodEnd   = periodStart + 24 hours
range       = [periodStart, periodEnd)
```

The external caller cannot submit arbitrary timestamps. A scheduled run starts only after
`periodEnd + fetchDelayMinutes`. An explicit administrator test/backfill call accepts a
`periodDate`, never raw `from` and `to` timestamps.

The source API may return any number of samples within the bounded response size. A completed
24-hour interval does not require 1,440 samples. Missing hours become canonical `NO DATA` slots; an
empty but valid response becomes a 24-slot stopped-day attestation.

## 6. Source response processing

The `fixed-window-json-v1` adapter performs these operations in order:

1. Build the exact `from` and `to` query parameters and send an HTTPS GET with a bounded timeout.
2. Reject redirects and validate the HTTP result before reading the body.
3. Read no more than the configured response byte limit.
4. Validate the response schema and echoed source/range.
5. Validate every sample ID, timestamp, finite value, sensor identity, and unit.
6. Deduplicate identical sample IDs; reject conflicting duplicates.
7. Reject any timestamp outside `[periodStart, periodEnd)`.
8. Aggregate samples in memory into 24 hourly count/minimum/maximum/average summaries.
9. Send normalized records over the private Container binding so the Server Wallet can
   prepare the existing 24-slot witness and commitment without exposing the derived Contract
   Authority to the Worker.
10. Persist hourly summaries to D1 as non-public internal audit records, and store the prepared
    private 24-slot proof input in private R2 using AES-256-GCM authenticated encryption.
11. Create one deterministic Proof Job and enqueue its identifier.

Raw samples are not retained after aggregation. D1 count/minimum/maximum/average values are available
only to authenticated operations and managed-source administrators; they are not public proof output
and are never returned by the third-party verification API. The R2 artifact contains only the fixed 24 private
extrema slots, their counts, the commitment opening, and contract-bound metadata. It is deleted
after confirmed submission. Failed artifacts expire after seven days; deletion failures retain their
D1 reference so scheduled cleanup can retry safely.

## 7. Idempotency

The following stable identifiers guard each boundary:

| Boundary | Idempotency key |
| --- | --- |
| Source registration | `projectId + sourceId` |
| Operational run | `sourceId + periodDate` |
| Hourly summary | `deviceId + periodStart + periodEnd` |
| Proof Job | deterministic run ID |
| Contract attestation | `deviceCommitment + measurementGroupId` |

The D1 run is the source of workflow state. Queue delivery is at-least-once: a consumer claims the
expected state conditionally, acknowledges completed or obsolete messages, and retries only a
retryable state. An existing private artifact is reused after an interrupted attempt so a retry does
not create a new nonce or commitment. The contract remains the final duplicate-write guard.

## 8. State machines

### Managed source

```text
provisioning -> active -> paused
      |           |
      +-> action_required
```

### Operational run

```text
pending_fetch -> fetching -> proof_queued -> proving -> confirmed
                    |             |            |
                    +-> fetch_retry             +-> proof_retry
                    |                          |
                    +--------------------------+-> action_required / dead_lettered
```

Leases recover interrupted `fetching` and `proving` work. Fetch work has a two-minute lease. Before
registration or proof submission, the consumer probes the relevant authority Wallet and Sponsor Wallet for at most ten
seconds. An unsynchronized or unavailable Wallet does not consume an attempt: the row remains in a
retryable state and the Queue retries after 60 seconds. A Container mutation is capped at five
minutes and an interrupted claim is recoverable after six minutes, before the Queue Consumer's
platform wall-time limit. State updates always include an expected previous status so duplicate
consumers cannot own the same run concurrently.

## 9. Error handling matrix

| Condition | Classification | State and action |
| --- | --- | --- |
| DNS, connection, TLS, or timeout | transient | `fetch_retry`; exponential bounded retry |
| HTTP 408, 425, 429, or 5xx | transient | `fetch_retry`; respect bounded `Retry-After` |
| HTTP 401 or 403 | configuration | `action_required`; no automatic retry until credential update |
| HTTP 404 | configuration | `action_required`; verify endpoint/source ID |
| Redirect | security/configuration | `action_required`; endpoint must be registered explicitly |
| Response exceeds byte/sample limit | permanent data error | `action_required` |
| Invalid JSON or unsupported schema | permanent data error | `action_required` |
| Echoed source/range mismatch | permanent data error | `action_required` |
| Wrong sensor type or unit | permanent data error | `action_required` |
| Out-of-range timestamp or non-finite value | permanent data error | `action_required` |
| Identical duplicate sample | accepted | deduplicate and continue |
| Conflicting duplicate sample | permanent data error | `action_required` |
| Missing hour | accepted | emit canonical `NO DATA` slot |
| Empty valid day | accepted | prove 24 `NO DATA` slots |
| Queue duplicate | accepted | acknowledge from D1 state without repeating side effects |
| Proof Server unavailable/busy | transient | `proof_retry`; preserve private artifact |
| Authority or Sponsor Wallet unsynchronized | transient | do not enter the Container mutation; retry after 60 seconds without consuming an attempt |
| DUST unavailable | operational | `proof_retry` plus operations alert |
| Contract assignment changed/invalid | configuration | `action_required`; no altered threshold accepted |
| Measurement group already attested | idempotent recovery | resolve confirmed chain evidence instead of resubmitting |
| Midnight submission ambiguous | reconciliation | query Indexer by known transaction identity before retry |

Error responses and audit events contain stable error codes and redacted summaries. They never contain
authorization headers, connector tokens, response bodies, private extrema, or wallet material.

## 10. Managed page

`/managed-proof/` is independent from the existing review GUI. It provides:

1. Project and registered Policy selection.
2. Managed source and connector registration.
3. Registration status until the on-chain assignment is active.
4. Explicit test run for one operational date.
5. Fetch, validation, aggregation, proof, authority Wallet, Sponsor Wallet, and confirmation progress.
6. Redacted hourly summary visibility for the authenticated administrator.
7. A link to the existing public third-party verification result and Midnight Explorer.

Loading, empty, action-required, retrying, queued, and completed states are visually distinct.

## 11. Test strategy and acceptance

The deterministic counterpart service is specified in
[`mock_measurement_source_api.md`](../implementation/mock_measurement_source_api.md). Automated and
system tests cover:

- registration and on-chain assignment;
- one normal 1,440-sample day;
- missing samples and missing hours;
- an empty stopped day;
- within-threshold and outside-threshold outcomes;
- every error classification in section 9;
- duplicate registration, run requests, Queue messages, samples, and contract submissions;
- restart after private R2 persistence and after transaction submission;
- confirmed public lookup and third-party verification;
- unchanged existing browser review and Edge Device workflows.

Acceptance requires a real managed-source transaction confirmed on Preprod, a successful public
verification lookup, the repository test/typecheck/build suite, API SCT, and an operational Edge
Device regression run.

## 12. Deployment configuration

Create the dedicated Queue, DLQ, and private R2 bucket before deploying the Worker:

```bash
npm run cloudflare:resources:managed-attestation
```

Set independent 32-byte values for `MANAGED_ATTESTOR_ROOT_SECRET`,
`MANAGED_CONNECTOR_CREDENTIAL_KEY`, and `MANAGED_ARTIFACT_ENCRYPTION_KEY` in the ignored mode-`0600`
`.env`, or generate missing values once and keep that file as protected recovery material. Configure
those values and the existing `SPONSOR_WALLET_SEED` as Worker Secrets without printing them. The
single Wallet seed belongs only to `midnight-server-wallet`; the Compact authorization and encryption
secrets remain cryptographically independent:

```bash
npm run cloudflare:config:managed-attestation -- --generate
npm run cloudflare:deploy
```

Do not regenerate the Managed Attestor root after registering a source: the source-specific
Contract Authorities are deterministically derived from it. Rotating either secret requires an
explicit migration procedure; a normal Worker deployment leaves existing Worker Secrets unchanged.

## 13. Preprod acceptance evidence

This section preserves the first six-circuit acceptance run and then records the current eight-circuit
deployment. Historical and current transactions remain separate evidence.

The complete Managed API path was exercised on 2026-09-03 JST with Compact toolchain `0.31.1`,
Proof Server `8.1.0`, Wallet SDK `1.2.0`, Midnight.js `4.1.1`, Wrangler `4.127.0`, and Gateway
version `9cf41713-9bfd-4c7c-9f12-289b0252169d`.

| Evidence | Measured result |
| --- | --- |
| Source registration | Device and Policy Assignment confirmed in 67.318 s |
| Fixed-window fetch | HTTP 200, 115,047 bytes, 1,440 records |
| Aggregation | 24 observed hours, 60 records per hour, no stopped slots |
| Proof Server | Started on demand; the primary `/prove` call completed in 45.667 s |
| Proof generated | 2026-09-03 01:08:40.250 JST |
| Midnight confirmed | 2026-09-03 01:09:11.230 JST, block 2,375,455 |
| Sponsored fee | 703,370,000,000,001 specks |
| Repository verification | 6 Compact circuits and 417 automated tests passed; all type checks, builds, and Wrangler dry-run passed |

The confirmed Proof Job is
`proof-b7cce717a5a6d8d3ed30fbcb610dfcce520ded59d74a640cca4648ddbdc3890c`.
Its transaction hash is
[`7464966f8ecbcd9088564e8ec1d8e130fa240795fc4d68496109a49d375b49a7`](https://preprod.midnightexplorer.com/transactions/7464966f8ecbcd9088564e8ec1d8e130fa240795fc4d68496109a49d375b49a7).
The TX-hash-only English verifier completed all four ledger checks and all five UI pipeline stages.
Its browser resource trace contacted the public Preprod Indexer and made no D1-backed API request.
The public response contained 24 hourly results, Policy, Assignment, commitment, transaction, and
block evidence; it contained no raw readings, hourly extrema, nonce, connector credential, or Wallet
secret.

Two deployment-specific correctness requirements were confirmed during this run. D1 audit triggers
contribute their writes to `meta.changes`, so guarded Queue claims accept any positive change count.
Also, a public source hosted by another Worker in the same Cloudflare zone requires Cloudflare's
documented [`global_fetch_strictly_public`](https://developers.cloudflare.com/workers/runtime-apis/fetch/)
compatibility mode (or a Service Binding); the Gateway uses the public mode because registered
customer endpoints are arbitrary public HTTPS APIs.

The bounded-recovery change was deployed as Gateway version
`dc5f990d-9943-4242-8066-21a55645aab9` and then exercised by the next scheduled day without a
manual Run request or retry. Cron created the 2026-09-02 UTC Run at 09:15:54 JST. Fetch succeeded on
attempt 1 at 09:15:59 with the same 115,047-byte/1,440-record response; proof attempt 1 generated the
ZKP at 09:16:55 and confirmed the transaction at 09:17:20 in block 2,380,338. No Managed Run was left
outside `confirmed`, and no operations alert remained open.

The autonomous Run's Proof Job is
`proof-de93c256b03322e49702ba144d0628814c5b1bf59284ae2131e1256dad0b332b`. Its transaction hash is
[`42e77f4e65ee03fe634feffdbba634e9099b220f55ed0b1de0a66391f718b12d`](https://preprod.midnightexplorer.com/transactions/42e77f4e65ee03fe634feffdbba634e9099b220f55ed0b1de0a66391f718b12d),
the sponsored fee was 704,620,000,000,001 specks, and the transaction size was 9,371 bytes. The
TX-hash-only verifier again completed all four ledger checks; its resource trace contacted the
public Preprod Indexer and no D1 API.

### 13.1 Current eight-circuit acceptance

The eight-circuit Contract was deployed on 2026-09-03 JST at
`48636e2f7ae8b1705134b026ec0d5a910357cac990a60adce2c2672e1a78a732` in deployment transaction
[`00ea92883cba9ff8b753a3308d6d2127ac3f81c2643f09840a449588197a32cbdf`](https://preprod.midnightexplorer.com/transactions/00ea92883cba9ff8b753a3308d6d2127ac3f81c2643f09840a449588197a32cbdf).
The consolidated `midnight-server-wallet` then completed two 1,440-reading paths:

- Managed API TX [`35b8a83050d910ae94862be565c718b09764e51fd69979eaff1ed3dee93bb532`](https://preprod.midnightexplorer.com/transactions/35b8a83050d910ae94862be565c718b09764e51fd69979eaff1ed3dee93bb532), block 2,385,826, published OUTSIDE with 24 observed hours and two outside slots.
- Authenticated Device TX [`7e93c537e85dbc16892716429b0f426e731999775b0cef460bd4b0d358c42b40`](https://preprod.midnightexplorer.com/transactions/7e93c537e85dbc16892716429b0f426e731999775b0cef460bd4b0d358c42b40), block 2,385,898, published WITHIN with 24 observed hours.

On 2026-09-05 JST, the separately deployed public Verification MCP resolved both hashes from the
public Preprod Indexer and completed all five current ledger checks without D1 or private inputs.
Implementation baseline `af90ad8` compiled all 8 circuits and passed all 496 automated tests, type
checks, builds, API/GUI SCT, Wrangler dry-runs, and portability checks.
