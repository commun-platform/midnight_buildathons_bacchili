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
