export interface SyncProgressLike {
  appliedIndex?: bigint;
  highestIndex?: bigint;
  appliedId?: bigint;
  highestTransactionId?: bigint;
  highestRelevantWalletIndex?: bigint;
  isConnected?: boolean;
  isStrictlyComplete(): boolean;
}

export interface SponsorSyncProgressDetails {
  applied: string;
  highest: string;
  connected: boolean;
  complete: boolean;
}

export function isSponsorBaseSyncComplete(progress: {
  shielded: SyncProgressLike;
  unshielded: SyncProgressLike;
}): boolean {
  return progress.shielded.isStrictlyComplete() && progress.unshielded.isStrictlyComplete();
}

/**
 * The fee-only Sponsor path never balances or transfers Shielded assets. It
 * still needs a complete Unshielded view because tNIGHT UTXOs are the source
 * of DUST generation and registration.
 */
export function isSponsorDustOnlyBaseSyncComplete(progress: {
  unshielded: SyncProgressLike;
}): boolean {
  return progress.unshielded.isStrictlyComplete();
}

/**
 * A prepared fee-only transaction can be submitted once the Unshielded and
 * DUST views are complete. Shielded progress remains observable but is not a
 * dependency of this transaction shape.
 */
export function isSponsorDustOnlyTransactionSyncComplete(progress: {
  unshielded: SyncProgressLike;
  dust: SyncProgressLike;
}): boolean {
  return progress.unshielded.isStrictlyComplete() && progress.dust.isStrictlyComplete();
}

export function formatSponsorSyncProgress(value: SyncProgressLike): string {
  const details = sponsorSyncProgressDetails(value);
  const connection = details.connected ? 'connected' : 'disconnected';
  const completion = details.complete ? 'complete' : 'syncing';
  return `${connection}, ${completion} (${details.applied}/${details.highest})`;
}

export function sponsorSyncProgressDetails(
  value: SyncProgressLike,
): SponsorSyncProgressDetails {
  let applied: bigint;
  let highest: bigint;
  if (value.appliedIndex !== undefined && value.highestIndex !== undefined) {
    applied = value.appliedIndex;
    highest = value.highestIndex;
  } else if (value.appliedId !== undefined && value.highestTransactionId !== undefined) {
    applied = value.appliedId;
    highest = value.highestTransactionId;
  } else {
    applied = value.appliedIndex ?? 0n;
    highest = value.highestRelevantWalletIndex ?? 0n;
  }
  return {
    applied: applied.toString(),
    highest: highest.toString(),
    connected: value.isConnected === true,
    complete: value.isStrictlyComplete(),
  };
}
