import { describe, expect, it } from 'vitest';

import { handleVerificationMcp } from './index.js';

function context(): ExecutionContext {
  return {} as ExecutionContext;
}

function environment(success: boolean): Env {
  return {
    VERIFY_RATE_LIMITER: {
      limit: async () => ({ success }),
    },
    ALLOWED_SENSOR_REGISTRY_CONTRACTS: '55'.repeat(32),
  } as unknown as Env;
}

function toolsListRequest(host = 'midnight-verification-mcp.commun-official.workers.dev'): Request {
  return new Request(`https://${host}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'CF-Connecting-IP': '192.0.2.1',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
}

async function protocolBody(response: Response): Promise<{
  result: { tools: Array<{ name: string }> };
}> {
  const text = await response.text();
  const data = text.split('\n').find((line) => line.startsWith('data: '))?.slice(6);
  return JSON.parse(data ?? text) as { result: { tools: Array<{ name: string }> } };
}

describe('public Verification MCP boundary', () => {
  it('exposes only transaction-hash attestation verification', async () => {
    const response = await handleVerificationMcp(toolsListRequest(), environment(true), context());
    expect(response.status).toBe(200);
    const body = await protocolBody(response);
    expect(body.result.tools.map(({ name }) => name)).toEqual([
      'verify_attestation_transaction',
    ]);
    expect(JSON.stringify(body)).not.toContain('wallet_status');
    expect(JSON.stringify(body)).not.toContain('operational_events');
    expect(JSON.stringify(body)).not.toContain('proof_jobs');
  });

  it('rate-limits public Indexer work', async () => {
    const response = await handleVerificationMcp(toolsListRequest(), environment(false), context());
    expect(response.status).toBe(429);
  });

  it('rejects unexpected hostnames before MCP handling', async () => {
    const response = await handleVerificationMcp(
      toolsListRequest('attacker.example'),
      environment(true),
      context(),
    );
    expect(response.status).toBe(403);
  });

  it('rejects unexpected browser origins', async () => {
    const input = toolsListRequest();
    const response = await handleVerificationMcp(new Request(input, {
      headers: { ...Object.fromEntries(input.headers), Origin: 'https://attacker.example' },
    }), environment(true), context());
    expect(response.status).toBe(403);
  });

  it('rejects oversized MCP messages before protocol parsing', async () => {
    const input = toolsListRequest();
    const response = await handleVerificationMcp(new Request(input, {
      headers: { ...Object.fromEntries(input.headers), 'Content-Length': '20000' },
    }), environment(true), context());
    expect(response.status).toBe(413);
  });
});
