PRAGMA foreign_keys = ON;

-- A confirmed public Policy is immutable inside its deployed contract. D1 may
-- retain policies from superseded contract deployments, so a changed Policy
-- must be inserted under a new policy_id instead of rewriting audit history.
CREATE TRIGGER IF NOT EXISTS threshold_policies_reject_fixed_field_update
BEFORE UPDATE OF
  policy_key,
  project_id,
  sensor_type,
  unit,
  mode,
  minimum,
  maximum,
  value_scale,
  sensor_type_code,
  unit_code,
  policy_version,
  contract_address,
  registered_tx_id,
  registered_at
ON threshold_policies
WHEN
  NEW.policy_key IS NOT OLD.policy_key
  OR NEW.project_id IS NOT OLD.project_id
  OR NEW.sensor_type IS NOT OLD.sensor_type
  OR NEW.unit IS NOT OLD.unit
  OR NEW.mode IS NOT OLD.mode
  OR NEW.minimum IS NOT OLD.minimum
  OR NEW.maximum IS NOT OLD.maximum
  OR NEW.value_scale IS NOT OLD.value_scale
  OR NEW.sensor_type_code IS NOT OLD.sensor_type_code
  OR NEW.unit_code IS NOT OLD.unit_code
  OR NEW.policy_version IS NOT OLD.policy_version
  OR NEW.contract_address IS NOT OLD.contract_address
  OR NEW.registered_tx_id IS NOT OLD.registered_tx_id
  OR NEW.registered_at IS NOT OLD.registered_at
BEGIN
  SELECT RAISE(ABORT, 'confirmed threshold policy fields are immutable');
END;

-- Assignment streams are scoped to one deployed contract. Superseded contract
-- history must not block a valid first Assignment in the replacement contract.
DROP TRIGGER IF EXISTS policy_assignments_reject_stream_overlap;

CREATE TRIGGER policy_assignments_reject_stream_overlap
BEFORE INSERT ON policy_assignments
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1
    FROM policy_assignments existing
    JOIN threshold_policies existing_policy ON existing_policy.policy_id = existing.policy_id
    JOIN threshold_policies incoming_policy ON incoming_policy.policy_id = NEW.policy_id
    WHERE existing.device_id = NEW.device_id
      AND existing.assignment_id != NEW.assignment_id
      AND existing.contract_address IS NEW.contract_address
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
      AND existing.contract_address IS NEW.contract_address
      AND existing_policy.sensor_type_code = incoming_policy.sensor_type_code
  ), 0) THEN RAISE(ABORT, 'policy assignment version must increase') END);
END;

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
      AND newer.contract_address IS OLD.contract_address
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
  'workflow', 'info', 'system', 'migration:0034',
  'policy_history.contract_scope.enabled', 'completed',
  'migration', '0034_contract_scoped_policy_history',
  '{"policyImmutable":true,"assignmentStreamScopedByContract":true}'
);
