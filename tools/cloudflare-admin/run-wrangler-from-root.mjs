import { spawnSync } from 'node:child_process';

import { repoRoot, wrangler } from './wrangler-context.mjs';

const args = process.argv.slice(2);
if (args.length === 0) throw new Error('Wrangler arguments are required');

const result = spawnSync(wrangler, args, {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Wrangler exited with status ${result.status}`);
