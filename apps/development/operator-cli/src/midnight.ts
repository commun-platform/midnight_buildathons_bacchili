import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createSensorPrivateState,
  SENSOR_PRIVATE_STATE_ID,
  witnesses,
  type SensorPrivateState,
} from '@midnight-demo/sensor-registry-contract/witnesses';
import {
  bytesToHex,
} from '@midnight-demo/shared';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

import {
  contractArtifactsPath,
  contractModulePath,
  privateStatePassword,
  proofServerHeaders,
  stateDir,
  type NetworkConfig,
} from './config.js';
import { walletAddress, type WalletContext } from './wallet.js';

interface LoadedContract {
  module: {
    Contract: new (witnesses: unknown) => unknown;
    ledger(state: unknown): {
      datasets: Iterable<[bigint, {
        deviceCommitment: Uint8Array;
        periodStart: bigint;
        periodEnd: bigint;
        sampleCount: bigint;
        verified: boolean;
        schemaVersion: bigint;
      }]>;
      registrationCount: bigint;
      verificationCount: bigint;
      lastVerifiedRoot: bigint;
      verificationResult: boolean;
    };
  };
  compiledContract: unknown;
}

export async function loadCompiledContract(): Promise<LoadedContract> {
  if (!fs.existsSync(contractModulePath)) {
    throw new Error('Contract artifacts are missing. Run npm run contract:compile');
  }
  const contractModule = await import(pathToFileURL(contractModulePath).href) as LoadedContract['module'];
  const compiledContract = CompiledContract.make(
    'sensor-registry',
    contractModule.Contract as never,
  ).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(contractArtifactsPath),
  );
  return { module: contractModule, compiledContract };
}

export function createProviders(
  wallet: WalletContext,
  network: NetworkConfig,
) {
  const walletProvider = {
    getCoinPublicKey: () => wallet.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => wallet.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(transaction: unknown, ttl?: Date) {
      const recipe = await wallet.wallet.balanceUnboundTransaction(
        transaction as never,
        {
          shieldedSecretKeys: wallet.shieldedSecretKeys,
          dustSecretKey: wallet.dustSecretKey,
        },
        {
          ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000),
          tokenKindsToBalance: ['dust'],
        },
      );
      return wallet.wallet.finalizeRecipe(recipe);
    },
    submitTx: (transaction: unknown) => wallet.wallet.submitTransaction(transaction as never) as never,
  };
  const zkConfigProvider = new NodeZkConfigProvider(contractArtifactsPath);
  const accountId = walletAddress(wallet);
  const privateStateProvider = levelPrivateStateProvider<string, SensorPrivateState>({
    privateStateStoreName: path.join(stateDir, 'sensor-private-state'),
    signingKeyStoreName: path.join(stateDir, 'sensor-signing-keys'),
    accountId,
    privateStoragePasswordProvider: privateStatePassword,
  });

  return {
    privateStateProvider,
    publicDataProvider: indexerPublicDataProvider(network.indexer, network.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(network.proofServer, zkConfigProvider, {
      timeout: 900_000,
      headers: proofServerHeaders(),
    }),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

export async function waitForProofServer(network: NetworkConfig): Promise<void> {
  const base = new URL(network.proofServer);
  const local = base.hostname === '127.0.0.1' || base.hostname === 'localhost';
  const readyUrl = local ? base : new URL('/ready', base);
  let lastError: unknown;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(readyUrl, {
        headers: proofServerHeaders(),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return;
      lastError = new Error(`Proof server returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Proof server is unavailable: ${lastError instanceof Error ? lastError.message : lastError}`);
}

export async function deploySensorRegistry(
  wallet: WalletContext,
  network: NetworkConfig,
): Promise<string> {
  const loaded = await loadCompiledContract();
  const providers = createProviders(wallet, network);
  await waitForProofServer(network);
  const deployed = await deployContract(providers as never, {
    compiledContract: loaded.compiledContract as never,
    args: [],
    privateStateId: SENSOR_PRIVATE_STATE_ID,
    initialPrivateState: createSensorPrivateState(),
  });
  return deployed.deployTxData.public.contractAddress;
}

export async function queryRegistry(network: NetworkConfig, contractAddress: string) {
  const loaded = await loadCompiledContract();
  const provider = indexerPublicDataProvider(network.indexer, network.indexerWS);
  const contractState = await provider.queryContractState(contractAddress);
  if (!contractState) throw new Error(`Contract state not found: ${contractAddress}`);
  const state = loaded.module.ledger(contractState.data);
  return {
    contractAddress,
    network: network.networkId,
    registrationCount: state.registrationCount.toString(),
    verificationCount: state.verificationCount.toString(),
    lastVerifiedRoot: state.lastVerifiedRoot.toString(16).padStart(64, '0'),
    verificationResult: state.verificationResult,
    datasets: Array.from(state.datasets, ([root, dataset]) => ({
      merkleRoot: root.toString(16).padStart(64, '0'),
      deviceCommitment: bytesToHex(dataset.deviceCommitment),
      periodStart: new Date(Number(dataset.periodStart) * 1000).toISOString(),
      periodEnd: new Date(Number(dataset.periodEnd) * 1000).toISOString(),
      sampleCount: dataset.sampleCount.toString(),
      verified: dataset.verified,
      schemaVersion: dataset.schemaVersion.toString(),
    })),
  };
}
