# Reorganize the monorepo around system boundaries

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `.agents/PLANS.md` from the repository root. The `.agents` directory is local agent guidance and is ignored by Git, while this ExecPlan is checked in under `docs/implementation/` so a contributor can resume the migration from the repository alone.

## Purpose / Big Picture

The repository currently places browser code, Cloudflare runtimes, Raspberry Pi runtimes, local operator tools, and deployment scripts below broad directories such as `apps/`, `ops/`, and `scripts/`. A new contributor cannot tell where code executes or whether it is shipped to a device merely from its path. After this reorganization, the first directory component will identify the system boundary: browser frontend, Cloudflare backend, edge device, Midnight contract, shared protocol, local tool, or system test. The root README and Japanese README will explain this contract and show the final tree.

This is a path and ownership migration, not a product behavior change. The same Worker, browser bundle, Sponsor Wallet Container, Edge Device agents, Compact contract, APIs, queue behavior, proof flow, and transaction flow must remain operational. A contributor can demonstrate success by running the repository verification commands, building the device release archive, validating the Wrangler deployment configuration, and confirming that no tracked source remains under the former `apps/`, `ops/`, `packages/`, or generic root `scripts/` paths.

## Progress

- [x] (2026-08-31 03:40Z) Read `.agents/PLANS.md`, inventoried the current repository, and selected the final boundary names.
- [x] (2026-08-31 04:04Z) Committed the Apache-2.0 metadata (`5913f14`) and submission-video documentation (`216933b`) as independent clean baselines.
- [x] (2026-08-31 04:00Z) Moved the browser runtime to `frontend/verification-portal`.
- [x] (2026-08-31 04:00Z) Moved Cloudflare runtimes and persistent schema to `backend/cloudflare` and extracted local administration scripts.
- [x] (2026-08-31 04:00Z) Moved Raspberry Pi runtimes, release tooling, installers, and diagnostics to `edge-device`.
- [x] (2026-08-31 04:00Z) Moved the operational Compact contract and development-only cost contract to `midnight`.
- [x] (2026-08-31 04:00Z) Moved shared protocol code to `shared/measurement-protocol` without changing its npm package name.
- [x] (2026-08-31 04:00Z) Moved local operator, benchmark, submission-media, and repository-check tooling to named directories below `tools`.
- [x] (2026-08-31 04:00Z) Moved the cross-boundary Dashboard SCT runner to `tests/system/dashboard-workflow`.
- [x] (2026-08-31 04:06Z) Updated npm workspaces, package scripts, relative paths, Wrangler paths, release allowlists, generated-artifact paths, ignore rules, and documentation links.
- [x] (2026-08-31 04:06Z) Documented the final directory contract in the root and Japanese READMEs.
- [x] (2026-08-31 04:07Z) Removed tracked references to the former layout and quarantined known generated caches left below obsolete directories.
- [x] (2026-08-31 04:12Z) Ran Compact compilation, all unit and integration tests, type checks, builds, API and GUI SCT, Device release verification, portability validation, and Wrangler dry-run.
- [x] (2026-08-31 04:13Z) Recorded validation evidence and migration results in this ExecPlan and created focused implementation commits.

## Surprises & Discoveries

- Observation: `apps/proof-gateway` mixes deployed Worker code and D1 migrations with local-only scripts that set secrets, admit jobs, and provision Devices.
  Evidence: `apps/proof-gateway/src/index.ts` is the Wrangler `main`, while `apps/proof-gateway/scripts/*.mjs` is guarded by `scripts/require-development-host.mjs`.

- Observation: `ops/pi-forensics` is not a generic operations area. It is an optional Raspberry Pi diagnostic bundle copied into the device release archive.
  Evidence: `scripts/build-device-release.mjs` includes `ops/pi-forensics`, and `ops/pi-forensics/install.sh` installs systemd and journald files on the Pi.

- Observation: the Cloudflare Wrangler file describes the whole backend deployment unit, not only the HTTP gateway. It defines the Worker, D1, R2, two Queues, two Containers, Durable Object bindings, Cron, rate limits, and browser assets.
  Evidence: `apps/proof-gateway/wrangler.jsonc` contains all of those bindings and references both `apps/sponsor-wallet/Dockerfile` and `apps/dashboard/public`.

- Observation: ignored secrets and generated files exist below old paths. Whole-directory moves would accidentally relocate `.dev.vars`, `.wrangler`, `dist`, generated proving keys, or local `node_modules` without making their ownership explicit.
  Evidence: `git status --ignored` reports those paths below `apps/proof-gateway`, `apps/dashboard`, and other workspaces.

- Observation: the baseline suite contains 288 tests, although current submission prose stated 287.
  Evidence: the pre-migration and relocated root `npm test` totals are 18 shared, 13 contract, 52 Frontend, 4 operator, 6 Device Identity, 13 collector, 29 transaction-agent, 111 Worker, and 42 Sponsor tests.

- Observation: the development-only daily-attestation test imports generated Compact modules, so including every experiment test in the root TypeScript project makes a clean clone depend on an unrequested experiment compile.
  Evidence: after removing ignored experiment output, `tsc` failed on the test import. Restricting the experiment's normal `typecheck` to its handwritten witness restores clean-clone verification; `npm run attestation:compile` and the experiment's explicit test command retain the generated-profile path.

- Observation: npm retained removed workspace entries as `extraneous` when updating the existing lockfile in place.
  Evidence: `npm prune --package-lock-only` still listed the former `apps`, `contracts`, and `packages/shared` entries. Regenerating the lockfile from the new root workspace declaration removed them and reduced the audited dependency set from 473 to 331 packages.

## Decision Log

- Decision: use `frontend`, `backend`, `edge-device`, and `midnight` as the primary runtime boundaries.
  Rationale: these names match the four system zones already used by the architecture documentation and communicate execution location and trust ownership before implementation technology.
  Date/Author: 2026-08-31 / Codex and user.

- Decision: use `tools` only for programs executed from the development workstation, and use explicit second-level names such as `midnight-operator`, `cloudflare-admin`, `benchmarks`, `submission-media`, and `repository-checks`.
  Rationale: a local CLI that can access an Operator Authority or deployment Wallet must not appear to be part of a deployed backend or device runtime.
  Date/Author: 2026-08-31 / Codex and user.

- Decision: keep unit tests beside the code they own and place only cross-boundary compatibility tests in `tests/system`.
  Rationale: ownership remains obvious, while a system test that drives both browser and backend is not falsely owned by one runtime.
  Date/Author: 2026-08-31 / Codex.

- Decision: keep existing npm package names during the path migration.
  Rationale: changing package identity and filesystem ownership simultaneously would obscure regression causes. Package names can be reconsidered only after the path-only migration passes every gate.
  Date/Author: 2026-08-31 / Codex.

- Decision: place `wrangler.jsonc` under `backend/cloudflare/deployment` and D1 migrations under `backend/cloudflare/d1-schema`.
  Rationale: the Wrangler file deploys the complete Cloudflare stack, while the migrations describe persistent backend state shared by the Worker workflows. Neither is a local operator implementation.
  Date/Author: 2026-08-31 / Codex.

- Decision: do not commit generated Compact artifacts, browser proving assets, `.dev.vars`, Wallet state, raw sensor data, or build output during the move.
  Rationale: the repository security boundary and existing ignore policy remain unchanged.
  Date/Author: 2026-08-31 / Codex.

- Decision: relocate each ignored environment file to the boundary that owns it without printing its contents.
  Rationale: the local development Wallet recovery source belongs to `tools/midnight-operator`, Device staging configuration belongs to `edge-device/release`, and Worker development secrets belong beside the deployment manifest; keeping them at old paths would leave two apparent configuration sources.
  Date/Author: 2026-08-31 / Codex.

- Decision: quarantine obsolete ignored build output under `/tmp` instead of deleting it during migration.
  Rationale: the old directories contained no tracked files or secret-pattern files, but temporary relocation remains recoverable and avoids treating untracked user data as disposable.
  Date/Author: 2026-08-31 / Codex.

## Outcomes & Retrospective

The boundary migration is implemented in `020a656`, with the aligned Device artifact verification default in `0125c4e`. The repository now communicates ownership from the first path component: Browser code is under `frontend`, Cloudflare-deployed code and schema under `backend`, Raspberry Pi runtime and release code under `edge-device`, Compact code under `midnight`, cross-runtime protocol code under `shared`, and development-host commands under `tools`. No tracked implementation remains in the former generic `apps`, `contracts`, `packages`, `ops`, or root `scripts` directories, and no compatibility source paths were retained.

Final validation passed on 2026-08-31:

- `WRANGLER_LOG_PATH=/tmp/midnight-wrangler-verify.log TMPDIR=/tmp npm run verify` compiled all 6 operational Compact circuits and passed 288 tests across 9 workspaces, every configured type check and build, the 1,307-module Frontend production bundle, and Wrangler dry-run.
- Wrangler resolved 31 static assets, the official Proof Server `8.1.0` Container, the relocated Sponsor Wallet Container, both Queues, D1, R2, rate limits, and both Durable Object bindings without making a remote deployment.
- `npm run sct:api` passed 111 Worker and 42 Sponsor tests. `npm run sct:gui` passed all 20 rendered browser checkpoints and wrote ignored local evidence below `.sct-output/dashboard`.
- `npm run device:release -- --version 0.1.0-boundary-final` produced a checksum-protected installer-rooted archive, verified all 91 operational files and 28 Compact runtime artifacts, proved its production lockfile installable, and confirmed that no development workspace or Wallet material entered the package.
- Script syntax checks, repository portability, stale-path searches, `git diff --check`, and Device artifact-manifest verification all passed.

The main lesson is that filesystem organization is part of the trust model. Moving local administration commands out of a deployed Worker workspace and keeping Device release code under the Device boundary makes accidental packaging and secret ownership easier to test. A second lesson is that generated output must not silently satisfy clean-clone checks; the development experiment's normal type check now covers handwritten code only, while its explicit compile/test workflow remains opt-in.

## Context and Orientation

The repository is an npm-workspaces monorepo. Before this migration, the browser user interface lived in `apps/dashboard`; Cloudflare runtime, schema, deployment, and local administration concerns were mixed in `apps/proof-gateway`; and the other runtime and tool boundaries were split among generic `apps`, `contracts`, `packages`, `ops`, and root `scripts` directories. Those former locations are recorded here only as migration context. The current ownership tree below is authoritative.

A runtime is code that remains active in its target environment and handles product work. A local tool is invoked by a developer or operator from the development workstation and is never shipped as part of the browser, Worker, Container, or Raspberry Pi runtime. A deployment manifest describes how a runtime is deployed but is not itself a second implementation. `wrangler dev` is allowed to execute the same Worker code locally; no duplicate local Worker implementation should be created.

The final ownership tree is:

    frontend/
      verification-portal/
    backend/
      cloudflare/
        proof-gateway-worker/
        sponsor-wallet-container/
        d1-schema/migrations/
        deployment/wrangler.jsonc
    edge-device/
      sensor-collector/
      device-identity/
      midnight-transaction-agent/
      release/
      diagnostics/pi-forensics/
    midnight/
      contracts/sensor-registry/
      experiments/daily-attestation-cost/
    shared/
      measurement-protocol/
    tools/
      midnight-operator/
      cloudflare-admin/
      benchmarks/
      submission-media/
      repository-checks/
    tests/
      system/dashboard-workflow/
    docs/

The repository root retains only project-level files such as `README.md`, `AGENTS.md`, `LICENSE`, npm workspace files, TypeScript base configuration, toolchain pins, and ignore/config templates that genuinely apply to more than one boundary.

## Plan of Work

Begin by validating and committing the existing license metadata and submission-document corrections. This provides a clean baseline before thousands of path references change and preserves the user's already completed work as an independent commit.

Move tracked files in small ownership groups. Do not move whole directories that contain ignored secrets or generated artifacts. Move the browser workspace first, then the Cloudflare Worker source, Sponsor Wallet Container, D1 migrations, and deployment manifest. Extract every local-only file from the former Proof Gateway `scripts/` directory into `tools/cloudflare-admin` and keep runtime imports out of that tool package unless they cross an explicit exported interface.

Move the three Raspberry Pi workspaces into names that state their responsibility. `device-auth` becomes `edge-device/device-identity`, `edge-agent` becomes `edge-device/sensor-collector`, and `wallet-agent` becomes `edge-device/midnight-transaction-agent`. Move `installer.sh`, compatibility installer wrappers, release packaging, device artifact export and verification, installation scripts, environment migration, and host guard into `edge-device/release`. Move `ops/pi-forensics` into `edge-device/diagnostics/pi-forensics`. Update the release builder's source allowlist so the generated archive still has `installer.sh` at its archive root even though the repository source is nested.

Move `contracts/sensor-registry` into `midnight/contracts/sensor-registry`. Move the development-only generated daily profile contract into `midnight/experiments/daily-attestation-cost`. Preserve generated artifact ignore behavior and update all artifact discovery paths, Compact compile scripts, browser proving-asset preparation, Sponsor Wallet Docker build paths, and device archive export paths.

Move `packages/shared` into `shared/measurement-protocol` without changing the package name `@midnight-demo/shared`. The package currently holds both daily measurement types and canonical browser provisioning messages; keep one package during this migration so behavior and test counts remain stable. Record a future package-split option rather than combining it with this path migration.

Move `apps/development/operator-cli` into `tools/midnight-operator`. Keep its benchmark entry point temporarily within the same npm package because it shares Wallet and Midnight provider internals, but place the file below a clearly named `src/benchmarks/` directory. Move standalone compile and operating-cost scripts into `tools/benchmarks`. Move deck, PDF, and demo capture generators into `tools/submission-media`. Move host guards and repository portability checks into `tools/repository-checks`. Move the Dashboard SCT runner into `tests/system/dashboard-workflow`.

Update `package.json` workspace globs to enumerate the meaningful boundaries. Update the lockfile with `npm install --package-lock-only --ignore-scripts`. Update package-local `tsconfig.json` extension paths, root scripts, every relative filesystem reference, Docker build context, Wrangler schema path, Worker `main`, asset directory, migration directory, Sponsor image path, `.gitignore`, `.dockerignore`, release allowlists, documentation source links, and tests that assert install layout. Use repository-wide searches for each former prefix and classify every remaining match as either a historical statement that must be updated or an error.

Document the directory contract in `README.md` and `docs/ja/README.md`. The text must explain execution location, secret ownership, deployment status, and what is deliberately not shipped for every top-level boundary. Update `AGENTS.md` and the implementation map so future contributors place new code correctly.

Validate after each major boundary move with targeted type checks and tests. At the end run the complete repository gate, API SCT, GUI SCT, device release generation and verification, and an explicit Wrangler dry-run using the relocated manifest. Inspect the device archive to prove that no local operator or deployment Wallet source entered the firmware. Inspect Wrangler dry-run output to prove that the same Worker assets and Containers are resolved.

## Concrete Steps

All commands run from the repository root (the directory containing this project's `package.json`).

First record the baseline and commit existing unrelated work:

    git status --short
    git diff --check
    npm run verify:portability

Then perform path-only moves in the milestone order above and run the targeted workspace test after each move. Regenerate npm lock metadata only after all workspace paths are present:

    npm install --package-lock-only --ignore-scripts

Search for stale source paths. The final command must print no source or configuration matches; historical Git data and ignored generated files are outside this check:

    git grep -n -E 'apps/(dashboard|development|device|proof-gateway|sponsor-wallet)|packages/shared|ops/pi-forensics' -- ':!docs/implementation/monorepo_boundary_reorganization_execplan.md'

Run the full acceptance gate:

    npm run contract:compile
    TMPDIR=/tmp npm run verify
    npm run sct:api
    npm run sct:gui
    ./edge-device/release/package_archive.sh
    npm run device:artifacts:export
    npm run device:artifacts:verify
    npm run build -w @midnight-demo/proof-gateway

The exact root script names may retain their public command names, but their implementation paths must point into the new boundaries. Expected success includes six Compact circuits compiled, 288 repository tests, all type checks and builds passing, both SCT suites passing, a device archive with a valid checksum, and a successful Wrangler dry-run that resolves both Containers and browser assets.

## Validation and Acceptance

The migration is accepted only when a new contributor can identify execution location from every top-level source path and all product behavior remains validated. `frontend/verification-portal` must contain browser-executed code only. `backend/cloudflare` must contain Cloudflare-deployed code, schema, and deployment metadata only. `edge-device` must contain Raspberry Pi runtime, release, and diagnostic code only. `midnight` must contain Compact contracts and their witnesses/tests. `tools` must contain development-workstation programs only. No deployed runtime may import source from `tools`.

`npm run contract:compile` must generate all operational `sensor-registry` circuits using Compact compiler 0.31.1. `TMPDIR=/tmp npm run verify` must pass repository portability, tests, type checks, builds, and Wrangler dry-run. `npm run sct:api` and `npm run sct:gui` must preserve the queue, Sponsor, browser provisioning, reload recovery, and focused-input behavior previously covered by SCT. The device release command must produce a secret-free archive whose root still contains `installer.sh`, and archive verification must reject development tools or Wallet recovery data. The final `git status --short` must contain only intentional tracked changes and no generated Compact artifacts, Browser proving keys, secrets, raw sensor data, or Wallet state.

## Idempotence and Recovery

Path moves are safe to retry when performed per tracked subtree. Before moving an old directory, verify whether the destination already exists and compare tracked files. Never run a recursive delete against `apps`, `ops`, `scripts`, or another broad path while ignored content exists. Move the ignored `.dev.vars` file explicitly to the new Proof Gateway workspace without printing it. Generated `dist`, `.wrangler`, `node_modules`, Browser key/zkir copies, and managed Compact outputs may be regenerated after the new paths pass tests; remove only exact, inspected generated directories if cleanup is necessary.

If a milestone fails, keep the already moved ownership group and fix references until its targeted tests pass instead of moving more groups. Git commits at the clean baseline and major boundary milestones provide recoverable points, but do not use destructive reset commands. The Cloudflare deployment is not changed remotely by this plan; only dry-run validation is authorized unless the user separately asks for deployment.

## Artifacts and Notes

The baseline remote commit before this work is `c8d99c6`. Apache-2.0 package metadata was preserved in `5913f14`, and completed 2:18 English-video evidence was preserved in `216933b` before moving paths. Final documentation uses the measured 288-test total.

The Cloudflare deployment manifest currently references the following cross-boundary inputs, all of which must be adjusted together:

    main: apps/proof-gateway/src/index.ts
    migrations: apps/proof-gateway/migrations
    Sponsor image: apps/sponsor-wallet/Dockerfile
    browser assets: apps/dashboard/public

After migration those inputs are owned by `backend/cloudflare/deployment`, `backend/cloudflare/proof-gateway-worker`, `backend/cloudflare/sponsor-wallet-container`, `backend/cloudflare/d1-schema`, and `frontend/verification-portal`.

## Interfaces and Dependencies

Preserve the npm package names and public import specifiers during this migration: `@midnight-demo/dashboard`, `@midnight-demo/proof-gateway`, `@midnight-demo/sponsor-wallet`, `@midnight-demo/device-auth`, `@midnight-demo/edge-agent`, `@midnight-demo/device-wallet-agent`, `@midnight-demo/development-cli`, `@midnight-demo/sensor-registry-contract`, `@midnight-demo/daily-attestation-contract`, and `@midnight-demo/shared`. Their filesystem paths and `tsconfig.json` relative extensions change, but consumers must not require source-relative imports across boundary packages.

The final Wrangler manifest must continue to generate `src/worker-configuration.d.ts` for the Proof Gateway Worker and must preserve the `DB`, `SPONSOR_STATE`, `PROOF_QUEUE`, `SPONSOR_QUEUE`, `PROOF_SERVER`, `SPONSOR_WALLET`, rate-limit, Cron, and static asset bindings. Secret values remain managed through Wrangler and are never written to the manifest.

The final device release builder must consume Edge Device packages, `shared/measurement-protocol`, and the operational contract witness implementation only. It must not include `tools/midnight-operator`, `tools/cloudflare-admin`, development Wallet dependencies, Compact compilation tools, Sponsor Wallet code, or Cloudflare deployment credentials.

Plan revision note (2026-08-31): created the initial self-contained plan after inventorying the current worktree and agreeing with the user to replace the generic `apps` layout with explicit system-boundary directories.

Plan revision note (2026-08-31): marked the migration complete after the full repository gate, API/GUI SCT, Cloudflare dry-run, and Device release verification passed; recorded the measured 288-test total and clean-clone experiment fix.
