import {
  browserPolicyCanonicalMessage,
  browserProjectCanonicalMessage,
  deriveBrowserWalletDeviceId,
  type BrowserPolicyMode,
} from '@midnight-demo/shared/browser-provisioning';
import {
  type ThresholdPolicyDescriptor,
  utcDayStartMinute,
  validateOperationalDayBoundary,
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
import {
  isWalletConnectionLost,
  walletConnectionFailureStage,
} from './wallet-compatibility.js';

export interface DevicePolicy extends ThresholdPolicyDescriptor {
  name: string;
  policyKey: string;
  registeredTxId: string;
}

export interface ProvisioningConfiguration {
  network: 'preprod';
  projectId: string;
  contractAddress: string;
  serviceUrl: string;
  operationalDay: {
    timeZoneOffsetMinutes: number;
    localDayStartHour: number;
    utcDayStartMinute: number;
  };
  policies: DevicePolicy[];
  maximumPolicies: number;
  processingSchedule: ServerProcessingSchedule;
}

export interface ServerProcessingSchedule {
  mode: 'always-on' | 'on-demand' | 'scheduled';
  timeZoneOffsetMinutes: number;
  processingStartsAtMinute: number;
  nextProcessingStartsAt: string | null;
  nextContainerStartAllowedAt: string | null;
  processingCadenceSeconds: number;
  processingEligibleNow: boolean;
}

export interface BrowserPolicyOperation {
  operationId: string;
  projectId: string;
  policyId: string;
  name: string;
  mode: BrowserPolicyMode;
  minimum: number | null;
  maximum: number | null;
  status: 'queued' | 'running' | 'retrying' | 'registered' | 'failed';
  stage: string;
  policyKey: string | null;
  policyTxId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserProjectPolicies {
  policies: Array<Pick<DevicePolicy,
    'policyId' | 'name' | 'policyKey' | 'mode' | 'minimum' | 'maximum' | 'version' | 'registeredTxId'
  > & { status: 'registered' }>;
  operations: BrowserPolicyOperation[];
  maximumPolicies: number;
}

export interface BrowserProject {
  projectId: string;
  name: string;
  nameJa: string | null;
  timeZone: string;
  timeZoneOffsetMinutes: number;
  localDayStartHour: number;
  utcDayStartMinute: number;
  createdAt: string;
}

interface BrowserProjectSession {
  accessToken: string;
  expiresAt: string;
  projects: BrowserProject[];
  maximumProjects: number;
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
  timeZoneOffsetMinutes: number;
  localDayStartHour: number;
  utcDayStartMinute: number;
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

export interface DeviceAdministratorDashboard {
  source: string;
  project: {
    id: string;
    name: string;
    nameJa: string | null;
    organization: string;
    organizationJa: string | null;
    timezone: string;
  };
  devices: Array<{
    id: string;
    name: string;
    nameJa: string | null;
    sensorType: string;
    unit: string;
    thresholdPolicyVersion: string;
    midnightDeviceCommitment: string | null;
    midnightRegistryStatus: string;
    midnightRegistrationVersion: number | null;
    midnightContractAddress: string | null;
    lastSeenAt: string | null;
  }>;
  windows: DeviceHistory['windows'];
  anomalies: Array<{
    eventId: string;
    transition: string;
    occurredAt: string;
    thresholdPolicyVersion: string;
  }>;
  anomalyState: {
    state: 'normal' | 'anomaly_open';
    changedAt: string;
  } | null;
  proofJobs: ProofJob[];
  policies: Array<ThresholdPolicyDescriptor & {
    policyId: string;
    status: string;
  }>;
  stepper: {
    deviceRegistered: boolean;
    hourlyDataReceived: boolean;
    anomalyStateAvailable: boolean;
    proofRequested: boolean;
    proofGenerated: boolean;
    midnightConfirmed: boolean;
  };
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
  schemaVersion: 2;
  device: {
    deviceId: string;
    projectId: string;
    commitment: string;
    provisioningWalletKeySha256: string;
  };
  midnight: {
    network: 'preprod';
    contractAddress: string;
    contractSchemaVersion: 5;
  };
  policy: {
    id: string;
    key: string;
  };
  assignment: {
    id: string;
    key: string;
    timeZoneOffsetMinutes: number;
    localDayStartHour: number;
    utcDayStartMinute: number;
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
  hourResults: Array<'no-data' | 'within-threshold' | 'outside-threshold'>;
  thresholdSatisfied: boolean;
  availableAfter: string;
  attestTxId: string | null;
  attestTxHash: string | null;
  errorCode: string | null;
}

export type ProofRequestAcceptanceProgress =
  | { stage: 'uploading'; completed: number; total: number }
  | { stage: 'registering'; completed: number; total: number }
  | { stage: 'accepted'; completed: number; total: number };

interface ProvisioningResponse {
  deviceId: string;
  projectId: string;
  contractAddress: string;
  deviceCommitment: string;
  policyId: string;
  policyKey: string;
  assignmentId: string;
  assignmentKey: string;
  timeZoneOffsetMinutes: number;
  localDayStartHour: number;
  utcDayStartMinute: number;
  registeredTxId: string;
  assignmentTxId: string;
}

export type ProvisioningProgressStage =
  | 'challenge_requesting'
  | 'wallet_signature_requested'
  | 'wallet_authorization_verifying'
  | 'queued'
  | 'sponsor_wallet_syncing'
  | 'sponsor_wallet_ready'
  | 'device_zkp_generating'
  | 'device_tx_submitting'
  | 'device_tx_submitted'
  | 'device_confirmation_waiting'
  | 'device_confirmed'
  | 'assignment_zkp_generating'
  | 'assignment_tx_submitting'
  | 'assignment_tx_submitted'
  | 'assignment_confirmation_waiting'
  | 'assignment_confirmed'
  | 'retry_waiting'
  | 'completed'
  | 'failed';

export interface ProvisioningProgress {
  operationId?: string;
  stage: ProvisioningProgressStage;
  status: string;
  deviceTxId?: string | null;
  assignmentTxId?: string | null;
  error?: string | null;
  processingSchedule?: ServerProcessingSchedule;
}

interface ProvisioningOperationStarted {
  operationId: string;
  progressToken: string;
  statusUrl: string;
  status: 'queued';
  stage: 'queued';
  processingSchedule: ServerProcessingSchedule;
}

interface StoredProvisioningOperation extends ProvisioningOperationStarted {
  deviceId: string;
  policyId: string;
}

interface ProvisioningOperationStatus {
  operationId: string;
  status: 'queued' | 'running' | 'retrying' | 'registered' | 'failed';
  stage: ProvisioningProgressStage;
  deviceId: string;
  policyId: string;
  deviceTxId: string | null;
  assignmentTxId: string | null;
  error: string | null;
  updatedAt: string;
  result: ProvisioningResponse | null;
  processingSchedule: ServerProcessingSchedule;
}

export interface DeferredBrowserWorkflow {
  schemaVersion: 1;
  operationId: string;
  projectId: string;
  deviceId: string;
  policyId: string;
  periodDate: string;
  proofJobId: string;
  proofRequestedAt: string;
  submissionRequested: boolean;
}

let identity: BrowserDeviceIdentity | null = null;
let wallet: BrowserWalletConnection | null = null;
let configuration: ProvisioningConfiguration | null = null;
let projectSessionToken = '';
let projects: BrowserProject[] = [];
let maximumProjects = 10;
let provisioned: ProvisionedDevice | null = null;
let captured: BrowserDailyCapture | null = null;

function pendingProvisioningKey(deviceId: string): string {
  return `vsp-provisioning-operation:${deviceId}`;
}

function deferredWorkflowKey(projectId: string, deviceId: string): string {
  return `vsp-deferred-proof-workflow:${projectId}:${deviceId}`;
}

function readPendingProvisioning(deviceId: string): StoredProvisioningOperation | null {
  const raw = localStorage.getItem(pendingProvisioningKey(deviceId));
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw) as StoredProvisioningOperation;
    return pending.deviceId === deviceId
      && typeof pending.operationId === 'string'
      && typeof pending.policyId === 'string'
      && typeof pending.progressToken === 'string'
      && typeof pending.statusUrl === 'string'
      ? pending
      : null;
  } catch {
    return null;
  }
}

function readDeferredWorkflow(projectId: string, deviceId: string): DeferredBrowserWorkflow | null {
  const raw = localStorage.getItem(deferredWorkflowKey(projectId, deviceId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<DeferredBrowserWorkflow>;
    return value.schemaVersion === 1
      && value.projectId === projectId
      && value.deviceId === deviceId
      && typeof value.operationId === 'string'
      && typeof value.policyId === 'string'
      && typeof value.periodDate === 'string'
      && typeof value.proofJobId === 'string'
      && typeof value.proofRequestedAt === 'string'
      && typeof value.submissionRequested === 'boolean'
      ? value as DeferredBrowserWorkflow
      : null;
  } catch {
    return null;
  }
}

function storeDeferredWorkflow(value: DeferredBrowserWorkflow): void {
  localStorage.setItem(deferredWorkflowKey(value.projectId, value.deviceId), JSON.stringify(value));
}

function storePendingProvisioning(
  started: ProvisioningOperationStarted,
  expectedDeviceId: string,
  expectedPolicyId: string,
): void {
  localStorage.setItem(pendingProvisioningKey(expectedDeviceId), JSON.stringify({
    ...started,
    deviceId: expectedDeviceId,
    policyId: expectedPolicyId,
  } satisfies StoredProvisioningOperation));
}

function validProcessingSchedule(value: unknown): value is ServerProcessingSchedule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const schedule = value as Partial<ServerProcessingSchedule>;
  return ['always-on', 'on-demand', 'scheduled'].includes(schedule.mode ?? '')
    && Number.isInteger(schedule.timeZoneOffsetMinutes)
    && (schedule.timeZoneOffsetMinutes ?? -1_000) >= -840
    && (schedule.timeZoneOffsetMinutes ?? 1_000) <= 840
    && Number.isInteger(schedule.processingStartsAtMinute)
    && (schedule.processingStartsAtMinute ?? -1) >= 0
    && (schedule.processingStartsAtMinute ?? 1_440) < 1_440
    && (schedule.nextProcessingStartsAt === null
      || (typeof schedule.nextProcessingStartsAt === 'string'
        && Number.isFinite(Date.parse(schedule.nextProcessingStartsAt))))
    && (schedule.nextContainerStartAllowedAt === null
      || (typeof schedule.nextContainerStartAllowedAt === 'string'
        && Number.isFinite(Date.parse(schedule.nextContainerStartAllowedAt))))
    && Number.isInteger(schedule.processingCadenceSeconds)
    && (schedule.processingCadenceSeconds ?? 0) >= 60
    && typeof schedule.processingEligibleNow === 'boolean';
}

async function readProvisioningStatus(
  pending: StoredProvisioningOperation,
  expectedDeviceId: string,
  expectedPolicyId: string,
  onProgress?: (progress: ProvisioningProgress) => void,
): Promise<ProvisioningOperationStatus> {
  const status = await jsonResponse<ProvisioningOperationStatus>(await fetch(
    new URL(pending.statusUrl, requireConfiguration().serviceUrl),
    {
      headers: { 'X-Provisioning-Token': pending.progressToken },
      signal: AbortSignal.timeout(15_000),
    },
  ), 'Device registration progress');
  if (
    status.operationId !== pending.operationId
    || status.deviceId !== expectedDeviceId
    || status.policyId !== expectedPolicyId
  ) throw new Error('Device registration progress does not match the request');
  onProgress?.({
    operationId: status.operationId,
    stage: status.stage,
    status: status.status,
    deviceTxId: status.deviceTxId,
    assignmentTxId: status.assignmentTxId,
    error: status.error,
    processingSchedule: status.processingSchedule,
  });
  return status;
}

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

function clientOperationId(action: string): string {
  return `${action}-${crypto.randomUUID()}`;
}

export async function loadConfiguration(
  projectId?: string,
  accessToken?: string,
): Promise<ProvisioningConfiguration> {
  const url = endpoint(window.location.origin, '/api/v1/provisioning/configuration');
  if (projectId) url.searchParams.set('projectId', projectId);
  configuration = await jsonResponse<ProvisioningConfiguration>(await fetch(
    url,
    {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      signal: AbortSignal.timeout(15_000),
    },
  ), 'Provisioning configuration');
  if (
    configuration.network !== 'preprod'
    || !configuration.contractAddress
    || !configuration.projectId
    || !configuration.serviceUrl
    || !Array.isArray(configuration.policies)
    || configuration.maximumPolicies !== 10
    || !validProcessingSchedule(configuration.processingSchedule)
    || validateOperationalDayBoundary(configuration.operationalDay) !== configuration.operationalDay
    || configuration.operationalDay.utcDayStartMinute !== utcDayStartMinute(configuration.operationalDay)
  ) throw new Error('Provisioning configuration is incomplete');
  return configuration;
}

export async function connectWallet(walletId?: string): Promise<Omit<
  BrowserWalletConnection,
  'api' | 'walletIdentitySignature'
> & {
  deviceId: string;
  projects: BrowserProject[];
  maximumProjects: number;
  selectedProjectId: string;
  configuration: ProvisioningConfiguration;
}> {
  const bootstrap = requireConfiguration();
  const operationId = clientOperationId('wallet-connect');
  const timestamp = new Date().toISOString();
  const challengePromise = fetch(endpoint(bootstrap.serviceUrl, '/api/v1/projects/challenge'), {
    method: 'POST',
    headers: { 'X-Client-Operation-Id': operationId },
    signal: AbortSignal.timeout(15_000),
  }).then((response) => jsonResponse<{
    network: 'preprod';
    challengeId: string;
    nonce: string;
    expiresAt: string;
  }>(response, 'Wallet Project challenge'));
  const canonicalPromise = challengePromise.then((challenge) => browserProjectCanonicalMessage({
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    timestamp,
  }));
  const walletPromise = connectBrowserWallet(bootstrap.network, walletId, canonicalPromise);
  const [challenge, connectedWallet] = await Promise.all([challengePromise, walletPromise]);
  wallet = connectedWallet;
  const session = await jsonResponse<BrowserProjectSession>(await fetch(
    endpoint(bootstrap.serviceUrl, '/api/v1/projects/session'),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Operation-Id': operationId,
      },
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        timestamp,
        walletSignature: wallet.walletIdentitySignature,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  ), 'Wallet Project session');
  if (
    !session.accessToken
    || !Number.isFinite(Date.parse(session.expiresAt))
    || !Array.isArray(session.projects)
    || session.projects.length === 0
    || session.maximumProjects !== 10
  ) throw new Error('Wallet Project session response is incomplete');
  projectSessionToken = session.accessToken;
  projects = session.projects;
  maximumProjects = session.maximumProjects;
  const preferred = localStorage.getItem(`vsp-selected-project:${wallet.walletKeySha256}`);
  const selectedProjectId = projects.some((project) => project.projectId === preferred)
    ? preferred as string
    : projects[0]!.projectId;
  const selected = await selectProject(selectedProjectId);
  const { api: _, walletIdentitySignature: __, ...publicWallet } = wallet;
  return {
    ...publicWallet,
    deviceId: selected.deviceId,
    configuration: selected.configuration,
    projects: [...projects],
    maximumProjects,
    selectedProjectId,
  };
}

export function resetWalletConnection(): void {
  wallet = null;
  projectSessionToken = '';
  projects = [];
  identity = null;
  provisioned = null;
  captured = null;
}

export async function selectProject(projectId: string): Promise<{
  deviceId: string;
  configuration: ProvisioningConfiguration;
}> {
  const currentWallet = requireWallet();
  if (!projectSessionToken) throw new Error('Connect a Midnight Wallet first');
  if (!projects.some((project) => project.projectId === projectId)) {
    throw new Error('Project does not belong to the connected Midnight Wallet');
  }
  const selectedConfiguration = await loadConfiguration(projectId, projectSessionToken);
  identity = null;
  provisioned = null;
  captured = null;
  localStorage.setItem(`vsp-selected-project:${currentWallet.walletKeySha256}`, projectId);
  return {
    deviceId: await deriveBrowserWalletDeviceId(currentWallet.walletKeySha256, projectId),
    configuration: selectedConfiguration,
  };
}

export async function createProject(input: {
  name: string;
  timeZoneOffsetMinutes: number;
  localDayStartHour: number;
}): Promise<{
  project: BrowserProject;
  deviceId: string;
  projectCount: number;
  maximumProjects: number;
  configuration: ProvisioningConfiguration;
}> {
  const config = requireConfiguration();
  const operationId = clientOperationId('project-create');
  if (!projectSessionToken) throw new Error('Connect a Midnight Wallet first');
  const created = await jsonResponse<{
    project: BrowserProject;
    projectCount: number;
    maximumProjects: number;
  }>(await fetch(endpoint(config.serviceUrl, '/api/v1/projects'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${projectSessionToken}`,
      'Content-Type': 'application/json',
      'X-Client-Operation-Id': operationId,
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(15_000),
  }), 'Create Project');
  projects = [...projects, created.project];
  maximumProjects = created.maximumProjects;
  return {
    ...created,
    ...await selectProject(created.project.projectId),
  };
}

export async function loadProjectPolicies(): Promise<BrowserProjectPolicies> {
  const config = requireConfiguration();
  if (!projectSessionToken) throw new Error('Connect a Midnight Wallet first');
  const url = endpoint(config.serviceUrl, '/api/v1/policies');
  url.searchParams.set('projectId', config.projectId);
  return jsonResponse<BrowserProjectPolicies>(await fetch(url, {
    headers: { Authorization: `Bearer ${projectSessionToken}` },
    signal: AbortSignal.timeout(15_000),
  }), 'Project Policies');
}

export async function refreshProjectConfiguration(): Promise<ProvisioningConfiguration> {
  const config = requireConfiguration();
  if (!projectSessionToken) throw new Error('Connect a Midnight Wallet first');
  return loadConfiguration(config.projectId, projectSessionToken);
}

function centiCelsius(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  const centi = Math.round(value * 100);
  if (centi < -10_000 || centi > 0xffff_ffff - 10_000) {
    throw new Error(`${label} is outside the supported temperature range`);
  }
  return centi;
}

export async function createPolicy(input: {
  name: string;
  mode: BrowserPolicyMode;
  minimum: number | null;
  maximum: number | null;
}): Promise<BrowserPolicyOperation> {
  const config = requireConfiguration();
  const operationId = clientOperationId('policy-create');
  const currentWallet = requireWallet();
  if (!projectSessionToken) throw new Error('Connect a Midnight Wallet first');
  const challenge = await jsonResponse<{
    projectId: string;
    policyId: string;
    challengeId: string;
    nonce: string;
    expiresAt: string;
  }>(await fetch(endpoint(config.serviceUrl, '/api/v1/policies/challenge'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${projectSessionToken}`,
      'Content-Type': 'application/json',
      'X-Client-Operation-Id': operationId,
    },
    body: JSON.stringify({ projectId: config.projectId }),
    signal: AbortSignal.timeout(15_000),
  }), 'Policy challenge');
  const authorization = {
    projectId: config.projectId,
    policyId: challenge.policyId,
    name: input.name.trim(),
    mode: input.mode,
    minimumCentiCelsius: centiCelsius(input.minimum, 'Policy minimum'),
    maximumCentiCelsius: centiCelsius(input.maximum, 'Policy maximum'),
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    timestamp: new Date().toISOString(),
  };
  const canonical = browserPolicyCanonicalMessage(authorization);
  if (typeof currentWallet.api.signData !== 'function') {
    throw new Error(
      `Connected Wallet ${currentWallet.walletName} API ${currentWallet.walletApiVersion} does not support signData`,
    );
  }
  const walletSignature = await currentWallet.api.signData(canonical, {
    encoding: 'text',
    keyType: 'unshielded',
  });
  return jsonResponse<BrowserPolicyOperation>(await fetch(
    endpoint(config.serviceUrl, '/api/v1/policies'),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${projectSessionToken}`,
        'Content-Type': 'application/json',
        'X-Client-Operation-Id': operationId,
      },
      body: JSON.stringify({ ...authorization, walletSignature }),
      signal: AbortSignal.timeout(15_000),
    },
  ), 'Create Policy');
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
  const boundary = candidate.assignment && {
    timeZoneOffsetMinutes: candidate.assignment.timeZoneOffsetMinutes,
    localDayStartHour: candidate.assignment.localDayStartHour,
  };
  return candidate.schemaVersion === 2
    && candidate.device?.deviceId === currentIdentity.deviceId
    && candidate.device.projectId === currentIdentity.projectId
    && validHex32(candidate.device.commitment)
    && validHex32(candidate.device.provisioningWalletKeySha256)
    && candidate.midnight?.network === config.network
    && candidate.midnight.contractAddress === config.contractAddress
    && candidate.midnight.contractSchemaVersion === 5
    && Boolean(policy)
    && candidate.policy?.key === policy?.policyKey
    && validHex32(candidate.assignment?.key)
    && typeof candidate.assignment?.id === 'string'
    && Boolean(candidate.assignment.id)
    && boundary !== undefined
    && validateOperationalDayBoundary(boundary) === boundary
    && candidate.assignment.utcDayStartMinute === config.operationalDay.utcDayStartMinute
    && candidate.assignment.timeZoneOffsetMinutes === config.operationalDay.timeZoneOffsetMinutes
    && candidate.assignment.localDayStartHour === config.operationalDay.localDayStartHour
    && typeof candidate.evidence?.deviceRegisteredTxId === 'string'
    && Boolean(candidate.evidence.deviceRegisteredTxId)
    && typeof candidate.evidence.assignmentRegisteredTxId === 'string'
    && Boolean(candidate.evidence.assignmentRegisteredTxId);
}

export async function restoreDevice(deviceId: string): Promise<RestoredDeviceState | null> {
  const config = requireConfiguration();
  const currentWallet = requireWallet();
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
    if (operationConfiguration.device.provisioningWalletKeySha256 !== currentWallet.walletKeySha256) {
      identity = null;
      provisioned = null;
      captured = null;
      return null;
    }
    provisioned = {
      ...device,
      contractAddress: operationConfiguration.midnight.contractAddress,
      deviceCommitment: operationConfiguration.device.commitment,
      policyId: operationConfiguration.policy.id,
      policyKey: operationConfiguration.policy.key,
      assignmentId: operationConfiguration.assignment.id,
      assignmentKey: operationConfiguration.assignment.key,
      timeZoneOffsetMinutes: operationConfiguration.assignment.timeZoneOffsetMinutes,
      localDayStartHour: operationConfiguration.assignment.localDayStartHour,
      utcDayStartMinute: operationConfiguration.assignment.utcDayStartMinute,
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
}, onProgress?: (progress: ProvisioningProgress) => void): Promise<ProvisionedDevice | null> {
  const config = requireConfiguration();
  const operationId = clientOperationId('device-register');
  const currentIdentity = requireIdentity();
  const currentWallet = requireWallet();
  const policy = selectedPolicy(input.policyId);
  const deviceAuthority = deriveDeviceAuthorityHex(currentIdentity.deviceSecretHex);
  const enrollment = enrollmentFor(currentIdentity);
  onProgress?.({ stage: 'challenge_requesting', status: 'running' });
  const challenge = await jsonResponse<{
    challengeId: string;
    nonce: string;
    expiresAt: string;
  }>(await fetch(endpoint(config.serviceUrl, '/api/v1/provisioning/challenge'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${projectSessionToken}`,
      'Content-Type': 'application/json',
      'X-Client-Operation-Id': operationId,
    },
    body: JSON.stringify({
      deviceId: currentIdentity.deviceId,
      projectId: config.projectId,
      keyId: currentIdentity.keyId,
    }),
    signal: AbortSignal.timeout(15_000),
  }), 'Device registration challenge');
  const timestamp = new Date().toISOString();
  const canonical = [
    'VSP-BROWSER-PROVISIONING-V1',
    'POST',
    '/api/v1/provisioning/devices',
    currentIdentity.deviceId,
    currentIdentity.keyId,
    deviceAuthority,
    policy.policyId,
    challenge.challengeId,
    challenge.nonce,
    timestamp,
  ].join('\n');
  if (typeof currentWallet.api.signData !== 'function') {
    throw new Error(
      `Connected Wallet ${currentWallet.walletName} API ${currentWallet.walletApiVersion} does not support signData`,
    );
  }
  onProgress?.({ stage: 'wallet_signature_requested', status: 'running' });
  const walletSignature = await currentWallet.api.signData(canonical, {
    encoding: 'text',
    keyType: 'unshielded',
  });
  onProgress?.({ stage: 'wallet_authorization_verifying', status: 'running' });
  const submitted = await jsonResponse<ProvisioningResponse | ProvisioningOperationStarted>(await fetch(
    endpoint(config.serviceUrl, '/api/v1/provisioning/devices'),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${projectSessionToken}`,
        'Content-Type': 'application/json',
        'X-Client-Operation-Id': operationId,
      },
      body: JSON.stringify({
        enrollment,
        deviceAuthority,
        policyId: policy.policyId,
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        timestamp,
        walletSignature,
      }),
      signal: AbortSignal.timeout(20 * 60 * 1000),
    },
  ), 'Device registration');
  if ('operationId' in submitted) {
    storePendingProvisioning(submitted, currentIdentity.deviceId, policy.policyId);
    onProgress?.({
      operationId: submitted.operationId,
      stage: submitted.stage,
      status: submitted.status,
      processingSchedule: submitted.processingSchedule,
    });
    return null;
  }
  const response = submitted;
  if (
    response.deviceId !== currentIdentity.deviceId
    || response.projectId !== config.projectId
    || response.contractAddress !== config.contractAddress
    || response.policyId !== policy.policyId
    || response.policyKey !== policy.policyKey
    || response.timeZoneOffsetMinutes !== config.operationalDay.timeZoneOffsetMinutes
    || response.localDayStartHour !== config.operationalDay.localDayStartHour
    || response.utcDayStartMinute !== config.operationalDay.utcDayStartMinute
  ) throw new Error('Device registration response does not match the request');
  provisioned = {
    ...response,
    keyId: currentIdentity.keyId,
    createdAt: currentIdentity.createdAt,
    deviceAuthority,
    enrollment: enrollmentFor(currentIdentity),
  };
  onProgress?.({
    stage: 'completed',
    status: 'registered',
    deviceTxId: response.registeredTxId,
    assignmentTxId: response.assignmentTxId,
    processingSchedule: config.processingSchedule,
  });
  return provisioned;
}

export async function resumePendingDeviceRegistration(
  onProgress?: (progress: ProvisioningProgress) => void,
): Promise<ProvisionedDevice | null> {
  const config = requireConfiguration();
  const currentIdentity = requireIdentity();
  requireWallet();
  const pending = readPendingProvisioning(currentIdentity.deviceId);
  if (!pending) return null;
  if (
    pending.deviceId !== currentIdentity.deviceId
    || typeof pending.policyId !== 'string'
    || typeof pending.operationId !== 'string'
    || typeof pending.progressToken !== 'string'
    || typeof pending.statusUrl !== 'string'
  ) {
    localStorage.removeItem(pendingProvisioningKey(currentIdentity.deviceId));
    return null;
  }
  const policy = selectedPolicy(pending.policyId);
  const status = await readProvisioningStatus(
    pending,
    currentIdentity.deviceId,
    policy.policyId,
    onProgress,
  );
  if (status.status === 'failed') {
    localStorage.removeItem(pendingProvisioningKey(currentIdentity.deviceId));
    throw new Error(status.error || 'Device registration failed');
  }
  if (status.status !== 'registered' || !status.result) return null;
  localStorage.removeItem(pendingProvisioningKey(currentIdentity.deviceId));
  const response = status.result;
  if (
    response.deviceId !== currentIdentity.deviceId
    || response.projectId !== config.projectId
    || response.contractAddress !== config.contractAddress
    || response.policyId !== policy.policyId
    || response.policyKey !== policy.policyKey
    || response.timeZoneOffsetMinutes !== config.operationalDay.timeZoneOffsetMinutes
    || response.localDayStartHour !== config.operationalDay.localDayStartHour
    || response.utcDayStartMinute !== config.operationalDay.utcDayStartMinute
  ) throw new Error('Resumed Device registration does not match the stored identity');
  provisioned = {
    ...response,
    keyId: currentIdentity.keyId,
    createdAt: currentIdentity.createdAt,
    deviceAuthority: deriveDeviceAuthorityHex(currentIdentity.deviceSecretHex),
    enrollment: enrollmentFor(currentIdentity),
  };
  onProgress?.({
    stage: 'completed',
    status: 'registered',
    deviceTxId: response.registeredTxId,
    assignmentTxId: response.assignmentTxId,
    processingSchedule: config.processingSchedule,
  });
  return provisioned;
}

async function authenticatedHeaders(
  scope: Parameters<typeof deviceSession>[2],
  operationId?: string,
): Promise<Record<string, string>> {
  const config = requireConfiguration();
  const session = await deviceSession(config.serviceUrl, requireIdentity(), scope, operationId);
  return {
    Authorization: `Bearer ${session.accessToken}`,
    ...(operationId ? { 'X-Client-Operation-Id': operationId } : {}),
  };
}

async function uploadDailyCapture(
  capture: BrowserDailyCapture,
  operationId: string,
  onProgress?: (progress: ProofRequestAcceptanceProgress) => void,
): Promise<void> {
  const config = requireConfiguration();
  const device = requireProvisioned();
  const policy = selectedPolicy(device.policyId);
  const headers = await authenticatedHeaders('measurement:write', operationId);
  onProgress?.({ stage: 'uploading', completed: 0, total: capture.windows.length });
  for (const [index, window] of capture.windows.entries()) {
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
    }), `Measurement upload (${window.hourIndex}:00 UTC)`);
    onProgress?.({
      stage: 'uploading',
      completed: index + 1,
      total: capture.windows.length,
    });
  }
  const anomalyHeaders = await authenticatedHeaders('anomaly:write', operationId);
  let anomalyOpen = false;
  for (const window of [...capture.windows].sort((left, right) => left.hourIndex - right.hourIndex)) {
    const outside = (
      (policy.mode !== 'upper-bound' && window.minimum < policy.minimum)
      || (policy.mode !== 'lower-bound' && window.maximum > policy.maximum)
    );
    const transition = outside && !anomalyOpen
      ? 'anomaly_open'
      : !outside && anomalyOpen
        ? 'recovered'
        : null;
    anomalyOpen = outside;
    if (!transition) continue;
    await jsonResponse(await fetch(endpoint(config.serviceUrl, '/api/v1/anomaly-events'), {
      method: 'POST',
      headers: { ...anomalyHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: `event-${device.deviceId}-${capture.periodDate}-${window.hourIndex}-${transition}`,
        projectId: config.projectId,
        deviceId: device.deviceId,
        sensorType: 'temperature',
        unit: '°C',
        transition,
        occurredAt: window.periodStart,
        thresholdPolicyVersion: policy.policyId,
      }),
      signal: AbortSignal.timeout(15_000),
    }), `Anomaly transition (${window.hourIndex}:00 UTC)`);
  }
}

function pendingMeasurementContext(): {
  deviceId: string;
  policyId: string;
  assignmentId: string;
  timeZoneOffsetMinutes: number;
  localDayStartHour: number;
} | null {
  const config = requireConfiguration();
  const currentIdentity = requireIdentity();
  const pending = readPendingProvisioning(currentIdentity.deviceId);
  if (!pending) return null;
  selectedPolicy(pending.policyId);
  return {
    deviceId: currentIdentity.deviceId,
    policyId: pending.policyId,
    assignmentId: `${currentIdentity.deviceId}-${pending.policyId}-wave1`,
    timeZoneOffsetMinutes: config.operationalDay.timeZoneOffsetMinutes,
    localDayStartHour: config.operationalDay.localDayStartHour,
  };
}

export async function generateDailyMeasurements(input: {
  periodDate: string;
  mode: DailyGenerationMode;
}): Promise<BrowserDailyCapture> {
  const config = requireConfiguration();
  const operationId = clientOperationId('measurement-day');
  const device = provisioned ?? pendingMeasurementContext();
  if (!device) throw new Error('Register the Device or queue its registration first');
  const policy = selectedPolicy(device.policyId);
  const operationalDay = {
    timeZoneOffsetMinutes: device.timeZoneOffsetMinutes,
    localDayStartHour: device.localDayStartHour,
  };
  validateDailyGenerationDate(input.periodDate, operationalDay);
  const existing = await loadDailyCapture(config.projectId, device.deviceId, input.periodDate);
  captured = existing?.requestedSampleCount === 1440 ? existing : await generateDailyCapture({
    projectId: config.projectId,
    deviceId: device.deviceId,
    periodDate: input.periodDate,
    policy,
    assignmentId: device.assignmentId,
    operationalDay,
    sampleCount: 1440,
    mode: input.mode,
  });
  if (existing !== captured) await storeDailyCapture(captured);
  if (provisioned) await uploadDailyCapture(captured, operationId);
  return captured;
}

export async function selectDailyCapture(periodDate: string): Promise<BrowserDailyCapture> {
  const config = requireConfiguration();
  const currentIdentity = requireIdentity();
  const selected = await loadDailyCapture(config.projectId, currentIdentity.deviceId, periodDate);
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

export async function loadAdministratorDashboard(): Promise<DeviceAdministratorDashboard> {
  const config = requireConfiguration();
  requireProvisioned();
  const headers = await authenticatedHeaders('device:status');
  return jsonResponse<DeviceAdministratorDashboard>(await fetch(
    endpoint(config.serviceUrl, '/api/v1/device/dashboard'),
    { headers, signal: AbortSignal.timeout(15_000) },
  ), 'Device administrator dashboard');
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

function deferredProofJob(
  measurement: BrowserDailyCapture,
  schedule: ServerProcessingSchedule,
): ProofJob {
  return {
    proofJobId: measurement.proofJobId,
    periodDate: measurement.periodDate,
    status: 'waiting_for_registration',
    measurementGroupId: measurement.attestation.publicData.measurementGroupId,
    attestationCommitment: measurement.attestation.publicData.attestationCommitment,
    sampleCount: measurement.attestation.publicData.sampleCount,
    observedHourCount: measurement.attestation.publicData.observedHourCount,
    stoppedHourCount: 24 - measurement.attestation.publicData.observedHourCount,
    hourResults: measurement.hourResults,
    thresholdSatisfied: measurement.thresholdSatisfied,
    availableAfter: schedule.nextProcessingStartsAt ?? new Date().toISOString(),
    attestTxId: null,
    attestTxHash: null,
    errorCode: null,
  };
}

export async function loadDeferredWorkflow(): Promise<{
  workflow: DeferredBrowserWorkflow;
  capture: BrowserDailyCapture;
  job: ProofJob;
} | null> {
  const config = requireConfiguration();
  const currentIdentity = requireIdentity();
  const workflow = readDeferredWorkflow(config.projectId, currentIdentity.deviceId);
  if (!workflow) return null;
  const capture = await loadDailyCapture(config.projectId, currentIdentity.deviceId, workflow.periodDate);
  if (!capture || capture.proofJobId !== workflow.proofJobId) return null;
  captured = capture;
  return {
    workflow,
    capture,
    job: deferredProofJob(capture, config.processingSchedule),
  };
}

export function queueDeferredSubmission(periodDate?: string): DeferredBrowserWorkflow {
  const config = requireConfiguration();
  const currentIdentity = requireIdentity();
  const measurement = requireCaptured();
  if (periodDate && measurement.periodDate !== periodDate) {
    throw new Error('The selected sensor day does not match the queued Proof Job');
  }
  const existing = readDeferredWorkflow(config.projectId, currentIdentity.deviceId);
  const pending = readPendingProvisioning(currentIdentity.deviceId);
  const workflow: DeferredBrowserWorkflow = {
    schemaVersion: 1,
    operationId: existing?.operationId ?? pending?.operationId ?? '',
    projectId: config.projectId,
    deviceId: currentIdentity.deviceId,
    policyId: existing?.policyId ?? provisioned?.policyId ?? pending?.policyId ?? '',
    periodDate: measurement.periodDate,
    proofJobId: measurement.proofJobId,
    proofRequestedAt: existing?.proofRequestedAt ?? new Date().toISOString(),
    submissionRequested: true,
  };
  if (!workflow.policyId) throw new Error('The queued Device Policy is unavailable');
  storeDeferredWorkflow(workflow);
  return workflow;
}

export async function refreshProofJob(proofJobId: string): Promise<ProofJob> {
  return proofJob(proofJobId);
}

export async function requestProof(input: {
  admitNow?: boolean;
  periodDate?: string;
  onAcceptanceProgress?: (progress: ProofRequestAcceptanceProgress) => void;
} = {}): Promise<ProofJob> {
  const config = requireConfiguration();
  const operationId = clientOperationId('proof-request');
  if (input.periodDate) await selectDailyCapture(input.periodDate);
  const measurement = requireCaptured();
  if (!measurement.completeDay) throw new Error('The selected operational day is still in progress');
  if (!provisioned) {
    const currentIdentity = requireIdentity();
    const pending = readPendingProvisioning(currentIdentity.deviceId);
    if (!pending) throw new Error('Register the Device or queue its registration first');
    const workflow: DeferredBrowserWorkflow = {
      schemaVersion: 1,
      operationId: pending.operationId,
      projectId: config.projectId,
      deviceId: currentIdentity.deviceId,
      policyId: pending.policyId,
      periodDate: measurement.periodDate,
      proofJobId: measurement.proofJobId,
      proofRequestedAt: new Date().toISOString(),
      submissionRequested: false,
    };
    storeDeferredWorkflow(workflow);
    input.onAcceptanceProgress?.({ stage: 'accepted', completed: 0, total: 0 });
    return deferredProofJob(measurement, config.processingSchedule);
  }
  const device = provisioned;
  await uploadDailyCapture(measurement, operationId, input.onAcceptanceProgress);
  const publicData = measurement.attestation.publicData;
  const headers = await authenticatedHeaders('proof:request', operationId);
  const deferred = readDeferredWorkflow(config.projectId, device.deviceId);
  input.onAcceptanceProgress?.({
    stage: 'registering',
    completed: measurement.windows.length,
    total: measurement.windows.length,
  });
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
        measurementDay: publicData.measurementDay,
        timeZoneOffsetMinutes: publicData.timeZoneOffsetMinutes,
        localDayStartHour: publicData.localDayStartHour,
        utcDayStartMinute: publicData.utcDayStartMinute,
        hourPresence: publicData.hourPresence,
        hourResults: measurement.hourResults,
        observedHourCount: publicData.observedHourCount,
        thresholdSatisfied: measurement.thresholdSatisfied,
        schemaVersion: publicData.schemaVersion,
        circuitVersion: publicData.circuitVersion,
        ...(deferred?.operationId
          ? { deferredProvisioningOperationId: deferred.operationId }
          : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    },
  ), 'Create Proof Job')).job;
  if (job.proofJobId !== measurement.proofJobId) throw new Error('Proof Job ID mismatch');
  input.onAcceptanceProgress?.({
    stage: 'accepted',
    completed: measurement.windows.length,
    total: measurement.windows.length,
  });

  if (deferred) storeDeferredWorkflow({ ...deferred, proofJobId: job.proofJobId });

  if (input.admitNow) {
    await jsonResponse(await fetch(
      endpoint(config.serviceUrl, `/api/v1/proof-jobs/${encodeURIComponent(job.proofJobId)}/admit`),
      {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(30_000),
      },
    ), 'Admit Proof Job');
  }
  if (!input.admitNow) return job;
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
  const operationId = clientOperationId('proof-submit');
  const device = requireProvisioned();
  if (periodDate) await selectDailyCapture(periodDate);
  const measurement = requireCaptured();
  if (!measurement.completeDay) throw new Error('The selected operational day is still in progress');
  const currentWallet = requireWallet();
  const proofHeaders = await authenticatedHeaders('proof:generate', operationId);
  const accessToken = proofHeaders.Authorization?.replace(/^Bearer\s+/u, '');
  if (!accessToken) throw new Error('Device proof session was not issued');
  let result: Awaited<ReturnType<typeof submitBrowserAttestation>> | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      result = await submitBrowserAttestation({
        wallet: currentWallet,
        serviceUrl: config.serviceUrl,
        zkArtifactsUrl: window.location.origin,
        contractAddress: config.contractAddress,
        accessToken,
        clientOperationId: operationId,
        proofJobId: measurement.proofJobId,
        deviceSecretHex: requireIdentity().deviceSecretHex,
        attestation: measurement.attestation,
        hourResults: measurement.hourResults,
        thresholdSatisfied: measurement.thresholdSatisfied,
        onProgress,
      });
      break;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (detail.includes('contract_state_changed_reproof_required') && attempt === 0) {
        onProgress?.('contract-state-changed-retrying');
        continue;
      }
      if (!detail.includes('measurement group already attested')) throw error;
      const headers = await authenticatedHeaders('transaction:submit', operationId);
      await jsonResponse(await fetch(
        endpoint(config.serviceUrl, `/api/v1/proof-jobs/${encodeURIComponent(measurement.proofJobId)}/result`),
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phase: 'failed',
            errorCode: 'measurement_group_already_attested',
          }),
          signal: AbortSignal.timeout(15_000),
        },
      ), 'Record already-attested Proof Job');
      throw new Error('measurement group already attested; this Proof Job is closed', { cause: error });
    }
  }
  if (!result) throw new Error('Device transaction retry did not return a result');
  const headers = await authenticatedHeaders('transaction:submit', operationId);
  await jsonResponse(await fetch(
    endpoint(config.serviceUrl, `/api/v1/proof-jobs/${encodeURIComponent(measurement.proofJobId)}/result`),
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phase: 'attest',
        txId: result.transactionId,
        txHash: result.transactionHash,
        blockHeight: result.blockHeight,
        proofGeneratedAt: result.proofCompletedAt,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  ), 'Report Midnight transaction');
  localStorage.removeItem(deferredWorkflowKey(config.projectId, device.deviceId));
  return result;
}

export const browserDeviceFlow = {
  availableWallets,
  isWalletConnectionLost,
  walletConnectionFailureStage,
  resetWalletConnection,
  loadConfiguration,
  connectWallet,
  selectProject,
  createProject,
  loadProjectPolicies,
  refreshProjectConfiguration,
  createPolicy,
  restoreDevice,
  createDevice,
  registerDevice,
  resumePendingDeviceRegistration,
  loadDeferredWorkflow,
  queueDeferredSubmission,
  generateDailyMeasurements,
  selectDailyCapture,
  loadDeviceHistory,
  loadAdministratorDashboard,
  loadSponsorQuota,
  requestProof,
  refreshProofJob,
  proveAndSubmit,
};
