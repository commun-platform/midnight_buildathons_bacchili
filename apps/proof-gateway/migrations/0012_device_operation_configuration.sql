PRAGMA foreign_keys = ON;

-- A monotonically increasing revision for the public operational configuration
-- that an authenticated Device pulls from the Worker after enrollment.
ALTER TABLE devices
  ADD COLUMN operation_configuration_version INTEGER NOT NULL DEFAULT 1
  CHECK (operation_configuration_version > 0);

ALTER TABLE devices
  ADD COLUMN operation_configuration_updated_at TEXT;

UPDATE devices
SET operation_configuration_updated_at = COALESCE(midnight_registered_at, CURRENT_TIMESTAMP);

-- Existing active Device keys predate the dedicated read-only configuration
-- scope. Preserve their current scopes and append only this public-data scope.
UPDATE device_auth_keys
SET allowed_scopes_json = json_insert(
  allowed_scopes_json,
  '$[#]',
  'configuration:read'
)
WHERE status = 'active'
  AND json_valid(allowed_scopes_json)
  AND NOT EXISTS (
    SELECT 1 FROM json_each(device_auth_keys.allowed_scopes_json)
    WHERE json_each.value = 'configuration:read'
  );
