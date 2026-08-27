import { config as loadEnv } from 'dotenv';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

export type NetworkId = 'preview' | 'preprod';

export interface NetworkConfig {
  networkId: NetworkId;
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
  faucet: string;
}

export const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
loadEnv({ path: path.join(repoRoot, '.env.device'), quiet: true });

export const deviceWalletHome = path.join(
  os.homedir(),
  '.midnight',
  'midnight-cloudflare-demo',
  'device-wallet',
);
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

export function proofServerHeaders(): Record<string, string> {
  const token = process.env.MIDNIGHT_PROOF_SERVER_TOKEN?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function deviceContractAddress(explicit?: string): string {
  const address = explicit?.trim() || process.env.DEVICE_CONTRACT_ADDRESS?.trim();
  if (!address) {
    throw new Error('DEVICE_CONTRACT_ADDRESS is required in .env.device or --contract');
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
