import { afterEach, describe, expect, it, vi } from 'vitest';

import { markProofReady } from './jobs.js';
import { isProofOperatingWindow } from './proof-window.js';

type ProofCompletionState = {
  id: string;
  status: string;
  proofGeneratedAt: string | null;
  updatedAt: string;
};

function proofCompletionEnvironment(initial: ProofCompletionState): {
  env: Env;
  current: () => ProofCompletionState;
} {
  let row = { ...initial };
  const database = {
    prepare(query: string) {
      let parameters: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          parameters = values;
          return statement;
        },
        async run<T>() {
          let changes = 0;
          if (
            query.includes("SET status = 'proof_ready'")
            && query.includes('proof_generated_at = COALESCE(proof_generated_at, ?1)')
            && parameters[1] === row.id
            && row.status === 'proving'
          ) {
            row = {
              ...row,
              status: 'proof_ready',
              proofGeneratedAt: row.proofGeneratedAt ?? String(parameters[0]),
              updatedAt: String(parameters[0]),
            };
            changes = 1;
          }
          return {
            success: true,
            results: [] as T[],
            meta: { changes },
          } as D1Result<T>;
        },
      } as unknown as D1PreparedStatement;
      return statement;
    },
  } as unknown as D1Database;
  return {
    env: { DB: database } as unknown as Env,
    current: () => row,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Proof Server operating window', () => {
  it.each([
    ['2026-08-27T17:00:00.000Z', true],
    ['2026-08-27T20:59:59.999Z', true],
    ['2026-08-27T16:59:59.999Z', false],
    ['2026-08-27T21:00:00.000Z', false],
  ])('maps %s to the configured 02:00-06:00 JST window', (timestamp, expected) => {
    expect(isProofOperatingWindow(new Date(timestamp))).toBe(expected);
  });
});

describe('Proof generation completion', () => {
  it('records the server-observed completion time for a newly generated proof', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T04:05:06.000Z'));
    const store = proofCompletionEnvironment({
      id: 'proof-new',
      status: 'proving',
      proofGeneratedAt: null,
      updatedAt: '2026-08-31T04:00:00.000Z',
    });

    await markProofReady(store.env, 'proof-new');

    expect(store.current()).toEqual({
      id: 'proof-new',
      status: 'proof_ready',
      proofGeneratedAt: '2026-08-31T04:05:06.000Z',
      updatedAt: '2026-08-31T04:05:06.000Z',
    });
  });

  it('preserves the original completion time when proof completion is retried', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T05:00:00.000Z'));
    const store = proofCompletionEnvironment({
      id: 'proof-retry',
      status: 'proving',
      proofGeneratedAt: '2026-08-31T04:05:06.000Z',
      updatedAt: '2026-08-31T04:30:00.000Z',
    });

    await markProofReady(store.env, 'proof-retry');

    expect(store.current()).toMatchObject({
      status: 'proof_ready',
      proofGeneratedAt: '2026-08-31T04:05:06.000Z',
      updatedAt: '2026-08-31T05:00:00.000Z',
    });
  });

  it('does not rewrite a job outside the proving state', async () => {
    const store = proofCompletionEnvironment({
      id: 'proof-confirmed',
      status: 'confirmed',
      proofGeneratedAt: '2026-08-31T04:05:06.000Z',
      updatedAt: '2026-08-31T04:10:00.000Z',
    });

    await markProofReady(store.env, 'proof-confirmed');

    expect(store.current()).toEqual({
      id: 'proof-confirmed',
      status: 'confirmed',
      proofGeneratedAt: '2026-08-31T04:05:06.000Z',
      updatedAt: '2026-08-31T04:10:00.000Z',
    });
  });
});
