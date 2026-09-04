import { authorizeSupportRequest, requireSupportGrant } from './access-auth.js';
import { supportMcpHandler } from './mcp.js';

const maximumBodyBytes = 64 * 1024;
const localHosts = new Set(['localhost', '127.0.0.1']);

function allowedHost(hostname: string, env: Env): boolean {
  const configured = env.SUPPORT_MCP_HOST?.trim().toLowerCase();
  return localHosts.has(hostname) || Boolean(configured && hostname === configured);
}

function allowedOrigin(origin: string, env: Env): boolean {
  try {
    const url = new URL(origin);
    if (localHosts.has(url.hostname)) return url.protocol === 'http:' || url.protocol === 'https:';
    return url.protocol === 'https:' && allowedHost(url.hostname, env);
  } catch {
    return false;
  }
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

export async function handleSupportMcp(
  request: Request,
  env: Env,
  context: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== '/mcp') return secure(new Response('Not found', { status: 404 }));
  if (!allowedHost(url.hostname, env)) {
    return secure(Response.json({ error: 'Request host is not allowed' }, { status: 403 }));
  }
  const origin = request.headers.get('Origin');
  if (origin && !allowedOrigin(origin, env)) {
    return secure(Response.json({ error: 'Request origin is not allowed' }, { status: 403 }));
  }
  const contentLength = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximumBodyBytes) {
    return secure(Response.json({ error: 'Request body is too large' }, { status: 413 }));
  }
  const identity = await authorizeSupportRequest(request, env);
  if (!identity.ok) return secure(identity.response);
  const grant = await requireSupportGrant(env, identity.principal);
  if (!grant.ok) return secure(grant.response);
  const response = await supportMcpHandler(env, grant.principal).fetch(request);
  return secure(response);
}

export default {
  fetch: handleSupportMcp,
} satisfies ExportedHandler<Env>;
