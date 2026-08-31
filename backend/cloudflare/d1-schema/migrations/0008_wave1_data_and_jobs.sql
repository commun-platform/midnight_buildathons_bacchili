PRAGMA foreign_keys = ON;

ALTER TABLE devices
  ADD COLUMN threshold_policy_version TEXT NOT NULL DEFAULT 'temperature-v1';

CREATE TABLE IF NOT EXISTS measurement_windows (
  batch_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  sensor_type TEXT NOT NULL,
  unit TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  sample_count INTEGER NOT NULL CHECK (sample_count > 0),
  minimum REAL NOT NULL,
  maximum REAL NOT NULL,
  average REAL NOT NULL,
  commitment TEXT NOT NULL,
  threshold_policy_version TEXT NOT NULL,
  received_at TEXT NOT NULL,
  UNIQUE(device_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS measurement_windows_project_period
  ON measurement_windows(project_id, period_start DESC);

CREATE INDEX IF NOT EXISTS measurement_windows_device_period
  ON measurement_windows(device_id, period_start DESC);

CREATE TABLE IF NOT EXISTS anomaly_events (
  event_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  sensor_type TEXT NOT NULL,
  unit TEXT NOT NULL,
  transition TEXT NOT NULL CHECK (transition IN ('anomaly_open', 'recovered')),
  occurred_at TEXT NOT NULL,
  threshold_policy_version TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS anomaly_events_project_time
  ON anomaly_events(project_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS anomaly_states (
  device_id TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('normal', 'anomaly_open')),
  last_event_id TEXT REFERENCES anomaly_events(event_id) ON DELETE SET NULL,
  changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proof_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  period_date TEXT NOT NULL,
  dataset_root TEXT NOT NULL,
  device_commitment TEXT NOT NULL,
  sample_count INTEGER NOT NULL CHECK (sample_count > 0),
  threshold_policy_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'pending', 'dispatched', 'ready_for_input', 'proving', 'proof_ready',
    'signed', 'submitted', 'confirmed', 'retryable_failed', 'dead_lettered'
  )),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_after TEXT NOT NULL,
  lease_expires_at TEXT,
  proof_artifact_key TEXT,
  register_tx_id TEXT,
  register_tx_hash TEXT,
  verify_tx_id TEXT,
  verify_tx_hash TEXT,
  block_height TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(device_id, dataset_root)
);

CREATE INDEX IF NOT EXISTS proof_jobs_dispatch
  ON proof_jobs(status, available_after, created_at);

CREATE INDEX IF NOT EXISTS proof_jobs_device_period
  ON proof_jobs(device_id, period_date DESC);

CREATE TABLE IF NOT EXISTS transaction_jobs (
  id TEXT PRIMARY KEY,
  proof_job_id TEXT NOT NULL UNIQUE REFERENCES proof_jobs(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  signed_transaction_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'pending', 'submitting', 'submitted', 'confirmed', 'retryable_failed', 'dead_lettered'
  )),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  tx_id TEXT,
  tx_hash TEXT,
  block_height TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS transaction_jobs_status
  ON transaction_jobs(status, created_at);
