import { SucceedEntirely, type FinalizedTxData } from '@midnight-ntwrk/midnight-js-types';

import { safeErrorCauses } from './diagnostics.js';

export interface PreparedSubmissionTransaction {
  identifiers(): readonly unknown[];
  transactionHash(): string;
}

export interface SponsorSubmissionConfirmation {
  transactionId: string;
  transactionHash: string;
  blockHeight: string;
}

export function isReplayProtectionSubmissionError(error: unknown): boolean {
  return safeErrorCauses(error).some(({ message, tag }) => (
    /Custom error:\s*(?:193|244)\b/iu.test(message)
    || /IntentAlreadyExists/iu.test(message)
    || tag === 'ReplayProtectionViolation'
  ));
}

export function summarizeSponsorSubmissionConfirmation(
  transaction: PreparedSubmissionTransaction,
  finalized: Pick<FinalizedTxData, 'status' | 'txId' | 'identifiers' | 'txHash' | 'blockHeight'>,
): SponsorSubmissionConfirmation {
  const identifiers = transaction.identifiers().map(String);
  const transactionId = identifiers.at(-1);
  if (!transactionId) throw new Error('Sponsored transaction has no submission identifier');
  if (finalized.status !== SucceedEntirely) {
    throw new Error(`Sponsored transaction failed on Midnight: ${finalized.status}`);
  }
  if (finalized.txId !== transactionId && !finalized.identifiers.includes(transactionId)) {
    throw new Error('Midnight Indexer returned a different sponsored transaction identifier');
  }
  const transactionHash = transaction.transactionHash();
  if (finalized.txHash !== transactionHash) {
    throw new Error('Midnight Indexer returned a different sponsored transaction hash');
  }
  if (!Number.isSafeInteger(finalized.blockHeight) || finalized.blockHeight < 0) {
    throw new Error('Midnight Indexer returned an invalid sponsored transaction block height');
  }
  return {
    transactionId,
    transactionHash,
    blockHeight: String(finalized.blockHeight),
  };
}
