import { describe, expect, it } from 'vitest';

import {
  ThresholdMode,
  pureCircuits,
  type Ledger,
} from '@midnight-demo/sensor-registry-contract/contract';
import { hexToBytes } from '@midnight-demo/shared';

import {
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
  attestationCommitment: commitment,
  measurementGroupId,
  policyKey,
  assignmentKey,
  sampleCount: 1_440,
  observedHourCount: 24,
  hourPresence: Array.from({ length: 24 }, () => true),
  thresholdSatisfied: true,
  schemaVersion: 5,
  circuitVersion: 3,
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
      periodStart: 0n,
      periodEnd: 0n,
      hourPresence: input.hourPresence,
      observedHourCount: 24n,
      sampleCount: 1_440n,
      schemaVersion: 5n,
      circuitVersion: 3n,
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
      validFrom: 0n,
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
});
