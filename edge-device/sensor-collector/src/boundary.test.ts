import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const isDeviceRelease = fs.existsSync(path.join(repoRoot, 'device-release-manifest.json'));

function releaseFile(sourceRelative: string, packagedRelative: string): string {
  const sourcePath = path.join(repoRoot, sourceRelative);
  return fs.existsSync(sourcePath) ? sourcePath : path.join(repoRoot, packagedRelative);
}

test('Edge workspace has no Compact, wallet, contract, or prover dependencies', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'edge-device/sensor-collector/package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string> };
  assert.deepEqual(Object.keys(packageJson.dependencies ?? {}), [
    '@midnight-demo/device-auth',
    'dotenv',
    'tsx',
  ]);

  for (const fileName of ['aggregation.ts', 'cli.ts', 'collector.ts', 'config.ts']) {
    const source = fs.readFileSync(
      path.join(repoRoot, 'edge-device/sensor-collector/src', fileName),
      'utf8',
    );
    assert.doesNotMatch(source, /@midnight-ntwrk|operator-cli|contracts\//);
  }
});

test('device installer is scoped to operational workspaces', () => {
  const installer = fs.readFileSync(
    releaseFile('edge-device/release/device-installer.sh', 'device-installer.sh'),
    'utf8',
  );
  assert.match(installer, /--workspace @midnight-demo\/edge-agent/);
  assert.match(installer, /--workspace @midnight-demo\/device-auth/);
  assert.match(installer, /--workspace @midnight-demo\/device-wallet-agent/);
  assert.match(installer, /DEVICE_HOME=.*\.midnight\/midnight-cloudflare-demo/);
  assert.match(installer, /CONFIG_DIR=.*config/);
  assert.match(installer, /ENV_FILE=.*device\.env/);
  assert.match(installer, /RELEASES_DIR=.*releases/);
  assert.match(installer, /CURRENT_LINK=.*current/);
  assert.match(installer, /PREVIOUS_LINK=.*previous/);
  assert.match(installer, /EnvironmentFile=\$\{env_path\}/);
  assert.match(installer, /MIDNIGHT_HOST_ROLE=device/);
  assert.match(installer, /ExecStart=.*--import=tsx/);
  assert.match(installer, /--rollback/);
  assert.match(installer, /rollback_release/);
  assert.match(installer, /ensure_device_identity/);
  assert.match(installer, /device:auth:generate/);
  assert.match(installer, /--confirm-device-key-generation/);
  assert.match(installer, /present > 0 && present < 3/);
  assert.match(installer, /device:auth:show/);
  assert.match(installer, /set_env_value CLOUDFLARE_INGEST_URL/);
  assert.match(installer, /set_env_value MIDNIGHT_PROOF_SERVER_URL/);
  assert.match(installer, /ReadWritePaths=\$\{device_home_path\}/);
  assert.match(installer, /preflight_bootstrap/);
  assert.match(installer, /preflight_system_commands/);
  assert.match(installer, /preflight_node_commands/);
  assert.match(installer, /systemctl systemd-analyze tar tr uname xz/);
  assert.match(installer, /Installing only missing operating-system prerequisites/);
  assert.doesNotMatch(installer, /required\+=\(iw\)/);
  const completePreflight = installer.indexOf(
    'preflight_system_commands\n  preflight_privileged_commands\n  install_node\n  preflight_node_commands',
  );
  const firstDeviceStateChange = installer.indexOf('verify_device_release\n  prepare_device_home');
  assert.notEqual(completePreflight, -1);
  assert.notEqual(firstDeviceStateChange, -1);
  assert.ok(
    completePreflight < firstDeviceStateChange,
    'the complete command preflight must run before Device state is changed',
  );
  assert.doesNotMatch(installer, /apps\/development|apps\/proof-gateway|contracts\//);
  assert.doesNotMatch(installer, /run_user[^\n]*(compact|wrangler|docker|midnight:)/i);
});

test('development packaging produces an installer-rooted device archive', {
  skip: isDeviceRelease,
}, () => {
  const packaging = fs.readFileSync(
    path.join(repoRoot, 'edge-device/release/package_archive.sh'),
    'utf8',
  );
  const builder = fs.readFileSync(
    path.join(repoRoot, 'edge-device/release/scripts/build-device-release.mjs'),
    'utf8',
  );
  const verifier = fs.readFileSync(
    path.join(repoRoot, 'edge-device/release/scripts/verify-device-release.mjs'),
    'utf8',
  );

  assert.match(packaging, /require-development-host\.mjs/);
  assert.match(packaging, /build-device-release\.mjs/);
  assert.match(packaging, /verify-device-release\.mjs/);
  assert.match(packaging, /installer\.sh/);
  assert.match(packaging, /\.tar\.gz/);
  assert.match(packaging, /sha256sum/);
  assert.match(builder, /install-device-release\.mjs/);
  assert.match(builder, /'device:configure'/);
  assert.match(builder, /'benchmark', 'configure'/);
  assert.match(verifier, /'device:configure'/);
  const sourceEntries = builder.match(/const sourceEntries = \[([\s\S]*?)\n\];/)?.[1] ?? '';
  assert.doesNotMatch(sourceEntries, /frontend|backend|tools\/midnight-operator/);
});

test('development workspaces refuse commands when the host is marked as a device', {
  skip: isDeviceRelease,
}, () => {
  const guardedPackages: Array<[string, string[]]> = [
    ['tools/midnight-operator/package.json', ['wallet', 'deploy', 'benchmark:daily-proof']],
    ['backend/cloudflare/proof-gateway-worker/package.json', ['device:register', 'deploy', 'destroy']],
    ['midnight/contracts/sensor-registry/package.json', ['compile']],
    ['midnight/experiments/daily-attestation-cost/package.json', ['generate', 'compile']],
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
    releaseFile(
      'edge-device/release/scripts/migrate-device-env.mjs',
      'scripts/migrate-device-env.mjs',
    ),
    'utf8',
  );
  for (const forbidden of [
    'MIDNIGHT_WALLET_MNEMONIC',
    'MIDNIGHT_WALLET_SEED',
    'DEVELOPMENT_WALLET_MNEMONIC',
    'DEVELOPMENT_WALLET_SEED',
    'PRIVATE_STATE_PASSWORD',
    'PROOF_GATEWAY_TOKEN',
    'INGEST_API_TOKEN',
    'MIDNIGHT_PROOF_SERVER_TOKEN',
    'ATTESTATION_API_TOKEN',
  ]) {
    assert.doesNotMatch(migration, new RegExp(`['\"]${forbidden}['\"]`));
  }
});
