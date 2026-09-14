import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const releaseRoot = path.resolve(process.argv[2] ?? '.');
const manifestPath = path.join(releaseRoot, 'device-release-manifest.json');
if (!fs.existsSync(manifestPath)) throw new Error(`Device release manifest is missing: ${manifestPath}`);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (
  manifest.schemaVersion !== 2
  || manifest.role !== 'device'
  || typeof manifest.firmwareVersion !== 'string'
  || manifest.deploymentConfiguration !== 'external'
  || !Array.isArray(manifest.files)
) {
  throw new Error(`Invalid device release manifest: ${manifestPath}`);
}
for (const forbidden of [
  'frontend',
  'backend',
  'tools',
  'midnight/experiments',
]) {
  if (fs.existsSync(path.join(releaseRoot, forbidden))) {
    throw new Error(`Non-device component exists in device release: ${forbidden}`);
  }
}
const ignoredRuntimeEntries = new Set([
  'device-release-manifest.json',
  '.env.device',
  '.host-role',
]);

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function filesUnder(directory, prefix = '') {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (relative === 'node_modules' || relative.startsWith('node_modules/')) continue;
    if (ignoredRuntimeEntries.has(relative)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...filesUnder(absolute, relative));
    else if (entry.isFile()) result.push(relative);
    else throw new Error(`Device release contains a link or special file: ${relative}`);
  }
  return result.sort();
}

const manifestPaths = new Set();
for (const entry of manifest.files) {
  if (
    typeof entry.path !== 'string'
    || typeof entry.size !== 'number'
    || typeof entry.sha256 !== 'string'
    || path.isAbsolute(entry.path)
    || entry.path.split('/').includes('..')
  ) {
    throw new Error('Device release manifest contains an invalid file entry');
  }
  if (manifestPaths.has(entry.path)) throw new Error(`Duplicate manifest entry: ${entry.path}`);
  manifestPaths.add(entry.path);
  const file = path.join(releaseRoot, entry.path);
  if (!fs.existsSync(file)) throw new Error(`Device release file is missing: ${entry.path}`);
  const contents = fs.readFileSync(file);
  const digest = crypto.createHash('sha256').update(contents).digest('hex');
  if (contents.byteLength !== entry.size || digest !== entry.sha256) {
    throw new Error(`Device release integrity check failed: ${entry.path}`);
  }
}
const actualFiles = filesUnder(releaseRoot);
for (const file of actualFiles) {
  if (!manifestPaths.has(file)) throw new Error(`Unmanifested file exists in device release: ${file}`);
}
for (const file of manifestPaths) {
  if (!actualFiles.includes(file)) throw new Error(`Manifest entry is not part of the device release: ${file}`);
}

for (const required of [
  'installer.sh',
  'device-installer.sh',
  'README.md',
  'README.ja.md',
  'package.json',
  'package-lock.json',
  '.env.device.example',
  'scripts/install-device-release.mjs',
  'edge-device/device-identity/src/cli.ts',
  'edge-device/sensor-collector/src/cli.ts',
  'edge-device/midnight-transaction-agent/src/cli.ts',
  'midnight/contracts/sensor-registry/src/managed/sensor-registry/contract/index.js',
  'runtime/device-artifacts/sensor-registry/manifest.json',
]) {
  if (!manifestPaths.has(required)) throw new Error(`Required device release file is missing: ${required}`);
}
if ((fs.statSync(path.join(releaseRoot, 'installer.sh')).mode & 0o111) === 0) {
  throw new Error('installer.sh is not executable');
}
for (const file of manifestPaths) {
  if (
    file.endsWith('.compact')
    || file === '.env'
    || file === '.env.development'
    || file.endsWith('/credentials.json')
    || file.endsWith('/secrets.json')
    || file.startsWith('frontend/')
    || file.startsWith('backend/')
    || file.startsWith('tools/')
    || file.startsWith('midnight/experiments/')
  ) {
    throw new Error(`Forbidden development or secret-bearing path in device release: ${file}`);
  }
}

const releasePackage = JSON.parse(fs.readFileSync(path.join(releaseRoot, 'package.json'), 'utf8'));
if (releasePackage.version !== manifest.firmwareVersion) {
  throw new Error('Firmware version differs between package.json and device-release-manifest.json');
}
const allowedScripts = new Set([
  'test',
  'device:artifacts:verify',
  'device:auth:generate',
  'device:auth:refresh-enrollment',
  'device:auth:show',
  'device:auth:session',
  'device:authority:generate',
  'device:authority:show',
  'device:configure',
  'device:benchmark',
  'device:wallet',
  'device:submit',
  'device:daily-submit',
  'device:status',
  'edge:demo-seed',
  'edge:serve',
  'edge:test',
]);
for (const script of Object.keys(releasePackage.scripts ?? {})) {
  if (!allowedScripts.has(script)) throw new Error(`Non-device npm script in release: ${script}`);
}
const workspacePackages = [
  'edge-device/device-identity/package.json',
  'edge-device/sensor-collector/package.json',
  'edge-device/midnight-transaction-agent/package.json',
  'midnight/contracts/sensor-registry/package.json',
  'shared/measurement-protocol/package.json',
];
for (const relative of workspacePackages) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(releaseRoot, relative), 'utf8'));
  if (packageJson.devDependencies) throw new Error(`devDependencies exist in device release: ${relative}`);
  for (const forbiddenScript of ['build', 'typecheck', 'compile', 'deploy']) {
    if (packageJson.scripts?.[forbiddenScript]) {
      throw new Error(`Development script ${forbiddenScript} exists in device release: ${relative}`);
    }
  }
}

const witnessContractModule = path.join(
  releaseRoot,
  'midnight/contracts/sensor-registry/src/managed/sensor-registry/contract/index.js',
);
const runtimeContractModule = path.join(
  releaseRoot,
  'runtime/device-artifacts/sensor-registry/contract/index.js',
);
if (sha256File(witnessContractModule) !== sha256File(runtimeContractModule)) {
  throw new Error('Witness pure-circuit module differs from the verified runtime contract module');
}

const lock = JSON.parse(fs.readFileSync(path.join(releaseRoot, 'package-lock.json'), 'utf8'));
for (const forbiddenPackage of [
  'node_modules/typescript',
  'node_modules/vitest',
  'node_modules/wrangler',
  'node_modules/@cloudflare/containers',
  'tools/midnight-operator',
  'backend/cloudflare/proof-gateway-worker',
  'frontend/verification-portal',
  'midnight/experiments/daily-attestation-cost',
]) {
  if (lock.packages?.[forbiddenPackage]) {
    throw new Error(`Development dependency or workspace exists in device lockfile: ${forbiddenPackage}`);
  }
}
const envExample = fs.readFileSync(path.join(releaseRoot, '.env.device.example'), 'utf8');
const configuredAddress = envExample.match(/^DEVICE_CONTRACT_ADDRESS=(.*)$/m)?.[1]?.trim();
if (configuredAddress === undefined || configuredAddress !== '') {
  throw new Error('Device environment example must not contain a deployment-specific contract address');
}

const portableTextExtensions = new Set([
  '.conf',
  '.example',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.service',
  '.sh',
  '.timer',
  '.ts',
]);
const machineSpecificPatterns = [
  { label: 'Linux user home path', expression: /\/home\/[A-Za-z0-9._-]+\// },
  { label: 'macOS user home path', expression: /\/Users\/[A-Za-z0-9._-]+\// },
  { label: 'root home path', expression: /\/root\// },
  {
    label: 'concrete Cloudflare Workers hostname',
    expression: /https?:\/\/(?:[A-Za-z0-9-]+\.)+[A-Za-z0-9-]+\.workers\.dev(?:[/:]|$)/,
  },
  {
    label: 'private IPv4 address',
    expression: /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/,
  },
];
for (const relative of manifestPaths) {
  const extension = path.extname(relative);
  if (!portableTextExtensions.has(extension) && !path.basename(relative).startsWith('README')) continue;
  const contents = fs.readFileSync(path.join(releaseRoot, relative), 'utf8');
  for (const { label, expression } of machineSpecificPatterns) {
    if (expression.test(contents)) {
      throw new Error(`${label} leaked into device release: ${relative}`);
    }
  }
}
process.stdout.write(`Verified ${manifest.files.length} operational device release files\n`);
