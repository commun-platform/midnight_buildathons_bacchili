import assert from 'node:assert/strict';
import test from 'node:test';

import type { PreparedDailyExtremaAttestation } from '@midnight-demo/shared';

import {
  canResumePendingDeviceTransaction,
  canResumeProofJob,
  deterministicProofJobId,
  pendingDeviceTransactionRequired,
  proofJobStatusRetryDelayMs,
  requestProofJob,
  sponsorRetryDelayMs,
} from './proof-job.js';

function attestation(
  commitment: string,
  measurementGroupId = '12'.repeat(32),
): PreparedDailyExtremaAttestation {
  const hours = Array.from({ length: 24 }, (_, hourIndex) => ({
    hourIndex,
    present: false,
    minimum: 0,
    maximum: 0,
    sampleCount: 0,
  }));
  return {
    publicData: {
      attestationCommitment: commitment,
      deviceCommitment: 'ab'.repeat(32),
      measurementGroupId,
      policyId: 'temperature-v1',
      policyKey: 'cd'.repeat(32),
      assignmentId: 'device-1-temperature-v1-wave1',
      assignmentKey: 'ef'.repeat(32),
      periodDate: '2026-08-28',
      periodStart: '2026-08-27T15:00:00.000Z',
      periodEnd: '2026-08-28T15:00:00.000Z',
      periodStartEpoch: '1787842800',
      periodEndEpoch: '1787929200',
      hourPresence: Array(24).fill(false) as boolean[],
      observedHourCount: 0,
      stoppedHourCount: 24,
      sampleCount: 0,
      schemaVersion: 5,
      circuitVersion: 3,
    },
    privateData: {
      attestationCommitment: commitment,
      deviceId: 'edge-temp-001',
      deviceCommitment: 'ab'.repeat(32),
      measurementGroupId,
      policyKey: 'cd'.repeat(32),
      assignmentKey: 'ef'.repeat(32),
      periodStartEpoch: '1787842800',
      periodEndEpoch: '1787929200',
      hours,
      nonceHex: '11'.repeat(32),
      schemaVersion: 5,
      circuitVersion: 3,
    },
  };
}

test('Proof Job IDs are deterministic by Device measurement group without disclosing raw readings', () => {
  const first = deterministicProofJobId('project-1', 'device-1', attestation('01'.repeat(32)));
  const repeated = deterministicProofJobId('project-1', 'device-1', attestation('01'.repeat(32)));
  const changedCommitment = deterministicProofJobId(
    'project-1', 'device-1', attestation('02'.repeat(32)),
  );
  const changedGroup = deterministicProofJobId(
    'project-1', 'device-1', attestation('02'.repeat(32), '13'.repeat(32)),
  );
  assert.equal(first, repeated);
  assert.equal(first, changedCommitment);
  assert.notEqual(first, changedGroup);
  assert.match(first, /^proof-[0-9a-f]{48}$/u);
  assert.doesNotMatch(first, /temperature|humidity|private-test/u);
});

test('rejects a loopback-only Device flow because sponsorship requires the gateway', async () => {
  await assert.rejects(requestProofJob({
    networkId: 'preprod',
    indexer: 'http://127.0.0.1:8088',
    indexerWS: 'ws://127.0.0.1:8088',
    node: 'http://127.0.0.1:9944',
    proofServer: 'http://127.0.0.1:6300',
    faucet: 'http://127.0.0.1:8080',
  }, attestation('01'.repeat(32)), true), /sponsorship requires the authenticated Cloudflare gateway/u);
});

test('retries bounded transient Sponsor responses and honors a short Retry-After', () => {
  assert.equal(sponsorRetryDelayMs(503, null, 0), 1_000);
  assert.equal(sponsorRetryDelayMs(409, '5', 1), 5_000);
  assert.equal(sponsorRetryDelayMs(429, '60', 2), 4_000);
  assert.equal(sponsorRetryDelayMs(400, null, 0), null);
});

test('retries transient Proof Job status reads without retrying permanent client errors', () => {
  assert.equal(proofJobStatusRetryDelayMs(503, 0), 1_000);
  assert.equal(proofJobStatusRetryDelayMs(429, 2), 4_000);
  assert.equal(proofJobStatusRetryDelayMs(408, 4), 15_000);
  assert.equal(proofJobStatusRetryDelayMs(404, 0), null);
  assert.equal(proofJobStatusRetryDelayMs(400, 0), null);
});

test('resumes an idempotent Proof Job after proof or sponsorship progress', () => {
  const now = Date.parse('2026-08-29T07:00:00.000Z');
  for (const status of ['ready_for_input', 'proving', 'proof_ready']) {
    assert.equal(canResumeProofJob({
      status,
      leaseExpiresAt: '2026-08-29T08:00:00.000Z',
    }, now), true, status);
    assert.equal(canResumeProofJob({
      status,
      leaseExpiresAt: '2026-08-29T06:00:00.000Z',
    }, now), false, `${status} with expired lease`);
  }
  for (const status of [
    'awaiting_sponsor', 'sponsor_retryable', 'sponsoring', 'sponsored', 'submitted', 'confirmed',
  ]) {
    assert.equal(canResumeProofJob({ status, leaseExpiresAt: null }, now), true, status);
  }

  for (const status of ['pending', 'dispatched', 'dead_lettered']) {
    assert.equal(canResumeProofJob({ status, leaseExpiresAt: null }, now), false, status);
  }
});

test('reuses a saved Device transaction without repeating proof generation', () => {
  expectPendingResume('proof_ready', true, false);
  for (const status of [
    'awaiting_sponsor', 'sponsor_retryable', 'sponsoring', 'sponsored', 'submitted', 'confirmed',
  ]) {
    expectPendingResume(status, true, true);
  }
  expectPendingResume('ready_for_input', false, false);
});

function expectPendingResume(status: string, resumes: boolean, required: boolean): void {
  assert.equal(canResumePendingDeviceTransaction(status, true), resumes, `${status} with artifact`);
  assert.equal(canResumePendingDeviceTransaction(status, false), false, `${status} without artifact`);
  assert.equal(pendingDeviceTransactionRequired(status), required, `${status} requirement`);
}
