import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const wrangler = path.join(workspaceRoot, 'node_modules', '.bin', 'wrangler');
const config = path.join(workspaceRoot, 'wrangler.jsonc');

function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runWrangler(args) {
  const result = spawnSync(wrangler, [...args, '--config', config], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    if (result.error) throw result.error;
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `Wrangler exited ${result.status}`);
  }
  return result.stdout;
}

function rows(sql) {
  const output = runWrangler([
    'd1', 'execute', 'midnight-sensor-data-v2', '--remote', '--json', '--command', sql,
  ]);
  const parsed = JSON.parse(output);
  return parsed.flatMap((result) => result.results ?? []);
}

const proofJobId = flag('job-id')?.trim() ?? '';
if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(proofJobId)) {
  throw new Error('--job-id must be a valid Proof Job ID');
}
if (!hasFlag('confirm-integration-test')) {
  throw new Error('Immediate admission requires --confirm-integration-test');
}

const existing = rows(
  `SELECT id, status, available_after FROM daily_proof_jobs WHERE id = ${sqlString(proofJobId)} LIMIT 1`,
)[0];
if (!existing) throw new Error(`Proof Job not found: ${proofJobId}`);
if (!['pending', 'retryable_failed'].includes(existing.status)) {
  throw new Error(`Proof Job ${proofJobId} cannot be admitted from status ${existing.status}`);
}

const now = new Date();
const nowIso = now.toISOString();
const nowSeconds = Math.floor(now.valueOf() / 1000);
const leaseExpiresAt = new Date(now.valueOf() + 2 * 60 * 60 * 1000).toISOString();
const updateSql = `UPDATE daily_proof_jobs
SET status = 'ready_for_input', attempt_count = attempt_count + 1,
    lease_expires_at = ${sqlString(leaseExpiresAt)}, last_error_code = NULL,
    updated_at = ${sqlString(nowIso)}
WHERE id = ${sqlString(proofJobId)}
  AND status IN ('pending', 'retryable_failed')
  AND NOT EXISTS (
    SELECT 1 FROM daily_proof_jobs
    WHERE status IN ('ready_for_input', 'proving', 'proof_ready')
      AND lease_expires_at > ${sqlString(nowIso)}
  )
  AND NOT EXISTS (
    SELECT 1 FROM operator_proof_leases
    WHERE status = 'active' AND expires_at > ${nowSeconds}
  );`;

runWrangler([
  'd1', 'execute', 'midnight-sensor-data-v2', '--remote', '--yes', '--command', updateSql,
]);

const admitted = rows(
  `SELECT id, status, attempt_count, lease_expires_at, updated_at
   FROM daily_proof_jobs WHERE id = ${sqlString(proofJobId)} LIMIT 1`,
)[0];
if (admitted?.status !== 'ready_for_input' || admitted.lease_expires_at !== leaseExpiresAt) {
  throw new Error('Proof capacity is already leased or the Proof Job state changed');
}

process.stdout.write(`${JSON.stringify({
  integrationTest: true,
  scheduleBypassed: true,
  proofJobId,
  previousStatus: existing.status,
  previousAvailableAfter: existing.available_after,
  status: admitted.status,
  attemptCount: admitted.attempt_count,
  leaseExpiresAt: admitted.lease_expires_at,
}, null, 2)}\n`);
