# Deployment and Review Runbook

[日本語版](ja/demo_runbook.md)

## 1. Prepare

1. On the development server, run `npm install` and `npm run verify`.
2. Copy `.env.development.example` to `.env.development` and configure a strong `DEVELOPMENT_PRIVATE_STATE_PASSWORD`.
3. Run `npm run cloudflare:deploy` to create the Worker, D1, GUI, and Container.
4. Register three independent secrets with `cloudflare:secret`, `secret:ingest`, and `secret:attestation`.
5. Run `npm run development:wallet`, back up `.env.development` securely, fund the displayed address, and confirm it with `npm run development:funding`.
6. Run `npm run development:deploy`; preserve `.state/development/` only as resumable cache. Set the returned address through `npm run cloudflare:config:contract` and copy it to `DEVICE_CONTRACT_ADDRESS` in the Pi's `.env.device`. Set the public network label through `npm run cloudflare:config:network`.
7. Run `./package_archive.sh`; it exports the compiled artifacts internally without embedding the deployment address. Transfer only the resulting `.tar.gz` and `.sha256` files from `.device-release/archives/` to the Pi.

## 2. Start the Edge Device

```bash
sha256sum -c midnight-sensor-device-fw-<version>.tar.gz.sha256
tar -xzf midnight-sensor-device-fw-<version>.tar.gz
cd midnight-sensor-device-fw-<version>
cp .env.device.example .env.device
chmod 600 .env.device
./installer.sh --ingest-url https://<worker>.workers.dev/api/v1/readings
npm run device:wallet
sudo systemctl status measurement-edge-agent
curl http://127.0.0.1:8788/health
sudo journalctl -u measurement-edge-agent -f
```

The default sensor path is `/sys/class/thermal/thermal_zone0/temp`. Change `TEMPERATURE_SENSOR_PATH` for another sysfs-compatible sensor. The Worker contains no sample readings or transaction fallback; the GUI remains empty until this service successfully uploads a real value.

The device wallet is stored only below `~/.midnight/midnight-cloudflare-demo/device-wallet/`; back it up separately from `.env.development`. Do not run `npm run verify`, Compact compilation, proof benchmarks, development-wallet commands, Wrangler, Docker, or deployment commands on the Pi. The installer enables persistent journald and health snapshots; after a forced reboot run `sudo pi-forensics-report -1`.

## 3. Review Flow

1. Open Project Overview and confirm **Temperature Sensor** / **温度センサー** is the only device.
2. Confirm the latest card and `lastSeenAt` change after an upload.
3. Open Time-Series Data and filter normal versus outlier values.
4. Open Daily Proof History after the scheduled workflow has created an Attestation.
5. Select its transaction to open Third-Party Verification.
6. Show that Merkle inclusion and private range are verifiable while the raw value, threshold, nonce, and Merkle path remain private.
7. Compare the Dataset Tx, Verify Tx, and block heights with `npm run device:status`.
8. Switch System, English, and Japanese in the header and confirm the choice persists after reload.

## 4. QA Evidence

```bash
npm run test -w @midnight-demo/shared
npm run test -w @midnight-demo/sensor-registry-contract
npm run test -w @midnight-demo/proof-gateway
npm run verify
```

Contract tests cover valid data, out-of-range data, raw-value tampering, and Merkle-path tampering. Worker tests cover authentication, sensor metadata validation, redaction, scheduling, and storage behavior.

## 5. Destroy

```bash
npm run cloudflare:destroy
```

Confirm that `midnight-proof-gateway` is gone in Cloudflare. Preserve the development `.env.development` backup and the separate device-wallet backup before securely deleting cache or data content.
