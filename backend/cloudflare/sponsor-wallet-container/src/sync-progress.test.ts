import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSponsorSyncProgress,
  isSponsorBaseSyncComplete,
  isSponsorDustOnlyBaseSyncComplete,
  isSponsorDustReplayComplete,
  isSponsorDustOnlyTransactionSyncComplete,
  sponsorSyncProgressDetails,
} from './sync-progress.js';

test('DUST readiness uses the received event tip rather than wall-clock age or highestIndex', () => {
  const caughtUp = { appliedIndex: 15n, highestIndex: 0n,
    highestRelevantWalletIndex: 15n, isConnected: true, isStrictlyComplete: () => false };
  assert.equal(isSponsorDustReplayComplete(caughtUp), true);
  assert.equal(isSponsorDustReplayComplete({ ...caughtUp, appliedIndex: 14n }), false);
  assert.equal(isSponsorDustReplayComplete({ ...caughtUp, isConnected: false }), false);
  assert.equal(isSponsorDustReplayComplete({ ...caughtUp, highestRelevantWalletIndex: 0n }), false);
  assert.equal(isSponsorDustReplayComplete({ ...caughtUp, highestRelevantWalletIndex: undefined }), false);
});

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

test('DUST-only prepared submission requires Unshielded completion and a connected DUST channel', () => {
  assert.equal(isSponsorDustOnlyTransactionSyncComplete({
    unshielded: progress(true),
    dust: progress(false),
  }), true);
  assert.equal(isSponsorDustOnlyTransactionSyncComplete({
    unshielded: progress(true),
    dust: progress(false, false),
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

test('reports the DUST event tip instead of a misleading zero lag', () => {
  const details = sponsorSyncProgressDetails({
    appliedIndex: 100n, highestIndex: 0n, highestRelevantWalletIndex: 150n,
    isConnected: true, isStrictlyComplete: () => false,
  });
  assert.equal(details.applied, '100');
  assert.equal(details.highest, '150');
  assert.equal(details.complete, false);
});
