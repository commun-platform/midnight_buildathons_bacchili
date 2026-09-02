import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';

import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { httpClientProvingProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import {
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
  stateDir,
  type NetworkConfig,
  type NetworkId,
} from './config.js';
import { isTransactionSyncComplete } from './sync-progress.js';

globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;

type ChildKind = 'shielded' | 'unshielded' | 'dust';

interface PersistedWalletState {
  shielded?: unknown;
  unshielded?: unknown;
  dust?: string;
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export interface WalletContext {
  wallet: Awaited<ReturnType<typeof WalletFacade.init>>;
  shieldedSecretKeys: ReturnType<typeof ledger.ZswapSecretKeys.fromSeed>;
  dustSecretKey: ReturnType<typeof ledger.DustSecretKey.fromSeed>;
  unshieldedKeystore: ReturnType<typeof createKeystore>;
  checkpoint?: Rx.Subscription;
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

function childStatePath(network: NetworkId, child: ChildKind): string {
  return path.join(stateDir, 'wallet-sync', network, `${child}.json`);
}

function loadChildState(network: NetworkId, child: ChildKind): unknown {
  const file = childStatePath(network, child);
  if (!fs.existsSync(file)) return undefined;
  try {
    return (JSON.parse(fs.readFileSync(file, 'utf8')) as { state?: unknown }).state;
  } catch {
    return undefined;
  }
}

function saveChildState(network: NetworkId, child: ChildKind, state: unknown): void {
  const file = childStatePath(network, child);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify({ version: 1, state })}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export async function createWallet(
  network: NetworkId,
  networkConfig: NetworkConfig,
  seed: string,
): Promise<WalletContext> {
  setNetworkId(networkConfig.networkId);
  const keys = deriveKeys(seed);
  const networkId = getNetworkId();
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);

  const saved: PersistedWalletState = {
    shielded: loadChildState(network, 'shielded'),
    unshielded: loadChildState(network, 'unshielded'),
    dust: loadChildState(network, 'dust') as string | undefined,
  };
  const configuration = {
    networkId,
    indexerClientConnection: {
      indexerHttpUrl: networkConfig.indexer,
      indexerWsUrl: networkConfig.indexerWS,
    },
    batchUpdates: {
      size: positiveIntegerEnv('MIDNIGHT_DUST_BATCH_SIZE', 100),
      timeout: 5,
      spacing: 0,
    },
    provingServerUrl: new URL(networkConfig.proofServer),
    relayURL: new URL(networkConfig.node.replace(/^http/, 'ws')),
    txHistoryStorage: new NoOpTransactionHistoryStorage(),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
  };
  const provingProvider = httpClientProvingProvider(
    networkConfig.proofServer,
    new NodeZkConfigProvider(contractArtifactsPath),
    {
      timeout: 900_000,
      headers: proofServerHeaders(networkConfig.proofServer),
    },
  );

  const wallet = await WalletFacade.init({
    configuration,
    provingService: () => ({
      prove: (transaction) => transaction.prove(
        provingProvider,
        ledger.CostModel.initialCostModel(),
      ),
    }),
    shielded: async (config) => {
      const factory = ShieldedWallet(config);
      if (saved.shielded !== undefined) {
        try {
          return await (factory as unknown as { restore(value: unknown): Promise<unknown> }).restore(saved.shielded) as never;
        } catch {
          process.stderr.write('Shielded wallet cache is incompatible; syncing from seed.\n');
        }
      }
      return factory.startWithSecretKeys(shieldedSecretKeys);
    },
    unshielded: async (config) => {
      const factory = UnshieldedWallet(config);
      if (saved.unshielded !== undefined) {
        try {
          return await (factory as unknown as { restore(value: unknown): Promise<unknown> }).restore(saved.unshielded) as never;
        } catch {
          process.stderr.write('Unshielded wallet cache is incompatible; syncing from key.\n');
        }
      }
      return factory.startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore));
    },
    dust: async (config) => {
      const factory = DustWallet(config);
      if (saved.dust !== undefined) {
        try {
          return await (factory as unknown as { restore(value: string): Promise<unknown> }).restore(saved.dust) as never;
        } catch {
          process.stderr.write('DUST wallet cache is incompatible; syncing from key.\n');
        }
      }
      return factory.startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust);
    },
  });

  await wallet.start(shieldedSecretKeys, dustSecretKey);
  const context: WalletContext = {
    wallet,
    shieldedSecretKeys,
    dustSecretKey,
    unshieldedKeystore,
  };
  context.checkpoint = wallet.state().pipe(
    Rx.auditTime(60_000),
    Rx.concatMap(() => Rx.from(persistWalletState(context, network))),
  ).subscribe({
    error: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Wallet checkpoint failed: ${message}\n`);
    },
  });
  return context;
}

export async function syncWallet(context: WalletContext, network: NetworkId) {
  const timeoutMs = positiveIntegerEnv('MIDNIGHT_SYNC_TIMEOUT_MS', 60 * 60_000);
  let lastProgressLog = 0;
  const state = await Rx.firstValueFrom(
    context.wallet.state().pipe(
      Rx.tap((next) => {
        const now = Date.now();
        if (now - lastProgressLog < 15_000) return;
        lastProgressLog = now;
        const shielded = next.shielded.progress;
        const unshielded = next.unshielded.progress;
        const dust = next.dust.progress;
        process.stdout.write(
          `Sync progress: shielded=${shielded.appliedIndex}/${shielded.highestIndex} ` +
          `unshielded=${unshielded.appliedId}/${unshielded.highestTransactionId} ` +
          `dust=${dust.appliedIndex}/${dust.highestRelevantWalletIndex}\n`,
        );
      }),
      Rx.filter((next) => isTransactionSyncComplete({
        shielded: next.shielded.progress,
        unshielded: next.unshielded.progress,
        dust: next.dust.progress,
      })),
      Rx.timeout({
        first: timeoutMs,
        with: () => Rx.throwError(() => new Error(`Wallet sync timed out after ${timeoutMs}ms`)),
      }),
    ),
  );
  await persistWalletState(context, network);
  return state;
}

export async function waitForNightBalance(
  context: WalletContext,
  timeoutMs = 300_000,
): Promise<bigint> {
  return Rx.firstValueFrom(
    context.wallet.state().pipe(
      Rx.map((state) => state.unshielded.balances[unshieldedToken().raw] ?? 0n),
      Rx.filter((balance) => balance > 0n),
      Rx.timeout({ first: timeoutMs }),
    ),
  );
}

export async function persistWalletState(context: WalletContext, network: NetworkId): Promise<void> {
  for (const child of ['shielded', 'unshielded', 'dust'] as const) {
    try {
      const walletChild = context.wallet[child] as unknown as { serializeState(): Promise<unknown> };
      saveChildState(network, child, await walletChild.serializeState());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Could not persist ${child} wallet sync state: ${message}\n`);
    }
  }
}

export function walletAddress(context: WalletContext): string {
  return context.unshieldedKeystore.getBech32Address().toString();
}

export function walletBalances(state: Awaited<ReturnType<WalletContext['wallet']['waitForSyncedState']>>) {
  return {
    night: state.unshielded.balances[unshieldedToken().raw] ?? 0n,
    dust: state.dust.balance(new Date()),
  };
}

export async function ensureDust(context: WalletContext, faucet: string): Promise<void> {
  const dustTimeoutMs = positiveIntegerEnv('MIDNIGHT_DUST_TIMEOUT_MS', 12 * 60 * 60_000);
  process.stdout.write('Checking NIGHT registration and DUST balance...\n');
  const state = await Rx.firstValueFrom(
    context.wallet.state().pipe(
      Rx.filter((next) => isTransactionSyncComplete({
        shielded: next.shielded.progress,
        unshielded: next.unshielded.progress,
        dust: next.dust.progress,
      })),
    ),
  );
  const balance = walletBalances(state);
  if (balance.night === 0n) {
    throw new Error(`Wallet has no tNIGHT. Fund ${walletAddress(context)} at ${faucet}`);
  }

  const unregistered = state.unshielded.availableCoins.filter(
    (coin) =>
      coin.utxo.type === unshieldedToken().raw &&
      coin.meta?.registeredForDustGeneration !== true,
  );
  if (unregistered.length > 0) {
    process.stdout.write('Waiting for complete DUST wallet sync before registration...\n');
    let lastDustSyncLog = 0;
    await Rx.firstValueFrom(
      context.wallet.state().pipe(
        Rx.tap((next) => {
          const now = Date.now();
          if (now - lastDustSyncLog < 15_000) return;
          lastDustSyncLog = now;
          process.stdout.write(
            `DUST registration sync: ${next.dust.progress.appliedIndex}/` +
            `${next.dust.progress.highestRelevantWalletIndex}\n`,
          );
        }),
        Rx.filter(
          (next) =>
            next.unshielded.progress.isStrictlyComplete()
            && next.dust.progress.isStrictlyComplete(),
        ),
        Rx.timeout({
          first: dustTimeoutMs,
          with: () => Rx.throwError(
            () => new Error(`Timed out syncing DUST wallet after ${dustTimeoutMs}ms`),
          ),
        }),
      ),
    );

    const { fee, dustGenerationEstimations } =
      await context.wallet.estimateRegistration(unregistered);
    const generatedNow = dustGenerationEstimations.reduce(
      (sum, item) => sum + item.dust.generatedNow,
      0n,
    );
    process.stdout.write(
      `DUST registration readiness: fee=${fee} generatedNow=${generatedNow}\n`,
    );
    if (generatedNow < fee) {
      process.stdout.write('Waiting for the registration UTXOs to generate the required DUST...\n');
    }
    await context.wallet.waitForGeneratedDust(unregistered, fee, {
      timeoutMs: dustTimeoutMs,
    });

    process.stdout.write(`Registering ${unregistered.length} NIGHT UTXO(s) for DUST generation...\n`);
    const recipe = await context.wallet.registerNightUtxosForDustGeneration(
      unregistered,
      context.unshieldedKeystore.getPublicKey(),
      (payload) => context.unshieldedKeystore.signData(payload),
    );
    const transactionId = await context.wallet.submitTransaction(
      await context.wallet.finalizeRecipe(recipe),
    );
    process.stdout.write(`DUST registration submitted: ${transactionId}\n`);
  } else {
    process.stdout.write('All NIGHT UTXOs are already registered for DUST generation.\n');
  }

  if (state.dust.availableCoins.length === 0 || unregistered.length > 0) {
    process.stdout.write('Waiting for spendable DUST...\n');
    let lastDustLog = 0;
    await Rx.firstValueFrom(
      context.wallet.state().pipe(
        Rx.tap((next) => {
          const now = Date.now();
          if (now - lastDustLog < 15_000) return;
          lastDustLog = now;
          process.stdout.write(
            `DUST sync: ${next.dust.progress.appliedIndex}/` +
            `${next.dust.progress.highestRelevantWalletIndex} ` +
            `balance=${next.dust.balance(new Date())} ` +
            `spendableCoins=${next.dust.availableCoins.length}\n`,
          );
        }),
        Rx.filter((next) => next.dust.availableCoins.length > 0),
        Rx.timeout({
          first: dustTimeoutMs,
          with: () => Rx.throwError(
            () => new Error(`Timed out waiting for generated DUST after ${dustTimeoutMs}ms`),
          ),
        }),
      ),
    );
    process.stdout.write('Spendable DUST is available.\n');
  }
}
