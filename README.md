# Measurement Data Authenticity Proof System

[日本語版](docs/ja/README.md)

This monorepo collects real temperature readings from an Edge Device, stores them in Cloudflare D1, and records privacy-preserving attestations on Midnight Preprod. Development and device operation use separate workspaces and separate wallets.

## Runtime boundaries

```text
Development server                            Raspberry Pi / device runtime
  Compact compile + proving keys                sensor collection + HTTPS ingestion
  tests and proof benchmarks                    recurring transaction submission
  Cloudflare and contract deployment            separate operational wallet
  development/deployer wallet                   localhost health + diagnostics
              │                                            │
              └──── Cloudflare Worker + Proof Container ───┘
                                      │
                                Midnight Preprod
```

| Host | Allowed responsibilities | Must not run |
| --- | --- | --- |
| Development server | Compact compilation, proving-key generation, tests, benchmarks, Wrangler, development-wallet synchronization, contract deployment, and device-release creation | Always-on sensor collection or use of the device wallet |
| Raspberry Pi/device | Read and upload sensor values, submit recurring transactions with its operational wallet, expose loopback health, and retain diagnostics | Compact/compiler, proving-key generation, local Proof Server, Docker, contract deployment, development wallet, or repository-wide tests |
| Cloudflare | Worker APIs, D1, SPA, scheduling, runtime Proof Server Container | Development or device wallet recovery material |

The Proof Server generates a proof for each transaction. The Compact compiler generates matching circuit and key artifacts ahead of time on the development server. These are different operations; neither runs on the Pi.

## Monorepo

```text
apps/development/operator-cli/  development wallet, deploy, and benchmarks
apps/device/edge-agent/         Raspberry Pi temperature collector
apps/device/wallet-agent/       device operational wallet, submit, and status
apps/dashboard/public/          Worker-hosted bilingual SPA
apps/proof-gateway/             Worker API, D1 migrations, proof container
contracts/                      Compact contracts, generated profiles, tests
packages/shared/                commitments, Merkle utilities, fixtures
ops/pi-forensics/               persistent journal and Pi health snapshots
docs/                           canonical English documentation
docs/ja/                        Japanese translations
```

## Development server

This host requires Node.js `22.15.0` or later, Compact Developer Tools `0.5.2` with toolchain `0.31.1`, authenticated Wrangler access, and a funded Preprod development wallet for deployment.

```bash
npm ci
compact update 0.31.1
cp .env.development.example .env.development
cp apps/proof-gateway/.dev.vars.example apps/proof-gateway/.dev.vars

# Generates contract artifacts and proving keys here, never on the Edge host
npm run contract:compile
npm run verify
```

The development wallet recovery source is `.env.development`. On first `npm run development:wallet`, a mnemonic is written atomically with mode `0600`. Back up this file to encrypted/offline storage; `.state/development/` is only resumable synchronization and deployment cache. To migrate the old mixed layout on a development server, run `npm run development:wallet:migrate` before initializing a new wallet.

Daily-attestation profiles are also compiled only here. Each fixed profile has separate keys:

```bash
ATTESTATION_SAMPLE_COUNTS=24 npm run attestation:compile
```

### One-time deployment and device release

Run compilation, deployment, and release creation on the development server. Repeat them only when the contract or runtime code/artifacts change.

```bash
npm run cloudflare:deploy
npm run cloudflare:secret
npm run secret:ingest -w @midnight-demo/proof-gateway
npm run secret:attestation -w @midnight-demo/proof-gateway

npm run development:wallet
npm run development:funding
npm run development:deploy
npm run cloudflare:config:network
npm run cloudflare:config:contract
npm run development:status

# Enter the public network label and deployed Contract address at the prompts above.
# They are Worker environment bindings and are not committed to this repository.
# Then export the compiled artifacts internally and build a secret-free firmware archive.
./package_archive.sh
```

Transfer `.device-release/archives/midnight-sensor-device-fw-<version>.tar.gz` and its `.sha256` file to the Pi, not the development checkout. The archive has a single top-level directory with executable `installer.sh`; its manifest rejects development workspaces, Compact source, dev tooling, and secret-bearing files. Keep `.env.development`, `.dev.vars`, `.state/development/`, development-wallet recovery material, and private development inputs off the Pi and out of Git.

## Raspberry Pi / Edge installation

The Pi uses `.env.device` for endpoints, contract address, ingestion credentials, and sensor settings. Wallet recovery material is never read from environment files; it is created under `~/.midnight/midnight-cloudflare-demo/device-wallet/` with owner-only permissions. This wallet is independent of the development/deployer wallet.

First configure the Worker ingestion token on the development server. Transfer only the matching ingestion URL and ingestion token to the Pi, then:

```bash
sha256sum -c midnight-sensor-device-fw-<version>.tar.gz.sha256
tar -xzf midnight-sensor-device-fw-<version>.tar.gz
cd midnight-sensor-device-fw-<version>
cp .env.device.example .env.device
chmod 600 .env.device
# Set the deployed contract address, remote proof URL/token,
# ingestion credentials, and sensor settings. Do not add mnemonic/seed fields.

./installer.sh
```

Alternatively, set the URL during installation:

```bash
./installer.sh --ingest-url https://<worker>.workers.dev/api/v1/readings
```

The installer performs only these actions:

- verifies the operational-only release and development-built contract artifacts;
- installs only the device collector and device-wallet workspace dependencies;
- runs small device-only tests;
- installs a resource-limited `measurement-edge-agent.service`;
- enables persistent journald storage and one-minute connectivity/resource snapshots.

It explicitly rejects the old `--proof-server-url`, `--skip-compact-install`, and `--skip-verify` options. It never invokes `compact`, `contract:compile`, repository-wide `verify`, Wrangler, Docker, deployment, or wallet initialization. It writes `.host-role=device`; development and contract commands fail before doing work.

Initialize the operational wallet explicitly as the service user, fund its displayed address, then use it only for recurring device transactions:

```bash
npm run device:wallet
npm run device:funding
npm run device:submit -- --input data/<prepared-real-dataset>.json
npm run device:status
```

`device:submit` requires real prepared input and never synthesizes measurements. Back up the device credentials directory separately from the development `.env.development` backup.

```bash
sudo systemctl status measurement-edge-agent
sudo journalctl -u measurement-edge-agent -f
curl http://127.0.0.1:8788/health
```

After a forced reboot, inspect the preceding boot:

```bash
sudo pi-forensics-report -1
```

The report includes kernel power/thermal/OOM/storage events, network and SSH events, and the periodic health snapshots. It omits Wi-Fi identifiers, credentials, wallet data, raw sensor readings, and application secrets.

For local Edge-only development without systemd:

```bash
npm run edge:test
npm run edge:serve
```

## Security boundary

The development wallet exists only in `.env.development`; its encrypted/offline backup is the recovery copy. The independent device wallet exists only below `~/.midnight/midnight-cloudflare-demo/device-wallet/`. `.env.device` contains operational configuration but no wallet mnemonic or seed. The Pi receives compiled runtime artifacts, never Compact sources or proving-key generation tooling. Browser APIs expose none of these values.

See [system architecture](docs/system_architecture.md), [private-state specification](docs/private_spec.md), and the [deployment runbook](docs/demo_runbook.md).

## References

- [Midnight developer documentation](https://docs.midnight.network/)
- [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare Containers documentation](https://developers.cloudflare.com/containers/)
