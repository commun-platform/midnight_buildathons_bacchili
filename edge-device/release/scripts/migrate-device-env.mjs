import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const deviceConfigKeys = [
  'MIDNIGHT_NETWORK',
  'MIDNIGHT_PROOF_SERVER_URL',
  'DEVICE_CONTRACT_ADDRESS',
  'MIDNIGHT_SYNC_TIMEOUT_MS',
  'MIDNIGHT_DUST_TIMEOUT_MS',
  'MIDNIGHT_DUST_BATCH_SIZE',
  'CLOUDFLARE_INGEST_URL',
  'TEMPERATURE_SENSOR_PATH',
  'SENSOR_INTERVAL_SECONDS',
  'SENSOR_PROJECT_ID',
  'SENSOR_DEVICE_ID',
  'DEVICE_AUTH_HOME',
  'AGENT_PORT',
];

const sourcePath = path.resolve(process.argv[2] ?? '.env');
const destinationPath = path.resolve(process.argv[3] ?? '.env.device');
const scriptRoot = fileURLToPath(new URL('../', import.meta.url));
const adjacentExample = path.resolve(path.dirname(destinationPath), '.env.device.example');
const examplePath = process.argv[4]
  ? path.resolve(process.argv[4])
  : fs.existsSync(adjacentExample)
    ? adjacentExample
    : path.join(scriptRoot, '.env.device.example');

function parseEnvironment(contents) {
  const values = new Map();
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    values.set(line.slice(0, separator).trim(), line.slice(separator + 1));
  }
  return values;
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2
    && ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

if (!fs.existsSync(sourcePath)) throw new Error(`Legacy environment file not found: ${sourcePath}`);
if (!fs.existsSync(examplePath)) throw new Error(`Device environment example not found: ${examplePath}`);
if (fs.existsSync(destinationPath)) throw new Error(`Refusing to overwrite existing file: ${destinationPath}`);

const source = parseEnvironment(fs.readFileSync(sourcePath, 'utf8'));
const example = parseEnvironment(fs.readFileSync(examplePath, 'utf8'));
const selected = new Map();
for (const key of deviceConfigKeys) {
  selected.set(key, source.get(key) ?? example.get(key) ?? '');
}

const ingestUrl = unquote(selected.get('CLOUDFLARE_INGEST_URL') ?? '');
if (!ingestUrl || ingestUrl.includes('<your-subdomain>')) {
  throw new Error('Legacy CLOUDFLARE_INGEST_URL is not configured');
}

const contents = [
  '# Device runtime configuration migrated from the legacy mixed .env file.',
  '# Wallet recovery material and development secrets were intentionally omitted.',
  ...deviceConfigKeys.map((key) => `${key}=${selected.get(key)}`),
  '',
].join('\n');
const temporaryPath = `${destinationPath}.tmp-${process.pid}`;
fs.writeFileSync(temporaryPath, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
fs.renameSync(temporaryPath, destinationPath);
fs.chmodSync(destinationPath, 0o600);
process.stdout.write(`Migrated device runtime configuration to ${destinationPath}; no secret values were printed.\n`);
