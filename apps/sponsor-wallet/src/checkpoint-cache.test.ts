import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  readSynchronizationCheckpointCache,
  readSynchronizationCheckpointCacheMetadata,
  nextSynchronizationCheckpointDelayMs,
  writeSynchronizationCheckpointCache,
} from './checkpoint-cache.js';

test('backs off expensive synchronization checkpoints while keeping an upper bound', () => {
  assert.equal(nextSynchronizationCheckpointDelayMs(500), 60_000);
  assert.equal(nextSynchronizationCheckpointDelayMs(36_920), 300_000);
  assert.equal(nextSynchronizationCheckpointDelayMs(Number.NaN), 300_000);
});

test('atomically shares synchronization checkpoints with the health supervisor', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vsp-checkpoint-cache-'));
  const checkpointPath = path.join(directory, 'checkpoint.enc');
  try {
    const metadata = await writeSynchronizationCheckpointCache(
      new Uint8Array([4, 2, 4, 2]),
      {
        shieldedApplied: '1467150',
        unshieldedApplied: '577250',
        dustApplied: '623456',
      },
      checkpointPath,
    );
    assert.equal(metadata.dustApplied, '623456');
    assert.equal(metadata.sha256, '487163294f7ba7e74c2ad0dabafc3402baf903c6074080db1103b7d59540c6df');
    assert.equal(readSynchronizationCheckpointCacheMetadata(checkpointPath)?.bytes, 4);
    assert.deepEqual(
      (await readSynchronizationCheckpointCache(checkpointPath))?.checkpoint,
      new Uint8Array([4, 2, 4, 2]),
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('treats a missing synchronization checkpoint cache as unavailable', async () => {
  const checkpointPath = path.join(os.tmpdir(), `vsp-missing-${crypto.randomUUID()}.enc`);
  assert.equal(readSynchronizationCheckpointCacheMetadata(checkpointPath), null);
  assert.equal(await readSynchronizationCheckpointCache(checkpointPath), null);
});

test('does not serve checkpoint bytes that do not match their metadata', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vsp-checkpoint-cache-'));
  const checkpointPath = path.join(directory, 'checkpoint.enc');
  try {
    await writeSynchronizationCheckpointCache(
      new Uint8Array([4, 2, 4, 2]),
      {
        shieldedApplied: '1467150',
        unshieldedApplied: '577250',
        dustApplied: '623456',
      },
      checkpointPath,
    );
    await writeFile(checkpointPath, new Uint8Array([2, 4, 2, 4]));
    assert.equal(await readSynchronizationCheckpointCache(checkpointPath), null);
  } finally {
    await rm(directory, { recursive: true });
  }
});
