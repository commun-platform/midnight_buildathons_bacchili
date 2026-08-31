import { config as loadEnv } from 'dotenv';
import os from 'node:os';
import path from 'node:path';

export interface EdgeConfig {
  port: number;
  intervalSeconds: number;
  sensorPath: string;
  serviceUrl: string;
  projectId: string;
  deviceId: string;
  authHome?: string;
  dataDirectory: string;
  sensorMode: 'hardware' | 'synthetic';
  syntheticBase: number;
  syntheticAmplitude: number;
  normalMinimum: number;
  normalMaximum: number;
  anomalyHysteresis: number;
  anomalyDebounceSamples: number;
  anomalyCooldownSeconds: number;
  thresholdPolicyVersion: string;
}

const deviceHome = path.join(os.homedir(), '.midnight', 'midnight-cloudflare-demo');
const configuredEnvFile = process.env.MIDNIGHT_DEVICE_ENV_FILE?.trim()
  || process.env.EDGE_ENV_FILE?.trim();
const envFile = configuredEnvFile
  ? path.resolve(configuredEnvFile)
  : path.join(deviceHome, 'config', 'device.env');

loadEnv({ path: envFile, quiet: true });

function positiveInteger(name: string, fallback: number, maximum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

function finiteNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
  return value;
}

export function loadEdgeConfig(): EdgeConfig {
  const rawUrl = process.env.CLOUDFLARE_INGEST_URL?.trim();
  if (!rawUrl || rawUrl.includes('<your-subdomain>')) {
    throw new Error(`CLOUDFLARE_INGEST_URL is not configured in ${envFile}`);
  }
  const ingestUrl = new URL(rawUrl);
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(ingestUrl.hostname);
  if (ingestUrl.protocol !== 'https:' && !loopback) {
    throw new Error('CLOUDFLARE_INGEST_URL must use HTTPS unless it targets loopback');
  }
  const serviceUrl = new URL('/api/v1/', ingestUrl);
  const sensorMode = process.env.SENSOR_MODE?.trim() || 'hardware';
  if (sensorMode !== 'hardware' && sensorMode !== 'synthetic') {
    throw new Error('SENSOR_MODE must be hardware or synthetic');
  }
  const normalMinimum = finiteNumber('SENSOR_NORMAL_MINIMUM', 10);
  const normalMaximum = finiteNumber('SENSOR_NORMAL_MAXIMUM', 35);
  if (normalMinimum >= normalMaximum) throw new Error('SENSOR_NORMAL_MINIMUM must be below maximum');

  return {
    port: positiveInteger('AGENT_PORT', 8788, 65_535),
    intervalSeconds: positiveInteger('SENSOR_INTERVAL_SECONDS', 60, 86_400),
    sensorPath: process.env.TEMPERATURE_SENSOR_PATH?.trim()
      || '/sys/class/thermal/thermal_zone0/temp',
    serviceUrl: serviceUrl.href,
    projectId: process.env.SENSOR_PROJECT_ID?.trim() || 'measurement-authenticity-01',
    deviceId: process.env.SENSOR_DEVICE_ID?.trim() || 'edge-temp-001',
    authHome: process.env.DEVICE_AUTH_HOME?.trim() || undefined,
    dataDirectory: path.resolve(process.env.EDGE_DATA_DIRECTORY?.trim() || path.join(deviceHome, 'data')),
    sensorMode,
    syntheticBase: finiteNumber('SYNTHETIC_TEMPERATURE_BASE', 22),
    syntheticAmplitude: finiteNumber('SYNTHETIC_TEMPERATURE_AMPLITUDE', 2),
    normalMinimum,
    normalMaximum,
    anomalyHysteresis: finiteNumber('ANOMALY_HYSTERESIS', 0.5),
    anomalyDebounceSamples: positiveInteger('ANOMALY_DEBOUNCE_SAMPLES', 3, 1_000),
    anomalyCooldownSeconds: positiveInteger('ANOMALY_COOLDOWN_SECONDS', 300, 86_400),
    thresholdPolicyVersion: process.env.THRESHOLD_POLICY_VERSION?.trim() || 'temperature-v1',
  };
}
