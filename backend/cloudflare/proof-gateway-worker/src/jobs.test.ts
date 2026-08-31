import { describe, expect, it } from 'vitest';

import { isProofOperatingWindow } from './proof-window.js';

describe('Proof Server operating window', () => {
  it.each([
    ['2026-08-27T17:00:00.000Z', true],
    ['2026-08-27T20:59:59.999Z', true],
    ['2026-08-27T16:59:59.999Z', false],
    ['2026-08-27T21:00:00.000Z', false],
  ])('maps %s to the configured 02:00-06:00 JST window', (timestamp, expected) => {
    expect(isProofOperatingWindow(new Date(timestamp))).toBe(expected);
  });
});
