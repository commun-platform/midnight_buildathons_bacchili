import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const credentialFile = path.join(
  repoRoot,
  '.state',
  'sponsor-wallet',
  'preprod',
  'credentials.json',
);
const wrangler = path.join(
  repoRoot,
  'apps',
  'proof-gateway',
  'node_modules',
  '.bin',
  'wrangler',
);
const wranglerConfig = path.join(repoRoot, 'apps', 'proof-gateway', 'wrangler.jsonc');

if (!fs.existsSync(credentialFile)) {
  throw new Error('Sponsor Wallet has not been created; run npm run sponsor:wallet');
}
const stat = fs.statSync(credentialFile);
if ((stat.mode & 0o077) !== 0) {
  throw new Error('Sponsor credentials must not be accessible by group or other users');
}
const credentials = JSON.parse(fs.readFileSync(credentialFile, 'utf8'));
if (
  credentials.version !== 1
  || credentials.network !== 'preprod'
  || !/^(?:[0-9a-f]{2}){32}$/u.test(credentials.seedHex)
  || typeof credentials.unshieldedAddress !== 'string'
  || !credentials.unshieldedAddress.startsWith('mn_addr_preprod1')
) throw new Error('Sponsor credentials are malformed');

const result = spawnSync(
  wrangler,
  ['secret', 'put', 'SPONSOR_WALLET_SEED', '--config', wranglerConfig],
  {
    cwd: repoRoot,
    input: `${credentials.seedHex}\n`,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  },
);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Wrangler exited with status ${result.status}`);
process.stdout.write(
  `Sponsor Wallet secret configured for ${credentials.network}: ${credentials.unshieldedAddress}\n`,
);
