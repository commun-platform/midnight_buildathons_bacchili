const allowedMethods = ['GET', 'HEAD', 'POST', 'OPTIONS'] as const;
const allowedRequestHeaders = new Set([
  'authorization',
  'content-type',
  'x-proof-job-id',
  'x-provisioning-token',
]);
const loopbackHostnames = new Set(['localhost', '127.0.0.1', '::1']);

function developmentOrigin(request: Request): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (
      url.protocol !== 'http:'
      || !loopbackHostnames.has(url.hostname)
      || url.username
      || url.password
      || url.pathname !== '/'
      || url.search
      || url.hash
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function appendVaryOrigin(headers: Headers): void {
  const vary = headers.get('Vary')?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  if (!vary.some((value) => value.toLowerCase() === 'origin')) vary.push('Origin');
  headers.set('Vary', vary.join(', '));
}

function addCorsHeaders(headers: Headers, origin: string): void {
  headers.set('Access-Control-Allow-Origin', origin);
  appendVaryOrigin(headers);
}

export function corsPreflightResponse(request: Request): Response | null {
  if (request.method !== 'OPTIONS' || !request.headers.has('Origin')) return null;
  const origin = developmentOrigin(request);
  const requestedMethod = request.headers.get('Access-Control-Request-Method')?.toUpperCase();
  const requestedHeaders = request.headers.get('Access-Control-Request-Headers')
    ?.split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean) ?? [];
  if (
    !origin
    || !requestedMethod
    || !allowedMethods.includes(requestedMethod as typeof allowedMethods[number])
    || requestedHeaders.some((header) => !allowedRequestHeaders.has(header))
  ) {
    return new Response(null, { status: 403 });
  }
  const headers = new Headers({
    'Access-Control-Allow-Headers': [...allowedRequestHeaders].join(', '),
    'Access-Control-Allow-Methods': allowedMethods.join(', '),
    'Access-Control-Max-Age': '600',
  });
  addCorsHeaders(headers, origin);
  return new Response(null, { status: 204, headers });
}

export function withDevelopmentCors(request: Request, response: Response): Response {
  const origin = developmentOrigin(request);
  if (!origin) return response;
  const headers = new Headers(response.headers);
  addCorsHeaders(headers, origin);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
