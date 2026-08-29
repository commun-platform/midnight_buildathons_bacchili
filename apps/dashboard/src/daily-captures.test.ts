import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  dailyCaptureStorageName,
  dailyGenerationDateBounds,
  generateDailyCapture,
  listDailyCaptures,
  loadDailyCapture,
  storeDailyCapture,
} from './daily-captures.js';

const policy = {
  policyId: 'temperature-v1',
  mode: 'closed-range' as const,
  minimum: 10,
  maximum: 35,
  valueScale: 100,
  sensorTypeCode: 1,
  unitCode: 1,
  version: 1,
};

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dailyCaptureStorageName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Daily capture database deletion was blocked'));
  });
});

describe('browser private daily captures', () => {
  it.each([24, 96, 1440] as const)('aggregates %i raw samples into 24 cloud windows', async (sampleCount) => {
    const capture = await generateDailyCapture({
      projectId: 'measurement-authenticity-01',
      deviceId: 'browser-device-001',
      periodDate: '2026-08-27',
      policy,
      assignmentId: 'browser-device-001-temperature-v1-wave1',
      sampleCount,
      mode: 'within-threshold',
      now: new Date('2026-08-28T12:00:00.000Z'),
      seed: 7,
    });

    expect(capture.records).toHaveLength(sampleCount);
    expect(capture.windows).toHaveLength(24);
    expect(capture.windows.reduce((sum, window) => sum + window.count, 0)).toBe(sampleCount);
    expect(capture.thresholdSatisfied).toBe(true);
    expect(capture.outlierCount).toBe(0);
  });

  it('creates a valid outside-threshold day with outliers', async () => {
    const capture = await generateDailyCapture({
      projectId: 'measurement-authenticity-01',
      deviceId: 'browser-device-002',
      periodDate: '2026-08-27',
      policy,
      assignmentId: 'browser-device-002-temperature-v1-wave1',
      sampleCount: 96,
      mode: 'with-outliers',
      now: new Date('2026-08-28T12:00:00.000Z'),
      seed: 11,
    });

    expect(capture.outlierCount).toBeGreaterThan(0);
    expect(capture.thresholdSatisfied).toBe(false);
  });

  it('allows only the previous 30 completed JST days', async () => {
    const now = new Date('2026-08-28T03:37:42.000Z');
    expect(dailyGenerationDateBounds(now)).toEqual({
      minimum: '2026-07-29',
      maximum: '2026-08-27',
    });
    const input = {
      projectId: 'measurement-authenticity-01',
      deviceId: 'browser-device-003',
      policy,
      assignmentId: 'browser-device-003-temperature-v1-wave1',
      sampleCount: 1440,
      mode: 'within-threshold',
      now,
      seed: 13,
    } as const;

    await expect(generateDailyCapture({ ...input, periodDate: '2026-08-28' }))
      .rejects.toThrow('periodDate must be between 2026-07-29 and 2026-08-27');
    await expect(generateDailyCapture({ ...input, periodDate: '2026-07-28' }))
      .rejects.toThrow('periodDate must be between 2026-07-29 and 2026-08-27');
    const capture = await generateDailyCapture({ ...input, periodDate: '2026-07-29' });
    expect(capture.completeDay).toBe(true);
    expect(capture.windows).toHaveLength(24);
  });

  it('stores raw samples only in the browser private store and lists days newest-first', async () => {
    const first = await generateDailyCapture({
      projectId: 'measurement-authenticity-01', deviceId: 'browser-device-004',
      periodDate: '2026-08-26', policy,
      assignmentId: 'browser-device-004-temperature-v1-wave1', sampleCount: 1440,
      mode: 'within-threshold', now: new Date('2026-08-28T12:00:00.000Z'), seed: 17,
    });
    const second = await generateDailyCapture({
      projectId: 'measurement-authenticity-01', deviceId: 'browser-device-004',
      periodDate: '2026-08-27', policy,
      assignmentId: 'browser-device-004-temperature-v1-wave1', sampleCount: 1440,
      mode: 'within-threshold', now: new Date('2026-08-28T12:00:00.000Z'), seed: 19,
    });
    await storeDailyCapture(first);
    await storeDailyCapture(second);

    expect((await loadDailyCapture(first.projectId, first.deviceId, first.periodDate))?.records).toHaveLength(1440);
    expect((await listDailyCaptures(first.projectId, first.deviceId)).map((item) => item.periodDate)).toEqual([
      '2026-08-27', '2026-08-26',
    ]);
  });

  it('does not restore captures from an obsolete circuit profile', async () => {
    const capture = await generateDailyCapture({
      projectId: 'measurement-authenticity-01', deviceId: 'browser-device-005',
      periodDate: '2026-08-27', policy,
      assignmentId: 'browser-device-005-temperature-v1-wave1', sampleCount: 1440,
      mode: 'within-threshold', now: new Date('2026-08-28T12:00:00.000Z'), seed: 23,
    });
    await storeDailyCapture(capture);

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dailyCaptureStorageName, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('daily-captures', 'readwrite');
        transaction.objectStore('daily-captures').put({
          ...capture,
          attestation: {
            publicData: { ...capture.attestation.publicData, circuitVersion: 1 },
            privateData: { ...capture.attestation.privateData, circuitVersion: 1 },
          },
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }

    expect(await loadDailyCapture(capture.projectId, capture.deviceId, capture.periodDate)).toBeNull();
    expect(await listDailyCaptures(capture.projectId, capture.deviceId)).toEqual([]);
  });
});
