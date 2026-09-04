import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { SupportPrincipal } from './access-auth.js';
import { auditSupportTool } from './audit.js';
import {
  findProofJobs,
  jobStatistics,
  managedSourceStatus,
  searchOperationalEvents,
  systemOverview,
  walletStatus,
} from './support-data.js';

const identifier = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const transactionHash = z.string().trim().regex(/^(?:0x)?[a-f\d]{64}$/iu);

function result(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  };
}

function errorResult(error: unknown) {
  return {
    isError: true,
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        error: 'The support query failed',
        errorCode: error instanceof Error ? error.name : 'UnknownError',
      }),
    }],
  };
}

function createSupportServer(env: Env, principal: SupportPrincipal): McpServer {
  const server = new McpServer({
    name: 'BACCHIRI Private Customer Support',
    version: '1.0.0',
  }, {
    instructions: 'Read-only operational support tools. Never returns keys, seeds, credentials, raw sensor samples, proof inputs, or encrypted artifacts.',
  });

  const run = async (toolName: string, operation: () => Promise<unknown>) => {
    try {
      return result(await auditSupportTool(env, principal, toolName, operation));
    } catch (error) {
      return errorResult(error);
    }
  };

  server.registerTool('get_system_overview', {
    description: 'Summarize projects, devices, policies, Proof Job states, registration states, and active alerts.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async () => run('get_system_overview', () => systemOverview(env)));

  server.registerTool('get_server_wallet_status', {
    description: 'Return the last observed System Wallet health, DUST/NIGHT balance, synchronization progress, processing schedule, and checkpoint status. This does not access checkpoint files or start the Wallet Container.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async () => run('get_server_wallet_status', () => walletStatus(env)));

  server.registerTool('get_job_statistics', {
    description: 'Count accepted, proof-generated, confirmed, and failed jobs over a bounded recent period.',
    inputSchema: z.object({
      days: z.number().int().min(1).max(90).default(30),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async ({ days }) => run('get_job_statistics', () => jobStatistics(env, days)));

  server.registerTool('find_proof_jobs', {
    description: 'Find recent Proof Jobs by job, transaction, project, device, or status. Private artifacts and proof inputs are excluded.',
    inputSchema: z.object({
      proofJobId: identifier.optional(),
      transactionHash: transactionHash.optional(),
      projectId: identifier.optional(),
      deviceId: identifier.optional(),
      status: identifier.optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async (input) => run('find_proof_jobs', () => findProofJobs(env, input)));

  server.registerTool('search_operational_events', {
    description: 'Trace customer-facing API and workflow activity by pseudonymous Wallet identifier, project, device, request, or correlation ID.',
    inputSchema: z.object({
      walletIdentifier: z.string().trim().regex(/^[a-f\d]{64}$/iu).optional(),
      projectId: identifier.optional(),
      deviceId: identifier.optional(),
      requestId: identifier.optional(),
      correlationId: identifier.optional(),
      severity: z.enum(['info', 'warning', 'error']).optional(),
      category: z.enum(['api', 'workflow', 'health']).optional(),
      sinceHours: z.number().int().min(1).max(24 * 90).default(24),
      limit: z.number().int().min(1).max(100).default(50),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async (input) => run(
    'search_operational_events',
    () => searchOperationalEvents(env, input),
  ));

  server.registerTool('get_managed_source_status', {
    description: 'Inspect registered cloud-data connectors and recent fetch/proof runs without exposing endpoints, credentials, raw samples, or private artifacts.',
    inputSchema: z.object({ projectId: identifier.optional() }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async ({ projectId }) => run(
    'get_managed_source_status',
    () => managedSourceStatus(env, projectId),
  ));

  return server;
}

export function supportMcpHandler(env: Env, principal: SupportPrincipal) {
  return createMcpHandler(
    () => createSupportServer(env, principal),
    {
      legacy: 'stateless',
      onerror(error) {
        console.error(JSON.stringify({
          message: 'support_mcp_protocol_error',
          errorName: error.name,
        }));
      },
    },
  );
}
