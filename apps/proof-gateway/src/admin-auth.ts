const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);

export function authorizeLocalAdministrator(request: Request): Response | null {
  const url = new URL(request.url);
  if (
    loopbackHosts.has(url.hostname)
    && request.headers.get('X-VSP-Local-Admin') === 'dashboard'
  ) return null;
  return Response.json({
    error: 'Administrator APIs are available only from the loopback development GUI in Wave 1',
  }, {
    status: 403,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
