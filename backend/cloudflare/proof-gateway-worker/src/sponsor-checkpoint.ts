export const sponsorCheckpointKey = 'sponsor-wallet/preprod/checkpoint.enc';
export const sponsorCheckpointRecoveryKey = 'sponsor-wallet/preprod/checkpoint-recovery.enc';
export const maxSponsorCheckpointBytes = 128 * 1024 * 1024;

const bootIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const reasonPattern = /^(?:SIGINT|SIGTERM|periodic-sync|wallet-initialization-failed|wallet-runtime-error)$/u;

export interface SponsorCheckpointUpload {
  body: ReadableStream<Uint8Array>;
  bytes: number;
  bootId: string;
  reason: string;
  progress?: SponsorCheckpointProgress;
}

export interface SponsorCheckpointProgress {
  bootId: string;
  phase: string;
  shieldedApplied: string;
  unshieldedApplied: string;
  dustApplied: string;
}

async function copySponsorCheckpoint(
  env: Env,
  sourceKey: string,
  destinationKey: string,
  source: 'pre-reservation' | 'operator-recovery',
  signal?: AbortSignal,
): Promise<boolean> {
  const checkpoint = await env.SPONSOR_STATE.get(sourceKey);
  if (!checkpoint) return false;
  if (checkpoint.size <= 0 || checkpoint.size > maxSponsorCheckpointBytes) {
    throw new Error('Stored Sponsor Wallet checkpoint has an invalid size');
  }
  if (signal?.aborted) throw signal.reason;
  const bytes = await checkpoint.arrayBuffer();
  if (signal?.aborted) throw signal.reason;
  if (bytes.byteLength !== checkpoint.size) {
    throw new Error('Stored Sponsor Wallet checkpoint size changed while copying');
  }
  await env.SPONSOR_STATE.put(destinationKey, bytes, {
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: {
      format: 'vsp-sponsor-checkpoint-v1',
      updatedAt: new Date().toISOString(),
      source,
    },
  });
  return true;
}

export async function preserveSponsorRecoveryCheckpoint(
  env: Env,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw signal.reason;
  const checkpoint = await env.SPONSOR_STATE.head(sponsorCheckpointKey);
  if (
    checkpoint === null
    || checkpoint.size <= 0
    || checkpoint.size > maxSponsorCheckpointBytes
  ) {
    throw new Error('Sponsor Wallet checkpoint is unavailable before DUST reservation');
  }
  // The main checkpoint is frozen while a Sponsor reservation is active, so
  // it is already the pre-DUST recovery point. Remove a stale maintenance
  // checkpoint without copying the multi-megabyte object on the Queue path.
  await env.SPONSOR_STATE.delete(sponsorCheckpointRecoveryKey);
  if (signal?.aborted) throw signal.reason;
}

export async function clearSponsorRecoveryCheckpoint(env: Env): Promise<void> {
  await env.SPONSOR_STATE.delete(sponsorCheckpointRecoveryKey);
}

export async function restoreSponsorRecoveryCheckpoint(env: Env): Promise<boolean> {
  const restored = await copySponsorCheckpoint(
    env,
    sponsorCheckpointRecoveryKey,
    sponsorCheckpointKey,
    'operator-recovery',
  );
  if (restored) await env.SPONSOR_STATE.delete(sponsorCheckpointRecoveryKey);
  if (restored) return true;
  const checkpoint = await env.SPONSOR_STATE.head(sponsorCheckpointKey);
  return checkpoint !== null
    && checkpoint.size > 0
    && checkpoint.size <= maxSponsorCheckpointBytes;
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
  let progress: SponsorCheckpointProgress | undefined;
  if (reason === 'periodic-sync') {
    const phase = request.headers.get('X-Sponsor-Checkpoint-Phase')?.trim() ?? '';
    const shieldedApplied = request.headers
      .get('X-Sponsor-Checkpoint-Shielded-Applied')?.trim() ?? '';
    const unshieldedApplied = request.headers
      .get('X-Sponsor-Checkpoint-Unshielded-Applied')?.trim() ?? '';
    const dustApplied = request.headers
      .get('X-Sponsor-Checkpoint-Dust-Applied')?.trim() ?? '';
    if (
      !/^(?:starting|syncing|waiting-for-funding|registering-dust|ready|error)$/u.test(phase)
      || !/^\d+$/u.test(shieldedApplied)
      || !/^\d+$/u.test(unshieldedApplied)
      || !/^\d+$/u.test(dustApplied)
    ) throw new Error('Sponsor Wallet periodic checkpoint progress is invalid');
    progress = { bootId, phase, shieldedApplied, unshieldedApplied, dustApplied };
  }
  if (!request.body) throw new Error('Sponsor Wallet checkpoint body is required');
  return { body: request.body, bytes, bootId, reason, progress };
}

export async function storeWalletCheckpointAt(
  env: Env,
  key: string,
  body: ReadableStream<Uint8Array>,
  bytes: number,
  metadata: {
    source:
      | 'graceful-shutdown'
      | 'periodic-pull'
      | 'periodic-cache-pull'
      | 'periodic-push'
      | 'dust-replay-base';
    bootId?: string;
    reason?: string;
    progress?: SponsorCheckpointProgress;
  },
  signal?: AbortSignal,
): Promise<void> {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > maxSponsorCheckpointBytes) {
    throw new Error('Sponsor Wallet checkpoint has an invalid Content-Length');
  }
  const updatedAt = new Date().toISOString();
  const fixedLength = new FixedLengthStream(bytes);
  await Promise.all([
    body.pipeTo(fixedLength.writable, { signal }),
    env.SPONSOR_STATE.put(key, fixedLength.readable, {
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: {
        format: 'vsp-sponsor-checkpoint-v1',
        updatedAt,
        source: metadata.source,
        ...(metadata.bootId ? { bootId: metadata.bootId } : {}),
        ...(metadata.reason ? { reason: metadata.reason } : {}),
        ...(metadata.progress ? {
          checkpointBootId: metadata.progress.bootId,
          phase: metadata.progress.phase,
          shieldedApplied: metadata.progress.shieldedApplied,
          unshieldedApplied: metadata.progress.unshieldedApplied,
          dustApplied: metadata.progress.dustApplied,
        } : {}),
      },
    }),
  ]);
}

export async function storeSponsorCheckpoint(
  env: Env,
  body: ReadableStream<Uint8Array>,
  bytes: number,
  metadata: {
    source: 'graceful-shutdown' | 'periodic-pull' | 'periodic-cache-pull' | 'periodic-push';
    bootId?: string;
    reason?: string;
    progress?: SponsorCheckpointProgress;
  },
  signal?: AbortSignal,
): Promise<void> {
  await storeWalletCheckpointAt(env, sponsorCheckpointKey, body, bytes, metadata, signal);
}

export async function storeSponsorDustReplayCheckpoint(
  env: Env,
  body: ReadableStream<Uint8Array>,
  bytes: number,
): Promise<void> {
  await storeWalletCheckpointAt(env, sponsorCheckpointRecoveryKey, body, bytes, {
    source: 'dust-replay-base',
  });
}
