import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluatePreparedDailyExtremaLocally,
  verifyPreparedDailyExtremaLocally,
} from '@midnight-demo/shared';

import {
  prepareSyntheticBenchmarkDataset,
  syntheticBenchmarkSampleCounts,
} from './synthetic.js';

for (const sampleCount of syntheticBenchmarkSampleCounts) {
  test(`prepares a locally valid ${sampleCount}-sample synthetic benchmark day`, async () => {
    const dataset = await prepareSyntheticBenchmarkDataset({ sampleCount, runId: 'repeatable-run' });
    assert.equal(dataset.publicData.sampleCount, sampleCount);
    assert.equal(dataset.publicData.periodStart, '2026-08-27T00:00:00.000Z');
    assert.equal(
      Date.parse(dataset.publicData.periodEnd) - Date.parse(dataset.publicData.periodStart),
      86_400 * 1_000,
    );
    assert.equal(verifyPreparedDailyExtremaLocally(dataset, {
      policyId: 'temperature-v1',
      mode: 'closed-range',
      minimum: 10,
      maximum: 35,
      valueScale: 100,
      sensorTypeCode: 1,
      unitCode: 1,
      version: 1,
    }), true);
  });
}

test('synthetic run IDs produce distinct daily attestation commitments', async () => {
  const first = await prepareSyntheticBenchmarkDataset({ sampleCount: 24, runId: 'run-a' });
  const second = await prepareSyntheticBenchmarkDataset({ sampleCount: 24, runId: 'run-b' });
  assert.notEqual(first.publicData.attestationCommitment, second.publicData.attestationCommitment);
});

test('uses the registered Device ID and can produce a truthful outside-threshold day', async () => {
  const dataset = await prepareSyntheticBenchmarkDataset({
    sampleCount: 1440,
    runId: 'outside-result',
    deviceId: 'edge-temp-001',
    periodDate: '2026-08-26',
    outlierValue: 40,
  });
  assert.equal(dataset.privateData.deviceId, 'edge-temp-001');
  assert.equal(dataset.publicData.periodDate, '2026-08-26');
  assert.equal(evaluatePreparedDailyExtremaLocally(dataset, {
    policyId: 'temperature-v1',
    mode: 'closed-range',
    minimum: 10,
    maximum: 35,
    valueScale: 100,
    sensorTypeCode: 1,
    unitCode: 1,
    version: 1,
  }), 'outside-threshold');
});

test('removes complete operational hours while retaining the fixed 24-slot proof shape', async () => {
  const dataset = await prepareSyntheticBenchmarkDataset({
    sampleCount: 1440,
    runId: 'partial-missing',
    missingHours: [2, 3, 11, 19],
  });
  assert.equal(dataset.publicData.sampleCount, 1200);
  assert.equal(dataset.publicData.observedHourCount, 20);
  assert.equal(dataset.publicData.stoppedHourCount, 4);
  assert.deepEqual(
    dataset.publicData.hourPresence
      .flatMap((present, hour) => present ? [] : [hour]),
    [2, 3, 11, 19],
  );
});

test('represents a fully stopped day as 24 canonical no-data hours', async () => {
  const dataset = await prepareSyntheticBenchmarkDataset({
    sampleCount: 1440,
    runId: 'fully-stopped',
    missingHours: Array.from({ length: 24 }, (_, hour) => hour),
  });
  assert.equal(dataset.publicData.sampleCount, 0);
  assert.equal(dataset.publicData.observedHourCount, 0);
  assert.equal(dataset.publicData.stoppedHourCount, 24);
  assert.deepEqual(dataset.publicData.hourPresence, Array(24).fill(false));
  assert.equal(dataset.privateData.hours.every((hour) => (
    !hour.present && hour.sampleCount === 0 && hour.minimum === 0 && hour.maximum === 0
  )), true);
});

test('places an outlier in an observed hour after missing-hour filtering', async () => {
  const dataset = await prepareSyntheticBenchmarkDataset({
    sampleCount: 1440,
    runId: 'missing-with-outlier',
    missingHours: [0, 5, 6],
    outlierValue: 40,
  });
  assert.equal(dataset.publicData.observedHourCount, 21);
  assert.equal(dataset.privateData.hours[0]?.present, false);
  assert.equal(dataset.privateData.hours[1]?.maximum, 40);
  assert.equal(evaluatePreparedDailyExtremaLocally(dataset, {
    policyId: 'temperature-v1',
    mode: 'closed-range',
    minimum: 10,
    maximum: 35,
    valueScale: 100,
    sensorTypeCode: 1,
    unitCode: 1,
    version: 1,
  }), 'outside-threshold');
});

test('rejects unsupported synthetic sample counts and unsafe run IDs', async () => {
  await assert.rejects(
    prepareSyntheticBenchmarkDataset({ sampleCount: 25, runId: 'run-a' }),
    /one of 24, 96, or 1440/,
  );
  await assert.rejects(
    prepareSyntheticBenchmarkDataset({ sampleCount: 24, runId: '../unsafe' }),
    /safe identifier characters/,
  );
  await assert.rejects(
    prepareSyntheticBenchmarkDataset({ sampleCount: 24, runId: 'bad-hour', missingHours: [24] }),
    /integers from 0 through 23/,
  );
  await assert.rejects(
    prepareSyntheticBenchmarkDataset({ sampleCount: 24, runId: 'duplicate', missingHours: [2, 2] }),
    /must not contain duplicates/,
  );
});
