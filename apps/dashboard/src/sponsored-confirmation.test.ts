import { SucceedEntirely } from '@midnight-ntwrk/midnight-js-types';
import { describe, expect, it } from 'vitest';

import { summarizeBrowserSponsoredTransactionConfirmation } from './sponsored-confirmation.js';

const expectedTransactionId = '11'.repeat(32);
const expectedTransactionHash = '22'.repeat(32);

function finalized(overrides: Record<string, unknown> = {}) {
  return {
    status: SucceedEntirely,
    txId: expectedTransactionId,
    identifiers: [expectedTransactionId],
    txHash: expectedTransactionHash,
    blockHeight: 2_317_466,
    ...overrides,
  } as Parameters<typeof summarizeBrowserSponsoredTransactionConfirmation>[2];
}

describe('Browser sponsored transaction confirmation', () => {
  it('returns numeric Midnight confirmation evidence', () => {
    expect(summarizeBrowserSponsoredTransactionConfirmation(
      expectedTransactionId,
      expectedTransactionHash,
      finalized(),
    )).toEqual({
      transactionId: expectedTransactionId,
      transactionHash: expectedTransactionHash,
      blockHeight: '2317466',
    });
  });

  it('rejects mismatched or invalid confirmation evidence', () => {
    expect(() => summarizeBrowserSponsoredTransactionConfirmation(
      expectedTransactionId,
      expectedTransactionHash,
      finalized({ txHash: '33'.repeat(32) }),
    )).toThrow('different sponsored transaction hash');
    expect(() => summarizeBrowserSponsoredTransactionConfirmation(
      expectedTransactionId,
      expectedTransactionHash,
      finalized({ blockHeight: -1 }),
    )).toThrow('invalid sponsored transaction block height');
    expect(() => summarizeBrowserSponsoredTransactionConfirmation(
      expectedTransactionId,
      expectedTransactionHash,
      finalized({ txId: '44'.repeat(32), identifiers: [] }),
    )).toThrow('different sponsored transaction identifier');
  });
});
