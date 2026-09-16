import type { SqlDatabase } from './storage/index.js';

// A recovery never changes the retained request's identity or public inputs.
// Invoke only after authentication and equality checks on the repeated request.
export async function recoverReleasedProofJob(
  database: SqlDatabase,
  jobId: string,
  now = new Date(),
): Promise<boolean> {
  const recoveryId = crypto.randomUUID();
  const nowIso = now.toISOString();
  const previousRecoveryCutoff = new Date(now.valueOf() - 5 * 60_000).toISOString();
  await database.batch([
    {
      sql: `INSERT INTO proof_recovery_attempts (
          recovery_id, proof_job_id, recovery_number, requested_at,
          previous_updated_at, previous_error_code, previous_attempt_count
        )
        SELECT ?1, id,
          (SELECT COUNT(*) + 1 FROM proof_recovery_attempts WHERE proof_job_id = ?2),
          ?3, updated_at, last_error_code, attempt_count
        FROM daily_proof_jobs
        WHERE id = ?2 AND origin = 'device' AND status = 'reproof_required'
          AND last_error_code = 'contract_state_changed_reproof_required'
          AND device_transaction_object_key IS NULL AND device_transaction_hash IS NULL
          AND sponsor_transaction_object_key IS NULL AND sponsor_serialized_sha256 IS NULL
          AND sponsor_transaction_id IS NULL AND sponsorship_completed_at IS NULL
          AND attest_tx_id IS NULL AND attest_tx_hash IS NULL AND block_height IS NULL
          AND (lease_expires_at IS NULL OR lease_expires_at <= ?3)
          AND (sponsor_lease_expires_at IS NULL OR sponsor_lease_expires_at <= ?3)
          AND (SELECT COUNT(*) FROM proof_recovery_attempts WHERE proof_job_id = ?2) < 3
          AND NOT EXISTS (SELECT 1 FROM proof_recovery_attempts
            WHERE proof_job_id = ?2 AND requested_at > ?4)`,
      parameters: [recoveryId, jobId, nowIso, previousRecoveryCutoff],
    },
    {
      sql: `UPDATE daily_proof_jobs
        SET status = 'pending', available_after = ?1, lease_expires_at = NULL,
          proof_artifact_key = NULL, proof_generated_at = NULL,
          sponsor_available_after = ?1, sponsor_lease_expires_at = NULL,
          sponsor_stage = 'reproof_queued', sponsor_reason_code = 'contract_state_changed_reproof_required',
          sponsor_stage_updated_at = ?1, updated_at = ?1
        WHERE id = ?2 AND status = 'reproof_required'
          AND EXISTS (SELECT 1 FROM proof_recovery_attempts WHERE recovery_id = ?3)`,
      parameters: [nowIso, jobId, recoveryId],
    },
  ]);
  return await database.first(
    'SELECT recovery_id FROM proof_recovery_attempts WHERE recovery_id = ?1',
    [recoveryId],
  ) !== null;
}
