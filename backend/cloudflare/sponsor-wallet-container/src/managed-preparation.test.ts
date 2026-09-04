import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { SensorRecord } from '@midnight-demo/shared/runtime';

import { prepareManagedAttestation } from './managed-preparation.js';

function records(outside = false): SensorRecord[] {
  return Array.from({ length: 24 }, (_value, hour) => ({
    deviceId: 'managed-device-test',
    timestamp: new Date(Date.parse('2026-08-29T15:00:00.000Z') + hour * 3_600_000).toISOString(),
    temperature: outside && hour === 7 ? 41 : 20 + hour / 100,
    humidity: 0,
  }));
}

const base = {
  deviceId: 'managed-device-test',
  periodDate: '2026-08-30',
  measurementGroupId: 'managed:test:2026-08-30',
  timeZoneOffsetMinutes: 540,
  localDayStartHour: 0,
  policyId: 'temperature-v1',
  assignmentId: 'managed-assignment-test',
  policy: {
    policyId: 'temperature-v1',
    mode: 'closed-range' as const,
    minimum: 10,
    maximum: 35,
    valueScale: 100,
    sensorTypeCode: 1,
    unitCode: 1,
    version: 1,
  },
};

describe('Managed Attestation preparation', () => {
  it('creates the existing fixed 24-slot private input without a Wallet', async () => {
    const result = await prepareManagedAttestation({ ...base, records: records() });
    assert.equal(result.attestation.privateData.hours.length, 24);
    assert.equal(result.attestation.publicData.observedHourCount, 24);
    assert.equal(result.thresholdSatisfied, true);
    assert.equal(result.hourResults.every((value) => value === 'within-threshold'), true);
  });

  it('preserves a truthful outside-threshold outcome', async () => {
    const result = await prepareManagedAttestation({ ...base, records: records(true) });
    assert.equal(result.thresholdSatisfied, false);
    assert.equal(result.hourResults[7], 'outside-threshold');
  });
});
