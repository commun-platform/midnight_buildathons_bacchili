export type WalletPhase =
  | 'starting'
  | 'syncing'
  | 'waiting-for-funding'
  | 'registering-dust'
  | 'ready'
  | 'error';

export interface CachedWalletHealth {
  phase: WalletPhase;
  progress: unknown;
  initialization?: {
    status: 'not-started' | 'running' | 'succeeded' | 'failed';
    startedAt: string | null;
    completedAt: string | null;
    error: string | null;
  };
  error: string | null;
  [name: string]: unknown;
}

export interface SupervisorHealth {
  status: 'healthy' | 'degraded' | 'unavailable';
  walletProcessAlive: boolean;
  walletProcessId: number | null;
  walletStatusFresh: boolean;
  lastSuccessfulProbeAt: string | null;
  lastProbeErrorAt: string | null;
  lastProbeError: string | null;
  statusAgeMs: number | null;
  consecutiveProbeFailures: number;
}

const initialWalletHealth: CachedWalletHealth = {
  phase: 'starting',
  progress: null,
  initialization: {
    status: 'not-started',
    startedAt: null,
    completedAt: null,
    error: null,
  },
  error: null,
};

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

export class SupervisorHealthState {
  readonly #freshForMs: number;
  #walletHealth: CachedWalletHealth = initialWalletHealth;
  #lastSuccessfulProbeMs: number | null = null;
  #lastProbeErrorMs: number | null = null;
  #lastProbeError: string | null = null;
  #consecutiveProbeFailures = 0;

  constructor(freshForMs = 30_000) {
    this.#freshForMs = freshForMs;
  }

  recordSuccess(walletHealth: CachedWalletHealth, nowMs = Date.now()): void {
    this.#walletHealth = walletHealth;
    this.#lastSuccessfulProbeMs = nowMs;
    this.#lastProbeError = null;
    this.#consecutiveProbeFailures = 0;
  }

  recordFailure(error: unknown, nowMs = Date.now()): void {
    this.#lastProbeErrorMs = nowMs;
    this.#lastProbeError = errorMessage(error);
    this.#consecutiveProbeFailures += 1;
  }

  snapshot(
    walletProcessId: number | null,
    walletProcessAlive: boolean,
    nowMs = Date.now(),
  ): CachedWalletHealth & { supervisor: SupervisorHealth } {
    const statusAgeMs = this.#lastSuccessfulProbeMs === null
      ? null
      : Math.max(0, nowMs - this.#lastSuccessfulProbeMs);
    const walletStatusFresh = statusAgeMs !== null && statusAgeMs <= this.#freshForMs;
    const status = !walletProcessAlive
      ? 'unavailable'
      : walletStatusFresh && this.#consecutiveProbeFailures === 0
        ? 'healthy'
        : 'degraded';
    return {
      ...this.#walletHealth,
      supervisor: {
        status,
        walletProcessAlive,
        walletProcessId,
        walletStatusFresh,
        lastSuccessfulProbeAt: this.#lastSuccessfulProbeMs === null
          ? null
          : new Date(this.#lastSuccessfulProbeMs).toISOString(),
        lastProbeErrorAt: this.#lastProbeErrorMs === null
          ? null
          : new Date(this.#lastProbeErrorMs).toISOString(),
        lastProbeError: this.#lastProbeError,
        statusAgeMs,
        consecutiveProbeFailures: this.#consecutiveProbeFailures,
      },
    };
  }
}
