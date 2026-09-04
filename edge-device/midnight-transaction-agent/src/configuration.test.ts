import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { DeviceOperationConfiguration } from '@midnight-demo/device-auth';

import { applyDeviceOperationConfiguration } from './config.js';

function configuration(version = 1, address = 'ab'.repeat(32)): DeviceOperationConfiguration {
  return {
    schemaVersion: 2,
    configurationVersion: version,
    updatedAt: `2026-08-${String(27 + version).padStart(2, '0')}T00:00:00.000Z`,
    device: {
      deviceId: 'edge-test-001',
      projectId: 'project-test-001',
      sensorType: 'temperature',
      unit: '°C',
    },
    midnight: {
      network: 'preprod',
      contractAddress: address,
      contractSchemaVersion: 5,
      registrationVersion: 1,
    },
    policy: {
      id: 'temperature-v1',
      key: 'cd'.repeat(32),
      mode: 'closed-range',
      minimum: 10,
      maximum: 35,
      valueScale: 100,
      sensorTypeCode: 1,
      unitCode: 1,
      version: 1,
    },
    assignment: {
      id: 'edge-test-001-temperature-v1',
      key: 'ef'.repeat(32),
      version: 1,
      timeZoneOffsetMinutes: 540,
      localDayStartHour: 6,
      utcDayStartMinute: 1260,
      validFrom: null,
      validUntil: null,
    },
    evidence: {
      deviceRegisteredTxId: 'device-registration-tx',
      deviceAuthorityTxId: 'device-authority-tx',
      policyRegisteredTxId: 'policy-registration-tx',
      assignmentRegisteredTxId: 'assignment-registration-tx',
    },
  };
}

test('atomically installs authenticated public operation configuration', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'device-configuration-'));
  const envFile = path.join(temporary, 'device.env');
  const previousDeviceId = process.env.SENSOR_DEVICE_ID;
  const previousProjectId = process.env.SENSOR_PROJECT_ID;
  try {
    process.env.SENSOR_DEVICE_ID = 'edge-test-001';
    process.env.SENSOR_PROJECT_ID = 'project-test-001';
    fs.writeFileSync(envFile, 'UNMANAGED_VALUE=preserved\nDEVICE_CONTRACT_ADDRESS=\n', {
      mode: 0o644,
    });
    const first = applyDeviceOperationConfiguration(configuration(), envFile);
    assert.equal(first.changed, true);
    assert.equal(first.contractAddress, 'ab'.repeat(32));
    const installed = fs.readFileSync(envFile, 'utf8');
    assert.match(installed, /UNMANAGED_VALUE=preserved/u);
    assert.match(installed, new RegExp(`DEVICE_CONTRACT_ADDRESS=${'ab'.repeat(32)}`));
    assert.match(installed, /DEVICE_CONFIGURATION_VERSION=1/u);
    assert.match(installed, /THRESHOLD_POLICY_VERSION=temperature-v1/u);
    assert.match(installed, /POLICY_ASSIGNMENT_ID=edge-test-001-temperature-v1/u);
    assert.match(installed, /TIME_ZONE_OFFSET_MINUTES=540/u);
    assert.match(installed, /LOCAL_DAY_START_HOUR=6/u);
    assert.match(installed, /UTC_DAY_START_MINUTE=1260/u);
    assert.equal(fs.statSync(envFile).mode & 0o777, 0o600);

    const second = applyDeviceOperationConfiguration(configuration(2, '12'.repeat(32)), envFile);
    assert.equal(second.configurationVersion, 2);
    assert.match(
      fs.readFileSync(envFile, 'utf8'),
      new RegExp(`DEVICE_CONTRACT_ADDRESS=${'12'.repeat(32)}`),
    );
  } finally {
    if (previousDeviceId === undefined) delete process.env.SENSOR_DEVICE_ID;
    else process.env.SENSOR_DEVICE_ID = previousDeviceId;
    if (previousProjectId === undefined) delete process.env.SENSOR_PROJECT_ID;
    else process.env.SENSOR_PROJECT_ID = previousProjectId;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('rejects configuration downgrade, same-version conflict, and another Device', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'device-configuration-reject-'));
  const envFile = path.join(temporary, 'device.env');
  const previousDeviceId = process.env.SENSOR_DEVICE_ID;
  const previousProjectId = process.env.SENSOR_PROJECT_ID;
  try {
    process.env.SENSOR_DEVICE_ID = 'edge-test-001';
    process.env.SENSOR_PROJECT_ID = 'project-test-001';
    fs.writeFileSync(envFile, 'DEVICE_CONTRACT_ADDRESS=\n', { mode: 0o600 });
    applyDeviceOperationConfiguration(configuration(2, '12'.repeat(32)), envFile);
    assert.throws(
      () => applyDeviceOperationConfiguration(configuration(1), envFile),
      /downgrade/u,
    );
    assert.throws(
      () => applyDeviceOperationConfiguration(configuration(2, '34'.repeat(32)), envFile),
      /same version/u,
    );
    const another = configuration(3);
    another.device.deviceId = 'another-device';
    assert.throws(
      () => applyDeviceOperationConfiguration(another, envFile),
      /another Device or Project/u,
    );
  } finally {
    if (previousDeviceId === undefined) delete process.env.SENSOR_DEVICE_ID;
    else process.env.SENSOR_DEVICE_ID = previousDeviceId;
    if (previousProjectId === undefined) delete process.env.SENSOR_PROJECT_ID;
    else process.env.SENSOR_PROJECT_ID = previousProjectId;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
