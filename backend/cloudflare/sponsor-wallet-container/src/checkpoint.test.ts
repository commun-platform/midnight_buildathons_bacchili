import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decryptCheckpoint,
  encryptCheckpoint,
  selectCheckpointState,
} from './checkpoint.js';

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

test('creates a DUST replay checkpoint without discarding chain cursors', () => {
  const state = {
    shielded: { cursor: 1_466_842 },
    unshielded: { cursor: 577_250 },
    dust: 'reserved-dust-state',
  };
  assert.deepEqual(selectCheckpointState(state, 'without-dust'), {
    shielded: state.shielded,
    unshielded: state.unshielded,
  });
  assert.equal(selectCheckpointState(state, null), state);
  assert.throws(() => selectCheckpointState(state, 'unknown'), /Unknown checkpoint mode/);
});
