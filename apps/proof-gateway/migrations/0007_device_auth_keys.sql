PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS device_auth_keys (
  key_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  algorithm TEXT NOT NULL CHECK (algorithm = 'ES256'),
  public_key_jwk TEXT NOT NULL,
  allowed_scopes_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'revoked')),
  registered_at TEXT NOT NULL,
  rotated_at TEXT,
  last_authenticated_at TEXT
);

CREATE INDEX IF NOT EXISTS device_auth_keys_project_status
  ON device_auth_keys(project_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS device_auth_keys_one_active_per_device
  ON device_auth_keys(device_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS device_auth_sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_id TEXT NOT NULL REFERENCES device_auth_keys(key_id) ON DELETE CASCADE,
  token_sha256 TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS device_auth_sessions_device_expiry
  ON device_auth_sessions(device_id, expires_at);

CREATE INDEX IF NOT EXISTS device_auth_sessions_expiry
  ON device_auth_sessions(expires_at, revoked_at);
