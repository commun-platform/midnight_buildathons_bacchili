import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  addMeasurement,
  createMeasurementWindow,
  evaluateAnomaly,
  finalizeMeasurementWindow,
  initialAnomalyState,
} from './aggregation.js';
import { loadCollectorState, parseTemperature, seedSyntheticDemoWindow } from './collector.js';
import type { EdgeConfig } from './config.js';

test('parses Raspberry Pi millidegrees and decimal Celsius', () => {
  assert.equal(parseTemperature('42125\n'), 42.125);
  assert.equal(parseTemperature('21.75\n'), 21.75);
});

test('rejects invalid and implausible sensor values', () => {
  assert.throws(() => parseTemperature('not-a-number'), /invalid value/);
  assert.throws(() => parseTemperature('250000'), /outside the supported range/);
});

test('quarantines a power-loss-corrupted state file and starts from a safe empty state', () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vsp-edge-corrupt-state-'));
  const config: EdgeConfig = {
    port: 8788,
    intervalSeconds: 1,
    sensorPath: '/unused',
    serviceUrl: 'https://worker.test/api/v1/',
    projectId: 'measurement-authenticity-01',
    deviceId: 'edge-temp-001',
    dataDirectory,
    sensorMode: 'synthetic',
    syntheticBase: 22,
    syntheticAmplitude: 2,
    normalMinimum: 10,
    normalMaximum: 35,
    anomalyHysteresis: 0.5,
    anomalyDebounceSamples: 3,
    anomalyCooldownSeconds: 300,
    thresholdPolicyVersion: 'temperature-v1',
  };
  const stateFile = path.join(dataDirectory, 'collector-state.json');
  fs.writeFileSync(stateFile, Buffer.alloc(354), { mode: 0o600 });
  try {
    assert.deepEqual(loadCollectorState(config), {
      schemaVersion: 1,
      window: null,
      anomaly: initialAnomalyState(),
      syntheticTick: 0,
    });
    assert.equal(fs.existsSync(stateFile), false);
    const quarantined = fs.readdirSync(dataDirectory)
      .filter((name) => name.startsWith('collector-state.json.corrupt-'));
    assert.equal(quarantined.length, 1);
    assert.equal(fs.statSync(path.join(dataDirectory, quarantined[0]!)).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('rolls local samples into one privacy-preserving hourly window', () => {
  const first = new Date('2026-08-28T01:05:00.000Z');
  let state = createMeasurementWindow(first);
  state = addMeasurement(state, 20, first);
  state = addMeasurement(state, 24, new Date('2026-08-28T01:35:00.000Z'));
  const window = finalizeMeasurementWindow({
    state,
    projectId: 'measurement-authenticity-01',
    deviceId: 'edge-temp-001',
    thresholdPolicyVersion: 'temperature-v1',
  });

  assert.equal(window.periodStart, '2026-08-28T01:00:00.000Z');
  assert.equal(window.periodEnd, '2026-08-28T02:00:00.000Z');
  assert.equal(window.count, 2);
  assert.equal(window.minimum, 20);
  assert.equal(window.maximum, 24);
  assert.equal(window.average, 22);
  assert.match(window.commitment, /^[A-Za-z0-9_-]{43}$/);
  assert.equal('values' in window, false);
});

test('emits only debounced anomaly-open and recovered transitions', () => {
  let state = initialAnomalyState();
  const common = {
    projectId: 'measurement-authenticity-01',
    deviceId: 'edge-temp-001',
    normalMinimum: 10,
    normalMaximum: 35,
    hysteresis: 1,
    debounceSamples: 2,
    cooldownSeconds: 1,
    thresholdPolicyVersion: 'temperature-v1',
  };
  let evaluated = evaluateAnomaly({
    ...common,
    state,
    value: 36,
    measuredAt: new Date('2026-08-28T01:00:00.000Z'),
  });
  assert.equal(evaluated.event, null);
  state = evaluated.state;
  evaluated = evaluateAnomaly({
    ...common,
    state,
    value: 36,
    measuredAt: new Date('2026-08-28T01:00:02.000Z'),
  });
  assert.equal(evaluated.event?.transition, 'anomaly_open');
  assert.equal('value' in (evaluated.event ?? {}), false);
  state = evaluated.state;
  evaluated = evaluateAnomaly({
    ...common,
    state,
    value: 20,
    measuredAt: new Date('2026-08-28T01:00:04.000Z'),
  });
  assert.equal(evaluated.event, null);
  state = evaluated.state;
  evaluated = evaluateAnomaly({
    ...common,
    state,
    value: 20,
    measuredAt: new Date('2026-08-28T01:00:06.000Z'),
  });
  assert.equal(evaluated.event?.transition, 'recovered');
});

test('seeds one prior synthetic hour without overwriting collector data', () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vsp-edge-demo-'));
  const config: EdgeConfig = {
    port: 8788,
    intervalSeconds: 1,
    sensorPath: '/unused',
    serviceUrl: 'https://worker.test/api/v1/',
    projectId: 'measurement-authenticity-01',
    deviceId: 'edge-temp-001',
    dataDirectory,
    sensorMode: 'synthetic',
    syntheticBase: 22,
    syntheticAmplitude: 2,
    normalMinimum: 10,
    normalMaximum: 35,
    anomalyHysteresis: 0.5,
    anomalyDebounceSamples: 3,
    anomalyCooldownSeconds: 300,
    thresholdPolicyVersion: 'temperature-v1',
  };
  try {
    const seeded = seedSyntheticDemoWindow(config, 24, new Date('2026-08-28T03:15:00.000Z'));
    assert.deepEqual(seeded, {
      periodStart: '2026-08-28T02:00:00.000Z',
      periodEnd: '2026-08-28T03:00:00.000Z',
      count: 24,
    });
    assert.equal(fs.readdirSync(path.join(dataDirectory, 'raw')).length, 1);
    assert.throws(
      () => seedSyntheticDemoWindow(config, 24, new Date('2026-08-28T03:15:00.000Z')),
      /refuses to overwrite/u,
    );
  } finally {
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
});
