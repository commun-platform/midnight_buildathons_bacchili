import { Container, getContainer } from '@cloudflare/containers';

import { handleApi, scheduleDailyAttestations } from './api.js';

const instanceName = 'midnight-proof-server';
const textEncoder = new TextEncoder();
const maxProofBodyBytes = 95 * 1024 * 1024;
const securityHeaders = {
  'Cross-Origin-Resource-Policy': 'same-site',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export class ProofServerContainer extends Container {
  defaultPort = 6300;
  requiredPorts = [6300];
  sleepAfter = '2m';
  enableInternet = false;
  entrypoint = ['midnight-proof-server'];
}

function json(status: number, value: unknown): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...securityHeaders,
    },
  });
}

function validProofRequest(request: Request): boolean {
  if (request.headers.get('Content-Type')?.split(';', 1)[0]?.trim() !== 'application/octet-stream') {
    return false;
  }
  const contentLength = request.headers.get('Content-Length');
  if (!contentLength) return true;
  const bytes = Number(contentLength);
  return Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= maxProofBodyBytes;
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', textEncoder.encode(left)),
    crypto.subtle.digest('SHA-256', textEncoder.encode(right)),
  ]);

  return crypto.subtle.timingSafeEqual(leftHash, rightHash);
}

async function authorized(request: Request, env: Env): Promise<boolean> {
  const expected = env.PROOF_GATEWAY_TOKEN?.trim();
  if (!expected) return false;
  const authorization = request.headers.get('Authorization') ?? '';
  return constantTimeEqual(authorization, `Bearer ${expected}`);
}

async function forwardToProofServer(request: Request, env: Env, ready = false): Promise<Response> {
  const upstreamUrl = new URL(request.url);
  upstreamUrl.pathname = ready ? '/' : upstreamUrl.pathname.replace(/^\/proof/, '');
  upstreamUrl.searchParams.delete('token');
  const headers = new Headers(request.headers);
  headers.delete('Authorization');
  headers.delete('Cookie');
  const upstreamRequest = new Request(upstreamUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? null : request.body,
    redirect: 'manual',
  });
  const container = getContainer(env.PROOF_SERVER, instanceName);
  const response = await container.fetch(upstreamRequest);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Cache-Control', 'no-store');
  responseHeaders.set('X-Proof-Server', 'midnight-8.1.0');
  responseHeaders.delete('Set-Cookie');
  for (const [name, value] of Object.entries(securityHeaders)) responseHeaders.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const apiResponse = await handleApi(request, env);
    if (apiResponse) return apiResponse;
    if (url.pathname === '/health') {
      return json(200, {
        ok: true,
        service: 'midnight-edge-attestation-cloud',
        container: 'scale-to-zero',
        gui: 'worker-spa',
      });
    }

    if (url.pathname === '/ready') {
      if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
      if (!env.PROOF_GATEWAY_TOKEN) return json(503, { error: 'Gateway token is not configured' });
      if (!(await authorized(request, env))) return json(401, { error: 'Unauthorized' });
      const upstream = await forwardToProofServer(request, env, true);
      return json(upstream.status < 500 ? 200 : 502, {
        ok: upstream.status < 500,
        upstreamStatus: upstream.status,
      });
    }

    if (
      url.pathname === '/check' ||
      url.pathname === '/prove' ||
      url.pathname === '/proof/check' ||
      url.pathname === '/proof/prove'
    ) {
      if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
      if (!env.PROOF_GATEWAY_TOKEN) return json(503, { error: 'Gateway token is not configured' });
      if (!(await authorized(request, env))) return json(401, { error: 'Unauthorized' });
      if (!validProofRequest(request)) {
        return json(415, { error: 'Expected application/octet-stream within the configured size limit' });
      }
      if (url.pathname.endsWith('/prove')) {
        const limit = await env.PROOF_RATE_LIMITER.limit({ key: 'global-proof-generation' });
        if (!limit.success) {
          return new Response(JSON.stringify({ error: 'Proof generation rate limit exceeded' }), {
            status: 429,
            headers: { ...securityHeaders, 'Cache-Control': 'no-store', 'Retry-After': '60' },
          });
        }
      }
      return forwardToProofServer(request, env);
    }

    if (url.pathname.startsWith('/proof/')) return json(404, { error: 'Unknown proof endpoint' });
    return env.ASSETS.fetch(request);
  },
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(scheduleDailyAttestations(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
