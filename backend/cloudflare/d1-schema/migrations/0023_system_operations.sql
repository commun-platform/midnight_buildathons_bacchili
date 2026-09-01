PRAGMA foreign_keys = ON;

CREATE TABLE operational_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('api', 'workflow', 'health')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  actor_type TEXT NOT NULL CHECK (
    actor_type IN ('wallet', 'device', 'anonymous', 'system', 'operator')
  ),
  actor_identifier TEXT,
  action TEXT NOT NULL,
  method TEXT,
  route TEXT,
  response_status INTEGER,
  outcome TEXT NOT NULL,
  request_id TEXT,
  client_operation_id TEXT,
  project_id TEXT,
  device_id TEXT,
  resource_type TEXT,
  resource_id TEXT,
  correlation_id TEXT,
  state_from TEXT,
  state_to TEXT,
  error_code TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  details_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(details_json) AND length(details_json) <= 8192)
);

CREATE INDEX operational_events_time
  ON operational_events(occurred_at DESC, id DESC);
CREATE INDEX operational_events_actor_time
  ON operational_events(actor_type, actor_identifier, occurred_at DESC);
CREATE INDEX operational_events_request
  ON operational_events(request_id);
CREATE INDEX operational_events_client_operation
  ON operational_events(client_operation_id, occurred_at);
CREATE INDEX operational_events_project_time
  ON operational_events(project_id, occurred_at DESC);
CREATE INDEX operational_events_device_time
  ON operational_events(device_id, occurred_at DESC);
CREATE INDEX operational_events_outcome_time
  ON operational_events(outcome, occurred_at DESC);

CREATE TABLE system_component_state (
  component TEXT PRIMARY KEY,
  health_class TEXT NOT NULL CHECK (health_class IN ('healthy', 'degraded', 'unavailable')),
  state_signature TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  last_changed_at TEXT NOT NULL,
  last_snapshot_at TEXT NOT NULL,
  summary_json TEXT NOT NULL CHECK (json_valid(summary_json) AND length(summary_json) <= 16384)
);

CREATE TABLE system_health_snapshots (
  id TEXT PRIMARY KEY,
  component TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  health_class TEXT NOT NULL CHECK (health_class IN ('healthy', 'degraded', 'unavailable')),
  phase TEXT NOT NULL,
  changed INTEGER NOT NULL CHECK (changed IN (0, 1)),
  summary_json TEXT NOT NULL CHECK (json_valid(summary_json) AND length(summary_json) <= 16384)
);

CREATE INDEX system_health_snapshots_component_time
  ON system_health_snapshots(component, observed_at DESC, id DESC);

CREATE TABLE operations_alert_state (
  alert_key TEXT PRIMARY KEY,
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'error')),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  summary TEXT NOT NULL CHECK (length(summary) <= 500),
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  last_notified_at TEXT,
  resolved_at TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0)
);

CREATE INDEX operations_alert_state_status
  ON operations_alert_state(status, last_observed_at DESC);

CREATE TABLE operations_notification_outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('alert-opened', 'alert-reminder', 'alert-resolved', 'sponsor-receipt')),
  dedupe_key TEXT NOT NULL UNIQUE,
  alert_key TEXT,
  resource_type TEXT,
  resource_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'retrying', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_after TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT,
  last_error_code TEXT
);

CREATE INDEX operations_notification_outbox_dispatch
  ON operations_notification_outbox(status, available_after, created_at);
CREATE INDEX operations_notification_outbox_resource
  ON operations_notification_outbox(resource_type, resource_id, created_at DESC);

CREATE TRIGGER audit_browser_provisioning_progress
AFTER UPDATE OF status, stage ON browser_provisioning_operations
WHEN OLD.status <> NEW.status OR OLD.stage <> NEW.stage
BEGIN
  INSERT INTO operational_events (
    id, occurred_at, category, severity, actor_type, actor_identifier,
    action, outcome, project_id, device_id, resource_type, resource_id,
    correlation_id, state_from, state_to, error_code
  ) VALUES (
    lower(hex(randomblob(16))), NEW.updated_at, 'workflow',
    CASE WHEN NEW.status = 'failed' THEN 'error'
         WHEN NEW.status = 'retrying' THEN 'warning' ELSE 'info' END,
    'wallet', NEW.wallet_key_sha256,
    'device.registration.progress', NEW.status, NEW.project_id, NEW.device_id,
    'device-registration', NEW.id, NEW.id,
    OLD.status || ':' || OLD.stage, NEW.status || ':' || NEW.stage,
    CASE WHEN NEW.status = 'failed' THEN 'device_registration_failed' ELSE NULL END
  );
END;

CREATE TRIGGER audit_browser_policy_progress
AFTER UPDATE OF status, stage ON browser_policy_operations
WHEN OLD.status <> NEW.status OR OLD.stage <> NEW.stage
BEGIN
  INSERT INTO operational_events (
    id, occurred_at, category, severity, actor_type, actor_identifier,
    action, outcome, project_id, resource_type, resource_id, correlation_id,
    state_from, state_to, error_code
  ) VALUES (
    lower(hex(randomblob(16))), NEW.updated_at, 'workflow',
    CASE WHEN NEW.status = 'failed' THEN 'error'
         WHEN NEW.status = 'retrying' THEN 'warning' ELSE 'info' END,
    'wallet', NEW.wallet_key_sha256,
    'policy.registration.progress', NEW.status, NEW.project_id,
    'policy-registration', NEW.id, NEW.id,
    OLD.status || ':' || OLD.stage, NEW.status || ':' || NEW.stage,
    CASE WHEN NEW.status = 'failed' THEN 'policy_registration_failed' ELSE NULL END
  );
END;

CREATE TRIGGER audit_daily_proof_job_created
AFTER INSERT ON daily_proof_jobs
BEGIN
  INSERT INTO operational_events (
    id, occurred_at, category, severity, actor_type, actor_identifier,
    action, outcome, project_id, device_id, resource_type, resource_id,
    correlation_id, state_to
  ) VALUES (
    lower(hex(randomblob(16))), NEW.created_at, 'workflow', 'info',
    CASE WHEN EXISTS (
      SELECT 1 FROM browser_wallet_devices w
      WHERE w.device_id = NEW.device_id AND w.project_id = NEW.project_id
    ) THEN 'wallet' ELSE 'device' END,
    COALESCE((
      SELECT w.wallet_key_sha256 FROM browser_wallet_devices w
      WHERE w.device_id = NEW.device_id AND w.project_id = NEW.project_id
      LIMIT 1
    ), NEW.device_id),
    'proof.processing.progress', NEW.status, NEW.project_id, NEW.device_id,
    'proof-job', NEW.id, NEW.id, NEW.status
  );
END;

CREATE TRIGGER audit_daily_proof_job_progress
AFTER UPDATE OF status ON daily_proof_jobs
WHEN OLD.status <> NEW.status
BEGIN
  INSERT INTO operational_events (
    id, occurred_at, category, severity, actor_type, actor_identifier,
    action, outcome, project_id, device_id, resource_type, resource_id,
    correlation_id, state_from, state_to, error_code
  ) VALUES (
    lower(hex(randomblob(16))), NEW.updated_at, 'workflow',
    CASE WHEN NEW.status IN ('dead_lettered', 'reproof_required') THEN 'error'
         WHEN NEW.status IN ('retryable_failed', 'sponsor_retryable') THEN 'warning'
         ELSE 'info' END,
    CASE WHEN EXISTS (
      SELECT 1 FROM browser_wallet_devices w
      WHERE w.device_id = NEW.device_id AND w.project_id = NEW.project_id
    ) THEN 'wallet' ELSE 'device' END,
    COALESCE((
      SELECT w.wallet_key_sha256 FROM browser_wallet_devices w
      WHERE w.device_id = NEW.device_id AND w.project_id = NEW.project_id
      LIMIT 1
    ), NEW.device_id),
    'proof.processing.progress', NEW.status, NEW.project_id, NEW.device_id,
    'proof-job', NEW.id, NEW.id, OLD.status, NEW.status, NEW.last_error_code
  );
END;

CREATE TRIGGER enqueue_sponsor_receipt
AFTER UPDATE OF status ON daily_proof_jobs
WHEN NEW.status IN ('submitted', 'confirmed')
  AND OLD.status NOT IN ('submitted', 'confirmed')
BEGIN
  INSERT OR IGNORE INTO operations_notification_outbox (
    id, kind, dedupe_key, resource_type, resource_id, status,
    available_after, created_at, updated_at
  ) VALUES (
    lower(hex(randomblob(16))), 'sponsor-receipt',
    'sponsor-receipt:' || NEW.id, 'proof-job', NEW.id, 'pending',
    NEW.updated_at, NEW.updated_at, NEW.updated_at
  );
END;

INSERT INTO operational_events (
  id, occurred_at, category, severity, actor_type, action, outcome,
  resource_type, resource_id
) VALUES (
  lower(hex(randomblob(16))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  'workflow', 'info', 'system', 'system.operations.enabled', 'completed',
  'migration', '0023_system_operations'
);
