import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const installer = path.join(repoRoot, 'scripts/install-device-release.mjs');
const migrateEnvironment = path.join(repoRoot, 'scripts/migrate-device-env.mjs');

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
