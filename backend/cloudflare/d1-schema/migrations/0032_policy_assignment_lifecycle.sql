PRAGMA foreign_keys = ON;

ALTER TABLE policy_assignments ADD COLUMN closed_tx_id TEXT;
ALTER TABLE policy_assignments ADD COLUMN closed_at TEXT;

CREATE TRIGGER IF NOT EXISTS policy_assignments_reject_stream_overlap
BEFORE INSERT ON policy_assignments
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1
    FROM policy_assignments existing
    JOIN threshold_policies existing_policy ON existing_policy.policy_id = existing.policy_id
    JOIN threshold_policies incoming_policy ON incoming_policy.policy_id = NEW.policy_id
    WHERE existing.device_id = NEW.device_id
      AND existing.assignment_id != NEW.assignment_id
      AND existing_policy.sensor_type_code = incoming_policy.sensor_type_code
      AND COALESCE(existing.valid_until, '9999-12-31T23:59:59.999Z')
          > COALESCE(NEW.valid_from, '0000-01-01T00:00:00.000Z')
      AND COALESCE(NEW.valid_until, '9999-12-31T23:59:59.999Z')
          > COALESCE(existing.valid_from, '0000-01-01T00:00:00.000Z')
  ) THEN RAISE(ABORT, 'policy assignment stream overlaps an existing assignment') END);

  SELECT (CASE WHEN NEW.assignment_version <= COALESCE((
    SELECT MAX(existing.assignment_version)
    FROM policy_assignments existing
    JOIN threshold_policies existing_policy ON existing_policy.policy_id = existing.policy_id
    JOIN threshold_policies incoming_policy ON incoming_policy.policy_id = NEW.policy_id
    WHERE existing.device_id = NEW.device_id
      AND existing.assignment_id != NEW.assignment_id
      AND existing_policy.sensor_type_code = incoming_policy.sensor_type_code
  ), 0) THEN RAISE(ABORT, 'policy assignment version must increase') END);
END;

CREATE TRIGGER IF NOT EXISTS policy_assignments_reject_invalid_close
BEFORE UPDATE OF valid_until ON policy_assignments
BEGIN
  SELECT (CASE WHEN OLD.valid_until IS NOT NULL
    THEN RAISE(ABORT, 'policy assignment is already closed') END);
  SELECT (CASE WHEN NEW.valid_until IS NULL
    THEN RAISE(ABORT, 'policy assignment close time is required') END);
  SELECT (CASE WHEN NEW.valid_from IS NOT NULL AND NEW.valid_until <= NEW.valid_from
    THEN RAISE(ABORT, 'policy assignment close time must be after its start') END);
END;

INSERT INTO operational_events (
  id, occurred_at, category, severity, actor_type, actor_identifier,
  action, outcome, resource_type, resource_id, details_json
) VALUES (
  lower(hex(randomblob(16))),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  'workflow', 'info', 'system', 'migration:0032',
  'policy_assignment.lifecycle.enabled', 'completed',
  'migration', '0032_policy_assignment_lifecycle',
  '{"overlapGuard":true,"monotonicVersion":true,"closeAudit":true}'
);
