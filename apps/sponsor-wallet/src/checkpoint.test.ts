import assert from 'node:assert/strict';
import test from 'node:test';

import { decryptCheckpoint, encryptCheckpoint } from './checkpoint.js';

const seed = '11'.repeat(32);

test('encrypts Sponsor Wallet checkpoints and restores the original state', () => {
  const state = { shielded: { cursor: 3 }, unshielded: [1, 2], dust: 'serialized' };
  const encrypted = encryptCheckpoint(seed, state);
  assert.equal(Buffer.from(encrypted).includes(Buffer.from('serialized')), false);
  assert.deepEqual(decryptCheckpoint(seed, encrypted), state);
});

test('rejects a checkpoint encrypted for another Sponsor Wallet', () => {
  const encrypted = encryptCheckpoint(seed, { dust: 'state' });
  assert.throws(() => decryptCheckpoint('22'.repeat(32), encrypted));
});
