import assert from 'node:assert/strict';
import test from 'node:test';

import { uploadShutdownCheckpoint } from './checkpoint-upload.js';

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
