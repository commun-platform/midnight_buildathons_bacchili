import { describe, expect, it } from 'vitest';

import {
  readSponsorQuota,
  reserveSponsorQuota,
  sponsorQuotaWindow,
} from './sponsor-quota.js';
import type {
  SqlDatabase,
  SqlParameter,
  SqlStatement,
} from './storage/sql.js';

class QuotaDatabase implements SqlDatabase {
  readonly kind = 'd1';
  readonly reservations = new Map<string, {
    deviceId: string;
    quotaDate: string;
    reservedAt: string;
  }>();

  constructor(readonly dailyLimit: number) {}

  async first<T>(sql: string, parameters: readonly SqlParameter[] = []): Promise<T | null> {
    if (sql.includes('SELECT sponsor_daily_limit')) {
      return { daily_limit: this.dailyLimit } as T;
    }
    if (sql.includes('INSERT INTO sponsor_quota_reservations')) {
      const [deviceId, quotaDate, proofJobId, reservedAt] = parameters as [
        string, string, string, string, string,
      ];
      const existing = this.reservations.get(proofJobId);
      if (existing) {
        return existing.deviceId === deviceId && existing.quotaDate === quotaDate
          ? { proof_job_id: proofJobId } as T
          : null;
      }
      const used = [...this.reservations.values()].filter(
        (entry) => entry.deviceId === deviceId && entry.quotaDate === quotaDate,
      ).length;
      if (used >= this.dailyLimit) return null;
      this.reservations.set(proofJobId, { deviceId, quotaDate, reservedAt });
      return { proof_job_id: proofJobId } as T;
    }
    return null;
  }

  async all<T>(sql: string, parameters: readonly SqlParameter[] = []): Promise<T[]> {
    if (!sql.includes('FROM sponsor_quota_reservations')) return [];
    const [deviceId, quotaDate] = parameters as [string, string];
    return [...this.reservations.entries()]
      .filter(([, entry]) => entry.deviceId === deviceId && entry.quotaDate === quotaDate)
      .sort((left, right) => left[1].reservedAt.localeCompare(right[1].reservedAt))
      .map(([proofJobId]) => ({ proof_job_id: proofJobId }) as T);
  }

  async execute(): Promise<number> { return 0; }

  async batch(_statements: readonly SqlStatement[]): Promise<void> {}
}

describe('daily Sponsor quota', () => {
  it('uses a JST service day and reports the next JST midnight', () => {
    expect(sponsorQuotaWindow(new Date('2026-08-29T14:59:59.250Z'))).toEqual({
      quotaDate: '2026-08-29',
      resetAt: '2026-08-29T15:00:00.000Z',
      retryAfterSeconds: 1,
    });
    expect(sponsorQuotaWindow(new Date('2026-08-29T15:00:00.000Z'))).toMatchObject({
      quotaDate: '2026-08-30',
      resetAt: '2026-08-30T15:00:00.000Z',
    });
  });

  it('does not consume another slot when the same Proof Job retries', async () => {
    const database = new QuotaDatabase(5);
    const input = {
      deviceId: 'device-001',
      projectId: 'project-001',
      proofJobId: 'proof-001',
      now: new Date('2026-08-29T06:00:00.000Z'),
    };
    const first = await reserveSponsorQuota(database, input);
    const retry = await reserveSponsorQuota(database, input);
    expect(first).toMatchObject({ accepted: true, used: 1, remaining: 4 });
    expect(retry).toMatchObject({
      accepted: true,
      currentProofJobReserved: true,
      used: 1,
      remaining: 4,
    });
  });

  it('rejects a new Proof Job after the configured Device limit', async () => {
    const database = new QuotaDatabase(2);
    const common = {
      deviceId: 'device-001',
      projectId: 'project-001',
      now: new Date('2026-08-29T06:00:00.000Z'),
    };
    await reserveSponsorQuota(database, { ...common, proofJobId: 'proof-001' });
    await reserveSponsorQuota(database, { ...common, proofJobId: 'proof-002' });
    const rejected = await reserveSponsorQuota(database, { ...common, proofJobId: 'proof-003' });
    expect(rejected).toMatchObject({
      accepted: false,
      currentProofJobReserved: false,
      dailyLimit: 2,
      used: 2,
      remaining: 0,
    });
    expect(rejected.reservedProofJobIds).toEqual(['proof-001', 'proof-002']);
  });

  it('returns a Device quota status without exposing another service day', async () => {
    const database = new QuotaDatabase(20);
    await reserveSponsorQuota(database, {
      deviceId: 'review-device',
      projectId: 'project-001',
      proofJobId: 'proof-yesterday',
      now: new Date('2026-08-28T06:00:00.000Z'),
    });
    const today = await readSponsorQuota(database, {
      deviceId: 'review-device',
      projectId: 'project-001',
      now: new Date('2026-08-29T06:00:00.000Z'),
    });
    expect(today).toMatchObject({ dailyLimit: 20, used: 0, remaining: 20 });
    expect(today.reservedProofJobIds).toEqual([]);
  });
});
