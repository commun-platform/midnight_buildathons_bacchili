PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = TRUE;

-- Threshold Policies are registered once on Midnight and may be selected by
-- multiple Wallet-owned Projects without redeploying the contract.
CREATE TABLE project_policies (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  policy_id TEXT NOT NULL REFERENCES threshold_policies(policy_id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, policy_id)
);

INSERT INTO project_policies (project_id, policy_id, created_at)
SELECT project_id, policy_id, registered_at
FROM threshold_policies;

CREATE TABLE browser_wallet_projects (
  wallet_key_sha256 TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (wallet_key_sha256, project_id)
);

CREATE INDEX browser_wallet_projects_wallet_created
  ON browser_wallet_projects(wallet_key_sha256, created_at, project_id);

CREATE TRIGGER browser_wallet_projects_limit
BEFORE INSERT ON browser_wallet_projects
WHEN (
  SELECT COUNT(*) FROM browser_wallet_projects
  WHERE wallet_key_sha256 = NEW.wallet_key_sha256
) >= 10
BEGIN
  SELECT RAISE(ABORT, 'wallet_project_limit');
END;

INSERT OR IGNORE INTO browser_wallet_projects (
  wallet_key_sha256, project_id, created_at
)
SELECT wallet_key_sha256, project_id, created_at
FROM browser_wallet_devices;

CREATE TABLE browser_project_challenges (
  id TEXT PRIMARY KEY,
  nonce_sha256 TEXT NOT NULL UNIQUE,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX browser_project_challenges_expiry
  ON browser_project_challenges(expires_at, consumed_at);

CREATE TABLE browser_project_sessions (
  token_sha256 TEXT PRIMARY KEY,
  wallet_key_sha256 TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);

CREATE INDEX browser_project_sessions_wallet_expiry
  ON browser_project_sessions(wallet_key_sha256, expires_at);

CREATE TABLE browser_wallet_devices_v2 (
  wallet_key_sha256 TEXT NOT NULL,
  device_id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('provisioning', 'registered', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (wallet_key_sha256, project_id),
  FOREIGN KEY (wallet_key_sha256, project_id)
    REFERENCES browser_wallet_projects(wallet_key_sha256, project_id) ON DELETE CASCADE
);

INSERT INTO browser_wallet_devices_v2 (
  wallet_key_sha256, device_id, project_id, status, created_at, updated_at
)
SELECT wallet_key_sha256, device_id, project_id, status, created_at, updated_at
FROM browser_wallet_devices;

CREATE TABLE browser_provisioning_operations_v2 (
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
  FOREIGN KEY (wallet_key_sha256, project_id)
    REFERENCES browser_wallet_devices_v2(wallet_key_sha256, project_id) ON DELETE CASCADE
);

INSERT INTO browser_provisioning_operations_v2 (
  id, progress_token_sha256, wallet_key_sha256, device_id, project_id,
  policy_id, assignment_id, enrollment_json, device_authority,
  browser_authorization_json, status, stage, device_commitment, policy_key,
  assignment_key, device_tx_id, assignment_tx_id, error_message, created_at, updated_at
)
SELECT
  id, progress_token_sha256, wallet_key_sha256, device_id, project_id,
  policy_id, assignment_id, enrollment_json, device_authority,
  browser_authorization_json, status, stage, device_commitment, policy_key,
  assignment_key, device_tx_id, assignment_tx_id, error_message, created_at, updated_at
FROM browser_provisioning_operations;

DROP TABLE browser_provisioning_operations;
DROP TABLE browser_wallet_devices;
ALTER TABLE browser_wallet_devices_v2 RENAME TO browser_wallet_devices;
ALTER TABLE browser_provisioning_operations_v2 RENAME TO browser_provisioning_operations;

CREATE INDEX browser_wallet_devices_status
  ON browser_wallet_devices(status, updated_at);
CREATE INDEX browser_provisioning_operations_device
  ON browser_provisioning_operations(device_id, created_at DESC);
CREATE INDEX browser_provisioning_operations_status
  ON browser_provisioning_operations(status, updated_at);

CREATE TABLE browser_provisioning_challenges_v2 (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_id TEXT NOT NULL,
  nonce_sha256 TEXT NOT NULL UNIQUE,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

INSERT INTO browser_provisioning_challenges_v2 (
  id, device_id, project_id, key_id, nonce_sha256, issued_at, expires_at, consumed_at
)
SELECT
  id, device_id, 'measurement-authenticity-01', key_id,
  nonce_sha256, issued_at, expires_at, consumed_at
FROM browser_provisioning_challenges;

DROP TABLE browser_provisioning_challenges;
ALTER TABLE browser_provisioning_challenges_v2 RENAME TO browser_provisioning_challenges;

CREATE INDEX browser_provisioning_challenges_expiry
  ON browser_provisioning_challenges(expires_at, consumed_at);
