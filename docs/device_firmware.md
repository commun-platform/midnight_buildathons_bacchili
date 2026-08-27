# Midnight Sensor Device Firmware

This package contains only the Raspberry Pi device runtime. It is produced on a development PC by `package_archive.sh` and contains no development wallet, Compact source, compiler, proving-key generator, Cloudflare deployment code, or browser application.

## Included runtime

- temperature collector and loopback health endpoint;
- operational device-wallet client for an already-deployed contract;
- development-built Compact runtime artifacts with integrity manifests;
- `installer.sh`, the systemd installer, and persistent diagnostic logging.

The development/deployer wallet is not part of this package. Device wallet credentials are created only on the Raspberry Pi below `~/.midnight/midnight-cloudflare-demo/device-wallet/`; they must never be placed in `.env.device`.

## Install on Raspberry Pi

```bash
tar -xzf midnight-sensor-device-fw-<version>.tar.gz
cd midnight-sensor-device-fw-<version>
cp .env.device.example .env.device
chmod 600 .env.device
```

Configure the remote Proof Server URL/token, Worker ingestion URL/token, deployed contract address, and sensor settings in `.env.device`. The firmware archive is deployment-neutral and never embeds an address from the development host. Do not add a mnemonic or seed.

```bash
./installer.sh
```

The installer verifies the release and contract-artifact manifests before installing only production dependencies. It does not compile Compact, generate proving keys, run Docker, deploy a contract, or install development tooling.

After installation:

```bash
sudo systemctl status measurement-edge-agent
curl http://127.0.0.1:8788/health
sudo journalctl -u measurement-edge-agent -f
```

Initialize the separate device wallet explicitly as the service user when transaction submission is required:

```bash
npm run device:wallet
npm run device:funding
npm run device:submit -- --input /path/to/prepared-real-dataset.json
npm run device:status
```

Back up the device-wallet directory separately from the development PC's `.env.development` backup.
