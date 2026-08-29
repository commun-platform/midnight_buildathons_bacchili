import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const artifactSource = path.resolve(
  repoRoot,
  process.argv[2] ?? path.join('.device-release', 'sensor-registry'),
);
const outputDir = path.resolve(
  repoRoot,
  process.argv[3] ?? path.join('.device-release', 'device-runtime'),
);
const temporary = `${outputDir}.tmp-${process.pid}`;
const npmCacheDir = path.resolve(
  process.env.DEVICE_PACKAGE_NPM_CACHE || path.join(path.dirname(outputDir), '.npm-cache'),
);
const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const rootLock = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
const firmwareVersion = process.env.DEVICE_FIRMWARE_VERSION?.trim() || rootPackage.version;
if (!/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(firmwareVersion)) {
  throw new Error(`Invalid device firmware version: ${firmwareVersion}`);
}
const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH?.trim();
if (sourceDateEpoch && !/^\d+$/.test(sourceDateEpoch)) {
  throw new Error('SOURCE_DATE_EPOCH must be a non-negative integer');
}
const createdAt = sourceDateEpoch
  ? new Date(Number(sourceDateEpoch) * 1_000).toISOString()
  : new Date().toISOString();

const sourceEntries = [
  '.env.device.example',
  'device-installer.sh',
  'edge-installer.sh',
  'installer.sh',
  'apps/device/device-auth',
  'apps/device/edge-agent',
  'apps/device/wallet-agent',
  'packages/shared',
  'contracts/sensor-registry/src/witnesses.ts',
  'scripts/require-device-host.mjs',
  'scripts/install-device-release.mjs',
  'scripts/migrate-device-env.mjs',
  'scripts/verify-device-artifacts.mjs',
  'scripts/verify-device-release.mjs',
  'ops/pi-forensics',
];
const excludedNames = new Set([
  'node_modules',
  'dist',
  '.state',
  'data',
  '.wrangler',
  'package.json',
  'tsconfig.json',
]);

function copyEntry(relative) {
  const source = path.join(repoRoot, relative);
  if (!fs.existsSync(source)) throw new Error(`Required device runtime source is missing: ${relative}`);
  const destination = path.join(temporary, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, {
    recursive: true,
    errorOnExist: true,
    filter: (candidate) => !excludedNames.has(path.basename(candidate)),
  });
}

function filesUnder(directory, prefix = '') {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...filesUnder(absolute, relative));
    else if (entry.isFile()) result.push(relative);
    else throw new Error(`Device release may not contain links or special files: ${relative}`);
  }
  return result.sort();
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeJson(relative, value) {
  const destination = path.join(temporary, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o644,
  });
}

function runtimeWorkspacePackage(relative, scriptNames = []) {
  const source = JSON.parse(fs.readFileSync(path.join(repoRoot, relative), 'utf8'));
  const scripts = Object.fromEntries(
    scriptNames.filter((name) => source.scripts?.[name]).map((name) => [name, source.scripts[name]]),
  );
  const dependencies = Object.fromEntries(Object.entries(source.dependencies ?? {}).map(([name, range]) => {
    if (range === '*') return [name, range];
    const lockedVersion = rootLock.packages?.[`node_modules/${name}`]?.version;
    if (typeof lockedVersion !== 'string' || !lockedVersion) {
      throw new Error(`No locked runtime version found for ${name} required by ${relative}`);
    }
    return [name, lockedVersion];
  }));
  return {
    name: source.name,
    version: source.version,
    private: true,
    type: source.type,
    ...(source.exports ? { exports: source.exports } : {}),
    ...(Object.keys(scripts).length > 0 ? { scripts } : {}),
    ...(Object.keys(dependencies).length > 0 ? { dependencies } : {}),
    ...(source.engines ? { engines: source.engines } : {}),
  };
}

function writeRuntimePackageFiles() {
  const rootDependencies = Object.fromEntries(Object.entries(rootPackage.dependencies ?? {}).map(([name, range]) => {
    const lockedVersion = rootLock.packages?.[`node_modules/${name}`]?.version;
    return [name, lockedVersion || range];
  }));
  writeJson('package.json', {
    name: 'midnight-sensor-device-firmware',
    version: firmwareVersion,
    private: true,
    type: 'module',
    workspaces: [
      'apps/device/*',
      'contracts/sensor-registry',
      'packages/shared',
    ],
    ...(rootPackage.overrides ? { overrides: rootPackage.overrides } : {}),
    ...(Object.keys(rootDependencies).length > 0 ? { dependencies: rootDependencies } : {}),
    scripts: {
      test: 'npm run test -w @midnight-demo/device-auth && npm run test -w @midnight-demo/edge-agent && npm run test -w @midnight-demo/device-wallet-agent',
      'device:artifacts:verify': 'node scripts/verify-device-artifacts.mjs',
      'device:auth:generate': 'npm run generate -w @midnight-demo/device-auth --',
      'device:auth:refresh-enrollment': 'npm run refresh-enrollment -w @midnight-demo/device-auth --',
      'device:auth:show': 'npm run show -w @midnight-demo/device-auth --',
      'device:auth:session': 'npm run session -w @midnight-demo/device-auth --',
      'device:authority:generate': 'npm run authority:generate -w @midnight-demo/device-wallet-agent --',
      'device:authority:show': 'npm run authority:show -w @midnight-demo/device-wallet-agent --',
      'device:configure': 'npm run configure -w @midnight-demo/device-wallet-agent --',
      'device:benchmark': 'npm run benchmark -w @midnight-demo/device-wallet-agent --',
      'device:wallet': 'npm run wallet -w @midnight-demo/device-wallet-agent --',
      'device:submit': 'npm run submit -w @midnight-demo/device-wallet-agent --',
      'device:status': 'npm run status -w @midnight-demo/device-wallet-agent --',
      'edge:demo-seed': 'npm run demo-seed -w @midnight-demo/edge-agent --',
      'edge:serve': 'npm run serve -w @midnight-demo/edge-agent --',
      'edge:test': 'npm run test -w @midnight-demo/edge-agent',
    },
    engines: rootPackage.engines,
  });
  writeJson(
    'apps/device/device-auth/package.json',
    runtimeWorkspacePackage(
      'apps/device/device-auth/package.json',
      ['generate', 'refresh-enrollment', 'show', 'session', 'test'],
    ),
  );
  writeJson(
    'apps/device/edge-agent/package.json',
    runtimeWorkspacePackage('apps/device/edge-agent/package.json', ['demo-seed', 'serve', 'test']),
  );
  writeJson(
    'apps/device/wallet-agent/package.json',
    runtimeWorkspacePackage(
      'apps/device/wallet-agent/package.json',
      [
        'authority:generate', 'authority:show', 'benchmark', 'configure',
        'wallet', 'submit', 'status', 'test',
      ],
    ),
  );
  writeJson(
    'contracts/sensor-registry/package.json',
    runtimeWorkspacePackage('contracts/sensor-registry/package.json'),
  );
  writeJson(
    'packages/shared/package.json',
    runtimeWorkspacePackage('packages/shared/package.json'),
  );
}

if (fs.existsSync(outputDir)) throw new Error(`Refusing to overwrite existing device release: ${outputDir}`);
const artifactManifest = path.join(artifactSource, 'manifest.json');
if (!fs.existsSync(artifactManifest)) {
  throw new Error('Export device artifacts first with npm run device:artifacts:export in the build environment');
}
fs.mkdirSync(temporary, { recursive: true });
try {
  for (const relative of sourceEntries) copyEntry(relative);
  fs.copyFileSync(
    path.join(repoRoot, 'docs', 'operations', 'device_firmware.md'),
    path.join(temporary, 'README.md'),
  );
  fs.chmodSync(path.join(temporary, 'README.md'), 0o644);
  fs.copyFileSync(
    path.join(repoRoot, 'docs', 'ja', 'operations', 'device_firmware.md'),
    path.join(temporary, 'README.ja.md'),
  );
  fs.chmodSync(path.join(temporary, 'README.ja.md'), 0o644);
  writeRuntimePackageFiles();
  const artifactDestination = path.join(temporary, 'runtime/device-artifacts/sensor-registry');
  fs.mkdirSync(path.dirname(artifactDestination), { recursive: true });
  fs.cpSync(artifactSource, artifactDestination, { recursive: true, errorOnExist: true });
  // witnesses.ts imports Compact's pure circuits through its development-tree
  // relative path. Keep a manifest-covered copy of only that generated runtime
  // module at the same path in firmware; proving keys remain in the canonical
  // runtime/device-artifacts bundle and are not duplicated.
  const witnessContractModule = path.join(
    temporary,
    'contracts/sensor-registry/src/managed/sensor-registry/contract/index.js',
  );
  fs.mkdirSync(path.dirname(witnessContractModule), { recursive: true });
  fs.copyFileSync(path.join(artifactSource, 'contract/index.js'), witnessContractModule);

  execFileSync(
    process.env.npm_execpath || 'npm',
    [
      'install',
      '--package-lock-only',
      '--ignore-scripts',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '--cache',
      npmCacheDir,
    ],
    { cwd: temporary, stdio: 'inherit' },
  );

  for (const forbidden of ['apps/development', 'apps/proof-gateway', 'apps/dashboard']) {
    if (fs.existsSync(path.join(temporary, forbidden))) {
      throw new Error(`Development component leaked into device release: ${forbidden}`);
    }
  }
  const files = filesUnder(temporary);
  const secretFile = files.find((file) => (
    file === '.env'
    || file === '.env.development'
    || file === '.env.device'
    || file.endsWith('/credentials.json')
  ));
  if (secretFile) throw new Error(`Secret-bearing file leaked into device release: ${secretFile}`);

  const manifest = {
    schemaVersion: 2,
    role: 'device',
    firmwareVersion,
    deploymentConfiguration: 'external',
    createdAt,
    files: files.map((relative) => ({
      path: relative,
      size: fs.statSync(path.join(temporary, relative)).size,
      sha256: sha256(path.join(temporary, relative)),
    })),
  };
  fs.writeFileSync(
    path.join(temporary, 'device-release-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o644 },
  );
  fs.renameSync(temporary, outputDir);
} catch (error) {
  fs.rmSync(temporary, { recursive: true, force: true });
  throw error;
}

process.stdout.write(`Built operational-only Edge Device release at ${outputDir}\n`);
