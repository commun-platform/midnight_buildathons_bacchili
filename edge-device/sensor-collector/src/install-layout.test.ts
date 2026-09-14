import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function releaseScript(name: string): string {
  const sourcePath = path.join(repoRoot, 'edge-device/release/scripts', name);
  return fs.existsSync(sourcePath) ? sourcePath : path.join(repoRoot, 'scripts', name);
}

const installer = releaseScript('install-device-release.mjs');
const migrateEnvironment = releaseScript('migrate-device-env.mjs');
const deviceInstaller = fs.existsSync(path.join(repoRoot, 'edge-device/release/device-installer.sh'))
  ? path.join(repoRoot, 'edge-device/release/device-installer.sh')
  : path.join(repoRoot, 'device-installer.sh');

test('--no-start preserves an already-running collector process', () => {
  const source = fs.readFileSync(deviceInstaller, 'utf8');
  const functionBody = source.slice(
    source.indexOf('stop_existing_service()'),
    source.indexOf('\n}\n', source.indexOf('stop_existing_service()')) + 3,
  );
  assert.match(functionBody, /if \(\( ! START_SERVICE \)\); then/u);
  assert.ok(
    functionBody.indexOf('if (( ! START_SERVICE )); then')
      < functionBody.indexOf('systemctl stop'),
    '--no-start guard must run before any service stop',
  );
});

function installerFunction(name: string): string {
  const source = fs.readFileSync(deviceInstaller, 'utf8');
  const start = source.indexOf(`${name}() {`);
  assert.notEqual(start, -1);
  return source.slice(start, source.indexOf('\n}\n', start) + 3);
}

test('automation installs independent collection recovery and finite daily retry units', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'device-unit-test-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const script = [
    'set -eu',
    'TMP_DIR="$1"',
    'SERVICE_NAME=measurement-edge-agent',
    'CURRENT_LINK=/opt/device/current',
    'ENV_FILE=/opt/device/config/device.env',
    'USER_HOME=/opt/device',
    'RUNTIME_PATH=/usr/bin:/bin',
    'NODE_BIN=/usr/bin/node',
    'DEVICE_HOME=/opt/device',
    'SERVICE_USER=device',
    'USER_GROUP=device',
    'START_SERVICE=0',
    'DRY_RUN=1',
    'run_root() { printf "%s\\n" "$*"; }',
    installerFunction('systemd_escape_value'),
    installerFunction('install_systemd_automation'),
    installerFunction('install_collector_stop_guard'),
    'install_systemd_automation',
    'install_collector_stop_guard',
  ].join('\n');
  const output = execFileSync('bash', ['-s', '--', temporary], { input: script, encoding: 'utf8' });
  assert.doesNotMatch(output, /systemctl start/);
  assert.match(output, /systemctl enable measurement-edge-agent.timer measurement-edge-agent-daily.timer/);
  const timer = fs.readFileSync(path.join(temporary, 'measurement-edge-agent.timer'), 'utf8');
  assert.match(timer, /OnCalendar=\*-\*-\* \*:\*:00/);
  assert.match(timer, /Unit=measurement-edge-agent.service/);
  const daily = fs.readFileSync(path.join(temporary, 'measurement-edge-agent-daily.service'), 'utf8');
  assert.match(daily, /Type=oneshot/);
  assert.match(daily, /cli.ts daily-submit/);
  assert.match(daily, /TimeoutStartSec=45min/);
  assert.doesNotMatch(daily, /Requires=measurement-edge-agent|PartOf=measurement-edge-agent/);
  assert.match(daily, /UMask=0077/);
  const retry = fs.readFileSync(path.join(temporary, 'measurement-edge-agent-daily.timer'), 'utf8');
  assert.match(retry, /Persistent=true/);
  assert.match(retry, /OnCalendar=\*-\*-\* \*:0\/5:00/);
  for (const unit of ['service', 'timer']) {
    const guard = fs.readFileSync(path.join(temporary, `measurement-edge-agent.${unit}-stop-guard.conf`), 'utf8');
    assert.equal(guard, '[Unit]\nRefuseManualStop=yes\n');
    assert.ok(output.includes(`/etc/systemd/system/measurement-edge-agent.${unit}.d/20-continuous-collection.conf`));
  }
  const maintenance = fs.readFileSync(path.join(temporary, 'measurement-edge-agent-maintenance.target'), 'utf8');
  const pausedUnits = [
    'measurement-edge-agent.service',
    'measurement-edge-agent.timer',
    'measurement-edge-agent-daily.service',
    'measurement-edge-agent-daily.timer',
  ].join(' ');
  assert.ok(maintenance.includes(`Conflicts=${pausedUnits}\n`));
  assert.ok(maintenance.includes(`After=${pausedUnits}\n`));
  assert.doesNotMatch(maintenance, /\[Install\]|WantedBy=|RequiredBy=/);
  assert.doesNotMatch(output, /systemctl (?:enable|start).*maintenance\.target/);
  assert.deepEqual(fs.readdirSync(temporary).sort(), [
    'measurement-edge-agent-daily.service',
    'measurement-edge-agent-daily.timer',
    'measurement-edge-agent-maintenance.target',
    'measurement-edge-agent.service-stop-guard.conf',
    'measurement-edge-agent.timer',
    'measurement-edge-agent.timer-stop-guard.conf',
  ].sort());
});

test('unguarded release activation pauses timers before either process and preserves no-start behavior', () => {
  for (const start of [0, 1]) {
    const script = [
      'set -eu',
      `START_SERVICE=${start}`,
      'DRY_RUN=0',
      'SERVICE_NAME=measurement-edge-agent',
      'DEFAULT_SERVICE_NAME=measurement-edge-agent',
      'LEGACY_SERVICE_NAME=legacy-agent',
      'RESUME_TIMERS=()',
      'RESUME_COLLECTOR=0',
      'systemctl() { if [[ "$1" == cat ]]; then return 1; fi; return 0; }',
      'run_root() { printf "%s\\n" "$*"; }',
      'log() { :; }',
      installerFunction('stop_existing_service'),
      'stop_existing_service',
    ].join('\n');
    const output = execFileSync('bash', ['-s'], { input: script, encoding: 'utf8' });
    if (!start) assert.equal(output, '');
    else {
      assert.ok(output.indexOf('stop measurement-edge-agent.timer') < output.indexOf('stop measurement-edge-agent.service'));
      assert.ok(output.indexOf('stop measurement-edge-agent-daily.timer') < output.indexOf('stop measurement-edge-agent-daily.service'));
    }
  }
});

test('guarded activation captures running units before maintenance and cleanup restores them', () => {
  for (const { start, dryRun, active } of [
    { start: 1, dryRun: 0, active: 1 },
    { start: 1, dryRun: 0, active: 0 },
    { start: 0, dryRun: 0, active: 1 },
    { start: 1, dryRun: 1, active: 1 },
  ]) {
    const script = [
      'set -eu',
      `START_SERVICE=${start}`,
      `DRY_RUN=${dryRun}`,
      `MOCK_ACTIVE=${active}`,
      'SERVICE_NAME=measurement-edge-agent',
      'DEFAULT_SERVICE_NAME=measurement-edge-agent',
      'LEGACY_SERVICE_NAME=legacy-agent',
      'RESUME_TIMERS=()',
      'RESUME_COLLECTOR=0',
      'TMP_DIR=""',
      'systemctl() {',
      '  case "$1" in',
      '    cat) return 0 ;;',
      '    is-active) [[ "$MOCK_ACTIVE" == 1 ]] ;;',
      '    start)',
      '      if [[ "$2" == "$SERVICE_NAME-maintenance.target" ]]; then',
      '        printf "captured=%s|%s\\n" "$RESUME_COLLECTOR" "${RESUME_TIMERS[*]}"',
      '        MOCK_ACTIVE=0',
      '      else',
      '        printf "resumed=%s\\n" "$2"',
      '        MOCK_ACTIVE=1',
      '      fi ;;',
      '    *) return 0 ;;',
      '  esac',
      '}',
      'run_root() { printf "%s\\n" "$*"; "$@"; }',
      'log() { :; }',
      installerFunction('stop_existing_service'),
      installerFunction('cleanup'),
      'stop_existing_service',
      'cleanup',
    ].join('\n');
    const output = execFileSync('bash', ['-s'], { input: script, encoding: 'utf8' });
    if (!start || dryRun) {
      assert.equal(output, '', 'no-start and dry-run must not enter maintenance or touch units');
      continue;
    }
    assert.doesNotMatch(output, /systemctl (?:stop|restart) /);
    assert.match(output, /systemctl disable --now legacy-agent\.service/);
    assert.match(output, /systemctl start measurement-edge-agent-maintenance\.target/);
    if (active) {
      assert.match(output, /captured=1\|measurement-edge-agent\.timer measurement-edge-agent-daily\.timer/);
      assert.match(output, /resumed=measurement-edge-agent\.service/);
      assert.match(output, /resumed=measurement-edge-agent\.timer/);
      assert.match(output, /resumed=measurement-edge-agent-daily\.timer/);
      assert.ok(output.indexOf('captured=') < output.indexOf('resumed='));
    } else {
      assert.match(output, /captured=0\|\n/);
      assert.doesNotMatch(output, /resumed=/, 'cleanup must not start units that were already stopped');
    }
  }
});

test('guarded install and rollback start the already-paused collector without a manual restart', () => {
  for (const name of ['install_systemd_service', 'rollback_release']) {
    const body = installerFunction(name);
    assert.match(body, /run_root systemctl start "\$\{SERVICE_NAME\}\.service"/);
    assert.doesNotMatch(body, /systemctl restart/);
  }
  const main = installerFunction('main');
  assert.ok(main.indexOf('install_systemd_automation') < main.indexOf('install_collector_stop_guard'));
});

test('device release installer creates a versioned runtime directory', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'device-release-install-'));
  const source = path.join(temporary, 'source');
  const destination = path.join(temporary, 'device-home', 'releases', '0.1.0-test');
  fs.mkdirSync(path.join(source, 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(source, 'runtime/collector.js'), 'collector\n', { mode: 0o755 });
  const manifest = {
    schemaVersion: 2,
    role: 'device',
    firmwareVersion: '0.1.0',
    files: [{ path: 'runtime/collector.js' }],
  };
  fs.writeFileSync(
    path.join(source, 'device-release-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  try {
    execFileSync(process.execPath, [installer, source, destination]);
    assert.equal(fs.readFileSync(path.join(destination, 'runtime/collector.js'), 'utf8'), 'collector\n');
    assert.ok((fs.statSync(path.join(destination, 'runtime/collector.js')).mode & 0o111) !== 0);

    execFileSync(process.execPath, [installer, source, destination]);
    fs.writeFileSync(
      path.join(source, 'device-release-manifest.json'),
      `${JSON.stringify({ ...manifest, firmwareVersion: '0.1.1' }, null, 2)}\n`,
    );
    assert.throws(
      () => execFileSync(process.execPath, [installer, source, destination], { stdio: 'pipe' }),
      /Command failed/,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('legacy settings migrate directly into the consolidated config directory', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'device-config-migrate-'));
  const source = path.join(temporary, '.env.edge');
  const destination = path.join(temporary, '.midnight', 'midnight-cloudflare-demo', 'config', 'device.env');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(source, [
    'CLOUDFLARE_INGEST_URL=https://worker.example/api/v1/readings',
    'INGEST_API_TOKEN=test-ingest-token',
    'SENSOR_DEVICE_ID=edge-test-001',
    'MIDNIGHT_WALLET_MNEMONIC=must-not-migrate',
    '',
  ].join('\n'));

  try {
    execFileSync(process.execPath, [migrateEnvironment, source, destination]);
    const migrated = fs.readFileSync(destination, 'utf8');
    assert.match(migrated, /^SENSOR_DEVICE_ID=edge-test-001$/m);
    assert.doesNotMatch(migrated, /INGEST_API_TOKEN|test-ingest-token/);
    assert.doesNotMatch(migrated, /MIDNIGHT_WALLET_MNEMONIC|must-not-migrate/);
    assert.equal(fs.statSync(destination).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
