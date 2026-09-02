import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import WebSocket from 'ws';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const publicRoot = path.join(repoRoot, 'frontend/verification-portal/public');
const outputRoot = path.join(repoRoot, '.sct-output/dashboard');
const chromeExecutable = process.env.CHROME_EXECUTABLE || '/usr/bin/google-chrome';

function contentType(file) {
  return new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.png', 'image/png'],
    ['.wasm', 'application/wasm'],
  ]).get(path.extname(file)) || 'application/octet-stream';
}

function json(response, status, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

const publicProof = {
  proofJobId: 'proof-gui-sct-001',
  periodDate: '2026-08-28',
  sampleCount: 1440,
  observedHourCount: 24,
  stoppedHourCount: 0,
  thresholdSatisfied: false,
  thresholdResult: 'outside-threshold',
  resultVerified: true,
  hourPresence: Array.from({ length: 24 }, () => true),
  hourResults: Array.from({ length: 24 }, (_value, hour) => (
    hour === 12 || hour === 18 ? 'outside-threshold' : 'within-threshold'
  )),
  deviceCommitment: '22'.repeat(32),
  thresholdPolicyVersion: 'temperature-v1',
  policyKey: '44'.repeat(32),
  policy: {
    mode: 'closed-range', minimum: 10, maximum: 35, valueScale: 100,
    sensorType: 'temperature', unit: '°C', version: 1,
  },
  assignmentKey: '55'.repeat(32),
  assignmentVersion: 1,
  assignmentValidFrom: '2026-08-01T00:00:00.000Z',
  assignmentValidUntil: '2026-09-01T00:00:00.000Z',
  operationalDay: { timeZoneOffsetMinutes: 0, localDayStartHour: 0, utcDayStartMinute: 0 },
  measurementGroupId: '66'.repeat(32),
  attestationCommitment: '77'.repeat(32),
  schemaVersion: 7,
  circuitVersion: 5,
  proofGeneratedAt: '2026-08-28T02:14:15.000Z',
  status: 'confirmed',
  claim: 'Each operational hour is publicly proved as WITHIN, OUTSIDE, or NO DATA under the registered threshold; the sensor values remain private.',
  claimJa: '運用日の各時間帯について、登録済みしきい値に対する「閾値以内・範囲外・計測なし」を公開しています。センサー値自体は非公開です。',
  checks: {
    dailyAttestationRecorded: true,
    committedHourlyExtrema: true,
    attestationVerified: true,
    midnightConfirmed: true,
  },
  transactions: {
    attest: {
      txId: 'gui-sct-attest-tx',
      txHash: '88'.repeat(32),
      blockHeight: '123456',
    },
  },
  network: 'Midnight Preprod',
  contractAddress: '33'.repeat(32),
  privacy: {
    hourlyExtrema: 'private',
    nonce: 'private',
    thresholdPolicy: 'public-on-ledger',
  },
};

const publicProofWithin = {
  ...publicProof,
  proofJobId: 'proof-gui-sct-within-001',
  periodDate: '2026-08-27',
  thresholdSatisfied: true,
  thresholdResult: 'within-threshold',
  hourResults: Array.from({ length: 24 }, () => 'within-threshold'),
  claim: 'Each UTC hour is publicly proved as WITHIN, OUTSIDE, or NO DATA under the registered threshold; the sensor values remain private.',
  claimJa: 'UTCの各時間帯について、登録済みしきい値に対する「閾値以内・範囲外・計測なし」を公開しています。センサー値自体は非公開です。',
  attestationCommitment: '99'.repeat(32),
  transactions: {
    attest: {
      txId: 'gui-sct-within-attest-tx',
      txHash: 'aa'.repeat(32),
      blockHeight: '123455',
    },
  },
};

const publicProofStopped = {
  ...publicProof,
  proofJobId: 'proof-gui-sct-stopped-001',
  periodDate: '2026-08-26',
  sampleCount: 0,
  observedHourCount: 0,
  stoppedHourCount: 24,
  thresholdSatisfied: true,
  thresholdResult: 'stopped',
  hourPresence: Array.from({ length: 24 }, () => false),
  hourResults: Array.from({ length: 24 }, () => 'no-data'),
  claim: 'All 24 UTC hours are publicly reported as NO DATA; no sensor values are disclosed.',
  claimJa: 'UTCの24時間すべてが「計測なし」として公開され、センサー値自体は開示されません。',
  attestationCommitment: 'bb'.repeat(32),
  transactions: {
    attest: {
      txId: 'gui-sct-stopped-attest-tx',
      txHash: 'cc'.repeat(32),
      blockHeight: '123454',
    },
  },
};

const publicProofs = [publicProof, publicProofWithin, publicProofStopped];

const mockDeviceFlowModule = `
const contractAddress = '${'33'.repeat(32)}';
const policyKey = '${'44'.repeat(32)}';
const assignmentKey = '${'55'.repeat(32)}';
const walletADeviceId = 'device-${'a1'.repeat(32)}';
const walletBDeviceId = 'device-${'b2'.repeat(32)}';
const secondProjectDeviceId = 'device-${'c3'.repeat(32)}';
const defaultProjectId = 'measurement-authenticity-01';
let activeProjectId = defaultProjectId;
const projectList = [{
  projectId: defaultProjectId, name: 'Measurement Data Authenticity', nameJa: null,
  timeZone: 'UTC+00:00', timeZoneOffsetMinutes: 0, localDayStartHour: 0, utcDayStartMinute: 0,
  createdAt: '2026-08-30T00:00:00.000Z',
}];
if (localStorage.getItem('sct-second-project-created') === 'true') projectList.push({
  projectId: 'project-gui-sct-002', name: 'Second construction site', nameJa: null,
  timeZone: 'UTC+09:00', timeZoneOffsetMinutes: 540, localDayStartHour: 6, utcDayStartMinute: 1260,
  createdAt: '2026-08-31T00:00:00.000Z',
});
const state = {
  device: null, provisioned: null, capture: null, job: null, registrationPolls: 0,
  registrationTerminalReturned: false, registrationPolicyId: 'temperature-v1',
  policyOperation: null, policyPolls: 0,
};
const periodDate = '2026-08-28';
const historicalPeriodDate = '2026-08-27';
const windows = Array.from({ length: 24 }, (_, hour) => ({
  periodStart: new Date(Date.parse(periodDate + 'T00:00:00Z') + hour * 3600000).toISOString(),
  periodEnd: new Date(Date.parse(periodDate + 'T00:00:00Z') + (hour + 1) * 3600000).toISOString(),
  count: 60, minimum: hour === 12 ? 8 : 20, maximum: hour === 18 ? 38 : 24,
  average: 22, unit: '°C', commitment: String(hour + 1).padStart(2, '0').repeat(32),
}));
const historicalWindows = windows.map((window, hour) => ({
  ...window,
  periodStart: new Date(Date.parse(historicalPeriodDate + 'T00:00:00Z') + hour * 3600000).toISOString(),
  periodEnd: new Date(Date.parse(historicalPeriodDate + 'T00:00:00Z') + (hour + 1) * 3600000).toISOString(),
  minimum: 20,
  maximum: 24,
  commitment: String(hour + 25).padStart(2, '0').repeat(32),
}));
const historicalCapture = {
  periodDate: historicalPeriodDate,
  records: Array.from({ length: 1440 }, () => ({})),
  windows: historicalWindows,
  requestedSampleCount: 1440,
  outlierCount: 0,
  thresholdSatisfied: true,
  completeDay: true,
  attestation: { publicData: { observedHourCount: 24 } },
};
const historicalProofJob = {
  proofJobId: 'proof-gui-sct-within-001', periodDate: historicalPeriodDate,
  sampleCount: 1440, observedHourCount: 24, stoppedHourCount: 0,
  thresholdSatisfied: true, status: 'confirmed',
  attestationCommitment: '${'99'.repeat(32)}', attestTxId: 'gui-sct-within-attest-tx',
  attestTxHash: '${'aa'.repeat(32)}', blockHeight: '123455', errorCode: null,
  proofGeneratedAt: '2026-08-27T02:10:00.000Z',
};
function proofJob(status = 'ready_for_input') {
  return {
    proofJobId: 'proof-gui-sct-001', periodDate, sampleCount: 1440,
    observedHourCount: 24, stoppedHourCount: 0, thresholdSatisfied: false,
    status, attestationCommitment: '${'77'.repeat(32)}',
    attestTxId: ['submitted', 'confirmed'].includes(status) ? 'gui-sct-attest-tx' : null,
    attestTxHash: ['submitted', 'confirmed'].includes(status) ? '${'88'.repeat(32)}' : null,
    blockHeight: status === 'confirmed' ? '123456' : null, errorCode: null,
    proofGeneratedAt: status === 'confirmed' ? '2026-08-28T02:14:15.000Z' : null,
  };
}
function provisioned() {
  const policyId = state.registrationPolicyId || 'temperature-v1';
  return {
    ...state.device, contractAddress, deviceCommitment: '${'22'.repeat(32)}',
    policyId, policyKey,
    assignmentId: state.device.deviceId + '-' + policyId + '-wave1', assignmentKey,
    timeZoneOffsetMinutes: 0, localDayStartHour: 0, utcDayStartMinute: 0,
    registeredTxId: 'gui-sct-device-tx', assignmentTxId: 'gui-sct-assignment-tx',
  };
}
function history() {
  return {
    windows: state.capture ? [...windows, ...historicalWindows] : [], anomalies: state.capture ? [{
      eventId: 'gui-sct-anomaly', transition: 'opened', occurredAt: windows[12].periodStart,
      reason: 'Threshold exceeded',
    }] : [], proofJobs: state.job ? [state.job, historicalProofJob] : [historicalProofJob],
    localCaptures: state.capture ? [state.capture, historicalCapture] : [],
  };
}
function policies(projectId = activeProjectId) {
  const items = projectId === defaultProjectId ? [{
    policyId: 'temperature-v1', name: 'Temperature 10–35 °C', policyKey,
    mode: 'closed-range', minimum: 10, maximum: 35, valueScale: 100,
    sensorTypeCode: 1, unitCode: 1, version: 1, registeredTxId: 'gui-sct-policy-tx',
  }] : [];
  if (projectId === defaultProjectId && localStorage.getItem('sct-policy-registered') === 'true') {
    items.push({ policyId: 'policy-gui-sct-002', name: 'Concrete curing temperature',
      policyKey: '${'45'.repeat(32)}', mode: 'closed-range', minimum: 12.5, maximum: 32.75,
      valueScale: 100, sensorTypeCode: 1, unitCode: 1, version: 1,
      registeredTxId: 'gui-sct-policy-create-tx' });
  }
  return items;
}
function configuration(projectId = activeProjectId) {
  return {
    network: 'preprod', projectId, contractAddress, serviceUrl: location.origin,
    operationalDay: projectId === defaultProjectId
      ? { timeZoneOffsetMinutes: 0, localDayStartHour: 0, utcDayStartMinute: 0 }
      : { timeZoneOffsetMinutes: 540, localDayStartHour: 6, utcDayStartMinute: 1260 },
    policies: policies(projectId), maximumPolicies: 10,
  };
}
export const browserDeviceFlow = {
  async loadConfiguration() {
    return configuration();
  },
  async connectWallet() {
    const walletSwitch = new URL(location.href).searchParams.get('sct') === 'wallet-switch';
    activeProjectId = defaultProjectId;
    return {
      walletName: walletSwitch ? 'Lace SCT Wallet B' : 'Lace SCT Wallet A', walletApiVersion: '4.0.0',
      walletKeySha256: walletSwitch ? '${'22'.repeat(32)}' : '${'11'.repeat(32)}',
      deviceId: walletSwitch ? walletBDeviceId : walletADeviceId, networkId: 'preprod',
      shieldedAddress: 'mn_shield-addr_sct', indexerUri: 'https://indexer.invalid',
      indexerWsUri: 'wss://indexer.invalid',
      projects: [...projectList], maximumProjects: 10, selectedProjectId: defaultProjectId,
      configuration: configuration(defaultProjectId),
    };
  },
  async selectProject(projectId) {
    activeProjectId = projectId;
    state.device = null; state.provisioned = null; state.capture = null; state.job = null;
    const walletSwitch = new URL(location.href).searchParams.get('sct') === 'wallet-switch';
    return {
      deviceId: projectId === defaultProjectId
        ? walletSwitch ? walletBDeviceId : walletADeviceId
        : secondProjectDeviceId,
      configuration: configuration(projectId),
    };
  },
  async createProject(input) {
    const project = {
      projectId: 'project-gui-sct-002', name: input.name, nameJa: null,
      timeZone: 'UTC+09:00', timeZoneOffsetMinutes: input.timeZoneOffsetMinutes,
      localDayStartHour: input.localDayStartHour, utcDayStartMinute: 1260,
      createdAt: new Date().toISOString(),
    };
    if (!projectList.some((item) => item.projectId === project.projectId)) projectList.push(project);
    localStorage.setItem('sct-second-project-created', 'true');
    const selected = await this.selectProject(project.projectId);
    return { project, projectCount: projectList.length, maximumProjects: 10, ...selected };
  },
  async loadProjectPolicies() {
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (state.policyOperation) {
      state.policyPolls += 1;
      if (state.policyPolls >= 2) {
        state.policyOperation = {
          ...state.policyOperation,
          status: 'registered', stage: 'completed',
          policyKey: '${'45'.repeat(32)}', policyTxId: 'gui-sct-policy-create-tx',
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem('sct-policy-registered', 'true');
      }
    }
    return {
      policies: policies().map((policy) => ({ ...policy, status: 'registered' })),
      operations: state.policyOperation ? [{ ...state.policyOperation }] : [],
      maximumPolicies: 10,
    };
  },
  async refreshProjectConfiguration() {
    return configuration();
  },
  async createPolicy(input) {
    localStorage.setItem('sct-policy-created', 'true');
    localStorage.removeItem('sct-policy-registered');
    state.policyPolls = 0;
    state.policyOperation = {
      operationId: 'pol_gui-sct-001', projectId: activeProjectId,
      policyId: 'policy-gui-sct-002', name: input.name, mode: input.mode,
      minimum: input.minimum, maximum: input.maximum, status: 'queued', stage: 'queued',
      policyKey: null, policyTxId: null, error: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    return { ...state.policyOperation };
  },
  async restoreDevice(deviceId) {
    if (
      new URL(location.href).searchParams.get('sct') === 'wallet-switch'
      && deviceId === walletADeviceId
    ) {
      return {
        device: {
          deviceId: walletADeviceId, projectId: defaultProjectId,
          keyId: 'stale-wallet-a-key', createdAt: new Date().toISOString(),
          deviceAuthority: '${'dd'.repeat(32)}', enrollment: { deviceId: walletADeviceId },
        },
        provisioned: null,
        warning: null,
      };
    }
    if (localStorage.getItem('sct-device-id') !== deviceId) return null;
    state.device = {
      deviceId, projectId: activeProjectId, keyId: 'gui-sct-p256-key',
      createdAt: '2026-08-31T00:00:00.000Z', deviceAuthority: '${'aa'.repeat(32)}',
      enrollment: { deviceId },
    };
    state.registrationPolicyId = localStorage.getItem('sct-registration-policy') || 'temperature-v1';
    state.provisioned = localStorage.getItem('sct-device-provisioned') === 'true'
      ? provisioned()
      : null;
    if (localStorage.getItem('sct-capture-created') === 'true') state.capture = {
      periodDate, records: Array.from({ length: 1440 }, () => ({})), windows,
      requestedSampleCount: 1440, outlierCount: 2, thresholdSatisfied: false,
      completeDay: true, attestation: { publicData: { observedHourCount: 24 } },
    };
    if (localStorage.getItem('sct-job-confirmed') === 'true') state.job = proofJob('confirmed');
    return { device: state.device, provisioned: state.provisioned, warning: null };
  },
  async createDevice(deviceId) {
    state.device = {
      deviceId, projectId: activeProjectId, keyId: 'gui-sct-p256-key',
      createdAt: new Date().toISOString(), deviceAuthority: '${'aa'.repeat(32)}',
      enrollment: { deviceId },
    };
    localStorage.setItem('sct-device-id', deviceId);
    return state.device;
  },
  async registerDevice(input, onProgress) {
    state.registrationPolicyId = input.policyId;
    localStorage.setItem('sct-registration-policy', input.policyId);
    const terminalFailure = new URL(location.href).searchParams.get('sct') === 'registration-failure';
    onProgress?.({
      operationId: terminalFailure ? 'prv_gui-sct-failed-001' : 'prv_gui-sct-001',
      stage: 'queued',
      status: 'queued',
    });
    return null;
  },
  async resumePendingDeviceRegistration(onProgress) {
    state.registrationPolls += 1;
    if (new URL(location.href).searchParams.get('sct') === 'registration-failure') {
      if (state.registrationTerminalReturned) return null;
      state.registrationTerminalReturned = true;
      onProgress?.({
        operationId: 'prv_gui-sct-failed-001',
        stage: 'failed',
        status: 'failed',
        error: 'Registration retry budget exhausted',
      });
      throw new Error('Registration retry budget exhausted');
    }
    state.provisioned = provisioned();
    localStorage.setItem('sct-device-provisioned', 'true');
    onProgress?.({ operationId: 'prv_gui-sct-001', stage: 'completed', status: 'registered',
      deviceTxId: state.provisioned.registeredTxId,
      assignmentTxId: state.provisioned.assignmentTxId });
    return state.provisioned;
  },
  async generateDailyMeasurements() {
    state.capture = {
      periodDate, records: Array.from({ length: 1440 }, () => ({})), windows,
      requestedSampleCount: 1440, outlierCount: 2, thresholdSatisfied: false,
      completeDay: true,
      attestation: { publicData: {
        periodDate, measurementGroupId: '${'66'.repeat(32)}',
        attestationCommitment: '${'77'.repeat(32)}', deviceCommitment: '${'22'.repeat(32)}',
        sampleCount: 1440, policyId: 'temperature-v1', policyKey,
        assignmentId: state.provisioned.assignmentId, assignmentKey,
        hourPresence: Array.from({ length: 24 }, () => true), observedHourCount: 24,
        hourResults: Array.from({ length: 24 }, (_, hour) =>
          hour === 12 || hour === 18 ? 'outside-threshold' : 'within-threshold'),
        measurementDay: 20693, timeZoneOffsetMinutes: 0, localDayStartHour: 0,
        utcDayStartMinute: 0, schemaVersion: 7, circuitVersion: 5,
      } },
    };
    localStorage.setItem('sct-capture-created', 'true');
    return state.capture;
  },
  async selectDailyCapture(selectedDate) {
    return selectedDate === historicalPeriodDate ? historicalCapture : state.capture;
  },
  async loadDeviceHistory() { return history(); },
  async loadSponsorQuota() {
    return { quotaDate: periodDate, dailyLimit: 20, used: state.job ? 1 : 0,
      remaining: state.job ? 19 : 20, resetAt: '2026-08-29T15:00:00.000Z',
      reservedProofJobIds: state.job ? [state.job.proofJobId] : [] };
  },
  async requestProof() {
    state.job = proofJob('ready_for_input');
    localStorage.setItem('sct-job-requested', 'true');
    return state.job;
  },
  async proveAndSubmit(onProgress) {
    for (const step of ['connecting-contract', 'building-transaction', 'generating-proof',
      'wallet-approval', 'requesting-sponsorship', 'transaction-sponsored',
      'submitting-transaction', 'confirmed']) onProgress?.(step);
    state.job = proofJob('confirmed');
    localStorage.setItem('sct-job-confirmed', 'true');
    return {
      transactionId: 'gui-sct-attest-tx', transactionHash: '${'88'.repeat(32)}',
      blockHeight: '123456', sponsorTransactionId: 'gui-sct-sponsor-tx',
      feeSpecks: '1000000000000', feeDust: '0.001000000000000',
      deviceTransactionBytes: 1000, transactionBytes: 1200,
      proofStartedAt: new Date().toISOString(), proofCompletedAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(), confirmedAt: new Date().toISOString(),
    };
  },
  async loadAdministratorDashboard() {
    return {
      source: 'GUI SCT', project: { id: 'measurement-authenticity-01', name: 'SCT Project',
        nameJa: 'SCT', organization: 'SCT', organizationJa: 'SCT', timezone: 'Asia/Tokyo' },
      devices: [{ id: state.device.deviceId, name: state.device.deviceId, sensorType: 'temperature',
        unit: '°C', thresholdPolicyVersion: 'temperature-v1',
        midnightDeviceCommitment: '${'22'.repeat(32)}', midnightRegistryStatus: 'registered',
        midnightRegistrationVersion: 1, midnightContractAddress: contractAddress,
        lastSeenAt: windows[23].periodEnd }],
      windows: [...windows, ...historicalWindows], anomalies: history().anomalies,
      anomalyState: { state: 'normal', changedAt: '2026-08-28T15:00:00.000Z' },
      proofJobs: [proofJob('confirmed'), historicalProofJob],
      policies: [{ policyId: 'temperature-v1', mode: 'closed-range', minimum: 10, maximum: 35,
        valueScale: 100, sensorType: 'temperature', unit: '°C', version: 1, status: 'registered' }],
      stepper: { deviceRegistered: true, hourlyDataReceived: true, anomalyStateAvailable: true,
        proofRequested: true, proofGenerated: true, midnightConfirmed: true },
    };
  },
};
export async function verifyPublicAttestation(data) {
  await new Promise((resolve) => setTimeout(resolve, 750));
  return { ...data, checks: { dailyAttestationRecorded: true, committedHourlyExtrema: true,
    attestationVerified: true, midnightConfirmed: true } };
}
export async function loadPublicAttestationByTransactionHash(transactionHash) {
  if (transactionHash !== '${'88'.repeat(32)}') throw new Error('Unknown GUI SCT transaction');
  await new Promise((resolve) => setTimeout(resolve, 750));
  return ${JSON.stringify({ ...publicProof, proofJobId: null, proofGeneratedAt: null, hourlyResultsAvailable: true })};
}
`;

function createServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/health') return json(response, 200, { ok: true, gui: 'worker-spa' });
    if (url.pathname === '/device-flow.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(mockDeviceFlowModule);
      return;
    }
    if (url.pathname === '/api/v1/public/proofs') {
      return json(response, 200, { proofs: publicProofs });
    }
    if (url.pathname.startsWith('/api/v1/public/proofs/by-transaction/')) {
      const transactionHash = decodeURIComponent(url.pathname.slice('/api/v1/public/proofs/by-transaction/'.length));
      const proof = publicProofs.find((candidate) => candidate.transactions.attest.txHash === transactionHash);
      if (proof) return json(response, 200, { proofJobId: proof.proofJobId });
    }
    if (url.pathname.startsWith('/api/v1/public/proofs/')) {
      const proofJobId = decodeURIComponent(url.pathname.slice('/api/v1/public/proofs/'.length));
      const proof = publicProofs.find((candidate) => candidate.proofJobId === proofJobId);
      if (proof) return json(response, 200, proof);
    }
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const resolved = path.resolve(publicRoot, `.${pathname}`);
    if (!resolved.startsWith(`${publicRoot}${path.sep}`) || !fs.existsSync(resolved)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': contentType(resolved), 'Cache-Control': 'no-store' });
    fs.createReadStream(resolved).pipe(response);
  });
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.events = [];
    socket.on('message', (data) => {
      const message = JSON.parse(String(data));
      const pending = this.pending.get(message.id);
      if (!pending) {
        this.events.push(message);
        if (this.events.length > 100) this.events.shift();
        return;
      }
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result || {});
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  recentEvents(method) {
    return this.events.filter((event) => event.method === method);
  }

  close() { this.socket.close(); }
}

async function waitForFile(file, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) return;
    await sleep(100);
  }
  throw new Error(`Chrome DevTools endpoint did not appear: ${file}`);
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });
const server = createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}`;
const userDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vsp-gui-sct-'));
const chrome = spawn(chromeExecutable, [
  '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run',
  '--no-default-browser-check', '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0', `--user-data-dir=${userDataDirectory}`,
  '--window-size=1440,1000', 'about:blank',
], { stdio: 'ignore' });

let cdp;
const results = [];
try {
  const portFile = path.join(userDataDirectory, 'DevToolsActivePort');
  await waitForFile(portFile);
  const [debugPort] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
  const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent('about:blank')}`, {
    method: 'PUT', signal: AbortSignal.timeout(10_000),
  });
  const target = await targetResponse.json();
  cdp = await CdpClient.connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
  });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: "localStorage.setItem('vsp-language', 'en');",
  });

  const evaluate = async (expression) => {
    const result = await cdp.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
    return result.result?.value;
  };
  const waitFor = async (expression, timeoutMs = 20_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await sleep(100);
    }
    const body = await evaluate(`document.querySelector('main')?.textContent || document.body.textContent`);
    const exceptions = cdp.recentEvents('Runtime.exceptionThrown').slice(-3)
      .map((event) => event.params?.exceptionDetails?.exception?.description
        || event.params?.exceptionDetails?.text)
      .filter(Boolean);
    throw new Error(`Timed out waiting for GUI state: ${expression}\nRendered text: ${String(body).slice(0, 2_000)}\nBrowser exceptions: ${exceptions.join('\n') || 'none'}`);
  };
  const click = async (selector) => {
    await waitFor(`document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const capture = async (name) => {
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const file = path.join(outputRoot, `${name}.png`);
    fs.writeFileSync(file, screenshot.data, 'base64');
    return file;
  };
  const pass = async (name, evidence) => {
    const screenshot = await capture(name);
    results.push({
      name,
      status: 'passed',
      evidence,
      screenshot: path.relative(repoRoot, screenshot),
    });
  };

  await cdp.send('Page.navigate', { url: `${baseUrl}/#/device` });
  await waitFor(`document.readyState === 'complete' && document.querySelector('.wallet-gate')`);
  await pass('01-wallet-gate', 'Device Workflow is gated before Wallet connection');

  await click('#wallet-connect-button');
  await waitFor(`document.querySelector('#device-identity-create')`);
  await pass('02-wallet-connected', 'Wallet connection reveals the guided Device Workflow');

  assert.equal(await evaluate(`document.querySelectorAll('#device-project-select option').length`), 1);
  assert.match(await evaluate(`document.querySelector('.project-count').textContent`), /1\s*\/\s*10/u);
  await click('#device-project-add');
  await waitFor(`document.querySelector('#device-project-create-form')`);
  await evaluate(`document.querySelector('#device-project-name').value = 'Second construction site'; document.querySelector('#device-project-create-form').requestSubmit()`);
  await waitFor(`document.querySelectorAll('#device-project-select option').length === 2 && document.querySelector('#device-project-select').value === 'project-gui-sct-002'`);
  assert.equal(await evaluate(`document.querySelector('#device-id-input').value`), `device-${'c3'.repeat(32)}`);
  assert.equal(await evaluate(`document.querySelector('.policy-management-window .data-state-empty')?.textContent.includes('NO DATA')`), true);
  assert.equal(await evaluate(`Boolean(document.querySelector('.policy-management-window .data-state-spinner'))`), false);
  await pass('02-project-empty-state', 'A completed empty Policy query is shown as NO DATA without a loading spinner');
  await evaluate(`const select = document.querySelector('#device-project-select'); select.value = 'measurement-authenticity-01'; select.dispatchEvent(new Event('change', { bubbles: true }))`);
  await waitFor(`document.querySelector('#device-project-select').value === 'measurement-authenticity-01' && document.querySelector('#device-id-input').value === ${JSON.stringify(`device-${'a1'.repeat(32)}`)}`);
  await pass('02-project-create-switch', 'The Wallet creates a second Project, receives a different Device ID, and switches back from the dropdown');

  await click('#device-policy-add');
  await waitFor(`document.querySelector('#device-policy-create-form')`);
  await evaluate(`
    document.querySelector('#device-policy-name').value = 'Concrete curing temperature';
    document.querySelector('#device-policy-minimum').value = '12.50';
    document.querySelector('#device-policy-maximum').value = '32.75';
    document.querySelector('#device-policy-create-form').requestSubmit();
  `);
  await waitFor(`document.querySelector('.policy-management-window')?.textContent.includes('Concrete curing temperature')`);
  await click('#device-policy-add');
  await waitFor(`document.querySelector('#device-policy-create-form')`);
  await evaluate(`
    window.__sctPolicyFormNode = document.querySelector('#device-policy-create-form');
    document.querySelector('#device-policy-name').value = 'Draft must survive polling';
    document.querySelector('#device-policy-minimum').value = '17.25';
    document.querySelector('#device-policy-maximum').value = '29.75';
    document.querySelector('#device-policy-minimum').focus();
  `);
  await waitFor(`document.querySelector('.policy-management-window .data-state-loading')`, 12_000);
  assert.equal(await evaluate(`document.querySelector('.policy-management-window .data-state-loading')?.textContent.includes('LOADING')`), true);
  await pass('03-policy-loading-draft', 'Policy synchronization is visibly loading while the second Policy draft remains unchanged');
  await waitFor(`document.querySelector('.policy-management-window')?.textContent.includes('gui-sct-policy-create-tx')`);
  assert.equal(await evaluate(`document.querySelector('#device-policy-name').value`), 'Draft must survive polling');
  assert.equal(await evaluate(`document.querySelector('#device-policy-minimum').value`), '17.25');
  assert.equal(await evaluate(`document.querySelector('#device-policy-maximum').value`), '29.75');
  assert.equal(await evaluate(`window.__sctPolicyFormNode === document.querySelector('#device-policy-create-form')`), true);
  assert.equal(await evaluate(`document.activeElement === document.querySelector('#device-policy-minimum')`), true);
  await click('#device-policy-cancel');
  assert.equal(await evaluate(`document.querySelector('#device-policy').value`), 'policy-gui-sct-002');
  await pass('03-policy-create-restore', 'Loading and empty states are distinct; Policy polling patches only status/list components and keeps the exact draft form DOM node');

  await click('#device-identity-create');
  await waitFor(`document.querySelector('#device-identity-create.completed-action')`);
  await pass('03-device-identity', 'Device Identity is complete and the registration action is next');

  await click('#device-register');
  await waitFor(`document.querySelector('#registration-job-id')?.textContent.includes('prv_gui-sct-001')`);
  assert.equal(await evaluate(`document.querySelector('#device-register').classList.contains('active-action')`), false);
  assert.equal(await evaluate(`document.querySelector('#device-register').textContent.includes('IN PROGRESS')`), false);
  assert.equal(await evaluate(`document.querySelector('#device-register').disabled`), true);
  assert.equal(await evaluate(`document.querySelector('.device-stepper li.current .step-state')?.textContent === 'WAIT'`), true);
  assert.equal(await evaluate(`document.querySelector('.device-stepper li.current .step-state')?.textContent.includes('NEXT ACTION')`), false);
  await pass('04-registration-job-accepted', 'Job ID is shown and the browser is released after acceptance');

  await waitFor(`document.querySelector('#device-register.completed-action')`, 10_000);
  assert.match(await evaluate(`document.querySelector('#registration-device-tx').textContent`), /gui-sct-device-tx/u);
  assert.match(await evaluate(`document.querySelector('#registration-assignment-tx').textContent`), /gui-sct-assignment-tx/u);
  await pass('05-registration-complete', 'Device and Threshold Assignment transaction IDs are shown');

  await click('#device-capture');
  await waitFor(`document.querySelector('#device-capture.completed-action') && document.body.textContent.includes('1440')`);
  assert.equal(await evaluate(`document.querySelectorAll('.device-day-list tbody tr').length === 2`), true);
  assert.equal(await evaluate(`document.querySelectorAll('.device-hourly-summary tbody tr').length === 24`), true);
  await pass('06-daily-sensor-capture', 'One day contains 1,440 readings and 24 hourly summaries');

  await click(`.device-day-select[data-period-date="2026-08-27"]`);
  await waitFor(`document.querySelector('.device-hourly-summary .daily-heading')?.textContent.includes('2026-08-27')`);
  assert.equal(await evaluate(`document.querySelectorAll('.device-hourly-summary tbody tr').length === 24`), true);
  assert.equal(await evaluate(`document.querySelector('.device-day-list tr.selected-row')?.textContent.includes('2026-08-27')`), true);
  await pass('07-daily-history-navigation', 'Two JST days can be selected independently and each renders 24 hourly summaries');

  await click(`.device-day-select[data-period-date="2026-08-28"]`);
  await waitFor(`document.querySelector('.device-hourly-summary .daily-heading')?.textContent.includes('2026-08-28')`);

  await click('#device-proof-request');
  await waitFor(`document.querySelector('#device-submit') && !document.querySelector('#device-submit').disabled`);
  await pass('08-proof-job-ready', 'The admitted Proof Job enables the ZKP/TX action');

  await click('#device-submit');
  await waitFor(`document.querySelector('.transaction-id')?.textContent.includes('gui-sct-attest-tx') && document.querySelector('.sponsor-transaction')?.textContent.includes('gui-sct-sponsor-tx')`);
  assert.match(await evaluate(`document.querySelector('.sponsor-transaction').textContent`), /gui-sct-sponsor-tx/u);
  await pass('09-sponsored-transaction', 'Sponsored Midnight transaction evidence is visible');

  await cdp.send('Page.reload');
  await waitFor(`document.readyState === 'complete' && document.querySelector('.wallet-gate')`);
  await click('#wallet-connect-button');
  await waitFor(`document.querySelector('#device-register.completed-action') && document.querySelectorAll('.device-day-list tbody tr').length === 2`);
  assert.equal(await evaluate(`document.querySelectorAll('#device-project-select option').length`), 2);
  assert.equal(await evaluate(`document.querySelector('#device-policy').value`), 'policy-gui-sct-002');
  assert.equal(await evaluate(`document.querySelector('.transaction-id')?.textContent.includes('gui-sct-attest-tx')`), true);
  await pass('09-reload-restoration', 'Reload plus Wallet reconnect restores Project, Policy, Device registration, local daily capture, and server Proof state');

  await evaluate(`location.hash = '#/admin'`);
  await waitFor(`document.querySelectorAll('.proof-stepper li.complete').length >= 6`);
  assert.equal(await evaluate(`document.querySelectorAll('.admin-anomalies tbody tr').length === 1`), true);
  assert.equal(await evaluate(`document.querySelector('.admin-anomalies').textContent.toLowerCase().includes('opened')`), true);
  assert.equal(await evaluate(`document.querySelector('.current-device-state')?.textContent.includes('NORMAL')`), true);
  assert.equal(await evaluate(`document.body.textContent.includes('ZKP generated at')`), true);
  assert.equal(await evaluate(`[...document.querySelectorAll('.data-table')].some((table) => table.querySelector('thead')?.textContent.includes('ZKP generated at') && table.querySelector('tbody tr td:nth-child(8)')?.textContent.trim() !== '—')`), true);
  await pass('10-administrator', 'Administrator stepper, hourly history, anomaly, and TX state are complete');

  await cdp.send('Page.reload');
  await waitFor(`document.readyState === 'complete' && document.querySelector('#admin-access-gate') && !document.querySelector('.error-window')`);
  assert.equal(await evaluate(`document.body.textContent.includes('Could not load the requested view.')`), false);
  await click('#wallet-connect-button');
  await waitFor(`document.querySelectorAll('.admin-anomalies tbody tr').length === 1`);
  assert.equal(await evaluate(`Boolean(document.querySelector('#admin-access-gate'))`), false);
  await pass('10-administrator-reconnect', 'Administrator reload shows an access gate and Wallet reconnect restores the view without a manual retry');

  await evaluate(`location.hash = '#/verify'`);
  await waitFor(`document.querySelectorAll('.verifier-form tbody tr').length === 3`);
  assert.equal(await evaluate(`document.querySelector('.verifier-form tbody tr:first-child')?.textContent.includes('2026-08-28')`), true);
  assert.equal(await evaluate(`document.querySelector('.verifier-form').textContent.includes('WITHIN THRESHOLD')`), true);
  assert.equal(await evaluate(`document.querySelector('.verifier-form').textContent.includes('OUTSIDE THRESHOLD')`), true);
  assert.equal(await evaluate(`document.querySelector('.verifier-form').textContent.includes('NO DATA')`), true);
  assert.equal(await evaluate(`Boolean(document.querySelector('#transaction-hash-form'))`), true);
  await pass('11-third-party-proof-list', 'Newest-first daily list renders WITHIN, OUTSIDE, and NO DATA public results');

  await evaluate(`document.querySelector('#transaction-hash-input').value = '${'88'.repeat(32)}'; document.querySelector('#transaction-hash-form').requestSubmit()`);
  await waitFor(`location.hash.includes('verify-tx/${'88'.repeat(32)}')`);
  await waitFor(`document.querySelector('.dashboard-sync-state.syncing') && document.querySelector('.dashboard-sync-progress')`);
  await pass('12-third-party-chain-checking', 'A visible progress indicator remains while the public Indexer check is running');
  await waitFor(`document.querySelectorAll('.check-list .check-code:not(.waiting)').length === 4 && document.querySelectorAll('.public-proof-pipeline li.complete').length === 5`);
  assert.equal(await evaluate(`Boolean(document.querySelector('.raw-values-redacted'))`), true);
  assert.equal(await evaluate(`document.body.textContent.includes('HIDDEN FROM THIRD PARTIES')`), true);
  assert.equal(await evaluate(`document.body.textContent.includes('PRIVATE_EXTREMA_SENTINEL')`), false);
  assert.equal(await evaluate(`document.querySelectorAll('.hourly-results-table tbody tr').length`), 24);
  assert.equal(await evaluate(`document.querySelectorAll('.hour-result.outside-threshold').length`), 2);
  assert.equal(await evaluate(`document.body.textContent.includes('${'22'.repeat(32)}')`), true);
  assert.equal(await evaluate(`['Effective from', 'Effective until'].every((label) => { const term = [...document.querySelectorAll('.definition-grid dt')].find((node) => node.textContent.trim() === label); return term?.nextElementSibling?.textContent.includes('2026'); })`), true);
  assert.equal(await evaluate(`document.querySelectorAll('a.explorer-link[href^="https://preprod.midnightexplorer.com/"]').length >= 4`), true);
  assert.equal(await evaluate(`[...document.querySelectorAll('a.explorer-link')].every((link) => link.target === '_blank' && link.rel.includes('noopener'))`), true);
  await pass('13-third-party-verification', 'Public checks and Explorer evidence complete while raw and hourly values remain hidden');
  await evaluate(`document.querySelector('.hourly-results-table').scrollIntoView({ block: 'start' })`);
  await pass('13-third-party-hourly-results', 'All 24 UTC hourly threshold results are visible without revealing extrema');

  await evaluate(`localStorage.setItem('vsp-browser-device-id', ${JSON.stringify(`device-${'a1'.repeat(32)}`)})`);
  await cdp.send('Page.navigate', { url: `${baseUrl}/?sct=wallet-switch#/device` });
  await waitFor(`document.readyState === 'complete' && document.querySelector('.wallet-gate')`);
  await click('#wallet-connect-button');
  await waitFor(`document.querySelector('#device-identity-create')`);
  assert.equal(
    await evaluate(`document.querySelector('#device-id-input').value`),
    `device-${'b2'.repeat(32)}`,
  );
  assert.equal(await evaluate(`document.querySelector('#device-id-input').readOnly`), true);
  assert.equal(await evaluate(`document.querySelector('#device-identity-create').disabled`), false);
  assert.equal(await evaluate(`document.querySelector('#device-identity-create').classList.contains('completed-action')`), false);
  await pass('14-wallet-derived-device-isolation', 'A new Wallet derives a new read-only Device ID and never restores the stale Wallet Device');

  await evaluate(`for (const key of ['sct-device-id', 'sct-device-provisioned', 'sct-registration-policy', 'sct-capture-created', 'sct-job-requested', 'sct-job-confirmed']) localStorage.removeItem(key)`);
  await cdp.send('Page.navigate', { url: `${baseUrl}/?sct=registration-failure#/device` });
  await waitFor(`document.readyState === 'complete' && document.querySelector('.wallet-gate')`);
  await click('#wallet-connect-button');
  await waitFor(`document.querySelector('#device-identity-create')`);
  await click('#device-identity-create');
  await waitFor(`document.querySelector('#device-identity-create.completed-action')`);
  await click('#device-register');
  await waitFor(`document.querySelector('#registration-job-id')?.textContent.includes('prv_gui-sct-failed-001')`);
  await waitFor(`document.querySelector('.registration-progress-failed') && !document.querySelector('#device-register').disabled`);
  assert.equal(await evaluate(`document.querySelector('#device-register').classList.contains('next-action')`), true);
  assert.equal(await evaluate(`document.querySelector('#device-register').classList.contains('active-action')`), false);
  assert.equal(await evaluate(`document.querySelector('#device-register').textContent.includes('IN PROGRESS')`), false);
  assert.equal(await evaluate(`document.querySelector('#registration-progress-stage')?.textContent === 'Could not complete'`), true);
  assert.match(await evaluate(`document.querySelector('.device-error')?.textContent || ''`), /retry budget exhausted/u);
  await pass('15-registration-terminal-retry', 'Only a terminal server failure re-enables the registration action for browser retry');

  fs.writeFileSync(path.join(outputRoot, 'result.json'), JSON.stringify({
    status: 'passed', baseUrl, tests: results,
  }, null, 2));
  process.stdout.write(`GUI SCT passed: ${results.length} rendered checkpoints\n`);
  process.stdout.write(`Evidence: ${outputRoot}\n`);
} finally {
  cdp?.close();
  chrome.kill('SIGTERM');
  server.close();
  await sleep(500);
  try {
    fs.rmSync(userDataDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (error) {
    process.stderr.write(`GUI SCT cleanup warning: ${error.message}\n`);
  }
}
