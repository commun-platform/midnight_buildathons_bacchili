export const UTC_OFFSET_MINUTES = 0;
export const MIN_TIME_ZONE_OFFSET_MINUTES = -14 * 60;
export const MAX_TIME_ZONE_OFFSET_MINUTES = 14 * 60;

export interface OperationalDayBoundary {
  timeZoneOffsetMinutes: number;
  localDayStartHour: number;
}

export function validateOperationalDayBoundary(
  boundary: OperationalDayBoundary,
): OperationalDayBoundary {
  if (
    !Number.isInteger(boundary.timeZoneOffsetMinutes)
    || boundary.timeZoneOffsetMinutes < MIN_TIME_ZONE_OFFSET_MINUTES
    || boundary.timeZoneOffsetMinutes > MAX_TIME_ZONE_OFFSET_MINUTES
  ) throw new Error('timeZoneOffsetMinutes is outside the supported range');
  if (
    !Number.isInteger(boundary.localDayStartHour)
    || boundary.localDayStartHour < 0
    || boundary.localDayStartHour > 23
  ) throw new Error('localDayStartHour must be an integer from 0 through 23');
  return boundary;
}

export function utcDayStartMinute(boundary: OperationalDayBoundary): number {
  const validated = validateOperationalDayBoundary(boundary);
  const unwrapped = validated.localDayStartHour * 60 - validated.timeZoneOffsetMinutes;
  return ((unwrapped % 1440) + 1440) % 1440;
}

export function operationalPeriodStart(
  periodDate: string,
  boundary: OperationalDayBoundary,
): Date {
  const { timeZoneOffsetMinutes, localDayStartHour } = validateOperationalDayBoundary(boundary);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(periodDate)) throw new Error('periodDate must be YYYY-MM-DD');
  const [yearText, monthText, dayText] = periodDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const start = new Date(
    Date.UTC(year, month - 1, day, localDayStartHour) - timeZoneOffsetMinutes * 60_000,
  );
  const shifted = new Date(start.valueOf() + timeZoneOffsetMinutes * 60_000)
    .toISOString().slice(0, 10);
  if (shifted !== periodDate) throw new Error('periodDate is not a valid calendar date');
  return start;
}

export function operationalPeriodDate(
  timestamp: number | Date,
  boundary: OperationalDayBoundary,
): string {
  const { timeZoneOffsetMinutes, localDayStartHour } = validateOperationalDayBoundary(boundary);
  const value = timestamp instanceof Date ? timestamp.valueOf() : timestamp;
  if (!Number.isFinite(value)) throw new Error('Operational timestamp is invalid');
  return new Date(
    value + timeZoneOffsetMinutes * 60_000 - localDayStartHour * 3_600_000,
  ).toISOString().slice(0, 10);
}
