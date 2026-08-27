import fs from 'node:fs';
import http from 'node:http';

import type { EdgeConfig } from './config.js';

interface CollectorStatus {
  startedAt: string;
  lastAttemptAt: string | null;
  lastMeasurementAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
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

export async function postTemperature(config: EdgeConfig, value: number): Promise<void> {
  const response = await fetch(config.ingestUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.ingestToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId: config.projectId,
      deviceId: config.deviceId,
      sensorType: 'temperature',
      unit: '°C',
      value,
      recordedAt: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Ingestion failed with HTTP ${response.status}: ${message.slice(0, 240)}`);
  }
}

function sendJson(response: http.ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

export async function startCollector(config: EdgeConfig): Promise<void> {
  const status: CollectorStatus = {
    startedAt: new Date().toISOString(),
    lastAttemptAt: null,
    lastMeasurementAt: null,
    lastError: null,
    consecutiveFailures: 0,
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
        sensorPath: config.sensorPath,
        ...status,
      });
    }
    return sendJson(response, 404, { error: 'Not found' });
  });
  server.listen(config.port, '127.0.0.1', () => {
    log('info', 'collector_started', {
      healthUrl: `http://127.0.0.1:${config.port}/health`,
      intervalSeconds: config.intervalSeconds,
      sensorPath: config.sensorPath,
      ingestHost: new URL(config.ingestUrl).host,
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
      const temperature = await readTemperature(config.sensorPath);
      await postTemperature(config, temperature);
      status.lastMeasurementAt = new Date().toISOString();
      status.lastError = null;
      status.consecutiveFailures = 0;
      log('info', 'temperature_submitted', {
        valueCelsius: temperature,
        measuredAt: status.lastMeasurementAt,
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
