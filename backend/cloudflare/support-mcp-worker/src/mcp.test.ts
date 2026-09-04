import { describe, expect, it } from 'vitest';

import { supportMcpHandler } from './mcp.js';

function toolsListRequest(): Request {
  return new Request('https://midnight-support-mcp.commun-official.workers.dev/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    }),
  });
}

async function protocolBody(response: Response): Promise<{
  result: { tools: Array<{ name: string; annotations?: unknown }> };
}> {
  const text = await response.text();
  const data = text.split('\n').find((line) => line.startsWith('data: '))?.slice(6);
  return JSON.parse(data ?? text) as {
    result: { tools: Array<{ name: string; annotations?: unknown }> };
  };
}

describe('private Support MCP tools', () => {
  it('exposes only the six read-only support tools', async () => {
    const response = await supportMcpHandler({} as Env, {
      identifier: 'support-001',
      email: 'support@commun-platform.com',
      displayName: 'Support',
    }).fetch(toolsListRequest());
    expect(response.status).toBe(200);
    const body = await protocolBody(response);
    expect(body.result.tools.map(({ name }) => name)).toEqual([
      'get_system_overview',
      'get_server_wallet_status',
      'get_job_statistics',
      'find_proof_jobs',
      'search_operational_events',
      'get_managed_source_status',
    ]);
    expect(body.result.tools.every((tool) => (
      (tool.annotations as { readOnlyHint?: boolean } | undefined)?.readOnlyHint === true
    ))).toBe(true);
  });
});
