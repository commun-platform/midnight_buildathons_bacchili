import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalizeSensorRecord,
  generateSensorRecords,
  prepareDataset,
  verifyPreparedDatasetLocally,
} from './index.js';

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
