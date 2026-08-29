import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSponsorSyncProgress,
  isSponsorBaseSyncComplete,
  sponsorSyncProgressDetails,
} from './sync-progress.js';

function progress(complete: boolean, connected = true) {
  return {
    appliedIndex: complete ? 12n : 5n,
    highestRelevantWalletIndex: 12n,
    isConnected: connected,
    isStrictlyComplete: () => complete,
  };
}

test('base synchronization requires shielded and unshielded completion', () => {
  assert.equal(isSponsorBaseSyncComplete({
    shielded: progress(true),
    unshielded: progress(true),
  }), true);
  assert.equal(isSponsorBaseSyncComplete({
    shielded: progress(true),
    unshielded: progress(false),
  }), false);
});

test('formats connection, completion, and replay position for monitoring', () => {
  assert.equal(
    formatSponsorSyncProgress(progress(false, false)),
    'disconnected, syncing (5/12)',
  );
  assert.deepEqual(sponsorSyncProgressDetails(progress(false, false)), {
    applied: '5',
    highest: '12',
    connected: false,
    complete: false,
  });
});
