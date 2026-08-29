UPDATE daily_proof_jobs
SET last_error_code = 'contract_schema_upgrade_release_required',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'dead_lettered'
  AND last_error_code = 'contract_schema_upgraded'
  AND sponsor_transaction_object_key IS NOT NULL
  AND sponsor_serialized_sha256 IS NOT NULL
  AND sponsor_transaction_id IS NULL;
