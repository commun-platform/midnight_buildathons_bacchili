# Midnight Sensor Device Firmware

This package contains only the Raspberry Pi device runtime. It is produced on a development PC by `package_archive.sh` and contains no development wallet, Compact source, compiler, proving-key generator, Cloudflare deployment code, or browser application.

## Included runtime

- temperature collector and loopback health endpoint;
- operator-invoked device-wallet CLI for an already-deployed `sensor-registry` contract;
- development-built Compact runtime artifacts with integrity manifests;
- `installer.sh`, the systemd installer, and persistent diagnostic logging.

The development/deployer wallet is not part of this package. Installed runtime, configuration, and device wallet state are consolidated below `~/.midnight/midnight-cloudflare-demo/`. Device wallet credentials are created only in `device-wallet/`; they must never be placed in an environment file.

## Install on Raspberry Pi

```bash
tar -xzf midnight-sensor-device-fw-<version>.tar.gz
cd midnight-sensor-device-fw-<version>
cp .env.device.example .env.device
chmod 600 .env.device
```

Configure the remote Proof Server URL/token, Worker ingestion URL/token, deployed contract address, and sensor settings in the staged `.env.device`. The firmware archive is deployment-neutral and never embeds an address from the development host. Do not add a mnemonic or seed. After validation, the installer moves the file to `~/.midnight/midnight-cloudflare-demo/config/device.env` and removes the staged copy.

Create the staged file only for the first installation. Upgrades reuse the installed `config/device.env`; if a new archive contains a staged file that differs, the installer refuses to guess which configuration should win.

```bash
./installer.sh
```

The installer verifies the release and contract-artifact manifests, copies the release to `releases/<version>-<manifest-hash>/`, and installs only production dependencies for the collector and device-wallet workspaces. It changes `current` only after those checks and device tests pass; the former target becomes `previous`. It creates a systemd service only for the collector; the wallet remains an explicit CLI. It does not compile Compact, generate proving keys, run Docker, deploy a contract, initialize a wallet, or install development tooling.

Installed layout:

```text
~/.midnight/midnight-cloudflare-demo/
├── config/device.env
├── current -> releases/<active-release>
├── previous -> releases/<previous-release>
├── releases/<version>-<manifest-hash>/
└── device-wallet/
```

The extracted archive can be removed after installation. To roll back and swap the two symlinks:

```bash
~/.midnight/midnight-cloudflare-demo/current/installer.sh --rollback
```

Only operating-system integration remains outside this tree: the systemd units, persistent-journal configuration/report helpers, and an installer-managed Node.js runtime when the host lacks a suitable version. No project source, device configuration, or wallet state is stored with those OS files.

After installation:

```bash
sudo systemctl status measurement-edge-agent
curl http://127.0.0.1:8788/health
sudo journalctl -u measurement-edge-agent -f
```

Initialize the separate device wallet explicitly as the same non-root service user selected by the installer when transaction submission is required:

```bash
cd ~/.midnight/midnight-cloudflare-demo/current
npm run device:wallet
npm run device:funding
npm run device:submit -- --input /path/to/prepared-real-dataset.json
npm run device:status
```

`device:submit` accepts either a real `SensorRecord[]` or `PreparedDataset`. Array input may use `--min`, `--max`, and `--selected-index`; `--verify-only` skips registration for an existing root. Submission is not scheduled and does not update a Worker Attestation record. The collector only uploads readings to D1.

Back up `config/device.env` and the entire `device-wallet/` directory separately from the development PC's `.env.development` backup. The wallet directory contains recovery credentials, encrypted private datasets, the private-state password, and wallet synchronization cache. Release directories and symlinks can be recreated from signed/checksummed firmware archives.
