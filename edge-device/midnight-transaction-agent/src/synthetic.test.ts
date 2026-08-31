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
    assert.equal(dataset.publicData.periodStart, '2026-08-26T15:00:00.000Z');
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

test('rejects unsupported synthetic sample counts and unsafe run IDs', async () => {
  await assert.rejects(
    prepareSyntheticBenchmarkDataset({ sampleCount: 25, runId: 'run-a' }),
    /one of 24, 96, or 1440/,
  );
  await assert.rejects(
    prepareSyntheticBenchmarkDataset({ sampleCount: 24, runId: '../unsafe' }),
    /safe identifier characters/,
  );
});
