import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { repoRoot, wrangler, wranglerConfig } from './wrangler-context.mjs';

const envFile = path.join(repoRoot, '.env');
if (!fs.existsSync(envFile)) {
  throw new Error('Create .env from .env.example and set DISCORD_WEBHOOK_URL');
}

function valueFromEnv(source, key) {
  for (const line of source.split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match || match[1] !== key) continue;
    const raw = match[2].trim();
    if (
      (raw.startsWith('"') && raw.endsWith('"'))
      || (raw.startsWith("'") && raw.endsWith("'"))
    ) return raw.slice(1, -1);
    return raw.replace(/\s+#.*$/u, '').trim();
  }
  return '';
}

const webhook = valueFromEnv(fs.readFileSync(envFile, 'utf8'), 'DISCORD_WEBHOOK_URL');
let url;
try {
  url = new URL(webhook);
} catch {
  throw new Error('DISCORD_WEBHOOK_URL in .env is not a valid URL');
}
if (
  url.protocol !== 'https:'
  || !['discord.com', 'discordapp.com'].includes(url.hostname)
  || !/^\/api\/webhooks\/[^/]+\/[^/]+$/u.test(url.pathname)
) throw new Error('DISCORD_WEBHOOK_URL must be an HTTPS Discord webhook URL');

const result = spawnSync(
  wrangler,
  ['secret', 'put', 'DISCORD_WEBHOOK_URL', '--config', wranglerConfig],
  {
    cwd: repoRoot,
    input: `${webhook}\n`,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  },
);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Wrangler exited with status ${result.status}`);
process.stdout.write('Discord operations webhook configured as a Worker Secret.\n');
