# Wave 1 Deployment and Review Runbook

[日本語版](../ja/operations/demo_runbook.md)

![Six-step judge review path from setup and enrollment through proof generation, Device signing, and public verification](../assets/guides/judge-review-path-en.png)

## 1. Development host

```bash
npm ci
npm run verify
cp .env.development.example .env.development
npm run development:wallet
npm run development:funding
npm run sponsor:wallet
npm run cloudflare:deploy
npm run cloudflare:config:network
npm run cloudflare:config:sponsor
./package_archive.sh
```

Back up `.env.development` and the owner-only Sponsor credential file separately. Fund only the
Sponsor address printed by `sponsor:wallet` with tNIGHT before enabling operations. The Cloudflare
deployment creates the Worker, D1 migrations through `0020`, Queue/DLQ, GUI assets, Proof Server
Container, Sponsor Wallet Container, and encrypted Sponsor checkpoint R2 binding. The
`cloudflare:config:sponsor` command sends the seed to Wrangler over stdin and never prints it. No
Device private key is created on this host.

Record compilation, packaging, and deployment elapsed time and maximum RSS where available in the benchmark evidence. The fixed daily profiles are separate and require explicit commands.

## 2. Edge Device installation and enrollment

Configure `.env.device` in the extracted operational archive. Use the Worker service base URL, not the retired per-reading endpoint:

```bash
sha256sum -c midnight-sensor-device-fw-<version>.tar.gz.sha256
tar -xzf midnight-sensor-device-fw-<version>.tar.gz
cd midnight-sensor-device-fw-<version>
cp .env.device.example .env.device
chmod 600 .env.device
# Set Worker/Proof URLs, Device/Project IDs, and sensor settings.
# Leave DEVICE_CONTRACT_ADDRESS empty; the authenticated Device fetches it later.
./installer.sh --no-start --ingest-url https://<worker>.workers.dev/api/v1/
```

The installer creates a P-256 Device Identity only if all identity files are absent. It preserves a complete identity and fails on partial state. Inspect the public enrollment:

```bash
cd ~/.midnight/midnight-cloudflare-demo/current
npm run device:auth:show
```

Transfer only `~/.midnight/midnight-cloudflare-demo/device-auth/enrollment.json` to a temporary protected path on the development host. Never transfer `device-private-key.pk8`. Keep it pending until the Midnight Device registration below is mirrored. On the Edge Device, generate the independent Compact Contract Authority and display only its public enrollment:

```bash
npm run device:authority:generate -- --network preprod \
  --confirm-contract-authority-generation
npm run device:authority:show -- --network preprod
```

Copy only the public `device-wallet/preprod/contract-authority/enrollment.json` value to the development operator. Never copy `authority.json`. Deploy with the separate development wallet and a process-only, 30-minute Operator Proof Lease. The command creates a separate owner-only Operator Authority, deploys the Fleet Registry, registers the initial Device, public policy, and Device-bound assignment on Midnight, then mirrors their public state to D1:

```bash
npm run development:deploy:cloudflare -- \
  --device-authority <public-32-byte-hex> \
  --policy-id temperature-v1 \
  --assignment-id edge-temp-001-temperature-v1-wave1 \
  --policy-mode closed-range --min 10 --max 35
npm run cloudflare:config:contract
```

Only after that confirmed Midnight mirror exists, activate the pending P-256 API identity. Use
`--confirm-replace` only for an approved P-256 rotation:

```bash
npm run cloudflare:device:register -- --enrollment /secure/temp/enrollment.json
```

Additional Device lifecycle commands and the mandatory E2E gate are in
[`device_registry.md`](../security/device_registry.md).

Enter the newly recorded address from `.state/development/deployment-preprod.json` when configuring
the Worker. On the Edge Device, pull the address and its bound Policy/Assignment from the authenticated Worker,
then start the collector. `device:wallet` is an optional transaction-identity diagnostic; it does not
connect to the chain, require funding, or synchronize DUST:

```bash
npm run device:configure
sudo systemctl start measurement-edge-agent
npm run device:wallet
curl http://127.0.0.1:8788/health
```

For a demonstration, set `SENSOR_MODE=synthetic`. Production defaults to `hardware`. Synthetic values originate on the device and follow the same hourly aggregate/anomaly upload path; Cloudflare receives no raw time series.

The Device is never funded. The dedicated Sponsor Wallet remains synchronized continuously. Its
Container renews its activity timeout instead of scaling to zero, while the development deployment's
one-minute Cron Trigger checks health and recovers the instance after a crash or rollout. Once
synchronization progress is available, the Worker persists an encrypted R2 checkpoint at most once
every five minutes while synchronizing and once every 30 minutes after readiness. On `SIGTERM` or
`SIGINT`, the Container first serializes and uploads its latest encrypted state through a private
Container-to-Worker route, and only then stops the Wallet SDK. A replacement restores R2 state only
when its Wallet initialization has not started. It synchronizes NIGHT/DUST centrally, adds only the
fee to an eligible bound Device transaction, and submits it. The 02:00–06:00 JST window controls
Proof Job admission, not Sponsor Wallet synchronization. No Device identity or Contract Authority
secret is sent to the Sponsor.

## 3. Proof Job and Midnight transaction

Supply a real `PreparedDailyExtremaAttestation` or raw local `SensorRecord[]` to the operator-invoked Wallet Agent:

```bash
npm run device:submit -- --input /secure/path/to/real-records.json \
  --period-date 2026-08-28 \
  --policy temperature-v1 \
  --assignment edge-temp-001-temperature-v1-wave1
```

The command deterministically creates a D1 Proof Job and polls it. The default admission window is
02:00–06:00 JST; the process can wait up to `MIDNIGHT_PROOF_JOB_WAIT_TIMEOUT_MS`. When admitted, it
uses the job ID for Cloudflare Proof Server requests, binds the proved transaction on the Edge Device
without fees, and sends the finalized bytes to the authenticated Sponsor endpoint. The Sponsor adds
DUST, submits to Midnight, and D1 records both Device and sponsored transaction evidence. A
loopback-only Device submission is rejected because it cannot cross the Sponsor policy boundary.

An authenticated development operator may admit exactly one named pending Job outside the window for a supervised integration test. This is not a Device API and requires an explicit confirmation flag. It performs the same one-Container capacity checks and creates the same two-hour private-input lease; normal deployments must use the scheduled Queue path:

```bash
npm run development:admit-proof-job -- \
  --job-id <proofJobId> \
  --confirm-integration-test
```

The contract proves the public result: WITHIN means all submitted extrema for observed hours are
inside the registered public policy; OUTSIDE means at least one observed hour is outside it. Missing
hours are public STOPPED status. The device does not submit bounds, and neither result reveals the
extrema. The claim does not prove physical readings, completeness, or correct aggregation.

For the controlled standard-use-case cost run, generate one reading per minute for a completed day;
the Device reduces the 1,440 values to 24 private hourly extrema slots before proving:

```bash
npm run device:benchmark -- --samples 1440 --period-date YYYY-MM-DD --run-id cost-1440-a --confirm-synthetic
```

Use unique run IDs. Results below `device-wallet/benchmarks/` contain timing, request size, transaction size, DUST fee, public commitment, observed/STOPPED counts, and attestation evidence, but no raw values, private hourly extrema, nonce, wallet recovery material, or Session token.

## 4. Hosted review GUI

The deployed Worker serves the Device Workflow, sensor-administrator view, and public third-party
view from one origin. No browser action requires a provisioning bridge or another localhost service.
For local asset development only, `npm run dashboard:dev` serves the same Worker routes.

Use a normal Chrome profile with a DApp Connector API 4.x-compatible Lace Wallet on Preprod and open
the deployed root. Select **English** before recording. The root starts at `#/device`; the guided flow
is:

Lace needs neither tNIGHT nor generated tDUST. It approves and binds the Device transaction with
`payFees: false`; the authenticated Cloudflare Proof Server creates the sensor-contract proof and the
dedicated Sponsor Wallet adds DUST and submits. The GUI shows the sponsorship stages and fee evidence.

1. connect Lace and approve the DApp connection in the Wallet;
2. create an ECDSA P-256 Device Identity in browser-private storage;
3. select an already registered public Threshold Policy, approve the one-time registration message
   in Lace, and submit the asynchronous registration Job. The GUI shows its Job ID and releases the
   action immediately. The server retries Wallet synchronization and registers the Device and
   Assignment without keeping the browser request open;
4. generate and upload one completed day of 1,440 synthetic readings, reduced to 24 hourly summaries,
   with the Device Session;
5. request and immediately admit one supervised Proof Job;
6. generate the contract ZK proof through the Cloudflare Proof Server, approve the fee-free Device
   transaction in Lace, and let the Sponsor Wallet add DUST and submit it; and
7. inspect the confirmed claim in the administrator and third-party views.

A deployment is not accepted from health checks, API calls, or unit tests alone. After every change
to the Dashboard, browser provisioning, Operator path, or Sponsor Wallet image, repeat at least steps
1–3 through the rendered review GUI in a normal Chrome profile. Confirm that the Device and Threshold
steps are visibly complete, no `ERROR` notice remains, `/api/v1/provisioning/devices` returns HTTP
200, and both the Device registration TX ID and Assignment TX ID are returned. A dummy signature that
stops before the Operator path does not satisfy this acceptance check.

Lace provides the Browser Device's registration identity and explicit transaction approval; it is not
the fee payer. The private Sponsor Wallet Container adds only DUST to the approved Device
transaction. For browser registration it also executes the fixed Operator-only Device and Assignment
circuits; the Worker verifies Lace first and does not expose the Operator Authority. Wallet connection,
registration signature, and Device transaction approval remain explicit user confirmations.

The **Administrator** route uses the same Device Session and displays only that Device's hourly
summaries, anomaly transitions, and Proof/TX state. The **Third-Party Verification** route is public,
newest-first, and contains no Device Session or private values.

Review the stepper in order:

1. Device registered and authenticated.
2. Hourly aggregate received.
3. Anomaly state available when a transition has occurred.
4. Proof requested/admitted.
5. Proof generated, Device transaction approved, and Sponsor fee added.
6. Midnight transaction confirmed.

After confirmation, record the same browser profile so the authenticated Device and administrator
views remain available. The recording should show Device-origin synthetic data, the pending Proof state, admission,
proof/signing, confirmation, and the third-party claim without revealing a sensor value. In the
third-party view, capture the public-only ZKP steps, the **HIDDEN FROM THIRD PARTIES** Raw
Sensor Values mask, and at least one Midnight Explorer link for available Contract/TX evidence.

## 5. Validation and cleanup

```bash
npm run sct:api
npm run sct:gui
npm run sct
npm run verify
npm run development:status
npm run device:status
```

`sct:api` covers the Worker and Sponsor Wallet API boundaries, including the queued registration
regression. `sct:gui` drives the rendered English SPA through thirteen deterministic checkpoints and
writes ignored screenshots plus `result.json` below `.sct-output/dashboard/`. See the
[SCT matrix](../implementation/sct_matrix.md) for the acceptance mapping. These deterministic SCTs
do not replace the final deployed Preprod run with real Lace approvals and Midnight transactions.

Compare public transaction evidence with the Midnight contract state before calling the demo confirmed. To remove non-production Cloudflare resources:

```bash
npm run cloudflare:destroy
```

Preserve the independent development and device wallet backups before removing any state.
