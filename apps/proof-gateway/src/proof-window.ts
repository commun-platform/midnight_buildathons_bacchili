export function isProofOperatingWindow(value: Date): boolean {
  const jstHour = (value.getUTCHours() + 9) % 24;
  return jstHour >= 2 && jstHour < 6;
}
