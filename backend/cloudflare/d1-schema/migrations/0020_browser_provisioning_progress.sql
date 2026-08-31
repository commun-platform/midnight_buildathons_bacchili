PRAGMA foreign_keys = ON;

CREATE TABLE browser_provisioning_operations (
  id TEXT PRIMARY KEY,
  progress_token_sha256 TEXT NOT NULL UNIQUE,
  wallet_key_sha256 TEXT NOT NULL,
  device_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  policy_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  enrollment_json TEXT NOT NULL,
  device_authority TEXT NOT NULL,
  browser_authorization_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'retrying', 'registered', 'failed')),
  stage TEXT NOT NULL,
  device_commitment TEXT,
  policy_key TEXT,
  assignment_key TEXT,
  device_tx_id TEXT,
  assignment_tx_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (wallet_key_sha256) REFERENCES browser_wallet_devices(wallet_key_sha256) ON DELETE CASCADE
);

CREATE INDEX browser_provisioning_operations_device
  ON browser_provisioning_operations(device_id, created_at DESC);

CREATE INDEX browser_provisioning_operations_status
  ON browser_provisioning_operations(status, updated_at);
