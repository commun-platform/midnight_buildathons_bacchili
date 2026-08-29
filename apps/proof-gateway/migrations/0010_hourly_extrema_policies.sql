PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS threshold_policies (
  policy_id TEXT PRIMARY KEY,
  policy_key TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sensor_type TEXT NOT NULL,
  unit TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('closed-range', 'upper-bound', 'lower-bound')),
  minimum REAL,
  maximum REAL,
  value_scale INTEGER NOT NULL CHECK (value_scale > 0),
  sensor_type_code INTEGER NOT NULL CHECK (sensor_type_code > 0),
  unit_code INTEGER NOT NULL CHECK (unit_code > 0),
  policy_version INTEGER NOT NULL CHECK (policy_version > 0),
  status TEXT NOT NULL CHECK (status IN ('registered', 'retired')),
  contract_address TEXT,
  registered_tx_id TEXT,
  registered_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_assignments (
  assignment_id TEXT PRIMARY KEY,
  assignment_key TEXT NOT NULL UNIQUE,
  policy_id TEXT NOT NULL REFERENCES threshold_policies(policy_id),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  valid_from TEXT,
  valid_until TEXT,
  assignment_version INTEGER NOT NULL CHECK (assignment_version > 0),
  status TEXT NOT NULL CHECK (status IN ('registered', 'retired')),
  contract_address TEXT,
  registered_tx_id TEXT,
  registered_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS policy_assignments_device_period
  ON policy_assignments(device_id, valid_from, valid_until);

CREATE TABLE IF NOT EXISTS daily_proof_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  period_date TEXT NOT NULL,
  attestation_commitment TEXT NOT NULL,
  device_commitment TEXT NOT NULL,
  sample_count INTEGER NOT NULL CHECK (sample_count >= 0),
  threshold_policy_version TEXT NOT NULL,
  policy_key TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  assignment_key TEXT NOT NULL,
  hour_presence TEXT NOT NULL CHECK (
    length(hour_presence) = 24
    AND hour_presence NOT GLOB '*[^01]*'
  ),
  observed_hour_count INTEGER NOT NULL CHECK (
    observed_hour_count >= 0 AND observed_hour_count <= 24
  ),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  circuit_version INTEGER NOT NULL CHECK (circuit_version > 0),
  status TEXT NOT NULL CHECK (status IN (
    'pending', 'dispatched', 'ready_for_input', 'proving', 'proof_ready',
    'signed', 'submitted', 'confirmed', 'retryable_failed', 'dead_lettered'
  )),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_after TEXT NOT NULL,
  lease_expires_at TEXT,
  proof_artifact_key TEXT,
  attest_tx_id TEXT,
  attest_tx_hash TEXT,
  block_height TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(device_id, period_date),
  UNIQUE(device_id, attestation_commitment),
  FOREIGN KEY (policy_key) REFERENCES threshold_policies(policy_key),
  FOREIGN KEY (assignment_key) REFERENCES policy_assignments(assignment_key)
);

CREATE INDEX IF NOT EXISTS daily_proof_jobs_dispatch
  ON daily_proof_jobs(status, available_after, created_at);

CREATE INDEX IF NOT EXISTS daily_proof_jobs_device_period
  ON daily_proof_jobs(device_id, period_date DESC);
