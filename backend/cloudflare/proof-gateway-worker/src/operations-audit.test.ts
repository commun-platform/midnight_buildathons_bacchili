import { describe, expect, it } from 'vitest';

import {
  prepareRequestAudit,
  recordRequestAudit,
  sponsorWalletOperationsView,
} from './operations-audit.js';
import type { SponsorWalletHealth } from './sponsor.js';

function health(): SponsorWalletHealth {
  return {
    phase: 'ready',
    progress: { shielded: '100', unshielded: '90', dust: '80' },
    progressDetails: {
      shielded: { applied: '100', highest: '100', connected: true, complete: true },
      unshielded: { applied: '90', highest: '100', connected: true, complete: false },
      dust: { applied: '80', highest: '100', connected: true, complete: false },
    },
    dust: '2500000000000000',
    spendableDustCoins: 2,
    pendingDustCoins: 1,
    totalDustCoins: 3,
    supervisor: {
      status: 'healthy',
      walletProcessAlive: true,
      walletProcessId: 12,
      walletStatusFresh: true,
      lastSuccessfulProbeAt: '2026-08-31T00:00:00.000Z',
      lastProbeErrorAt: null,
      lastProbeError: null,
      statusAgeMs: 100,
      consecutiveProbeFailures: 0,
    },
    error: null,
  };
}

describe('operations audit', () => {
  it('normalizes one customer operation without retaining request content', () => {
    const prepared = prepareRequestAudit(new Request('https://gateway.example/api/v1/proof-jobs/job%2D001/sponsor', {
      method: 'POST',
      headers: { 'X-Client-Operation-Id': 'proof-submit-001' },
      body: 'private-transaction-bytes',
    }), 'request-001');
    expect(prepared).toMatchObject({
      requestId: 'request-001',
      clientOperationId: 'proof-submit-001',
      action: 'proof.sponsor.request',
      route: '/api/v1/proof-jobs/:proofJobId/sponsor',
      resourceId: 'job-001',
    });
    expect(prepared).not.toHaveProperty('body');
    expect(prepared).not.toHaveProperty('authorization');
  });

  it('stores a pseudonymous Wallet actor and excludes secrets and bodies', async () => {
    const inserts: Array<{ sql: string; parameters: unknown[] }> = [];
    const database = {
      prepare(sql: string) {
        const statement = {
          parameters: [] as unknown[],
          bind(...parameters: unknown[]) {
            statement.parameters = parameters;
            return statement;
          },
          async first<T>() {
            if (sql.includes('browser_project_sessions')) {
              return { wallet_key_sha256: 'wallet-fingerprint-001' } as T;
            }
            return null;
          },
          async run() {
            inserts.push({ sql, parameters: statement.parameters });
            return { meta: { changes: 1 } };
          },
        };
        return statement;
      },
    };
    const request = new Request('https://gateway.example/api/v1/projects', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer session-super-secret',
        'Content-Type': 'application/json',
        'X-Client-Operation-Id': 'project-create-001',
      },
      body: JSON.stringify({ name: 'private customer project', signature: 'private-signature' }),
    });
    const prepared = prepareRequestAudit(request, 'request-001');
    expect(prepared).not.toBeNull();
    await recordRequestAudit(
      { DB: database } as unknown as Env,
      request,
      Response.json({ accessToken: 'response-super-secret' }, { status: 201 }),
      prepared!,
    );
    const serialized = JSON.stringify(inserts);
    expect(serialized).toContain('wallet-fingerprint-001');
    expect(serialized).toContain('project-create-001');
    expect(serialized).not.toContain('session-super-secret');
    expect(serialized).not.toContain('private customer project');
    expect(serialized).not.toContain('private-signature');
    expect(serialized).not.toContain('response-super-secret');
  });

  it('audits protected Managed API reads as the verified system operator', async () => {
    const inserts: Array<{ sql: string; parameters: unknown[] }> = [];
    const database = {
      prepare(sql: string) {
        const statement = {
          parameters: [] as unknown[],
          bind(...parameters: unknown[]) {
            statement.parameters = parameters;
            return statement;
          },
          async first<T>() {
            if (sql.includes('FROM managed_sources')) {
              return { project_id: 'project-a' } as T;
            }
            return null;
          },
          async run() {
            inserts.push({ sql, parameters: statement.parameters });
            return { meta: { changes: 1 } };
          },
        };
        return statement;
      },
    };
    const request = new Request(
      'http://127.0.0.1/api/v1/managed-sources/source-a/runs/run-a',
      { headers: { 'X-System-Operations-Local': 'dashboard' } },
    );
    const prepared = prepareRequestAudit(request, 'managed-read-001');
    expect(prepared).toMatchObject({
      action: 'managed.attestation.read',
      resourceType: 'managed-source-run',
      resourceId: 'run-a',
    });
    await recordRequestAudit(
      { DB: database } as unknown as Env,
      request,
      Response.json({ run: { runId: 'run-a' } }),
      prepared!,
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.parameters).toContain('operator');
    expect(inserts[0]?.parameters).toContain('local-development');
    expect(inserts[0]?.parameters).toContain('project-a');
    expect(JSON.stringify(inserts)).not.toContain('csrf');
  });

  it('classifies Wallet synchronization and computes block lag without exposing errors', () => {
    const view = sponsorWalletOperationsView({ ...health(), error: 'sensitive runtime detail' });
    expect(view.healthClass).toBe('healthy');
    expect(view.synchronization.map(({ channel, lag }) => [channel, lag])).toEqual([
      ['shielded', '0'],
      ['unshielded', '10'],
      ['dust', '20'],
    ]);
    expect(view.errorCode).toBe('sponsor_wallet_error');
    expect(JSON.stringify(view)).not.toContain('sensitive runtime detail');
  });
});
