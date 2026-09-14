# Protect continuous collection from stale test cleanup

This ExecPlan is maintained under `.agents/PLANS.md`. Its progress and decisions must remain current. All incident times below use Japan Standard Time (JST, UTC+09:00).

## Purpose / Big Picture

Continuous temperature collection must survive the obsolete administrative stop command used by a completed one-day test. Operators must still have an explicit maintenance operation for firmware activation or rollback. After this change, a direct stop of the collector and its recovery timer is refused by systemd, while starting a named maintenance target intentionally stops the relevant units. Starting normal operation leaves maintenance.

## Progress

- [x] (2026-09-08 21:02Z) Started the stopped collector and recovery timer on `midnight-device`; hardware collection resumed with no failures.
- [x] (2026-09-08 21:03Z) Confirmed successive hardware measurements and the unchanged collector PID.
- [x] (2026-09-08 21:07Z) Matched the September 8 00:06:58 stop in the Device sudo journal to an old Codex heartbeat and verified that heartbeat is already deleted.
- [x] (2026-09-08 21:16Z) Implemented guarded systemd units and maintenance-aware installer activation and rollback; all 20 collector/installer tests passed.
- [x] (2026-09-08 21:16Z) Verified direct-stop rejection with a stable fixture PID, maintenance stop, inactive guarded restart rejection, and normal resumption on systemd 257.
- [x] (2026-09-08 21:16Z) Installed additive protection on the running Device. The exact incident command was refused for both real units; PID 1647824 remained active with zero restarts and 15 fresh measurements.
- [x] (2026-09-08 21:17Z) Documented the incident, maintenance procedure, and old-installer compatibility constraint in English and Japanese.
- [x] (2026-09-08 21:19Z) Confirmed post-rejection measurements advanced from 15 to 17 with the unchanged PID and zero failures/restarts, removed the seven isolated test unit files, and passed portability and diff checks.

## Surprises & Discoveries

The Device sudo journal records `systemctl stop measurement-edge-agent.timer measurement-edge-agent.service` at September 8 00:06:58 JST. Both units stopped successfully; there was no crash. The old `edge-24h-zkp-tx` heartbeat began its final turn at 00:01:21 JST and issued this stop as completion cleanup for the September 5 one-day test. It deleted itself at approximately 00:07 JST. Current automations contain no instance of this heartbeat. The prior continuous-operation rollout had already restored both units at 23:38 JST, so this stale cleanup overrode newer operation.

The collector health endpoint always returns `ok: true` when reachable. Collection success therefore requires advancing `lastMeasurementAt` and `activeWindowCount`, an unchanged process/start time, and checking `lastError`, `consecutiveFailures`, and `outboxCount`. A minute recovery timer and `Restart=always` cannot recover when an administrator explicitly stops both service and timer.

## Decision Log

Use systemd `RefuseManualStop=yes` in additive drop-in files for the collector service and recovery timer. This blocks the exact incident command and direct restart requests without changing sensor or wallet code. It is an accidental-operation guard, not a security boundary against a privileged operator who deliberately changes unit configuration.

Use a named, non-enabled `measurement-edge-agent-maintenance.target` with `Conflicts=` and `After=` for the collector, recovery timer, daily submission service, and daily timer. A target is a systemd grouping unit with no process; starting it causes the conflicting units to stop through dependency management. The ordering ensures maintenance activation waits for stops to finish. Normal starts conflict with the target and leave maintenance automatically. Maintenance remains explicit and is never started merely because a proof, benchmark, or monitoring task finishes.

Preserve the current installer fallback for older unguarded installations. Guard-aware upgrades record previously active units, enter the maintenance target, switch the release, and use `start`, not direct `restart`, to leave maintenance. Preserve `--no-start` and the existing cleanup resumption behavior. Do not broaden this fix into unrelated installer rollback reliability changes.

Apply only the generated systemd protection files to the live Device. The current firmware runtime, private data, and running collector process need no replacement. Preserve existing local worktree changes. Firmware packaging for future installs will reproduce the guard through the patched installer.

## Outcomes & Retrospective

Implementation, 20 component tests, isolated systemd validation, and real Device protection installation succeeded. Direct stop was refused for both real units. At September 9 06:18:51 JST the collector and both timers were active and enabled; collector PID 1647824 was unchanged, restarts were zero, and successful hardware measurements had advanced from 15 before the rejection test to 17 afterward, last measured at 06:18:32 JST. Health reported no error, no consecutive failures, and no pending uploads. The daily service's latest exit was successful at 06:15:19 JST. The seven isolated test unit files were removed after their processes stopped, and no fixture units remained loaded. Source portability and diff checks passed. The actual collection outage remains missing measurements and must not be filled with synthetic data. The old heartbeat cannot fire again because it has already been deleted. This was an additive systemd update: the installed immutable firmware runtime was not replaced, and the updated installer in source must be packaged for the next firmware upgrade or rollback.

## Context and Orientation

`edge-device/release/device-installer.sh` generates the systemd service and timers. It stops existing units in `stop_existing_service`, starts the collector in `install_systemd_service`, and handles rollback in `rollback_release`. `edge-device/sensor-collector/src/install-layout.test.ts` executes extracted installer functions against controlled temporary directories and mocked systemctl calls. `docs/operations/device_firmware.md` and its Japanese translation describe normal operation and maintenance.

The real Device is the configured SSH alias `midnight-device`, user `claw`. Its collector is `measurement-edge-agent.service`, recovery timer is `measurement-edge-agent.timer`, and daily submission uses `measurement-edge-agent-daily.service` and `.timer`. The installed runtime is below `.midnight/midnight-cloudflare-demo/current` in the service user's home directory. Do not read or copy credentials or private raw values.

## Plan of Work

Add `install_collector_stop_guard` to the installer. Generate one drop-in per protected unit under `/etc/systemd/system/<unit>.d/20-continuous-collection.conf`, plus the maintenance target. Install these after the existing units and reload systemd. Modify the guarded stop path to record active units before starting maintenance, while retaining the previous path if the target is absent. Replace collector restart calls with starts after maintenance stops have completed.

Extend behavioral installer tests for generated protection, maintenance dependencies and ordering, guarded activation, preservation of active-unit bookkeeping, and no-start behavior. Update both operation guides to use the explicit maintenance target and describe direct-stop rejection and legacy-installer compatibility.

Verify the semantics on uniquely named isolated systemd fixture units before applying them to production names. The fixture must reject direct stops, accept maintenance activation, and resume with normal starts. Clean up only the fixture units that the test created. On the real Device, install additive protection without stopping anything, assert both RefuseManualStop properties before attempting the incident command, and confirm unchanged PID and fresh measurements after rejection.

## Concrete Steps

Run commands from the repository root containing `package.json`:

    bash -n edge-device/release/device-installer.sh
    npm run edge:test
    npm run verify:portability
    git diff --check

The systemd fixture and live installation used files generated by extracting `install_collector_stop_guard` from the installer, then invoking it with `DRY_RUN=1`, a temporary `TMP_DIR`, and a no-op `run_root`. The fixture's `SERVICE_NAME` was `measurement-stop-guard-sct-20260909`; the real pass used `measurement-edge-agent`. Fixture units under `/run/systemd/system` used only `/usr/bin/sleep infinity` and `/usr/bin/true`, with no wallet or network workload. The fixture guard used `/run` drop-ins while real protection used the documented `/etc` paths. Both passed `systemd-analyze verify`.

On the fixture, the direct two-unit stop was rejected and its initial PID 1649141 stayed unchanged. Starting the fixture maintenance target stopped all operational fixture units. Restarting the now-inactive protected fixture was still rejected, proving the old-installer constraint. Starting the fixture service and both timers succeeded and left maintenance. For the real Device, three protection files were installed and `systemctl daemon-reload` was run. After asserting both `RefuseManualStop=yes` properties, the exact incident stop command was attempted and refused; the real collector remained PID 1647824.

## Validation and Acceptance

Installer tests must show that `--no-start` leaves an existing process running; guarded activation enters maintenance only after recording previously active units; generated files protect both units and conflict with all four operational units; and old installations still stop timers before processes. Isolated systemd tests must reject the exact two-unit direct-stop shape while retaining the service PID, then successfully stop through maintenance and resume through normal start.

Live acceptance requires `RefuseManualStop=yes` for both actual units, `active` collector and timers, refusal of the obsolete stop command, no collector restart, advancing hardware measurements over multiple 60-second intervals, no health error, and an empty upload outbox. Verify the daily timer remains enabled and active. Do not create another proof or transaction to test this OS-only change.

## Idempotence and Recovery

The drop-ins and target have fixed scoped names and can be installed repeatedly. Do not overwrite different existing files without inspecting them. Keep copies of any prior same-name files before replacement. A root operator can remove only these drop-ins and target and reload systemd to undo the guard. Use the updated installer for upgrades and rollback of guarded units. Older installers issue direct `restart` even after maintenance, and systemd refuses it even when the protected service is inactive. The live protection-only update leaves the previous installer inside the immutable runtime; its next upgrade or rollback must use a newly packaged updated installer. Never remove unrelated systemd overrides.

## Artifacts and Notes

Incident evidence: Device sudo journal September 8 00:06:58 JST and local task `01a06836-4fe2-7340-bcb3-9cfa3126ce3f`, final heartbeat turn begun September 7 15:01:21 UTC. Recovery: collector PID 1647824, started September 9 06:02:29 JST, hardware measurements at 06:02:32 and 06:03:32, counts 1 and 2, zero restarts/failures/outbox entries.

## Interfaces and Dependencies

Use the Device's existing systemd manager and the installer's existing `run_root`, `TMP_DIR`, and `SERVICE_NAME` conventions. No npm dependency, contract, Cloudflare deployment, or collector runtime API change is required. Drop-ins apply in the `[Unit]` section; the maintenance target is intentionally not enabled at boot.

Revision 2026-09-09: Created after proving the stale heartbeat stop and restoring collection, to implement and validate explicit stop protection and a maintenance path.

Revision 2026-09-09 06:17 JST: Recorded passing component and isolated systemd tests, real protection deployment without a collector restart, and the observed rejection of the exact incident command. Corrected the old-installer guidance after proving inactive protected services also reject restart.

Revision 2026-09-09 06:19 JST: Completed live acceptance across post-rejection sampling intervals, verified enabled and active units, removed isolated test units, and recorded passing portability and whitespace checks. No required work remains for this incident fix.
