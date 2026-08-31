import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeSponsoredTransactionConfirmation } from './midnight.js';

const expectedTxId = '11'.repeat(32);
const expectedTxHash = '22'.repeat(32);

function finalized(overrides: Record<string, unknown> = {}) {
  return {
    status: 'SucceedEntirely' as const,
    txId: expectedTxId,
    identifiers: [expectedTxId],
    txHash: expectedTxHash,
    blockHeight: 2_315_165,
    ...overrides,
  };
}

test('records a successful sponsored transaction with its real block height', () => {
  assert.deepEqual(
    summarizeSponsoredTransactionConfirmation(expectedTxId, expectedTxHash, finalized()),
    {
      txId: expectedTxId,
      txHash: expectedTxHash,
      blockHeight: '2315165',
    },
  );
});

test('accepts the requested transaction identifier in the finalized identifier list', () => {
  assert.equal(
    summarizeSponsoredTransactionConfirmation(
      expectedTxId,
      expectedTxHash,
      finalized({ txId: '33'.repeat(32), identifiers: ['33'.repeat(32), expectedTxId] }),
    ).txId,
    expectedTxId,
  );
});

test('rejects failed, mismatched, and malformed Midnight confirmations', () => {
  assert.throws(
    () => summarizeSponsoredTransactionConfirmation(
      expectedTxId,
      expectedTxHash,
      finalized({ status: 'FailEntirely' }),
    ),
    /failed on Midnight/u,
  );
  assert.throws(
    () => summarizeSponsoredTransactionConfirmation(
      expectedTxId,
      expectedTxHash,
      finalized({ txId: '33'.repeat(32), identifiers: ['33'.repeat(32)] }),
    ),
    /different sponsored transaction identifier/u,
  );
  assert.throws(
    () => summarizeSponsoredTransactionConfirmation(
      expectedTxId,
      expectedTxHash,
      finalized({ txHash: '44'.repeat(32) }),
    ),
    /different sponsored transaction hash/u,
  );
  assert.throws(
    () => summarizeSponsoredTransactionConfirmation(
      expectedTxId,
      expectedTxHash,
      finalized({ blockHeight: -1 }),
    ),
    /invalid sponsored transaction block height/u,
  );
});
