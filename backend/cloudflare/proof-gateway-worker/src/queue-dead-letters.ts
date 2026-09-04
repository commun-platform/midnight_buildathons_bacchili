import { createSqlDatabase, type SqlDatabase, type SqlStatement } from './storage/index.js';

export const deadLetterQueueNames = new Set([
  'midnight-proof-jobs-dlq',
  'midnight-sponsor-jobs-dlq',
  'midnight-managed-source-jobs-dlq',
]);

const safeIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;

interface DeadLetterIdentity {
  payloadKind: string;
  resourceType: string | null;
  resourceId: string | null;
}

function safeIdentifier(value: unknown): string | null {
  return typeof value === 'string' && safeIdentifierPattern.test(value) ? value : null;
}

function deadLetterIdentity(value: unknown): DeadLetterIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { payloadKind: 'malformed', resourceType: null, resourceId: null };
  }
  const body = value as { kind?: unknown; proofJobId?: unknown; operationId?: unknown; sourceId?: unknown; runId?: unknown };
  const kind = safeIdentifier(body.kind) ?? 'malformed';
  if (kind === 'admit-proof' || kind === 'sponsor-transaction') {
    return { payloadKind: kind, resourceType: 'proof-job', resourceId: safeIdentifier(body.proofJobId) };
  }
  if (kind === 'browser-device-provisioning') {
    return { payloadKind: kind, resourceType: 'device-registration', resourceId: safeIdentifier(body.operationId) };
  }
  if (kind === 'browser-policy-provisioning') {
    return { payloadKind: kind, resourceType: 'policy-registration', resourceId: safeIdentifier(body.operationId) };
  }
  if (kind === 'provision-source') {
    return { payloadKind: kind, resourceType: 'managed-source', resourceId: safeIdentifier(body.sourceId) };
  }
  if (kind === 'fetch-window' || kind === 'attest-window') {
    return { payloadKind: kind, resourceType: 'managed-source-run', resourceId: safeIdentifier(body.runId) };
  }
  return { payloadKind: kind, resourceType: null, resourceId: null };
}

function affectedStateStatements(
  identity: DeadLetterIdentity,
  now: string,
): SqlStatement[] {
  if (!identity.resourceId) return [];
  if (identity.resourceType === 'proof-job') {
    return [{
      sql: `UPDATE daily_proof_jobs SET status = 'dead_lettered',
              lease_expires_at = NULL, sponsor_lease_expires_at = NULL,
              last_error_code = 'cloudflare_queue_dead_letter', updated_at = ?1
            WHERE id = ?2 AND status NOT IN ('submitted', 'confirmed', 'dead_lettered')`,
      parameters: [now, identity.resourceId],
    }];
  }
  if (identity.resourceType === 'device-registration') {
    return [{
      sql: `UPDATE browser_provisioning_operations SET status = 'failed', stage = 'failed',
              error_message = 'Cloudflare Queue delivery exhausted retries', updated_at = ?1
            WHERE id = ?2 AND status NOT IN ('registered', 'failed')`,
      parameters: [now, identity.resourceId],
    }];
  }
  if (identity.resourceType === 'policy-registration') {
    return [{
      sql: `UPDATE browser_policy_operations SET status = 'failed', stage = 'failed',
              error_message = 'Cloudflare Queue delivery exhausted retries', updated_at = ?1
            WHERE id = ?2 AND status NOT IN ('registered', 'failed')`,
      parameters: [now, identity.resourceId],
    }];
  }
  if (identity.resourceType === 'managed-source') {
    return [{
      sql: `UPDATE managed_sources SET status = 'action_required', stage = 'queue_dead_letter',
              last_error_code = 'cloudflare_queue_dead_letter',
              last_error_summary = 'Managed Source delivery exhausted Cloudflare Queue retries',
              updated_at = ?1
            WHERE id = ?2 AND status <> 'active'`,
      parameters: [now, identity.resourceId],
    }];
  }
  if (identity.resourceType === 'managed-source-run') {
    return [
      {
        sql: `UPDATE managed_source_runs SET status = 'dead_lettered', stage = 'queue_dead_letter',
                lease_expires_at = NULL, last_error_code = 'cloudflare_queue_dead_letter',
                last_error_summary = 'Managed Source Run exhausted Cloudflare Queue retries',
                updated_at = ?1
              WHERE id = ?2 AND status NOT IN ('confirmed', 'action_required', 'dead_lettered')`,
        parameters: [now, identity.resourceId],
      },
      {
        sql: `UPDATE daily_proof_jobs SET status = 'dead_lettered', lease_expires_at = NULL,
                sponsor_lease_expires_at = NULL,
                last_error_code = 'cloudflare_queue_dead_letter', updated_at = ?1
              WHERE id = (SELECT proof_job_id FROM managed_source_runs WHERE id = ?2)
                AND status NOT IN ('submitted', 'confirmed', 'dead_lettered')`,
        parameters: [now, identity.resourceId],
      },
    ];
  }
  return [];
}

async function persistDeadLetter(
  database: SqlDatabase,
  queueName: string,
  message: Message<unknown>,
): Promise<void> {
  const identity = deadLetterIdentity(message.body);
  const now = new Date().toISOString();
  const messageId = String(message.id).slice(0, 200);
  const recordId = `${queueName}:${messageId}`;
  const alertKey = `queue-dead-letter:${queueName}:${messageId}`;
  const summary = `Cloudflare Queue ${queueName} exhausted retries for ${identity.resourceType ?? 'unknown'} ${identity.resourceId ?? 'unknown'}.`;
  await database.batch([
    {
      sql: `INSERT INTO queue_dead_letters (
              id, queue_name, message_id, payload_kind, resource_type, resource_id,
              status, delivery_attempts, observation_count, first_observed_at, last_observed_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7, 1, ?8, ?8)
            ON CONFLICT(id) DO UPDATE SET
              delivery_attempts = MAX(queue_dead_letters.delivery_attempts, excluded.delivery_attempts),
              observation_count = queue_dead_letters.observation_count + 1,
              last_observed_at = excluded.last_observed_at`,
      parameters: [
        recordId,
        queueName,
        messageId,
        identity.payloadKind,
        identity.resourceType,
        identity.resourceId,
        Math.max(1, message.attempts),
        now,
      ],
    },
    ...affectedStateStatements(identity, now),
    {
      sql: `INSERT INTO operations_alert_state (
              alert_key, severity, status, summary, first_observed_at,
              last_observed_at, occurrence_count
            ) VALUES (?1, 'error', 'open', ?2, ?3, ?3, 1)
            ON CONFLICT(alert_key) DO UPDATE SET
              status = 'open', summary = excluded.summary,
              last_observed_at = excluded.last_observed_at,
              occurrence_count = operations_alert_state.occurrence_count + 1`,
      parameters: [alertKey, summary.slice(0, 500), now],
    },
    {
      sql: `INSERT OR IGNORE INTO operations_notification_outbox (
              id, kind, dedupe_key, alert_key, resource_type, resource_id,
              status, attempt_count, available_after, created_at, updated_at
            ) VALUES (?1, 'alert-opened', ?2, ?3, ?4, ?5,
                      'pending', 0, ?6, ?6, ?6)`,
      parameters: [
        crypto.randomUUID(),
        `alert-opened:${alertKey}`,
        alertKey,
        identity.resourceType,
        identity.resourceId,
        now,
      ],
    },
    {
      sql: `INSERT OR IGNORE INTO operational_events (
              id, occurred_at, category, severity, actor_type, actor_identifier,
              action, outcome, resource_type, resource_id, correlation_id, error_code
            ) VALUES (?1, ?2, 'workflow', 'error', 'system', ?3,
                      'queue.dead_letter.received', 'action_required', ?4, ?5, ?6,
                      'cloudflare_queue_dead_letter')`,
      parameters: [
        `event:${recordId}`,
        now,
        queueName,
        identity.resourceType,
        identity.resourceId,
        recordId,
      ],
    },
  ]);
}

export async function handleDeadLetterQueue(
  batch: MessageBatch<unknown>,
  env: Env,
): Promise<void> {
  if (!deadLetterQueueNames.has(batch.queue)) {
    batch.retryAll({ delaySeconds: 60 });
    return;
  }
  const database = createSqlDatabase(env);
  for (const message of batch.messages) {
    try {
      await persistDeadLetter(database, batch.queue, message);
      message.ack();
    } catch (error) {
      console.error(JSON.stringify({
        message: 'queue_dead_letter_persistence_failed',
        queue: batch.queue,
        messageId: String(message.id).slice(0, 200),
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }));
      message.retry({ delaySeconds: 60 });
    }
  }
}
