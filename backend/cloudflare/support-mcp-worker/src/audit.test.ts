import { describe, expect, it } from 'vitest';

import { auditSupportTool } from './audit.js';

describe('Support MCP audit', () => {
  it('records tool identity and outcome without recording tool input or output', async () => {
    let sql = '';
    let values: unknown[] = [];
    const env = {
      DB: {
        prepare(statement: string) {
          sql = statement;
          return {
            bind(...parameters: unknown[]) {
              values = parameters;
              return { run: async () => ({ success: true }) };
            },
          };
        },
      } as unknown as D1Database,
    } as Pick<Env, 'DB'>;

    const result = await auditSupportTool(
      env,
      {
        identifier: 'operator-subject-001',
        email: 'support@commun-platform.com',
        displayName: 'Support',
      },
      'find_proof_jobs',
      async () => ({ jobs: [{ proofJobId: 'proof-001' }] }),
    );

    expect(result).toEqual({ jobs: [{ proofJobId: 'proof-001' }] });
    expect(sql).toContain('INSERT INTO operational_events');
    expect(values).toContain('mcp.support.find_proof_jobs');
    expect(values).toContain('completed');
    expect(JSON.stringify(values)).not.toContain('proof-001');
  });
});
