import { describe, expect, it } from 'vitest';
import { D1SqlDatabase } from './d1.js';

type StatementState = {
  sql: string;
  bindings: unknown[];
  bindCount: number;
};

type FixtureOptions = {
  firstValue?: unknown;
  allValues?: unknown[];
  changes?: number;
};

function d1Result<T>(results: T[], changes = 0): D1Result<T> {
  return {
    success: true,
    results,
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: results.length,
      rows_written: changes,
      last_row_id: 0,
      changed_db: changes > 0,
      changes,
    },
  };
}

function fixture(options: FixtureOptions = {}) {
  const states = new WeakMap<D1PreparedStatement, StatementState>();
  const prepared: D1PreparedStatement[] = [];
  const batches: D1PreparedStatement[][] = [];
  const binding = {
    prepare(sql: string) {
      const statement = {
        bind(...values: unknown[]) {
          const state = states.get(statement as D1PreparedStatement);
          if (state) {
            state.bindings = values;
            state.bindCount += 1;
          }
          return statement;
        },
        async first<T>(): Promise<T | null> {
          return (options.firstValue ?? null) as T | null;
        },
        async all<T>(): Promise<D1Result<T>> {
          return d1Result((options.allValues ?? []) as T[]);
        },
        async run<T>(): Promise<D1Result<T>> {
          return d1Result<T>([], options.changes ?? 0);
        },
        async raw(): Promise<unknown[]> {
          return [];
        },
      } as D1PreparedStatement;
      states.set(statement, { sql, bindings: [], bindCount: 0 });
      prepared.push(statement);
      return statement;
    },
    async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      batches.push(statements);
      return statements.map(() => d1Result<T>([], 1));
    },
  } as D1Database;

  return {
    database: new D1SqlDatabase(binding),
    states,
    prepared,
    batches,
  };
}

describe('D1SqlDatabase', () => {
  it('maps single-row and multi-row reads', async () => {
    const single = fixture({ firstValue: { id: 'project-1' } });
    const multiple = fixture({ allValues: [{ id: 'device-1' }, { id: 'device-2' }] });

    await expect(single.database.first<{ id: string }>('SELECT one')).resolves.toEqual({ id: 'project-1' });
    await expect(multiple.database.all<{ id: string }>('SELECT many', ['project-1'])).resolves.toEqual([
      { id: 'device-1' },
      { id: 'device-2' },
    ]);
    expect(single.states.get(single.prepared[0] as D1PreparedStatement)?.bindCount).toBe(0);
    expect(multiple.states.get(multiple.prepared[0] as D1PreparedStatement)?.bindings).toEqual(['project-1']);
  });

  it('normalizes affected row counts', async () => {
    const testFixture = fixture({ changes: 2 });

    await expect(testFixture.database.execute('UPDATE rows', ['confirmed'])).resolves.toBe(2);
  });

  it('binds an ordered batch before submitting it once', async () => {
    const testFixture = fixture();

    await testFixture.database.batch([
      { sql: 'INSERT row', parameters: ['reading-1', 24.5] },
      { sql: 'UPDATE device', parameters: ['2026-08-26T00:00:00.000Z'] },
    ]);

    expect(testFixture.batches).toHaveLength(1);
    expect(testFixture.batches[0]).toHaveLength(2);
    expect(testFixture.states.get(testFixture.prepared[0] as D1PreparedStatement)).toEqual({
      sql: 'INSERT row',
      bindings: ['reading-1', 24.5],
      bindCount: 1,
    });
    expect(testFixture.states.get(testFixture.prepared[1] as D1PreparedStatement)).toEqual({
      sql: 'UPDATE device',
      bindings: ['2026-08-26T00:00:00.000Z'],
      bindCount: 1,
    });
  });
});
