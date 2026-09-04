# Harden the attestation service across browser, Cloudflare, and Midnight boundaries

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `.agents/PLANS.md` from the repository root. It is self-contained: a contributor with only this repository and this file should be able to understand the security objectives, implement each milestone, and prove the result.

## Purpose / Big Picture

The service accepts daily temperature measurements, reduces them to 24 hourly extrema, generates a zero-knowledge proof, pays the Midnight transaction fee from a Sponsor Wallet, and publishes a verifiable attestation. It also has a managed mode that fetches measurements from a registered customer API. The current proof protects the values used inside the proof, but several surrounding control-plane boundaries need stronger guarantees before the managed mode is suitable for production.

After this change, an authenticated system operator can access only projects granted to that identity, browser-forged cross-site requests cannot mutate managed-source configuration, every sensitive operator API request is attributable, private managed proof input is encrypted before R2 storage and expires, dead-lettered queue deliveries become visible and actionable, Server Wallet scheduling fails closed when its configuration cannot be read, policy assignments cannot overlap for the same device and sensor, and the on-chain Operator Authority can be rotated. Wallet operations are consolidated into one private `midnight-server-wallet` Container to avoid paying for three synchronized Wallet runtimes; the Operator and Managed Attestor Compact secrets remain independent even though process isolation is intentionally not claimed.

The security claims remain deliberately narrow. The service proves statements about the measurements it received. Managed API mode does not prove that the upstream customer API or physical sensor was truthful. Minimum, maximum, and average values stored in D1 are internal audit information and are not public proof output. The Browser simulated-device path is a judging and demonstration feature; its non-extractable P-256 key, Compact secret, and raw readings may remain in IndexedDB and are not the production storage model.

## Progress

- [x] (2026-09-03 03:16Z) Reviewed the current dirty worktree, repository boundaries, Cloudflare bindings, managed-source schema, Access authentication, request audit path, queue routing, Sponsor schedule, and Compact contract.
- [x] (2026-09-03 03:16Z) Recorded the agreed trust claims, risk decisions, migration sequence, recovery rules, and acceptance gates in this ExecPlan.
- [x] (2026-09-03 04:18Z) Added project-scoped system-operator roles, Access-principal attribution, and one-hour principal-bound CSRF protection to the managed administration API and UI.
- [x] (2026-09-03 04:18Z) Added AES-256-GCM managed-artifact envelopes, immediate confirmed cleanup, bounded seven-day failure retention, and non-public D1 audit aggregates.
- [x] (2026-09-03 04:18Z) Added consumers for all three configured dead-letter queues with durable deduplication and Japanese operations alerts.
- [x] (2026-09-03 04:18Z) Made Sponsor Wallet operating-schedule lookup fail closed when D1 is unavailable or invalid.
- [x] (2026-09-03 04:18Z) Added on-chain Assignment stream ordering, explicit closure, historical-period checks, and recoverable Operator Authority rotation; Compact 0.31.1 compiles all eight circuits and 18 simulator tests pass.
- [x] (2026-09-03 04:18Z) Prototyped separate Sponsor, Fleet Authority, and Managed Attestor Container process roles and verified the allowlisted transaction handoff.
- [x] (2026-09-03) Superseded the three-runtime prototype with one private `midnight-server-wallet` runtime at the user's direction to reduce Container and repeated Wallet synchronization cost. One Wallet seed funds all transactions; Operator and Managed Attestor authorization remain separate Compact secrets, and all Wallet mutation is serialized.
- [x] (2026-09-03 09:35Z) Aligned canonical English/Japanese security and architecture guidance, passed the final 450-test repository gate, passed the 225-Worker/49-Server-Wallet API SCT, passed 22 GUI SCT checkpoints, and applied migrations through `0034` locally and remotely.
- [x] (2026-09-03 10:47Z) Replaced the fixed Sponsor Wallet operating window with 24-hour admission and a daily processing-start cutoff. Added Worker-compatible SHA-256/BIP-340 admission verification, retained official-runtime verification inside the Server Wallet, and added migration `0035`.
- [x] (2026-09-03 04:53Z) Added immutable D1 Policy/Assignment audit mirrors, contract-scoped Assignment streams, current-contract query filters, idempotent closed-Assignment synchronization, fresh deployment-ID preflight, and local preservation of superseded deployment records.
- [x] (2026-09-03 09:34Z) Applied remote migrations and independent secrets, deployed the incompatible Preprod contract and consolidated Worker, removed the three superseded Wallet applications, and completed live Browser, managed API, and Device E2E regression evidence. Restored the cost-optimized Server Wallet profile after testing.

## Surprises & Discoveries

- Observation: the repository has already been reorganized beyond the older `apps/` paths in `AGENTS.md`; deployed Cloudflare code now lives below `backend/cloudflare`, browser code below `frontend`, and Compact code below `midnight`.
  Evidence: `backend/cloudflare/deployment/wrangler.jsonc` points to `../proof-gateway-worker/src/index.ts`, `../sponsor-wallet-container/Dockerfile`, and `../../../frontend/verification-portal/public`.

- Observation: the managed-source feature and Sponsor operating-hours feature are present as uncommitted work, including migrations `0027` and `0028`. They must be treated as the implementation baseline rather than replaced.
  Evidence: `git status --short` lists both migrations and the managed-source Worker, UI, tests, mock API, and operating-hours documentation as new or modified files.

- Observation: Cloudflare Access verifies identity, but `SystemOperatorPrincipal` currently drops the verified email and no database grant is checked. Every Access-authenticated operator can therefore see and mutate every managed source.
  Evidence: `handleManagedSourcesApi` calls `authorizeSystemOperator` once and subsequently queries `managed_sources` without a project predicate.

- Observation: normal request auditing skips all GET requests and resolves actors only from Browser or Device Bearer sessions. Managed administration mutations authenticated by Cloudflare Access are recorded as anonymous.
  Evidence: `prepareRequestAudit` returns `null` for GET and `requestActor` returns anonymous when no Bearer token exists.

- Observation: the operational Compact contract accepts a caller-selected assignment identifier. It validates that the selected assignment belongs to the device and period, but it does not prevent two assignments from covering the same device, sensor type, and period.
  Evidence: `registerPolicyAssignment` checks assignment-ID uniqueness, while `submitDailyAttestation` loads whichever assignment ID the caller supplies.

- Observation: each Midnight Wallet process must synchronize and retain its own Wallet state. Splitting three logical roles into three Containers therefore multiplies both Container runtime and initial chain-replay work.
  Evidence: the earlier Wrangler configuration created three Wallet applications with independent Wallet seeds and checkpoints; the consolidated configuration creates one `ServerWalletContainer` and one encrypted checkpoint.

- Observation: the persistent D1 mirror contains confirmed records from multiple superseded contract deployments. Assignment overlap checks that ignore contract address block a safe replacement deployment, while queries that ignore the Device's current contract can select stale administration evidence.
  Evidence: the migration preflight found multiple public `contract_address` values in `devices` and `policy_assignments`; local tests then exercised current-contract filters and additive migrations `0033` and `0034`.

## Decision Log

- Decision: preserve D1 minimum, maximum, and average aggregates for audit, but classify them as non-public internal data.
  Rationale: operators need enough evidence to investigate processing incidents, while third parties need only the public policy, commitment, hourly pass/fail result, proof, and transaction reference. Public and third-party endpoints must not serialize these private aggregates.
  Date/Author: 2026-09-03 / User and Codex.

- Decision: do not claim source authenticity for managed API mode.
  Rationale: HTTPS, connector credentials, transformations, commitments, and a ZK proof show what this service received and processed; they do not establish that the upstream API or physical source told the truth. A stronger provenance claim requires a future signed-source or trusted-hardware design.
  Date/Author: 2026-09-03 / User and Codex.

- Decision: accept IndexedDB storage for the Browser simulated-device flow and label that flow as demonstration-only in architecture and security documentation.
  Rationale: the Browser flow is not the production Device or managed API path. Expanding this hardening effort into browser secure storage would add complexity without improving the production trust boundary.
  Date/Author: 2026-09-03 / User and Codex.

- Decision: store system-operator authorization grants in D1, keyed by verified Cloudflare Access identity, role, and optional project.
  Rationale: Access proves who the user is, while D1 determines what that user may do. This makes least-privilege changes auditable and avoids hard-coding every future customer project into the Worker or Access application.
  Date/Author: 2026-09-03 / Codex.

- Decision: use a one-hour, principal-bound CSRF token issued by the managed bootstrap endpoint and require same-origin JSON mutations.
  Rationale: Cloudflare Access authentication cookies can be sent by a browser independently of application JavaScript. A random token stored only in the page's memory and as a SHA-256 digest in D1 proves that the mutating request came from the loaded administration UI. Exact Origin and JSON content-type checks close simple form and cross-origin request paths before business writes occur. Reusing the token within its short lifetime avoids concurrent-tab failures and a D1 write for every mutation; expiry and logout end its validity.
  Date/Author: 2026-09-03 / Codex.

- Decision: encrypt the entire managed private artifact with AES-256-GCM before writing it to R2, using a dedicated key unrelated to connector credentials or attestor identity.
  Rationale: R2 encryption at rest protects infrastructure media, but application-level authenticated encryption also limits accidental exposure through bucket tooling and detects ciphertext or metadata tampering. Associated authenticated data binds the ciphertext to its object key, source, run, period, schema, and key version.
  Date/Author: 2026-09-03 / Codex.

- Decision: immediately delete private artifacts after confirmed submission and expire artifacts retained for retry or investigation after seven days.
  Rationale: proof retries need private input for a bounded period, but terminal failures must not retain raw transformed measurements indefinitely. Scheduled cleanup is idempotent and records deletion failure without exposing data.
  Date/Author: 2026-09-03 / Codex.

- Decision: consume all three Cloudflare dead-letter queues and persist only sanitized identifiers and error metadata.
  Rationale: an unconsumed dead-letter queue is temporary infrastructure storage rather than a durable operations record. D1 provides deduplication and support visibility, while private proof input and serialized transactions remain in their designated protected stores.
  Date/Author: 2026-09-03 / Codex.

- Decision: force Sponsor Wallet availability to closed when the operating schedule cannot be read.
  Rationale: silently reverting to always-on increases cost and violates the operator's explicit schedule. Queued jobs can wait safely; an operations alert tells an administrator to restore D1 access.
- Decision: configure one daily processing start instead of fixed operating hours.
  Rationale: a cutoff prevents post-start arrivals from keeping the stateful Wallet alive. D1 dependency states release Policy, Device/Assignment, proof, and sponsored submission work in order; the single named Wallet runtime processes prior-day backlog first and stops after the eligible backlog drains.
- Decision: verify Browser Wallet admission signatures in the Worker with SHA-256 plus audited BIP-340/Secp256k1 code, and verify them again in the Server Wallet with Midnight's official runtime.
  Rationale: the official runtime's generated WASM initializer is rejected by the Workers runtime, while its documented k256 behavior is interoperable with the Workers-safe verifier. Defense-in-depth keeps the authoritative on-chain operation behind the official implementation.
  Date/Author: 2026-09-03 / Codex.

- Decision: enforce non-overlapping policy assignments on chain with a latest-assignment index, explicit assignment closure, and monotonically increasing assignment versions.
  Rationale: a caller must not be able to choose between two valid thresholds for one device and sensor period. Closed historical assignments remain usable for delayed daily attestations whose period falls inside the historical interval.
  Date/Author: 2026-09-03 / Codex.

- Decision: add one-step Operator Authority rotation gated by the current private Operator secret and a monotonically increasing public version.
  Rationale: the contract currently seals the authority forever. One-step replacement matches the existing Device authority rotation model and gives the deployed system an operational recovery path without preserving a stale authority.
  Date/Author: 2026-09-03 / Codex.

- Decision: consolidate fee sponsorship, fleet administration, and managed attestation into one private Server Wallet runtime.
  Rationale: separate Wallet processes each incur Container and synchronization cost. The Wave 1/2 service uses one Wallet SDK instance and one synchronized checkpoint, while keeping `OPERATOR_AUTHORITY_SECRET` and `MANAGED_ATTESTOR_ROOT_SECRET` cryptographically distinct. This is a deliberate cost-versus-blast-radius tradeoff; the design does not claim process isolation between these authorities.
  Date/Author: 2026-09-03 / User and Codex.

- Decision: preserve superseded on-chain administration as immutable D1 audit history, scope Assignment streams by contract, and require new Policy and Assignment IDs for a replacement contract.
  Rationale: deleting old evidence is unnecessary, but reusing a D1 primary identifier would rewrite the contract address attached to confirmed evidence. A deployment preflight now rejects collisions before consuming proof time or DUST, and operational queries select only records matching the Device's current contract.
  Date/Author: 2026-09-03 / Codex.

## Outcomes & Retrospective

The final consolidated implementation gate passed 450 tests: 4 mock-source, 20 shared, 18 contract, 75 Browser, 5 development CLI, 6 Device Identity, 16 collector, 32 Device transaction-agent, 225 Worker, and 49 Server Wallet tests. Compact 0.31.1 compiled eight circuits, every configured Workspace type check passed, the Worker deployment dry-run passed, and all 22 rendered GUI checkpoints passed.

The deployed runtime now has exactly two Container applications: one `standard-2` Proof Server and one `standard-4` `midnight-server-wallet`, each limited to one instance. The previous `midnight-sponsor-wallet`, `midnight-fleet-authority`, and `midnight-managed-attestor` applications and their Durable Object namespaces were removed only after the new Server Wallet restored successfully. Wallet initialization restored the existing encrypted R2 checkpoint in 39.196 seconds. The retained R2 bucket name `midnight-sponsor-wallet-state` is a storage compatibility name, not a running application.

Managed API E2E registered a managed Device and assigned its policy through the consolidated Server Wallet. The registration request completed in 75.308 seconds. A 1,440-sample mock API day covering all 24 hours generated its proof in approximately 58.0 seconds and reached confirmed Preprod state approximately 78.9 seconds after proof processing began. Transaction `35b8a83050d910ae94862be565c718b09764e51fd69979eaff1ed3dee93bb532` was confirmed in block `2385826`. The Browser third-party verifier independently queried the public Preprod indexer, matched the contract, policy, Assignment, and transaction, displayed the hourly threshold result, and did not disclose the private measurements.

Authenticated Device regression prepared 1,440 one-minute measurements, reduced them to 24 hourly extrema, generated the proof in 58.792 seconds, and completed the sponsored submission in 272.422 seconds from API submission through confirmation. Transaction `7e93c537e85dbc16892716429b0f426e731999775b0cef460bd4b0d358c42b40` was confirmed in block `2385898` with a fee of `0.703470000000001` DUST. The Device held no DUST and did not synchronize a fee Wallet. After E2E completion, the Server Wallet was returned from the temporary always-on test profile to cost-optimized scheduled processing.

The cost-relevant Wallet footprint changed from one `standard-4` Sponsor Wallet plus two `standard-2` authority Wallets to one `standard-4` Server Wallet. This removes two synchronized Wallet runtimes while retaining distinct Compact authorization secrets. The tradeoff is a larger process blast radius, explicitly accepted for this cost-optimized stage; transaction shape validation, private routing, and serialized Wallet mutations remain enforced.

## Context and Orientation

The repository is an npm-workspaces monorepo. `frontend/verification-portal/public` is the static browser application served by the Cloudflare Worker. The existing judging flow and the new managed-source flow are separate pages so production-oriented changes do not disturb the Wave 1 judging experience.

`backend/cloudflare/proof-gateway-worker/src/index.ts` is the Worker entry point. It receives HTTP requests, scheduled events, and Cloudflare Queue batches. `api.ts` routes managed-source requests to `managed-sources.ts`. `system-operations-auth.ts` verifies Cloudflare Access identity. `operations-audit.ts` writes API and workflow evidence into D1. `operations-notifications.ts` evaluates health and posts Japanese Discord notifications. `sponsor-operating-window.ts` reads the D1 operating schedule.

`backend/cloudflare/d1-schema/migrations` contains additive SQLite migrations applied to Cloudflare D1. Migration `0027_managed_api_attestation.sql` defines managed API source and run records. Migration `0028_sponsor_wallet_operating_schedule.sql` defines the operating-hours control. This plan adds `0029` through `0034`; existing migrations must never be edited after they may have been applied remotely. Migrations `0033` and `0034` keep the D1 mirror immutable, allow idempotent closure synchronization, and scope retained Assignment streams to their deployed contract.

`backend/cloudflare/deployment/wrangler.jsonc` binds D1 as `DB`, private managed artifacts in R2 as `MANAGED_SOURCE_DATA`, the Server Wallet checkpoint in R2 as `SPONSOR_STATE`, three normal queues and their three dead-letter consumers, one Proof Server Container, and one Server Wallet Container. A dead-letter queue is a Cloudflare Queue that receives a delivery only after normal retries are exhausted.

`backend/cloudflare/sponsor-wallet-container` implements the private `midnight-server-wallet` process. It receives `SPONSOR_WALLET_SEED`, `OPERATOR_AUTHORITY_SECRET`, and `MANAGED_ATTESTOR_ROOT_SECRET`; it creates one Wallet SDK instance, restores one encrypted checkpoint, and serializes sponsor, registration, policy, and attestation mutations. The Proof Server is a separate process and remains independently scalable.

`midnight/contracts/sensor-registry/src/sensor-registry.compact` defines the public Device registry, threshold policies, policy assignments, and daily attestation records. Witness functions provide private Operator and Device/attestor secrets to the zero-knowledge circuits. Generated files under `src/managed` are compiler output and must not be hand-edited.

A ZK proof in this system proves that the committed private hourly extrema satisfy the public policy and that the caller knows the required authority secret. It does not prove where an API response or physical measurement originated. A commitment is a public cryptographic digest that binds the system to private input without disclosing that input.

## Plan of Work

Milestone 1 hardens the managed administration API before changing storage or chain behavior. Add migration `0029_system_operator_security.sql` with `system_operator_grants` and `system_operator_csrf_tokens`. Grants store a normalized Access email or stable Access subject, a `viewer` or `operator` role, and either one project or the global marker. Seed `support@commun-platform.com` as a global operator because that is the currently approved administrator. Tokens store only a SHA-256 digest, the verified principal identifier, and an expiry. Extend `SystemOperatorPrincipal` with verified normalized email and subject information. Add an authorization module that resolves grants, filters every project/source/run read, and requires the operator role for create, update, run, and retry mutations.

The managed bootstrap response issues a random CSRF token after authorization. The browser keeps it in memory and includes `X-CSRF-Token` on every mutation. Before parsing JSON or touching D1 business records, the Worker requires `Content-Type: application/json`, an Origin exactly matching the request URL origin, and a valid unexpired principal-bound token. Tests must reject cross-origin requests, absent or malformed JSON content types, missing or expired tokens, tokens issued to another principal, insufficient roles, and cross-project identifiers.

Extend operations auditing so Access-authenticated managed API traffic resolves to an `operator` actor with a non-secret identifier. Because `operational_events` already permits `operator`, no actor-type migration is needed. Audit managed GET requests as well as mutations, classify each managed route, and attach the authorized project when it can be derived without reading private payloads. Do not log connector authorization headers, credentials, raw response bodies, raw measurements, Compact secrets, or CSRF tokens.

Milestone 2 protects managed private data. Add a required `MANAGED_ARTIFACT_ENCRYPTION_KEY` secret that is exactly 32 bytes encoded as 64 hexadecimal characters, independent of `MANAGED_CONNECTOR_CREDENTIAL_KEY`. Create `managed-artifact-crypto.ts` with versioned AES-256-GCM envelope functions. The R2 object body contains only an envelope with algorithm, schema version, key version, IV, and ciphertext. Associated authenticated data includes object key, source ID, run ID, period date, and envelope version. Decryption rejects wrong keys, changed identifiers, and changed ciphertext.

Migration `0030_managed_artifact_retention.sql` adds `private_artifact_expires_at` to managed runs. A successful confirmed transaction deletes the R2 object immediately and clears both key and expiry. Retryable, action-required, and dead-lettered runs retain the encrypted artifact for at most seven days. Scheduled maintenance deletes expired objects in bounded batches and then clears D1 references. D1 `sample_count`, `observed_hour_count`, and the existing internal min/max/average summaries may remain for audit but must not be returned by public or third-party endpoints. The Access-protected managed page may show these fields only to a granted operator.

Milestone 3 makes asynchronous failure durable and scheduling safe. Migration `0031_queue_dead_letters.sql` adds an idempotent `queue_dead_letters` table keyed by queue plus Cloudflare message ID. Add each `*-dlq` as a consumer in `wrangler.jsonc`. The Worker queue handler distinguishes the three normal queues and three dead-letter queues. A DLQ delivery writes the message identifier, queue, sanitized job/source ID, first and last observation, and state. It marks the corresponding business job as requiring action only when doing so is safe and idempotent, creates an operational event, emits one Japanese Discord alert with action classification and a link to the protected operations view, and acknowledges the DLQ message after D1 succeeds. Duplicate delivery updates observation counts without creating duplicate alerts.

Change `sponsor-operating-window.ts` so any missing table, invalid row, or D1 exception returns an explicit fail-closed result with source `configuration-unavailable`. The scheduled handler must not start or keep warm the Sponsor Container in that state. It must record and notify the schedule failure while leaving sponsor work queued. Tests cover D1 failure, malformed starts, the daily 02:00 JST cutoff, and the explicit always-on judging profile.

Milestone 4 changes the Compact contract and all consumers. Make `operatorAuthority` mutable, add `operatorAuthorityVersion`, and add `rotateOperatorAuthority(newAuthority, newVersion)`. Add a map from a domain-separated hash of Device commitment plus sensor type to the latest assignment ID. `registerPolicyAssignment` must reject a successor until the latest assignment is closed, reject overlap, and require a larger version. Add `closePolicyAssignment(assignmentId, validUntil)` restricted to the Operator; it closes only the latest open assignment and preserves all other assignment fields. `submitDailyAttestation` accepts a closed historical assignment only when the attested period falls fully inside that assignment interval. This changes the circuit set from six to eight and requires fresh compile artifacts and a new incompatible Preprod deployment.

Update Compact simulator tests first, then witnesses, generated type consumers, Sponsor Container request/response types, local operator commands, Worker payload validation, Browser call construction, deployment scripts, public verifier decoding, and architecture documentation. Tests must prove that overlap and version rollback fail, closing then creating a successor succeeds, a delayed historical period remains valid, an out-of-period historical assignment fails, the old Operator secret fails after rotation, and the new secret works.

Milestone 5 consolidates Wallet runtime cost. Deploy one `midnight-server-wallet` with one Wallet seed, one synchronized checkpoint, and separate Operator and Managed Attestor Compact secrets. Registration, policy, managed attestation, DUST funding, and submission use the same Wallet SDK instance and one mutation queue. Before every funded submission, validate the configured contract address, one of the eight exact circuit entry points, exactly one contract action, and absence of unrelated value transfers. The stable operation ID remains workflow correlation and idempotency metadata in D1; it is not represented as a Compact call argument.

Remove the internal cross-Container authority handoff and the two extra authority Container bindings. Deploy the new application first, confirm restoration and a valid managed transaction, and only then delete the superseded Sponsor, Fleet Authority, and Managed Attestor applications. Record measured initialization, synchronization, proof, sponsorship, and submission times and the resulting resource cost. A future higher-assurance tier may restore process isolation, but it is not part of this cost-optimized milestone.

Milestone 6 aligns documentation and performs regression validation. Update the canonical English architecture and its Japanese translation to distinguish received-data proof from source authenticity, internal audit aggregates from public disclosure, and Browser demo storage from production Device/managed paths. Document grant administration, CSRF behavior, encryption key creation and rotation, seven-day retention, DLQ operations, schedule fail-closed behavior, contract redeployment, and runtime secret ownership. Do not include actual secrets, Wallet material, private values, or remote environment-specific credentials.

## Concrete Steps

All commands run from the repository root.

Before every milestone, inspect the dirty worktree and keep the existing managed-source and operating-hours work intact:

    git status --short
    git diff --check

Run focused Worker tests while implementing Milestones 1 through 3:

    npm run test -w @midnight-demo/proof-gateway -- --run
    npm run typecheck -w @midnight-demo/proof-gateway
    npm run build -w @midnight-demo/proof-gateway

Run the browser tests after CSRF and project filtering changes:

    npm run test -w @midnight-demo/dashboard
    npm run build -w @midnight-demo/dashboard

Compile and test the contract after Milestone 4:

    npm run contract:compile
    npm run test -w @midnight-demo/sensor-registry-contract

Run the Sponsor tests and API SCT after each secret-boundary step:

    npm run test -w @midnight-demo/sponsor-wallet
    npm run sct:api

Apply migrations locally before any remote deployment:

    npx wrangler d1 migrations apply midnight-sensor-data-v2 --local --config backend/cloudflare/deployment/wrangler.jsonc

The final local gate is:

    npm run verify
    npm run sct:api
    npm run sct:gui

Remote migration, secret creation, contract deployment, Worker deployment, and live E2E occur only after local gates pass and must use ignored environment files or Wrangler Secret input. Never print a secret. Because the Compact change is incompatible, deploy the new contract first, set the new public contract address only after deployment succeeds, and then run one Browser regression, one managed mock-API run, and one authenticated Device run through proof, sponsored submission, Midnight confirmation, Explorer link, and third-party verification.

## Validation and Acceptance

Milestone 1 is accepted when an Access-authenticated global operator can load and mutate managed sources; a viewer can read but receives HTTP 403 on mutation; a project operator sees only that project; direct use of another project's source ID returns HTTP 404; missing, expired, or cross-principal CSRF tokens fail; cross-origin and non-JSON mutations fail before a managed record is changed; and operations history identifies the verified system operator for both reads and writes.

Milestone 2 is accepted when inspecting a newly written R2 object reveals no JSON field containing extrema, nonce, raw measurement, proof private input, or credential; decryption succeeds only with the correct key and bound metadata; confirmed runs leave no private object; a seven-day terminal object is removed by maintenance; and the third-party API and page never receive D1 audit aggregates or raw values.

Milestone 3 is accepted when an injected DLQ message creates one durable actionable record and one notification, duplicate delivery is idempotent, no secret payload is persisted, and the operations view links the record to the affected job. A simulated D1 schedule read error must leave queued sponsorship jobs untouched and must not invoke the Sponsor Container. Normal scheduled and always-on modes must continue to work.

Milestone 4 is accepted when Compact 0.31.1 compiles eight operational circuits; all simulator rejection cases pass; no two assignments can overlap for one Device and sensor type; delayed data can use its uniquely applicable historical assignment; the old Operator secret cannot administer the contract after rotation; and all TypeScript consumers compile against the new generated API.

Milestone 5 is accepted only when runtime inspection and deployment configuration show exactly one Wallet Container application, one Wallet seed, one checkpoint, separate Operator and Managed Attestor Compact secrets, and serialized Wallet mutation. An arbitrary transfer, unknown circuit, changed contract identifier, or modified call must be rejected before funding. Registration, managed attestation, and a sponsored Device proof must still reach confirmed Midnight transactions. The old three Wallet applications must no longer consume Container resources.

The full plan is accepted after `npm run verify`, `npm run sct:api`, and `npm run sct:gui` pass; Wrangler dry-run resolves every binding and all six queue consumers; local migration from an existing `0028` database succeeds; documentation contains no source-authenticity overclaim; and live Browser, managed mock API, and Device regressions all produce independently inspectable Midnight transaction hashes and third-party threshold verification.

## Idempotence and Recovery

All schema changes are additive. Never edit an applied migration; add the next numbered migration. Use `CREATE TABLE` and unique keys so retrying grants, CSRF cleanup, DLQ delivery, or artifact cleanup is safe. CSRF consumption and the corresponding business mutation must be in one D1 batch where feasible. If the R2 delete succeeds but the D1 clear fails, a retry treats a missing object as already deleted and clears the row. If D1 updates first, never delete the only retry artifact until the transaction is confirmed or retention expires.

During the Wallet cutover, leave existing Queue jobs in D1-backed retryable states, deploy the singleton consumer, confirm its checkpoint restore, and then remove the superseded applications. A message format must include a schema version and stable operation ID so retries cannot repeat a confirmed contract mutation.

The contract migration is intentionally incompatible because there is no production data. Preserve the old deployment address in deployment history, but do not attempt to mutate old ledger layout. Compile and deploy a new contract with fresh Policy and Assignment IDs, recreate current administration, then update the configured address. The deployment wrapper rejects D1 identifier collisions before acquiring proof capacity, and `saveDeployment` archives the superseded local record before replacing it. If live E2E fails, restore the previous Worker configuration and address without deleting either contract or Wallet checkpoint.

Secret generation and rotation are recoverable only if the ignored source is backed up securely before remote configuration changes. Generate every 32-byte key independently. Do not reuse the connector credential key for artifact encryption and do not reuse either authority secret as an encryption key. Never place a plaintext secret in D1, R2, logs, screenshots, command arguments, documentation, Git, or Discord.

## Artifacts and Notes

At plan creation, the relevant baseline is a dirty worktree containing the managed API and operating-hours implementation. The plan itself must not be used to infer that those changes were committed or deployed. Before each deployment, record the exact Git commit or dirty diff hash, Compact compiler version, Midnight SDK versions, Proof Server image, Container instance types, migration list, test totals, and measured durations.

The current Cloudflare deployment uses Proof Server image `8.1.0`, Compact compiler `0.31.1`, one `standard-2` Proof Server instance, and one `standard-4` Server Wallet instance. Cost-optimized processing starts daily at 02:00 JST and can be restored to the judging profile with `npm run cloudflare:sponsor:always-on`.

Never attach raw managed API responses, 1,440 measurements, Compact secrets, Wallet seeds, connector tokens, CSRF tokens, encrypted artifact keys, or serialized private transactions to this plan. Evidence should contain IDs, counts, durations, status transitions, transaction hashes, and redacted error codes only.

## Interfaces and Dependencies

In `backend/cloudflare/proof-gateway-worker/src/system-operations-auth.ts`, `SystemOperatorPrincipal` must expose a stable verified identifier, normalized email when present, display name, and authentication source. A new authorization module must provide project-list filtering, project permission checks, and role checks without trusting request-body project identifiers.

The managed bootstrap response must include a short-lived CSRF token and expiry. Browser code in `frontend/verification-portal/public/managed-proof` must centralize mutation fetches so no button can omit the token accidentally.

In `backend/cloudflare/proof-gateway-worker/src/managed-artifact-crypto.ts`, define versioned encrypt and decrypt functions that accept the 32-byte key and metadata `{ objectKey, sourceId, runId, periodDate }`. The decrypted value is the existing private managed artifact type; ciphertext JSON is a separate envelope type and must not share a serializer with the plaintext model.

The Worker `queue` handler must accept the existing normal message types plus a generic DLQ delivery path that never executes the original operation. It may extract only validated IDs for correlation. Unknown or malformed DLQ bodies are still recorded with the Cloudflare message ID, then acknowledged after persistence.

In `midnight/contracts/sensor-registry/src/sensor-registry.compact`, the final public circuits are the existing six plus `closePolicyAssignment` and `rotateOperatorAuthority`, for eight total. The assignment-key derivation remains a pure helper and is not a circuit. If implementation changes the public API, update every occurrence of the expected count in this living plan before claiming acceptance; the behavioral acceptance is authoritative.

The final Queue messages remain narrow even though Wallet execution is consolidated. Fleet administration messages contain only operation IDs and public registration or policy parameters. Managed attestation messages contain only IDs used by the Worker to retrieve and decrypt protected input before calling the private Server Wallet. Sponsor messages contain only validated transaction and correlation metadata. Queue and browser paths never receive Wallet or Compact secrets.

Plan revision note (2026-09-03): created the initial security-hardening design after reviewing the implemented managed API and Sponsor operating-hours work. The plan records the user's decisions to retain internal audit aggregates, accept IndexedDB only for the simulated Browser Device, and make no upstream API authenticity claim; it sequences low-risk Worker controls before incompatible Compact and runtime-boundary changes.

Plan revision note (2026-09-03): corrected the expected contract total to eight circuits and selected a reusable one-hour principal-bound CSRF token. This avoids inventing a ninth circuit and avoids mutation-level token rotation races while retaining same-origin, JSON, expiry, and principal checks.

Plan revision note (2026-09-03): completed all local implementation gates and extended the migration design after discovering retained records from multiple contract deployments. Added migrations `0033` and `0034`, immutable and contract-scoped D1 mirrors, current-contract query filtering, fresh-ID deployment preflight, superseded deployment archival, and stable cryptographic and Sponsor expiry tests. Remote migration and live E2E remain a separate acceptance step.

Plan revision note (2026-09-03): superseded the three-Wallet-Container deployment with one private `midnight-server-wallet` at the user's direction. This reduces active Container count and repeated Wallet synchronization cost. Logical authorization secrets remain separate, but process isolation between Wallet roles is no longer a security claim.
