import { describe, expect, it, vi } from 'vitest';

import { reconcileReplayProtectedSponsorTransaction } from './sponsor-reconciliation.js';

const transactionId = `00${'11'.repeat(32)}`;
const transactionHash = 'ab'.repeat(32);

function indexerResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    data: {
      transactions: [{
        hash: transactionHash,
        identifiers: [`01${'cd'.repeat(32)}`, transactionId],
        transactionResult: { status: 'SUCCESS' },
        block: { height: 2_332_070 },
        ...overrides,
      }],
    },
  });
}

describe('Sponsor replay reconciliation', () => {
  it('accepts exact successful Indexer evidence and uses a parameterized lookup', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        query: string;
        variables: { offset: { identifier: string } };
      };
      expect(body.query).toContain('... on RegularTransaction');
      expect(body.variables.offset.identifier).toBe(transactionId);
      return indexerResponse();
    });

    await expect(reconcileReplayProtectedSponsorTransaction({
      network: 'Midnight Preprod',
      transactionId,
      transactionHash,
    }, fetchImplementation)).resolves.toEqual({
      transactionId,
      transactionHash,
      blockHeight: 2_332_070,
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://indexer.preprod.midnight.network/api/v4/graphql',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns null while the exact transaction is not indexed', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => Response.json({
      data: { transactions: [] },
    }));
    await expect(reconcileReplayProtectedSponsorTransaction({
      network: 'preprod',
      transactionId,
      transactionHash,
    }, fetchImplementation)).resolves.toBeNull();
  });

  it.each([
    ['different hash', { hash: 'ef'.repeat(32) }, /different transaction hash/u],
    ['different identifier', { identifiers: [`01${'cd'.repeat(32)}`] }, /different transaction identifier/u],
    ['failed result', { transactionResult: { status: 'FAILURE' } }, /unsuccessful transaction/u],
    ['invalid height', { block: { height: -1 } }, /invalid block height/u],
  ])('rejects %s', async (_name, overrides, expected) => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => indexerResponse(overrides));
    await expect(reconcileReplayProtectedSponsorTransaction({
      network: 'preprod',
      transactionId,
      transactionHash,
    }, fetchImplementation)).rejects.toThrow(expected);
  });

  it('rejects an unsupported network and GraphQL errors', async () => {
    await expect(reconcileReplayProtectedSponsorTransaction({
      network: 'unknown',
      transactionId,
      transactionHash,
    })).rejects.toThrow(/network is not configured/u);

    const fetchImplementation = vi.fn<typeof fetch>(async () => Response.json({
      errors: [{ message: 'unavailable' }],
    }));
    await expect(reconcileReplayProtectedSponsorTransaction({
      network: 'preprod',
      transactionId,
      transactionHash,
    }, fetchImplementation)).rejects.toThrow(/GraphQL errors/u);
  });
});
