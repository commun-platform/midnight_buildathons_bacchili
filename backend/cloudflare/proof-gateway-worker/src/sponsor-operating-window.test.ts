import { describe, expect, it } from 'vitest';

import {
  evaluateSponsorWalletOperatingWindow,
  sponsorWalletOperatingWindow,
  sponsorWorkIsEligible,
  type SponsorWalletOperatingMode,
} from './sponsor-operating-window.js';

function schedule(
  mode: SponsorWalletOperatingMode,
  processingStartsAtMinute = 120,
) {
  return {
    mode,
    time_zone_offset_minutes: 540,
    opens_at_minute: processingStartsAtMinute,
    closes_at_minute: 360,
    processing_starts_at_minute: processingStartsAtMinute,
    updated_at: '2026-09-03T00:00:00.000Z',
  };
}

describe('Sponsor Wallet operating window', () => {
  it('keeps the judging profile available for every instant', () => {
    const result = evaluateSponsorWalletOperatingWindow(
      schedule('always-on'),
      new Date('2026-09-03T10:30:00.000Z'),
    );
    expect(result).toMatchObject({
      open: true,
      executionAllowed: true,
      nextProcessingStartsAt: null,
      eligibleThrough: null,
      mode: 'always-on',
    });
  });

  it('makes every accepted Job eligible in on-demand mode without a daily cutoff', () => {
    const result = evaluateSponsorWalletOperatingWindow(
      schedule('on-demand'),
      new Date('2026-09-03T10:30:00.000Z'),
    );
    expect(result).toMatchObject({
      mode: 'on-demand',
      executionAllowed: true,
      startAllowed: true,
      nextProcessingStartsAt: null,
      eligibleThrough: null,
    });
    expect(sponsorWorkIsEligible(result, '2026-09-03T10:29:59.999Z')).toBe(true);
  });

  it('blocks a cold restart until the persisted one-minute cooldown expires', () => {
    const cooling = {
      ...schedule('on-demand'),
      last_stopped_at: '2026-09-03T10:29:30.000Z',
      next_start_allowed_at: '2026-09-03T10:30:30.000Z',
    };
    expect(evaluateSponsorWalletOperatingWindow(
      cooling,
      new Date('2026-09-03T10:30:29.999Z'),
    )).toMatchObject({
      startAllowed: false,
      nextStartAllowedAt: '2026-09-03T10:30:30.000Z',
    });
    expect(evaluateSponsorWalletOperatingWindow(
      cooling,
      new Date('2026-09-03T10:30:30.000Z'),
    )).toMatchObject({ startAllowed: true });
  });

  it('cuts off the daily batch at 02:00 JST without a closing time', () => {
    expect(evaluateSponsorWalletOperatingWindow(
      schedule('scheduled'),
      new Date('2026-09-02T17:00:00.000Z'),
    )).toMatchObject({
      open: false,
      eligibleThrough: '2026-09-02T17:00:00.000Z',
      nextProcessingStartsAt: '2026-09-03T17:00:00.000Z',
      currentWindowClosesAt: null,
    });
    expect(evaluateSponsorWalletOperatingWindow(
      schedule('scheduled'),
      new Date('2026-09-02T21:00:00.000Z'),
    )).toMatchObject({
      open: false,
      eligibleThrough: '2026-09-02T17:00:00.000Z',
      nextProcessingStartsAt: '2026-09-03T17:00:00.000Z',
    });
  });

  it('moves the cutoff to the next day at the configured local start minute', () => {
    const startsAt22 = schedule('scheduled', 22 * 60);
    expect(evaluateSponsorWalletOperatingWindow(
      startsAt22,
      new Date('2026-09-03T12:59:00.000Z'),
    )).toMatchObject({
      eligibleThrough: '2026-09-02T13:00:00.000Z',
      nextProcessingStartsAt: '2026-09-03T13:00:00.000Z',
    });
    expect(evaluateSponsorWalletOperatingWindow(
      startsAt22,
      new Date('2026-09-03T13:00:00.000Z'),
    )).toMatchObject({
      eligibleThrough: '2026-09-03T13:00:00.000Z',
      nextProcessingStartsAt: '2026-09-04T13:00:00.000Z',
    });
  });

  it('admits only work accepted no later than the current daily cutoff', () => {
    const result = evaluateSponsorWalletOperatingWindow(
      schedule('scheduled'),
      new Date('2026-09-03T10:30:00.000Z'),
    );
    expect(sponsorWorkIsEligible(result, '2026-09-02T16:59:59.999Z')).toBe(true);
    expect(sponsorWorkIsEligible(result, '2026-09-02T17:00:00.000Z')).toBe(true);
    expect(sponsorWorkIsEligible(result, '2026-09-02T17:00:00.001Z')).toBe(false);
  });

  it('can isolate one minute-boundary task during the stop-start acceptance test', () => {
    const result = evaluateSponsorWalletOperatingWindow(
      schedule('scheduled', 18 * 60 + 34),
      new Date('2026-09-03T11:30:00.000Z'),
    );
    expect(result.eligibleThrough).toBe('2026-09-03T09:34:00.000Z');
    expect(sponsorWorkIsEligible(result, '2026-09-03T09:34:00.000Z')).toBe(true);
    expect(sponsorWorkIsEligible(result, '2026-09-03T09:35:00.000Z')).toBe(false);
  });

  it('rejects an invalid daily processing start', () => {
    expect(() => evaluateSponsorWalletOperatingWindow({
      ...schedule('scheduled'),
      processing_starts_at_minute: 1440,
    }, new Date('2026-09-03T00:00:00.000Z'))).toThrow(
      'Sponsor Wallet operating schedule is invalid',
    );
  });

  it('fails closed when D1 cannot return an operating schedule', async () => {
    const env = {
      DB: {
        prepare() {
          return { first: async () => { throw new Error('D1 unavailable'); } };
        },
      },
    } as unknown as Env;
    await expect(sponsorWalletOperatingWindow(
      env,
      new Date('2026-09-02T18:00:00.000Z'),
    )).resolves.toMatchObject({
      mode: 'scheduled',
      open: false,
      executionAllowed: false,
      source: 'configuration-unavailable',
      updatedAt: null,
    });
  });
});
