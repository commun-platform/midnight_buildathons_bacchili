import assert from 'node:assert/strict';
import test from 'node:test';

import { SucceedEntirely } from '@midnight-ntwrk/midnight-js-types';

import {
  isReplayProtectionSubmissionError,
  summarizeSponsorSubmissionConfirmation,
} from './submission-confirmation.js';

const transactionId = '00'.repeat(32);
const transactionHash = '11'.repeat(32);
const transaction = {
  identifiers: () => ['22'.repeat(32), transactionId],
  transactionHash: () => transactionHash,
};

test('recognizes legacy and current duplicate-intent replay errors', () => {
  assert.equal(isReplayProtectionSubmissionError(Object.assign(
    new Error('Transaction submission error'),
    {
      cause: Object.assign(new Error('1010: Invalid Transaction: Custom error: 193'), {
        _tag: 'SubmissionError',
      }),
    },
  )), true);
  assert.equal(isReplayProtectionSubmissionError(
    new Error('ReplayProtectionViolation.IntentAlreadyExists'),
  ), true);
  assert.equal(isReplayProtectionSubmissionError(
    new Error('1010: Invalid Transaction: Custom error: 244'),
  ), true);
  assert.equal(isReplayProtectionSubmissionError(
    new Error('1010: Invalid Transaction: Custom error: 242'),
  ), false);
  assert.equal(isReplayProtectionSubmissionError(
    new Error('1010: Invalid Transaction: Custom error: 171'),
  ), false);
});

test('accepts replay recovery only for the exact finalized transaction', () => {
  assert.deepEqual(summarizeSponsorSubmissionConfirmation(transaction, {
    status: SucceedEntirely,
    txId: transactionId,
    identifiers: [transactionId],
    txHash: transactionHash,
    blockHeight: 2_332_070,
  }), {
    transactionId,
    transactionHash,
    blockHeight: '2332070',
  });
});

test('rejects a replay recovery result with another hash or failed status', () => {
  assert.throws(() => summarizeSponsorSubmissionConfirmation(transaction, {
    status: SucceedEntirely,
    txId: transactionId,
    identifiers: [transactionId],
    txHash: '33'.repeat(32),
    blockHeight: 2_332_070,
  }), /different sponsored transaction hash/u);
  assert.throws(() => summarizeSponsorSubmissionConfirmation(transaction, {
    status: 'FailEntirely' as never,
    txId: transactionId,
    identifiers: [transactionId],
    txHash: transactionHash,
    blockHeight: 2_332_070,
  }), /failed on Midnight/u);
});
