import { describe, expect, it } from 'vitest';

import { handleSupportMcp } from './index.js';

function environment(audience = 'aa'.repeat(32)): Env {
  return {
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
    CLOUDFLARE_ACCESS_AUDIENCE: audience,
    DB: {
      prepare() {
        throw new Error('D1 must not be reached before Access authentication');
      },
    } as unknown as D1Database,
  } as unknown as Env;
}

function request(host = 'midnight-support-mcp.commun-official.workers.dev'): Request {
  return new Request(`https://${host}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
}

describe('private Support MCP ingress', () => {
  it('fails closed before D1 when an Access assertion is absent', async () => {
    const response = await handleSupportMcp(
      request(),
      environment(),
      {} as ExecutionContext,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Cloudflare Access authentication is required',
    });
  });

  it('fails closed while the Access audience is not configured', async () => {
    const response = await handleSupportMcp(
      request(),
      environment('SET_AFTER_PRIVATE_ACCESS_APPLICATION_CREATION'),
      {} as ExecutionContext,
    );
    expect(response.status).toBe(503);
  });

  it('rejects an unexpected hostname before authentication', async () => {
    const response = await handleSupportMcp(
      request('attacker.example'),
      environment(),
      {} as ExecutionContext,
    );
    expect(response.status).toBe(403);
  });
});
