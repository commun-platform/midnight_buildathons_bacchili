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
  hexToBytes,
  type PreparedDataset,
} from '@midnight-demo/shared';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
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

export interface TransactionSummary {
  txId: string;
  txHash: string | null;
  blockHeight: string;
}

export interface SubmissionResult {
  register?: TransactionSummary;
  verify: TransactionSummary;
}

function summarizeTransaction(transaction: unknown): TransactionSummary {
  const publicData = (transaction as {
    public?: { txId?: unknown; txHash?: unknown; blockHeight?: unknown };
  }).public;
  return {
    txId: String(publicData?.txId ?? 'unknown'),
    txHash: typeof publicData?.txHash === 'string' && publicData.txHash
      ? publicData.txHash
      : null,
    blockHeight: String(publicData?.blockHeight ?? 'unknown'),
  };
}

export async function loadCompiledContract(): Promise<LoadedContract> {
  if (!fs.existsSync(contractModulePath)) {
    throw new Error(
      'Device runtime artifacts are missing. Export them on the development server and install them under runtime/device-artifacts.',
    );
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

export async function submitDataset(
  wallet: WalletContext,
  network: NetworkConfig,
  contractAddress: string,
  dataset: PreparedDataset,
  verifyOnly = false,
): Promise<SubmissionResult> {
  const loaded = await loadCompiledContract();
  const providers = createProviders(wallet, network);
  await waitForProofServer(network);
  providers.privateStateProvider.setContractAddress(contractAddress);
  const current = await providers.privateStateProvider.get(SENSOR_PRIVATE_STATE_ID) ?? createSensorPrivateState();
  const nextPrivateState = createSensorPrivateState([
    ...current.datasets.filter((stored) => stored.datasetRoot !== dataset.privateData.datasetRoot),
    dataset.privateData,
  ]);
  await providers.privateStateProvider.set(SENSOR_PRIVATE_STATE_ID, nextPrivateState);

  const deployed = await findDeployedContract(providers as never, {
    compiledContract: loaded.compiledContract as never,
    contractAddress,
    privateStateId: SENSOR_PRIVATE_STATE_ID,
    initialPrivateState: nextPrivateState,
  }) as unknown as {
    callTx: {
      registerDataset(...args: unknown[]): Promise<unknown>;
      verifySensorValue(datasetRoot: bigint): Promise<unknown>;
    };
  };

  let register: TransactionSummary | undefined;
  if (!verifyOnly) {
    const publicData = dataset.publicData;
    register = summarizeTransaction(await deployed.callTx.registerDataset(
      BigInt(publicData.datasetRoot),
      hexToBytes(publicData.deviceCommitment),
      BigInt(publicData.periodStartEpoch),
      BigInt(publicData.periodEndEpoch),
      BigInt(publicData.sampleCount),
      BigInt(publicData.schemaVersion),
    ));
  }

  const verify = summarizeTransaction(
    await deployed.callTx.verifySensorValue(BigInt(dataset.publicData.datasetRoot)),
  );
  return { register, verify };
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
