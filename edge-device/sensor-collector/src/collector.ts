import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { deviceAuthenticatedFetch, type DeviceScope } from '@midnight-demo/device-auth';

import {
  addMeasurement,
  createMeasurementWindow,
  evaluateAnomaly,
  finalizeMeasurementWindow,
  initialAnomalyState,
  type AnomalyState,
  type MeasurementWindowState,
} from './aggregation.js';
import type { EdgeConfig } from './config.js';

interface CollectorStatus {
  startedAt: string;
  lastAttemptAt: string | null;
  lastMeasurementAt: string | null;
  lastUploadAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  activeWindowStart: string | null;
  activeWindowCount: number;
  anomalyState: 'normal' | 'anomaly_open';
  outboxCount: number;
}

export interface PersistentCollectorState {
  schemaVersion: 1;
  window: MeasurementWindowState | null;
  anomaly: AnomalyState;
  syntheticTick: number;
}

interface OutboxEnvelope {
  schemaVersion: 1;
  kind: 'measurement-window' | 'anomaly-event';
  createdAt: string;
  payload: Record<string, unknown>;
}

function log(level: 'info' | 'error', event: string, details: Record<string, unknown> = {}): void {
  const output = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    component: 'edge-agent',
    event,
    ...details,
  });
  (level === 'error' ? process.stderr : process.stdout).write(`${output}\n`);
}

let atomicWriteCounter = 0;

function writeOwnerOnly(file: string, content: string): void {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}-${atomicWriteCounter}`;
  atomicWriteCounter += 1;
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, content, { encoding: 'utf8' });
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
  let directoryDescriptor: number | undefined;
  try {
    directoryDescriptor = fs.openSync(path.dirname(file), 'r');
    fs.fsyncSync(directoryDescriptor);
  } finally {
    if (directoryDescriptor !== undefined) fs.closeSync(directoryDescriptor);
  }
}

function statePath(config: EdgeConfig): string {
  return path.join(config.dataDirectory, 'collector-state.json');
}

function outboxDirectory(config: EdgeConfig): string {
  return path.join(config.dataDirectory, 'outbox');
}

function rawDirectory(config: EdgeConfig): string {
  return path.join(config.dataDirectory, 'raw');
}

function ensureDataDirectories(config: EdgeConfig): void {
  for (const directory of [config.dataDirectory, outboxDirectory(config), rawDirectory(config)]) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
  }
}

function initialCollectorState(): PersistentCollectorState {
  return { schemaVersion: 1, window: null, anomaly: initialAnomalyState(), syntheticTick: 0 };
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validWindow(value: unknown): value is MeasurementWindowState {
  if (!value || typeof value !== 'object') return false;
  const window = value as Partial<MeasurementWindowState>;
  return validTimestamp(window.periodStart)
    && validTimestamp(window.periodEnd)
    && window.periodStart < window.periodEnd
    && Number.isSafeInteger(window.count)
    && (window.count ?? 0) > 0
    && typeof window.minimum === 'number'
    && Number.isFinite(window.minimum)
    && typeof window.maximum === 'number'
    && Number.isFinite(window.maximum)
    && window.minimum <= window.maximum
    && typeof window.sum === 'number'
    && Number.isFinite(window.sum)
    && typeof window.hashChain === 'string'
    && /^[A-Za-z0-9_-]{43}$/u.test(window.hashChain);
}

function validAnomaly(value: unknown): value is AnomalyState {
  if (!value || typeof value !== 'object') return false;
  const anomaly = value as Partial<AnomalyState>;
  return (anomaly.state === 'normal' || anomaly.state === 'anomaly_open')
    && (
      anomaly.pendingTransition === null
      || anomaly.pendingTransition === 'anomaly_open'
      || anomaly.pendingTransition === 'recovered'
    )
    && Number.isSafeInteger(anomaly.pendingCount)
    && (anomaly.pendingCount ?? -1) >= 0
    && (anomaly.lastEventAt === null || validTimestamp(anomaly.lastEventAt));
}

function validCollectorState(value: unknown): value is PersistentCollectorState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<PersistentCollectorState>;
  return state.schemaVersion === 1
    && (state.window === null || validWindow(state.window))
    && validAnomaly(state.anomaly)
    && Number.isSafeInteger(state.syntheticTick)
    && (state.syntheticTick ?? -1) >= 0;
}

function quarantinePath(file: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');
  let candidate = `${file}.corrupt-${timestamp}`;
  let suffix = 0;
  while (fs.existsSync(candidate)) {
    suffix += 1;
    candidate = `${file}.corrupt-${timestamp}-${suffix}`;
  }
  return candidate;
}

export function loadCollectorState(config: EdgeConfig): PersistentCollectorState {
  const file = statePath(config);
  if (!fs.existsSync(file)) {
    return initialCollectorState();
  }
  try {
    const state: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!validCollectorState(state)) throw new Error('Collector state is invalid');
    return state;
  } catch (error) {
    const quarantined = quarantinePath(file);
    fs.renameSync(file, quarantined);
    fs.chmodSync(quarantined, 0o600);
    log('error', 'collector_state_quarantined', {
      file: path.basename(quarantined),
      error: error instanceof Error ? error.message : String(error),
    });
    return initialCollectorState();
  }
}

function saveState(config: EdgeConfig, state: PersistentCollectorState): void {
  writeOwnerOnly(statePath(config), `${JSON.stringify(state)}\n`);
}

function queueOutbox(config: EdgeConfig, envelope: OutboxEnvelope, stableId: string): void {
  const file = path.join(outboxDirectory(config), `${stableId}.json`);
  if (fs.existsSync(file)) return;
  writeOwnerOnly(file, `${JSON.stringify(envelope)}\n`);
}

function appendRawMeasurement(config: EdgeConfig, measuredAt: Date, value: number): void {
  const file = path.join(rawDirectory(config), `${measuredAt.toISOString().slice(0, 10)}.ndjson`);
  fs.appendFileSync(file, `${JSON.stringify({ measuredAt: measuredAt.toISOString(), value })}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  fs.chmodSync(file, 0o600);
}

function endpoint(config: EdgeConfig, envelope: OutboxEnvelope): URL {
  return new URL(
    envelope.kind === 'measurement-window' ? 'measurement-windows' : 'anomaly-events',
    config.serviceUrl,
  );
}

function scope(envelope: OutboxEnvelope): DeviceScope {
  return envelope.kind === 'measurement-window' ? 'measurement:write' : 'anomaly:write';
}

async function postEnvelope(config: EdgeConfig, envelope: OutboxEnvelope): Promise<void> {
  const response = await deviceAuthenticatedFetch({
    deviceId: config.deviceId,
    projectId: config.projectId,
    serviceUrl: config.serviceUrl,
    authHome: config.authHome,
  }, scope(envelope), endpoint(config, envelope), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(envelope.payload),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Cloud ingestion failed with HTTP ${response.status}: ${message.slice(0, 240)}`);
  }
}

function outboxFiles(config: EdgeConfig): string[] {
  return fs.readdirSync(outboxDirectory(config))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => path.join(outboxDirectory(config), name));
}

async function drainOutbox(config: EdgeConfig, status: CollectorStatus): Promise<void> {
  const files = outboxFiles(config);
  status.outboxCount = files.length;
  for (const file of files) {
    const envelope = JSON.parse(fs.readFileSync(file, 'utf8')) as OutboxEnvelope;
    if (envelope.schemaVersion !== 1) throw new Error(`Unsupported outbox envelope: ${path.basename(file)}`);
    await postEnvelope(config, envelope);
    fs.unlinkSync(file);
    status.lastUploadAt = new Date().toISOString();
    status.outboxCount -= 1;
    log('info', 'outbox_delivered', { kind: envelope.kind });
  }
}

export function parseTemperature(raw: string): number {
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`Temperature sensor returned an invalid value: ${raw.trim()}`);
  }
  const celsius = Math.abs(parsed) > 200 ? parsed / 1_000 : parsed;
  if (celsius < -100 || celsius > 200) {
    throw new Error(`Temperature is outside the supported range: ${celsius}`);
  }
  return Number(celsius.toFixed(3));
}

export async function readTemperature(sensorPath: string): Promise<number> {
  return parseTemperature(await fs.promises.readFile(sensorPath, 'utf8'));
}

function syntheticTemperature(config: EdgeConfig, tick: number): number {
  return Number((config.syntheticBase + config.syntheticAmplitude * Math.sin(tick / 10)).toFixed(3));
}

export function seedSyntheticDemoWindow(
  config: EdgeConfig,
  sampleCount = 60,
  now = new Date(),
): { periodStart: string; periodEnd: string; count: number } {
  if (config.sensorMode !== 'synthetic') {
    throw new Error('Synthetic demo seed requires SENSOR_MODE=synthetic');
  }
  if (!Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > 3_600) {
    throw new Error('Synthetic demo sample count must be between 1 and 3600');
  }
  ensureDataDirectories(config);
  if (
    fs.existsSync(statePath(config))
    || outboxFiles(config).length > 0
    || fs.readdirSync(rawDirectory(config)).length > 0
  ) {
    throw new Error('Synthetic demo seed refuses to overwrite existing collector state, outbox, or raw data');
  }
  const currentStart = new Date(now);
  currentStart.setUTCMinutes(0, 0, 0);
  const previousStartMs = currentStart.valueOf() - 60 * 60 * 1_000;
  let window = createMeasurementWindow(new Date(previousStartMs));
  for (let index = 0; index < sampleCount; index += 1) {
    const offsetMs = Math.floor(((index + 0.5) * 60 * 60 * 1_000) / sampleCount);
    const measuredAt = new Date(previousStartMs + offsetMs);
    const temperature = syntheticTemperature(config, index);
    appendRawMeasurement(config, measuredAt, temperature);
    window = addMeasurement(window, temperature, measuredAt);
  }
  saveState(config, {
    schemaVersion: 1,
    window,
    anomaly: initialAnomalyState(),
    syntheticTick: sampleCount,
  });
  return { periodStart: window.periodStart, periodEnd: window.periodEnd, count: window.count };
}

async function collectOne(
  config: EdgeConfig,
  persistent: PersistentCollectorState,
  measuredAt: Date,
): Promise<PersistentCollectorState> {
  const temperature = config.sensorMode === 'synthetic'
    ? syntheticTemperature(config, persistent.syntheticTick)
    : await readTemperature(config.sensorPath);
  appendRawMeasurement(config, measuredAt, temperature);
  let window = persistent.window;
  if (window && measuredAt.toISOString() >= window.periodEnd) {
    if (window.count > 0) {
      const finalized = finalizeMeasurementWindow({
        state: window,
        projectId: config.projectId,
        deviceId: config.deviceId,
        thresholdPolicyVersion: config.thresholdPolicyVersion,
      });
      queueOutbox(config, {
        schemaVersion: 1,
        kind: 'measurement-window',
        createdAt: measuredAt.toISOString(),
        payload: { ...finalized },
      }, finalized.batchId);
      log('info', 'measurement_window_closed', {
        batchId: finalized.batchId,
        count: finalized.count,
        periodStart: finalized.periodStart,
        periodEnd: finalized.periodEnd,
      });
    }
    window = null;
  }
  window ??= createMeasurementWindow(measuredAt);
  window = addMeasurement(window, temperature, measuredAt);
  const evaluated = evaluateAnomaly({
    state: persistent.anomaly,
    value: temperature,
    measuredAt,
    projectId: config.projectId,
    deviceId: config.deviceId,
    normalMinimum: config.normalMinimum,
    normalMaximum: config.normalMaximum,
    hysteresis: config.anomalyHysteresis,
    debounceSamples: config.anomalyDebounceSamples,
    cooldownSeconds: config.anomalyCooldownSeconds,
    thresholdPolicyVersion: config.thresholdPolicyVersion,
  });
  if (evaluated.event) {
    queueOutbox(config, {
      schemaVersion: 1,
      kind: 'anomaly-event',
      createdAt: measuredAt.toISOString(),
      payload: { ...evaluated.event },
    }, evaluated.event.eventId);
    log('info', 'anomaly_transition', { transition: evaluated.event.transition });
  }
  return {
    schemaVersion: 1,
    window,
    anomaly: evaluated.state,
    syntheticTick: persistent.syntheticTick + 1,
  };
}

function sendJson(response: http.ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

export async function startCollector(config: EdgeConfig): Promise<void> {
  ensureDataDirectories(config);
  let persistent = loadCollectorState(config);
  const status: CollectorStatus = {
    startedAt: new Date().toISOString(),
    lastAttemptAt: null,
    lastMeasurementAt: null,
    lastUploadAt: null,
    lastError: null,
    consecutiveFailures: 0,
    activeWindowStart: persistent.window?.periodStart ?? null,
    activeWindowCount: persistent.window?.count ?? 0,
    anomalyState: persistent.anomaly.state,
    outboxCount: outboxFiles(config).length,
  };
  let stopped = false;
  let stopWait: (() => void) | undefined;
  const stopSignal = new Promise<void>((resolve) => {
    stopWait = resolve;
  });
  const server = http.createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      return sendJson(response, 200, {
        ok: true,
        role: 'edge-agent',
        sensorMode: config.sensorMode,
        intervalSeconds: config.intervalSeconds,
        ...status,
      });
    }
    return sendJson(response, 404, { error: 'Not found' });
  });
  server.listen(config.port, '127.0.0.1', () => {
    log('info', 'collector_started', {
      healthUrl: `http://127.0.0.1:${config.port}/health`,
      intervalSeconds: config.intervalSeconds,
      sensorMode: config.sensorMode,
      cloudHost: new URL(config.serviceUrl).host,
    });
  });
  const stop = () => {
    if (stopped) return;
    stopped = true;
    server.close();
    stopWait?.();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  while (!stopped) {
    status.lastAttemptAt = new Date().toISOString();
    try {
      const measuredAt = new Date();
      persistent = await collectOne(config, persistent, measuredAt);
      saveState(config, persistent);
      status.lastMeasurementAt = measuredAt.toISOString();
      status.activeWindowStart = persistent.window?.periodStart ?? null;
      status.activeWindowCount = persistent.window?.count ?? 0;
      status.anomalyState = persistent.anomaly.state;
      await drainOutbox(config, status);
      status.lastError = null;
      status.consecutiveFailures = 0;
      log('info', 'measurement_collected', {
        activeWindowStart: status.activeWindowStart,
        activeWindowCount: status.activeWindowCount,
        outboxCount: status.outboxCount,
      });
    } catch (error) {
      status.lastError = error instanceof Error ? error.message : String(error);
      status.consecutiveFailures += 1;
      log('error', 'collection_failed', {
        error: status.lastError,
        consecutiveFailures: status.consecutiveFailures,
      });
    }
    await Promise.race([
      new Promise((resolve) => setTimeout(resolve, config.intervalSeconds * 1_000)),
      stopSignal,
    ]);
  }
  log('info', 'collector_stopped');
}
