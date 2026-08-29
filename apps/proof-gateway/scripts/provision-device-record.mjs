import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { planDeviceProvisioning } from './provision-device-record-state.mjs';

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const wrangler = path.join(workspaceRoot, 'node_modules', '.bin', 'wrangler');
const config = path.join(workspaceRoot, 'wrangler.jsonc');

function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3);
}

function identifier(name, fallback) {
  const value = (flag(name) ?? fallback ?? '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(value)) {
    throw new Error(`--${name} must contain 1-160 safe identifier characters`);
  }
  return value;
}

function boundedInteger(name, fallback, minimum, maximum) {
  const raw = flag(name);
  const value = Number(raw ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`--${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return { value, explicitlyConfigured: raw !== undefined };
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

const deviceId = identifier('device-id');
const projectId = identifier('project-id', 'measurement-authenticity-01');
const policyId = identifier('policy-id', 'temperature-v1');
const sponsorQuota = boundedInteger('sponsor-daily-limit', 5, 1, 100);
const name = (flag('name') ?? deviceId).trim();
if (!name || name.length > 160) throw new Error('--name must contain 1-160 characters');
const network = process.env.MIDNIGHT_NETWORK?.trim() || 'preprod';
const deploymentPath = path.join(repoRoot, '.state', 'development', `deployment-${network}.json`);
if (!fs.existsSync(deploymentPath)) throw new Error(`Fleet Registry deployment record was not found for ${network}`);
const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
if (
  deployment.contractSchemaVersion !== 3
  || typeof deployment.contractAddress !== 'string'
  || !deployment.contractAddress
) throw new Error(`Compatible Fleet Registry deployment record was not found for ${network}`);

const existing = rows(
  `SELECT id, project_id, midnight_registry_status, midnight_contract_address FROM devices `
  + `WHERE id = ${sqlString(deviceId)} LIMIT 1`,
)[0];
const provisioningPlan = planDeviceProvisioning(existing, {
  deviceId,
  projectId,
  contractAddress: deployment.contractAddress,
});
if (provisioningPlan === 'replace-stale') {
  const now = new Date().toISOString();
  const nowSeconds = Math.floor(Date.now() / 1000);
  runWrangler([
    'd1', 'execute', 'midnight-sensor-data-v2', '--remote', '--yes', '--command',
    `UPDATE policy_assignments SET status = 'retired'
     WHERE device_id = ${sqlString(deviceId)} AND project_id = ${sqlString(projectId)}
       AND (contract_address IS NULL OR contract_address <> ${sqlString(deployment.contractAddress)})`,
  ]);
  runWrangler([
    'd1', 'execute', 'midnight-sensor-data-v2', '--remote', '--yes', '--command',
    `UPDATE device_auth_sessions SET revoked_at = ${nowSeconds}
     WHERE device_id = ${sqlString(deviceId)} AND project_id = ${sqlString(projectId)}
       AND revoked_at IS NULL`,
  ]);
  runWrangler([
    'd1', 'execute', 'midnight-sensor-data-v2', '--remote', '--yes', '--command',
    `UPDATE devices SET
       midnight_device_commitment = NULL,
       midnight_device_authority = NULL,
       midnight_registry_status = 'unregistered',
       midnight_registration_version = NULL,
       midnight_contract_address = NULL,
       midnight_registered_tx_id = NULL,
       midnight_authority_tx_id = NULL,
       midnight_disabled_tx_id = NULL,
       midnight_registered_at = NULL,
       operation_configuration_version = operation_configuration_version + 1,
       operation_configuration_updated_at = ${sqlString(now)}
     WHERE id = ${sqlString(deviceId)} AND project_id = ${sqlString(projectId)}
       AND midnight_registry_status = 'registered'
       AND midnight_contract_address <> ${sqlString(deployment.contractAddress)}`,
  ]);
}

runWrangler([
  'd1', 'execute', 'midnight-sensor-data-v2', '--remote', '--yes', '--command',
  `INSERT INTO devices (
     id, project_id, name, device_type, sensor_type, unit,
     expected_interval_minutes, normal_min, normal_max, threshold_policy_version,
     sponsor_daily_limit
   ) VALUES (
     ${sqlString(deviceId)}, ${sqlString(projectId)}, ${sqlString(name)},
     'Sensor Device', 'temperature', '°C', 1, NULL, NULL, ${sqlString(policyId)},
     ${sponsorQuota.value}
   )
   ON CONFLICT(id) DO UPDATE SET
     name = excluded.name,
     sensor_type = excluded.sensor_type,
     unit = excluded.unit,
     threshold_policy_version = excluded.threshold_policy_version,
     sponsor_daily_limit = excluded.sponsor_daily_limit
   WHERE devices.project_id = excluded.project_id
     AND devices.midnight_registry_status = 'unregistered'`,
]);

if (sponsorQuota.explicitlyConfigured) {
  runWrangler([
    'd1', 'execute', 'midnight-sensor-data-v2', '--remote', '--yes', '--command',
    `UPDATE devices SET sponsor_daily_limit = ${sponsorQuota.value}
     WHERE id = ${sqlString(deviceId)} AND project_id = ${sqlString(projectId)}`,
  ]);
}

const provisioned = rows(
  `SELECT id, project_id, threshold_policy_version, midnight_registry_status, sponsor_daily_limit `
  + `FROM devices WHERE id = ${sqlString(deviceId)} AND project_id = ${sqlString(projectId)} LIMIT 1`,
)[0];
const expectedRegistryStatus = provisioningPlan === 'already-current' ? 'registered' : 'unregistered';
if (!provisioned || provisioned.midnight_registry_status !== expectedRegistryStatus) {
  throw new Error('Pending Device record could not be verified');
}

process.stdout.write(`${JSON.stringify({
  provisioned: true,
  deviceId,
  projectId,
  thresholdPolicyVersion: policyId,
  midnightRegistryStatus: expectedRegistryStatus,
  sponsorDailyLimit: provisioned.sponsor_daily_limit,
  alreadyRegisteredOnCurrentContract: provisioningPlan === 'already-current',
  replacedStaleContract: provisioningPlan === 'replace-stale',
}, null, 2)}\n`);
