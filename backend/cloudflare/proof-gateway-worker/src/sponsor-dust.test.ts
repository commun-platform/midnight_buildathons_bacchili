import { describe, expect, it } from 'vitest';

import {
  formatDustSpecks,
  sponsorDustFunds,
} from './sponsor-dust.js';

describe('Sponsor Wallet DUST capacity', () => {
  it('converts specks to an exact DUST decimal', () => {
    expect(formatDustSpecks('632920000000001')).toBe('0.632920000000001');
    expect(formatDustSpecks('1000000000000000')).toBe('1.000000000000000');
  });

  it('estimates sponsored transactions from the actual balance and latest actual fee', () => {
    expect(sponsorDustFunds('2000000000000000', {
      proofJobId: 'zjb_01991f1e-2520-7000-8000-000000000001',
      specks: '632920000000001',
      recordedAt: '2026-08-31T09:00:00.000Z',
    })).toEqual({
      remainingSpecks: '2000000000000000',
      remainingDust: '2.000000000000000',
      latestFee: {
        proofJobId: 'zjb_01991f1e-2520-7000-8000-000000000001',
        specks: '632920000000001',
        dust: '0.632920000000001',
        recordedAt: '2026-08-31T09:00:00.000Z',
      },
      estimatedTransactionsRemaining: '3',
    });
  });

  it('does not invent capacity when balance or fee evidence is invalid', () => {
    expect(sponsorDustFunds('invalid', null)).toMatchObject({
      remainingSpecks: null,
      remainingDust: null,
      latestFee: null,
      estimatedTransactionsRemaining: null,
    });
    expect(sponsorDustFunds('1000', {
      proofJobId: 'zjb_test',
      specks: '0',
      recordedAt: '2026-08-31T09:00:00.000Z',
    }).estimatedTransactionsRemaining).toBeNull();
  });
});
