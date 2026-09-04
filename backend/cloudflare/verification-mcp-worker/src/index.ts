import {
  createMcpHandler,
  McpServer,
} from '@modelcontextprotocol/server';
import { verifyAttestationTransaction } from '@midnight-demo/public-attestation-verifier';
import { z } from 'zod';

const txHashSchema = z.string().trim().regex(/^(?:0x)?[a-f\d]{64}$/iu);
const maximumBodyBytes = 16 * 1024;
const allowedHosts = new Set([
  'midnight-verification-mcp.commun-official.workers.dev',
  'localhost',
  '127.0.0.1',
]);
const allowedOrigins = new Set([
  'https://midnight-verification-mcp.commun-official.workers.dev',
  'https://playground.ai.cloudflare.com',
  'http://localhost',
  'http://127.0.0.1',
]);

function configuredContracts(env: Env): string[] {
  return env.ALLOWED_SENSOR_REGISTRY_CONTRACTS.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function verificationServer(env: Env): McpServer {
  const server = new McpServer({
    name: 'BACCHIRI Public Midnight Verification',
    version: '1.0.0',
  }, {
    instructions: 'Public, read-only verification of a Midnight Preprod daily-attestation transaction hash. No operational or private system data is available.',
  });
  server.registerTool('verify_attestation_transaction', {
    description: 'Verify a Midnight Preprod TX Hash and return only the public daily threshold-attestation result, policy, 24 hourly results, proof subject, and confirmation evidence.',
    inputSchema: z.object({ transactionHash: txHashSchema }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async ({ transactionHash }) => {
    try {
      const verification = await verifyAttestationTransaction(
        transactionHash,
        fetch,
        configuredContracts(env),
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(verification, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: JSON.stringify({
            verified: false,
            error: error instanceof Error ? error.message : 'Verification failed',
          }),
        }],
      };
    }
  });
  return server;
}

function verificationHandler(env: Env) {
  return createMcpHandler(
    () => verificationServer(env),
    {
      legacy: 'stateless',
      onerror(error) {
        console.error(JSON.stringify({
          message: 'public_verification_mcp_protocol_error',
          errorName: error.name,
        }));
      },
    },
  );
}

function secure(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  return new Response(response.body, { status: response.status, headers });
}

export async function handleVerificationMcp(
  request: Request,
  env: Env,
  context: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== '/mcp') {
    return secure(new Response('Not found', { status: 404 }));
  }
  if (!allowedHosts.has(url.hostname)) {
    return secure(Response.json({ error: 'Request host is not allowed' }, { status: 403 }));
  }
  if (request.method !== 'POST') {
    return secure(Response.json({ error: 'Method not allowed' }, {
      status: 405,
      headers: { Allow: 'POST' },
    }));
  }
  const origin = request.headers.get('Origin');
  if (origin && !allowedOrigins.has(origin)) {
    return secure(Response.json({ error: 'Request origin is not allowed' }, { status: 403 }));
  }
  const contentLength = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximumBodyBytes) {
    return secure(Response.json({ error: 'Request body is too large' }, { status: 413 }));
  }
  const rateLimit = await env.VERIFY_RATE_LIMITER.limit({
    key: request.headers.get('CF-Connecting-IP')?.trim() || 'unknown-client',
  });
  if (!rateLimit.success) {
    return secure(Response.json({ error: 'Verification request rate limit exceeded' }, {
      status: 429,
      headers: { 'Retry-After': '60' },
    }));
  }
  return secure(await verificationHandler(env).fetch(request));
}

export default {
  fetch: handleVerificationMcp,
} satisfies ExportedHandler<Env>;
