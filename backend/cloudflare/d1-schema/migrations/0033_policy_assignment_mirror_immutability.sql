PRAGMA foreign_keys = ON;

-- D1 is an audit mirror of confirmed Midnight state. Once an Assignment is
-- inserted, its identity, authority binding, period start, and operational-day
-- boundary must not be rewritten. Closing the interval is the only supported
-- period mutation.
CREATE TRIGGER IF NOT EXISTS policy_assignments_reject_fixed_field_update
BEFORE UPDATE OF
  assignment_key,
  policy_id,
  project_id,
  device_id,
  valid_from,
  assignment_version,
  device_commitment,
  contract_address,
  registered_tx_id,
  registered_at,
  time_zone_offset_minutes,
  local_day_start_hour,
  utc_day_start_minute
ON policy_assignments
WHEN
  NEW.assignment_key IS NOT OLD.assignment_key
  OR NEW.policy_id IS NOT OLD.policy_id
  OR NEW.project_id IS NOT OLD.project_id
  OR NEW.device_id IS NOT OLD.device_id
  OR NEW.valid_from IS NOT OLD.valid_from
  OR NEW.assignment_version IS NOT OLD.assignment_version
  OR NEW.device_commitment IS NOT OLD.device_commitment
  OR NEW.contract_address IS NOT OLD.contract_address
  OR NEW.registered_tx_id IS NOT OLD.registered_tx_id
  OR NEW.registered_at IS NOT OLD.registered_at
  OR NEW.time_zone_offset_minutes IS NOT OLD.time_zone_offset_minutes
  OR NEW.local_day_start_hour IS NOT OLD.local_day_start_hour
  OR NEW.utc_day_start_minute IS NOT OLD.utc_day_start_minute
BEGIN
  SELECT RAISE(ABORT, 'confirmed policy assignment fields are immutable');
END;

-- Migration 0032 intentionally introduced the close guard first. Replace it
-- so idempotent mirror synchronization may write the already-confirmed value
-- again, while a genuine state transition still follows the on-chain rules.
DROP TRIGGER IF EXISTS policy_assignments_reject_invalid_close;

CREATE TRIGGER policy_assignments_reject_invalid_close
BEFORE UPDATE OF valid_until ON policy_assignments
WHEN NEW.valid_until IS NOT OLD.valid_until
BEGIN
  SELECT (CASE WHEN OLD.valid_until IS NOT NULL
    THEN RAISE(ABORT, 'policy assignment is already closed') END);
  SELECT (CASE WHEN NEW.valid_until IS NULL
    THEN RAISE(ABORT, 'policy assignment close time is required') END);
  SELECT (CASE WHEN NEW.valid_from IS NOT NULL AND NEW.valid_until <= NEW.valid_from
    THEN RAISE(ABORT, 'policy assignment close time must be after its start') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1
    FROM policy_assignments newer
    JOIN threshold_policies newer_policy ON newer_policy.policy_id = newer.policy_id
    JOIN threshold_policies current_policy ON current_policy.policy_id = OLD.policy_id
    WHERE newer.device_id = OLD.device_id
      AND newer.assignment_id != OLD.assignment_id
      AND newer_policy.sensor_type_code = current_policy.sensor_type_code
      AND newer.assignment_version > OLD.assignment_version
  ) THEN RAISE(ABORT, 'only the latest policy assignment can be closed') END);
END;

INSERT INTO operational_events (
  id, occurred_at, category, severity, actor_type, actor_identifier,
  action, outcome, resource_type, resource_id, details_json
) VALUES (
  lower(hex(randomblob(16))),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  'workflow', 'info', 'system', 'migration:0033',
  'policy_assignment.mirror_immutability.enabled', 'completed',
  'migration', '0033_policy_assignment_mirror_immutability',
  '{"fixedFieldsImmutable":true,"idempotentCloseSync":true,"latestCloseOnly":true}'
);
