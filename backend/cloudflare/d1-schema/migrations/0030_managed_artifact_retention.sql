PRAGMA foreign_keys = ON;

ALTER TABLE managed_source_runs ADD COLUMN private_artifact_expires_at TEXT;

CREATE INDEX managed_source_runs_private_artifact_expiry
  ON managed_source_runs(private_artifact_expires_at, id)
  WHERE private_artifact_key IS NOT NULL;

INSERT INTO operational_events (
  id, occurred_at, category, severity, actor_type, actor_identifier,
  action, outcome, resource_type, resource_id
) VALUES (
  lower(hex(randomblob(16))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  'workflow', 'info', 'system', 'migration:0030',
  'managed.artifact.encryption.enabled', 'completed',
  'migration', '0030_managed_artifact_retention'
);
