import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { repoRoot, wrangler, wranglerConfig } from './wrangler-context.mjs';

const envFile = path.join(repoRoot, '.env');
const generate = process.argv.slice(2).includes('--generate');
const keys = [
  'MANAGED_ATTESTOR_ROOT_SECRET',
  'MANAGED_CONNECTOR_CREDENTIAL_KEY',
  'MANAGED_ARTIFACT_ENCRYPTION_KEY',
];
const bytes32 = /^(?:[0-9a-f]{2}){32}$/u;

function valuesFromEnv(source) {
  const values = new Map();
  for (const line of source.split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match) continue;
    const raw = match[2].trim();
    values.set(match[1], (
      (raw.startsWith('"') && raw.endsWith('"'))
      || (raw.startsWith("'") && raw.endsWith("'"))
    ) ? raw.slice(1, -1) : raw.replace(/\s+#.*$/u, '').trim());
  }
  return values;
}

function upsert(source, key, value) {
  const linePattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=.*$`, 'mu');
  if (linePattern.test(source)) return source.replace(linePattern, `${key}=${value}`);
  const separator = source && !source.endsWith('\n') ? '\n' : '';
  return `${source}${separator}${key}=${value}\n`;
}

let source = fs.existsSync(envFile)
  ? fs.readFileSync(envFile, 'utf8')
  : '# Local input used only by configuration scripts. Never commit .env.\n';
let values = valuesFromEnv(source);
if (generate) {
  let changed = false;
  for (const key of keys) {
    if (values.get(key)) continue;
    source = upsert(source, key, crypto.randomBytes(32).toString('hex'));
    changed = true;
  }
  if (changed) {
    const temporary = `${envFile}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, source, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, envFile);
    fs.chmodSync(envFile, 0o600);
    process.stdout.write('Generated missing Managed Attestation secrets in the ignored .env file.\n');
  }
  values = valuesFromEnv(source);
}

for (const key of keys) {
  if (!bytes32.test(values.get(key) ?? '')) {
    throw new Error(`Set ${key} to 64 lowercase hexadecimal characters in .env`);
  }
}
if (new Set(keys.map((key) => values.get(key))).size !== keys.length) {
  throw new Error('Managed Attestor, connector, and artifact secrets must all be different');
}

const secrets = Object.fromEntries(keys.map((key) => [key, values.get(key)]));
const result = spawnSync(
  wrangler,
  ['secret', 'bulk', '--config', wranglerConfig],
  {
    cwd: repoRoot,
    input: JSON.stringify(secrets),
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  },
);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Wrangler exited with status ${result.status}`);
process.stdout.write('Managed Attestation Worker Secrets configured without printing their values.\n');
