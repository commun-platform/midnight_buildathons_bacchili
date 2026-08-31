PRAGMA foreign_keys = ON;

-- New Threshold Policies have one owning Project and are associated only with
-- that Project. Preserve explicit legacy Project associations so already
-- registered Device assignments remain readable. Public Policy values are
-- immutable after Midnight registration; a changed threshold is a new row.
ALTER TABLE threshold_policies ADD COLUMN name TEXT;
UPDATE threshold_policies SET name = policy_id WHERE name IS NULL;
ALTER TABLE daily_proof_jobs ADD COLUMN proof_generated_at TEXT;

-- A registered Device always has a current operational state. Existing
-- Devices predate this invariant, so initialize only the missing rows as
-- normal without manufacturing an anomaly event.
INSERT OR IGNORE INTO anomaly_states (
  device_id,
  project_id,
  state,
  last_event_id,
  changed_at
)
SELECT
  id,
  project_id,
  'normal',
  NULL,
  COALESCE(last_seen_at, created_at)
FROM devices
WHERE midnight_registry_status = 'registered';

CREATE TABLE browser_policy_challenges (
  id TEXT PRIMARY KEY,
  wallet_key_sha256 TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  policy_id TEXT NOT NULL UNIQUE,
  nonce_sha256 TEXT NOT NULL UNIQUE,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  FOREIGN KEY (wallet_key_sha256, project_id)
    REFERENCES browser_wallet_projects(wallet_key_sha256, project_id) ON DELETE CASCADE
);

CREATE INDEX browser_policy_challenges_expiry
  ON browser_policy_challenges(expires_at, consumed_at);

CREATE TABLE browser_policy_operations (
  id TEXT PRIMARY KEY,
  wallet_key_sha256 TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  policy_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('closed-range', 'upper-bound', 'lower-bound')),
  minimum_centi_celsius INTEGER,
  maximum_centi_celsius INTEGER,
  browser_authorization_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'retrying', 'registered', 'failed')),
  stage TEXT NOT NULL,
  policy_key TEXT,
  policy_tx_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (wallet_key_sha256, project_id)
    REFERENCES browser_wallet_projects(wallet_key_sha256, project_id) ON DELETE CASCADE,
  CHECK (
    (mode = 'closed-range'
      AND minimum_centi_celsius IS NOT NULL
      AND maximum_centi_celsius IS NOT NULL
      AND minimum_centi_celsius <= maximum_centi_celsius)
    OR (mode = 'upper-bound'
      AND minimum_centi_celsius IS NULL
      AND maximum_centi_celsius IS NOT NULL)
    OR (mode = 'lower-bound'
      AND minimum_centi_celsius IS NOT NULL
      AND maximum_centi_celsius IS NULL)
  )
);

CREATE INDEX browser_policy_operations_project_created
  ON browser_policy_operations(project_id, created_at DESC);
CREATE INDEX browser_policy_operations_status
  ON browser_policy_operations(status, updated_at);

CREATE TRIGGER browser_policy_operations_limit
BEFORE INSERT ON browser_policy_operations
WHEN (
  (SELECT COUNT(*) FROM project_policies WHERE project_id = NEW.project_id)
  +
  (SELECT COUNT(*) FROM browser_policy_operations
   WHERE project_id = NEW.project_id
     AND status IN ('queued', 'running', 'retrying'))
) >= 10
BEGIN
  SELECT RAISE(ABORT, 'project_policy_limit');
END;
