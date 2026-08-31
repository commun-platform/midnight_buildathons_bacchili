import { SucceedEntirely, type FinalizedTxData } from '@midnight-ntwrk/midnight-js-types';

export interface BrowserSponsoredTransactionConfirmation {
  transactionId: string;
  transactionHash: string;
  blockHeight: string;
}

export function summarizeBrowserSponsoredTransactionConfirmation(
  expectedTransactionId: string,
  expectedTransactionHash: string,
  finalized: Pick<FinalizedTxData, 'status' | 'txId' | 'identifiers' | 'txHash' | 'blockHeight'>,
): BrowserSponsoredTransactionConfirmation {
  if (finalized.status !== SucceedEntirely) {
    throw new Error(`Sponsored transaction failed on Midnight: ${finalized.status}`);
  }
  if (
    finalized.txId !== expectedTransactionId
    && !finalized.identifiers.includes(expectedTransactionId)
  ) {
    throw new Error('Midnight Indexer returned a different sponsored transaction identifier');
  }
  if (finalized.txHash !== expectedTransactionHash) {
    throw new Error('Midnight Indexer returned a different sponsored transaction hash');
  }
  if (!Number.isSafeInteger(finalized.blockHeight) || finalized.blockHeight < 0) {
    throw new Error('Midnight Indexer returned an invalid sponsored transaction block height');
  }
  return {
    transactionId: expectedTransactionId,
    transactionHash: finalized.txHash,
    blockHeight: String(finalized.blockHeight),
  };
}
