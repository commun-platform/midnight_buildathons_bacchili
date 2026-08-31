import { diagnosticError, diagnosticLog, sponsorWalletBootId } from './diagnostics.js';

const shutdownCheckpointUrl = 'http://state.internal/sponsor-checkpoint';
const defaultUploadTimeoutMs = 2 * 60_000;

export interface CheckpointProgress {
  phase: string;
  shieldedApplied: string;
  unshieldedApplied: string;
  dustApplied: string;
}

export interface ShutdownCheckpointUploadResult {
  bytes: number;
  durationMs: number;
}

export function canPersistSynchronizationCheckpoint(
  initializationStatus: 'not-started' | 'running' | 'succeeded' | 'failed',
  canSerializeState: boolean,
  phase: string,
): boolean {
  return (initializationStatus === 'running' || initializationStatus === 'succeeded')
    && canSerializeState
    && phase === 'syncing';
}

export async function uploadShutdownCheckpoint(
  checkpoint: Uint8Array,
  reason: string,
  options: {
    fetcher?: typeof fetch;
    timeoutMs?: number;
    progress?: CheckpointProgress;
    retryDelayMs?: number;
  } = {},
): Promise<ShutdownCheckpointUploadResult> {
  const startedAt = performance.now();
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? defaultUploadTimeoutMs;
  const body = Uint8Array.from(checkpoint).buffer;
  const uploadKind = reason === 'periodic-sync' ? 'periodic' : 'shutdown';
  diagnosticLog(`sponsor_wallet_${uploadKind}_checkpoint_upload_started`, {
    reason,
    bytes: checkpoint.byteLength,
  });
  try {
    const attempts = reason === 'periodic-sync' ? 3 : 1;
    let response: Response | null = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        response = await fetcher(shutdownCheckpointUrl, {
          method: 'POST',
          headers: {
            'Content-Length': String(checkpoint.byteLength),
            'Content-Type': 'application/octet-stream',
            'X-Sponsor-Boot-Id': sponsorWalletBootId,
            'X-Sponsor-Checkpoint-Reason': reason,
            ...(options.progress ? {
              'X-Sponsor-Checkpoint-Phase': options.progress.phase,
              'X-Sponsor-Checkpoint-Shielded-Applied': options.progress.shieldedApplied,
              'X-Sponsor-Checkpoint-Unshielded-Applied': options.progress.unshieldedApplied,
              'X-Sponsor-Checkpoint-Dust-Applied': options.progress.dustApplied,
            } : {}),
          },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(
            `Shutdown checkpoint upload failed with HTTP ${response.status}: ${detail.slice(0, 240)}`,
          );
        }
        break;
      } catch (error) {
        if (attempt >= attempts) throw error;
        const retryDelayMs = options.retryDelayMs ?? 250 * attempt;
        diagnosticLog('sponsor_wallet_periodic_checkpoint_upload_retrying', {
          reason,
          bytes: checkpoint.byteLength,
          attempt,
          retryDelayMs,
          ...diagnosticError(error),
        }, 'warn');
        if (retryDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }
    if (response === null) throw new Error('Checkpoint upload did not return a response');
    await response.body?.cancel();
    const durationMs = Math.round(performance.now() - startedAt);
    diagnosticLog(`sponsor_wallet_${uploadKind}_checkpoint_upload_completed`, {
      reason,
      bytes: checkpoint.byteLength,
      durationMs,
    });
    return { bytes: checkpoint.byteLength, durationMs };
  } catch (error) {
    diagnosticLog(`sponsor_wallet_${uploadKind}_checkpoint_upload_failed`, {
      reason,
      bytes: checkpoint.byteLength,
      durationMs: Math.round(performance.now() - startedAt),
      ...diagnosticError(error),
    }, 'error');
    throw error;
  }
}
