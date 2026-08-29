import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const wrangler = path.join(workspaceRoot, 'node_modules', '.bin', 'wrangler');
const config = path.join(workspaceRoot, 'wrangler.jsonc');
const supportedScopes = new Set([
  'measurement:write',
  'anomaly:write',
  'proof:request',
  'proof:read',
  'proof:generate',
  'transaction:submit',
  'configuration:read',
  'device:status',
]);

function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3);
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
  return result;
}

function validateIdentifier(name, value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)) {
    throw new Error(`Invalid ${name} in enrollment bundle`);
  }
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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
  try {
    return collectResults(JSON.parse(result.stdout));
  } catch {
    throw new Error('Could not parse Wrangler D1 response');
  }
}

const enrollmentFile = flag('enrollment');
if (!enrollmentFile) throw new Error('--enrollment is required');
const enrollmentPath = path.resolve(enrollmentFile);
const enrollment = JSON.parse(fs.readFileSync(enrollmentPath, 'utf8'));
if (enrollment.schemaVersion !== 1 || enrollment.algorithm !== 'ES256') {
  throw new Error('Enrollment schema or algorithm is unsupported');
}
validateIdentifier('deviceId', enrollment.deviceId);
validateIdentifier('projectId', enrollment.projectId);
if (
  enrollment.publicKeyJwk?.kty !== 'EC'
  || enrollment.publicKeyJwk.crv !== 'P-256'
  || typeof enrollment.publicKeyJwk.x !== 'string'
  || typeof enrollment.publicKeyJwk.y !== 'string'
  || enrollment.publicKeyJwk.d !== undefined
) throw new Error('Enrollment must contain a public-only P-256 JWK');
if (
  !Array.isArray(enrollment.requestedScopes)
  || enrollment.requestedScopes.length === 0
  || !enrollment.requestedScopes.every((scope) => supportedScopes.has(scope))
) throw new Error('Enrollment contains unsupported or empty scopes');
const imported = crypto.createPublicKey({ key: enrollment.publicKeyJwk, format: 'jwk' });
const spki = imported.export({ type: 'spki', format: 'der' });
const expectedKeyId = crypto.createHash('sha256').update(spki).digest('base64url');
if (enrollment.keyId !== expectedKeyId) throw new Error('Enrollment keyId does not match its public key');

const devices = queryRows(
  `SELECT id, project_id, midnight_registry_status, midnight_device_commitment, `
  + `midnight_device_authority, midnight_registration_version, midnight_contract_address, `
  + `midnight_registered_tx_id, midnight_authority_tx_id FROM devices `
  + `WHERE id = ${sqlString(enrollment.deviceId)} `
  + `AND project_id = ${sqlString(enrollment.projectId)} LIMIT 1`,
);
if (!devices.some((row) => row?.id === enrollment.deviceId
  && row?.project_id === enrollment.projectId
  && row?.midnight_registry_status === 'registered'
  && typeof row?.midnight_device_commitment === 'string' && row.midnight_device_commitment
  && typeof row?.midnight_device_authority === 'string' && row.midnight_device_authority
  && Number.isSafeInteger(Number(row?.midnight_registration_version))
  && Number(row.midnight_registration_version) > 0
  && typeof row?.midnight_contract_address === 'string' && row.midnight_contract_address
  && typeof row?.midnight_registered_tx_id === 'string' && row.midnight_registered_tx_id
  && typeof row?.midnight_authority_tx_id === 'string' && row.midnight_authority_tx_id)) {
  throw new Error(
    'Device must be registered on Midnight and mirrored to D1 before its P-256 key is activated',
  );
}

const activeKeys = queryRows(
  `SELECT key_id FROM device_auth_keys WHERE device_id = ${sqlString(enrollment.deviceId)} `
  + "AND status = 'active' LIMIT 1",
);
const activeKeyId = typeof activeKeys[0]?.key_id === 'string' ? activeKeys[0].key_id : null;
if (activeKeyId === enrollment.keyId) {
  process.stdout.write(`${JSON.stringify({
    registered: true,
    unchanged: true,
    deviceId: enrollment.deviceId,
    projectId: enrollment.projectId,
    keyId: enrollment.keyId,
    scopes: enrollment.requestedScopes,
  }, null, 2)}\n`);
  process.exit(0);
}
if (activeKeyId && !process.argv.includes('--confirm-replace')) {
  throw new Error('An active Device Identity already exists in D1; use --confirm-replace for an approved rotation');
}

const now = new Date().toISOString();
const nowSeconds = Math.floor(Date.now() / 1000);
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'device-enrollment-'));
const sqlPath = path.join(temporaryDirectory, 'register-device-key.sql');
// Wrangler maps the statements in a SQL file to one D1 batch. D1 batches are
// transactional; explicit BEGIN/COMMIT statements are rejected by Remote D1.
const registrationSql = `PRAGMA foreign_keys = ON;
UPDATE device_auth_keys
SET status = 'revoked', rotated_at = ${sqlString(now)}
WHERE device_id = ${sqlString(enrollment.deviceId)} AND status = 'active';
UPDATE device_auth_sessions
SET revoked_at = ${nowSeconds}
WHERE device_id = ${sqlString(enrollment.deviceId)} AND revoked_at IS NULL;
INSERT INTO device_auth_keys (
  key_id, device_id, project_id, algorithm, public_key_jwk,
  allowed_scopes_json, status, registered_at, rotated_at, last_authenticated_at
) VALUES (
  ${sqlString(enrollment.keyId)},
  ${sqlString(enrollment.deviceId)},
  ${sqlString(enrollment.projectId)},
  'ES256',
  ${sqlString(JSON.stringify(enrollment.publicKeyJwk))},
  ${sqlString(JSON.stringify([...new Set(enrollment.requestedScopes)].sort()))},
  'active',
  ${sqlString(now)},
  NULL,
  NULL
)
ON CONFLICT(key_id) DO UPDATE SET
  device_id = excluded.device_id,
  project_id = excluded.project_id,
  algorithm = excluded.algorithm,
  public_key_jwk = excluded.public_key_jwk,
  allowed_scopes_json = excluded.allowed_scopes_json,
  status = 'active',
  registered_at = excluded.registered_at,
  rotated_at = NULL,
  last_authenticated_at = NULL;
`;
try {
  fs.writeFileSync(sqlPath, registrationSql, { mode: 0o600, flag: 'wx' });
  runWrangler([
    'd1', 'execute', 'midnight-sensor-data-v2', '--remote', '--yes', '--file', sqlPath,
  ]);
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  registered: true,
  rotated: Boolean(activeKeyId),
  deviceId: enrollment.deviceId,
  projectId: enrollment.projectId,
  keyId: enrollment.keyId,
  scopes: enrollment.requestedScopes,
}, null, 2)}\n`);
