import {
  maxSponsorCheckpointBytes,
  sponsorCheckpointKey,
} from './sponsor-checkpoint.js';
import { serverWalletContainerName } from './sponsor-container.js';

export type AuthorityRuntimeRole = 'fleet-authority' | 'managed-attestor';

interface RuntimeHealth {
  phase?: 'starting' | 'syncing' | 'waiting-for-funding' | 'registering-dust' | 'ready' | 'error';
  initialization?: {
    status?: 'not-started' | 'running' | 'succeeded' | 'failed';
    error?: string | null;
  };
}

export class AuthorityRuntimeNotReadyError extends Error {
  readonly code = 'authority_runtime_not_ready';

  constructor(
    readonly role: AuthorityRuntimeRole,
    readonly phase: string,
    readonly initializationStatus: string,
  ) {
    super(
      `Server Wallet is synchronizing for ${role}: phase=${phase}, initialization=${initializationStatus}`,
    );
    this.name = 'AuthorityRuntimeNotReadyError';
  }
}

export function authorityRuntimeReady(health: RuntimeHealth): boolean {
  return health.initialization?.status === 'succeeded' && health.phase === 'ready';
}

function runtimeNotReady(role: AuthorityRuntimeRole, health: RuntimeHealth): never {
  throw new AuthorityRuntimeNotReadyError(
    role,
    health.phase ?? 'unknown',
    health.initialization?.status ?? 'unknown',
  );
}

async function runtime(env: Env) {
  const { getContainer } = await import('@cloudflare/containers');
  return getContainer(env.SPONSOR_WALLET, serverWalletContainerName);
}

function requiresWalletInitialization(pathname: string): boolean {
  return [
    '/operator/register-device',
    '/operator/register-policy',
    '/operator/register-service-device',
    '/managed/attest',
  ].includes(pathname);
}

async function smallJson<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (body.length > 64 * 1024) throw new Error('Server Wallet response is too large');
  if (!response.ok) {
    throw new Error(`Server Wallet returned HTTP ${response.status}: ${body.slice(0, 512)}`);
  }
  return JSON.parse(body) as T;
}

export async function ensureAuthorityRuntime(
  env: Env,
  role: AuthorityRuntimeRole,
): Promise<void> {
  const container = await runtime(env);
  const health = await smallJson<RuntimeHealth>(await container.fetch(new Request(
    'http://authority-wallet/health',
    { signal: AbortSignal.timeout(60_000) },
  )));
  if (authorityRuntimeReady(health)) return;
  if (health.initialization?.status === 'failed') {
    throw new Error(`Server Wallet initialization failed: ${health.initialization.error ?? 'unknown error'}`);
  }
  if (health.phase === 'error' || health.phase === 'waiting-for-funding') {
    throw new Error(
      `Server Wallet is unavailable: phase=${health.phase}, initialization=${health.initialization?.status ?? 'unknown'}`,
    );
  }
  if (health.initialization?.status !== 'not-started') runtimeNotReady(role, health);
  const checkpoint = await env.SPONSOR_STATE.get(sponsorCheckpointKey);
  if (checkpoint && (checkpoint.size <= 0 || checkpoint.size > maxSponsorCheckpointBytes)) {
    throw new Error('Server Wallet checkpoint has an invalid size');
  }
  const response = await container.fetch(new Request('http://authority-wallet/restore', {
    method: 'POST',
    headers: {
      'Content-Length': String(checkpoint?.size ?? 0),
      'Content-Type': 'application/octet-stream',
    },
    body: checkpoint?.body ?? new Uint8Array(),
    signal: AbortSignal.timeout(60_000),
  }));
  const restored = await smallJson<{ status?: RuntimeHealth }>(response);
  if (restored.status && authorityRuntimeReady(restored.status)) return;
  runtimeNotReady(role, restored.status ?? health);
}

export async function authorityContainerRequest(
  env: Env,
  role: AuthorityRuntimeRole,
  pathname: string,
  init: RequestInit,
): Promise<Response> {
  if (requiresWalletInitialization(pathname)) {
    await ensureAuthorityRuntime(env, role);
  }
  const container = await runtime(env);
  return container.fetch(new Request(`http://authority-wallet${pathname}`, init));
}
