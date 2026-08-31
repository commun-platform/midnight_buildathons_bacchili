import { Contract, ledger as decodeLedger } from '@midnight-demo/sensor-registry-contract/contract';
import {
  bytesToHex,
  thresholdPolicyKey,
  type BrowserPolicyAuthorization,
  type BrowserPolicyMode,
} from '@midnight-demo/shared/runtime';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import WebSocketImplementation from 'isomorphic-ws';

import { inMemoryPrivateStateProvider } from './in-memory-private-state-provider.js';
import {
  createSensorPrivateState,
  SENSOR_PRIVATE_STATE_ID,
  witnesses,
  type SensorPrivateState,
} from './sensor-registry-witnesses.js';
import type { SponsorWalletRuntime } from './wallet.js';
import { verifyBrowserPolicyAuthorization } from './wallet-signature.js';

const indexerUrl = 'https://indexer.preprod.midnight.network/api/v4/graphql';
const indexerWsUrl = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
const proofServerUrl = 'http://proof.internal';
const zkConfigPath = process.env.SPONSOR_ZK_CONFIG_PATH
  ?? '/app/midnight/contracts/sensor-registry/src/managed/sensor-registry';

type SensorRegistryCircuit =
  | 'registerDevice'
  | 'rotateDeviceAuthority'
  | 'disableDevice'
  | 'registerThresholdPolicy'
  | 'registerPolicyAssignment'
  | 'submitDailyAttestation';

export interface OperatorPolicyRegistration {
  contractAddress: string;
  operatorSecretHex: string;
  projectId: string;
  policyId: string;
  name: string;
  mode: BrowserPolicyMode;
  minimumCentiCelsius: number | null;
  maximumCentiCelsius: number | null;
  policyVersion: number;
  knownPolicyTxId?: string;
  browserAuthorization: BrowserPolicyAuthorization;
}

export type OperatorPolicyRegistrationStage =
  | 'sponsor_wallet_ready'
  | 'policy_zkp_generating'
  | 'policy_tx_submitting'
  | 'policy_tx_submitted'
  | 'policy_confirmation_waiting'
  | 'policy_confirmed';

export interface OperatorPolicyRegistrationProgress {
  stage: OperatorPolicyRegistrationStage;
  transactionId?: string;
}

export interface OperatorPolicyRegistrationResult {
  policyKey: string;
  policyTxId: string;
}

export type OperatorPolicyProgressReporter = (
  progress: OperatorPolicyRegistrationProgress,
) => void | Promise<void>;

function modeCode(mode: BrowserPolicyMode): number {
  if (mode === 'closed-range') return 0;
  if (mode === 'upper-bound') return 1;
  return 2;
}

function encodedBounds(input: OperatorPolicyRegistration): {
  minimumCentiOffset: bigint;
  maximumCentiOffset: bigint;
} {
  return {
    minimumCentiOffset: input.mode === 'upper-bound'
      ? 0n
      : BigInt((input.minimumCentiCelsius ?? 0) + 10_000),
    maximumCentiOffset: input.mode === 'lower-bound'
      ? 0xffff_ffffn
      : BigInt((input.maximumCentiCelsius ?? 0) + 10_000),
  };
}

function validate(input: OperatorPolicyRegistration): void {
  if (!/^(?:[0-9a-f]{2}){32}$/u.test(input.operatorSecretHex)) {
    throw new Error('Operator Authority secret is invalid');
  }
  if (!input.contractAddress || input.contractAddress.length > 160) {
    throw new Error('Contract address is invalid');
  }
  verifyBrowserPolicyAuthorization(input.browserAuthorization);
  if (
    input.browserAuthorization.projectId !== input.projectId
    || input.browserAuthorization.policyId !== input.policyId
    || input.browserAuthorization.name !== input.name
    || input.browserAuthorization.mode !== input.mode
    || input.browserAuthorization.minimumCentiCelsius !== input.minimumCentiCelsius
    || input.browserAuthorization.maximumCentiCelsius !== input.maximumCentiCelsius
  ) throw new Error('Browser Policy authorization does not match the registration');
  if (!Number.isSafeInteger(input.policyVersion) || input.policyVersion < 1) {
    throw new Error('Policy version is invalid');
  }
  if (
    input.knownPolicyTxId !== undefined
    && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(input.knownPolicyTxId)
  ) throw new Error('Known Policy transaction ID is invalid');
}

function transactionId(transaction: unknown): string {
  const value = (transaction as { public?: { txId?: unknown } })?.public?.txId;
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error('Threshold Policy registration did not return a transaction ID');
  }
  return String(value);
}

async function policyVisible(
  provider: ReturnType<typeof indexerPublicDataProvider>,
  input: OperatorPolicyRegistration,
  policyKeyHex: string,
): Promise<boolean> {
  const contractState = await provider.queryContractState(input.contractAddress);
  if (!contractState) throw new Error('Sensor Registry state was not found');
  const state = decodeLedger(contractState.data);
  const bounds = encodedBounds(input);
  return Array.from(state.policies, ([key, policy]) => (
    bytesToHex(key) === policyKeyHex
    && policy.mode === modeCode(input.mode)
    && policy.minimumCentiOffset === bounds.minimumCentiOffset
    && policy.maximumCentiOffset === bounds.maximumCentiOffset
    && policy.valueScale === 100n
    && policy.sensorTypeCode === 1n
    && policy.unitCode === 1n
    && policy.version === BigInt(input.policyVersion)
  )).some(Boolean);
}

async function waitForPolicy(
  provider: ReturnType<typeof indexerPublicDataProvider>,
  input: OperatorPolicyRegistration,
  policyKeyHex: string,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if (await policyVisible(provider, input, policyKeyHex)) return;
      lastError = new Error('Threshold Policy is not visible in the Indexer yet');
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(
    `Threshold Policy registration could not be confirmed from the Indexer: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

export async function registerOperatorPolicy(
  runtime: SponsorWalletRuntime,
  input: OperatorPolicyRegistration,
  reportProgress: OperatorPolicyProgressReporter = () => undefined,
): Promise<OperatorPolicyRegistrationResult> {
  validate(input);
  await runtime.waitUntilReady();
  await reportProgress({ stage: 'sponsor_wallet_ready' });
  const compiledContract = CompiledContract.make('sensor-registry', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
  const privateState = createSensorPrivateState([], undefined, input.operatorSecretHex);
  const privateStateProvider = inMemoryPrivateStateProvider<string, SensorPrivateState>();
  privateStateProvider.setContractAddress(input.contractAddress);
  await privateStateProvider.set(SENSOR_PRIVATE_STATE_ID, privateState);
  const zkConfigProvider = new NodeZkConfigProvider<SensorRegistryCircuit>(zkConfigPath);
  const walletProvider = {
    getCoinPublicKey: () => runtime.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => runtime.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(transaction: UnboundTransaction, ttl?: Date) {
      const recipe = await runtime.wallet.balanceUnboundTransaction(
        transaction,
        {
          shieldedSecretKeys: runtime.shieldedSecretKeys,
          dustSecretKey: runtime.dustSecretKey,
        },
        {
          ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000),
          tokenKindsToBalance: ['dust'],
        },
      );
      return runtime.wallet.finalizeRecipe(recipe);
    },
  };
  const publicDataProvider = indexerPublicDataProvider(
    indexerUrl,
    indexerWsUrl,
    WebSocketImplementation,
  );
  const proofProvider = httpClientProofProvider(
    proofServerUrl,
    zkConfigProvider,
    { timeout: 900_000 },
  );
  let generating = false;
  const providers = {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider: {
      ...proofProvider,
      async proveTx(...args: Parameters<typeof proofProvider.proveTx>) {
        if (generating) await reportProgress({ stage: 'policy_zkp_generating' });
        return proofProvider.proveTx(...args);
      },
    },
    walletProvider,
    midnightProvider: {
      submitTx: async (transaction: Parameters<SponsorWalletRuntime['submitPreparedTransaction']>[0]) => {
        await reportProgress({ stage: 'policy_tx_submitting' });
        const submitted = await runtime.submitPreparedTransaction(transaction);
        await reportProgress({ stage: 'policy_tx_submitted', transactionId: submitted });
        return submitted as never;
      },
    },
  };
  const policyKey = await thresholdPolicyKey(input.policyId);
  const policyKeyHex = bytesToHex(policyKey);
  if (await policyVisible(publicDataProvider, input, policyKeyHex)) {
    if (!input.knownPolicyTxId) {
      throw new Error('Threshold Policy is registered but its original transaction ID is unavailable');
    }
    await reportProgress({ stage: 'policy_confirmed', transactionId: input.knownPolicyTxId });
    return { policyKey: policyKeyHex, policyTxId: input.knownPolicyTxId };
  }
  const deployed = await findDeployedContract(providers, {
    compiledContract,
    contractAddress: input.contractAddress,
    privateStateId: SENSOR_PRIVATE_STATE_ID,
    initialPrivateState: privateState,
  });
  const bounds = encodedBounds(input);
  generating = true;
  const transaction = await deployed.callTx.registerThresholdPolicy(policyKey, {
    mode: modeCode(input.mode),
    minimumCentiOffset: bounds.minimumCentiOffset,
    maximumCentiOffset: bounds.maximumCentiOffset,
    valueScale: 100n,
    sensorTypeCode: 1n,
    unitCode: 1n,
    version: BigInt(input.policyVersion),
  });
  generating = false;
  const policyTxId = transactionId(transaction);
  await reportProgress({ stage: 'policy_confirmation_waiting', transactionId: policyTxId });
  await waitForPolicy(publicDataProvider, input, policyKeyHex);
  await reportProgress({ stage: 'policy_confirmed', transactionId: policyTxId });
  return { policyKey: policyKeyHex, policyTxId };
}
