ALTER TABLE daily_proof_jobs ADD COLUMN sponsor_stage TEXT;
ALTER TABLE daily_proof_jobs ADD COLUMN sponsor_reason_code TEXT;
ALTER TABLE daily_proof_jobs ADD COLUMN sponsor_stage_updated_at TEXT;

UPDATE daily_proof_jobs
SET sponsor_stage = CASE status
      WHEN 'awaiting_sponsor' THEN 'queued'
      WHEN 'sponsor_retryable' THEN 'retry_wait'
      WHEN 'sponsoring' THEN 'interrupted'
      WHEN 'sponsored' THEN 'transaction_ready'
      WHEN 'submitted' THEN 'confirmation_waiting'
      WHEN 'confirmed' THEN 'completed'
      ELSE NULL
    END,
    sponsor_reason_code = CASE status
      WHEN 'awaiting_sponsor' THEN 'sponsor_queue_waiting'
      WHEN 'sponsor_retryable' THEN COALESCE(last_error_code, 'sponsor_retry_waiting')
      WHEN 'sponsoring' THEN 'sponsor_processing_state_unknown_after_migration'
      WHEN 'sponsored' THEN 'sponsor_transaction_ready_for_submission'
      WHEN 'submitted' THEN 'sponsor_transaction_submitted_waiting_for_confirmation'
      WHEN 'confirmed' THEN 'sponsor_transaction_confirmed'
      ELSE NULL
    END,
    sponsor_stage_updated_at = CASE
      WHEN status IN (
        'awaiting_sponsor', 'sponsor_retryable', 'sponsoring',
        'sponsored', 'submitted', 'confirmed'
      ) THEN updated_at
      ELSE NULL
    END;

CREATE INDEX IF NOT EXISTS idx_daily_proof_jobs_sponsor_progress
  ON daily_proof_jobs(status, sponsor_stage_updated_at, sponsor_available_after);
