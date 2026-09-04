import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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
  try {
    return collectResults(JSON.parse(result.stdout));
  } catch {
    throw new Error('Could not parse Wrangler D1 response');
  }
}

function requireFreshMirrorIdentifiers() {
  const deviceId = flag('device-id')?.trim() || 'edge-temp-001';
  const policyId = flag('policy-id')?.trim() || 'temperature-v1';
  const assignmentId = flag('assignment-id')?.trim() || `${deviceId}-${policyId}-wave1`;
  const collisions = queryRows(
    `SELECT 'policy' AS kind, policy_id AS identifier
       FROM threshold_policies WHERE policy_id = ${sqlString(policyId)}
     UNION ALL
     SELECT 'assignment' AS kind, assignment_id AS identifier
       FROM policy_assignments WHERE assignment_id = ${sqlString(assignmentId)}`,
  );
  if (collisions.length > 0) {
    const kinds = collisions.map((row) => `${row.kind}:${row.identifier}`).join(', ');
    throw new Error(
      `D1 already retains confirmed history for ${kinds}. `
      + 'Use new --policy-id and --assignment-id values before deploying another contract.',
    );
  }
}

const policyFlags = [
  'device-id',
  'policy-id',
  'assignment-id',
  'policy-mode',
  'min',
  'max',
  'value-scale',
  'sensor-type-code',
  'unit-code',
  'policy-version',
  'assignment-version',
  'time-zone-offset-minutes',
  'local-day-start-hour',
  'valid-from',
  'valid-until',
];

function runDeployment(authority, token) {
  const forwarded = policyFlags.flatMap((name) => {
    const value = flag(name);
    return value === undefined ? [] : [`--${name}`, value];
  });
  return new Promise((resolve, reject) => {
    const child = spawn(
      'npm',
      [
        'run',
        'development:deploy',
        '--',
        '--device-authority',
        authority.toLowerCase(),
        ...forwarded,
      ],
      {
        cwd: repoRoot,
        env: { ...process.env, DEVELOPMENT_PROOF_ACCESS_TOKEN: token },
        stdio: 'inherit',
      },
    );
    let forwardedSignal = null;
    const forward = (signal) => {
      forwardedSignal = signal;
      child.kill(signal);
    };
    const onSigint = () => forward('SIGINT');
    const onSigterm = () => forward('SIGTERM');
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      if (code === 0) resolve();
      else reject(new Error(
        forwardedSignal || signal
          ? `Contract deployment interrupted by ${forwardedSignal || signal}`
          : `Contract deployment exited ${code}`,
      ));
    });
  });
}

function syncPolicyMirror() {
  const network = process.env.MIDNIGHT_NETWORK?.trim() || 'preprod';
  const deploymentPath = path.join(repoRoot, '.state', 'development', `deployment-${network}.json`);
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  if (deployment.contractSchemaVersion !== 5) {
    throw new Error('Refusing to sync an incompatible Fleet Registry deployment record');
  }
  const initialDevice = deployment.devices?.[0];
  if (
    !deployment.deploymentTxId
    || !deployment.policyRegisteredTxId
    || !initialDevice?.registeredTxId
    || !initialDevice.assignmentRegisteredTxId
    || !initialDevice.authorityTxId
  ) throw new Error('Fleet deployment record is missing confirmed administration Transaction evidence');
  const minimum = deployment.policyMode === 'upper-bound'
    ? 'NULL'
    : String(Number(deployment.thresholdMinimum));
  const maximum = deployment.policyMode === 'lower-bound'
    ? 'NULL'
    : String(Number(deployment.thresholdMaximum));
  const timeZoneOffsetMinutes = Number(deployment.timeZoneOffsetMinutes);
  const offsetSign = timeZoneOffsetMinutes >= 0 ? '+' : '-';
  const offsetHours = String(Math.floor(Math.abs(timeZoneOffsetMinutes) / 60)).padStart(2, '0');
  const offsetMinutes = String(Math.abs(timeZoneOffsetMinutes) % 60).padStart(2, '0');
  const timeZoneLabel = `UTC${offsetSign}${offsetHours}:${offsetMinutes}`;
  const statements = [
    `INSERT INTO threshold_policies (
       policy_id, policy_key, project_id, sensor_type, unit, mode, name,
       minimum, maximum, value_scale, sensor_type_code, unit_code,
       policy_version, status, contract_address, registered_tx_id, registered_at
     ) VALUES (
       ${sqlString(deployment.policyId)}, ${sqlString(deployment.policyKey)},
       'measurement-authenticity-01', 'temperature', '°C',
       ${sqlString(deployment.policyMode)}, ${sqlString(deployment.policyId)},
       ${minimum}, ${maximum},
       ${Number(deployment.valueScale)}, ${Number(deployment.sensorTypeCode)},
       ${Number(deployment.unitCode)}, ${Number(deployment.policyVersion)},
       'registered', ${sqlString(deployment.contractAddress)}, ${sqlString(deployment.policyRegisteredTxId)},
       ${sqlString(deployment.deployedAt)}
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
       name = excluded.name,
       status = 'registered',
       contract_address = excluded.contract_address,
       registered_tx_id = excluded.registered_tx_id`,
    `INSERT OR IGNORE INTO project_policies (project_id, policy_id, created_at)
     VALUES (
       'measurement-authenticity-01',
       ${sqlString(deployment.policyId)},
       ${sqlString(deployment.deployedAt)}
     )`,
    `UPDATE projects
     SET timezone = ${sqlString(timeZoneLabel)},
         time_zone_offset_minutes = ${timeZoneOffsetMinutes},
         local_day_start_hour = ${Number(deployment.localDayStartHour)}
     WHERE id = 'measurement-authenticity-01'`,
    `INSERT INTO policy_assignments (
       assignment_id, assignment_key, policy_id, project_id, device_id,
       valid_from, valid_until, assignment_version, status, device_commitment,
       contract_address, registered_tx_id, registered_at,
       time_zone_offset_minutes, local_day_start_hour, utc_day_start_minute
     ) VALUES (
       ${sqlString(deployment.assignmentId)}, ${sqlString(deployment.assignmentKey)},
       ${sqlString(deployment.policyId)}, 'measurement-authenticity-01',
       ${sqlString(deployment.deviceId)},
       ${deployment.validFrom ? sqlString(deployment.validFrom) : 'NULL'},
       ${deployment.validUntil ? sqlString(deployment.validUntil) : 'NULL'},
       ${Number(deployment.assignmentVersion)}, 'registered', ${sqlString(deployment.deviceCommitment)},
       ${sqlString(deployment.contractAddress)}, ${sqlString(initialDevice.assignmentRegisteredTxId)},
       ${sqlString(deployment.deployedAt)}, ${Number(deployment.timeZoneOffsetMinutes)},
       ${Number(deployment.localDayStartHour)}, ${Number(deployment.utcDayStartMinute)}
     )
     ON CONFLICT(assignment_id) DO UPDATE SET
       assignment_key = excluded.assignment_key,
       policy_id = excluded.policy_id,
       valid_from = excluded.valid_from,
       valid_until = excluded.valid_until,
       assignment_version = excluded.assignment_version,
       time_zone_offset_minutes = excluded.time_zone_offset_minutes,
       local_day_start_hour = excluded.local_day_start_hour,
       utc_day_start_minute = excluded.utc_day_start_minute,
       device_commitment = excluded.device_commitment,
       status = 'registered',
       contract_address = excluded.contract_address,
       registered_tx_id = excluded.registered_tx_id`,
    `UPDATE devices
     SET threshold_policy_version = ${sqlString(deployment.policyId)},
         midnight_device_commitment = ${sqlString(deployment.deviceCommitment)},
         midnight_device_authority = ${sqlString(deployment.deviceAuthority)},
         midnight_registry_status = 'registered',
         midnight_registration_version = ${Number(initialDevice.registrationVersion)},
         midnight_contract_address = ${sqlString(deployment.contractAddress)},
         midnight_registered_tx_id = ${sqlString(initialDevice.registeredTxId)},
         midnight_authority_tx_id = ${sqlString(initialDevice.authorityTxId)},
         midnight_registered_at = ${sqlString(deployment.deployedAt)},
         operation_configuration_version = operation_configuration_version + 1,
         operation_configuration_updated_at = ${sqlString(deployment.deployedAt)}
     WHERE id = ${sqlString(deployment.deviceId)}
       AND project_id = 'measurement-authenticity-01'`,
  ];
  for (const sql of statements) {
    runWrangler([
      'd1', 'execute', 'midnight-sensor-data-v2', '--remote', '--yes', '--command', sql,
    ]);
  }
  const mirrored = queryRows(
    `SELECT d.midnight_device_commitment, d.midnight_registry_status,
            d.midnight_registered_tx_id, p.contract_address AS policy_contract_address,
            p.registered_tx_id AS policy_registered_tx_id,
            a.contract_address AS assignment_contract_address,
            a.registered_tx_id AS assignment_registered_tx_id,
            pr.time_zone_offset_minutes, pr.local_day_start_hour
     FROM devices d
     JOIN projects pr ON pr.id = d.project_id
     JOIN project_policies pp ON pp.project_id = d.project_id
       AND pp.policy_id = ${sqlString(deployment.policyId)}
     JOIN threshold_policies p ON p.policy_id = pp.policy_id
     JOIN policy_assignments a ON a.assignment_id = ${sqlString(deployment.assignmentId)}
       AND a.project_id = d.project_id AND a.device_id = d.id
     WHERE d.id = ${sqlString(deployment.deviceId)}
       AND d.project_id = 'measurement-authenticity-01' LIMIT 1`,
  );
  if (!mirrored.some((row) => row?.midnight_registry_status === 'registered'
    && row?.midnight_device_commitment === deployment.deviceCommitment
    && row?.midnight_registered_tx_id === initialDevice.registeredTxId
    && row?.policy_contract_address === deployment.contractAddress
    && row?.policy_registered_tx_id === deployment.policyRegisteredTxId
    && row?.assignment_contract_address === deployment.contractAddress
    && row?.assignment_registered_tx_id === initialDevice.assignmentRegisteredTxId
    && Number(row?.time_zone_offset_minutes) === Number(deployment.timeZoneOffsetMinutes)
    && Number(row?.local_day_start_hour) === Number(deployment.localDayStartHour))) {
    throw new Error('D1 mirror did not confirm the deployed Fleet Registry state');
  }
  process.stdout.write('D1 policy and assignment mirror updated from the confirmed deployment record.\n');
}

if (process.argv.includes('--sync-only')) {
  syncPolicyMirror();
  process.exit(0);
}

const authority = flag('device-authority')?.trim().replace(/^0x/iu, '');
if (!authority || !/^(?:[0-9a-f]{2}){32}$/iu.test(authority)) {
  throw new Error('--device-authority must contain the Device public 32-byte authority value');
}
if (process.env.DEVELOPMENT_PROOF_ACCESS_TOKEN) {
  throw new Error('Refusing a preconfigured DEVELOPMENT_PROOF_ACCESS_TOKEN; this command mints an ephemeral lease');
}
requireFreshMirrorIdentifiers();

const leaseId = `deploy-${crypto.randomUUID()}`;
const token = `vsp_operator_${crypto.randomBytes(32).toString('base64url')}`;
const tokenHash = crypto.createHash('sha256').update(token).digest('base64url');
const issuedAt = Math.floor(Date.now() / 1000);
const expiresAt = issuedAt + 30 * 60;
const nowIso = new Date(issuedAt * 1000).toISOString();
const insertSql = `INSERT INTO operator_proof_leases (
  id, token_sha256, purpose, status, issued_at, expires_at, revoked_at
)
SELECT ${sqlString(leaseId)}, ${sqlString(tokenHash)}, 'contract_deploy', 'active',
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
    throw new Error('Proof capacity is already leased by a Device Job or another deployment');
  }
  leaseCreated = true;
  process.stdout.write(`Ephemeral Operator Proof Lease ${leaseId} issued for up to 30 minutes.\n`);
  await runDeployment(authority, token);
  syncPolicyMirror();
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
