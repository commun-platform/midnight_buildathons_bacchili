import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSponsorSyncProgress,
  isSponsorBaseSyncComplete,
  isSponsorDustOnlyBaseSyncComplete,
  isSponsorDustOnlyTransactionSyncComplete,
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

test('DUST-only Sponsor base synchronization does not require Shielded completion', () => {
  assert.equal(isSponsorDustOnlyBaseSyncComplete({
    unshielded: progress(true),
  }), true);
  assert.equal(isSponsorDustOnlyBaseSyncComplete({
    unshielded: progress(false),
  }), false);
});

test('DUST-only prepared submission requires Unshielded and DUST completion', () => {
  assert.equal(isSponsorDustOnlyTransactionSyncComplete({
    unshielded: progress(true),
    dust: progress(true),
  }), true);
  assert.equal(isSponsorDustOnlyTransactionSyncComplete({
    unshielded: progress(true),
    dust: progress(false),
  }), false);
  assert.equal(isSponsorDustOnlyTransactionSyncComplete({
    unshielded: progress(false),
    dust: progress(true),
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
