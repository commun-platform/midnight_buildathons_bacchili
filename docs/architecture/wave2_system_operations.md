# System Operations Console and Wave 2 Hardening

[日本語版](../ja/architecture/wave2_system_operations.md)

Status: the read-only console, audit trail, metrics, Discord notifications/receipts, and private
Support MCP are implemented. Wave 2 completes production role/tenant isolation, validates thresholds
under partner load, and adds audited recovery controls and longer-term log retention where required.

## 1. Purpose

The System Operations Console gives authorized support and operations staff enough evidence to
answer three questions without opening deployment tools:

1. Is the Sponsor Wallet synchronized and able to pay DUST now?
2. Where are registration, proof, and sponsored-transaction requests waiting or failing?
3. Which pseudonymous Wallet or Device initiated a customer use-case operation, and which requests,
   jobs, and outcomes belong to the same operation?

It is a read-only application on a separately protected route. Cloudflare Access authenticates the
operator before the page and API execute. The Worker also fails closed when the validated Access
context is absent.

## 2. Information model

### 2.1 Live Sponsor Wallet status

The overview reads the Container health contract and displays:

- phase: starting, synchronizing, waiting for funding, registering DUST, ready, or error;
- supervisor status, Wallet-process liveness, health freshness, probe failures, and last successful
  probe;
- shielded, unshielded, and DUST `applied`, `highest`, block lag, connection, and completion state;
- the actual DUST balance converted from specks (`1 DUST = 10^15 specks`), the latest sponsored-TX
  fee recorded by the Worker, and an estimated remaining transaction count calculated from them;
- spendable, pending, and total DUST UTXO counts as diagnostics only (a UTXO count is not a DUST
  amount);
- initialization timestamps and the current boot identifier;
- encrypted R2 checkpoint size, update time, source, phase, and saved block progress.

The page polls live status every 30 seconds. D1 stores a health history only when the classified
state changes or when an hourly healthy heartbeat is due. This retains incident evidence without a
write every minute.

### 2.2 Processing state

D1 is the authoritative source for application workflow state. The console groups current counts and
the oldest waiting time for:

- Proof Jobs;
- sponsored transaction jobs;
- Device registration operations; and
- Threshold Policy registration operations.

Proof Server status is inferred from the current Proof Job lifecycle and its last successful proof.
Opening the console does not wake an otherwise idle Proof Server Container.

Each active sponsored-transaction Job also exposes its persisted `sponsorStage`,
`sponsorReasonCode`, `sponsorStageUpdatedAt`, elapsed stage time, attempt count, lease, and next retry
time. Long operations write their stage before starting, so the console distinguishes Wallet checks,
synchronization or funding waits, checkpoint persistence, DUST balancing and fee proving, Midnight
submission, confirmation, automatic retry, and an interrupted Queue invocation. A page reload reads
the same fields from D1; the browser is an observer and does not own the retry.

Container-to-R2 checkpoint streaming has a 60-second end-to-end deadline, Sponsor preparation has a
10-minute deadline, and submission has a 5-minute deadline. These deadlines leave time to persist a
specific failure before the Queue consumer's 15-minute wall-time limit. The scheduled path marks a
request interrupted after that platform limit and reclaims a no-artifact request after 16 minutes.
A request with any Sponsor artifact is never reclaimed by this path.
Pre-DUST Wallet-check and checkpoint stages have an additional two-minute watchdog because they
cannot have spent DUST; this recovers an invocation even when a Container RPC ignores request
cancellation.
The transaction path freezes the latest independently uploaded encrypted R2 checkpoint as its
pre-DUST recovery point without making an R2 request itself. It does not synchronously request a new
Container checkpoint or copy the multi-megabyte R2 object. Scheduled, periodic, and graceful-shutdown
checkpoint updates are skipped while a retryable or active Sponsor reservation exists. The baseline
may advance again after submission or an explicit release. This keeps checkpoint I/O off the Queue
transaction path while retaining a restart point from before DUST was reserved.

### 2.3 Daily metrics

The metrics API aggregates the last 7 to 90 UTC days directly from D1. The default chart is 30 days
and contains:

- Devices registered on Midnight;
- Proof Jobs accepted;
- ZK proofs generated;
- sponsored transactions submitted;
- failed or dead-lettered Proof Jobs;
- hourly measurement windows accepted; and
- sensor samples represented by those windows.

Zero-value days are returned explicitly so charts do not imply missing telemetry.

### 2.4 Customer use-case API trace

Every state-changing customer use-case API request receives a server-generated `requestId`. The
browser creates one `clientOperationId` at the start of a user action and passes it to every API call
made by that action. This connects, for example, one Policy action to its challenge and registration
requests, and one daily measurement action to its hourly-window and anomaly requests.

The audit event stores only:

- timestamp, method, normalized route, HTTP status, outcome, and duration;
- `requestId` and validated `clientOperationId`;
- actor type and stable actor identifier: Wallet public-key SHA-256, Device ID, or anonymous/system;
- Project, Device, Proof Job, or operation identifier available from authenticated state or the route;
  and
- a bounded error code when applicable.

Authorization headers, Session tokens, signatures, request/response bodies, Raw values, private
openings, private keys, Wallet addresses, and Sponsor secrets are never copied to the audit tables.
Read-only polling APIs are excluded; failed authentication and state-changing requests remain
traceable.

## 3. Screens

### 3.1 Overview

The header shows environment, generated time, auto-refresh state, and the authenticated operator.
Four summary cards show overall health, Sponsor Wallet phase, pending work, and failures in the last
24 hours. A stale-data warning replaces a healthy label when live data is older than its expected
refresh interval.

### 3.2 Wallet synchronization

Three progress rows visualize shielded, unshielded, and DUST synchronization. Each row displays
`applied / highest`, lag, connected state, and completion. Initialization, supervisor, balance, and
R2 checkpoint evidence are grouped below the progress rows. Recent health transitions are shown
newest first.

### 3.3 Processing and daily volume

Workflow cards expose status counts and oldest pending age. A multi-series daily chart separates
Device registration, Proof acceptance, ZKP completion, sponsored submission, and failure volume. A
secondary table shows measurement-window and represented-sample volume without exposing values.

### 3.4 Audit trail

The audit table is newest first and filterable by actor identifier, category, action, outcome,
Project, and Device. Each row shows time, actor, action, target, outcome, HTTP status, and correlation
identifier. A details panel exposes the complete safe identifiers needed by customer support.

Loading, refreshing, empty, stale, unauthorized, and failed states have distinct visual treatments.
The page keeps the last successful snapshot visible while a refresh is in progress.

## 4. Storage and retention

Migration `0023_system_operations.sql` owns five bounded datasets:

- `operational_events`: redacted API, asynchronous workflow, and health events;
- `system_health_snapshots`: state transitions plus hourly heartbeat records; and
- `system_component_state`: the latest classified component state used for deduplication;
- `operations_alert_state`: the current open or resolved state of each alert; and
- `operations_notification_outbox`: idempotent Discord delivery work and Sponsor receipts.

Migration `0024_sponsor_processing_progress.sql` adds the persisted Sponsor stage, reason, and stage
timestamp to `daily_proof_jobs` so an interrupted invocation remains diagnosable after reload or
deployment.

Online retention is 90 days for events, health snapshots, and completed notification delivery
records. Cleanup runs from the existing scheduled Worker path and does not block customer requests.
Cloudflare structured Workers Logs remain the lower-level diagnostic source; the D1 trail is the
stable customer-support view.

## 5. Alerting and Discord delivery

The dashboard shows the deployed thresholds before they are used for paging. The scheduled Worker
evaluates and deduplicates these conditions:

- Sponsor Wallet unavailable;
- block lag remains above the configured limit, or an incomplete synchronization channel remains
  disconnected (including a stuck `0/0` state), while applied synchronization progress remains
  unchanged for the full Wallet grace period;
- estimated remaining sponsored transactions, calculated as actual DUST balance divided by the
  latest completed sponsored-TX fee, reach the low-funds limit;
- Proof or Sponsor work remains above both its count and age limits; and
- Proof API rate-limit responses exceed the five-minute limit.

The initial deployment policy is intentionally explicit and can be changed without a code change:

| Signal | Initial threshold |
|---|---:|
| Estimated sponsored-TX capacity | 1 transaction or less |
| Wallet synchronization | 250-block lag or an incomplete disconnected channel |
| Wallet notification grace | 5 continuous minutes |
| Proof backlog | 8 jobs with the oldest waiting at least 10 minutes |
| Sponsor backlog | 16 jobs with the oldest waiting at least 10 minutes |
| Proof HTTP 429 | 5 responses in 5 minutes |
| Open-alert reminder | 60 minutes |

`starting` and progressing `syncing` are expected states for an intermittently started Wallet and do
not create Discord incidents. A synchronization-stalled alert opens only when the Wallet remains
unsynchronized and its applied synchronization progress has not changed for five minutes. DUST
capacity is evaluated only after the Wallet reaches `ready` or `waiting-for-funding`, so incomplete
startup balances do not create low-DUST notifications. Complete Wallet unavailability and a real
low-DUST condition retain the five-minute notification grace. Recovery within a notification grace
period produces neither an open nor a recovery notification. Other alerts remain immediate. A
notified alert produces bounded reminders while it remains open and one recovery notification. The
Worker writes these intentions transactionally to the D1 Outbox. Pending or retrying open
notifications are cancelled when the condition recovers, so stale incidents are not delivered
afterward. Discord delivery is therefore outside customer request latency, retries with backoff, and
reclaims a delivery lease left behind by an interrupted Worker.

Discord messages are delivered in Japanese and lead with one operator decision: `対応不要`, `要監視`,
or `対応必要`. Each message contains a concise cause, a recommended next action, and a direct link to
the relevant Cloudflare Containers, Queues, or Observability page. Recovery notices are always
`対応不要`.

The first transition of a Proof Job to `submitted` or `confirmed` also creates one idempotent Sponsor
receipt. Its Discord embed contains the pseudonymous Wallet fingerprint when available, Project,
Device, measurement day, Proof Job, transaction hash and block, actual DUST fee, current Sponsor
Wallet phase and synchronization lag, remaining DUST, and estimated transaction capacity. A valid
Preprod transaction hash links directly to Midnight Explorer. It does not contain a Wallet address,
authorization value, signed transaction bytes, private measurement, or secret.

`DISCORD_WEBHOOK_URL` is read only by the configuration command from the ignored root `.env`, then
written to Cloudflare as a Worker Secret:

```bash
cp .env.example .env
# Set DISCORD_WEBHOOK_URL in .env.
npm run cloudflare:config:discord
```

The URL is validated as an HTTPS Discord webhook and is never printed, stored in D1, placed in
`wrangler.jsonc`, or returned by the management API. The API exposes only whether notification is
configured and aggregate Outbox states.

Existing automatic recovery remains active: the scheduled warmup restores Wallet state, the Wallet
supervisor restarts failed processes, stale Sponsor jobs are reclaimed, and Queue messages retry.
Automatic recovery does not suppress incident reports after the notification grace period.

## 6. API

```text
GET /system-operations/                         Access-protected console
GET /api/v1/system-operations/overview          live health and workflow counts
GET /api/v1/system-operations/metrics?days=30   UTC daily aggregates, 7-90 days
GET /api/v1/system-operations/events             paginated redacted audit events
GET /api/v1/proof-jobs/:proofJobId                Device-authenticated Job status and Sponsor reason
```

All responses use `Cache-Control: no-store` and include a request identifier. The APIs are read-only.

Customer-support automation reads a redacted subset of this operational state through the separate
`midnight-support-mcp` Worker. That Worker is protected across its entire hostname and is never
mounted below this public Proof Gateway. See [MCP security boundary](mcp_security_boundary.md).

### 6.1 Cloudflare Access deployment requirement

The Worker intentionally returns `403` until a matching Access application authenticates the
request. Configure a self-hosted Access application with both protected paths on the deployed
hostname:

```text
/system-operations/*
/api/v1/system-operations/*
```

Attach an explicit Allow policy for the approved operations identities or IdP group. Do not protect
the whole Worker destination because the judge-facing verification portal and public verification
APIs must remain reachable. Creating this external policy requires `Access: Apps and Policies Write`;
the standard Wrangler Worker deployment token does not provide that authority. Validate one allowed
identity, one denied identity, and an unauthenticated API request after the policy is enabled.

## 7. Acceptance criteria

- Missing Cloudflare Access context returns `403` for both the page and management APIs.
- Sponsor Wallet block progress, supervisor freshness, funds, and R2 checkpoint evidence are visible.
- Queue-backed workflow counts and the oldest waiting item are visible without starting the Proof
  Server.
- Daily Device, Proof, ZKP, sponsored-TX, failure, measurement-window, and sample counts render for a
  selectable period.
- State-changing customer UC calls can be searched by Wallet fingerprint, Device ID, `requestId`, or
  `clientOperationId`.
- Alert thresholds, active incidents, Discord configuration state, and Outbox delivery state are
  visible before paging is enabled.
- Sponsor Wallet use produces exactly one receipt per Proof Job even when Queue delivery is repeated.
- Wallet synchronization, low DUST, processing backlog, and Proof API overload alerts are retried,
  deduplicated, and followed by a resolved notification.
- Tests prove that audit records cannot contain authorization values, signatures, Raw values, or
  request bodies.
