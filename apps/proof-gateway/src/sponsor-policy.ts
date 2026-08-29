import type { ProofJobRow } from './jobs.js';

// A Sponsor Wallet request may legitimately spend up to 15 minutes waiting on
// its Container subrequest. Keep the recovery horizon beyond the Device's
// 30-minute request timeout so an active preparation is never reclaimed.
const staleSponsorshipMs = 35 * 60_000;

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
  if (status === 'proof_ready' && existingHash === null) return 'accept-new';
  return 'ineligible';
}

export function sponsorWalletCanSubmit(health: SponsorWalletReadiness): boolean {
  if (health.phase !== 'ready') return false;
  if (health.spendableDustCoins !== undefined && health.spendableDustCoins <= 0) return false;
  // Deployments predating the supervisor do not include this field. Once the
  // supervisor is present, only a live Wallet process with a fresh successful
  // probe may authorize a transaction.
  return health.supervisor === undefined || (
    health.supervisor.status === 'healthy'
    && health.supervisor.walletProcessAlive
    && health.supervisor.walletStatusFresh
  );
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
