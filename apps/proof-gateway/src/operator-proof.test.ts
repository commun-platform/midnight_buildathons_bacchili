import { describe, expect, it } from 'vitest';

import { authorizeOperatorProofRequest } from './operator-proof.js';

function database(row: Record<string, unknown> | null): D1Database {
  return {
    prepare() {
      const statement = {
        bind() { return statement; },
        async first<T>() { return row as T | null; },
      } as unknown as D1PreparedStatement;
      return statement;
    },
  } as unknown as D1Database;
}

describe('ephemeral Operator Proof Lease', () => {
  it('ignores Device Session bearer tokens', async () => {
    const result = await authorizeOperatorProofRequest(
      new Request('https://worker.test/ready', {
        headers: { Authorization: 'Bearer vsp_session_example' },
      }),
      { DB: database(null) } as unknown as Env,
    );
    expect(result.kind).toBe('not-operator');
  });

  it('accepts an active purpose-limited lease and rejects expiration', async () => {
    const token = `vsp_operator_${'a'.repeat(43)}`;
    const request = new Request('https://worker.test/ready', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const active = {
      id: 'deploy-test',
      purpose: 'contract_deploy',
      status: 'active',
      issued_at: 100,
      expires_at: 200,
      revoked_at: null,
    };
    const accepted = await authorizeOperatorProofRequest(
      request,
      { DB: database(active) } as unknown as Env,
      150,
    );
    expect(accepted).toMatchObject({ kind: 'authorized', leaseId: 'deploy-test' });
    const expired = await authorizeOperatorProofRequest(
      request,
      { DB: database(active) } as unknown as Env,
      200,
    );
    expect(expired.kind).toBe('denied');
  });

  it('accepts a separate contract_admin lease for fleet management', async () => {
    const token = `vsp_operator_${'b'.repeat(43)}`;
    const accepted = await authorizeOperatorProofRequest(
      new Request('https://worker.test/ready', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      { DB: database({
        id: 'admin-test',
        purpose: 'contract_admin',
        status: 'active',
        issued_at: 100,
        expires_at: 200,
        revoked_at: null,
      }) } as unknown as Env,
      150,
    );
    expect(accepted).toMatchObject({
      kind: 'authorized',
      leaseId: 'admin-test',
      purpose: 'contract_admin',
    });
  });
});
