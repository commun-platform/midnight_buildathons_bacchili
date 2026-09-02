import { describe, expect, it } from 'vitest';

import {
  HourThresholdResult,
  ThresholdMode,
  pureCircuits,
  type Ledger,
} from '@midnight-demo/sensor-registry-contract/contract';
import { hexToBytes } from '@midnight-demo/shared';

import {
  publicAttestationFromLedgerTransition,
  verifyPublicAttestationLedger,
  type PublicAttestationRecord,
} from './public-verifier.js';

const commitment = '11'.repeat(32);
const policyKey = '22'.repeat(32);
const assignmentKey = '33'.repeat(32);
const deviceCommitment = hexToBytes('44'.repeat(32));
const measurementGroupId = '88'.repeat(32);
const attestationId = pureCircuits.deriveAttestationId(
  deviceCommitment,
  hexToBytes(measurementGroupId),
);

const input: PublicAttestationRecord = {
  contractAddress: '55'.repeat(32),
  periodDate: '2026-08-28',
  attestationCommitment: commitment,
  measurementGroupId,
  deviceCommitment: '44'.repeat(32),
  policyKey,
  assignmentKey,
  assignmentVersion: 1,
  assignmentValidFrom: '2026-08-28T00:00:00.000Z',
  assignmentValidUntil: null,
  operationalDay: {
    timeZoneOffsetMinutes: 0,
    localDayStartHour: 0,
    utcDayStartMinute: 0,
  },
  sampleCount: 1_440,
  observedHourCount: 24,
  hourPresence: Array.from({ length: 24 }, () => true),
  hourResults: Array.from({ length: 24 }, () => 'within-threshold'),
  thresholdSatisfied: true,
  schemaVersion: 7,
  circuitVersion: 5,
  policy: {
    mode: 'closed-range',
    minimum: 10,
    maximum: 35,
    valueScale: 100,
    sensorType: 'temperature',
    unit: '°C',
    version: 1,
  },
  transactions: {
    attest: {
      txId: '66'.repeat(32),
      txHash: '77'.repeat(32),
      blockHeight: '2315165',
    },
  },
};

function map<T>(key: string, value: T) {
  return {
    member(candidate: Uint8Array) {
      return Buffer.from(candidate).toString('hex') === key;
    },
    lookup() {
      return value;
    },
    *[Symbol.iterator]() {
      yield [hexToBytes(key), value] as [Uint8Array, T];
    },
  };
}

function emptyMap<T>() {
  return {
    member: () => false,
    lookup: () => {
      throw new Error('missing map value');
    },
    *[Symbol.iterator](): Generator<[Uint8Array, T]> {},
  };
}

function ledger(overrides: Record<string, unknown> = {}): Ledger {
  return {
    attestations: map(Buffer.from(attestationId).toString('hex'), {
      attestationCommitment: hexToBytes(commitment),
      measurementGroupId: hexToBytes(measurementGroupId),
      deviceCommitment,
      policyId: hexToBytes(policyKey),
      assignmentId: hexToBytes(assignmentKey),
      measurementDay: 20_693n,
      periodStart: 1_787_875_200n,
      periodEnd: 1_787_961_600n,
      hourPresence: input.hourPresence,
      hourResults: Array.from({ length: 24 }, () => HourThresholdResult.withinThreshold),
      observedHourCount: 24n,
      sampleCount: 1_440n,
      schemaVersion: 7n,
      circuitVersion: 5n,
      thresholdSatisfied: true,
      verified: true,
    }),
    policies: map(policyKey, {
      mode: ThresholdMode.closedRange,
      minimumCentiOffset: 11_000n,
      maximumCentiOffset: 13_500n,
      valueScale: 100n,
      sensorTypeCode: 1n,
      unitCode: 1n,
      version: 1n,
    }),
    policyAssignments: map(assignmentKey, {
      policyId: hexToBytes(policyKey),
      deviceCommitment,
      timeZoneOffsetMinutesBias: 840n,
      localDayStartHour: 0n,
      utcDayStartMinute: 0n,
      validFrom: 1_787_875_200n,
      validUntil: 0n,
      version: 1n,
    }),
    ...overrides,
  } as unknown as Ledger;
}

describe('public Midnight attestation verification', () => {
  it('accepts matching on-chain Attestation, Policy, and Assignment state', () => {
    expect(verifyPublicAttestationLedger(input, ledger())).toEqual({
      dailyAttestationRecorded: true,
      committedHourlyExtrema: true,
      attestationVerified: true,
    });
  });

  it('rejects tampered public sample counts and policy bounds', () => {
    expect(verifyPublicAttestationLedger({ ...input, sampleCount: 96 }, ledger())).toEqual({
      dailyAttestationRecorded: true,
      committedHourlyExtrema: false,
      attestationVerified: false,
    });
    expect(verifyPublicAttestationLedger({
      ...input,
      policy: { ...input.policy, maximum: 36 },
    }, ledger())).toEqual({
      dailyAttestationRecorded: true,
      committedHourlyExtrema: true,
      attestationVerified: false,
    });
  });

  it('does not accept a D1 record whose commitment is absent from the Contract', () => {
    const absent = ledger({
      attestations: {
        member: () => false,
        lookup: () => {
          throw new Error('must not be read');
        },
      },
    });
    expect(verifyPublicAttestationLedger(input, absent)).toEqual({
      dailyAttestationRecorded: false,
      committedHourlyExtrema: false,
      attestationVerified: false,
    });
  });

  it('builds the viewer record only from the attestation added by the transaction', () => {
    const previous = ledger({ attestations: emptyMap() });
    const record = publicAttestationFromLedgerTransition(
      '55'.repeat(32),
      ledger(),
      previous,
      {
        txId: '66'.repeat(32),
        txHash: '77'.repeat(32),
        blockHeight: 2_315_165,
      },
    );
    expect(record).toMatchObject({
      proofJobId: null,
      periodDate: '2026-08-28',
      deviceCommitment: '44'.repeat(32),
      hourResults: Array.from({ length: 24 }, () => 'within-threshold'),
      assignmentValidFrom: '2026-08-28T00:00:00.000Z',
      assignmentValidUntil: null,
      policy: {
        minimum: 10,
        maximum: 35,
        valueScale: 100,
        unit: '°C',
      },
      checks: {
        dailyAttestationRecorded: true,
        committedHourlyExtrema: true,
        attestationVerified: true,
        midnightConfirmed: true,
      },
    });
  });

  it('rejects a transaction that did not add a new attestation', () => {
    expect(() => publicAttestationFromLedgerTransition(
      '55'.repeat(32),
      ledger(),
      ledger(),
      {
        txId: '66'.repeat(32),
        txHash: '77'.repeat(32),
        blockHeight: 2_315_165,
      },
    )).toThrow('does not add exactly one daily attestation');
  });
});
