import {
  type ThresholdPolicyDescriptor,
} from '@midnight-demo/shared';
import { deriveDeviceAuthorityHex } from '@midnight-demo/sensor-registry-contract/witnesses';

import {
  DeviceAuthenticationHttpError,
  deviceSession,
  enrollmentFor,
  loadDeviceIdentity,
  loadOrCreateDeviceIdentity,
  type BrowserDeviceIdentity,
  type DeviceEnrollment,
} from './device-identity.js';
import {
  availableWallets,
  connectBrowserWallet,
  submitBrowserAttestation,
  type BrowserSubmissionResult,
  type BrowserWalletConnection,
  type SubmissionProgress,
} from './midnight-device.js';
import {
  generateDailyCapture,
  listDailyCaptures,
  loadDailyCapture,
  storeDailyCapture,
  validateDailyGenerationDate,
  type BrowserDailyCapture,
  type DailyGenerationMode,
} from './daily-captures.js';

export interface DevicePolicy extends ThresholdPolicyDescriptor {
  policyKey: string;
  registeredTxId: string;
}

export interface ProvisioningConfiguration {
  network: 'preprod';
  projectId: string;
  contractAddress: string;
  serviceUrl: string;
  policies: DevicePolicy[];
}

export interface BrowserDevice {
  deviceId: string;
  projectId: string;
  keyId: string;
  createdAt: string;
  deviceAuthority: string;
  enrollment: DeviceEnrollment;
}

export interface ProvisionedDevice extends BrowserDevice {
  contractAddress: string;
  deviceCommitment: string;
  policyId: string;
  policyKey: string;
  assignmentId: string;
  assignmentKey: string;
  registeredTxId: string;
  assignmentTxId: string;
}

export interface DeviceHistory {
  windows: Array<{
    batchId: string;
    periodStart: string;
    periodEnd: string;
    count: number;
    minimum: number;
    maximum: number;
    average: number;
    unit: string;
    commitment: string;
    thresholdPolicyVersion: string;
  }>;
  proofJobs: ProofJob[];
  localCaptures: BrowserDailyCapture[];
}

export interface SponsorQuota {
  quotaDate: string;
  dailyLimit: number;
  used: number;
  remaining: number;
  resetAt: string;
  reservedProofJobIds: string[];
}

export interface RestoredDeviceState {
  device: BrowserDevice;
  provisioned: ProvisionedDevice | null;
  warning: string | null;
}

interface DeviceOperationConfiguration {
  schemaVersion: 1;
  device: {
    deviceId: string;
    projectId: string;
    commitment: string;
  };
  midnight: {
    network: 'preprod';
    contractAddress: string;
    contractSchemaVersion: 3;
  };
  policy: {
    id: string;
    key: string;
  };
  assignment: {
    id: string;
    key: string;
  };
  evidence: {
    deviceRegisteredTxId: string;
    assignmentRegisteredTxId: string;
  };
}

export interface ProofJob {
  proofJobId: string;
  periodDate: string;
  status: string;
  measurementGroupId: string;
  attestationCommitment: string;
  sampleCount: number;
  observedHourCount: number;
  stoppedHourCount: number;
  thresholdSatisfied: boolean;
  availableAfter: string;
  attestTxId: string | null;
}

interface ProvisioningResponse {
  deviceId: string;
  projectId: string;
  contractAddress: string;
  deviceCommitment: string;
  policyId: string;
  policyKey: string;
  assignmentId: string;
  assignmentKey: string;
  registeredTxId: string;
  assignmentTxId: string;
}

const defaultBridgeUrl = 'http://127.0.0.1:8790';
let identity: BrowserDeviceIdentity | null = null;
let wallet: BrowserWalletConnection | null = null;
let configuration: ProvisioningConfiguration | null = null;
let provisioned: ProvisionedDevice | null = null;
let captured: BrowserDailyCapture | null = null;

function endpoint(base: string, pathname: string): URL {
  const url = new URL(base);
  url.pathname = pathname;
  url.search = '';
  url.hash = '';
  return url;
}

async function jsonResponse<T>(response: Response, operation: string): Promise<T> {
  const text = await response.text();
  if (text.length > 128 * 1024) throw new Error(`${operation} response is too large`);
  if (!response.ok) throw new Error(`${operation} failed with HTTP ${response.status}: ${text.slice(0, 2_000)}`);
  return JSON.parse(text) as T;
}

function selectedPolicy(policyId: string): DevicePolicy {
  const policy = configuration?.policies.find((candidate) => candidate.policyId === policyId);
  if (!policy) throw new Error(`Threshold Policy is not registered: ${policyId}`);
  return policy;
}

function requireIdentity(): BrowserDeviceIdentity {
  if (!identity) throw new Error('Create the Device Identity first');
  return identity;
}

function requireWallet(): BrowserWalletConnection {
  if (!wallet) throw new Error('Connect a Midnight Wallet first');
  return wallet;
}

function requireConfiguration(): ProvisioningConfiguration {
  if (!configuration) throw new Error('Load the provisioning configuration first');
  return configuration;
}

function requireProvisioned(): ProvisionedDevice {
  if (!provisioned) throw new Error('Register the Device first');
  return provisioned;
}

function requireCaptured(): BrowserDailyCapture {
  if (!captured) throw new Error('Generate or select a sensor day first');
  return captured;
}

export async function loadConfiguration(
  bridgeUrl = defaultBridgeUrl,
): Promise<ProvisioningConfiguration> {
  configuration = await jsonResponse<ProvisioningConfiguration>(await fetch(
    endpoint(bridgeUrl, '/api/configuration'),
    { signal: AbortSignal.timeout(15_000) },
  ), 'Provisioning configuration');
  if (
    configuration.network !== 'preprod'
    || !configuration.contractAddress
    || !configuration.projectId
    || !configuration.serviceUrl
    || configuration.policies.length === 0
  ) throw new Error('Provisioning configuration is incomplete');
  return configuration;
}

export async function connectWallet(walletId?: string): Promise<Omit<BrowserWalletConnection, 'api'>> {
  const config = requireConfiguration();
  wallet = await connectBrowserWallet(config.network, walletId);
  const { api: _, ...publicWallet } = wallet;
  return publicWallet;
}

export async function createDevice(deviceId: string): Promise<BrowserDevice> {
  const config = requireConfiguration();
  identity = await loadOrCreateDeviceIdentity(deviceId, config.projectId);
  return {
    deviceId: identity.deviceId,
    projectId: identity.projectId,
    keyId: identity.keyId,
    createdAt: identity.createdAt,
    deviceAuthority: deriveDeviceAuthorityHex(identity.deviceSecretHex),
    enrollment: enrollmentFor(identity),
  };
}

function browserDevice(currentIdentity: BrowserDeviceIdentity): BrowserDevice {
  return {
    deviceId: currentIdentity.deviceId,
    projectId: currentIdentity.projectId,
    keyId: currentIdentity.keyId,
    createdAt: currentIdentity.createdAt,
    deviceAuthority: deriveDeviceAuthorityHex(currentIdentity.deviceSecretHex),
    enrollment: enrollmentFor(currentIdentity),
  };
}

function validHex32(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[0-9a-f]{2}){32}$/u.test(value);
}

function validOperationConfiguration(
  value: unknown,
  currentIdentity: BrowserDeviceIdentity,
  config: ProvisioningConfiguration,
): value is DeviceOperationConfiguration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<DeviceOperationConfiguration>;
  const policy = config.policies.find((item) => item.policyId === candidate.policy?.id);
  return candidate.schemaVersion === 1
    && candidate.device?.deviceId === currentIdentity.deviceId
    && candidate.device.projectId === currentIdentity.projectId
    && validHex32(candidate.device.commitment)
    && candidate.midnight?.network === config.network
    && candidate.midnight.contractAddress === config.contractAddress
    && candidate.midnight.contractSchemaVersion === 3
    && Boolean(policy)
    && candidate.policy?.key === policy?.policyKey
    && validHex32(candidate.assignment?.key)
    && typeof candidate.assignment?.id === 'string'
    && Boolean(candidate.assignment.id)
    && typeof candidate.evidence?.deviceRegisteredTxId === 'string'
    && Boolean(candidate.evidence.deviceRegisteredTxId)
    && typeof candidate.evidence.assignmentRegisteredTxId === 'string'
    && Boolean(candidate.evidence.assignmentRegisteredTxId);
}

export async function restoreDevice(deviceId: string): Promise<RestoredDeviceState | null> {
  const config = requireConfiguration();
  const existing = await loadDeviceIdentity(deviceId, config.projectId);
  if (!existing) return null;
  identity = existing;
  const device = browserDevice(existing);
  try {
    const headers = await authenticatedHeaders('configuration:read');
    const operationConfiguration = await jsonResponse<DeviceOperationConfiguration>(await fetch(
      endpoint(config.serviceUrl, '/api/v1/device/configuration'),
      { headers, signal: AbortSignal.timeout(15_000) },
    ), 'Device operation configuration');
    if (!validOperationConfiguration(operationConfiguration, existing, config)) {
      throw new Error('Stored Device operation configuration is invalid');
    }
    provisioned = {
      ...device,
      contractAddress: operationConfiguration.midnight.contractAddress,
      deviceCommitment: operationConfiguration.device.commitment,
      policyId: operationConfiguration.policy.id,
      policyKey: operationConfiguration.policy.key,
      assignmentId: operationConfiguration.assignment.id,
      assignmentKey: operationConfiguration.assignment.key,
      registeredTxId: operationConfiguration.evidence.deviceRegisteredTxId,
      assignmentTxId: operationConfiguration.evidence.assignmentRegisteredTxId,
    };
    return { device, provisioned, warning: null };
  } catch (error) {
    if (error instanceof DeviceAuthenticationHttpError && error.status === 401) {
      return { device, provisioned: null, warning: null };
    }
    return {
      device,
      provisioned: null,
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function registerDevice(input: {
  policyId: string;
  bridgeUrl?: string;
}): Promise<ProvisionedDevice> {
  const config = requireConfiguration();
  const currentIdentity = requireIdentity();
  const policy = selectedPolicy(input.policyId);
  const deviceAuthority = deriveDeviceAuthorityHex(currentIdentity.deviceSecretHex);
  const response = await jsonResponse<ProvisioningResponse>(await fetch(
    endpoint(input.bridgeUrl ?? defaultBridgeUrl, '/api/devices'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enrollment: enrollmentFor(currentIdentity),
        deviceAuthority,
        policyId: policy.policyId,
      }),
      signal: AbortSignal.timeout(20 * 60 * 1000),
    },
  ), 'Device registration');
  if (
    response.deviceId !== currentIdentity.deviceId
    || response.projectId !== config.projectId
    || response.contractAddress !== config.contractAddress
    || response.policyId !== policy.policyId
    || response.policyKey !== policy.policyKey
  ) throw new Error('Device registration response does not match the request');
  provisioned = {
    ...response,
    keyId: currentIdentity.keyId,
    createdAt: currentIdentity.createdAt,
    deviceAuthority,
    enrollment: enrollmentFor(currentIdentity),
  };
  return provisioned;
}

async function authenticatedHeaders(scope: Parameters<typeof deviceSession>[2]): Promise<Record<string, string>> {
  const config = requireConfiguration();
  const session = await deviceSession(config.serviceUrl, requireIdentity(), scope);
  return { Authorization: `Bearer ${session.accessToken}` };
}

async function uploadDailyCapture(capture: BrowserDailyCapture): Promise<void> {
  const config = requireConfiguration();
  const device = requireProvisioned();
  const policy = selectedPolicy(device.policyId);
  const headers = await authenticatedHeaders('measurement:write');
  for (const window of capture.windows) {
    await jsonResponse(await fetch(endpoint(config.serviceUrl, '/api/v1/measurement-windows'), {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchId: `window-${device.deviceId}-${capture.periodDate}-${window.hourIndex}-${capture.attestation.publicData.attestationCommitment.slice(0, 16)}`,
        projectId: config.projectId,
        deviceId: device.deviceId,
        sensorType: 'temperature',
        unit: '°C',
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
        count: window.count,
        minimum: window.minimum,
        maximum: window.maximum,
        average: window.average,
        commitment: window.commitment,
        thresholdPolicyVersion: policy.policyId,
      }),
      signal: AbortSignal.timeout(15_000),
    }), `Measurement upload (${window.hourIndex}:00 JST)`);
  }
}

export async function generateDailyMeasurements(input: {
  periodDate: string;
  mode: DailyGenerationMode;
}): Promise<BrowserDailyCapture> {
  const config = requireConfiguration();
  const device = requireProvisioned();
  const policy = selectedPolicy(device.policyId);
  validateDailyGenerationDate(input.periodDate);
  const existing = await loadDailyCapture(config.projectId, device.deviceId, input.periodDate);
  captured = existing?.requestedSampleCount === 1440 ? existing : await generateDailyCapture({
    projectId: config.projectId,
    deviceId: device.deviceId,
    periodDate: input.periodDate,
    policy,
    assignmentId: device.assignmentId,
    sampleCount: 1440,
    mode: input.mode,
  });
  if (existing !== captured) await storeDailyCapture(captured);
  await uploadDailyCapture(captured);
  return captured;
}

export async function selectDailyCapture(periodDate: string): Promise<BrowserDailyCapture> {
  const config = requireConfiguration();
  const device = requireProvisioned();
  const selected = await loadDailyCapture(config.projectId, device.deviceId, periodDate);
  if (!selected) throw new Error('Private daily data is not stored in this browser for the selected date');
  captured = selected;
  return selected;
}

export async function loadDeviceHistory(): Promise<DeviceHistory> {
  const config = requireConfiguration();
  const device = requireProvisioned();
  const headers = await authenticatedHeaders('device:status');
  const remote = await jsonResponse<Omit<DeviceHistory, 'localCaptures'>>(await fetch(
    endpoint(config.serviceUrl, '/api/v1/device/history'),
    { headers, signal: AbortSignal.timeout(15_000) },
  ), 'Device history');
  return {
    ...remote,
    localCaptures: await listDailyCaptures(config.projectId, device.deviceId),
  };
}

export async function loadSponsorQuota(): Promise<SponsorQuota> {
  const config = requireConfiguration();
  requireProvisioned();
  const headers = await authenticatedHeaders('transaction:submit');
  const response = await jsonResponse<{ sponsorQuota: SponsorQuota }>(await fetch(
    endpoint(config.serviceUrl, '/api/v1/sponsor-quota'),
    { headers, signal: AbortSignal.timeout(15_000) },
  ), 'Sponsor quota');
  const quota = response.sponsorQuota;
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(quota.quotaDate)
    || !Number.isSafeInteger(quota.dailyLimit)
    || !Number.isSafeInteger(quota.used)
    || !Number.isSafeInteger(quota.remaining)
    || quota.dailyLimit < 1
    || quota.used < 0
    || quota.remaining < 0
    || quota.remaining !== Math.max(0, quota.dailyLimit - quota.used)
    || !Number.isFinite(Date.parse(quota.resetAt))
    || !Array.isArray(quota.reservedProofJobIds)
    || quota.reservedProofJobIds.some((proofJobId) => typeof proofJobId !== 'string')
  ) throw new Error('Sponsor quota response is invalid');
  return quota;
}

async function proofJob(proofJobId: string): Promise<ProofJob> {
  const config = requireConfiguration();
  const headers = await authenticatedHeaders('proof:read');
  return (await jsonResponse<{ job: ProofJob }>(await fetch(
    endpoint(config.serviceUrl, `/api/v1/proof-jobs/${encodeURIComponent(proofJobId)}`),
    { headers, signal: AbortSignal.timeout(15_000) },
  ), 'Read Proof Job')).job;
}

export async function requestProof(input: {
  bridgeUrl?: string;
  admitNow?: boolean;
  periodDate?: string;
} = {}): Promise<ProofJob> {
  const config = requireConfiguration();
  const device = requireProvisioned();
  if (input.periodDate) await selectDailyCapture(input.periodDate);
  const measurement = requireCaptured();
  if (!measurement.completeDay) throw new Error('The selected JST day is still in progress');
  const publicData = measurement.attestation.publicData;
  const headers = await authenticatedHeaders('proof:request');
  let job = (await jsonResponse<{ job: ProofJob }>(await fetch(
    endpoint(config.serviceUrl, '/api/v1/proof-jobs'),
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proofJobId: measurement.proofJobId,
        projectId: config.projectId,
        deviceId: device.deviceId,
        periodDate: publicData.periodDate,
        measurementGroupId: publicData.measurementGroupId,
        attestationCommitment: publicData.attestationCommitment,
        deviceCommitment: publicData.deviceCommitment,
        sampleCount: publicData.sampleCount,
        thresholdPolicyVersion: publicData.policyId,
        policyKey: publicData.policyKey,
        assignmentId: publicData.assignmentId,
        assignmentKey: publicData.assignmentKey,
        hourPresence: publicData.hourPresence,
        observedHourCount: publicData.observedHourCount,
        thresholdSatisfied: measurement.thresholdSatisfied,
        schemaVersion: publicData.schemaVersion,
        circuitVersion: publicData.circuitVersion,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  ), 'Create Proof Job')).job;
  if (job.proofJobId !== measurement.proofJobId) throw new Error('Proof Job ID mismatch');

  if (input.admitNow) {
    await jsonResponse(await fetch(
      endpoint(input.bridgeUrl ?? defaultBridgeUrl, `/api/proof-jobs/${encodeURIComponent(job.proofJobId)}/admit`),
      { method: 'POST', signal: AbortSignal.timeout(30_000) },
    ), 'Admit Proof Job');
  }
  const deadline = Date.now() + 2 * 60 * 1000;
  while (!['ready_for_input', 'proving', 'proof_ready'].includes(job.status)) {
    if (['confirmed', 'dead_lettered'].includes(job.status)) return job;
    if (Date.now() >= deadline) return job;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    job = await proofJob(job.proofJobId);
  }
  return job;
}

export async function proveAndSubmit(
  onProgress?: (progress: SubmissionProgress) => void,
  periodDate?: string,
): Promise<BrowserSubmissionResult> {
  const config = requireConfiguration();
  const device = requireProvisioned();
  if (periodDate) await selectDailyCapture(periodDate);
  const measurement = requireCaptured();
  if (!measurement.completeDay) throw new Error('The selected JST day is still in progress');
  const currentWallet = requireWallet();
  const proofHeaders = await authenticatedHeaders('proof:generate');
  const accessToken = proofHeaders.Authorization?.replace(/^Bearer\s+/u, '');
  if (!accessToken) throw new Error('Device proof session was not issued');
  const result = await submitBrowserAttestation({
    wallet: currentWallet,
    serviceUrl: config.serviceUrl,
    zkArtifactsUrl: window.location.origin,
    contractAddress: config.contractAddress,
    accessToken,
    proofJobId: measurement.proofJobId,
    deviceSecretHex: requireIdentity().deviceSecretHex,
    attestation: measurement.attestation,
    thresholdSatisfied: measurement.thresholdSatisfied,
    onProgress,
  });
  const headers = await authenticatedHeaders('transaction:submit');
  await jsonResponse(await fetch(
    endpoint(config.serviceUrl, `/api/v1/proof-jobs/${encodeURIComponent(measurement.proofJobId)}/result`),
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phase: 'attest',
        txId: result.transactionId,
        txHash: result.transactionHash,
        blockHeight: 'confirmed-by-indexer',
      }),
      signal: AbortSignal.timeout(15_000),
    },
  ), 'Report Midnight transaction');
  return result;
}

export const browserDeviceFlow = {
  availableWallets,
  loadConfiguration,
  connectWallet,
  restoreDevice,
  createDevice,
  registerDevice,
  generateDailyMeasurements,
  selectDailyCapture,
  loadDeviceHistory,
  loadSponsorQuota,
  requestProof,
  proveAndSubmit,
};
