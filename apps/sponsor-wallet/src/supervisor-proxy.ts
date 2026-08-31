import { once } from 'node:events';
import type { Readable } from 'node:stream';

export function proxyMethodHasRequestBody(method: string | undefined): boolean {
  const normalized = method?.toUpperCase() ?? 'GET';
  return normalized !== 'GET' && normalized !== 'HEAD';
}

export async function drainProxyRequest(request: Readable): Promise<void> {
  if (request.readableEnded || request.destroyed) return;
  request.resume();
  await once(request, 'end');
}
