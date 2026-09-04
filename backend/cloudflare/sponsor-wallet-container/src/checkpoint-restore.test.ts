import assert from 'node:assert/strict';
import test from 'node:test';

import {
  downloadRestoreCheckpoint,
  restoreCheckpointReadHeader,
} from './checkpoint-restore.js';

test('downloads the restore checkpoint through the internal state endpoint', async () => {
  const expected = new Uint8Array([1, 2, 3, 4]);
  let sent: Request | undefined;
  const checkpoint = await downloadRestoreCheckpoint({
    fetcher: async (input, init) => {
      sent = new Request(input, init);
      return new Response(expected, {
        headers: {
          'Content-Length': String(expected.byteLength),
          'Content-Type': 'application/octet-stream',
        },
      });
    },
  });

  assert.ok(sent);
  assert.equal(sent.url, 'http://state.internal/sponsor-checkpoint');
  assert.equal(sent.method, 'GET');
  assert.equal(
    sent.headers.get('X-Sponsor-Checkpoint-Operation'),
    restoreCheckpointReadHeader,
  );
  assert.deepEqual(checkpoint, expected);
});

test('uses fresh Wallet state when no restore checkpoint exists', async () => {
  const checkpoint = await downloadRestoreCheckpoint({
    fetcher: async () => new Response(null, { status: 404 }),
  });
  assert.equal(checkpoint.byteLength, 0);
});

test('rejects a truncated restore checkpoint', async () => {
  await assert.rejects(
    downloadRestoreCheckpoint({
      fetcher: async () => new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Length': '4' },
      }),
    }),
    /does not match/u,
  );
});
