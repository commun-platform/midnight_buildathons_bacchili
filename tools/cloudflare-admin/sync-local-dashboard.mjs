import { spawnSync } from 'node:child_process';
import { repoRoot, wranglerConfig } from './wrangler-context.mjs';

const databaseName = 'midnight-sensor-data-v2';
const projectId = 'measurement-authenticity-01';

function runWrangler(args) {
  const result = spawnSync('npx', ['wrangler', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`wrangler exited with status ${result.status ?? 'unknown'}`);
  }
  return result.stdout;
}

function remoteRows(sql) {
  const output = runWrangler([
    'd1', 'execute', databaseName,
    '--remote',
    '--config', wranglerConfig,
    '--command', sql,
    '--json',
  ]);
  const parsed = JSON.parse(output);
  return parsed.flatMap((result) => result.results ?? []);
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite numbers cannot be written to D1');
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function upsertStatements(table, conflictColumns, columns, rows) {
  const conflictKeys = Array.isArray(conflictColumns) ? conflictColumns : [conflictColumns];
  return rows.map((row) => {
    const names = columns.join(', ');
    const values = columns.map((column) => sqlLiteral(row[column])).join(', ');
    const updates = columns
      .filter((column) => !conflictKeys.includes(column))
      .map((column) => `${column} = excluded.${column}`)
      .join(', ');
    return `INSERT INTO ${table} (${names}) VALUES (${values}) ON CONFLICT(${conflictKeys.join(', ')}) DO UPDATE SET ${updates};`;
  });
}

function writeLocal(statements) {
  if (statements.length === 0) return;
  runWrangler([
    'd1', 'execute', databaseName,
    '--local',
    '--config', wranglerConfig,
    '--command', statements.join('\n'),
  ]);
}

const tableSpecs = [
  {
    table: 'projects',
    key: 'id',
    columns: [
      'id', 'name', 'organization', 'timezone', 'expected_interval_minutes', 'created_at',
      'name_ja', 'organization_ja',
    ],
    query: `SELECT id, name, organization, timezone, expected_interval_minutes, created_at,
      name_ja, organization_ja FROM projects WHERE id = '${projectId}'`,
  },
  {
    table: 'devices',
    key: 'id',
    columns: [
      'id', 'project_id', 'name', 'device_type', 'sensor_type', 'unit',
      'expected_interval_minutes', 'normal_min', 'normal_max', 'last_seen_at', 'created_at',
      'name_ja', 'device_type_ja', 'threshold_policy_version',
      'midnight_device_commitment', 'midnight_device_authority',
      'midnight_registry_status', 'midnight_registration_version',
      'midnight_contract_address',
    ],
    query: `SELECT id, project_id, name, device_type, sensor_type, unit,
      expected_interval_minutes, normal_min, normal_max, last_seen_at, created_at,
      name_ja, device_type_ja, threshold_policy_version,
      midnight_device_commitment, midnight_device_authority,
      midnight_registry_status, midnight_registration_version,
      midnight_contract_address
      FROM devices WHERE project_id = '${projectId}'`,
  },
  {
    table: 'device_auth_keys',
    key: 'key_id',
    columns: [
      'key_id', 'device_id', 'project_id', 'algorithm', 'public_key_jwk',
      'allowed_scopes_json', 'status', 'registered_at', 'rotated_at', 'last_authenticated_at',
    ],
    query: `SELECT key_id, device_id, project_id, algorithm, public_key_jwk,
      allowed_scopes_json, status, registered_at, rotated_at, last_authenticated_at
      FROM device_auth_keys WHERE project_id = '${projectId}'`,
  },
  {
    table: 'measurement_windows',
    key: ['device_id', 'period_start', 'period_end'],
    columns: [
      'batch_id', 'project_id', 'device_id', 'sensor_type', 'unit', 'period_start',
      'period_end', 'sample_count', 'minimum', 'maximum', 'average', 'commitment',
      'threshold_policy_version', 'received_at',
    ],
    query: `SELECT batch_id, project_id, device_id, sensor_type, unit, period_start,
      period_end, sample_count, minimum, maximum, average, commitment,
      threshold_policy_version, received_at FROM measurement_windows
      WHERE project_id = '${projectId}' ORDER BY period_start DESC LIMIT 2160`,
  },
  {
    table: 'anomaly_events',
    key: 'event_id',
    columns: [
      'event_id', 'project_id', 'device_id', 'sensor_type', 'unit', 'transition',
      'occurred_at', 'threshold_policy_version', 'received_at',
    ],
    query: `SELECT event_id, project_id, device_id, sensor_type, unit, transition,
      occurred_at, threshold_policy_version, received_at FROM anomaly_events
      WHERE project_id = '${projectId}' ORDER BY occurred_at DESC LIMIT 100`,
  },
  {
    table: 'anomaly_states',
    key: 'device_id',
    columns: ['device_id', 'project_id', 'state', 'last_event_id', 'changed_at'],
    query: `SELECT device_id, project_id, state, last_event_id, changed_at
      FROM anomaly_states WHERE project_id = '${projectId}'`,
  },
  {
    table: 'threshold_policies',
    key: 'policy_id',
    columns: [
      'policy_id', 'policy_key', 'project_id', 'sensor_type', 'unit', 'mode',
      'minimum', 'maximum', 'value_scale', 'sensor_type_code', 'unit_code',
      'policy_version', 'status', 'contract_address', 'registered_tx_id', 'registered_at',
    ],
    query: `SELECT policy_id, policy_key, project_id, sensor_type, unit, mode,
      minimum, maximum, value_scale, sensor_type_code, unit_code, policy_version,
      status, contract_address, registered_tx_id, registered_at FROM threshold_policies
      WHERE project_id = '${projectId}'`,
  },
  {
    table: 'policy_assignments',
    key: 'assignment_id',
    columns: [
      'assignment_id', 'assignment_key', 'policy_id', 'project_id', 'device_id',
      'valid_from', 'valid_until', 'assignment_version', 'status', 'contract_address',
      'registered_tx_id', 'registered_at',
    ],
    query: `SELECT assignment_id, assignment_key, policy_id, project_id, device_id,
      valid_from, valid_until, assignment_version, status, contract_address,
      registered_tx_id, registered_at FROM policy_assignments
      WHERE project_id = '${projectId}'`,
  },
  {
    table: 'daily_proof_jobs',
    key: 'id',
    columns: [
      'id', 'project_id', 'device_id', 'period_date', 'contract_address', 'measurement_group_id',
      'attestation_commitment', 'device_commitment', 'sample_count',
      'threshold_policy_version', 'policy_key',
      'assignment_id', 'assignment_key', 'hour_presence', 'observed_hour_count',
      'threshold_satisfied', 'schema_version', 'circuit_version', 'status', 'attempt_count',
      'available_after', 'lease_expires_at',
      'proof_artifact_key', 'device_transaction_hash', 'device_transaction_bytes',
      'sponsor_serialized_sha256', 'sponsor_transaction_id', 'sponsor_fee_specks',
      'sponsor_transaction_bytes', 'sponsor_attempt_count', 'sponsor_available_after',
      'sponsorship_started_at', 'sponsorship_completed_at',
      'attest_tx_id', 'attest_tx_hash', 'block_height',
      'last_error_code', 'created_at', 'updated_at',
    ],
    query: `SELECT id, project_id, device_id, period_date, contract_address, measurement_group_id,
      attestation_commitment, device_commitment, sample_count, threshold_policy_version,
      policy_key, assignment_id, assignment_key, hour_presence, observed_hour_count,
      threshold_satisfied, schema_version, circuit_version, status, attempt_count,
      available_after, lease_expires_at, proof_artifact_key, device_transaction_hash,
      device_transaction_bytes, sponsor_serialized_sha256, sponsor_transaction_id,
      sponsor_fee_specks, sponsor_transaction_bytes, sponsor_attempt_count,
      sponsor_available_after, sponsorship_started_at, sponsorship_completed_at,
      attest_tx_id, attest_tx_hash, block_height, last_error_code, created_at, updated_at
      FROM daily_proof_jobs
      WHERE project_id = '${projectId}' ORDER BY created_at DESC LIMIT 100`,
  },
];

const counts = {};
const snapshots = [];
for (const spec of tableSpecs) {
  const rows = remoteRows(spec.query);
  snapshots.push({ spec, rows });
  counts[spec.table] = rows.length;
}

writeLocal([
  `DELETE FROM daily_proof_jobs WHERE project_id = ${sqlLiteral(projectId)};`,
  `DELETE FROM anomaly_states WHERE project_id = ${sqlLiteral(projectId)};`,
  `DELETE FROM anomaly_events WHERE project_id = ${sqlLiteral(projectId)};`,
  `DELETE FROM measurement_windows WHERE project_id = ${sqlLiteral(projectId)};`,
  `DELETE FROM device_auth_keys WHERE project_id = ${sqlLiteral(projectId)};`,
  `DELETE FROM policy_assignments WHERE project_id = ${sqlLiteral(projectId)};`,
  `DELETE FROM threshold_policies WHERE project_id = ${sqlLiteral(projectId)};`,
  `DELETE FROM devices WHERE project_id = ${sqlLiteral(projectId)};`,
  `DELETE FROM projects WHERE id = ${sqlLiteral(projectId)};`,
  ...snapshots.flatMap(({ spec, rows }) => upsertStatements(
    spec.table,
    spec.key,
    spec.columns,
    rows,
  )),
]);

process.stdout.write(`${JSON.stringify({
  projectId,
  copied: counts,
  excluded: [
    'readings',
    'legacy proof_jobs and attestations',
    'device_auth_challenges',
    'device_auth_sessions',
    'operator_proof_leases',
    'transaction_jobs and signed transaction object keys',
    'R2 proof artifacts',
  ],
}, null, 2)}\n`);
