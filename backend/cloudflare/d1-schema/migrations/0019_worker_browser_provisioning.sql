PRAGMA foreign_keys = ON;

CREATE TABLE browser_provisioning_challenges (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  nonce_sha256 TEXT NOT NULL UNIQUE,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX browser_provisioning_challenges_expiry
  ON browser_provisioning_challenges(expires_at, consumed_at);

CREATE TABLE browser_wallet_devices (
  wallet_key_sha256 TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('provisioning', 'registered', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX browser_wallet_devices_status
  ON browser_wallet_devices(status, updated_at);
