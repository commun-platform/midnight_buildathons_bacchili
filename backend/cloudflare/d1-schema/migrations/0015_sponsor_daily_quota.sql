ALTER TABLE devices
  ADD COLUMN sponsor_daily_limit INTEGER NOT NULL DEFAULT 5
    CHECK (sponsor_daily_limit BETWEEN 1 AND 100);

CREATE TABLE sponsor_quota_reservations (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  quota_date TEXT NOT NULL CHECK (
    length(quota_date) = 10
    AND quota_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  proof_job_id TEXT NOT NULL UNIQUE REFERENCES daily_proof_jobs(id) ON DELETE CASCADE,
  reserved_at TEXT NOT NULL,
  PRIMARY KEY (device_id, quota_date, proof_job_id)
);

CREATE INDEX sponsor_quota_reservations_device_date
  ON sponsor_quota_reservations(device_id, quota_date, reserved_at);
