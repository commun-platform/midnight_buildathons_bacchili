-- Serialize Wallet startup and synchronization checks across scheduled Worker
-- invocations. A restore can take longer than the one-minute Cron interval, so
-- without this lease multiple invocations can stream the same checkpoint into
-- the Container concurrently.
CREATE TABLE server_wallet_warmup_lease (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  lease_token TEXT,
  lease_expires_at TEXT,
  work_kind TEXT,
  work_id TEXT,
  updated_at TEXT NOT NULL
);

INSERT INTO server_wallet_warmup_lease (
  singleton_id, lease_token, lease_expires_at, work_kind, work_id, updated_at
) VALUES (1, NULL, NULL, NULL, NULL, '1970-01-01T00:00:00.000Z');
