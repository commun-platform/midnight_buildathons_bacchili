import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { repoRoot, wrangler, wranglerConfig } from './wrangler-context.mjs';

function usage() {
  return [
    'Usage:',
    '  npm run cloudflare:sponsor:always-on',
    '  npm run cloudflare:sponsor:on-demand',
    '  npm run cloudflare:sponsor:scheduled',
    '  node tools/cloudflare-admin/set-sponsor-wallet-operating-mode.mjs scheduled --starts-at-hour 2 --utc-offset-minutes 540',
  ].join('\n');
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1]) throw new Error(`${name} requires a value`);
  return args[index + 1];
}

function integerOption(args, name, fallback, minimum, maximum) {
  const value = Number(option(args, name, String(fallback)));
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function localEnvironment() {
  const result = { ...process.env };
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) return result;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match || result[match[1]]) continue;
    const raw = match[2].trim();
    result[match[1]] = (
      (raw.startsWith('"') && raw.endsWith('"'))
      || (raw.startsWith("'") && raw.endsWith("'"))
    ) ? raw.slice(1, -1) : raw.replace(/\s+#.*$/u, '').trim();
  }
  return result;
}

const args = process.argv.slice(2);
const mode = args[0];
if (!['always-on', 'on-demand', 'scheduled'].includes(mode)) throw new Error(usage());
const startsAtHour = integerOption(args, '--starts-at-hour', 2, 0, 23);
const offsetMinutes = integerOption(args, '--utc-offset-minutes', 540, -840, 840);

const update = mode !== 'scheduled'
  ? `UPDATE sponsor_wallet_operating_schedule
     SET mode = '${mode}', updated_at = datetime('now')
     WHERE singleton_id = 1;`
  : `UPDATE sponsor_wallet_operating_schedule
     SET mode = 'scheduled', time_zone_offset_minutes = ${offsetMinutes},
         opens_at_minute = ${startsAtHour * 60},
         processing_starts_at_minute = ${startsAtHour * 60},
         updated_at = datetime('now')
     WHERE singleton_id = 1;`;

const sql = `${update}
SELECT mode, time_zone_offset_minutes, processing_starts_at_minute, updated_at
FROM sponsor_wallet_operating_schedule WHERE singleton_id = 1;`;
const result = spawnSync(
  wrangler,
  [
    'd1', 'execute', 'midnight-sensor-data-v2', '--remote',
    '--command', sql, '--config', wranglerConfig,
  ],
  {
    cwd: repoRoot,
    env: localEnvironment(),
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Wrangler exited with status ${result.status}`);
process.stdout.write(mode === 'always-on'
  ? 'Sponsor Wallet is configured for continuous runtime maintenance.\n'
  : mode === 'on-demand'
    ? 'Sponsor Wallet is configured to start only when the one-minute coordinator finds work.\n'
    : `Sponsor Wallet daily processing starts at ${String(startsAtHour).padStart(2, '0')}:00 at UTC${offsetMinutes >= 0 ? '+' : ''}${offsetMinutes / 60}.\n`);
