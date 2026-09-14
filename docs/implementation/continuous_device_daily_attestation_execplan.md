# Restore continuous sensor collection and automatic daily Midnight records

This ExecPlan is maintained under `.agents/PLANS.md`. All times in the evidence below explicitly identify their time zone.

## Purpose / Big Picture

The physical Raspberry Pi must collect temperature continuously and automatically record each completed operational day on the existing Midnight Preprod contract. Collection must continue during proving, sponsorship waits, network failures, and transaction retries. Operators can verify collection through the local health endpoint and verify daily completion through a durable receipt containing the confirmed transaction hash.

## Progress

- [x] (2026-09-07 14:11Z) Identified the direct stop command in the Device sudo journal and established that no daily submission timer exists.
- [x] (2026-09-07 14:12Z) Restarted the existing collector; confirmed fresh real measurements and delivery of the previously unfinished hourly window.
- [x] (2026-09-07 14:24Z) Implemented durable completed-day preparation, nonblocking job admission, catch-up, retries, and confirmed receipts.
- [x] (2026-09-07 14:24Z) Added collector recovery and daily submission timers to the firmware installer and documented maintenance and rollback.
- [x] (2026-09-07 14:28Z) Validated 43 transaction tests, 18 collector/installer tests, all-workspace typecheck, portability, archive checksum, 103 release files and 36 generated runtime artifacts.
- [x] (2026-09-07 14:29Z) Installed firmware `0.1.0-continuous-daily-20260907.2` on the Device. Device-side tests passed (6 identity tests, 16 collector tests with 2 development-only skips, 42 transaction tests with 1 development-only skip). New collector health was successful.
- [x] (2026-09-07 14:38Z) User confirmed stopping the competing operation. Restarted collector and recovery timer; fresh hardware samples continue every 60 seconds.
- [x] (2026-09-07 14:56Z) Confirmed real September 5 data on Midnight Preprod while collection continues: 1,439 samples, 24 observed hours, block 2446724, transaction hash `832152cf417a9d6228720822144c006e7a2db2a17f7b3fbf9152a3a1c2bbfc93`. Automatic processing advanced to September 6 without operator input.
- [x] (2026-09-07 15:02Z / September 8 00:02 JST) Confirmed September 6 (block 2446764), independently matched both owner-only receipts to verified on-chain metadata, observed an automatic no-op repeat with no duplicate submission, and verified restored 02:00 JST scheduled Sponsor mode. Collector and both timers are enabled and active, with fresh measurements and successful upload across midnight.

## Surprises & Discoveries

The stop was an explicit administrative command, not a process crash. At 2026-09-07 10:35:06 JST, sudo recorded `claw : PWD=/home/claw ; USER=root ; COMMAND=/usr/bin/systemctl stop measurement-edge-agent.service`. The systemd service uses `Restart=on-failure`, which cannot reverse an explicit stop. The human or automation behind the shared `claw` account is not established by this evidence.

The firmware currently installs only the collector service. Transaction submission is an operator-invoked CLI. A Cloudflare daily admission schedule cannot submit private data that remains solely on the Device without a Device-side caller.

The collector stores raw samples as UTC-date NDJSON files with `measuredAt` and `value` fields. Its authenticated operational assignment currently defines days starting at midnight Japan time (UTC offset 540 minutes). One such day spans two raw files. Daily preparation generates a random nonce, so the prepared private input must be persisted before requesting a Proof Job to keep retries identical.

Live deployment exposed an already-running manual `submit` process (PID 1397174, started 10:02:53 JST) retaining the wallet lock while Proof Job `proof-409e4e099a0635924ab60a000d1d438cc986bbc1d45ec735` waits for the existing daily 02:00 JST Sponsor schedule. Its input contains 1,439 real samples for September 5 in Japan time. The automatic command correctly refused to overwrite the active lock.

After successful installation, a separate SSH session (systemd session 4221, working directory of the Device user) ran `systemctl stop measurement-edge-agent.timer measurement-edge-agent.service` at 23:30:37 JST. This was not an installer command; the installer ran from its extracted archive directory and had completed. Configuration cannot safely guarantee continuous collection while another authorized session deliberately stops both service and recovery timer.

## Decision Log

Keep collection and daily submission in separate processes. Add a finite `daily-submit` operation to the existing operational transaction CLI, invoked by a systemd timer, rather than putting wallet or proving imports in the collector. This preserves the monorepo ownership boundary and lets collection continue during expensive or unavailable remote operations.

Use the authenticated assignment's operational-day boundary and validity period. Only closed days are eligible; gaps remain absent hours in the fixed 24-hour proof. Never synthesize readings for the outage. Persist private preparation with owner-only permissions and atomic durable writes before network submission. Persist a public receipt only after the existing Midnight confirmation path succeeds.

Poll eligibility periodically and return when Cloudflare has queued a job but has not admitted it. Reuse the existing deterministic Proof Job identifier and pending serialized transaction mechanism. This supports the Sponsor's existing operating schedule without holding a process lock for most of the day.

Use a collector timer to re-activate an inactive collector. An explicit maintenance stop must stop its timer as well. Installer upgrades must suspend timers during the short activation phase and recover the previous running service if activation fails.

Rotate bounded retry batches with a durable cursor so permanently failing old dates cannot prevent newer dates from being attempted. Retain SDK failure details in an owner-only error file because exceptions may contain private proof data; public reports include only safe input diagnostics or a generic submission failure.

Temporarily switch the existing Sponsor mode from scheduled to on-demand for live verification, retaining its 02:00 JST schedule parameters. A workstation watchdog restores scheduled mode after 20 minutes or an explicit completion marker. The legacy manual process exited before private-state preparation or transaction creation; its old Proof Job remains only `ready_for_input`, without transaction identifiers. No receipt can be adopted from that unconfirmed job. Submit actual retained raw data through the new durable daily path; never invent a confirmation or attempt to reuse the lost in-memory nonce.

## Outcomes & Retrospective

The collector resumed at 2026-09-07 23:12:17 JST, immediately delivered the 36 samples retained from the 10:00 hourly window, and continued fresh readings. The verified new firmware was installed at 23:29 JST and both timers initially started. A competing SSH session stopped the collector and recovery timer at 23:30:37 JST; after the user stopped the competing work, collection resumed at 23:38:21 JST and remains healthy. All three persistent units are enabled. The obsolete unsubmitted manual job has been backed up and removed.

Both automatic daily submissions are now confirmed on Midnight Preprod. September 5 and 6 each contain 1,439 real measurements, 24 observed hours, zero entirely stopped hours, and a satisfied registered upper-bound policy. The Midnight ledger reports `verified=true` for both; their public commitments, identity/assignment keys, day boundaries, hour presence, sample counts, and schema versions match the Device's mode-0600 receipts. The contract attestation count increased from 18 to 20. At September 8 00:00:00 JST the daily service reported both dates confirmed with no failures; the timer's next invocation completed at 00:00:20 with no submissions, proving the confirmed-day skip on the real Device.

The bounded on-demand verification window restored `mode=scheduled`, UTC offset 540, processing start minute 120 (02:00 JST). Sponsor startup briefly reported a warmup failure, then recovered through its existing retry path to fully synchronized `ready`; no additional backend code, funding, or wallet-key change was needed. Collector PID 1473265 stayed unchanged with zero restarts from 23:38 through the final 00:01 check, measured successfully across midnight, and uploaded the closed hourly window at 00:00:21 JST. Health has zero consecutive failures and an empty outbox. September 7's actual outage must remain missing observations; that newly closed day becomes eligible at 00:05 JST for the normal 02:00 JST processing cycle.

Confirmed public transaction evidence:

| Operational day (JST) | Samples | Observed hours | Block | Transaction hash |
| --- | ---: | ---: | ---: | --- |
| 2026-09-05 | 1,439 | 24 | 2446724 | `832152cf417a9d6228720822144c006e7a2db2a17f7b3fbf9152a3a1c2bbfc93` |
| 2026-09-06 | 1,439 | 24 | 2446764 | `26b7872adbecd1cf811fbb61b48f3177295c80bfddd3d8a5e51d95bd3ac97bb5` |

## Context and Orientation

`edge-device/sensor-collector/src/collector.ts` owns collection, hourly uploads, local raw files, and `http://127.0.0.1:8788/health`. It must not import a wallet or contract. `edge-device/midnight-transaction-agent/src/cli.ts` owns finite operational commands and uses `proof-job.ts` for authenticated admission and sponsorship. `midnight.ts` verifies confirmed transactions against the Midnight indexer. `shared/measurement-protocol/src/index.ts` prepares the fixed 24-slot minimum/maximum proof input; `operational-day.ts` maps local dates to UTC boundaries. `edge-device/release/device-installer.sh` installs versioned firmware under the Device user's `.midnight/midnight-cloudflare-demo` tree. The release builder and verifier explicitly enumerate allowed npm scripts.

The real target is the locally configured SSH alias `midnight-device`, user `claw`. Resolve its address from the operator's SSH configuration. Secrets, private inputs, and raw data stay on that machine. Read only redacted status and public transaction evidence back to the development host.

## Plan of Work

First add a testable daily submission module beside the transaction CLI. It reads complete UTC shards for each closed operational day, validates timestamps and values, constructs sensor records for the existing preparation function, and retains the exact prepared input and source digest. Subsequent calls verify the same source before resuming. A success receipt prevents repeated submissions. Configuration changes, corrupted input, and source tampering must fail closed. Missing entire days after collection began must be represented as STOPPED.

Next extend the CLI with `daily-submit`, using its existing execution lock and confirmation code. A queued Proof Job returns a pending result promptly. The release package includes this operation and the installer adds a separate bounded oneshot service with a recurring timer. The collector's own recovery timer restores it after an accidental service stop; maintenance and rollback coordinate both timers.

Finally run component tests, type checking, portability validation, and firmware build verification. Transfer the verified archive to the Device, install using its normal installer, and validate fresh samples across multiple intervals. Submit retained completed days through the same production path and record confirmed public transaction hashes. Document the actual outage as missing observations.

## Concrete Steps

Run development commands from the repository root containing `package.json`. Use `npm run test -w @midnight-demo/device-wallet-agent`, `npm run edge:test`, `npm run typecheck`, and `npm run verify:portability`. Build firmware with `./edge-device/release/package_archive.sh --version <unique-version>` after ensuring compiled contract artifacts are present.

On the Device, inspect `systemctl status measurement-edge-agent.service`, its recovery timer, the daily submission service and timer, and `curl http://127.0.0.1:8788/health`. Daily confirmation must produce an owner-only receipt below `device-wallet/daily-attestations/` with the operational date, sample and observed-hour counts, attestation commitment, and confirmed transaction hash.

## Validation and Acceptance

Tests must cover Japan-midnight grouping across two UTC files, current-day exclusion, zero-data and partially observed days, bounded catch-up, random-input persistence across retries, rejected source changes and malformed files, no duplicate after confirmation, and retry after failed or deferred remote work. Installer checks must prove that recovery does not interrupt an active collector and maintenance suspends both timers. A successful live check requires multiple fresh measurements, both timers enabled, and an actual confirmed Midnight transaction for a completed real operational day.

## Idempotence and Recovery

Use immutable preparation and a stable Proof Job identifier. Keep the serialized pending transaction already managed by `pending-transaction.ts`. Never discard raw files, private preparation, or wallet material. Keep the previous firmware symlink and support rollback. Do not label a queued or submitted transaction as confirmed. A maintenance stop disables both timers before stopping the corresponding services; normal operation enables both timers and starts collection.

## Artifacts and Notes

Initial recovery health: `sensorMode=hardware`, `intervalSeconds=60`, `lastError=null`, `consecutiveFailures=0`, `outboxCount=0`. The installed assignment uses `TIME_ZONE_OFFSET_MINUTES=540`, `LOCAL_DAY_START_HOUR=0`, `UTC_DAY_START_MINUTE=900`.

## Interfaces and Dependencies

The daily module accepts a `DeviceOperationConfiguration`, a raw-data directory, an owner-only state directory, a clock value, and an injected submission callback returning a confirmed `SubmissionResult` or null when deferred. It uses the existing shared `prepareDailyExtremaAttestation`, `operationalPeriodStart`, and `operationalPeriodDate` helpers. No new SDK, compiler, Cloudflare deployment, or contract is required.

Revision 2026-09-07: Created after identifying the stop command and missing daily automation; records the successful immediate collection recovery and the implementation and live-verification work still required.

Revision 2026-09-07 14:34Z: Recorded passing tests and deployed firmware, durable retry fairness and private failure diagnostics, and the two observed operational conflicts preventing final live confirmation. No Sponsor operating-mode change has been made.

Revision 2026-09-07 14:45Z: User stopped competing work. Restored continuous collection and began a bounded, automatically restored on-demand verification window. Verified the old manual process exited without producing a transaction, then enabled the automatic daily service for retained real data.

Revision 2026-09-07 14:49Z: The first automatic run exposed the Backend's unique `(device_id, period_date)` constraint: the abandoned September 5 manual job prevents a replacement even with a different measurement group. Confirmed through the Midnight indexer that neither September 5 nor September 6 is already attested, and checked that the old job has no proof artifact, Device/Sponsor transaction, or quota reservation. Durably backed up its complete D1 row with mode 0600 at `.state/operations-recovery/2026-09-07/proof-409e4e099a0635924ab60a000d1d438cc986bbc1d45ec735.unsubmitted-backup.json` (SHA-256 `39f1dc1797b0b28213f7050a2dd7cf9a5e086321694ea757e1fb1821b35ccc39`). Removed only that exact unsubmitted row using conditional checks on its unchanged status/timestamp and absent artifacts. No sensor data, wallet material, or on-chain record was removed. Automatic September 5 and 6 preparations each contain 1,439 real samples across all 24 hours and are retained on the Device.

Revision 2026-09-07 15:02Z: Completed live acceptance, independently verified both receipts against the ledger, observed automatic duplicate prevention, confirmed the restored Sponsor schedule and healthy midnight rollover, and recorded final transaction evidence. No required implementation or live-verification work remains.
