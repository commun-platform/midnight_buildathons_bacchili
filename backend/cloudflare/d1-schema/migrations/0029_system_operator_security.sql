PRAGMA foreign_keys = ON;

-- Cloudflare Access authenticates a person. These grants determine which
-- project that authenticated person may inspect or administer.
CREATE TABLE system_operator_grants (
  id TEXT PRIMARY KEY,
  principal_key TEXT NOT NULL,
  principal_email TEXT,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'operator')),
  scope_key TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (scope_key = '*' AND project_id IS NULL)
    OR (scope_key <> '*' AND project_id = scope_key)
  ),
  UNIQUE(principal_key, scope_key)
);

CREATE INDEX system_operator_grants_principal
  ON system_operator_grants(principal_key, active, project_id);
CREATE INDEX system_operator_grants_project
  ON system_operator_grants(project_id, active, principal_key);

-- The plaintext token is returned only to the protected browser page. D1
-- stores a digest bound to the verified Access identity.
CREATE TABLE system_operator_csrf_tokens (
  token_sha256 TEXT PRIMARY KEY CHECK (length(token_sha256) = 64),
  principal_identifier TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX system_operator_csrf_tokens_expiry
  ON system_operator_csrf_tokens(expires_at);
CREATE INDEX system_operator_csrf_tokens_principal
  ON system_operator_csrf_tokens(principal_identifier, expires_at);

-- Initial production administrator approved for this deployment. Future
-- operators are added explicitly through a reviewed D1 administration step.
INSERT INTO system_operator_grants (
  id, principal_key, principal_email, role, scope_key, project_id,
  active, created_by, created_at, updated_at
) VALUES (
  'grant-support-commun-platform-global',
  'email:support@commun-platform.com',
  'support@commun-platform.com',
  'operator',
  '*',
  NULL,
  1,
  'migration:0029',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

INSERT INTO operational_events (
  id, occurred_at, category, severity, actor_type, actor_identifier,
  action, outcome, resource_type, resource_id
) VALUES (
  lower(hex(randomblob(16))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  'workflow', 'info', 'system', 'migration:0029',
  'system.operator.security.enabled', 'completed',
  'migration', '0029_system_operator_security'
);
