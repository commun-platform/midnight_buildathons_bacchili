import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const deviceId = flag('device-id')?.trim();
if (!deviceId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(deviceId)) {
  throw new Error('--device-id is required and must be a safe identifier');
}
const projectId = flag('project-id')?.trim() || 'measurement-authenticity-01';
const network = process.env.MIDNIGHT_NETWORK?.trim() || 'preprod';
const deploymentPath = path.join(repoRoot, '.state', 'development', `deployment-${network}.json`);
const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
if (deployment.contractSchemaVersion !== 3 || !Array.isArray(deployment.devices)) {
  throw new Error('Compatible Fleet Registry deployment record was not found');
}
const device = deployment.devices.find((candidate) => candidate.deviceId === deviceId);
if (!device) throw new Error(`Device ${deviceId} is absent from the confirmed local deployment record`);
if (
  typeof device.registeredTxId !== 'string' || !device.registeredTxId
  || typeof device.assignmentRegisteredTxId !== 'string' || !device.assignmentRegisteredTxId
  || typeof device.authorityTxId !== 'string' || !device.authorityTxId
) throw new Error(`Device ${deviceId} has no confirmed registration Transaction evidence`);
if (
  typeof deployment.policyRegisteredTxId !== 'string' || !deployment.policyRegisteredTxId
  || device.policyId !== deployment.policyId
) throw new Error(`Device ${deviceId} has no compatible confirmed Policy evidence`);
if (device.status === 'disabled' && (typeof device.disabledTxId !== 'string' || !device.disabledTxId)) {
  throw new Error(`Disabled Device ${deviceId} has no confirmed disable Transaction evidence`);
}
const d1Devices = queryRows(
  `SELECT id FROM devices WHERE id = ${sqlString(deviceId)} AND project_id = ${sqlString(projectId)} LIMIT 1`,
);
if (!d1Devices.some((row) => row?.id === deviceId)) {
  throw new Error(`Device ${deviceId} must be provisioned in D1 before its Midnight mirror is synchronized`);
}

const now = new Date().toISOString();
const nowSeconds = Math.floor(Date.now() / 1000);
const minimum = deployment.policyMode === 'upper-bound'
  ? 'NULL'
  : String(Number(deployment.thresholdMinimum));
const maximum = deployment.policyMode === 'lower-bound'
  ? 'NULL'
  : String(Number(deployment.thresholdMaximum));
const policyStatement = `INSERT INTO threshold_policies (
   policy_id, policy_key, project_id, sensor_type, unit, mode,
   minimum, maximum, value_scale, sensor_type_code, unit_code,
   policy_version, status, contract_address, registered_tx_id, registered_at
 ) VALUES (
   ${sqlString(deployment.policyId)}, ${sqlString(deployment.policyKey)},
   ${sqlString(projectId)}, 'temperature', '°C',
   ${sqlString(deployment.policyMode)}, ${minimum}, ${maximum},
   ${Number(deployment.valueScale)}, ${Number(deployment.sensorTypeCode)},
   ${Number(deployment.unitCode)}, ${Number(deployment.policyVersion)},
   'registered', ${sqlString(deployment.contractAddress)},
   ${sqlString(deployment.policyRegisteredTxId)}, ${sqlString(deployment.deployedAt)}
 )
 ON CONFLICT(policy_id) DO UPDATE SET
   policy_key = excluded.policy_key,
   mode = excluded.mode,
   minimum = excluded.minimum,
   maximum = excluded.maximum,
   value_scale = excluded.value_scale,
   sensor_type_code = excluded.sensor_type_code,
   unit_code = excluded.unit_code,
   policy_version = excluded.policy_version,
   status = 'registered',
   contract_address = excluded.contract_address,
   registered_tx_id = excluded.registered_tx_id`;
const statements = device.status === 'registered'
  ? [
      policyStatement,
      `UPDATE devices
       SET threshold_policy_version = ${sqlString(device.policyId)},
           midnight_device_commitment = ${sqlString(device.deviceCommitment)},
           midnight_device_authority = ${sqlString(device.deviceAuthority)},
           midnight_registry_status = 'registered',
           midnight_registration_version = ${Number(device.registrationVersion)},
           midnight_contract_address = ${sqlString(deployment.contractAddress)},
           midnight_registered_tx_id = ${sqlString(device.registeredTxId)},
           midnight_authority_tx_id = ${sqlString(device.authorityTxId)},
           midnight_disabled_tx_id = NULL,
           midnight_registered_at = ${sqlString(now)},
           operation_configuration_version = operation_configuration_version + 1,
           operation_configuration_updated_at = ${sqlString(now)}
       WHERE id = ${sqlString(deviceId)} AND project_id = ${sqlString(projectId)}`,
      `INSERT INTO policy_assignments (
         assignment_id, assignment_key, policy_id, project_id, device_id,
         valid_from, valid_until, assignment_version, status, device_commitment,
         contract_address, registered_tx_id, registered_at
       ) VALUES (
         ${sqlString(device.assignmentId)}, ${sqlString(device.assignmentKey)},
         ${sqlString(device.policyId)}, ${sqlString(projectId)}, ${sqlString(deviceId)},
         ${device.validFrom ? sqlString(device.validFrom) : 'NULL'},
         ${device.validUntil ? sqlString(device.validUntil) : 'NULL'},
         ${Number(device.assignmentVersion)}, 'registered', ${sqlString(device.deviceCommitment)},
         ${sqlString(deployment.contractAddress)}, ${sqlString(device.assignmentRegisteredTxId)},
         ${sqlString(now)}
       )
       ON CONFLICT(assignment_id) DO UPDATE SET
         assignment_key = excluded.assignment_key,
         policy_id = excluded.policy_id,
         project_id = excluded.project_id,
         device_id = excluded.device_id,
         valid_from = excluded.valid_from,
         valid_until = excluded.valid_until,
         assignment_version = excluded.assignment_version,
         status = 'registered',
         device_commitment = excluded.device_commitment,
         contract_address = excluded.contract_address,
         registered_tx_id = excluded.registered_tx_id`,
    ]
  : [
      policyStatement,
      `UPDATE devices
       SET midnight_registry_status = 'disabled',
           midnight_authority_tx_id = ${sqlString(device.authorityTxId)},
           midnight_disabled_tx_id = ${sqlString(device.disabledTxId)},
           operation_configuration_version = operation_configuration_version + 1,
           operation_configuration_updated_at = ${sqlString(now)}
       WHERE id = ${sqlString(deviceId)} AND project_id = ${sqlString(projectId)}`,
      `UPDATE policy_assignments
       SET status = 'retired'
       WHERE device_id = ${sqlString(deviceId)} AND project_id = ${sqlString(projectId)}`,
      `UPDATE device_auth_keys
       SET status = 'disabled', rotated_at = ${sqlString(now)}
       WHERE device_id = ${sqlString(deviceId)} AND project_id = ${sqlString(projectId)}
         AND status = 'active'`,
      `UPDATE device_auth_sessions
       SET revoked_at = ${nowSeconds}
       WHERE device_id = ${sqlString(deviceId)} AND project_id = ${sqlString(projectId)}
         AND revoked_at IS NULL`,
    ];

for (const sql of statements) {
  runWrangler([
    'd1', 'execute', 'midnight-sensor-data-v2', '--remote', '--yes', '--command', sql,
  ]);
}

const mirrored = queryRows(
  `SELECT midnight_device_commitment, midnight_device_authority,
          midnight_registry_status, midnight_registration_version,
          midnight_registered_tx_id, midnight_authority_tx_id, midnight_disabled_tx_id
   FROM devices WHERE id = ${sqlString(deviceId)} AND project_id = ${sqlString(projectId)} LIMIT 1`,
);
const expectedAuthority = device.deviceAuthority;
const expectedVersion = Number(device.registrationVersion);
const mirrorOk = device.status === 'registered'
  ? mirrored.some((row) => row?.midnight_registry_status === 'registered'
      && row?.midnight_device_commitment === device.deviceCommitment
      && row?.midnight_device_authority === expectedAuthority
      && Number(row?.midnight_registration_version) === expectedVersion
      && row?.midnight_registered_tx_id === device.registeredTxId
      && row?.midnight_authority_tx_id === device.authorityTxId)
  : mirrored.some((row) => row?.midnight_registry_status === 'disabled'
      && row?.midnight_disabled_tx_id === device.disabledTxId);
if (!mirrorOk) throw new Error(`D1 Device mirror verification failed for ${deviceId}`);

process.stdout.write(`${JSON.stringify({
  synced: true,
  deviceId,
  projectId,
  midnightRegistryStatus: device.status,
  contractAddress: deployment.contractAddress,
}, null, 2)}\n`);
