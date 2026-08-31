# Repository Guidelines

## Project Structure & Module Organization

The first directory component in this npm-workspaces monorepo identifies the execution or ownership boundary:

- `frontend/verification-portal/`: browser bundle and framework-free Worker-served SPA assets. It owns no Device, Wallet, ingestion, or attestation secret.
- `backend/cloudflare/proof-gateway-worker/`: deployed Worker API, Queue consumers, portable SQL storage adapters, and Container bindings.
- `backend/cloudflare/sponsor-wallet-container/`: deployed fee-only Midnight Sponsor Wallet runtime.
- `backend/cloudflare/d1-schema/migrations/`: persistent Backend schema history shared by Worker workflows.
- `backend/cloudflare/deployment/wrangler.jsonc`: complete Cloudflare deployment manifest for Worker, D1, R2, Queues, Containers, Cron, rate limits, and SPA assets.
- `edge-device/sensor-collector/`: minimal temperature collector, hourly aggregation, and localhost health endpoint; no Compact, wallet, proving, or deployment dependencies.
- `edge-device/device-identity/`: Device-only P-256 identity and short-lived API Sessions.
- `edge-device/midnight-transaction-agent/`: operational Device authorization, proof input, submission, and status; no daemon, compilation, or deployment commands.
- `edge-device/release/`: firmware archive builder, installer, rollback, artifact verification, and staging configuration.
- `edge-device/diagnostics/pi-forensics/`: optional diagnostic bundle shipped only with Device firmware.
- `midnight/contracts/sensor-registry/`: operational Compact contract, witnesses, and simulator tests.
- `midnight/experiments/daily-attestation-cost/`: development-only fixed-profile cost experiment; not part of Device firmware or the default operational verification path.
- `shared/measurement-protocol/`: canonical commitments, aggregation, provisioning messages, fixtures, and unit tests.
- `tools/`: development-workstation programs grouped as `midnight-operator`, `cloudflare-admin`, `benchmarks`, `submission-media`, and `repository-checks`. Deployed runtimes must not import from this boundary.
- `tests/system/`: cross-boundary SCT only; component tests stay beside their owner.
- `docs/`: canonical English guidance; Japanese translations live in `docs/ja/`.

Generated `dist/`, `.state/`, `data/`, `.wrangler/`, and `midnight/**/src/managed/` content is gitignored. Do not hand-edit generated Compact artifacts.

## Build, Test, and Development Commands

- `npm install`: install all workspace dependencies.
- `npm run contract:compile`: compile Compact using toolchain `0.31.1`.
- `npm test`: compile `sensor-registry`, then run the selected shared, operational contract, CLI, device, and Worker tests.
- `npm run typecheck`: type-check every workspace.
- `npm run verify`: run portability checks, operational tests, type-checking, and Wrangler dry-run; it does not compile the experimental daily profiles.
- `npm run attestation:compile` / `npm run benchmark:daily-proof`: explicitly compile and benchmark development-only daily profiles.
- `npm run dashboard:dev`: migrate local D1 and start the Worker-hosted SPA.
- `npm run edge:serve`: start Edge-only temperature collection and its health endpoint on `127.0.0.1:8788`.
- `./edge-device/release/package_archive.sh`: on a development host, build and verify the operational-only Raspberry Pi firmware `.tar.gz` and checksum; the archive root contains `installer.sh`.
- `./installer.sh`: from an extracted firmware archive, install versioned device runtime, configuration, and wallet storage below `~/.midnight/midnight-cloudflare-demo/`, without Compact or deployment tasks; `--rollback` swaps the `current` and `previous` release symlinks.
- `npm run cloudflare:deploy` / `npm run cloudflare:destroy`: create or remove Cloudflare resources; these require authenticated Wrangler access.

## Coding Style & Naming Conventions

Use TypeScript ESM, strict compiler settings, two-space indentation, single quotes, and trailing commas where existing code does. Compact sources use four-space indentation. Prefer `camelCase` for values/functions, `PascalCase` for types/components, and kebab-case workspace directories. Keep changes focused; no formatter or linter is currently configured.

## Testing Guidelines

Name tests `*.test.ts`. Shared utilities use Node's test runner through `tsx`; contract and Worker API tests use Vitest. Add normal and rejection cases for privacy-sensitive changes, especially authorization, redaction, threshold violations, raw-data tampering, and Merkle-path tampering. No coverage threshold is configured; preserve the existing behavioral scenarios.

## Commit & Pull Request Guidelines

Use concise imperative Conventional Commit messages, following the scoped history in this repository, for example `feat(contract): verify private sensor range`. Pull requests should explain the privacy boundary, list validation commands, link issues, and include screenshots for GUI changes. Call out configuration or deployment changes explicitly.

## Security & Configuration Tips

Copy `tools/midnight-operator/.env.development.example` to the ignored `tools/midnight-operator/.env.development`. `edge-device/release/.env.device` is only a staging input and is moved during installation to `~/.midnight/midnight-cloudflare-demo/config/device.env`. Never commit environment files, `.dev.vars`, wallet mnemonics, raw sensor data, or private-state passwords. The development wallet recovery source must be backed up securely. Device wallet material belongs only below `~/.midnight/midnight-cloudflare-demo/device-wallet/`, never in an environment file. Edge collector code must not import Compact, wallet, proving, deployment, or development modules. Treat the current Cloudflare backend/prover as trusted. Keep browser APIs free of Wallet, ingestion, and attestation secrets; configure Worker secrets with Wrangler.

# ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in .agents/PLANS.md) from design to implementation.
