import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { DeviceOperationConfiguration } from '@midnight-demo/device-auth';
import type { PreparedDailyExtremaAttestation } from '@midnight-demo/shared';
import { readOperationalDay, submitCompletedDays } from './daily-submission.js';
import type { SubmissionResult } from './midnight.js';

const configuration: DeviceOperationConfiguration = {
  schemaVersion: 2, configurationVersion: 1, updatedAt: '2026-09-04T00:00:00.000Z',
  device: { deviceId: 'edge-test-001', projectId: 'project-1', sensorType: 'temperature', unit: 'celsius' },
  midnight: { network: 'preprod', contractAddress: 'a'.repeat(64), contractSchemaVersion: 5, registrationVersion: 1 },
  policy: {
    id: 'policy-1', key: 'b'.repeat(64), mode: 'upper-bound', minimum: null, maximum: 70,
    valueScale: 100, sensorTypeCode: 1, unitCode: 1, version: 1,
  },
  assignment: {
    id: 'assignment-1', key: 'c'.repeat(64), version: 1, timeZoneOffsetMinutes: 540,
    localDayStartHour: 0, utcDayStartMinute: 900, validFrom: null, validUntil: null,
  },
  evidence: { deviceRegisteredTxId: 'd', deviceAuthorityTxId: 'd', policyRegisteredTxId: 'p', assignmentRegisteredTxId: 'a' },
};

function fixture(t: { after(fn: () => void): void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'device-daily-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const raw = path.join(root, 'data/raw');
  fs.mkdirSync(raw, { recursive: true });
  return {
    raw,
    options: {
      configuration, dataDirectory: path.join(root, 'data'), stateDirectory: path.join(root, 'state'),
      now: Date.parse('2026-09-06T16:00:00.000Z'),
    },
    sample(measuredAt: string, value = 41) {
      fs.appendFileSync(path.join(raw, `${measuredAt.slice(0, 10)}.ndjson`), `${JSON.stringify({ measuredAt, value })}\n`);
    },
  };
}

function confirmed(): SubmissionResult {
  return {
    attest: { txId: 'tx-1', txHash: 'f'.repeat(64), blockHeight: '123' },
  } as SubmissionResult;
}

test('groups Japan days across UTC files and excludes both boundary neighbours', (t) => {
  const f = fixture(t);
  f.sample('2026-09-04T14:59:00.000Z');
  f.sample('2026-09-04T15:00:00.000Z');
  f.sample('2026-09-05T14:59:00.000Z');
  f.sample('2026-09-05T15:00:00.000Z');
  const records = readOperationalDay(f.raw, configuration, '2026-09-05');
  assert.equal(records.length, 2);
  assert.equal(records[0]?.timestamp, '2026-09-04T15:00:00.000Z');
  assert.equal(records[1]?.timestamp, '2026-09-05T14:59:00.000Z');
});

test('persists random preparation before submission, retries identically, and skips confirmed dates', async (t) => {
  const f = fixture(t);
  f.sample('2026-09-04T15:00:00.000Z');
  const options = { ...f.options, now: Date.parse('2026-09-05T16:00:00.000Z') };
  let initial: PreparedDailyExtremaAttestation | undefined;
  const first = await submitCompletedDays({ ...options, submit: async (dataset) => {
    initial = structuredClone(dataset);
    const scope = fs.readdirSync(options.stateDirectory)[0]!;
    const prepared = path.join(options.stateDirectory, scope, '2026-09-05.prepared.json');
    assert.equal(fs.statSync(prepared).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(prepared)).mode & 0o777, 0o700);
    assert.deepEqual(JSON.parse(fs.readFileSync(prepared, 'utf8')).dataset, dataset);
    return null;
  } });
  assert.deepEqual(first.deferred, ['2026-09-05']);
  const second = await submitCompletedDays({ ...options, submit: async (dataset) => {
    assert.deepEqual(dataset, initial);
    return confirmed();
  } });
  assert.deepEqual(second.confirmed, ['2026-09-05']);
  await submitCompletedDays({ ...options, submit: async () => { assert.fail('confirmed day was resubmitted'); } });
  const receipt = fs.readFileSync(path.join(options.stateDirectory, fs.readdirSync(options.stateDirectory)[0]!, '2026-09-05.receipt.json'), 'utf8');
  assert.doesNotMatch(receipt, /privateData|nonceHex|minimum|maximum|temperature/);
});

test('rejects raw data tampering and preserves the original private preparation', async (t) => {
  const f = fixture(t);
  f.sample('2026-09-04T15:00:00.000Z');
  const options = { ...f.options, now: Date.parse('2026-09-05T16:00:00.000Z') };
  await submitCompletedDays({ ...options, submit: async () => null });
  f.sample('2026-09-04T15:01:00.000Z', 99);
  const report = await submitCompletedDays({ ...options, submit: async () => { assert.fail('tampered data submitted'); } });
  assert.match(report.failed[0]?.error ?? '', /Raw data changed/);
});

test('represents a completely missing day as STOPPED and never prepares the open day', async (t) => {
  const f = fixture(t);
  f.sample('2026-09-04T15:00:00.000Z');
  f.sample('2026-09-06T15:30:00.000Z');
  const inputs: PreparedDailyExtremaAttestation[] = [];
  const report = await submitCompletedDays({ ...f.options, submit: async (dataset) => {
    inputs.push(dataset);
    return confirmed();
  } });
  assert.deepEqual(report.confirmed, ['2026-09-05', '2026-09-06']);
  assert.equal(inputs[0]?.publicData.observedHourCount, 1);
  assert.equal(inputs[1]?.publicData.sampleCount, 0);
  assert.equal(inputs[1]?.publicData.stoppedHourCount, 24);
});

test('waits for the final-sample grace period and respects assignment validity', async (t) => {
  const f = fixture(t);
  f.sample('2026-09-04T15:00:00.000Z');
  const early = await submitCompletedDays({ ...f.options, now: Date.parse('2026-09-05T15:04:59.000Z'), submit: async () => {
    assert.fail('day finalized before grace period');
  } });
  assert.deepEqual(early.confirmed, []);
  const limited = { ...configuration, assignment: { ...configuration.assignment, validFrom: '2026-09-05T15:00:00.000Z' } };
  const result = await submitCompletedDays({ ...f.options, configuration: limited, submit: async (dataset) => {
    assert.equal(dataset.publicData.periodDate, '2026-09-06');
    return confirmed();
  } });
  assert.deepEqual(result.confirmed, ['2026-09-06']);
});

test('a failed day is retried without preventing other completed days from succeeding', async (t) => {
  const f = fixture(t);
  f.sample('2026-09-04T15:00:00.000Z');
  const first = await submitCompletedDays({ ...f.options, submit: async (dataset) => {
    if (dataset.publicData.periodDate === '2026-09-05') throw new Error('temporary network failure');
    return confirmed();
  } });
  assert.equal(first.failed.length, 1);
  assert.deepEqual(first.confirmed, ['2026-09-06']);
  const retry = await submitCompletedDays({ ...f.options, submit: async () => confirmed() });
  assert.deepEqual(retry.confirmed, ['2026-09-05']);
});

test('bounds catch-up work per execution', async (t) => {
  const f = fixture(t);
  f.sample('2026-09-04T15:00:00.000Z');
  const result = await submitCompletedDays({ ...f.options, maxDays: 1, submit: async () => confirmed() });
  assert.deepEqual(result.confirmed, ['2026-09-05']);
});

test('rotates bounded retry batches so a permanently failing old day cannot starve new days', async (t) => {
  const f = fixture(t);
  f.sample('2026-09-04T15:00:00.000Z');
  const dates: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await submitCompletedDays({ ...f.options, maxDays: 1, submit: async (dataset) => {
      dates.push(dataset.publicData.periodDate);
      throw new Error('permanent failure');
    } });
  }
  assert.deepEqual(dates, ['2026-09-05', '2026-09-06', '2026-09-05']);
});

test('rejects malformed, incomplete, misplaced, and duplicated raw measurements without printing their values', (t) => {
  const f = fixture(t);
  const file = path.join(f.raw, '2026-09-04.ndjson');
  fs.writeFileSync(file, '{"secret":"private-value"}\n');
  assert.throws(() => readOperationalDay(f.raw, configuration, '2026-09-05'), /Invalid raw measurement/);
  fs.writeFileSync(file, '{"secret":"private-value"');
  assert.throws(() => readOperationalDay(f.raw, configuration, '2026-09-05'), /Incomplete raw file/);
  fs.writeFileSync(file, 'invalid-private-value\n');
  assert.throws(() => readOperationalDay(f.raw, configuration, '2026-09-05'), /Invalid raw JSON/);
  fs.writeFileSync(file, '{"measuredAt":"2026-09-05T00:00:00.000Z","value":41}\n');
  assert.throws(() => readOperationalDay(f.raw, configuration, '2026-09-05'), /Invalid raw measurement/);
  fs.writeFileSync(file, '');
  f.sample('2026-09-04T15:00:00.000Z');
  f.sample('2026-09-04T15:00:00.000Z');
  assert.throws(() => readOperationalDay(f.raw, configuration, '2026-09-05'), /Duplicate measurement/);
});

test('rejects tampered prepared hourly extrema before remote submission', async (t) => {
  const f = fixture(t);
  f.sample('2026-09-04T15:00:00.000Z');
  const options = { ...f.options, now: Date.parse('2026-09-05T16:00:00.000Z') };
  await submitCompletedDays({ ...options, submit: async () => null });
  const preparedFile = path.join(options.stateDirectory, fs.readdirSync(options.stateDirectory)[0]!, '2026-09-05.prepared.json');
  const stored = JSON.parse(fs.readFileSync(preparedFile, 'utf8'));
  stored.dataset.privateData.hours[0].maximum = 42;
  fs.writeFileSync(preparedFile, JSON.stringify(stored));
  const result = await submitCompletedDays({ ...options, submit: async () => { assert.fail('tampered input submitted'); } });
  assert.match(result.failed[0]?.error ?? '', /does not match its source/);
});

test('keeps potentially private SDK error details out of the public report', async (t) => {
  const f = fixture(t);
  f.sample('2026-09-04T15:00:00.000Z');
  const report = await submitCompletedDays({ ...f.options, submit: async () => {
    throw new Error('private-proof-input-must-not-be-logged');
  } });
  assert.doesNotMatch(JSON.stringify(report), /private-proof-input/);
  const file = path.join(f.options.stateDirectory, fs.readdirSync(f.options.stateDirectory)[0]!, '2026-09-05.error.json');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.match(fs.readFileSync(file, 'utf8'), /private-proof-input/);
});
