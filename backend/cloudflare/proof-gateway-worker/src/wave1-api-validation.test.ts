import { describe, expect, it } from 'vitest';

import type { ProofJobRow } from './jobs.js';
import {
  deferredProvisioningCreatedAt,
  proofJobView,
  requiredBlockHeight,
} from './wave1-api.js';

describe('Proof result block height validation', () => {
  it.each(['0', '1', '2317466'])('accepts numeric block height %s', (value) => {
    expect(requiredBlockHeight(value)).toBe(value);
  });

  it.each([
    'confirmed-by-indexer',
    '-1',
    '01',
    '1.5',
    '',
    null,
    2_317_466,
  ])('rejects invalid block height %s', (value) => {
    expect(() => requiredBlockHeight(value)).toThrow(/blockHeight/u);
  });
});

describe('Deferred Proof request scheduling', () => {
  const operation = {
    created_at: '2026-09-03T16:30:00.000Z',
    updated_at: '2026-09-03T17:15:00.000Z',
  };
  const now = new Date('2026-09-03T17:20:00.000Z');

  it('preserves the pre-cutoff registration acceptance time for one continuation', () => {
    expect(deferredProvisioningCreatedAt(operation, 0, now)).toBe(operation.created_at);
  });

  it('rejects reuse and stale or missing registration continuations', () => {
    expect(() => deferredProvisioningCreatedAt(operation, 1, now)).toThrow(/already used/u);
    expect(() => deferredProvisioningCreatedAt(null, 0, now)).toThrow(/not linked/u);
    expect(() => deferredProvisioningCreatedAt({
      ...operation,
      updated_at: '2026-09-03T10:00:00.000Z',
    }, 0, now)).toThrow(/not linked/u);
  });
});

describe('Proof Job Sponsor progress response', () => {
  it('returns the recorded stage, reason, stall flag, and safe retry time', () => {
    const view = proofJobView({
      id: 'proof-progress-001',
      project_id: 'project-001',
      device_id: 'device-001',
      period_date: '2026-08-31',
      hour_presence: '1'.repeat(24),
      hour_results: '1'.repeat(24),
      observed_hour_count: 24,
      threshold_satisfied: 1,
      status: 'sponsoring',
      sponsor_stage: 'interrupted',
      sponsor_reason_code: 'sponsor_queue_wall_time_exceeded_waiting_for_safe_retry',
      sponsor_stage_updated_at: '2026-08-31T14:36:09.000Z',
      sponsor_lease_expires_at: '2026-08-31T14:41:09.000Z',
    } as ProofJobRow);

    expect(view).toMatchObject({
      proofJobId: 'proof-progress-001',
      sponsorStage: 'interrupted',
      sponsorReasonCode: 'sponsor_queue_wall_time_exceeded_waiting_for_safe_retry',
      sponsorNextRetryAt: '2026-08-31T14:37:09.000Z',
      sponsorLeaseExpiresAt: '2026-08-31T14:41:09.000Z',
      sponsorStalled: true,
    });
  });
});
