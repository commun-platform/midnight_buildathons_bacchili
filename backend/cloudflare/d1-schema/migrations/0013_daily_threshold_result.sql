ALTER TABLE daily_proof_jobs
  ADD COLUMN threshold_satisfied INTEGER NOT NULL DEFAULT 1
    CHECK (threshold_satisfied IN (0, 1));
