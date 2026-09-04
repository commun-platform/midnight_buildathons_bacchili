import { handleWave1Api } from './wave1-api.js';
import { handleProvisioningApi } from './provisioning.js';
import { handleManagedSourcesApi } from './managed-sources.js';

function json(status: number, value: unknown): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function handleApi(
  request: Request,
  env: Env,
  context?: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;

  if (url.pathname.startsWith('/api/v1/managed-sources')) {
    return handleManagedSourcesApi(
      request,
      env,
      context ?? ({} as ExecutionContext),
    );
  }

  const provisioning = await handleProvisioningApi(request, env);
  if (provisioning) return provisioning;

  const wave1 = await handleWave1Api(request, env);
  if (wave1) return wave1;

  if (
    url.pathname === '/api/v1/readings'
    || url.pathname.startsWith('/api/internal/attestations')
    || /^\/api\/v1\/attestations(?:\/|$)/u.test(url.pathname)
    || /^\/api\/v1\/projects\/[^/]+\/(?:summary|readings|attestations)$/u.test(url.pathname)
  ) {
    return json(410, {
      error: 'This per-reading API was retired; use Wave 1 hourly aggregates, anomaly events, and Proof Jobs',
    });
  }
  return json(404, { error: 'API endpoint not found' });
}
