export const sponsorCheckpointKey = 'sponsor-wallet/preprod/checkpoint.enc';
export const sponsorCheckpointRecoveryKey = 'sponsor-wallet/preprod/checkpoint-recovery.enc';
export const maxSponsorCheckpointBytes = 128 * 1024 * 1024;

const bootIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const reasonPattern = /^(?:SIGINT|SIGTERM|wallet-initialization-failed|wallet-runtime-error)$/u;

export interface SponsorCheckpointUpload {
  body: ReadableStream<Uint8Array>;
  bytes: number;
  bootId: string;
  reason: string;
}

export function parseSponsorCheckpointUpload(request: Request): SponsorCheckpointUpload {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/sponsor-checkpoint') {
    throw new Error('Unknown Sponsor Wallet state operation');
  }
  if (request.headers.get('Content-Type')?.split(';', 1)[0]?.trim()
    !== 'application/octet-stream') {
    throw new Error('Sponsor Wallet checkpoint must be application/octet-stream');
  }
  const bytes = Number(request.headers.get('Content-Length'));
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > maxSponsorCheckpointBytes) {
    throw new Error('Sponsor Wallet checkpoint has an invalid Content-Length');
  }
  const bootId = request.headers.get('X-Sponsor-Boot-Id')?.trim() ?? '';
  if (!bootIdPattern.test(bootId)) throw new Error('Sponsor Wallet boot ID is invalid');
  const reason = request.headers.get('X-Sponsor-Checkpoint-Reason')?.trim() ?? '';
  if (!reasonPattern.test(reason)) throw new Error('Sponsor Wallet checkpoint reason is invalid');
  if (!request.body) throw new Error('Sponsor Wallet checkpoint body is required');
  return { body: request.body, bytes, bootId, reason };
}

export async function storeSponsorCheckpoint(
  env: Env,
  body: ReadableStream<Uint8Array>,
  bytes: number,
  metadata: {
    source: 'graceful-shutdown' | 'periodic-pull';
    bootId?: string;
    reason?: string;
  },
): Promise<void> {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > maxSponsorCheckpointBytes) {
    throw new Error('Sponsor Wallet checkpoint has an invalid Content-Length');
  }
  const updatedAt = new Date().toISOString();
  const fixedLength = new FixedLengthStream(bytes);
  await Promise.all([
    body.pipeTo(fixedLength.writable),
    env.SPONSOR_STATE.put(sponsorCheckpointKey, fixedLength.readable, {
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: {
        format: 'vsp-sponsor-checkpoint-v1',
        updatedAt,
        source: metadata.source,
        ...(metadata.bootId ? { bootId: metadata.bootId } : {}),
        ...(metadata.reason ? { reason: metadata.reason } : {}),
      },
    }),
  ]);
}
