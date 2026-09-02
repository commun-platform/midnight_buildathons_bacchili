import crypto from 'node:crypto';

import { deviceAuthenticatedFetch } from '@midnight-demo/device-auth';
import type {
  HourThresholdResult,
  PreparedDailyExtremaAttestation,
} from '@midnight-demo/shared';

import {
  deviceProofAuthConfig,
  isLocalProofServer,
  type NetworkConfig,
} from './config.js';

export interface ProofJob {
  proofJobId: string;
  projectId: string;
  deviceId: string;
  periodDate: string;
  measurementGroupId: string;
  attestationCommitment: string;
  deviceCommitment: string;
  sampleCount: number;
  thresholdPolicyVersion: string;
  policyKey: string;
  assignmentId: string;
  assignmentKey: string;
  hourPresence: boolean[];
  hourResults: HourThresholdResult[];
  observedHourCount: number;
  stoppedHourCount: number;
  thresholdSatisfied: boolean;
  schemaVersion: number;
  circuitVersion: number;
  status: string;
  attemptCount: number;
  availableAfter: string;
  leaseExpiresAt: string | null;
  deviceTransactionHash: string | null;
  deviceTransactionBytes: number | null;
  sponsorTransactionId: string | null;
  sponsorFeeSpecks: string | null;
  sponsorTransactionBytes: number | null;
  sponsorAttemptCount: number;
  sponsorshipStartedAt: string | null;
  sponsorshipCompletedAt: string | null;
  attestTxId: string | null;
  attestTxHash: string | null;
  errorCode: string | null;
}

export interface SponsoredTransaction {
  accepted: true;
  idempotent: boolean;
  proofJobId: string;
  status: 'submitted' | 'confirmed';
  transactionId: string;
  deviceTransactionHash: string;
  sponsorTransactionId: string;
  transactionHash: string;
  feeSpecks: string;
  feeDust: string;
  deviceTransactionBytes: number;
  transactionBytes: number;
  sponsorshipStartedAt: string;
  sponsorshipCompletedAt: string;
}

export interface ProofJobAdmission {
  local: boolean;
  proofJobId?: string;
  job?: ProofJob;
}

export interface ReportedTransaction {
  txId: string;
  txHash: string | null;
  blockHeight: string;
}

const proofInputStates = new Set(['ready_for_input', 'proving', 'proof_ready']);
const sponsorshipResumeStates = new Set([
  'awaiting_sponsor', 'sponsor_retryable', 'sponsoring', 'sponsored', 'submitted', 'confirmed',
]);
const terminalFailureStates = new Set(['dead_lettered', 'reproof_required']);
const retryableSponsorStatuses = new Set([409, 429, 502, 503, 504]);
const retryableStatusReadStatuses = new Set([408, 429, 500, 502, 503, 504]);

export function canResumeProofJob(
  job: Pick<ProofJob, 'status' | 'leaseExpiresAt'>,
  nowMs = Date.now(),
): boolean {
  if (sponsorshipResumeStates.has(job.status)) return true;
  return proofInputStates.has(job.status)
    && job.leaseExpiresAt !== null
    && Date.parse(job.leaseExpiresAt) > nowMs;
}

export function pendingDeviceTransactionRequired(status: string): boolean {
  return sponsorshipResumeStates.has(status);
}

export function canResumePendingDeviceTransaction(
  status: string,
  hasPendingTransaction: boolean,
): boolean {
  return hasPendingTransaction
    && (status === 'proof_ready' || sponsorshipResumeStates.has(status));
}

export function sponsorRetryDelayMs(
  status: number,
  retryAfter: string | null,
  attempt: number,
): number | null {
  if (!retryableSponsorStatuses.has(status)) return null;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 1 && seconds <= 30) return seconds * 1_000;
  return Math.min(2 ** attempt * 1_000, 15_000);
}

export function proofJobStatusRetryDelayMs(status: number, attempt: number): number | null {
  return retryableStatusReadStatuses.has(status)
    ? Math.min(2 ** attempt * 1_000, 15_000)
    : null;
}

function positiveIntegerEnvironment(name: string, fallback: number, maximum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

function apiUrl(proofServer: string, pathname: string): URL {
  const url = new URL(proofServer);
  url.pathname = pathname;
  url.search = '';
  url.hash = '';
  return url;
}

async function jsonResponse<T>(response: Response, operation: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${operation} failed with HTTP ${response.status}: ${text.slice(0, 240)}`);
  }
  if (text.length > 64 * 1024) throw new Error(`${operation} response is too large`);
  return JSON.parse(text) as T;
}

export function deterministicProofJobId(
  projectId: string,
  deviceId: string,
  attestation: PreparedDailyExtremaAttestation,
): string {
  const digest = crypto.createHash('sha256').update([
    projectId,
    deviceId,
    attestation.publicData.measurementGroupId,
  ].join('\n')).digest('hex');
  return `proof-${digest.slice(0, 48)}`;
}

async function getJob(network: NetworkConfig, proofJobId: string): Promise<ProofJob> {
  const authConfig = deviceProofAuthConfig(network.proofServer);
  const attempts = positiveIntegerEnvironment('MIDNIGHT_JOB_STATUS_REQUEST_ATTEMPTS', 8, 30);
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response;
    try {
      response = await deviceAuthenticatedFetch(
        authConfig,
        'proof:read',
        apiUrl(network.proofServer, `/api/v1/proof-jobs/${encodeURIComponent(proofJobId)}`),
        { signal: AbortSignal.timeout(15_000) },
      );
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(
        resolve,
        proofJobStatusRetryDelayMs(503, attempt) ?? 1_000,
      ));
      continue;
    }
    if (response.ok) {
      return (await jsonResponse<{ job: ProofJob }>(response, 'Read Proof Job')).job;
    }
    const delayMs = proofJobStatusRetryDelayMs(response.status, attempt);
    if (delayMs === null || attempt === attempts - 1) {
      return (await jsonResponse<{ job: ProofJob }>(response, 'Read Proof Job')).job;
    }
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw lastError ?? new Error(`Read Proof Job ${proofJobId} exhausted its retry policy`);
}

export async function requestProofJob(
  network: NetworkConfig,
  attestation: PreparedDailyExtremaAttestation,
  hourResults: HourThresholdResult[],
  thresholdSatisfied: boolean,
): Promise<ProofJobAdmission> {
  if (isLocalProofServer(network.proofServer)) {
    throw new Error('Device transaction sponsorship requires the authenticated Cloudflare gateway');
  }
  const authConfig = deviceProofAuthConfig(network.proofServer);
  const proofJobId = deterministicProofJobId(authConfig.projectId, authConfig.deviceId, attestation);
  const response = await deviceAuthenticatedFetch(
    authConfig,
    'proof:request',
    apiUrl(network.proofServer, '/api/v1/proof-jobs'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proofJobId,
        projectId: authConfig.projectId,
        deviceId: authConfig.deviceId,
        periodDate: attestation.publicData.periodDate,
        measurementGroupId: attestation.publicData.measurementGroupId,
        attestationCommitment: attestation.publicData.attestationCommitment,
        deviceCommitment: attestation.publicData.deviceCommitment,
        sampleCount: attestation.publicData.sampleCount,
        thresholdPolicyVersion: attestation.publicData.policyId,
        policyKey: attestation.publicData.policyKey,
        assignmentId: attestation.publicData.assignmentId,
        assignmentKey: attestation.publicData.assignmentKey,
        measurementDay: attestation.publicData.measurementDay,
        hourPresence: attestation.publicData.hourPresence,
        hourResults,
        observedHourCount: attestation.publicData.observedHourCount,
        thresholdSatisfied,
        schemaVersion: attestation.publicData.schemaVersion,
        circuitVersion: attestation.publicData.circuitVersion,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const { job } = await jsonResponse<{ job: ProofJob }>(response, 'Create Proof Job');
  if (
    job.proofJobId !== proofJobId
    || job.measurementGroupId !== attestation.publicData.measurementGroupId
    || job.attestationCommitment !== attestation.publicData.attestationCommitment
    || job.hourResults.join(',') !== hourResults.join(',')
    || job.thresholdSatisfied !== thresholdSatisfied
  ) {
    throw new Error('Proof Job response does not match the prepared daily attestation');
  }
  return { local: false, proofJobId, job };
}

export async function waitForProofJob(
  network: NetworkConfig,
  admission: ProofJobAdmission,
): Promise<ProofJobAdmission> {
  if (admission.local || !admission.proofJobId) return admission;
  const waitTimeoutMs = positiveIntegerEnvironment(
    'MIDNIGHT_PROOF_JOB_WAIT_TIMEOUT_MS',
    20 * 60 * 60 * 1000,
    48 * 60 * 60 * 1000,
  );
  const pollIntervalMs = positiveIntegerEnvironment(
    'MIDNIGHT_PROOF_JOB_POLL_INTERVAL_MS',
    15_000,
    5 * 60 * 1000,
  );
  const deadline = Date.now() + waitTimeoutMs;
  let job = admission.job;
  while (!job || !canResumeProofJob(job)) {
    if (job && terminalFailureStates.has(job.status)) {
      throw new Error(`Proof Job ${job.proofJobId} failed permanently: ${job.errorCode ?? 'unknown'}`);
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for Proof Job ${admission.proofJobId}; next admission was ${job?.availableAfter ?? 'unknown'}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    job = await getJob(network, admission.proofJobId);
  }
  return { ...admission, job };
}

export async function reportProofTransaction(
  network: NetworkConfig,
  proofJobId: string | undefined,
  phase: 'attest',
  transaction: ReportedTransaction,
): Promise<void> {
  if (!proofJobId || isLocalProofServer(network.proofServer)) return;
  const authConfig = deviceProofAuthConfig(network.proofServer);
  await jsonResponse(await deviceAuthenticatedFetch(
    authConfig,
    'transaction:submit',
    apiUrl(network.proofServer, `/api/v1/proof-jobs/${encodeURIComponent(proofJobId)}/result`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase, ...transaction }),
      signal: AbortSignal.timeout(15_000),
    },
  ), `Report ${phase} transaction`);
}

export async function sponsorProofTransaction(
  network: NetworkConfig,
  proofJobId: string | undefined,
  transaction: Uint8Array,
): Promise<SponsoredTransaction> {
  if (!proofJobId || isLocalProofServer(network.proofServer)) {
    throw new Error('Sponsor submission requires an admitted Cloudflare Proof Job');
  }
  const authConfig = deviceProofAuthConfig(network.proofServer);
  const serializedHash = crypto.createHash('sha256').update(transaction).digest('hex');
  const attempts = positiveIntegerEnvironment('MIDNIGHT_SPONSOR_REQUEST_ATTEMPTS', 8, 30);
  let accepted = false;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response;
    try {
      response = await deviceAuthenticatedFetch(
        authConfig,
        'transaction:submit',
        apiUrl(network.proofServer, `/api/v1/proof-jobs/${encodeURIComponent(proofJobId)}/sponsor`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: Uint8Array.from(transaction).buffer,
          signal: AbortSignal.timeout(60_000),
        },
      );
    } catch (error) {
      if (attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(2 ** attempt * 1_000, 15_000)));
      continue;
    }
    if (response.ok) {
      const result = await jsonResponse<{
        accepted: true;
        proofJobId: string;
        status: string;
        deviceTransactionHash: string;
      }>(response, 'Accept Sponsor transaction');
      if (
        result.proofJobId !== proofJobId
        || result.deviceTransactionHash !== serializedHash
      ) throw new Error('Sponsor acceptance does not match the Device transaction');
      accepted = true;
      break;
    }
    if (attempt === attempts - 1) {
      await jsonResponse(response, 'Accept Sponsor transaction');
    }
    const delayMs = sponsorRetryDelayMs(
      response.status,
      response.headers.get('Retry-After'),
      attempt,
    );
    if (delayMs === null) {
      await jsonResponse(response, 'Accept Sponsor transaction');
      break;
    }
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  if (!accepted) throw new Error('Sponsor transaction exhausted its acceptance retry policy');

  const waitTimeoutMs = positiveIntegerEnvironment(
    'MIDNIGHT_SPONSOR_WAIT_TIMEOUT_MS',
    24 * 60 * 60 * 1000,
    48 * 60 * 60 * 1000,
  );
  const pollIntervalMs = positiveIntegerEnvironment(
    'MIDNIGHT_SPONSOR_POLL_INTERVAL_MS',
    15_000,
    5 * 60 * 1000,
  );
  const deadline = Date.now() + waitTimeoutMs;
  while (Date.now() < deadline) {
    const job = await getJob(network, proofJobId);
    if (job.deviceTransactionHash && job.deviceTransactionHash !== serializedHash) {
      throw new Error('Proof Job is bound to another Device transaction');
    }
    if (job.status === 'reproof_required') {
      throw new Error(`Proof Job ${proofJobId} requires a new proof: ${job.errorCode ?? 'unknown'}`);
    }
    if (job.status === 'dead_lettered') {
      throw new Error(`Proof Job ${proofJobId} failed permanently: ${job.errorCode ?? 'unknown'}`);
    }
    if (['submitted', 'confirmed'].includes(job.status)) {
      if (
        !job.attestTxId
        || !job.attestTxHash
        || !job.sponsorTransactionId
        || !job.sponsorFeeSpecks
        || job.deviceTransactionBytes === null
        || job.sponsorTransactionBytes === null
      ) throw new Error('Submitted Sponsor state is incomplete');
      return {
        accepted: true,
        idempotent: false,
        proofJobId,
        status: job.status as 'submitted' | 'confirmed',
        transactionId: job.attestTxId,
        deviceTransactionHash: serializedHash,
        sponsorTransactionId: job.sponsorTransactionId,
        transactionHash: job.attestTxHash,
        feeSpecks: job.sponsorFeeSpecks,
        feeDust: formatDust(BigInt(job.sponsorFeeSpecks)),
        deviceTransactionBytes: job.deviceTransactionBytes,
        transactionBytes: job.sponsorTransactionBytes,
        sponsorshipStartedAt: job.sponsorshipStartedAt ?? new Date().toISOString(),
        sponsorshipCompletedAt: job.sponsorshipCompletedAt ?? new Date().toISOString(),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Timed out waiting for Sponsor transaction ${proofJobId}`);
}

function formatDust(value: bigint): string {
  return `${value / 1_000_000_000_000_000n}.${(value % 1_000_000_000_000_000n)
    .toString()
    .padStart(15, '0')}`;
}
