import type { ProofJobRow } from './jobs.js';

// A Sponsor Wallet request may legitimately spend up to 15 minutes waiting on
// its Container subrequest. Keep the recovery horizon beyond the Device's
// 30-minute request timeout so an active preparation is never reclaimed.
// Queue consumers have a hard 15-minute wall time. One extra minute avoids
// reclaiming on the boundary while keeping recovery server-owned and prompt.
const staleSponsorshipMs = 16 * 60_000;
// Sponsor Wallet prepares transactions with a 30-minute TTL. Refresh five
// minutes early so queue latency cannot turn a valid retry into an expired one.
const sponsorTransactionRefreshMs = 25 * 60_000;

export interface SponsorWalletReadiness {
  phase: string;
  spendableDustCoins?: number;
  supervisor?: {
    status: 'healthy' | 'degraded' | 'unavailable';
    walletProcessAlive: boolean;
    walletStatusFresh: boolean;
  };
}

export interface SponsorDustReplayState {
  phase: string;
  totalDustCoins?: number;
  pendingDustCoins?: number;
  nightCoins?: {
    total: number;
    registered: number;
    unregistered: number;
  };
  progressDetails?: {
    dust: {
      connected: boolean;
      complete: boolean;
    };
  } | null;
  initialization?: {
    status: string;
  };
  shuttingDown?: boolean;
}

export type DeviceTransactionAcceptance =
  | 'accept-new'
  | 'idempotent-pending'
  | 'idempotent-complete'
  | 'conflict'
  | 'ineligible';

export function deviceTransactionAcceptance(
  status: string,
  existingHash: string | null,
  incomingHash: string,
): DeviceTransactionAcceptance {
  if (existingHash !== null && existingHash !== incomingHash) return 'conflict';
  if (['submitted', 'confirmed'].includes(status)) {
    return existingHash === incomingHash ? 'idempotent-complete' : 'conflict';
  }
  if ([
    'awaiting_sponsor', 'sponsor_retryable', 'sponsoring', 'sponsored',
  ].includes(status)) {
    return existingHash === incomingHash ? 'idempotent-pending' : 'conflict';
  }
  if (['proof_ready', 'reproof_required'].includes(status) && existingHash === null) {
    return 'accept-new';
  }
  return 'ineligible';
}

export function sponsorSubmissionRequiresReproof(message: string): boolean {
  // A stale contract-state transaction cannot become valid by resending the
  // same bytes; the Device must rebuild it against current contract state.
  // MalformedError::TransactionApplicationError to Custom error 182. A
  // textual variant is retained for node responses that expose the enum name.
  return /(?:Custom error:\s*182\b|Malformed\(TransactionApplicationError\))/iu.test(message);
}

export function sponsorSubmissionIsReplayProtectionViolation(message: string): boolean {
  // The first submission can reach the chain even when a later submission
  // attempt reports replay protection. This signal alone is never success;
  // the queue must reconcile exact transaction evidence with the Indexer.
  return /(?:Custom error:\s*193\b|ReplayProtectionViolation)/iu.test(message);
}

export function sponsorWalletIsSynchronized(health: SponsorWalletReadiness): boolean {
  if (health.phase !== 'ready') return false;
  // Deployments predating the supervisor do not include this field. Once the
  // supervisor is present, only a live Wallet process with a fresh successful
  // probe may authorize any server-wallet work.
  return health.supervisor === undefined || (
    health.supervisor.status === 'healthy'
    && health.supervisor.walletProcessAlive
    && health.supervisor.walletStatusFresh
  );
}

export function sponsorWalletCanSubmit(health: SponsorWalletReadiness): boolean {
  if (!sponsorWalletIsSynchronized(health)) return false;
  if (health.spendableDustCoins !== undefined && health.spendableDustCoins <= 0) return false;
  return true;
}

export function sponsorJobCanProceed(
  status: string,
  health: SponsorWalletReadiness,
): boolean {
  if (!sponsorWalletIsSynchronized(health)) return false;
  // A prepared transaction already owns its DUST input. It must be submitted
  // or released even when no additional DUST is currently spendable; otherwise
  // that reservation permanently prevents Wallet recovery. Synchronization and
  // supervisor readiness remain mandatory before touching the prepared bytes.
  return status === 'sponsored' || sponsorWalletCanSubmit(health);
}

export function shouldReplaySponsorDustState(
  health: SponsorDustReplayState,
  activeReservations: number,
): boolean {
  return activeReservations === 0
    && health.initialization?.status === 'succeeded'
    && health.shuttingDown !== true
    && ['syncing', 'error'].includes(health.phase)
    && health.progressDetails?.dust.connected === true
    && health.progressDetails.dust.complete === true
    && health.nightCoins !== undefined
    && health.nightCoins.total > 0
    && health.nightCoins.registered === health.nightCoins.total
    && health.nightCoins.unregistered === 0
    && health.totalDustCoins === 0
    && health.pendingDustCoins === 0;
}

export function canRecoverStaleSponsoringRequest(job: ProofJobRow, nowMs = Date.now()): boolean {
  const updatedAt = Date.parse(job.updated_at);
  const staleInProgress = job.status === 'sponsoring'
    && Number.isFinite(updatedAt)
    && updatedAt <= nowMs - staleSponsorshipMs;
  return staleInProgress
    && job.device_transaction_hash !== null
    && job.device_transaction_bytes !== null
    && job.sponsor_transaction_object_key === null
    && job.sponsor_serialized_sha256 === null
    && job.sponsor_transaction_id === null
    && job.sponsor_fee_specks === null
    && job.sponsor_transaction_bytes === null
    && job.sponsorship_completed_at === null
    && job.attest_tx_id === null
    && job.attest_tx_hash === null
    && job.block_height === null;
}

export function sponsorTransactionNeedsRefresh(
  uploadedAt: Date,
  nowMs = Date.now(),
): boolean {
  const uploadedAtMs = uploadedAt.getTime();
  return Number.isFinite(uploadedAtMs)
    && uploadedAtMs <= nowMs - sponsorTransactionRefreshMs;
}
