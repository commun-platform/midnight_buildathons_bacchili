import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canPersistSynchronizationCheckpoint,
  uploadShutdownCheckpoint,
} from './checkpoint-upload.js';

test('allows periodic checkpoints while the wallet SDK is still synchronizing', () => {
  assert.equal(canPersistSynchronizationCheckpoint('running', true, 'syncing'), true);
  assert.equal(canPersistSynchronizationCheckpoint('succeeded', true, 'syncing'), true);
  assert.equal(canPersistSynchronizationCheckpoint('not-started', true, 'syncing'), false);
  assert.equal(canPersistSynchronizationCheckpoint('failed', true, 'syncing'), false);
  assert.equal(canPersistSynchronizationCheckpoint('running', false, 'syncing'), false);
  assert.equal(canPersistSynchronizationCheckpoint('running', true, 'ready'), false);
});

test('uploads an encrypted shutdown checkpoint only to the internal state endpoint', async () => {
  const checkpoint = new Uint8Array([1, 2, 3, 4]);
  const captured: Request[] = [];
  const result = await uploadShutdownCheckpoint(checkpoint, 'SIGTERM', {
    fetcher: async (input, init) => {
      captured.push(new Request(input, init));
      return new Response(null, { status: 204 });
    },
    timeoutMs: 1_000,
  });

  const sent = captured[0];
  assert.ok(sent);
  assert.equal(sent.url, 'http://state.internal/sponsor-checkpoint');
  assert.equal(sent.method, 'POST');
  assert.equal(sent.headers.get('Content-Type'), 'application/octet-stream');
  assert.equal(sent.headers.get('X-Sponsor-Checkpoint-Reason'), 'SIGTERM');
  assert.deepEqual(new Uint8Array(await sent.arrayBuffer()), checkpoint);
  assert.equal(result.bytes, checkpoint.byteLength);
});

test('rejects a failed internal checkpoint upload', async () => {
  await assert.rejects(
    uploadShutdownCheckpoint(new Uint8Array([1]), 'SIGTERM', {
      fetcher: async () => new Response('rejected', { status: 503 }),
      timeoutMs: 1_000,
    }),
    /HTTP 503/u,
  );
});

test('includes synchronization progress in a periodic checkpoint upload', async () => {
  let sent: Request | undefined;
  await uploadShutdownCheckpoint(new Uint8Array([7, 8, 9]), 'periodic-sync', {
    fetcher: async (input, init) => {
      sent = new Request(input, init);
      return new Response(null, { status: 204 });
    },
    progress: {
      phase: 'syncing',
      shieldedApplied: '1466979',
      unshieldedApplied: '577250',
      dustApplied: '463779',
    },
    timeoutMs: 1_000,
  });

  assert.ok(sent);
  assert.equal(sent.headers.get('X-Sponsor-Checkpoint-Reason'), 'periodic-sync');
  assert.equal(sent.headers.get('X-Sponsor-Checkpoint-Phase'), 'syncing');
  assert.equal(sent.headers.get('X-Sponsor-Checkpoint-Dust-Applied'), '463779');
});

test('retries a transient periodic checkpoint upload without changing the checkpoint', async () => {
  let attempts = 0;
  const bodies: Uint8Array[] = [];
  await uploadShutdownCheckpoint(new Uint8Array([7, 8, 9]), 'periodic-sync', {
    retryDelayMs: 0,
    fetcher: async (_input, init) => {
      attempts += 1;
      bodies.push(new Uint8Array(init?.body as ArrayBuffer));
      if (attempts === 1) throw new TypeError('fetch failed');
      return new Response(null, { status: 204 });
    },
  });
  assert.equal(attempts, 2);
  assert.deepEqual(bodies, [new Uint8Array([7, 8, 9]), new Uint8Array([7, 8, 9])]);
});
