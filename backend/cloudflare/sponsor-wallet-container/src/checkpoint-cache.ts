import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';

import { sponsorWalletBootId } from './diagnostics.js';

const defaultCheckpointCachePath = '/tmp/sponsor-wallet-sync-checkpoint.enc';
const minimumCheckpointDelayMs = 60_000;
const maximumCheckpointDelayMs = 5 * 60_000;

export function nextSynchronizationCheckpointDelayMs(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) return maximumCheckpointDelayMs;
  return Math.min(
    maximumCheckpointDelayMs,
    Math.max(minimumCheckpointDelayMs, Math.ceil(durationMs * 10)),
  );
}

export interface SynchronizationCheckpointCacheMetadata {
  format: 'vsp-sponsor-sync-cache-v1';
  updatedAt: string;
  bootId: string;
  phase: 'syncing';
  shieldedApplied: string;
  unshieldedApplied: string;
  dustApplied: string;
  bytes: number;
  sha256: string;
}

function configuredCheckpointCachePath(): string {
  return process.env.SPONSOR_CHECKPOINT_CACHE_PATH?.trim() || defaultCheckpointCachePath;
}

function metadataPath(checkpointPath: string): string {
  return `${checkpointPath}.json`;
}

function parseMetadata(value: string): SynchronizationCheckpointCacheMetadata {
  const parsed = JSON.parse(value) as Partial<SynchronizationCheckpointCacheMetadata>;
  if (
    parsed.format !== 'vsp-sponsor-sync-cache-v1'
    || typeof parsed.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(parsed.updatedAt))
    || typeof parsed.bootId !== 'string'
    || parsed.phase !== 'syncing'
    || typeof parsed.shieldedApplied !== 'string'
    || typeof parsed.unshieldedApplied !== 'string'
    || typeof parsed.dustApplied !== 'string'
    || !Number.isSafeInteger(parsed.bytes)
    || (parsed.bytes ?? 0) <= 0
    || typeof parsed.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/u.test(parsed.sha256)
    || !/^\d+$/u.test(parsed.shieldedApplied)
    || !/^\d+$/u.test(parsed.unshieldedApplied)
    || !/^\d+$/u.test(parsed.dustApplied)
  ) throw new Error('Synchronization checkpoint cache metadata is invalid');
  return parsed as SynchronizationCheckpointCacheMetadata;
}

export async function writeSynchronizationCheckpointCache(
  checkpoint: Uint8Array,
  progress: {
    shieldedApplied: string;
    unshieldedApplied: string;
    dustApplied: string;
  },
  checkpointPath = configuredCheckpointCachePath(),
): Promise<SynchronizationCheckpointCacheMetadata> {
  if (checkpoint.byteLength <= 0) throw new Error('Synchronization checkpoint cache is empty');
  const metadata: SynchronizationCheckpointCacheMetadata = {
    format: 'vsp-sponsor-sync-cache-v1',
    updatedAt: new Date().toISOString(),
    bootId: sponsorWalletBootId,
    phase: 'syncing',
    shieldedApplied: progress.shieldedApplied,
    unshieldedApplied: progress.unshieldedApplied,
    dustApplied: progress.dustApplied,
    bytes: checkpoint.byteLength,
    sha256: crypto.createHash('sha256').update(checkpoint).digest('hex'),
  };
  const suffix = `${process.pid}-${crypto.randomUUID()}.tmp`;
  const checkpointTemporaryPath = `${checkpointPath}.${suffix}`;
  const metadataTemporaryPath = `${metadataPath(checkpointPath)}.${suffix}`;
  await writeFile(checkpointTemporaryPath, checkpoint, { mode: 0o600 });
  await rename(checkpointTemporaryPath, checkpointPath);
  await writeFile(metadataTemporaryPath, JSON.stringify(metadata), { mode: 0o600 });
  await rename(metadataTemporaryPath, metadataPath(checkpointPath));
  return metadata;
}

export function readSynchronizationCheckpointCacheMetadata(
  checkpointPath = configuredCheckpointCachePath(),
): SynchronizationCheckpointCacheMetadata | null {
  try {
    return parseMetadata(readFileSync(metadataPath(checkpointPath), 'utf8'));
  } catch {
    return null;
  }
}

export async function readSynchronizationCheckpointCache(
  checkpointPath = configuredCheckpointCachePath(),
): Promise<{
  checkpoint: Uint8Array;
  metadata: SynchronizationCheckpointCacheMetadata;
} | null> {
  const metadata = readSynchronizationCheckpointCacheMetadata(checkpointPath);
  if (!metadata) return null;
  try {
    const checkpoint = new Uint8Array(await readFile(checkpointPath));
    if (checkpoint.byteLength !== metadata.bytes) return null;
    const sha256 = crypto.createHash('sha256').update(checkpoint).digest('hex');
    if (sha256 !== metadata.sha256) return null;
    return { checkpoint, metadata };
  } catch {
    return null;
  }
}
