import { describe, expect, it } from 'vitest';

import { cleanupExpiredManagedArtifacts } from './managed-sources.js';

function d1Result<T>(results: T[] = []): D1Result<T> {
  return { success: true, results, meta: { changes: 1 } } as D1Result<T>;
}

function environment(deleteFails = false): {
  env: Env;
  deleted: string[];
  executed: string[];
} {
  const deleted: string[] = [];
  const executed: string[] = [];
  const row = {
    id: 'run-expired',
    status: 'proof_retry',
    private_artifact_key: 'managed-source-private/source-a/day.v2.enc',
    proof_job_id: 'proof-expired',
  };
  const database = {
    prepare(sql: string) {
      const statement = {
        bind() { return statement; },
        async all<T>() {
          return d1Result(sql.includes('FROM managed_source_runs') ? [row as T] : []);
        },
        async run<T>() {
          executed.push(sql);
          return d1Result<T>();
        },
      };
      return statement;
    },
    async batch<T>(statements: D1PreparedStatement[]) {
      return Promise.all(statements.map((statement) => statement.run<T>()));
    },
  } as unknown as D1Database;
  return {
    env: {
      DB: database,
      MANAGED_SOURCE_DATA: {
        async delete(key: string) {
          if (deleteFails) throw new Error('R2 unavailable');
          deleted.push(key);
        },
      },
    } as unknown as Env,
    deleted,
    executed,
  };
}

describe('managed private artifact retention', () => {
  it('deletes expired ciphertext and makes an unfinished Run actionable', async () => {
    const { env, deleted, executed } = environment();
    await expect(cleanupExpiredManagedArtifacts(
      env,
      Date.parse('2026-09-10T00:00:00.000Z'),
    )).resolves.toBe(1);
    expect(deleted).toEqual(['managed-source-private/source-a/day.v2.enc']);
    expect(executed.some((sql) => sql.includes("status = 'action_required'"))).toBe(true);
    expect(executed.some((sql) => sql.includes("status = 'dead_lettered'"))).toBe(true);
  });

  it('keeps the D1 reference when R2 deletion fails so cleanup can retry', async () => {
    const { env, executed } = environment(true);
    await expect(cleanupExpiredManagedArtifacts(
      env,
      Date.parse('2026-09-10T00:00:00.000Z'),
    )).resolves.toBe(0);
    expect(executed).toEqual([]);
  });
});
