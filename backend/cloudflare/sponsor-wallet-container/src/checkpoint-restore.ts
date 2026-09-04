const restoreCheckpointUrl = 'http://state.internal/sponsor-checkpoint';
const maxCheckpointBytes = 128 * 1024 * 1024;

export const restoreCheckpointSource = 'state-internal-v1';
export const restoreCheckpointReadHeader = 'restore-v1';

export async function downloadRestoreCheckpoint(options: {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<Uint8Array> {
  const response = await (options.fetcher ?? fetch)(restoreCheckpointUrl, {
    headers: {
      'X-Sponsor-Checkpoint-Operation': restoreCheckpointReadHeader,
    },
    signal: options.signal ?? AbortSignal.timeout(2 * 60_000),
  });
  if (response.status === 404) {
    await response.body?.cancel();
    return new Uint8Array();
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Restore checkpoint download failed with HTTP ${response.status}: ${detail.slice(0, 240)}`,
    );
  }
  const declaredBytes = Number(response.headers.get('Content-Length'));
  if (
    !Number.isSafeInteger(declaredBytes)
    || declaredBytes <= 0
    || declaredBytes > maxCheckpointBytes
  ) {
    await response.body?.cancel();
    throw new Error('Restore checkpoint has an invalid Content-Length');
  }
  const checkpoint = new Uint8Array(await response.arrayBuffer());
  if (checkpoint.byteLength !== declaredBytes) {
    throw new Error('Restore checkpoint size does not match its Content-Length');
  }
  return checkpoint;
}
