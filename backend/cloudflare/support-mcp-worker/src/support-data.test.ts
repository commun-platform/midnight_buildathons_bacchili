import { describe, expect, it } from 'vitest';

import { findProofJobs, walletStatus } from './support-data.js';

function database(
  onPrepare: (sql: string) => unknown,
): D1Database {
  return {
    prepare(sql: string) {
      const result = onPrepare(sql);
      return {
        bind() {
          return {
            first: async () => result,
            all: async () => ({ results: Array.isArray(result) ? result : [] }),
          };
        },
        first: async () => result,
        all: async () => ({ results: Array.isArray(result) ? result : [] }),
      };
    },
  } as unknown as D1Database;
}

describe('support data redaction', () => {
  it('returns operational Proof Job fields without private artifact locations', async () => {
    let query = '';
    const result = await findProofJobs({
      DB: database((sql) => {
        query = sql;
        return [{ proof_job_id: 'proof-001', status: 'confirmed' }];
      }),
    }, { proofJobId: 'proof-001', limit: 20 });
    expect(result.jobs).toEqual([{ proof_job_id: 'proof-001', status: 'confirmed' }]);
    expect(query).not.toContain('private_input_object_key');
    expect(query).not.toContain('proof_artifact_key');
    expect(query).not.toContain('transaction_object_key');
  });

  it('allowlists Wallet status fields and drops injected secrets', async () => {
    const result = await walletStatus({
      DB: database((sql) => sql.includes('system_component_state') ? {
        health_class: 'healthy',
        last_observed_at: '2026-09-04T00:00:00.000Z',
        last_changed_at: '2026-09-04T00:00:00.000Z',
        summary_json: JSON.stringify({
          healthClass: 'healthy',
          phase: 'ready',
          seed: 'must-not-leak',
          balances: { dust: '12.5', privateKey: 'must-not-leak' },
          synchronization: [{ channel: 'dust', applied: '100', highest: '100', complete: true }],
          synchronizationCheckpoint: { status: 'stored', objectKey: 'must-not-leak' },
        }),
      } : {
        mode: 'scheduled',
        processing_starts_at_minute: 120,
      }),
    });
    const serialized = JSON.stringify(result);
    expect(serialized).toContain('"dust":"12.5"');
    expect(serialized).not.toContain('must-not-leak');
    expect(serialized).not.toContain('privateKey');
    expect(serialized).not.toContain('seed');
    expect(serialized).toContain('"checkpointStatus":"stored"');
    expect(serialized).not.toContain('objectKey');
  });
});
