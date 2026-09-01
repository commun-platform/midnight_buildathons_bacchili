import type { SqlDatabase } from './storage/sql.js';

export const specksPerDust = 1_000_000_000_000_000n;

export interface SponsorFeeRecord {
  proofJobId: string;
  specks: string;
  recordedAt: string;
}

interface SponsorFeeRow {
  proof_job_id: string;
  sponsor_fee_specks: string;
  sponsorship_completed_at: string;
}

export interface SponsorDustFunds {
  remainingSpecks: string | null;
  remainingDust: string | null;
  latestFee: (SponsorFeeRecord & { dust: string }) | null;
  estimatedTransactionsRemaining: string | null;
}

function parseSpecks(value: string | null | undefined): bigint | null {
  if (!value || !/^(?:0|[1-9]\d{0,79})$/u.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export function formatDustSpecks(value: string | null | undefined): string | null {
  const specks = parseSpecks(value);
  if (specks === null) return null;
  return `${specks / specksPerDust}.${(specks % specksPerDust)
    .toString()
    .padStart(15, '0')}`;
}

export function sponsorDustFunds(
  remainingSpecks: string | null | undefined,
  latestFee: SponsorFeeRecord | null,
): SponsorDustFunds {
  const remaining = parseSpecks(remainingSpecks);
  const fee = parseSpecks(latestFee?.specks);
  return {
    remainingSpecks: remaining?.toString() ?? null,
    remainingDust: remaining === null ? null : formatDustSpecks(remaining.toString()),
    latestFee: latestFee && fee !== null && fee > 0n
      ? {
          ...latestFee,
          specks: fee.toString(),
          dust: formatDustSpecks(fee.toString())!,
        }
      : null,
    estimatedTransactionsRemaining: remaining !== null && fee !== null && fee > 0n
      ? (remaining / fee).toString()
      : null,
  };
}

export async function latestSponsorFee(database: SqlDatabase): Promise<SponsorFeeRecord | null> {
  const row = await database.first<SponsorFeeRow>(
    `SELECT id AS proof_job_id, sponsor_fee_specks, sponsorship_completed_at
     FROM daily_proof_jobs
     WHERE status IN ('submitted', 'confirmed')
       AND sponsor_fee_specks IS NOT NULL
       AND sponsorship_completed_at IS NOT NULL
     ORDER BY sponsorship_completed_at DESC, id DESC LIMIT 1`,
  );
  return row ? {
    proofJobId: row.proof_job_id,
    specks: row.sponsor_fee_specks,
    recordedAt: row.sponsorship_completed_at,
  } : null;
}
