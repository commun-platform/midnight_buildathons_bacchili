import {
  processScheduledBrowserDevice,
  processScheduledBrowserPolicy,
} from './provisioning.js';
import {
  processScheduledManagedAttestation,
  processScheduledManagedSourceProvisioning,
} from './managed-sources.js';
import {
  sponsorJobCanProceed,
  sponsorWalletCanSubmit,
  type SponsorWalletReadiness,
} from './sponsor-policy.js';
import { processScheduledSponsorJob } from './sponsor.js';
import { createSqlDatabase, type SqlDatabase } from './storage/index.js';

const processingLeaseMilliseconds = 6 * 60_000;
const warmupLeaseMilliseconds = 15 * 60_000;

export type ServerWalletWorkKind =
  | 'browser-policy'
  | 'browser-device'
  | 'managed-source'
  | 'managed-attestation'
  | 'sponsor-transaction';

export interface ServerWalletWorkItem {
  kind: ServerWalletWorkKind;
  id: string;
  createdAt: string;
  sponsorStatus: string | null;
}

export type ServerWalletProcessingResult =
  | { status: 'idle' }
  | { status: 'busy'; work: ServerWalletWorkItem }
  | { status: 'processed'; work: ServerWalletWorkItem };

export async function nextServerWalletWork(
  database: SqlDatabase,
  now: string,
  acceptedThrough: string | null,
  contractAddress: string,
): Promise<ServerWalletWorkItem | null> {
  const row = await database.first<{
    kind: ServerWalletWorkKind;
    id: string;
    created_at: string;
    sponsor_status: string | null;
  }>(
    `WITH runnable AS (
       SELECT 'browser-policy' AS kind, operation.id, operation.created_at,
              NULL AS sponsor_status, 1 AS precedence
       FROM browser_policy_operations operation
       WHERE operation.status IN ('queued', 'retrying')
         AND (?2 IS NULL OR operation.created_at <= ?2)
       UNION ALL
       SELECT 'browser-device', operation.id, operation.created_at, NULL, 2
       FROM browser_provisioning_operations operation
       WHERE operation.status IN ('queued', 'retrying')
         AND (?2 IS NULL OR operation.created_at <= ?2)
         AND EXISTS (
           SELECT 1
           FROM project_policies project_policy
           JOIN threshold_policies policy
             ON policy.policy_id = project_policy.policy_id
           WHERE project_policy.project_id = operation.project_id
             AND project_policy.policy_id = operation.policy_id
             AND policy.status = 'registered'
             AND policy.contract_address = ?3
         )
       UNION ALL
       SELECT 'managed-source', source.id, source.created_at, NULL, 3
       FROM managed_sources source
       JOIN project_policies project_policy
         ON project_policy.project_id = source.project_id
        AND project_policy.policy_id = source.policy_id
       JOIN threshold_policies policy
         ON policy.policy_id = project_policy.policy_id
        AND policy.status = 'registered'
        AND policy.contract_address = ?3
       WHERE source.status = 'provisioning'
         AND source.stage IN ('queued', 'retry_waiting')
         AND source.available_after <= ?1
         AND (?2 IS NULL OR source.created_at <= ?2)
       UNION ALL
       SELECT 'managed-attestation', run.id, run.created_at, NULL, 4
       FROM managed_source_runs run
       JOIN managed_sources source ON source.id = run.source_id AND source.status = 'active'
       WHERE run.status IN ('proof_queued', 'proof_retry')
         AND run.available_after <= ?1
         AND (?2 IS NULL OR run.created_at <= ?2)
       UNION ALL
       SELECT 'sponsor-transaction', job.id, job.created_at, job.status, 5
       FROM daily_proof_jobs job
       WHERE (
           job.status IN ('awaiting_sponsor', 'sponsor_retryable', 'sponsored')
           OR (
             job.status = 'device_bound'
             AND job.device_transaction_object_key IS NOT NULL
             AND job.device_transaction_hash IS NOT NULL
           )
         )
         AND job.sponsor_available_after <= ?1
         AND (?2 IS NULL OR job.created_at <= ?2)
     )
     SELECT kind, id, created_at, sponsor_status
     FROM runnable
     ORDER BY created_at ASC, precedence ASC, id ASC
     LIMIT 1`,
    [now, acceptedThrough, contractAddress],
  );
  return row ? {
    kind: row.kind,
    id: row.id,
    createdAt: row.created_at,
    sponsorStatus: row.sponsor_status,
  } : null;
}

export function serverWalletWorkCanProceed(
  work: ServerWalletWorkItem,
  health: SponsorWalletReadiness,
): boolean {
  if (work.kind !== 'sponsor-transaction') return sponsorWalletCanSubmit(health);
  if (work.sponsorStatus === null) return false;
  return sponsorJobCanProceed(work.sponsorStatus, health);
}

export async function pendingServerWalletWork(
  env: Env,
  scheduledTime: number,
  acceptedThrough: string | null,
): Promise<ServerWalletWorkItem | null> {
  const contractAddress = env.PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS?.trim().toLowerCase() ?? '';
  if (!/^(?:[0-9a-f]{2}){32}$/u.test(contractAddress)) return null;
  return nextServerWalletWork(
    createSqlDatabase(env),
    new Date(scheduledTime).toISOString(),
    acceptedThrough,
    contractAddress,
  );
}

export async function acquireServerWalletWarmupLease(
  database: SqlDatabase,
  work: ServerWalletWorkItem,
  now: Date,
): Promise<string | null> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(now.valueOf() + warmupLeaseMilliseconds).toISOString();
  const changed = await database.execute(
    `UPDATE server_wallet_warmup_lease
     SET lease_token = ?1, lease_expires_at = ?2, work_kind = ?3, work_id = ?4, updated_at = ?5
     WHERE singleton_id = 1
       AND (lease_token IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= ?5)`,
    [token, expiresAt, work.kind, work.id, now.toISOString()],
  );
  return changed > 0 ? token : null;
}

export async function releaseServerWalletWarmupLease(
  database: SqlDatabase,
  token: string,
): Promise<void> {
  await database.execute(
    `UPDATE server_wallet_warmup_lease
     SET lease_token = NULL, lease_expires_at = NULL, work_kind = NULL, work_id = NULL,
         updated_at = ?1
     WHERE singleton_id = 1 AND lease_token = ?2`,
    [new Date().toISOString(), token],
  );
}

async function acquireProcessingLease(
  database: SqlDatabase,
  work: ServerWalletWorkItem,
  now: Date,
): Promise<string | null> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(now.valueOf() + processingLeaseMilliseconds).toISOString();
  const changed = await database.execute(
    `UPDATE server_wallet_processing_lease
     SET lease_token = ?1, lease_expires_at = ?2, work_kind = ?3, work_id = ?4, updated_at = ?5
     WHERE singleton_id = 1
       AND (lease_token IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= ?5)`,
    [token, expiresAt, work.kind, work.id, now.toISOString()],
  );
  return changed > 0 ? token : null;
}

async function releaseProcessingLease(database: SqlDatabase, token: string): Promise<void> {
  await database.execute(
    `UPDATE server_wallet_processing_lease
     SET lease_token = NULL, lease_expires_at = NULL, work_kind = NULL, work_id = NULL,
         updated_at = ?1
     WHERE singleton_id = 1 AND lease_token = ?2`,
    [new Date().toISOString(), token],
  );
}

async function processWork(env: Env, work: ServerWalletWorkItem): Promise<void> {
  switch (work.kind) {
    case 'browser-policy':
      await processScheduledBrowserPolicy(env, work.id);
      return;
    case 'browser-device':
      await processScheduledBrowserDevice(env, work.id);
      return;
    case 'managed-source':
      await processScheduledManagedSourceProvisioning(env, work.id);
      return;
    case 'managed-attestation':
      await processScheduledManagedAttestation(env, work.id);
      return;
    case 'sponsor-transaction':
      await processScheduledSponsorJob(env, work.id);
  }
}

export async function processNextServerWalletWork(
  env: Env,
  scheduledTime: number,
  acceptedThrough: string | null,
): Promise<ServerWalletProcessingResult> {
  const database = createSqlDatabase(env);
  const contractAddress = env.PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS?.trim().toLowerCase() ?? '';
  if (!/^(?:[0-9a-f]{2}){32}$/u.test(contractAddress)) return { status: 'idle' };
  const now = new Date(scheduledTime);
  let work = await nextServerWalletWork(
    database,
    now.toISOString(),
    acceptedThrough,
    contractAddress,
  );
  if (!work) return { status: 'idle' };
  const leaseToken = await acquireProcessingLease(database, work, now);
  if (!leaseToken) return { status: 'busy', work };
  try {
    work = await nextServerWalletWork(
      database,
      new Date().toISOString(),
      acceptedThrough,
      contractAddress,
    );
    if (!work) return { status: 'idle' };
    console.log(JSON.stringify({
      message: 'server_wallet_scheduled_work_started',
      workKind: work.kind,
      workId: work.id,
      acceptedThrough,
    }));
    await processWork(env, work);
    console.log(JSON.stringify({
      message: 'server_wallet_scheduled_work_completed',
      workKind: work.kind,
      workId: work.id,
    }));
    return { status: 'processed', work };
  } finally {
    await releaseProcessingLease(database, leaseToken);
  }
}
