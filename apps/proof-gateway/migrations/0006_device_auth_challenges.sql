CREATE TABLE device_auth_challenges (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  nonce_sha256 TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE INDEX idx_device_auth_challenges_expiry
  ON device_auth_challenges (expires_at, used_at);
