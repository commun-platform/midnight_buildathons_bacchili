PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS operator_proof_leases (
  id TEXT PRIMARY KEY,
  token_sha256 TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose = 'contract_deploy'),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS operator_proof_leases_status_expiry
  ON operator_proof_leases(status, expires_at);
