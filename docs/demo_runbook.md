# Deployment and Review Runbook

[日本語版](ja/demo_runbook.md)

## 1. Prepare

1. On the development server, run `npm ci` and `npm run verify`.
2. Copy `.env.development.example` to `.env.development`, configure a strong `DEVELOPMENT_PRIVATE_STATE_PASSWORD`, and copy `apps/proof-gateway/.dev.vars.example` to `apps/proof-gateway/.dev.vars` for local Worker development.
3. Run `npm run cloudflare:deploy` to create the Worker, D1, GUI, and Container.
4. Register three independent bindings with `npm run cloudflare:secret`, `npm run secret:ingest -w @midnight-demo/proof-gateway`, and `npm run secret:attestation -w @midnight-demo/proof-gateway`. Copy the proof token to `MIDNIGHT_PROOF_SERVER_TOKEN` in `.env.development`; set `MIDNIGHT_PROOF_SERVER_URL` to the deployed Worker URL plus `/proof`.
5. Run `npm run development:wallet`, immediately back up `.env.development` securely, fund the displayed address, and confirm it with `npm run development:funding`.
6. Run `npm run development:deploy`; preserve `.state/development/` only as resumable cache. Set the returned address through `npm run cloudflare:config:contract`, and set the public label through `npm run cloudflare:config:network`.
7. Run `./package_archive.sh`; it exports the compiled `sensor-registry` artifacts internally without embedding a network or deployment address. Transfer only the resulting `.tar.gz` and `.sha256` files from `.device-release/archives/` to the Pi.

## 2. Start the Edge Device

```bash
sha256sum -c midnight-sensor-device-fw-<version>.tar.gz.sha256
tar -xzf midnight-sensor-device-fw-<version>.tar.gz
cd midnight-sensor-device-fw-<version>
cp .env.device.example .env.device
chmod 600 .env.device
# Configure MIDNIGHT_PROOF_SERVER_URL/TOKEN, DEVICE_CONTRACT_ADDRESS,
# CLOUDFLARE_INGEST_URL/TOKEN, and the sensor identity/path.
./installer.sh --ingest-url https://<worker>.workers.dev/api/v1/readings
npm run device:wallet
npm run device:funding
sudo systemctl status measurement-edge-agent
curl http://127.0.0.1:8788/health
sudo journalctl -u measurement-edge-agent -f
```

The default sensor path is `/sys/class/thermal/thermal_zone0/temp`. Change `TEMPERATURE_SENSOR_PATH` for another sysfs-compatible sensor. The Worker contains no sample readings or transaction fallback; the GUI remains empty until this service successfully uploads a real value.

Run the wallet commands as the same non-root service user selected by the installer. The device wallet is stored only below `~/.midnight/midnight-cloudflare-demo/device-wallet/`; back it up separately from `.env.development`. Do not run `npm run verify`, Compact compilation, proof benchmarks, development-wallet commands, Wrangler, Docker, or deployment commands on the Pi. The installer enables persistent journald and health snapshots; after a forced reboot run `sudo pi-forensics-report -1`.

## 3. Submit an Operational Proof

The collector does not build proof input and the wallet CLI is not a daemon. Supply a JSON file containing a real `SensorRecord[]` or a previously prepared `PreparedDataset`:

```bash
npm run device:submit -- --input /secure/path/to/real-records.json \
  --min 10 --max 35 --selected-index 0
npm run device:status
```

The command registers the dataset and verifies one selected value. Use `--verify-only` only when that root is already registered. Its JSON output contains register/verify transaction metadata, but the command does not update D1 or a Worker Attestation record.

## 4. Attestation Workflow Boundary

Cron creates a `pending` record at the project's local midnight and associates the previous local day's readings. The repository exposes the following protected endpoints for an external agent:

```text
POST /api/internal/attestations/claim
POST /api/internal/attestations/<attestation-id>/result
```

The first claim changes `pending` to `aggregating`. The result endpoint accepts `aggregating`, `proving`, `submitted`, `confirmed`, or `failed` plus roots and transaction metadata. Both use `ATTESTATION_API_TOKEN`. No polling agent, D1-to-dataset conversion, submission bridge, transaction confirmation watcher, or chain-validation callback is included, so do not mark a record `confirmed` until an external trusted agent has actually verified the transaction.

## 5. Review Flow

1. Open Project Overview and confirm **Temperature Sensor** / **温度センサー** is the only device.
2. Confirm the latest card and `lastSeenAt` change after an upload.
3. Open Time-Series Data and filter normal versus outlier values.
4. Open Daily Proof History after Cron has created a pending Attestation.
5. If an external agent has reported a real confirmed transaction, select the record to open Third-Party Verification.
6. Confirm that the view omits the raw proof value, threshold, nonce, and Merkle path. Its checks and transaction metadata are read from D1; the browser does not independently query Midnight.
7. Compare the reported Dataset Tx, Verify Tx, and block heights with `npm run device:status` and the Midnight Explorer.
8. Switch System, English, and Japanese in the header and confirm the choice persists after reload.

## 6. QA Evidence

```bash
npm run test -w @midnight-demo/shared
npm run test -w @midnight-demo/sensor-registry-contract
npm run test -w @midnight-demo/proof-gateway
npm run verify
```

Contract tests cover valid data, out-of-range data, raw-value tampering, and Merkle-path tampering. Worker tests cover authentication, sensor metadata validation, redaction, scheduling, and storage behavior.

`npm run verify` covers the operational `sensor-registry` path. The experimental daily profiles are separate and require explicit `npm run attestation:compile` and `npm run benchmark:daily-proof` commands on the development server.

## 7. Destroy

```bash
npm run cloudflare:destroy
```

Confirm that `midnight-proof-gateway` is gone in Cloudflare. Preserve the development `.env.development` backup and the separate device-wallet backup before securely deleting cache or data content.
