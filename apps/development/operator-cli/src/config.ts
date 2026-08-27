import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
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
export const developmentEnvPath = path.join(repoRoot, '.env.development');
loadEnv({ path: developmentEnvPath, quiet: true });

export const stateDir = path.join(repoRoot, '.state', 'development');
export const dataDir = path.join(repoRoot, 'data', 'development');
export const contractArtifactsPath = path.join(
  repoRoot,
  'contracts/sensor-registry/src/managed/sensor-registry',
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

export function privateStatePassword(): string {
  const password = process.env.DEVELOPMENT_PRIVATE_STATE_PASSWORD?.trim();
  if (!password || password.length < 16) {
    throw new Error('DEVELOPMENT_PRIVATE_STATE_PASSWORD must contain at least 16 characters');
  }
  const characterClasses = [/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/]
    .filter((pattern) => pattern.test(password)).length;
  return characterClasses >= 3 ? password : `Aa1!${password}`;
}
