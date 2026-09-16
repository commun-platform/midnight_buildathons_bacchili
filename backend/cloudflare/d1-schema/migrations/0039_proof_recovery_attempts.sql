CREATE TABLE IF NOT EXISTS proof_recovery_attempts (
  recovery_id TEXT PRIMARY KEY,
  proof_job_id TEXT NOT NULL REFERENCES daily_proof_jobs(id),
  recovery_number INTEGER NOT NULL,
  requested_at TEXT NOT NULL,
  previous_updated_at TEXT NOT NULL,
  previous_error_code TEXT NOT NULL,
  previous_attempt_count INTEGER NOT NULL,
  UNIQUE (proof_job_id, recovery_number)
);
