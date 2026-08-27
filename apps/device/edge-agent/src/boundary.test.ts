import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

test('Edge workspace has no Compact, wallet, contract, or prover dependencies', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'apps/device/edge-agent/package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string> };
  assert.deepEqual(Object.keys(packageJson.dependencies ?? {}), ['dotenv', 'tsx']);

  for (const fileName of ['cli.ts', 'collector.ts', 'config.ts']) {
    const source = fs.readFileSync(path.join(repoRoot, 'apps/device/edge-agent/src', fileName), 'utf8');
    assert.doesNotMatch(source, /@midnight-ntwrk|operator-cli|contracts\//);
  }
});

test('device installer is scoped to operational workspaces', () => {
  const installer = fs.readFileSync(path.join(repoRoot, 'device-installer.sh'), 'utf8');
  assert.match(installer, /--workspace @midnight-demo\/edge-agent/);
  assert.match(installer, /--workspace @midnight-demo\/device-wallet-agent/);
  assert.match(installer, /EnvironmentFile=.*\.env\.device/);
  assert.match(installer, /MIDNIGHT_HOST_ROLE=device/);
  assert.match(installer, /ExecStart=.*--import=tsx/);
  assert.doesNotMatch(installer, /apps\/development|apps\/proof-gateway|contracts\//);
  assert.doesNotMatch(installer, /run_user[^\n]*(compact|wrangler|docker|midnight:)/i);
});

test('development packaging produces an installer-rooted device archive', () => {
  if (!fs.existsSync(path.join(repoRoot, 'package_archive.sh'))) return;
  const packaging = fs.readFileSync(path.join(repoRoot, 'package_archive.sh'), 'utf8');
  const builder = fs.readFileSync(path.join(repoRoot, 'scripts/build-device-release.mjs'), 'utf8');

  assert.match(packaging, /require-development-host\.mjs/);
  assert.match(packaging, /build-device-release\.mjs/);
  assert.match(packaging, /verify-device-release\.mjs/);
  assert.match(packaging, /installer\.sh/);
  assert.match(packaging, /\.tar\.gz/);
  assert.match(packaging, /sha256sum/);
  const sourceEntries = builder.match(/const sourceEntries = \[([\s\S]*?)\n\];/)?.[1] ?? '';
  assert.doesNotMatch(sourceEntries, /apps\/development/);
  assert.doesNotMatch(sourceEntries, /apps\/proof-gateway/);
  assert.doesNotMatch(sourceEntries, /apps\/dashboard/);
});

test('development workspaces refuse commands when the host is marked as a device', () => {
  if (!fs.existsSync(path.join(repoRoot, 'apps/development'))) {
    assert.equal(fs.existsSync(path.join(repoRoot, 'apps/proof-gateway')), false);
    assert.equal(fs.existsSync(path.join(repoRoot, 'apps/dashboard')), false);
    return;
  }
  const guardedPackages: Array<[string, string[]]> = [
    ['apps/development/operator-cli/package.json', ['wallet', 'deploy', 'benchmark:daily-proof']],
    ['apps/proof-gateway/package.json', ['secret', 'secret:ingest', 'deploy', 'destroy']],
    ['contracts/sensor-registry/package.json', ['compile']],
    ['contracts/daily-attestation/package.json', ['generate', 'compile']],
  ];
  for (const [relativePath, scriptNames] of guardedPackages) {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'),
    ) as { scripts: Record<string, string> };
    for (const scriptName of scriptNames) {
      assert.match(
        packageJson.scripts[scriptName] ?? '',
        /require-development-host\.mjs/,
        `${relativePath}#${scriptName} must enforce the host boundary`,
      );
    }
  }
});

test('legacy environment migration omits all wallet recovery material', () => {
  const migration = fs.readFileSync(
    path.join(repoRoot, 'scripts/migrate-device-env.mjs'),
    'utf8',
  );
  for (const forbidden of [
    'MIDNIGHT_WALLET_MNEMONIC',
    'MIDNIGHT_WALLET_SEED',
    'DEVELOPMENT_WALLET_MNEMONIC',
    'DEVELOPMENT_WALLET_SEED',
    'PRIVATE_STATE_PASSWORD',
    'ATTESTATION_API_TOKEN',
  ]) {
    assert.doesNotMatch(migration, new RegExp(`['\"]${forbidden}['\"]`));
  }
});
