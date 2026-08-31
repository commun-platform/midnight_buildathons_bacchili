const transactionQuery = `
  query SponsorTransaction($offset: TransactionOffset!) {
    transactions(offset: $offset) {
      hash
      block {
        height
      }
      ... on RegularTransaction {
        identifiers
        transactionResult {
          status
        }
      }
    }
  }
`;

const indexerUrls = {
  preview: 'https://indexer.preview.midnight.network/api/v4/graphql',
  preprod: 'https://indexer.preprod.midnight.network/api/v4/graphql',
} as const;

interface TransactionQueryResponse {
  data?: {
    transactions?: unknown;
  } | null;
  errors?: unknown;
}

export interface ReconciledSponsorTransaction {
  transactionId: string;
  transactionHash: string;
  blockHeight: number;
}

function normalizedNetwork(value: string | undefined): keyof typeof indexerUrls | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (normalized === 'preview' || normalized === 'midnight preview') return 'preview';
  if (normalized === 'preprod' || normalized === 'midnight preprod') return 'preprod';
  return null;
}

function normalizedHex(value: string, bytes: number, name: string): string {
  const normalized = value.trim().replace(/^0x/iu, '').toLowerCase();
  if (!new RegExp(`^[\\da-f]{${bytes * 2}}$`, 'u').test(normalized)) {
    throw new Error(`${name} must be a ${bytes}-byte hexadecimal value`);
  }
  return normalized;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function reconcileReplayProtectedSponsorTransaction(
  input: {
    network: string | undefined;
    transactionId: string;
    transactionHash: string;
  },
  fetchImplementation: typeof fetch = fetch,
): Promise<ReconciledSponsorTransaction | null> {
  const network = normalizedNetwork(input.network);
  if (!network) throw new Error('Sponsor reconciliation network is not configured');
  // Midnight RegularTransaction identifiers include a one-byte identifier
  // type before the 32-byte digest. Transaction hashes are the digest alone.
  const transactionId = normalizedHex(input.transactionId, 33, 'Sponsor transaction ID');
  const expectedHash = normalizedHex(input.transactionHash, 32, 'Sponsor transaction hash');
  const response = await fetchImplementation(indexerUrls[network], {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: transactionQuery,
      variables: {
        offset: { identifier: transactionId },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Midnight Indexer reconciliation returned HTTP ${response.status}`);
  }
  const payload = await response.json() as TransactionQueryResponse;
  if (payload.errors !== undefined) {
    throw new Error('Midnight Indexer reconciliation returned GraphQL errors');
  }
  const transactions = payload.data?.transactions;
  if (!Array.isArray(transactions)) {
    throw new Error('Midnight Indexer reconciliation returned an invalid transaction list');
  }
  if (transactions.length === 0) return null;
  if (transactions.length !== 1) {
    throw new Error('Midnight Indexer reconciliation returned multiple transactions');
  }
  const transaction = objectValue(transactions[0]);
  const block = objectValue(transaction?.block);
  const transactionResult = objectValue(transaction?.transactionResult);
  const identifiers = transaction?.identifiers;
  if (
    !transaction
    || typeof transaction.hash !== 'string'
    || !Array.isArray(identifiers)
    || !identifiers.every((value) => typeof value === 'string')
    || !block
    || !transactionResult
  ) {
    throw new Error('Midnight Indexer reconciliation returned an invalid transaction');
  }
  if (!identifiers.map((value) => value.toLowerCase()).includes(transactionId)) {
    throw new Error('Midnight Indexer reconciliation returned a different transaction identifier');
  }
  const transactionHash = normalizedHex(transaction.hash, 32, 'Indexer transaction hash');
  if (transactionHash !== expectedHash) {
    throw new Error('Midnight Indexer reconciliation returned a different transaction hash');
  }
  if (transactionResult.status !== 'SUCCESS') {
    throw new Error('Midnight Indexer reconciliation found an unsuccessful transaction');
  }
  if (!Number.isSafeInteger(block.height) || (block.height as number) < 0) {
    throw new Error('Midnight Indexer reconciliation returned an invalid block height');
  }
  return {
    transactionId,
    transactionHash,
    blockHeight: block.height as number,
  };
}
