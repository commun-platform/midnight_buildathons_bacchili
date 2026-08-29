import { diagnosticError, diagnosticLog, sponsorWalletBootId } from './diagnostics.js';

const shutdownCheckpointUrl = 'http://state.internal/sponsor-checkpoint';
const defaultUploadTimeoutMs = 2 * 60_000;

export interface ShutdownCheckpointUploadResult {
  bytes: number;
  durationMs: number;
}

export async function uploadShutdownCheckpoint(
  checkpoint: Uint8Array,
  reason: string,
  options: {
    fetcher?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<ShutdownCheckpointUploadResult> {
  const startedAt = performance.now();
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? defaultUploadTimeoutMs;
  const body = Uint8Array.from(checkpoint).buffer;
  diagnosticLog('sponsor_wallet_shutdown_checkpoint_upload_started', {
    reason,
    bytes: checkpoint.byteLength,
  });
  try {
    const response = await fetcher(shutdownCheckpointUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(checkpoint.byteLength),
        'Content-Type': 'application/octet-stream',
        'X-Sponsor-Boot-Id': sponsorWalletBootId,
        'X-Sponsor-Checkpoint-Reason': reason,
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
    await response.body?.cancel();
    const durationMs = Math.round(performance.now() - startedAt);
    diagnosticLog('sponsor_wallet_shutdown_checkpoint_upload_completed', {
      reason,
      bytes: checkpoint.byteLength,
      durationMs,
    });
    return { bytes: checkpoint.byteLength, durationMs };
  } catch (error) {
    diagnosticLog('sponsor_wallet_shutdown_checkpoint_upload_failed', {
      reason,
      bytes: checkpoint.byteLength,
      durationMs: Math.round(performance.now() - startedAt),
      ...diagnosticError(error),
    }, 'error');
    throw error;
  }
}
