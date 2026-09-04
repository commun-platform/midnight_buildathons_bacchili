-- Serialize all state-changing Server Wallet work across scheduled Worker runs.
-- The lease is held only while one eligible operation is being executed. Wallet
-- synchronization happens before lease acquisition so a long initial replay
-- cannot block the next scheduler observation.
CREATE TABLE server_wallet_processing_lease (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  lease_token TEXT,
  lease_expires_at TEXT,
  work_kind TEXT,
  work_id TEXT,
  updated_at TEXT NOT NULL
);

INSERT INTO server_wallet_processing_lease (
  singleton_id, lease_token, lease_expires_at, work_kind, work_id, updated_at
) VALUES (1, NULL, NULL, NULL, NULL, '1970-01-01T00:00:00.000Z');
