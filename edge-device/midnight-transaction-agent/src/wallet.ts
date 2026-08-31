import { Buffer } from 'node:buffer';
import { WebSocket } from 'ws';

import { httpClientProvingProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  Capabilities,
  DustWallet,
  HDWallet,
  NoOpTransactionHistoryStorage,
  PublicKey,
  Roles,
  ShieldedWallet,
  UnshieldedWallet,
  WalletFacade,
  createKeystore,
} from '@midnight-ntwrk/wallet-sdk';

import {
  contractArtifactsPath,
  proofServerHeaders,
  type NetworkConfig,
  type NetworkId,
} from './config.js';
import { refreshingProvingProvider } from './proving-provider.js';

globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;

export interface WalletContext {
  wallet: Awaited<ReturnType<typeof WalletFacade.init>>;
  shieldedSecretKeys: ReturnType<typeof ledger.ZswapSecretKeys.fromSeed>;
  dustSecretKey: ReturnType<typeof ledger.DustSecretKey.fromSeed>;
  unshieldedKeystore: ReturnType<typeof createKeystore>;
}

function deriveKeys(seed: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Wallet seed is invalid');
  const derived = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derived.type !== 'keysDerived') throw new Error('Wallet key derivation failed');
  hdWallet.hdWallet.clear();
  return derived.keys;
}

function disabledSubmissionService(): Capabilities.SubmissionService<ledger.FinalizedTransaction> {
  return {
    submitTransaction: async () => {
      throw new Error('Device direct transaction submission is disabled; use the Sponsor API');
    },
    close: async () => undefined,
  } as Capabilities.SubmissionService<ledger.FinalizedTransaction>;
}

/**
 * Creates an offline transaction-binding context.
 *
 * WalletFacade requires all three child-wallet types and their key arguments,
 * but this function deliberately leaves the facade and all children unsynchronized. Consequently it
 * performs no Shielded, Unshielded, or DUST history synchronization and cannot
 * submit directly to the Midnight relay. The dedicated Sponsor Wallet owns all
 * fee state and performs network submission.
 */
export async function createWallet(
  network: NetworkId,
  networkConfig: NetworkConfig,
  seed: string,
  proofJobId?: string,
): Promise<WalletContext> {
  setNetworkId(networkConfig.networkId);
  const keys = deriveKeys(seed);
  const networkId = getNetworkId();
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);
  const configuration = {
    networkId,
    indexerClientConnection: {
      indexerHttpUrl: networkConfig.indexer,
      indexerWsUrl: networkConfig.indexerWS,
    },
    batchUpdates: { size: 1, timeout: 5, spacing: 0 },
    provingServerUrl: new URL(networkConfig.proofServer),
    relayURL: new URL(networkConfig.node.replace(/^http/u, 'ws')),
    txHistoryStorage: new NoOpTransactionHistoryStorage(),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
  };
  const zkConfigProvider = new NodeZkConfigProvider(contractArtifactsPath);
  const provingProvider = refreshingProvingProvider(async () => httpClientProvingProvider(
    networkConfig.proofServer,
    zkConfigProvider,
    {
      timeout: 900_000,
      headers: await proofServerHeaders(networkConfig.proofServer, proofJobId),
    },
  ));
  const wallet = await WalletFacade.init({
    configuration,
    submissionService: disabledSubmissionService,
    provingService: () => ({
      prove: (transaction) => transaction.prove(
        provingProvider,
        ledger.CostModel.initialCostModel(),
      ),
    }),
    shielded: async (config) => ShieldedWallet(config).startWithSecretKeys(shieldedSecretKeys),
    unshielded: async (config) => UnshieldedWallet(config).startWithPublicKey(
      PublicKey.fromKeyStore(unshieldedKeystore),
    ),
    dust: async (config) => DustWallet(config).startWithSecretKey(
      dustSecretKey,
      ledger.LedgerParameters.initialParameters().dust,
    ),
  });
  void network;
  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

export function walletAddress(context: WalletContext): string {
  return context.unshieldedKeystore.getBech32Address().toString();
}
