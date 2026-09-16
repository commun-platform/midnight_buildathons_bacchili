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

export function isSponsorDustReplayComplete(progress: SyncProgressLike): boolean {
  // DUST subscriptions report maxId as highestRelevantWalletIndex, not
  // highestIndex. Ledger syncTime is an event time, not a heartbeat: an idle
  // stream can be fully caught up even when its last event is hours old.
  const tip = progress.highestRelevantWalletIndex;
  return progress.isConnected === true
    && tip !== undefined && tip > 0n
    && progress.appliedIndex !== undefined && progress.appliedIndex >= tip;
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
 * A prepared fee-only transaction has already been balanced and finalized.
 * Submission therefore must not wait for a second DUST replay to report a
 * finite highest position: some DUST streams expose an indeterminate highest
 * position (`highest=0`) while still being connected and serving spendable
 * coins. The prepared transaction owns its DUST input, so Unshielded
 * completion plus a live DUST channel is the sufficient submission gate.
 */
export function isSponsorDustOnlyTransactionSyncComplete(progress: {
  unshielded: SyncProgressLike;
  dust: SyncProgressLike;
}): boolean {
  return progress.unshielded.isStrictlyComplete() && progress.dust.isConnected === true;
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
    highest = value.highestIndex > 0n
      ? value.highestIndex : value.highestRelevantWalletIndex ?? 0n;
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
