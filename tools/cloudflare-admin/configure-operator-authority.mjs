import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, wrangler, wranglerConfig } from './wrangler-context.mjs';

const authorityFile = path.join(
  repoRoot,
  '.state',
  'development',
  'operator-authority-preprod.json',
);
const deploymentFile = path.join(
  repoRoot,
  '.state',
  'development',
  'deployment-preprod.json',
);
const bytes32 = /^(?:[0-9a-f]{2}){32}$/u;

for (const file of [authorityFile, deploymentFile]) {
  if (!fs.existsSync(file)) throw new Error(`Required deployment state is missing: ${file}`);
  if ((fs.statSync(file).mode & 0o077) !== 0) {
    throw new Error(`Deployment state must not be accessible by group or other users: ${file}`);
  }
}
const authority = JSON.parse(fs.readFileSync(authorityFile, 'utf8'));
const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
if (
  authority.schemaVersion !== 1
  || authority.network !== 'preprod'
  || authority.algorithm !== 'Compact-persistentHash-v1'
  || !bytes32.test(authority.operatorSecretHex)
  || !bytes32.test(authority.operatorAuthorityHex)
  || authority.operatorAuthorityHex !== deployment.operatorAuthority
) throw new Error('Operator Authority does not match the active deployment record');

const result = spawnSync(
  wrangler,
  ['secret', 'put', 'OPERATOR_AUTHORITY_SECRET', '--config', wranglerConfig],
  {
    cwd: repoRoot,
    input: `${authority.operatorSecretHex}\n`,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  },
);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Wrangler exited with status ${result.status}`);
process.stdout.write('Operator Authority secret configured for the active Preprod contract.\n');
