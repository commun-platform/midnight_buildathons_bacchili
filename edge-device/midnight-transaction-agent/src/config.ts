import { config as loadEnv } from 'dotenv';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

import {
  deviceAuthorizationHeaders,
  fetchDeviceOperationConfiguration,
  type DeviceOperationConfiguration,
} from '@midnight-demo/device-auth';

export type NetworkId = 'preview' | 'preprod';

export interface NetworkConfig {
  networkId: NetworkId;
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
  faucet: string;
}

export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const deviceHome = path.join(
  os.homedir(),
  '.midnight',
  'midnight-cloudflare-demo',
);
const configuredDeviceEnvFile = process.env.MIDNIGHT_DEVICE_ENV_FILE?.trim();
export const deviceEnvPath = configuredDeviceEnvFile
  ? path.resolve(configuredDeviceEnvFile)
  : path.join(deviceHome, 'config', 'device.env');
loadEnv({ path: deviceEnvPath, quiet: true });

export const deviceWalletHome = path.join(deviceHome, 'device-wallet');
export const stateDir = path.join(deviceWalletHome, 'state');
export const dataDir = path.join(deviceWalletHome, 'data');
export const contractArtifactsPath = path.join(
  repoRoot,
  'runtime/device-artifacts/sensor-registry',
);
export const contractModulePath = path.join(contractArtifactsPath, 'contract/index.js');

const NETWORKS: Record<NetworkId, Omit<NetworkConfig, 'proofServer'>> = {
  preview: {
    networkId: 'preview',
    indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preview.midnight.network',
    faucet: 'https://midnight-tmnight-preview.nethermind.dev',
  },
  preprod: {
    networkId: 'preprod',
    indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preprod.midnight.network',
    faucet: 'https://midnight-tmnight-preprod.nethermind.dev',
  },
};

export function resolveNetwork(value?: string): NetworkConfig {
  const network = value ?? process.env.MIDNIGHT_NETWORK ?? 'preprod';
  if (network !== 'preview' && network !== 'preprod') {
    throw new Error(`Unsupported Midnight network: ${network}`);
  }

  const base = NETWORKS[network];
  return {
    ...base,
    indexer: process.env.MIDNIGHT_INDEXER_URL ?? base.indexer,
    indexerWS: process.env.MIDNIGHT_INDEXER_WS_URL ?? base.indexerWS,
    node: process.env.MIDNIGHT_NODE_URL ?? base.node,
    proofServer: process.env.MIDNIGHT_PROOF_SERVER_URL ?? 'http://127.0.0.1:6300',
  };
}

export function isLocalProofServer(proofServer: string): boolean {
  const url = new URL(proofServer);
  return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
}

export function deviceProofAuthConfig(proofServer: string) {
  return {
    deviceId: process.env.SENSOR_DEVICE_ID?.trim() || 'edge-temp-001',
    projectId: process.env.SENSOR_PROJECT_ID?.trim() || 'measurement-authenticity-01',
    serviceUrl: proofServer,
    authHome: process.env.DEVICE_AUTH_HOME?.trim() || undefined,
  };
}

export async function proofServerHeaders(
  proofServer: string,
  proofJobId?: string,
): Promise<Record<string, string>> {
  if (isLocalProofServer(proofServer)) return {};
  const headers = await deviceAuthorizationHeaders(deviceProofAuthConfig(proofServer), 'proof:generate');
  return proofJobId ? { ...headers, 'X-Proof-Job-Id': proofJobId } : headers;
}

const managedOperationKeys = [
  'MIDNIGHT_NETWORK',
  'DEVICE_CONTRACT_ADDRESS',
  'MIDNIGHT_CONTRACT_SCHEMA_VERSION',
  'THRESHOLD_POLICY_VERSION',
  'THRESHOLD_POLICY_KEY',
  'POLICY_ASSIGNMENT_ID',
  'POLICY_ASSIGNMENT_KEY',
  'DEVICE_CONFIGURATION_VERSION',
  'DEVICE_CONFIGURATION_UPDATED_AT',
  'DEVICE_CONFIGURATION_FINGERPRINT',
] as const;

function operationConfigurationFingerprint(configuration: DeviceOperationConfiguration): string {
  return crypto.createHash('sha256').update([
    String(configuration.schemaVersion),
    String(configuration.configurationVersion),
    configuration.device.deviceId,
    configuration.device.projectId,
    configuration.midnight.network,
    configuration.midnight.contractAddress,
    String(configuration.midnight.contractSchemaVersion),
    String(configuration.midnight.registrationVersion),
    configuration.policy.id,
    configuration.policy.key,
    configuration.policy.mode,
    String(configuration.policy.minimum),
    String(configuration.policy.maximum),
    String(configuration.policy.valueScale),
    String(configuration.policy.sensorTypeCode),
    String(configuration.policy.unitCode),
    String(configuration.policy.version),
    configuration.assignment.id,
    configuration.assignment.key,
    String(configuration.assignment.version),
  ].join('\n')).digest('hex');
}

function environmentValue(contents: string, key: string): string | undefined {
  const matches = contents.split(/\r?\n/u).filter((line) => (
    new RegExp(`^\\s*(?:export\\s+)?${key}=`).test(line)
  ));
  if (matches.length > 1) throw new Error(`Duplicate ${key} entries in ${deviceEnvPath}`);
  return matches[0]?.replace(new RegExp(`^\\s*(?:export\\s+)?${key}=`), '').trim();
}

function updatedEnvironment(contents: string, updates: Record<string, string>): string {
  const remaining = new Set(Object.keys(updates));
  const lines = contents.split(/\r?\n/u).map((line) => {
    for (const key of managedOperationKeys) {
      if (!new RegExp(`^\\s*(?:export\\s+)?${key}=`).test(line)) continue;
      if (!remaining.delete(key)) throw new Error(`Duplicate ${key} entries in ${deviceEnvPath}`);
      return `${key}=${updates[key]}`;
    }
    return line;
  });
  while (lines.at(-1) === '') lines.pop();
  if (remaining.size > 0) {
    lines.push('', '# Authenticated public operation configuration from Cloudflare Worker.');
    for (const key of managedOperationKeys) {
      if (remaining.has(key)) lines.push(`${key}=${updates[key]}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function applyDeviceOperationConfiguration(
  configuration: DeviceOperationConfiguration,
  envFile = deviceEnvPath,
): { changed: boolean; configurationVersion: number; contractAddress: string } {
  const expectedDeviceId = process.env.SENSOR_DEVICE_ID?.trim() || 'edge-temp-001';
  const expectedProjectId = process.env.SENSOR_PROJECT_ID?.trim() || 'measurement-authenticity-01';
  if (
    configuration.device.deviceId !== expectedDeviceId
    || configuration.device.projectId !== expectedProjectId
  ) throw new Error('Refusing operation configuration for another Device or Project');
  if (!fs.existsSync(envFile)) throw new Error(`Device environment file does not exist: ${envFile}`);
  const metadata = fs.lstatSync(envFile);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Device environment path must be a regular file: ${envFile}`);
  }
  const contents = fs.readFileSync(envFile, 'utf8');
  const currentVersionRaw = environmentValue(contents, 'DEVICE_CONFIGURATION_VERSION');
  const currentVersion = currentVersionRaw === undefined || currentVersionRaw === ''
    ? 0
    : Number(currentVersionRaw);
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 0) {
    throw new Error('Installed DEVICE_CONFIGURATION_VERSION is invalid');
  }
  if (currentVersion > configuration.configurationVersion) {
    throw new Error('Refusing to downgrade Device operation configuration');
  }
  const fingerprint = operationConfigurationFingerprint(configuration);
  const currentFingerprint = environmentValue(contents, 'DEVICE_CONFIGURATION_FINGERPRINT');
  if (
    currentVersion === configuration.configurationVersion
    && currentFingerprint
    && currentFingerprint !== fingerprint
  ) throw new Error('Refusing inconsistent Device operation configuration at the same version');
  const updates: Record<(typeof managedOperationKeys)[number], string> = {
    MIDNIGHT_NETWORK: configuration.midnight.network,
    DEVICE_CONTRACT_ADDRESS: configuration.midnight.contractAddress,
    MIDNIGHT_CONTRACT_SCHEMA_VERSION: String(configuration.midnight.contractSchemaVersion),
    THRESHOLD_POLICY_VERSION: configuration.policy.id,
    THRESHOLD_POLICY_KEY: configuration.policy.key,
    POLICY_ASSIGNMENT_ID: configuration.assignment.id,
    POLICY_ASSIGNMENT_KEY: configuration.assignment.key,
    DEVICE_CONFIGURATION_VERSION: String(configuration.configurationVersion),
    DEVICE_CONFIGURATION_UPDATED_AT: configuration.updatedAt,
    DEVICE_CONFIGURATION_FINGERPRINT: fingerprint,
  };
  const nextContents = updatedEnvironment(contents, updates);
  if (nextContents !== contents) {
    const temporary = `${envFile}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temporary, nextContents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, envFile);
  }
  fs.chmodSync(envFile, 0o600);
  for (const [key, value] of Object.entries(updates)) process.env[key] = value;
  return {
    changed: nextContents !== contents,
    configurationVersion: configuration.configurationVersion,
    contractAddress: configuration.midnight.contractAddress,
  };
}

export async function synchronizeDeviceOperationConfiguration(
  proofServer: string,
  expectedNetwork?: NetworkId,
): Promise<DeviceOperationConfiguration> {
  const configuration = await fetchDeviceOperationConfiguration(
    deviceProofAuthConfig(proofServer),
  );
  if (expectedNetwork && configuration.midnight.network !== expectedNetwork) {
    throw new Error('Cloudflare Device configuration does not match --network');
  }
  applyDeviceOperationConfiguration(configuration);
  return configuration;
}

export function deviceContractAddress(explicit?: string): string {
  const address = explicit?.trim() || process.env.DEVICE_CONTRACT_ADDRESS?.trim();
  if (!address) {
    throw new Error(`DEVICE_CONTRACT_ADDRESS is required in ${deviceEnvPath} or --contract`);
  }
  return address;
}

export function privateStatePassword(): string {
  const secretsPath = path.join(deviceWalletHome, 'secrets.json');
  if (fs.existsSync(secretsPath)) {
    const stored = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) as {
      version?: unknown;
      privateStatePassword?: unknown;
    };
    if (stored.version !== 1 || typeof stored.privateStatePassword !== 'string') {
      throw new Error(`Invalid device secrets file: ${secretsPath}`);
    }
    return stored.privateStatePassword;
  }
  fs.mkdirSync(deviceWalletHome, { recursive: true, mode: 0o700 });
  const privateStatePassword = `Aa1!${crypto.randomBytes(32).toString('hex')}`;
  const temporary = `${secretsPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify({
    version: 1,
    privateStatePassword,
    createdAt: new Date().toISOString(),
  }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, secretsPath);
  fs.chmodSync(secretsPath, 0o600);
  return privateStatePassword;
}
