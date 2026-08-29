import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

function source(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('device wallet recovery material lives below ~/.midnight and never in env', () => {
  const config = source('apps/device/wallet-agent/src/config.ts');
  const state = source('apps/device/wallet-agent/src/state.ts');

  assert.match(config, /['"]\.midnight['"]/);
  assert.match(config, /['"]config['"]/);
  assert.match(config, /['"]device\.env['"]/);
  assert.match(config, /MIDNIGHT_DEVICE_ENV_FILE/);
  assert.match(state, /credentials\.json/);
  assert.match(source('scripts/require-device-host.mjs'), /device-release-manifest\.json/);
  assert.doesNotMatch(state, /process\.env\.[A-Z_]*WALLET/);
  assert.doesNotMatch(state, /DEVELOPMENT_WALLET|MIDNIGHT_WALLET/);
});

test('device wallet can submit but cannot deploy contracts', () => {
  const packageJson = JSON.parse(
    source('apps/device/wallet-agent/package.json'),
  ) as { scripts: Record<string, string> };
  const cli = source('apps/device/wallet-agent/src/cli.ts');
  const midnight = source('apps/device/wallet-agent/src/midnight.ts');
  const synthetic = source('apps/device/wallet-agent/src/synthetic.ts');

  assert.ok(packageJson.scripts.benchmark);
  assert.ok(packageJson.scripts.submit);
  assert.equal(packageJson.scripts.deploy, undefined);
  assert.match(cli, /confirm-synthetic/);
  assert.doesNotMatch(cli, /credentials\.mnemonic|recovery phrase/);
  assert.match(synthetic, /\[24, 96, 1440\]/);
  assert.doesNotMatch(synthetic, /fetch\(|D1Database|INGEST_API_TOKEN/);
  assert.doesNotMatch(cli, /case ['"]deploy['"]|deployContract/);
  assert.doesNotMatch(midnight, /export async function deploy/);
});

test('device transaction path has no DUST synchronization, funding, or direct relay submission', () => {
  const packageJson = JSON.parse(
    source('apps/device/wallet-agent/package.json'),
  ) as { scripts: Record<string, string> };
  const rootPackageJson = JSON.parse(source('package.json')) as { scripts: Record<string, string> };
  const wallet = source('apps/device/wallet-agent/src/wallet.ts');
  const midnight = source('apps/device/wallet-agent/src/midnight.ts');
  const cli = source('apps/device/wallet-agent/src/cli.ts');

  assert.equal(packageJson.scripts.funding, undefined);
  assert.equal(rootPackageJson.scripts['device:funding'], undefined);
  assert.doesNotMatch(wallet, /wallet\.start\s*\(/u);
  assert.doesNotMatch(wallet, /waitForSyncedState|wallet-sync|estimateRegistration|registerNightUtxos/u);
  assert.doesNotMatch(cli, /ensureDust|syncWallet|DUST balance|tNIGHT received/u);
  assert.match(midnight, /tokenKindsToBalance:\s*\[['"]unshielded['"]\]/u);
  assert.doesNotMatch(midnight, /tokenKindsToBalance:\s*\[['"]dust['"]\]/u);
  assert.doesNotMatch(midnight, /wallet\.wallet\.submitTransaction/u);
  assert.match(midnight, /sponsorProofTransaction/u);
});

test('development wallet recovery source is the backupable development env file', () => {
  if (!fs.existsSync(path.join(repoRoot, 'apps/development'))) {
    assert.equal(fs.existsSync(path.join(repoRoot, '.env.development')), false);
    return;
  }
  const config = source('apps/development/operator-cli/src/config.ts');
  const state = source('apps/development/operator-cli/src/state.ts');

  assert.match(config, /['"]\.env\.development['"]/);
  assert.match(state, /DEVELOPMENT_WALLET_MNEMONIC/);
  assert.match(state, /DEVELOPMENT_WALLET_SEED/);
  assert.match(state, /persistDevelopmentMnemonic/);
  assert.doesNotMatch(state, /wallet-\$\{network\}\.json/);
});

test('development and device private-state databases stay outside workspace source directories', () => {
  const implementations = [source('apps/device/wallet-agent/src/midnight.ts')];
  const developmentImplementation = path.join(
    repoRoot,
    'apps/development/operator-cli/src/midnight.ts',
  );
  if (fs.existsSync(developmentImplementation)) {
    implementations.push(fs.readFileSync(developmentImplementation, 'utf8'));
  }

  for (const implementation of implementations) {
    assert.match(implementation, /midnightDbName:\s*path\.join\(stateDir, ['"]midnight-level-db['"]\)/);
    assert.match(implementation, /privateStateStoreName:\s*['"]sensor-private-state['"]/);
    assert.match(implementation, /signingKeyStoreName:\s*['"]sensor-signing-keys['"]/);
    assert.doesNotMatch(implementation, /privateStateStoreName:\s*path\.join/);
    assert.doesNotMatch(implementation, /signingKeyStoreName:\s*path\.join/);
  }
});
