import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { repoRoot, wrangler, wranglerConfig } from './wrangler-context.mjs';

function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runWrangler(args) {
  const result = spawnSync(wrangler, [...args, '--config', wranglerConfig], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    if (result.error) throw result.error;
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `Wrangler exited ${result.status}`);
  }
  return result;
}

function collectResults(value) {
  if (Array.isArray(value)) return value.flatMap(collectResults);
  if (!value || typeof value !== 'object') return [];
  const own = Array.isArray(value.results) ? value.results : [];
  return [...own, ...Object.values(value).flatMap((item) => item === own ? [] : collectResults(item))];
}

function queryRows(sql) {
  const result = runWrangler([
    'd1', 'execute', 'midnight-sensor-data-v2', '--remote', '--json', '--command', sql,
  ]);
  return collectResults(JSON.parse(result.stdout));
}

function runChild(command, args, environment = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, env: environment, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Fleet administration exited ${code ?? signal}`));
    });
  });
}

const action = flag('action');
if (!['register', 'rotate', 'disable'].includes(action)) {
  throw new Error('--action must be register, rotate, or disable');
}
const deviceId = flag('device-id')?.trim();
if (!deviceId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(deviceId)) {
  throw new Error('--device-id is required and must be a safe identifier');
}
const deviceAuthority = flag('device-authority')?.trim().replace(/^0x/iu, '');
if (action !== 'disable' && (!deviceAuthority || !/^(?:[0-9a-f]{2}){32}$/iu.test(deviceAuthority))) {
  throw new Error('--device-authority must contain the Device public 32-byte authority value');
}
if (process.env.DEVELOPMENT_PROOF_ACCESS_TOKEN) {
  throw new Error('Refusing a preconfigured DEVELOPMENT_PROOF_ACCESS_TOKEN');
}

const forwardedNames = action === 'register'
  ? [
      'device-id', 'device-authority', 'policy-id', 'assignment-id',
      'device-registration-version', 'assignment-version', 'valid-from', 'valid-until',
    ]
  : action === 'rotate'
    ? ['device-id', 'device-authority', 'device-registration-version']
    : ['device-id'];
const forwarded = forwardedNames.flatMap((name) => {
  const value = flag(name);
  return value === undefined ? [] : [`--${name}`, value];
});

const leaseId = `admin-${crypto.randomUUID()}`;
const token = `vsp_operator_${crypto.randomBytes(32).toString('base64url')}`;
const tokenHash = crypto.createHash('sha256').update(token).digest('base64url');
const issuedAt = Math.floor(Date.now() / 1000);
const expiresAt = issuedAt + 30 * 60;
const nowIso = new Date(issuedAt * 1000).toISOString();
const insertSql = `INSERT INTO operator_proof_leases (
  id, token_sha256, purpose, status, issued_at, expires_at, revoked_at
)
SELECT ${sqlString(leaseId)}, ${sqlString(tokenHash)}, 'contract_admin', 'active',
       ${issuedAt}, ${expiresAt}, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM operator_proof_leases WHERE status = 'active' AND expires_at > ${issuedAt}
)
AND NOT EXISTS (
  SELECT 1 FROM daily_proof_jobs
  WHERE status IN ('ready_for_input', 'proving', 'proof_ready')
    AND lease_expires_at > ${sqlString(nowIso)}
);`;

let leaseCreated = false;
try {
  runWrangler([
    'd1', 'execute', 'midnight-sensor-data-v2', '--remote', '--yes', '--command', insertSql,
  ]);
  const rows = queryRows(
    `SELECT id FROM operator_proof_leases WHERE id = ${sqlString(leaseId)} AND status = 'active' LIMIT 1`,
  );
  if (!rows.some((row) => row?.id === leaseId)) {
    throw new Error('Proof capacity is already leased by a Device Job or another operator');
  }
  leaseCreated = true;
  process.stdout.write(`Ephemeral contract_admin Proof Lease ${leaseId} issued.\n`);
  const command = action === 'register'
    ? 'development:device:register'
    : action === 'rotate'
      ? 'development:device:rotate'
      : 'development:device:disable';
  await runChild('npm', ['run', command, '--', ...forwarded], {
    ...process.env,
    DEVELOPMENT_PROOF_ACCESS_TOKEN: token,
  });
  await runChild('npm', [
    'run', 'cloudflare:device:sync-midnight', '--', '--device-id', deviceId,
  ]);
} finally {
  if (leaseCreated) {
    const revokedAt = Math.floor(Date.now() / 1000);
    runWrangler([
      'd1', 'execute', 'midnight-sensor-data-v2', '--remote', '--yes', '--command',
      `UPDATE operator_proof_leases SET status = 'revoked', revoked_at = ${revokedAt}
       WHERE id = ${sqlString(leaseId)} AND status = 'active'`,
    ]);
    process.stdout.write(`Operator Proof Lease ${leaseId} revoked.\n`);
  }
}
