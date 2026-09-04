PRAGMA foreign_keys = ON;

-- Managed API Sources are customer-cloud connectors. Their credentials are
-- encrypted by the Worker before this table is written. The source is mapped
-- to a regular Sensor Registry Device on Midnight, but it does not have a
-- Browser Wallet or a Device Session.
CREATE TABLE managed_sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  adapter_type TEXT NOT NULL CHECK (adapter_type = 'fixed-window-json'),
  adapter_version INTEGER NOT NULL CHECK (adapter_version = 1),
  endpoint_url TEXT NOT NULL,
  source_sensor_id TEXT NOT NULL,
  auth_type TEXT NOT NULL CHECK (auth_type = 'bearer'),
  credential_envelope TEXT NOT NULL CHECK (json_valid(credential_envelope)),
  credential_key_version INTEGER NOT NULL DEFAULT 1 CHECK (credential_key_version > 0),
  sensor_type TEXT NOT NULL CHECK (sensor_type = 'temperature'),
  unit TEXT NOT NULL CHECK (unit = '°C'),
  policy_id TEXT NOT NULL REFERENCES threshold_policies(policy_id),
  assignment_id TEXT NOT NULL UNIQUE,
  first_period_date TEXT NOT NULL,
  fetch_delay_minutes INTEGER NOT NULL DEFAULT 15
    CHECK (fetch_delay_minutes BETWEEN 0 AND 1440),
  response_max_bytes INTEGER NOT NULL DEFAULT 1048576
    CHECK (response_max_bytes BETWEEN 1024 AND 4194304),
  status TEXT NOT NULL CHECK (
    status IN ('provisioning', 'active', 'paused', 'action_required')
  ),
  stage TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_after TEXT NOT NULL,
  device_authority TEXT,
  device_tx_id TEXT,
  assignment_tx_id TEXT,
  last_error_code TEXT,
  last_error_summary TEXT CHECK (
    last_error_summary IS NULL OR length(last_error_summary) <= 1000
  ),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, source_sensor_id)
);

CREATE INDEX managed_sources_dispatch
  ON managed_sources(status, stage, available_after, created_at);
CREATE INDEX managed_sources_project
  ON managed_sources(project_id, created_at DESC);

CREATE TABLE managed_source_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES managed_sources(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  period_date TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'pending_fetch', 'fetching', 'fetch_retry', 'proof_queued', 'proving',
    'proof_retry', 'confirmed', 'action_required', 'dead_lettered'
  )),
  stage TEXT NOT NULL,
  fetch_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (fetch_attempt_count >= 0),
  proof_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (proof_attempt_count >= 0),
  available_after TEXT NOT NULL,
  lease_expires_at TEXT,
  source_http_status INTEGER,
  source_response_bytes INTEGER,
  sample_count INTEGER CHECK (sample_count IS NULL OR sample_count >= 0),
  observed_hour_count INTEGER CHECK (
    observed_hour_count IS NULL OR observed_hour_count BETWEEN 0 AND 24
  ),
  private_artifact_key TEXT,
  proof_job_id TEXT UNIQUE,
  last_error_code TEXT,
  last_error_summary TEXT CHECK (
    last_error_summary IS NULL OR length(last_error_summary) <= 1000
  ),
  fetched_at TEXT,
  proof_started_at TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_id, period_date)
);

CREATE INDEX managed_source_runs_dispatch
  ON managed_source_runs(status, available_after, created_at);
CREATE INDEX managed_source_runs_source_period
  ON managed_source_runs(source_id, period_date DESC);

-- The existing device/browser dispatcher must ignore managed jobs because the
-- managed queue supplies private input inside the System Wallet Container.
ALTER TABLE daily_proof_jobs ADD COLUMN origin TEXT NOT NULL DEFAULT 'device'
  CHECK (origin IN ('device', 'browser', 'managed-api'));
ALTER TABLE daily_proof_jobs ADD COLUMN managed_source_id TEXT
  REFERENCES managed_sources(id) ON DELETE SET NULL;
ALTER TABLE daily_proof_jobs ADD COLUMN private_input_object_key TEXT;

CREATE INDEX daily_proof_jobs_origin_dispatch
  ON daily_proof_jobs(origin, status, available_after, created_at);

CREATE TRIGGER audit_managed_source_progress
AFTER UPDATE OF status, stage ON managed_sources
WHEN OLD.status <> NEW.status OR OLD.stage <> NEW.stage
BEGIN
  INSERT INTO operational_events (
    id, occurred_at, category, severity, actor_type, actor_identifier,
    action, outcome, project_id, device_id, resource_type, resource_id,
    correlation_id, state_from, state_to, error_code
  ) VALUES (
    lower(hex(randomblob(16))), NEW.updated_at, 'workflow',
    CASE WHEN NEW.status = 'action_required' THEN 'error'
         WHEN NEW.stage = 'retry_waiting' THEN 'warning' ELSE 'info' END,
    'system', NEW.id, 'managed.source.progress', NEW.status,
    NEW.project_id, NEW.device_id, 'managed-source', NEW.id, NEW.id,
    OLD.status || ':' || OLD.stage, NEW.status || ':' || NEW.stage,
    NEW.last_error_code
  );
END;

CREATE TRIGGER audit_managed_source_run_progress
AFTER UPDATE OF status, stage ON managed_source_runs
WHEN OLD.status <> NEW.status OR OLD.stage <> NEW.stage
BEGIN
  INSERT INTO operational_events (
    id, occurred_at, category, severity, actor_type, actor_identifier,
    action, outcome, project_id, device_id, resource_type, resource_id,
    correlation_id, state_from, state_to, error_code
  ) VALUES (
    lower(hex(randomblob(16))), NEW.updated_at, 'workflow',
    CASE WHEN NEW.status IN ('action_required', 'dead_lettered') THEN 'error'
         WHEN NEW.status IN ('fetch_retry', 'proof_retry') THEN 'warning'
         ELSE 'info' END,
    'system', NEW.source_id, 'managed.attestation.progress', NEW.status,
    NEW.project_id, NEW.device_id, 'managed-source-run', NEW.id, NEW.id,
    OLD.status || ':' || OLD.stage, NEW.status || ':' || NEW.stage,
    NEW.last_error_code
  );
END;
