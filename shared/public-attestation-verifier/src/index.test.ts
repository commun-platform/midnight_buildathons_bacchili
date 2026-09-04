import { describe, expect, it } from 'vitest';

import {
  HourThresholdResult,
  ThresholdMode,
  type Ledger,
} from '@midnight-demo/sensor-registry-contract/contract';
import { bytesToHex, hexToBytes } from '@midnight-demo/shared';

import {
  publicAttestationFromLedger,
  verifyAttestationTransaction,
} from './index.js';

const commitment = '11'.repeat(32);
const policyKey = '22'.repeat(32);
const assignmentKey = '33'.repeat(32);
const deviceCommitment = hexToBytes('44'.repeat(32));

function map<T>(key: string, value: T) {
  return {
    member(candidate: Uint8Array) {
      return bytesToHex(candidate) === key;
    },
    lookup() {
      return value;
    },
    *[Symbol.iterator]() {
      yield [hexToBytes(key), value] as [Uint8Array, T];
    },
  };
}

function ledger(): Ledger {
  return {
    lastAttestationCommitment: hexToBytes(commitment),
    attestations: map('99'.repeat(32), {
      attestationCommitment: hexToBytes(commitment),
      measurementGroupId: hexToBytes('88'.repeat(32)),
      deviceCommitment,
      policyId: hexToBytes(policyKey),
      assignmentId: hexToBytes(assignmentKey),
      measurementDay: 20_693n,
      periodStart: 1_787_875_200n,
      periodEnd: 1_787_961_600n,
      hourPresence: Array.from({ length: 24 }, () => true),
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
  } as unknown as Ledger;
}

describe('public attestation verifier', () => {
  it('extracts only public evidence from the successful Contract state', () => {
    const record = publicAttestationFromLedger(
      '55'.repeat(32),
      ledger(),
      {
        txId: '66'.repeat(33),
        txHash: '77'.repeat(32),
        blockHeight: 2_315_165,
        status: 'SUCCESS',
        explorerUrl: `https://preprod.midnightexplorer.com/transactions/${'77'.repeat(32)}`,
      },
    );
    expect(record).toMatchObject({
      periodDate: '2026-08-28',
      sampleCount: 1_440,
      observedHourCount: 24,
      thresholdResult: 'within-threshold',
      policy: { minimum: 10, maximum: 35, unit: '°C' },
      checks: {
        transactionConfirmed: true,
        publicAttestationRecorded: true,
        thresholdPolicyBound: true,
      },
      privacy: {
        rawSamples: 'not-public',
        hourlyExtrema: 'not-public',
        proofNonce: 'not-public',
      },
    });
    expect(JSON.stringify(record)).not.toContain('private');
  });

  it('rejects invalid hashes before contacting the Midnight Indexer', async () => {
    let fetched = false;
    await expect(verifyAttestationTransaction('not-a-hash', async () => {
      fetched = true;
      return Response.json({});
    })).rejects.toThrow('64 hexadecimal characters');
    expect(fetched).toBe(false);
  });

  it('rejects unsuccessful Midnight transactions', async () => {
    await expect(verifyAttestationTransaction('77'.repeat(32), async () => Response.json({
      data: {
        transactions: [{
          hash: '77'.repeat(32),
          identifiers: ['66'.repeat(33)],
          transactionResult: { status: 'FAILURE' },
          contractActions: [],
          block: { height: 2_315_165 },
        }],
      },
    }))).rejects.toThrow('not accepted successfully');
  });
});
