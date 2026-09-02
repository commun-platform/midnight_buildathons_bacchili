export interface TransactionSyncProgressLike {
  isStrictlyComplete(): boolean;
}

export function isTransactionSyncComplete(progress: {
  shielded: TransactionSyncProgressLike;
  unshielded: TransactionSyncProgressLike;
  dust: TransactionSyncProgressLike;
}): boolean {
  return progress.shielded.isStrictlyComplete()
    && progress.unshielded.isStrictlyComplete()
    && progress.dust.isStrictlyComplete();
}
