import { createSqlDatabase } from './storage/index.js';

export type SponsorWalletOperatingMode = 'always-on' | 'on-demand' | 'scheduled';

const restartCooldownMilliseconds = 60_000;

interface SponsorWalletOperatingScheduleRow {
  mode: SponsorWalletOperatingMode;
  time_zone_offset_minutes: number;
  opens_at_minute: number;
  closes_at_minute: number;
  processing_starts_at_minute?: number | null;
  last_stopped_at?: string | null;
  next_start_allowed_at?: string | null;
  updated_at: string;
}

export interface SponsorWalletOperatingWindow {
  mode: SponsorWalletOperatingMode;
  timeZoneOffsetMinutes: number;
  opensAtMinute: number;
  closesAtMinute: number;
  processingStartsAtMinute: number;
  open: boolean;
  executionAllowed: boolean;
  startAllowed: boolean;
  evaluatedAt: string;
  nextOpensAt: string | null;
  nextProcessingStartsAt: string | null;
  eligibleThrough: string | null;
  currentWindowClosesAt: string | null;
  lastStoppedAt: string | null;
  nextStartAllowedAt: string | null;
  updatedAt: string | null;
  source: 'd1' | 'configuration-unavailable';
}

export const defaultSponsorWalletSchedule: SponsorWalletOperatingScheduleRow = {
  mode: 'scheduled',
  time_zone_offset_minutes: 540,
  opens_at_minute: 2 * 60,
  closes_at_minute: 6 * 60,
  processing_starts_at_minute: 2 * 60,
  updated_at: '',
};

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function validSchedule(
  row: SponsorWalletOperatingScheduleRow | null,
): row is SponsorWalletOperatingScheduleRow {
  if (!row || !['always-on', 'on-demand', 'scheduled'].includes(row.mode)) return false;
  const processingStartsAtMinute = row?.processing_starts_at_minute ?? row?.opens_at_minute;
  if (
    !Number.isInteger(row.time_zone_offset_minutes)
    || row.time_zone_offset_minutes < -840
    || row.time_zone_offset_minutes > 840
    || !Number.isInteger(row.opens_at_minute)
    || row.opens_at_minute < 0
    || row.opens_at_minute >= 1440
    || !Number.isInteger(row.closes_at_minute)
    || row.closes_at_minute < 0
    || row.closes_at_minute >= 1440
    || !Number.isInteger(processingStartsAtMinute)
    || processingStartsAtMinute < 0
    || processingStartsAtMinute >= 1440
    || (row.last_stopped_at !== undefined && row.last_stopped_at !== null
      && !Number.isFinite(Date.parse(row.last_stopped_at)))
    || (row.next_start_allowed_at !== undefined && row.next_start_allowed_at !== null
      && !Number.isFinite(Date.parse(row.next_start_allowed_at)))
  ) return false;
  return true;
}

function instantAtLocalMinute(
  evaluatedAtMs: number,
  timeZoneOffsetMinutes: number,
  targetMinute: number,
  includeCurrent: boolean,
): string {
  const utcEpochMinute = Math.floor(evaluatedAtMs / 60_000);
  const localMinute = modulo(utcEpochMinute + timeZoneOffsetMinutes, 1440);
  let delta = targetMinute - localMinute;
  if (delta < 0 || (!includeCurrent && delta === 0)) delta += 1440;
  return new Date((utcEpochMinute + delta) * 60_000).toISOString();
}

export function evaluateSponsorWalletOperatingWindow(
  schedule: SponsorWalletOperatingScheduleRow,
  evaluatedAt: Date,
  source: SponsorWalletOperatingWindow['source'] = 'd1',
): SponsorWalletOperatingWindow {
  if (!validSchedule(schedule) || !Number.isFinite(evaluatedAt.valueOf())) {
    throw new Error('Sponsor Wallet operating schedule is invalid');
  }
  const evaluatedAtMs = evaluatedAt.valueOf();
  const processingStartsAtMinute = schedule.processing_starts_at_minute
    ?? schedule.opens_at_minute;
  const nextStartAllowedAt = schedule.next_start_allowed_at ?? null;
  const startAllowed = source === 'd1' && (
    nextStartAllowedAt === null || nextStartAllowedAt <= evaluatedAt.toISOString()
  );
  if (schedule.mode === 'always-on' || schedule.mode === 'on-demand') {
    return {
      mode: schedule.mode,
      timeZoneOffsetMinutes: schedule.time_zone_offset_minutes,
      opensAtMinute: schedule.opens_at_minute,
      closesAtMinute: schedule.closes_at_minute,
      processingStartsAtMinute,
      open: true,
      executionAllowed: source === 'd1',
      startAllowed,
      evaluatedAt: evaluatedAt.toISOString(),
      nextOpensAt: null,
      nextProcessingStartsAt: null,
      eligibleThrough: null,
      currentWindowClosesAt: null,
      lastStoppedAt: schedule.last_stopped_at ?? null,
      nextStartAllowedAt,
      updatedAt: schedule.updated_at || null,
      source,
    };
  }
  const utcEpochMinute = Math.floor(evaluatedAtMs / 60_000);
  const localMinute = modulo(utcEpochMinute + schedule.time_zone_offset_minutes, 1440);
  const minutesSinceStart = modulo(localMinute - processingStartsAtMinute, 1440);
  const cutoffMinute = utcEpochMinute - minutesSinceStart;
  const eligibleThrough = new Date(cutoffMinute * 60_000).toISOString();
  const nextProcessingStartsAt = new Date((cutoffMinute + 1440) * 60_000).toISOString();
  return {
    mode: schedule.mode,
    timeZoneOffsetMinutes: schedule.time_zone_offset_minutes,
    opensAtMinute: schedule.opens_at_minute,
    closesAtMinute: schedule.closes_at_minute,
    processingStartsAtMinute,
    // Retained for response compatibility. Scheduled mode has no fixed open
    // window; execution is selected by accepted-at <= eligibleThrough.
    open: false,
    executionAllowed: source === 'd1',
    startAllowed,
    evaluatedAt: evaluatedAt.toISOString(),
    nextOpensAt: nextProcessingStartsAt,
    nextProcessingStartsAt,
    eligibleThrough,
    currentWindowClosesAt: null,
    lastStoppedAt: schedule.last_stopped_at ?? null,
    nextStartAllowedAt,
    updatedAt: schedule.updated_at || null,
    source,
  };
}

export async function sponsorWalletOperatingWindow(
  env: Env,
  evaluatedAt: Date = new Date(),
): Promise<SponsorWalletOperatingWindow> {
  try {
    const row = await createSqlDatabase(env).first<SponsorWalletOperatingScheduleRow>(
      `SELECT mode, time_zone_offset_minutes, opens_at_minute,
              closes_at_minute, processing_starts_at_minute,
              last_stopped_at, next_start_allowed_at, updated_at
       FROM sponsor_wallet_operating_schedule WHERE singleton_id = 1`,
    );
    if (!validSchedule(row)) throw new Error('Sponsor Wallet operating schedule row is invalid');
    return evaluateSponsorWalletOperatingWindow(row, evaluatedAt);
  } catch (error) {
    console.error(JSON.stringify({
      message: 'sponsor_wallet_schedule_fail_closed',
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }));
    const fallback = evaluateSponsorWalletOperatingWindow(
      defaultSponsorWalletSchedule,
      evaluatedAt,
      'configuration-unavailable',
    );
    return {
      ...fallback,
      open: false,
      executionAllowed: false,
      startAllowed: false,
      nextOpensAt: instantAtLocalMinute(
        evaluatedAt.valueOf(),
        fallback.timeZoneOffsetMinutes,
        fallback.processingStartsAtMinute,
        false,
      ),
      nextProcessingStartsAt: instantAtLocalMinute(
        evaluatedAt.valueOf(),
        fallback.timeZoneOffsetMinutes,
        fallback.processingStartsAtMinute,
        false,
      ),
      eligibleThrough: null,
      currentWindowClosesAt: null,
      updatedAt: null,
    };
  }
}

export async function recordSponsorWalletStopped(
  env: Env,
  stoppedAt: Date = new Date(),
): Promise<void> {
  if (!Number.isFinite(stoppedAt.valueOf())) throw new Error('Sponsor Wallet stop time is invalid');
  const stoppedAtIso = stoppedAt.toISOString();
  const nextStartAllowedAt = new Date(
    stoppedAt.valueOf() + restartCooldownMilliseconds,
  ).toISOString();
  await createSqlDatabase(env).execute(
    `UPDATE sponsor_wallet_operating_schedule
     SET last_stopped_at = ?1, next_start_allowed_at = ?2, updated_at = ?1
     WHERE singleton_id = 1`,
    [stoppedAtIso, nextStartAllowedAt],
  );
}

export function sponsorWorkIsEligible(
  schedule: SponsorWalletOperatingWindow,
  acceptedAt: string,
): boolean {
  if (!schedule.executionAllowed || !Number.isFinite(Date.parse(acceptedAt))) return false;
  return schedule.mode === 'always-on' || schedule.mode === 'on-demand'
    || (schedule.eligibleThrough !== null && acceptedAt <= schedule.eligibleThrough);
}
