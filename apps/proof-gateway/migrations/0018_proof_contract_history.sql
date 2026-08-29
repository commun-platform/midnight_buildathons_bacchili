ALTER TABLE daily_proof_jobs ADD COLUMN contract_address TEXT;

UPDATE daily_proof_jobs
SET contract_address = (
  SELECT d.midnight_contract_address
  FROM devices d
  WHERE d.id = daily_proof_jobs.device_id
    AND d.project_id = daily_proof_jobs.project_id
)
WHERE contract_address IS NULL;
