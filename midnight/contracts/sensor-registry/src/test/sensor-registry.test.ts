import {
  CostModel,
  QueryContext,
  createConstructorContext,
  sampleContractAddress,
  type CircuitContext,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  encodeTemperature,
  evaluatePreparedDailyExtremaHoursLocally,
  generateSensorRecords,
  hexToBytes,
  prepareDailyExtremaAttestation,
  type PreparedDailyExtremaAttestation,
} from '@midnight-demo/shared';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  Contract,
  HourThresholdResult,
  ledger,
  pureCircuits,
  type Ledger,
} from '../managed/sensor-registry/contract/index.js';
import {
  createSensorPrivateState,
  witnesses,
  type SensorPrivateState,
} from '../witnesses.js';

const deviceSecretHex = '11'.repeat(32);
const operatorSecretHex = '22'.repeat(32);

function thresholdPolicy(
  maximum = 35,
  mode: 0 | 1 | 2 = 0,
  minimum = 10,
) {
  return {
    mode,
    minimumCentiOffset: mode === 1 ? 0n : encodeTemperature(minimum),
    maximumCentiOffset: mode === 2 ? 0xffff_ffffn : encodeTemperature(maximum),
    valueScale: 100n,
    sensorTypeCode: 1n,
    unitCode: 1n,
    version: 1n,
  };
}

class SensorRegistrySimulator {
  readonly contract: Contract<SensorPrivateState>;
  context: CircuitContext<SensorPrivateState>;

  constructor(
    readonly attestation: PreparedDailyExtremaAttestation,
    localDeviceSecret = deviceSecretHex,
    localOperatorSecret = operatorSecretHex,
    constructorOperatorSecret = operatorSecretHex,
  ) {
    this.contract = new Contract<SensorPrivateState>(witnesses);
    const privateState = createSensorPrivateState(
      [attestation.privateData],
      localDeviceSecret,
      localOperatorSecret,
    );
    const initial = this.contract.initialState(
      createConstructorContext(privateState, '0'.repeat(64)),
      pureCircuits.deriveOperatorAuthority(hexToBytes(constructorOperatorSecret)),
    );
    this.context = {
      currentPrivateState: initial.currentPrivateState,
      currentZswapLocalState: initial.currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(
        initial.currentContractState.data,
        sampleContractAddress(),
      ),
    };
  }

  registerPolicy(maximum = 35, mode: 0 | 1 | 2 = 0, minimum = 10): void {
    const publicData = this.attestation.publicData;
    this.context = this.contract.impureCircuits.registerDevice(
      this.context,
      hexToBytes(publicData.deviceCommitment),
      pureCircuits.deriveDeviceAuthority(hexToBytes(deviceSecretHex)),
      1n,
    ).context;
    this.context = this.contract.impureCircuits.registerThresholdPolicy(
      this.context,
      hexToBytes(publicData.policyKey),
      thresholdPolicy(maximum, mode, minimum),
    ).context;
    this.context = this.contract.impureCircuits.registerPolicyAssignment(
      this.context,
      hexToBytes(publicData.assignmentKey),
      hexToBytes(publicData.policyKey),
      hexToBytes(publicData.deviceCommitment),
      BigInt(publicData.periodStartEpoch),
      0n,
      1n,
    ).context;
  }

  submit(
    presence = this.attestation.publicData.hourPresence,
    thresholdSatisfied = true,
    hourResults: HourThresholdResult[] = presence.map((present) => present
      ? HourThresholdResult.withinThreshold
      : HourThresholdResult.noData),
  ): Ledger {
    const publicData = this.attestation.publicData;
    this.context = this.contract.impureCircuits.submitDailyAttestation(
      this.context,
      hexToBytes(publicData.attestationCommitment),
      hexToBytes(publicData.deviceCommitment),
      hexToBytes(publicData.measurementGroupId),
      hexToBytes(publicData.assignmentKey),
      BigInt(publicData.measurementDay),
      BigInt(publicData.periodStartEpoch),
      BigInt(publicData.periodEndEpoch),
      presence,
      hourResults,
      BigInt(publicData.sampleCount),
      thresholdSatisfied,
      BigInt(publicData.schemaVersion),
      BigInt(publicData.circuitVersion),
    ).context;
    return ledger(this.context.currentQueryContext.state);
  }
}

function attestationId(attestation: PreparedDailyExtremaAttestation): Uint8Array {
  return pureCircuits.deriveAttestationId(
    hexToBytes(attestation.publicData.deviceCommitment),
    hexToBytes(attestation.publicData.measurementGroupId),
  );
}

async function preparedDaily(sampleCount = 24, maximumTemperature = 28) {
  const records = generateSensorRecords({
    deviceId: 'edge-temp-001',
    start: new Date('2026-08-28T00:00:00.000Z'),
    samples: sampleCount,
    intervalSeconds: 86_400 / sampleCount,
    seed: 101,
  });
  if (maximumTemperature > 35 && records[5]) records[5].temperature = maximumTemperature;
  return prepareDailyExtremaAttestation(records, {
    periodDate: '2026-08-28',
    policyId: 'temperature-v1',
    assignmentId: 'edge-temp-001-temperature-v1-wave1',
    nonceSeed: `contract-daily-${sampleCount}-${maximumTemperature}`,
  });
}

describe('SensorRegistry hourly-extrema contract', () => {
  let valid: PreparedDailyExtremaAttestation;

  beforeAll(async () => {
    valid = await preparedDaily();
  });

  it('registers an immutable public policy and proves 24 hourly extrema in one transaction', () => {
    const simulator = new SensorRegistrySimulator(valid);
    simulator.registerPolicy();
    const state = simulator.submit();
    const attestation = state.attestations.lookup(attestationId(valid));

    expect(state.policyCount).toBe(1n);
    expect(state.deviceCount).toBe(1n);
    expect(state.assignmentCount).toBe(1n);
    expect(state.attestationCount).toBe(1n);
    expect(attestation.verified).toBe(true);
    expect(attestation.observedHourCount).toBe(24n);
    expect(attestation.sampleCount).toBe(24n);
    expect(attestation.thresholdSatisfied).toBe(true);
    expect(attestation.hourResults).toEqual(Array(24).fill(HourThresholdResult.withinThreshold));
    expect(attestation.policyId).toEqual(hexToBytes(valid.publicData.policyKey));
    expect(attestation.attestationCommitment).toEqual(
      hexToBytes(valid.publicData.attestationCommitment),
    );
    expect(attestation.measurementGroupId).toEqual(hexToBytes(valid.publicData.measurementGroupId));
  });

  it('accepts missing hours as canonical STOPPED slots', async () => {
    const records = generateSensorRecords({
      deviceId: 'edge-temp-001',
      start: new Date('2026-08-28T00:00:00.000Z'),
      samples: 12,
      intervalSeconds: 7_200,
      seed: 102,
    });
    const canonical = await prepareDailyExtremaAttestation(records, {
      periodDate: '2026-08-28',
      assignmentId: 'edge-temp-001-temperature-v1-wave1',
      nonceSeed: 'contract-stopped-hours',
    });
    const simulator = new SensorRegistrySimulator(canonical);
    simulator.registerPolicy();
    const state = simulator.submit();
    expect(state.attestations.lookup(
      attestationId(canonical),
    ).hourResults.filter((result) => result === HourThresholdResult.noData)).toHaveLength(12);
  });

  it('accepts a fully STOPPED day without treating it as fraud', async () => {
    const stopped = await prepareDailyExtremaAttestation([], {
      deviceId: 'edge-temp-001',
      periodDate: '2026-08-28',
      assignmentId: 'edge-temp-001-temperature-v1-wave1',
      nonceSeed: 'contract-fully-stopped',
    });
    const simulator = new SensorRegistrySimulator(stopped);
    simulator.registerPolicy();
    const attestation = simulator.submit().attestations.lookup(
      attestationId(stopped),
    );
    expect(attestation.observedHourCount).toBe(0n);
    expect(attestation.sampleCount).toBe(0n);
    expect(attestation.thresholdSatisfied).toBe(true);
    expect(attestation.hourResults).toEqual(Array(24).fill(HourThresholdResult.noData));
    expect(attestation.verified).toBe(true);
  });

  it('supports upper-only and lower-only public policies with the same circuit', () => {
    const upper = new SensorRegistrySimulator(valid);
    upper.registerPolicy(35, 1);
    expect(upper.submit().lastAttestationThresholdSatisfied).toBe(true);

    const lower = new SensorRegistrySimulator(valid);
    lower.registerPolicy(35, 2, 10);
    expect(lower.submit().lastAttestationThresholdSatisfied).toBe(true);
  });

  it('proves an observed hourly maximum as OUTSIDE without disclosing it', async () => {
    const outside = await preparedDaily(24, 40);
    outside.privateData.hours[5]!.maximum = 40;
    const simulator = new SensorRegistrySimulator(outside);
    simulator.registerPolicy(35);
    const hourResults = evaluatePreparedDailyExtremaHoursLocally(outside, {
      policyId: 'temperature-v1',
      mode: 'closed-range',
      minimum: 10,
      maximum: 35,
      valueScale: 100,
      sensorTypeCode: 1,
      unitCode: 1,
      version: 1,
    }).map((result) => result === 'outside-threshold'
      ? HourThresholdResult.outsideThreshold
      : result === 'within-threshold'
        ? HourThresholdResult.withinThreshold
        : HourThresholdResult.noData);
    const state = simulator.submit(outside.publicData.hourPresence, false, hourResults);
    const attestation = state.attestations.lookup(attestationId(outside));
    expect(attestation.verified).toBe(true);
    expect(attestation.thresholdSatisfied).toBe(false);
    expect(attestation.hourResults[5]).toBe(HourThresholdResult.outsideThreshold);
    expect(state.lastAttestationThresholdSatisfied).toBe(false);
  });

  it('rejects a claimed threshold result that disagrees with private extrema', async () => {
    const outside = await preparedDaily(24, 40);
    outside.privateData.hours[5]!.maximum = 40;
    const outsideSimulator = new SensorRegistrySimulator(outside);
    outsideSimulator.registerPolicy(35);
    expect(() => outsideSimulator.submit()).toThrow('threshold result mismatch');

    const withinSimulator = new SensorRegistrySimulator(await preparedDaily());
    withinSimulator.registerPolicy(35);
    expect(() => withinSimulator.submit(
      withinSimulator.attestation.publicData.hourPresence,
      false,
    )).toThrow('threshold result mismatch');

    const hourlyTamper = new SensorRegistrySimulator(await preparedDaily());
    hourlyTamper.registerPolicy(35);
    const falseHourlyResults = Array(24).fill(HourThresholdResult.withinThreshold);
    falseHourlyResults[7] = HourThresholdResult.outsideThreshold;
    expect(() => hourlyTamper.submit(
      hourlyTamper.attestation.publicData.hourPresence,
      true,
      falseHourlyResults,
    )).toThrow('hour threshold result mismatch');
  });

  it('rejects the same Device measurement group even when its commitment changes', async () => {
    const first = await preparedDaily();
    const repeated = await prepareDailyExtremaAttestation(generateSensorRecords({
      deviceId: 'edge-temp-001',
      start: new Date('2026-08-28T00:00:00.000Z'),
      samples: 24,
      intervalSeconds: 3_600,
      seed: 909,
    }), {
      periodDate: '2026-08-28',
      assignmentId: 'edge-temp-001-temperature-v1-wave1',
      nonceSeed: 'same-group-different-commitment',
    });
    expect(repeated.publicData.measurementGroupId).toBe(first.publicData.measurementGroupId);
    expect(repeated.publicData.attestationCommitment).not.toBe(first.publicData.attestationCommitment);

    const simulator = new SensorRegistrySimulator(first);
    simulator.registerPolicy();
    simulator.submit();
    simulator.context.currentPrivateState = {
      ...simulator.context.currentPrivateState,
      dailyAttestations: [first.privateData, repeated.privateData],
    };
    const publicData = repeated.publicData;
    expect(() => simulator.contract.impureCircuits.submitDailyAttestation(
      simulator.context,
      hexToBytes(publicData.attestationCommitment),
      hexToBytes(publicData.deviceCommitment),
      hexToBytes(publicData.measurementGroupId),
      hexToBytes(publicData.assignmentKey),
      BigInt(publicData.measurementDay),
      BigInt(publicData.periodStartEpoch),
      BigInt(publicData.periodEndEpoch),
      publicData.hourPresence,
      publicData.hourPresence.map((present) => present
        ? HourThresholdResult.withinThreshold
        : HourThresholdResult.noData),
      BigInt(publicData.sampleCount),
      true,
      BigInt(publicData.schemaVersion),
      BigInt(publicData.circuitVersion),
    )).toThrow('measurement group already attested');
  });

  it('rejects commitment, presence, and policy-assignment tampering', async () => {
    const commitmentTamper = new SensorRegistrySimulator(await preparedDaily());
    commitmentTamper.registerPolicy();
    commitmentTamper.attestation.privateData.hours[3]!.maximum += 1;
    expect(() => commitmentTamper.submit()).toThrow('daily extrema commitment mismatch');

    const presenceAttestation = await preparedDaily();
    const presenceTamper = new SensorRegistrySimulator(presenceAttestation);
    presenceTamper.registerPolicy();
    const presence = [...presenceAttestation.publicData.hourPresence];
    presence[2] = !presence[2];
    expect(() => presenceTamper.submit(presence)).toThrow('hour presence mismatch');

    const assignmentTamper = new SensorRegistrySimulator(await preparedDaily());
    assignmentTamper.registerPolicy();
    assignmentTamper.attestation.privateData.assignmentKey = '33'.repeat(32);
    expect(() => assignmentTamper.submit()).toThrow('daily extrema commitment mismatch');
  });

  it('separates Device and Operator authorities', () => {
    const wrongDevice = new SensorRegistrySimulator(valid, '33'.repeat(32));
    wrongDevice.registerPolicy();
    expect(() => wrongDevice.submit()).toThrow('device is not authorized');

    const wrongPolicy = new SensorRegistrySimulator(
      valid,
      deviceSecretHex,
      '33'.repeat(32),
    );
    expect(() => wrongPolicy.registerPolicy()).toThrow('operator is not authorized');
  });

  it('binds each policy assignment to exactly one registered device', async () => {
    const second = await prepareDailyExtremaAttestation(generateSensorRecords({
      deviceId: 'edge-temp-002',
      start: new Date('2026-08-28T00:00:00.000Z'),
      samples: 24,
      intervalSeconds: 3_600,
      seed: 202,
    }), {
      periodDate: '2026-08-28',
      policyId: 'temperature-v1',
      assignmentId: 'shared-assignment-attempt',
      nonceSeed: 'second-device-assignment-binding',
    });
    const simulator = new SensorRegistrySimulator(second);
    const firstCommitment = hexToBytes(valid.publicData.deviceCommitment);
    const secondCommitment = hexToBytes(second.publicData.deviceCommitment);
    const firstAuthority = pureCircuits.deriveDeviceAuthority(hexToBytes('55'.repeat(32)));
    const secondAuthority = pureCircuits.deriveDeviceAuthority(hexToBytes(deviceSecretHex));
    simulator.context = simulator.contract.impureCircuits.registerDevice(
      simulator.context, firstCommitment, firstAuthority, 1n,
    ).context;
    simulator.context = simulator.contract.impureCircuits.registerDevice(
      simulator.context, secondCommitment, secondAuthority, 1n,
    ).context;
    simulator.context = simulator.contract.impureCircuits.registerThresholdPolicy(
      simulator.context,
      hexToBytes(second.publicData.policyKey),
      thresholdPolicy(),
    ).context;
    simulator.context = simulator.contract.impureCircuits.registerPolicyAssignment(
      simulator.context,
      hexToBytes(second.publicData.assignmentKey),
      hexToBytes(second.publicData.policyKey),
      firstCommitment,
      BigInt(second.publicData.periodStartEpoch),
      0n,
      1n,
    ).context;
    expect(() => simulator.submit()).toThrow('policy assignment belongs to another device');
  });

  it('prevents a disabled device from submitting further attestations', () => {
    const simulator = new SensorRegistrySimulator(valid);
    simulator.registerPolicy();
    simulator.context = simulator.contract.impureCircuits.disableDevice(
      simulator.context,
      hexToBytes(valid.publicData.deviceCommitment),
    ).context;
    expect(() => simulator.submit()).toThrow('device is disabled');
    expect(ledger(simulator.context.currentQueryContext.state).disabledDeviceCount).toBe(1n);
  });

  it('allows only the Operator to rotate an active Device Authority with a higher version', () => {
    const simulator = new SensorRegistrySimulator(valid);
    simulator.registerPolicy();
    const replacementSecret = '44'.repeat(32);
    const replacementAuthority = pureCircuits.deriveDeviceAuthority(hexToBytes(replacementSecret));
    simulator.context = simulator.contract.impureCircuits.rotateDeviceAuthority(
      simulator.context,
      hexToBytes(valid.publicData.deviceCommitment),
      replacementAuthority,
      2n,
    ).context;
    const registered = ledger(simulator.context.currentQueryContext.state).devices.lookup(
      hexToBytes(valid.publicData.deviceCommitment),
    );
    expect(registered.version).toBe(2n);
    expect(registered.authority).toEqual(replacementAuthority);
    expect(() => simulator.submit()).toThrow('device is not authorized');

    simulator.context.currentPrivateState = {
      ...simulator.context.currentPrivateState,
      deviceSecretHex: replacementSecret,
    };
    expect(simulator.submit().lastAttestationThresholdSatisfied).toBe(true);
  });

  it('rejects Device Authority reuse across registration and rotation', async () => {
    const second = await prepareDailyExtremaAttestation(generateSensorRecords({
      deviceId: 'edge-temp-002',
      start: new Date('2026-08-28T00:00:00.000Z'),
      samples: 24,
      intervalSeconds: 3_600,
      seed: 203,
    }), {
      periodDate: '2026-08-28',
      assignmentId: 'edge-temp-002-temperature-v1-wave1',
      nonceSeed: 'second-device-authority-reuse',
    });
    const simulator = new SensorRegistrySimulator(valid);
    simulator.registerPolicy();
    const existingAuthority = pureCircuits.deriveDeviceAuthority(hexToBytes(deviceSecretHex));
    expect(() => simulator.contract.impureCircuits.registerDevice(
      simulator.context,
      hexToBytes(second.publicData.deviceCommitment),
      existingAuthority,
      1n,
    )).toThrow('device authority is already registered');

    const replacementAuthority = pureCircuits.deriveDeviceAuthority(hexToBytes('66'.repeat(32)));
    simulator.context = simulator.contract.impureCircuits.registerDevice(
      simulator.context,
      hexToBytes(second.publicData.deviceCommitment),
      replacementAuthority,
      1n,
    ).context;
    expect(() => simulator.contract.impureCircuits.rotateDeviceAuthority(
      simulator.context,
      hexToBytes(second.publicData.deviceCommitment),
      existingAuthority,
      2n,
    )).toThrow('device authority is already registered');
  });
});
