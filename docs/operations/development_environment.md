# Development Environment

[日本語版](../ja/operations/development_environment.md)

This document covers development-only setup, compilation, verification, deployment preparation, and release creation. Device installation and runtime operations are documented separately in [Device Firmware](device_firmware.md); the ordered end-to-end procedure is in the [Deployment and Review Runbook](demo_runbook.md).

## Prerequisites

- Node.js `22.15.0` or later;
- Compact Developer Tools `0.5.2` with toolchain `0.31.1`;
- authenticated Wrangler access;
- a funded Midnight Preprod development wallet for deployment.

## Initial setup and verification

```bash
npm ci
compact update 0.31.1
cp .env.development.example .env.development
cp apps/proof-gateway/.dev.vars.example apps/proof-gateway/.dev.vars
npm run contract:compile
npm run verify
```

Contract artifacts and proving keys are generated here, never on the Edge Device. The development wallet recovery source is `.env.development`; back it up to encrypted or offline storage. `.state/development/` is resumable synchronization and deployment cache, not a wallet backup. For the legacy mixed layout, run `npm run development:wallet:migrate` before initializing a new wallet.

## Development-only benchmark profiles

Experimental fixed daily profiles are used only by the benchmark CLI. They are not part of `npm run verify`, the device firmware, or the operational `sensor-registry` submission path.

```bash
ATTESTATION_SAMPLE_COUNTS=24 npm run attestation:compile
```

Measured results and the standard 1,440-reading procedure are maintained in the [Cost Benchmark](../implementation/cost_benchmark.md). The 24/96 runs demonstrate fixed-circuit equivalence; they are not separate cost profiles.

## Deployment and device release

```bash
npm run cloudflare:deploy
npm run development:wallet
npm run development:funding
npm run development:deploy:cloudflare -- --device-authority <public-32-byte-hex>
npm run cloudflare:config:network
npm run cloudflare:config:contract
npm run development:status
./package_archive.sh
```

The network label and deployed contract address are Worker environment bindings and are not committed. `package_archive.sh` exports compiled artifacts and builds a secret-free operational archive. Transfer only the generated firmware archive and checksum to the Edge Device; never transfer `.env.development`, `.dev.vars`, `.state/development/`, development-wallet recovery material, or private development inputs.

Device registration, policy assignment, and the complete supervised review sequence are defined in the [Deployment and Review Runbook](demo_runbook.md).

## Sponsor Wallet runtime and shutdown recovery measurements

The recovery path was measured on 2026-08-29 with Node.js `22.15.0`, Wallet SDK `1.2.0`,
Midnight.js `4.1.1`, Wrangler `4.127.0`, and Cloudflare Containers SDK `0.3.7`. The local test used a
non-secret deterministic test seed, an actively synchronizing Preprod wallet, and an R2-compatible
private HTTP receiver. It did not measure production Container startup or image-pull time.

| Operation | Measured result |
| --- | --- |
| Incremental diagnostic image overlay build | 0.78 s wall, 0.08 s user, 0.07 s system, 63,616 KiB maximum RSS |
| Serialize latest synchronizing state | 6 ms |
| Encrypt and upload checkpoint | 87,331 bytes; 9 ms upload |
| Wallet SDK stop | 15 ms |
| End-to-end `docker stop` | 0.45 s; exit code 0; no OOM kill |

The same versions were measured in the deployed Cloudflare Container on 2026-08-29. `standard-4`
is an intentionally oversized feasibility baseline, not the production minimum:

| Cloudflare operation | Measured result |
| --- | --- |
| `basic` initial replay | 0.241–0.244 of 0.25 allocated vCPU (96.4–97.6%); 212,576–215,864 KiB RSS; health probe starved |
| `standard-4` allocation | 4 vCPU, 12 GiB memory, 20 GB disk, one private-network instance |
| `standard-4` initial replay | 1.00–1.15 CPU cores; approximately 295–306 MB RSS; no CPU throttling observed |
| Health Supervisor under active Preprod replay | Five parallel `/health` calls: 0.851–1.151 ms each; all HTTP 200 |
| Wallet facade initialization | 0.901 s |
| Preprod WebSocket establishment | 1.025–1.260 s |
| Shielded and unshielded base synchronization | 192.711 s; unshielded index 576,777 and shielded index 1,463,245 complete |
| Configuration-only `standard-4` deployment | 16.98 s wall; 382,336 KiB local maximum RSS |
| Full repository `npm run verify` after Supervisor implementation | 58.32 s wall; 59.38 s user; 12.15 s system; 865,416 KiB maximum RSS; all checks passed |
| Sponsor Wallet Container image build in that verification | 22.9 s wall |

The measurements show that memory was not the initial bottleneck. The `basic` CPU limit starved the
Node.js event loop while Wallet SDK replay consumed approximately one core. Extra `standard-4` cores
provide operating margin but do not make a predominantly single-core replay four times faster. The
runtime waits for complete DUST-wallet replay before registration cost estimation, DUST generation,
registration submission, and readiness. Final sizing must be based on a warm restore and sponsored
transaction run after this feasibility test.

The pre-fix adverse-network run persisted a 220,225-byte checkpoint in 10 ms but the SDK WebSocket
shutdown did not finish before the 60-second local stop deadline. The implemented order therefore
persists state first and limits the subsequent SDK stop wait to 45 seconds. Serialization and active
mutation waits are separately bounded. Cloudflare's signal-driven shutdown uses this immediate path;
the five-minute synchronizing checkpoint remains the fallback for a process that cannot handle a
signal.
