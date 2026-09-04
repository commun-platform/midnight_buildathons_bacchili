PRAGMA foreign_keys = ON;

CREATE TABLE queue_dead_letters (
  id TEXT PRIMARY KEY,
  queue_name TEXT NOT NULL CHECK (queue_name IN (
    'midnight-proof-jobs-dlq',
    'midnight-sponsor-jobs-dlq',
    'midnight-managed-source-jobs-dlq'
  )),
  message_id TEXT NOT NULL,
  payload_kind TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  delivery_attempts INTEGER NOT NULL DEFAULT 1 CHECK (delivery_attempts > 0),
  observation_count INTEGER NOT NULL DEFAULT 1 CHECK (observation_count > 0),
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE(queue_name, message_id)
);

CREATE INDEX queue_dead_letters_status_time
  ON queue_dead_letters(status, last_observed_at DESC);
CREATE INDEX queue_dead_letters_resource
  ON queue_dead_letters(resource_type, resource_id, last_observed_at DESC);

INSERT INTO operational_events (
  id, occurred_at, category, severity, actor_type, actor_identifier,
  action, outcome, resource_type, resource_id
) VALUES (
  lower(hex(randomblob(16))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  'workflow', 'info', 'system', 'migration:0031',
  'queue.dead-letter.monitoring.enabled', 'completed',
  'migration', '0031_queue_dead_letters'
);
