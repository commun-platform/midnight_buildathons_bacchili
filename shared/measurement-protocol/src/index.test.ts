import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalizeSensorRecord,
  evaluatePreparedDailyExtremaLocally,
  generateSensorRecords,
  policyAssignmentKey,
  prepareDailyExtremaAttestation,
  prepareDataset,
  sensorDeviceCommitment,
  thresholdPolicyKey,
  bytesToHex,
  verifyPreparedDailyExtremaLocally,
  verifyPreparedDatasetLocally,
} from './index.js';

const temperaturePolicy = {
  policyId: 'temperature-v1',
  mode: 'closed-range' as const,
  minimum: 10,
  maximum: 35,
  valueScale: 100,
  sensorTypeCode: 1,
  unitCode: 1,
  version: 1,
};

test('sensor generation is deterministic', () => {
  const first = generateSensorRecords({ samples: 3, seed: 7 });
  const second = generateSensorRecords({ samples: 3, seed: 7 });
  assert.deepEqual(first, second);
});

test('canonical JSON uses a stable record order', () => {
  const record = generateSensorRecords({ samples: 1 })[0];
  assert.ok(record);
  assert.equal(
    canonicalizeSensorRecord(record),
    `{"deviceId":"${record.deviceId}","timestamp":"${record.timestamp}","temperature":${record.temperature},"humidity":${record.humidity}}`,
  );
});

test('policy, assignment, and device domain keys stay compatible with D1 seeds', async () => {
  assert.equal(
    bytesToHex(await thresholdPolicyKey('temperature-v1')),
    '3f7fe462bddc1e61a43f9ca4b03299ee0cbad0c6aa8d443d1e3e8b6f0505bf07',
  );
  assert.equal(
    bytesToHex(await policyAssignmentKey('edge-temp-001-temperature-v1-wave1')),
    'b35de834fda21fe7a76349b35b777b5853da9d71db7764afe09f39b987fc02ba',
  );
  assert.equal(
    bytesToHex(await sensorDeviceCommitment('edge-temp-001')),
    '41ec4294cdb082936f86c6529e911f21289491867ff32a5eed86923140acde9b',
  );
});

test('valid private sample passes inclusion and range verification', async () => {
  const records = generateSensorRecords({ samples: 16, seed: 99 });
  const dataset = await prepareDataset(records, { nonceSeed: 'valid', thresholdMin: 10, thresholdMax: 35 });
  assert.equal(dataset.publicData.sampleCount, 16);
  assert.equal(dataset.publicData.merkleRoot.length, 64);
  assert.equal(verifyPreparedDatasetLocally(dataset), true);
});

test('out-of-range private sample is rejected', async () => {
  const records = generateSensorRecords({ samples: 16, seed: 99 });
  const dataset = await prepareDataset(records, { nonceSeed: 'range', thresholdMin: 0, thresholdMax: 20 });
  assert.equal(verifyPreparedDatasetLocally(dataset), false);
});

test('tampered private sample is rejected by its commitment', async () => {
  const records = generateSensorRecords({ samples: 16, seed: 99 });
  const dataset = await prepareDataset(records, { nonceSeed: 'sample-tamper' });
  const selected = dataset.privateData.samples[dataset.privateData.selectedIndex];
  assert.ok(selected);
  selected.temperature += 1;
  assert.equal(verifyPreparedDatasetLocally(dataset), false);
});

test('tampered Merkle path is rejected', async () => {
  const records = generateSensorRecords({ samples: 16, seed: 99 });
  const dataset = await prepareDataset(records, { nonceSeed: 'path-tamper' });
  const firstEntry = dataset.privateData.merklePath.path[0];
  assert.ok(firstEntry);
  firstEntry.sibling = (BigInt(firstEntry.sibling) + 1n).toString();
  assert.equal(verifyPreparedDatasetLocally(dataset), false);
});

for (const sampleCount of [24, 96, 1440]) {
  test(`the fixed daily-extrema shape accepts ${sampleCount} raw samples`, async () => {
    const records = generateSensorRecords({
      deviceId: 'edge-temp-001',
      start: new Date('2026-08-27T15:00:00.000Z'),
      samples: sampleCount,
      intervalSeconds: 86_400 / sampleCount,
      seed: 700 + sampleCount,
    });
    const attestation = await prepareDailyExtremaAttestation(records, {
      periodDate: '2026-08-28',
      nonceSeed: `daily-extrema-${sampleCount}`,
    });
    assert.equal(attestation.privateData.hours.length, 24);
    assert.equal(attestation.publicData.observedHourCount, 24);
    assert.equal(attestation.publicData.sampleCount, sampleCount);
    assert.equal(
      evaluatePreparedDailyExtremaLocally(attestation, temperaturePolicy),
      'within-threshold',
    );
    assert.equal(verifyPreparedDailyExtremaLocally(attestation, temperaturePolicy), true);
  });
}

test('missing hours are canonical STOPPED slots and do not fail the observed-range claim', async () => {
  const records = generateSensorRecords({
    deviceId: 'edge-temp-001',
    start: new Date('2026-08-27T15:00:00.000Z'),
    samples: 8,
    intervalSeconds: 3 * 3_600,
    seed: 801,
  });
  const attestation = await prepareDailyExtremaAttestation(records, {
    periodDate: '2026-08-28',
    nonceSeed: 'daily-stopped',
  });
  assert.equal(attestation.publicData.observedHourCount, 8);
  assert.equal(attestation.publicData.stoppedHourCount, 16);
  assert.equal(
    attestation.privateData.hours
      .filter((hour) => !hour.present)
      .every((hour) => hour.sampleCount === 0 && hour.minimum === 0 && hour.maximum === 0),
    true,
  );
  assert.equal(verifyPreparedDailyExtremaLocally(attestation, temperaturePolicy), true);
});

test('valid out-of-range extrema produce a provable outside-threshold result', async () => {
  const records = generateSensorRecords({
    deviceId: 'edge-temp-001',
    start: new Date('2026-08-27T15:00:00.000Z'),
    samples: 24,
    intervalSeconds: 3_600,
    seed: 803,
  });
  records[7]!.temperature = 41;
  const attestation = await prepareDailyExtremaAttestation(records, {
    periodDate: '2026-08-28',
    nonceSeed: 'daily-outside',
  });
  assert.equal(
    evaluatePreparedDailyExtremaLocally(attestation, temperaturePolicy),
    'outside-threshold',
  );
  assert.equal(verifyPreparedDailyExtremaLocally(attestation, temperaturePolicy), false);
});

test('daily extrema commitment and public presence tampering are rejected locally', async () => {
  const records = generateSensorRecords({
    deviceId: 'edge-temp-001',
    start: new Date('2026-08-27T15:00:00.000Z'),
    samples: 24,
    intervalSeconds: 3_600,
    seed: 802,
  });
  const attestation = await prepareDailyExtremaAttestation(records, {
    periodDate: '2026-08-28',
    nonceSeed: 'daily-tamper',
  });
  attestation.privateData.hours[4]!.maximum += 1;
  assert.throws(
    () => evaluatePreparedDailyExtremaLocally(attestation, temperaturePolicy),
    /commitment/i,
  );
  assert.equal(verifyPreparedDailyExtremaLocally(attestation, temperaturePolicy), false);
});
