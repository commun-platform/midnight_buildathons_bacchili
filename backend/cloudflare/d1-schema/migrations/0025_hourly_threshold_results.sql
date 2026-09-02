ALTER TABLE daily_proof_jobs ADD COLUMN hour_results TEXT
  CHECK (
    hour_results IS NULL
    OR (
      length(hour_results) = 24
      AND hour_results NOT GLOB '*[^012]*'
    )
  );

CREATE INDEX IF NOT EXISTS idx_daily_proof_jobs_hourly_results
  ON daily_proof_jobs(schema_version, circuit_version, status);
