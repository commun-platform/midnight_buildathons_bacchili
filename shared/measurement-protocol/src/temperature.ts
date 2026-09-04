export const TEMPERATURE_OFFSET_CENTI = 10_000;

export function encodeTemperature(value: number): bigint {
  if (!Number.isFinite(value)) throw new Error('Temperature must be finite');
  const encoded = Math.round(value * 100) + TEMPERATURE_OFFSET_CENTI;
  if (encoded < 0 || encoded > 0xffff_ffff) {
    throw new Error('Temperature is outside the supported Uint<32> range');
  }
  return BigInt(encoded);
}
