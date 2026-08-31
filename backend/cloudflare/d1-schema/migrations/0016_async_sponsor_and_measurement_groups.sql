CREATE TABLE daily_proof_jobs_async (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  period_date TEXT NOT NULL,
  measurement_group_id TEXT NOT NULL,
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
  threshold_satisfied INTEGER NOT NULL DEFAULT 1
    CHECK (threshold_satisfied IN (0, 1)),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  circuit_version INTEGER NOT NULL CHECK (circuit_version > 0),
  status TEXT NOT NULL CHECK (status IN (
    'pending', 'dispatched', 'ready_for_input', 'proving', 'proof_ready',
    'device_bound', 'awaiting_sponsor', 'sponsor_retryable', 'sponsoring',
    'sponsored', 'submitted', 'confirmed', 'reproof_required',
    'retryable_failed', 'dead_lettered'
  )),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_after TEXT NOT NULL,
  lease_expires_at TEXT,
  proof_artifact_key TEXT,
  device_transaction_object_key TEXT,
  device_transaction_hash TEXT,
  device_transaction_bytes INTEGER,
  sponsor_transaction_object_key TEXT,
  sponsor_serialized_sha256 TEXT,
  sponsor_transaction_id TEXT,
  sponsor_fee_specks TEXT,
  sponsor_transaction_bytes INTEGER,
  sponsor_attempt_count INTEGER NOT NULL DEFAULT 0,
  sponsor_available_after TEXT NOT NULL,
  sponsor_lease_expires_at TEXT,
  sponsorship_started_at TEXT,
  sponsorship_completed_at TEXT,
  attest_tx_id TEXT,
  attest_tx_hash TEXT,
  block_height TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(device_id, period_date),
  UNIQUE(device_id, measurement_group_id),
  UNIQUE(device_id, attestation_commitment),
  FOREIGN KEY (policy_key) REFERENCES threshold_policies(policy_key),
  FOREIGN KEY (assignment_key) REFERENCES policy_assignments(assignment_key)
);

INSERT INTO daily_proof_jobs_async (
  id, project_id, device_id, period_date, measurement_group_id,
  attestation_commitment, device_commitment, sample_count,
  threshold_policy_version, policy_key, assignment_id, assignment_key,
  hour_presence, observed_hour_count, threshold_satisfied, schema_version,
  circuit_version, status, attempt_count, available_after, lease_expires_at,
  proof_artifact_key, device_transaction_hash, device_transaction_bytes,
  sponsor_transaction_object_key, sponsor_serialized_sha256,
  sponsor_transaction_id, sponsor_fee_specks, sponsor_transaction_bytes,
  sponsor_attempt_count, sponsor_available_after, sponsorship_started_at,
  sponsorship_completed_at, attest_tx_id, attest_tx_hash, block_height,
  last_error_code, created_at, updated_at
)
SELECT
  id, project_id, device_id, period_date, attestation_commitment,
  attestation_commitment, device_commitment, sample_count,
  threshold_policy_version, policy_key, assignment_id, assignment_key,
  hour_presence, observed_hour_count, threshold_satisfied, schema_version,
  circuit_version,
  CASE
    WHEN status IN ('confirmed', 'submitted') THEN status
    ELSE 'dead_lettered'
  END,
  attempt_count, available_after, lease_expires_at, proof_artifact_key,
  device_transaction_hash, device_transaction_bytes,
  sponsor_transaction_object_key, sponsor_serialized_sha256,
  sponsor_transaction_id, sponsor_fee_specks, sponsor_transaction_bytes,
  sponsor_attempt_count, available_after, sponsorship_started_at,
  sponsorship_completed_at, attest_tx_id, attest_tx_hash, block_height,
  CASE
    WHEN status IN ('confirmed', 'submitted') THEN last_error_code
    ELSE 'contract_schema_upgraded'
  END,
  created_at, updated_at
FROM daily_proof_jobs;

DROP TABLE daily_proof_jobs;
ALTER TABLE daily_proof_jobs_async RENAME TO daily_proof_jobs;

CREATE INDEX daily_proof_jobs_dispatch
  ON daily_proof_jobs(status, available_after, created_at);

CREATE INDEX daily_proof_jobs_sponsor_dispatch
  ON daily_proof_jobs(status, sponsor_available_after, updated_at);

CREATE INDEX daily_proof_jobs_device_period
  ON daily_proof_jobs(device_id, period_date DESC);
