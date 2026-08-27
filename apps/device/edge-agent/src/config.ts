import { config as loadEnv } from 'dotenv';
import os from 'node:os';
import path from 'node:path';

export interface EdgeConfig {
  port: number;
  intervalSeconds: number;
  sensorPath: string;
  ingestUrl: string;
  ingestToken: string;
  projectId: string;
  deviceId: string;
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
  if (!ingestUrl.pathname.startsWith('/api/v1/readings')) {
    throw new Error('CLOUDFLARE_INGEST_URL must target /api/v1/readings');
  }

  const ingestToken = process.env.INGEST_API_TOKEN?.trim();
  if (!ingestToken || ingestToken.startsWith('replace-with-')) {
    throw new Error(`INGEST_API_TOKEN is not configured in ${envFile}`);
  }

  return {
    port: positiveInteger('AGENT_PORT', 8788, 65_535),
    intervalSeconds: positiveInteger('SENSOR_INTERVAL_SECONDS', 60, 86_400),
    sensorPath: process.env.TEMPERATURE_SENSOR_PATH?.trim()
      || '/sys/class/thermal/thermal_zone0/temp',
    ingestUrl: ingestUrl.href,
    ingestToken,
    projectId: process.env.SENSOR_PROJECT_ID?.trim() || 'measurement-authenticity-01',
    deviceId: process.env.SENSOR_DEVICE_ID?.trim() || 'edge-temp-001',
  };
}
