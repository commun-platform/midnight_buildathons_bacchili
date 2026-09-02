import assert from 'node:assert/strict';
import test from 'node:test';

import { isTransactionSyncComplete } from './sync-progress.js';

function progress(complete: boolean) {
  return {
    isStrictlyComplete: () => complete,
  };
}

test('transaction readiness requires shielded, unshielded, and DUST synchronization', () => {
  assert.equal(isTransactionSyncComplete({
    shielded: progress(true),
    unshielded: progress(true),
    dust: progress(true),
  }), true);

  for (const incomplete of ['shielded', 'unshielded', 'dust'] as const) {
    assert.equal(isTransactionSyncComplete({
      shielded: progress(incomplete !== 'shielded'),
      unshielded: progress(incomplete !== 'unshielded'),
      dust: progress(incomplete !== 'dust'),
    }), false, `${incomplete} synchronization must not be skipped`);
  }
});
