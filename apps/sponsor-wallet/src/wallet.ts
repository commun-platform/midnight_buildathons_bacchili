import { Buffer } from 'node:buffer';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';

import { httpClientProvingProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
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
  diagnosticError,
  diagnosticLog,
  safeEndpoint,
} from './diagnostics.js';
import {
  formatSponsorSyncProgress,
  isSponsorBaseSyncComplete,
  sponsorSyncProgressDetails,
  type SponsorSyncProgressDetails,
} from './sync-progress.js';

class DiagnosticWebSocket extends WebSocket {
  constructor(address: string | URL, protocols?: string | string[]) {
    const endpoint = safeEndpoint(address);
    const startedAt = performance.now();
    diagnosticLog('sponsor_wallet_websocket_connecting', { endpoint });
    super(address, protocols);
    this.once('open', () => {
      diagnosticLog('sponsor_wallet_websocket_opened', {
        endpoint,
        durationMs: Math.round(performance.now() - startedAt),
      });
    });
    this.once('error', (error) => {
      diagnosticLog('sponsor_wallet_websocket_error', {
        endpoint,
        durationMs: Math.round(performance.now() - startedAt),
        ...diagnosticError(error),
      }, 'error');
    });
    this.once('close', (code) => {
      diagnosticLog('sponsor_wallet_websocket_closed', {
        endpoint,
        code,
        lifetimeMs: Math.round(performance.now() - startedAt),
      }, code === 1000 ? 'log' : 'warn');
    });
  }
}

globalThis.WebSocket = DiagnosticWebSocket as unknown as typeof globalThis.WebSocket;

export interface SponsorSerializedState {
  shielded?: unknown;
  unshielded?: unknown;
  dust?: string;
}

export interface SponsorWalletStatus {
  address: string;
  phase: 'starting' | 'syncing' | 'waiting-for-funding' | 'registering-dust' | 'ready' | 'error';
  night: string;
  dust: string;
  spendableDustCoins: number;
  totalDustCoins: number;
  pendingDustCoins: number;
  nightCoins: {
    total: number;
    registered: number;
    unregistered: number;
  };
  progress: {
    shielded: string;
    unshielded: string;
    dust: string;
  } | null;
  progressDetails: {
    shielded: SponsorSyncProgressDetails;
    unshielded: SponsorSyncProgressDetails;
    dust: SponsorSyncProgressDetails;
  } | null;
  initializedAt: string | null;
  lastStateAt: string | null;
  error: string | null;
}

const indexerHttpUrl = 'https://indexer.preprod.midnight.network/api/v4/graphql';
const indexerWsUrl = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
const relayURL = 'wss://rpc.preprod.midnight.network';
// This virtual hostname never leaves Cloudflare: SponsorWalletContainer maps
// it to the bound Proof Server Container through outboundByHost. Keeping this
// route on HTTP lets external Indexer/RPC TLS and WSS bypass HTTPS interception.
const proofServerUrl = 'http://proof.internal';
const defaultSyncTimeoutMs = 12 * 60 * 60_000;

function deriveKeys(seedHex: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seedHex, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Sponsor Wallet seed is invalid');
  const derived = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derived.type !== 'keysDerived') throw new Error('Sponsor Wallet key derivation failed');
  hdWallet.hdWallet.clear();
  return derived.keys;
}

function timeoutMs(): number {
  const parsed = Number(process.env.MIDNIGHT_SPONSOR_SYNC_TIMEOUT_MS ?? defaultSyncTimeoutMs);
  if (!Number.isSafeInteger(parsed) || parsed < 60_000 || parsed > 24 * 60 * 60_000) {
    throw new Error('MIDNIGHT_SPONSOR_SYNC_TIMEOUT_MS must be between one minute and 24 hours');
  }
  return parsed;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function diagnoseIndexerHttpConnectivity(): Promise<void> {
  const startedAt = performance.now();
  diagnosticLog('sponsor_wallet_indexer_http_probe_started', {
    endpoint: safeEndpoint(indexerHttpUrl),
  });
  try {
    const response = await fetch(indexerHttpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ block { height } }' }),
      signal: AbortSignal.timeout(15_000),
    });
    await response.body?.cancel();
    diagnosticLog('sponsor_wallet_indexer_http_probe_completed', {
      endpoint: safeEndpoint(indexerHttpUrl),
      status: response.status,
      ok: response.ok,
      durationMs: Math.round(performance.now() - startedAt),
    }, response.ok ? 'log' : 'warn');
  } catch (error) {
    diagnosticLog('sponsor_wallet_indexer_http_probe_failed', {
      endpoint: safeEndpoint(indexerHttpUrl),
      durationMs: Math.round(performance.now() - startedAt),
      ...diagnosticError(error),
    }, 'error');
  }
}

export class SponsorWalletRuntime {
  readonly address: string;
  readonly shieldedSecretKeys: ReturnType<typeof ledger.ZswapSecretKeys.fromSeed>;
  readonly dustSecretKey: ReturnType<typeof ledger.DustSecretKey.fromSeed>;
  readonly unshieldedKeystore: ReturnType<typeof createKeystore>;

  #wallet: Awaited<ReturnType<typeof WalletFacade.init>> | null = null;
  #latestState: Awaited<ReturnType<Awaited<ReturnType<typeof WalletFacade.init>>['waitForSyncedState']>> | null = null;
  #stateSubscription: Rx.Subscription | null = null;
  #activation: Promise<void> | null = null;
  #phase: SponsorWalletStatus['phase'] = 'starting';
  #lastError: string | null = null;
  #lastProgressLogAt = 0;
  #lastProgressLog = '';
  #initializedAt: string | null = null;
  #lastStateAt: string | null = null;

  constructor(readonly seedHex: string) {
    if (!/^(?:[0-9a-f]{2}){32}$/u.test(seedHex)) {
      throw new Error('SPONSOR_WALLET_SEED must be exactly 32 lowercase hexadecimal bytes');
    }
    setNetworkId('preprod');
    const keys = deriveKeys(seedHex);
    const networkId = getNetworkId();
    this.shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
    this.dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
    this.unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);
    this.address = this.unshieldedKeystore.getBech32Address().toString();
    diagnosticLog('sponsor_wallet_keys_derived', { networkId });
  }

  get wallet() {
    if (!this.#wallet) throw new Error('Sponsor Wallet has not been initialized');
    return this.#wallet;
  }

  async initialize(saved: SponsorSerializedState = {}): Promise<void> {
    if (this.#wallet) {
      diagnosticLog('sponsor_wallet_initialize_skipped', { reason: 'already-initialized' });
      return;
    }
    const initializeStartedAt = performance.now();
    const restoreParts = [
      saved.shielded === undefined ? null : 'shielded',
      saved.unshielded === undefined ? null : 'unshielded',
      saved.dust === undefined ? null : 'dust',
    ].filter((value): value is string => value !== null);
    this.#phase = 'syncing';
    this.#lastError = null;
    diagnosticLog('sponsor_wallet_initialize_started', {
      restoreParts,
      restored: restoreParts.length > 0,
    });
    try {
      const networkId = getNetworkId();
      const configuration = {
        networkId,
        indexerClientConnection: {
          indexerHttpUrl,
          indexerWsUrl,
        },
        batchUpdates: {
          size: 100,
          timeout: 5,
          spacing: 0,
        },
        provingServerUrl: new URL(proofServerUrl),
        relayURL: new URL(relayURL),
        txHistoryStorage: new NoOpTransactionHistoryStorage(),
        costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
      };
      const zkConfigProvider = new NodeZkConfigProvider(
        process.env.SPONSOR_ZK_CONFIG_PATH ?? '/app/contracts/sensor-registry/src/managed',
      );
      const provingProvider = httpClientProvingProvider(
        proofServerUrl,
        zkConfigProvider,
        { timeout: 900_000 },
      );
      await diagnoseIndexerHttpConnectivity();
      diagnosticLog('sponsor_wallet_facade_init_started', {
        indexerHttpEndpoint: safeEndpoint(indexerHttpUrl),
        indexerWsEndpoint: safeEndpoint(indexerWsUrl),
        relayEndpoint: safeEndpoint(relayURL),
        proofEndpoint: safeEndpoint(proofServerUrl),
      });
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
          diagnosticLog('sponsor_wallet_subwallet_factory', {
            subwallet: 'shielded',
            mode: saved.shielded === undefined ? 'fresh' : 'restore',
          });
          if (saved.shielded !== undefined) {
            return (factory as unknown as {
              restore(value: unknown): Promise<unknown>;
            }).restore(saved.shielded) as never;
          }
          return factory.startWithSecretKeys(this.shieldedSecretKeys);
        },
        unshielded: async (config) => {
          const factory = UnshieldedWallet(config);
          diagnosticLog('sponsor_wallet_subwallet_factory', {
            subwallet: 'unshielded',
            mode: saved.unshielded === undefined ? 'fresh' : 'restore',
          });
          if (saved.unshielded !== undefined) {
            return (factory as unknown as {
              restore(value: unknown): Promise<unknown>;
            }).restore(saved.unshielded) as never;
          }
          return factory.startWithPublicKey(PublicKey.fromKeyStore(this.unshieldedKeystore));
        },
        dust: async (config) => {
          const factory = DustWallet(config);
          diagnosticLog('sponsor_wallet_subwallet_factory', {
            subwallet: 'dust',
            mode: saved.dust === undefined ? 'fresh' : 'restore',
          });
          if (saved.dust !== undefined) {
            return (factory as unknown as {
              restore(value: string): Promise<unknown>;
            }).restore(saved.dust) as never;
          }
          return factory.startWithSecretKey(
            this.dustSecretKey,
            ledger.LedgerParameters.initialParameters().dust,
          );
        },
      });
      diagnosticLog('sponsor_wallet_facade_init_completed', {
        durationMs: Math.round(performance.now() - initializeStartedAt),
      });
      this.#wallet = wallet;
      this.#stateSubscription = wallet.state().subscribe({
        next: (state) => {
          this.#latestState = state;
          this.#lastStateAt = new Date().toISOString();
          const progress = {
            shielded: formatSponsorSyncProgress(state.shielded.progress),
            unshielded: formatSponsorSyncProgress(state.unshielded.progress),
            dust: formatSponsorSyncProgress(state.dust.progress),
          };
          const serialized = JSON.stringify(progress);
          const now = Date.now();
          if (
            serialized !== this.#lastProgressLog
            && (this.#lastProgressLogAt === 0 || now - this.#lastProgressLogAt >= 30_000)
          ) {
            diagnosticLog('sponsor_wallet_sync_progress', {
              phase: this.#phase,
              progress,
              progressDetails: {
                shielded: sponsorSyncProgressDetails(state.shielded.progress),
                unshielded: sponsorSyncProgressDetails(state.unshielded.progress),
                dust: sponsorSyncProgressDetails(state.dust.progress),
              },
            });
            this.#lastProgressLog = serialized;
            this.#lastProgressLogAt = now;
          }
        },
        error: (error) => {
          this.#phase = 'error';
          this.#lastError = errorMessage(error);
          diagnosticLog('sponsor_wallet_state_stream_failed', {
            ...diagnosticError(error),
          }, 'error');
        },
        complete: () => {
          diagnosticLog('sponsor_wallet_state_stream_completed', {
            phase: this.#phase,
          }, this.#phase === 'ready' ? 'warn' : 'error');
        },
      });
      diagnosticLog('sponsor_wallet_start_started');
      const walletStartStartedAt = performance.now();
      await wallet.start(this.shieldedSecretKeys, this.dustSecretKey);
      this.#initializedAt = new Date().toISOString();
      diagnosticLog('sponsor_wallet_start_completed', {
        durationMs: Math.round(performance.now() - walletStartStartedAt),
        initializeDurationMs: Math.round(performance.now() - initializeStartedAt),
      });
      this.startActivation();
    } catch (error) {
      this.#phase = 'error';
      this.#lastError = errorMessage(error);
      diagnosticLog('sponsor_wallet_initialize_failed', {
        durationMs: Math.round(performance.now() - initializeStartedAt),
        restoreParts,
        ...diagnosticError(error),
      }, 'error');
      throw error;
    }
  }

  startActivation(): void {
    if (this.#activation || this.#phase === 'ready' || !this.#wallet) return;
    diagnosticLog('sponsor_wallet_activation_started', { phase: this.#phase });
    this.#activation = this.#activate().catch((error) => {
      this.#lastError = errorMessage(error);
      if (this.#lastError.includes('has no tNIGHT')) {
        this.#phase = 'waiting-for-funding';
      } else {
        this.#phase = 'error';
      }
      diagnosticLog('sponsor_wallet_activation_failed', {
        phase: this.#phase,
        ...diagnosticError(error),
      }, this.#phase === 'waiting-for-funding' ? 'warn' : 'error');
      throw error;
    }).finally(() => {
      this.#activation = null;
    });
    void this.#activation.catch(() => undefined);
  }

  async waitUntilReady(): Promise<void> {
    if (this.#phase === 'ready') return;
    this.startActivation();
    const activation = this.#activation;
    if (!activation) throw new Error(this.#lastError ?? 'Sponsor Wallet activation did not start');
    await activation;
  }

  async submitPreparedTransaction(transaction: ledger.FinalizedTransaction): Promise<string> {
    await Rx.firstValueFrom(
      this.wallet.state().pipe(
        Rx.filter((state) => (
          state.shielded.progress.isStrictlyComplete()
          && state.unshielded.progress.isStrictlyComplete()
          && state.dust.progress.isStrictlyComplete()
        )),
        Rx.timeout({
          first: timeoutMs(),
          with: () => Rx.throwError(() => new Error(
            'Sponsor Wallet synchronization timed out before transaction submission',
          )),
        }),
      ),
    );
    diagnosticLog('sponsor_wallet_prepared_submission_started', {
      phase: this.#phase,
    });
    await this.wallet.submissionService.submitTransaction(transaction, 'Finalized');
    const identifier = transaction.identifiers().at(-1);
    if (!identifier) throw new Error('Sponsored transaction has no submission identifier');
    diagnosticLog('sponsor_wallet_prepared_submission_completed', {
      phase: this.#phase,
    });
    return String(identifier);
  }

  async releasePreparedTransaction(transaction: ledger.FinalizedTransaction): Promise<void> {
    const before = this.status();
    diagnosticLog('sponsor_wallet_prepared_release_started', {
      phase: this.#phase,
      spendableDustCoins: before.spendableDustCoins,
      totalDustCoins: before.totalDustCoins,
      pendingDustCoins: before.pendingDustCoins,
    });
    await this.wallet.revert(transaction);
    const after = this.status();
    diagnosticLog('sponsor_wallet_prepared_release_completed', {
      phase: this.#phase,
      spendableDustCoins: after.spendableDustCoins,
      totalDustCoins: after.totalDustCoins,
      pendingDustCoins: after.pendingDustCoins,
    });
  }

  async #activate(): Promise<void> {
    this.#phase = 'syncing';
    this.#lastError = null;
    const syncStartedAt = performance.now();
    diagnosticLog('sponsor_wallet_base_sync_wait_started');
    const state = await Rx.firstValueFrom(
      this.wallet.state().pipe(
        Rx.filter((next) => isSponsorBaseSyncComplete({
          shielded: next.shielded.progress,
          unshielded: next.unshielded.progress,
        })),
        Rx.timeout({
          first: timeoutMs(),
          with: () => Rx.throwError(() => new Error('Sponsor Wallet synchronization timed out')),
        }),
      ),
    );
    diagnosticLog('sponsor_wallet_base_sync_completed', {
      durationMs: Math.round(performance.now() - syncStartedAt),
      shielded: sponsorSyncProgressDetails(state.shielded.progress),
      unshielded: sponsorSyncProgressDetails(state.unshielded.progress),
    });
    const nightBalance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
    if (nightBalance === 0n) {
      throw new Error(`Sponsor Wallet has no tNIGHT: ${this.address}`);
    }
    let unregistered = state.unshielded.availableCoins.filter(
      (coin) => (
        coin.utxo.type === unshieldedToken().raw
        && coin.meta?.registeredForDustGeneration !== true
      ),
    );
    if (unregistered.length > 0) {
      const dustSyncStartedAt = performance.now();
      diagnosticLog('sponsor_wallet_dust_sync_wait_started', {
        unregisteredNightCoins: unregistered.length,
        progress: sponsorSyncProgressDetails(state.dust.progress),
      });
      const dustSyncedState = await Rx.firstValueFrom(
        this.wallet.state().pipe(
          Rx.filter((next) => (
            next.unshielded.progress.isStrictlyComplete()
            && next.dust.progress.isStrictlyComplete()
          )),
          Rx.timeout({
            first: timeoutMs(),
            with: () => Rx.throwError(() => new Error('Sponsor DUST wallet synchronization timed out')),
          }),
        ),
      );
      diagnosticLog('sponsor_wallet_dust_sync_completed', {
        durationMs: Math.round(performance.now() - dustSyncStartedAt),
        progress: sponsorSyncProgressDetails(dustSyncedState.dust.progress),
      });
      unregistered = dustSyncedState.unshielded.availableCoins.filter(
        (coin) => (
          coin.utxo.type === unshieldedToken().raw
          && coin.meta?.registeredForDustGeneration !== true
        ),
      );
    }
    if (unregistered.length > 0) {
      this.#phase = 'registering-dust';
      diagnosticLog('sponsor_wallet_dust_registration_started', {
        unregisteredNightCoins: unregistered.length,
      });
      const { fee, dustGenerationEstimations } = await this.wallet.estimateRegistration(unregistered);
      const generatedNow = dustGenerationEstimations.reduce(
        (sum, item) => sum + item.dust.generatedNow,
        0n,
      );
      diagnosticLog('sponsor_wallet_dust_registration_readiness', {
        fee: fee.toString(),
        generatedNow: generatedNow.toString(),
        waitingForGeneratedDust: generatedNow < fee,
      });
      await this.wallet.waitForGeneratedDust(unregistered, fee, { timeoutMs: timeoutMs() });
      const recipe = await this.wallet.registerNightUtxosForDustGeneration(
        unregistered,
        this.unshieldedKeystore.getPublicKey(),
        (payload) => this.unshieldedKeystore.signData(payload),
      );
      await this.wallet.submitTransaction(await this.wallet.finalizeRecipe(recipe));
      diagnosticLog('sponsor_wallet_dust_registration_submitted', {
        registeredNightCoins: unregistered.length,
      });
    }
    const dustWaitStartedAt = performance.now();
    diagnosticLog('sponsor_wallet_spendable_dust_wait_started');
    await Rx.firstValueFrom(
      this.wallet.state().pipe(
        Rx.filter((next) => next.dust.availableCoins.length > 0),
        Rx.timeout({
          first: timeoutMs(),
          with: () => Rx.throwError(() => new Error('Sponsor Wallet has no spendable DUST')),
        }),
      ),
    );
    this.#phase = 'ready';
    this.#lastError = null;
    diagnosticLog('sponsor_wallet_ready', {
      dustWaitDurationMs: Math.round(performance.now() - dustWaitStartedAt),
    });
  }

  async serializeState(): Promise<SponsorSerializedState> {
    const startedAt = performance.now();
    diagnosticLog('sponsor_wallet_serialize_started', { phase: this.#phase });
    const [shielded, unshielded, dust] = await Promise.all([
      this.wallet.shielded.serializeState(),
      this.wallet.unshielded.serializeState(),
      this.wallet.dust.serializeState(),
    ]);
    diagnosticLog('sponsor_wallet_serialize_completed', {
      phase: this.#phase,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return { shielded, unshielded, dust };
  }

  canSerializeState(): boolean {
    return this.#wallet !== null && this.#latestState !== null;
  }

  status(): SponsorWalletStatus {
    const state = this.#latestState;
    const nightCoins = state?.unshielded.availableCoins ?? [];
    const registeredNightCoins = nightCoins.filter(
      (coin) => coin.meta?.registeredForDustGeneration === true,
    ).length;
    return {
      address: this.address,
      phase: this.#phase,
      night: (state?.unshielded.balances[unshieldedToken().raw] ?? 0n).toString(),
      dust: state?.dust.balance(new Date()).toString() ?? '0',
      spendableDustCoins: state?.dust.availableCoins.length ?? 0,
      totalDustCoins: state?.dust.totalCoins.length ?? 0,
      pendingDustCoins: state?.dust.pendingCoins.length ?? 0,
      nightCoins: {
        total: nightCoins.length,
        registered: registeredNightCoins,
        unregistered: nightCoins.length - registeredNightCoins,
      },
      progress: state ? {
        shielded: formatSponsorSyncProgress(state.shielded.progress),
        unshielded: formatSponsorSyncProgress(state.unshielded.progress),
        dust: formatSponsorSyncProgress(state.dust.progress),
      } : null,
      progressDetails: state ? {
        shielded: sponsorSyncProgressDetails(state.shielded.progress),
        unshielded: sponsorSyncProgressDetails(state.unshielded.progress),
        dust: sponsorSyncProgressDetails(state.dust.progress),
      } : null,
      initializedAt: this.#initializedAt,
      lastStateAt: this.#lastStateAt,
      error: this.#lastError,
    };
  }

  async close(): Promise<void> {
    const startedAt = performance.now();
    diagnosticLog('sponsor_wallet_stop_started', { phase: this.#phase });
    this.#stateSubscription?.unsubscribe();
    if (this.#wallet) await this.#wallet.stop();
    diagnosticLog('sponsor_wallet_stop_completed', {
      durationMs: Math.round(performance.now() - startedAt),
    });
  }
}
