import type { SqlDatabase } from './storage/sql.js';

const jstOffsetMilliseconds = 9 * 60 * 60 * 1_000;

interface DeviceQuotaRow {
  daily_limit: number;
}

interface ReservationRow {
  proof_job_id: string;
}

export interface SponsorQuotaStatus {
  quotaDate: string;
  dailyLimit: number;
  used: number;
  remaining: number;
  resetAt: string;
  reservedProofJobIds: string[];
}

export interface SponsorQuotaReservation extends SponsorQuotaStatus {
  accepted: boolean;
  currentProofJobReserved: boolean;
}

export function sponsorQuotaWindow(now = new Date()): {
  quotaDate: string;
  resetAt: string;
  retryAfterSeconds: number;
} {
  if (!Number.isFinite(now.valueOf())) throw new Error('Sponsor quota time is invalid');
  const quotaDate = new Date(now.valueOf() + jstOffsetMilliseconds).toISOString().slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(quotaDate);
  if (!match) throw new Error('Sponsor quota date is invalid');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const reset = new Date(Date.UTC(year, month - 1, day, 15));
  return {
    quotaDate,
    resetAt: reset.toISOString(),
    retryAfterSeconds: Math.max(1, Math.ceil((reset.valueOf() - now.valueOf()) / 1_000)),
  };
}

export async function readSponsorQuota(
  database: SqlDatabase,
  input: { deviceId: string; projectId: string; now?: Date },
): Promise<SponsorQuotaStatus> {
  const window = sponsorQuotaWindow(input.now);
  const device = await database.first<DeviceQuotaRow>(
    `SELECT sponsor_daily_limit AS daily_limit
     FROM devices
     WHERE id = ?1 AND project_id = ?2 AND midnight_registry_status = 'registered'`,
    [input.deviceId, input.projectId],
  );
  if (!device || !Number.isSafeInteger(device.daily_limit) || device.daily_limit < 1) {
    throw new Error('Sponsor quota is not configured for this Device');
  }
  const reservations = await database.all<ReservationRow>(
    `SELECT proof_job_id
     FROM sponsor_quota_reservations
     WHERE device_id = ?1 AND quota_date = ?2
     ORDER BY reserved_at, proof_job_id`,
    [input.deviceId, window.quotaDate],
  );
  const reservedProofJobIds = reservations.map((reservation) => reservation.proof_job_id);
  return {
    quotaDate: window.quotaDate,
    dailyLimit: device.daily_limit,
    used: reservedProofJobIds.length,
    remaining: Math.max(0, device.daily_limit - reservedProofJobIds.length),
    resetAt: window.resetAt,
    reservedProofJobIds,
  };
}

export async function reserveSponsorQuota(
  database: SqlDatabase,
  input: { deviceId: string; projectId: string; proofJobId: string; now?: Date },
): Promise<SponsorQuotaReservation> {
  const now = input.now ?? new Date();
  const window = sponsorQuotaWindow(now);
  const reservation = await database.first<ReservationRow>(
    `INSERT INTO sponsor_quota_reservations (
       device_id, quota_date, proof_job_id, reserved_at
     )
     SELECT d.id, ?2, ?3, ?4
     FROM devices d
     WHERE d.id = ?1 AND d.project_id = ?5
       AND d.midnight_registry_status = 'registered'
       AND (
         EXISTS (
           SELECT 1 FROM sponsor_quota_reservations existing
           WHERE existing.proof_job_id = ?3
             AND existing.device_id = d.id
             AND existing.quota_date = ?2
         )
         OR (
           SELECT COUNT(*) FROM sponsor_quota_reservations current_day
           WHERE current_day.device_id = d.id AND current_day.quota_date = ?2
         ) < d.sponsor_daily_limit
       )
     ON CONFLICT(proof_job_id) DO UPDATE SET
       reserved_at = sponsor_quota_reservations.reserved_at
     WHERE sponsor_quota_reservations.device_id = excluded.device_id
       AND sponsor_quota_reservations.quota_date = excluded.quota_date
     RETURNING proof_job_id`,
    [input.deviceId, window.quotaDate, input.proofJobId, now.toISOString(), input.projectId],
  );
  const status = await readSponsorQuota(database, {
    deviceId: input.deviceId,
    projectId: input.projectId,
    now,
  });
  const currentProofJobReserved = status.reservedProofJobIds.includes(input.proofJobId);
  return {
    ...status,
    accepted: reservation?.proof_job_id === input.proofJobId && currentProofJobReserved,
    currentProofJobReserved,
  };
}
