PRAGMA foreign_keys = ON;

-- D1 is a mirror of confirmed Midnight administration, never the source of
-- authority. A device remains unusable until the operator completes the
-- on-chain registerDevice transaction and updates these public mirror fields.
ALTER TABLE devices ADD COLUMN midnight_device_commitment TEXT;
ALTER TABLE devices ADD COLUMN midnight_device_authority TEXT;
ALTER TABLE devices ADD COLUMN midnight_registry_status TEXT NOT NULL DEFAULT 'unregistered'
  CHECK (midnight_registry_status IN ('unregistered', 'registered', 'disabled'));
ALTER TABLE devices ADD COLUMN midnight_registration_version INTEGER;
ALTER TABLE devices ADD COLUMN midnight_contract_address TEXT;
ALTER TABLE devices ADD COLUMN midnight_registered_tx_id TEXT;
ALTER TABLE devices ADD COLUMN midnight_authority_tx_id TEXT;
ALTER TABLE devices ADD COLUMN midnight_disabled_tx_id TEXT;
ALTER TABLE devices ADD COLUMN midnight_registered_at TEXT;

ALTER TABLE policy_assignments ADD COLUMN device_commitment TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS devices_midnight_commitment
  ON devices(midnight_device_commitment)
  WHERE midnight_device_commitment IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS devices_midnight_authority
  ON devices(midnight_device_authority)
  WHERE midnight_device_authority IS NOT NULL;

CREATE INDEX IF NOT EXISTS devices_midnight_registry_status
  ON devices(project_id, midnight_registry_status);

CREATE INDEX IF NOT EXISTS policy_assignments_device_commitment
  ON policy_assignments(device_commitment, valid_from, valid_until);

-- Operator proving is also needed for post-deployment fleet administration.
-- Rebuild the table because SQLite cannot alter an existing CHECK constraint.
CREATE TABLE operator_proof_leases_v2 (
  id TEXT PRIMARY KEY,
  token_sha256 TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('contract_deploy', 'contract_admin')),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

INSERT INTO operator_proof_leases_v2 (
  id, token_sha256, purpose, status, issued_at, expires_at, revoked_at
)
SELECT id, token_sha256, purpose, status, issued_at, expires_at, revoked_at
FROM operator_proof_leases;

DROP TABLE operator_proof_leases;
ALTER TABLE operator_proof_leases_v2 RENAME TO operator_proof_leases;

CREATE INDEX IF NOT EXISTS operator_proof_leases_status_expiry
  ON operator_proof_leases(status, expires_at);
