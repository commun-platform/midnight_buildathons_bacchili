import { describe, expect, it } from 'vitest';

import { handleDeadLetterQueue } from './queue-dead-letters.js';

function environment(fail = false): { env: Env; statements: Array<{ sql: string; values: unknown[] }> } {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const database = {
    prepare(sql: string) {
      const statement = {
        values: [] as unknown[],
        bind(...values: unknown[]) { statement.values = values; return statement; },
        async run() {
          if (fail) throw new Error('D1 unavailable');
          statements.push({ sql, values: statement.values });
          return { success: true, results: [], meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch<T>(prepared: D1PreparedStatement[]) {
      return Promise.all(prepared.map((statement) => statement.run<T>()));
    },
  } as unknown as D1Database;
  return { env: { DB: database } as unknown as Env, statements };
}

function batch(
  body: unknown,
  callbacks: { ack: () => void; retry: () => void },
): MessageBatch<unknown> {
  return {
    queue: 'midnight-managed-source-jobs-dlq',
    messages: [{
      id: 'message-001',
      timestamp: new Date('2026-09-03T00:00:00.000Z'),
      body,
      attempts: 13,
      ack: callbacks.ack,
      retry: callbacks.retry,
    }],
    ackAll() {},
    retryAll() {},
  } as unknown as MessageBatch<unknown>;
}

describe('Cloudflare Queue dead-letter consumer', () => {
  it('records only sanitized correlation metadata and makes a Run actionable', async () => {
    const { env, statements } = environment();
    let acknowledged = 0;
    let retried = 0;
    await handleDeadLetterQueue(batch({
      kind: 'attest-window',
      runId: 'managed-run-001',
      privateInput: 'must-never-be-persisted',
    }, {
      ack: () => { acknowledged += 1; },
      retry: () => { retried += 1; },
    }), env);
    expect(acknowledged).toBe(1);
    expect(retried).toBe(0);
    expect(statements.some(({ sql }) => sql.includes('INSERT INTO queue_dead_letters'))).toBe(true);
    expect(statements.some(({ sql }) => sql.includes("status = 'dead_lettered'"))).toBe(true);
    expect(statements.some(({ sql }) => sql.includes('operations_notification_outbox'))).toBe(true);
    const serialized = JSON.stringify(statements);
    expect(serialized).toContain('managed-run-001');
    expect(serialized).not.toContain('must-never-be-persisted');
  });

  it('retries the DLQ delivery when durable persistence fails', async () => {
    const { env } = environment(true);
    let acknowledged = 0;
    let retried = 0;
    await handleDeadLetterQueue(batch({ kind: 'fetch-window', runId: 'managed-run-001' }, {
      ack: () => { acknowledged += 1; },
      retry: () => { retried += 1; },
    }), env);
    expect(acknowledged).toBe(0);
    expect(retried).toBe(1);
  });
});
