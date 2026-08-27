# Repository Guidelines

## Project Structure & Module Organization

This npm-workspaces monorepo separates runtime responsibilities:

- `apps/dashboard/public/`: framework-free Worker SPA assets and 1990s government-system styling.
- `apps/development/operator-cli/`: development wallet sync, encrypted private state, benchmarks, deployment, and Preprod administration.
- `apps/device/edge-agent/`: minimal Edge temperature collector and localhost health endpoint; no Compact, wallet, proving, or deployment dependencies.
- `apps/device/wallet-agent/`: operational device wallet, recurring submissions, and status; no compilation or deployment commands.
- `apps/proof-gateway/`: Cloudflare Worker APIs, portable SQL storage adapters, migrations, SPA binding, and Proof Server Container.
- `contracts/sensor-registry/`: Compact contract, witnesses, and simulator tests.
- `packages/shared/`: commitments, Merkle utilities, test fixtures, and unit tests.
- `docs/`: canonical English guidance; Japanese translations live in `docs/ja/`.

Generated `dist/`, `.state/`, `data/`, `.wrangler/`, and `contracts/*/src/managed/` content is gitignored. Do not hand-edit generated Compact artifacts.

## Build, Test, and Development Commands

- `npm install`: install all workspace dependencies.
- `npm run contract:compile`: compile Compact using toolchain `0.31.1`.
- `npm test`: compile the contract, then run shared, simulator, and Worker API tests.
- `npm run typecheck`: type-check every workspace.
- `npm run verify`: run tests, type-checking, and Wrangler dry-run.
- `npm run dashboard:dev`: migrate local D1 and start the Worker-hosted SPA.
- `npm run edge:serve`: start Edge-only temperature collection and its health endpoint on `127.0.0.1:8788`.
- `./package_archive.sh`: on a development host, build and verify the operational-only Raspberry Pi firmware `.tar.gz` and checksum; the archive root contains `installer.sh`.
- `./installer.sh`: from an extracted firmware archive, install only the resource-limited device collector and operational-wallet dependencies, without Compact or deployment tasks.
- `npm run cloudflare:deploy` / `npm run cloudflare:destroy`: create or remove Cloudflare resources; these require authenticated Wrangler access.

## Coding Style & Naming Conventions

Use TypeScript ESM, strict compiler settings, two-space indentation, single quotes, and trailing commas where existing code does. Compact sources use four-space indentation. Prefer `camelCase` for values/functions, `PascalCase` for types/components, and kebab-case workspace directories. Keep changes focused; no formatter or linter is currently configured.

## Testing Guidelines

Name tests `*.test.ts`. Shared utilities use Node's test runner through `tsx`; contract and Worker API tests use Vitest. Add normal and rejection cases for privacy-sensitive changes, especially authorization, redaction, threshold violations, raw-data tampering, and Merkle-path tampering. No coverage threshold is configured; preserve the existing behavioral scenarios.

## Commit & Pull Request Guidelines

No usable Git history is present in this workspace, so no repository-specific convention can be inferred. Use concise imperative Conventional Commit messages, for example `feat(contract): verify private sensor range`. Pull requests should explain the privacy boundary, list validation commands, link issues, and include screenshots for GUI changes. Call out configuration or deployment changes explicitly.

## Security & Configuration Tips

Copy `.env.development.example` and `.env.device.example` into their separate ignored files; never commit environment files, `.dev.vars`, wallet mnemonics, raw sensor data, or private-state passwords. The development wallet recovery source is `.env.development` and must be backed up securely. Device wallet material belongs only below `~/.midnight/midnight-cloudflare-demo/device-wallet/`, never in `.env.device`. Edge collector code must not import Compact, wallet, proving, deployment, or development modules. Treat the current Cloudflare backend/prover as trusted. Keep browser APIs free of wallet, ingestion, and attestation secrets; configure Worker secrets with Wrangler.
