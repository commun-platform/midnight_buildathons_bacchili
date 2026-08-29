import {
  createSensorPrivateState,
  SENSOR_PRIVATE_STATE_ID,
  witnesses,
  type SensorPrivateState,
} from '@midnight-demo/sensor-registry-contract/witnesses';
import { Contract } from '@midnight-demo/sensor-registry-contract/contract';
import {
  hexToBytes,
  type PreparedDailyExtremaAttestation,
} from '@midnight-demo/shared';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProvingProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { fromHex, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  Binding,
  CostModel,
  Proof,
  SignatureEnabled,
  Transaction,
  type FinalizedTransaction,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { createProofProvider } from '@midnight-ntwrk/midnight-js-types';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import WebSocketImplementation from 'isomorphic-ws';

import { inMemoryPrivateStateProvider } from './in-memory-private-state-provider.js';

type SensorRegistryCircuit =
  | 'registerDevice'
  | 'rotateDeviceAuthority'
  | 'disableDevice'
  | 'registerThresholdPolicy'
  | 'registerPolicyAssignment'
  | 'submitDailyAttestation';

const PREPROD_INDEXER_URI = 'https://indexer.preprod.midnight.network/api/v4/graphql';
const PREPROD_INDEXER_WS_URI = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
const INDEXER_LOOKUP_TIMEOUT_MS = 15_000;
const CONTRACT_CONNECTION_TIMEOUT_MS = 30_000;

export type SubmissionProgress =
  | 'connecting-contract'
  | 'connecting-canonical-indexer'
  | 'connecting-wallet-indexer'
  | 'contract-state-found'
  | 'loading-contract-deployment'
  | 'contract-connected'
  | 'building-transaction'
  | 'checking-proof-input'
  | 'proof-input-checked'
  | 'generating-proof'
  | 'proof-generated'
  | 'wallet-approval'
  | 'requesting-sponsorship'
  | 'transaction-sponsored'
  | 'submitting-transaction'
  | 'transaction-submitted'
  | 'confirmed';

export interface BrowserSubmissionResult {
  transactionId: string;
  transactionHash: string;
  sponsorTransactionId: string;
  feeSpecks: string;
  feeDust: string;
  deviceTransactionBytes: number;
  transactionBytes: number;
  proofStartedAt: string;
  proofCompletedAt: string;
  submittedAt: string;
  confirmedAt: string;
}

export interface BrowserWalletConnection {
  api: ConnectedAPI;
  walletName: string;
  walletApiVersion: string;
  networkId: string;
  shieldedAddress: string;
  indexerUri: string;
  indexerWsUri: string;
}

function browserWallets(): Array<{ key: string; wallet: {
  name: string;
  apiVersion: string;
  connect(networkId: string): Promise<ConnectedAPI>;
} }> {
  const injected = window.midnight ?? {};
  return Object.entries(injected)
    .filter((entry): entry is [string, typeof entry[1] & {
      name: string;
      apiVersion: string;
      connect(networkId: string): Promise<ConnectedAPI>;
    }] => Boolean(
      entry[1]
      && typeof entry[1] === 'object'
      && 'name' in entry[1]
      && 'apiVersion' in entry[1]
      && 'connect' in entry[1]
      && typeof entry[1].connect === 'function',
    ))
    .map(([key, wallet]) => ({ key, wallet }));
}

export function availableWallets(): Array<{ id: string; name: string; apiVersion: string }> {
  return browserWallets().map(({ key, wallet }) => ({
    id: key,
    name: wallet.name,
    apiVersion: wallet.apiVersion,
  }));
}

export async function connectBrowserWallet(
  networkId = 'preprod',
  walletId?: string,
): Promise<BrowserWalletConnection> {
  const discovered = browserWallets();
  const selected = walletId
    ? discovered.find(({ key }) => key === walletId)
    : discovered.find(({ wallet }) => /^4\./u.test(wallet.apiVersion));
  if (!selected) throw new Error('DApp Connector API 4.x compatible Midnight Wallet was not found');
  const api = await selected.wallet.connect(networkId);
  const status = await api.getConnectionStatus();
  if (status.status !== 'connected') throw new Error('Midnight Wallet connection was not authorized');
  const [configuration, shielded] = await Promise.all([
    api.getConfiguration(),
    api.getShieldedAddresses(),
  ]);
  if (configuration.networkId.toLowerCase() !== networkId.toLowerCase()) {
    throw new Error(`Wallet is connected to ${configuration.networkId}, expected ${networkId}`);
  }
  setNetworkId(networkId as 'preprod');
  return {
    api,
    walletName: selected.wallet.name,
    walletApiVersion: selected.wallet.apiVersion,
    networkId: configuration.networkId,
    shieldedAddress: shielded.shieldedAddress,
    indexerUri: configuration.indexerUri,
    indexerWsUri: configuration.indexerWsUri,
  };
}

interface SponsoredTransactionResponse {
  accepted: true;
  proofJobId: string;
  status: 'submitted' | 'confirmed';
  transactionId: string;
  deviceTransactionHash: string;
  sponsorTransactionId: string;
  transactionHash: string;
  feeSpecks: string;
  feeDust: string;
  deviceTransactionBytes: number;
  transactionBytes: number;
  sponsorshipStartedAt: string;
  sponsorshipCompletedAt: string;
}

interface SponsorAcceptanceResponse {
  accepted: true;
  proofJobId: string;
  status: string;
  deviceTransactionHash: string;
}

interface SponsorProofJobResponse {
  job: {
    proofJobId: string;
    status: string;
    deviceTransactionHash: string | null;
    deviceTransactionBytes: number | null;
    sponsorTransactionId: string | null;
    sponsorFeeSpecks: string | null;
    sponsorTransactionBytes: number | null;
    sponsorshipStartedAt: string | null;
    sponsorshipCompletedAt: string | null;
    attestTxId: string | null;
    attestTxHash: string | null;
    errorCode: string | null;
  };
}

function serviceEndpoint(serviceUrl: string, pathname: string): URL {
  const url = new URL(serviceUrl);
  url.pathname = pathname;
  url.search = '';
  url.hash = '';
  return url;
}

async function sponsorResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Sponsor Wallet failed with HTTP ${response.status}: ${text.slice(0, 240)}`);
  }
  if (text.length > 64 * 1024) throw new Error('Sponsor Wallet response is too large');
  return JSON.parse(text) as T;
}

function formatDust(value: bigint): string {
  return `${value / 1_000_000_000_000_000n}.${(value % 1_000_000_000_000_000n)
    .toString()
    .padStart(15, '0')}`;
}

async function waitForSponsoredTransaction(
  serviceUrl: string,
  proofJobId: string,
  accessToken: string,
  deviceTransactionHash: string,
): Promise<SponsoredTransactionResponse> {
  const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    const { job } = await sponsorResponse<SponsorProofJobResponse>(await fetch(serviceEndpoint(
      serviceUrl,
      `/api/v1/proof-jobs/${encodeURIComponent(proofJobId)}`,
    ), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    }));
    if (job.deviceTransactionHash && job.deviceTransactionHash !== deviceTransactionHash) {
      throw new Error('Proof Job is bound to another Device transaction');
    }
    if (job.status === 'reproof_required' || job.status === 'dead_lettered') {
      throw new Error(`Sponsor processing failed: ${job.errorCode ?? job.status}`);
    }
    if (job.status === 'submitted' || job.status === 'confirmed') {
      if (
        !job.attestTxId
        || !job.attestTxHash
        || !job.sponsorTransactionId
        || !job.sponsorFeeSpecks
        || job.deviceTransactionBytes === null
        || job.sponsorTransactionBytes === null
      ) throw new Error('Submitted Sponsor state is incomplete');
      return {
        accepted: true,
        proofJobId,
        status: job.status,
        transactionId: job.attestTxId,
        deviceTransactionHash,
        sponsorTransactionId: job.sponsorTransactionId,
        transactionHash: job.attestTxHash,
        feeSpecks: job.sponsorFeeSpecks,
        feeDust: formatDust(BigInt(job.sponsorFeeSpecks)),
        deviceTransactionBytes: job.deviceTransactionBytes,
        transactionBytes: job.sponsorTransactionBytes,
        sponsorshipStartedAt: job.sponsorshipStartedAt ?? new Date().toISOString(),
        sponsorshipCompletedAt: job.sponsorshipCompletedAt ?? new Date().toISOString(),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error('Timed out waiting for Sponsor transaction submission');
}

async function serializedSha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function transactionId(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object' && 'toString' in value) {
    const text = String(value);
    return text && text !== '[object Object]' ? text : null;
  }
  return null;
}

function errorDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = 'cause' in error ? error.cause : undefined;
  return cause === undefined
    ? error.message
    : `${error.message} (${errorDetail(cause)})`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs} ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function submitBrowserAttestation(input: {
  wallet: BrowserWalletConnection;
  serviceUrl: string;
  zkArtifactsUrl: string;
  contractAddress: string;
  accessToken: string;
  proofJobId: string;
  deviceSecretHex: string;
  attestation: PreparedDailyExtremaAttestation;
  thresholdSatisfied: boolean;
  onProgress?: (progress: SubmissionProgress) => void;
}): Promise<BrowserSubmissionResult> {
  const notify = (progress: SubmissionProgress) => input.onProgress?.(progress);
  setNetworkId('preprod');
  const compiledContract = CompiledContract.make('sensor-registry', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(input.zkArtifactsUrl),
  );
  const privateStateProvider = inMemoryPrivateStateProvider<string, SensorPrivateState>();
  privateStateProvider.setContractAddress(input.contractAddress);
  const privateState = createSensorPrivateState(
    [input.attestation.privateData],
    input.deviceSecretHex,
  );
  await privateStateProvider.set(SENSOR_PRIVATE_STATE_ID, privateState);

  const zkConfigProvider = new FetchZkConfigProvider<SensorRegistryCircuit>(
    input.zkArtifactsUrl,
    fetch.bind(window),
  );
  const remoteProvingProvider = httpClientProvingProvider(
    input.serviceUrl,
    zkConfigProvider,
    {
      timeout: 900_000,
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'X-Proof-Job-Id': input.proofJobId,
      },
    },
  );
  let proofStartedAt = '';
  let proofCompletedAt = '';
  const provingProvider = {
    async check(serializedPreimage: Uint8Array, keyLocation: string) {
      notify('checking-proof-input');
      const valid = await remoteProvingProvider.check(serializedPreimage, keyLocation);
      if (!valid) throw new Error(`Proof input check failed for ${keyLocation}`);
      notify('proof-input-checked');
      return valid;
    },
    async prove(serializedPreimage: Uint8Array, keyLocation: string, overwriteBindingInput?: bigint) {
      proofStartedAt = new Date().toISOString();
      notify('generating-proof');
      const proof = await remoteProvingProvider.prove(
        serializedPreimage,
        keyLocation,
        overwriteBindingInput,
      );
      proofCompletedAt = new Date().toISOString();
      notify('proof-generated');
      return proof;
    },
  };
  const shielded = await input.wallet.api.getShieldedAddresses();
  let submittedAt = '';
  let submittedTransactionId = '';
  let submittedTransactionHash = '';
  let sponsored: SponsoredTransactionResponse | null = null;
  const walletProvider = {
    getCoinPublicKey: () => shielded.shieldedCoinPublicKey,
    getEncryptionPublicKey: () => shielded.shieldedEncryptionPublicKey,
    async balanceTx(tx: UnboundTransaction): Promise<FinalizedTransaction> {
      notify('wallet-approval');
      try {
        const result = await input.wallet.api.balanceUnsealedTransaction(
          toHex(tx.serialize()),
          { payFees: false },
        );
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
          'signature',
          'proof',
          'binding',
          fromHex(result.tx),
        );
      } catch (error) {
        throw new Error(
          `Midnight Wallet could not approve the Device transaction. ${errorDetail(error)}`,
          { cause: error },
        );
      }
    },
  };
  const midnightProvider = {
    async submitTx(tx: FinalizedTransaction) {
      notify('requesting-sponsorship');
      const serialized = tx.serialize();
      const deviceTransactionHash = await serializedSha256(serialized);
      const accepted = await sponsorResponse<SponsorAcceptanceResponse>(await fetch(serviceEndpoint(
        input.serviceUrl,
        `/api/v1/proof-jobs/${encodeURIComponent(input.proofJobId)}/sponsor`,
      ), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          'Content-Type': 'application/octet-stream',
        },
        body: Uint8Array.from(serialized).buffer,
        signal: AbortSignal.timeout(60_000),
      }));
      if (
        accepted.proofJobId !== input.proofJobId
        || accepted.deviceTransactionHash !== deviceTransactionHash
      ) throw new Error('Sponsor acceptance does not match the Device transaction');
      sponsored = await waitForSponsoredTransaction(
        input.serviceUrl,
        input.proofJobId,
        input.accessToken,
        deviceTransactionHash,
      );
      notify('transaction-sponsored');
      notify('submitting-transaction');
      submittedTransactionHash = sponsored.transactionHash;
      submittedAt = sponsored.sponsorshipCompletedAt;
      const identifier = tx.identifiers()[0];
      if (!identifier) throw new Error('Balanced transaction has no identifier');
      submittedTransactionId = sponsored.transactionId;
      notify('transaction-submitted');
      return identifier;
    },
  };
  const indexerCandidates = [
    {
      query: PREPROD_INDEXER_URI,
      subscription: PREPROD_INDEXER_WS_URI,
      progress: 'connecting-canonical-indexer' as const,
    },
    {
      query: input.wallet.indexerUri,
      subscription: input.wallet.indexerWsUri,
      progress: 'connecting-wallet-indexer' as const,
    },
  ].filter((candidate, index, candidates) => (
    candidates.findIndex((item) => item.query === candidate.query) === index
  ));
  let publicDataProvider: ReturnType<typeof indexerPublicDataProvider> | undefined;
  const indexerErrors: string[] = [];

  notify('connecting-contract');
  for (const candidate of indexerCandidates) {
    notify(candidate.progress);
    const provider = indexerPublicDataProvider(
      candidate.query,
      candidate.subscription,
      WebSocketImplementation,
    );
    try {
      const state = await withTimeout(
        provider.queryContractState(input.contractAddress),
        INDEXER_LOOKUP_TIMEOUT_MS,
        `Midnight Indexer contract lookup at ${candidate.query}`,
      );
      if (!state) throw new Error('the contract was not found in the latest indexed block');
      publicDataProvider = provider;
      notify('contract-state-found');
      break;
    } catch (error) {
      indexerErrors.push(`${candidate.query}: ${errorDetail(error)}`);
    }
  }
  if (!publicDataProvider) {
    throw new Error(`Midnight Indexer contract lookup failed: ${indexerErrors.join(' | ')}`);
  }
  const providers = {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider: createProofProvider(provingProvider, CostModel.initialCostModel()),
    walletProvider,
    midnightProvider,
  };
  let deployed;
  notify('loading-contract-deployment');
  try {
    deployed = await withTimeout(
      findDeployedContract(providers, {
        compiledContract,
        contractAddress: input.contractAddress,
        privateStateId: SENSOR_PRIVATE_STATE_ID,
        initialPrivateState: privateState,
      }),
      CONTRACT_CONNECTION_TIMEOUT_MS,
      'Midnight contract deployment lookup',
    );
  } catch (error) {
    throw new Error(`Midnight contract connection failed: ${errorDetail(error)}`, { cause: error });
  }
  notify('contract-connected');
  const publicData = input.attestation.publicData;
  notify('building-transaction');
  const transaction = await deployed.callTx.submitDailyAttestation(
    hexToBytes(publicData.attestationCommitment),
    hexToBytes(publicData.deviceCommitment),
    hexToBytes(publicData.measurementGroupId),
    hexToBytes(publicData.assignmentKey),
    BigInt(publicData.periodStartEpoch),
    BigInt(publicData.periodEndEpoch),
    publicData.hourPresence,
    BigInt(publicData.sampleCount),
    input.thresholdSatisfied,
    BigInt(publicData.schemaVersion),
    BigInt(publicData.circuitVersion),
  );
  const confirmedAt = new Date().toISOString();
  notify('confirmed');
  const returnedId = transactionId(transaction.public.txId);
  const id = returnedId ?? submittedTransactionId;
  if (!id) throw new Error('Midnight transaction did not return a transaction ID');
  const sponsorship = sponsored as SponsoredTransactionResponse | null;
  if (!sponsorship) throw new Error('Sponsor Wallet did not return a submission result');
  return {
    transactionId: id,
    transactionHash: submittedTransactionHash,
    sponsorTransactionId: sponsorship.sponsorTransactionId,
    feeSpecks: sponsorship.feeSpecks,
    feeDust: sponsorship.feeDust,
    deviceTransactionBytes: sponsorship.deviceTransactionBytes,
    transactionBytes: sponsorship.transactionBytes,
    proofStartedAt,
    proofCompletedAt,
    submittedAt,
    confirmedAt,
  };
}
