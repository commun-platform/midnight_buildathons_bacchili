import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import os from 'node:os';

import { diagnosticError, diagnosticLog } from './diagnostics.js';
import {
  SupervisorHealthState,
  type CachedWalletHealth,
} from './supervisor-health.js';
import {
  drainProxyRequest,
  proxyMethodHasRequestBody,
} from './supervisor-proxy.js';
import {
  verifyWalletSignatureRequest,
  walletSignatureVerificationPath,
} from './wallet-signature.js';
import {
  readSynchronizationCheckpointCache,
  readSynchronizationCheckpointCacheMetadata,
} from './checkpoint-cache.js';

function configuredPort(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} must be a valid TCP port`);
  }
  return value;
}

const supervisorPort = configuredPort('SPONSOR_WALLET_SUPERVISOR_PORT', 8789);
const walletPort = configuredPort('SPONSOR_WALLET_INTERNAL_PORT', 8790);
if (supervisorPort === walletPort) {
  throw new Error('Sponsor Wallet Supervisor and internal service ports must differ');
}
const walletProbeIntervalMs = 2_000;
// The Wallet SDK yields between synchronization batches, which can delay the
// internal health handler by a few seconds even though the Supervisor remains
// responsive. Allow one batch to yield before declaring the cached status
// stale; probeInFlight still prevents overlapping requests.
const walletProbeTimeoutMs = 5_000;
const walletNicePriority = 10;
const forcedShutdownMs = 14 * 60_000;
const healthState = new SupervisorHealthState();
const walletEntry = fileURLToPath(new URL('./server.js', import.meta.url));

let walletProcess: ChildProcess | null = null;
let walletProcessAlive = false;
let probeInFlight = false;
let shuttingDown = false;
let shutdownSignal: NodeJS.Signals | null = null;

function responseJson(response: http.ServerResponse, status: number, value: unknown): void {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Length': body.byteLength,
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

function supervisorHealth() {
  const health = healthState.snapshot(
    walletProcess?.pid ?? null,
    walletProcessAlive,
  );
  const cachedCheckpoint = readSynchronizationCheckpointCacheMetadata();
  if (cachedCheckpoint && health.phase !== 'ready') {
    health.synchronizationCheckpoint = {
      status: 'succeeded',
      attemptedAt: cachedCheckpoint.updatedAt,
      completedAt: cachedCheckpoint.updatedAt,
      durationMs: null,
      bytes: cachedCheckpoint.bytes,
      dustApplied: cachedCheckpoint.dustApplied,
      error: null,
      delivery: 'local-cache',
    };
  }
  return health;
}

function startWalletProcess(): ChildProcess {
  const child = spawn(process.execPath, [walletEntry], {
    env: {
      ...process.env,
      SPONSOR_WALLET_SERVICE_PORT: String(walletPort),
    },
    stdio: 'inherit',
  });
  walletProcessAlive = true;
  try {
    if (child.pid !== undefined) os.setPriority(child.pid, walletNicePriority);
    diagnosticLog('sponsor_wallet_sync_process_started', {
      walletProcessId: child.pid ?? null,
      nicePriority: walletNicePriority,
      walletPort,
    });
  } catch (error) {
    diagnosticLog('sponsor_wallet_sync_process_priority_failed', {
      walletProcessId: child.pid ?? null,
      nicePriority: walletNicePriority,
      ...diagnosticError(error),
    }, 'warn');
  }
  child.once('error', (error) => {
    walletProcessAlive = false;
    healthState.recordFailure(error);
    diagnosticLog('sponsor_wallet_sync_process_error', {
      ...diagnosticError(error),
    }, 'error');
  });
  child.once('exit', (code, signal) => {
    walletProcessAlive = false;
    diagnosticLog('sponsor_wallet_sync_process_exited', {
      exitCode: code,
      signal,
      shutdownSignal,
    }, shuttingDown && code === 0 ? 'log' : 'error');
    server.close();
    const exitCode = shuttingDown && code === 0 ? 0 : code ?? 1;
    setTimeout(() => process.exit(exitCode), 100).unref();
  });
  return child;
}

async function probeWallet(): Promise<void> {
  if (probeInFlight || !walletProcessAlive) return;
  probeInFlight = true;
  try {
    const response = await fetch(`http://127.0.0.1:${walletPort}/health`, {
      signal: AbortSignal.timeout(walletProbeTimeoutMs),
    });
    if (!response.ok) throw new Error(`Wallet health returned HTTP ${response.status}`);
    const body = await response.text();
    if (body.length > 64 * 1024) throw new Error('Wallet health response is too large');
    const health = JSON.parse(body) as CachedWalletHealth;
    if (typeof health !== 'object' || health === null || typeof health.phase !== 'string') {
      throw new Error('Wallet health response is invalid');
    }
    healthState.recordSuccess(health);
  } catch (error) {
    healthState.recordFailure(error);
  } finally {
    probeInFlight = false;
  }
}

function proxyToWallet(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): void {
  const pathname = new URL(request.url ?? '/', 'http://sponsor.internal').pathname;
  const operationalRequest = !['/health', '/status'].includes(pathname);
  const respondUnavailable = (message: string, proxyError?: Error): void => {
    const sendResponse = (): void => {
      if (!response.headersSent) {
        responseJson(response, 503, { error: message });
      } else if (proxyError) {
        response.destroy(proxyError);
      }
    };
    if (!proxyMethodHasRequestBody(request.method) || request.readableEnded) {
      sendResponse();
      return;
    }
    request.unpipe();
    void drainProxyRequest(request).then(sendResponse, (error: unknown) => {
      response.destroy(error instanceof Error ? error : new Error(String(error)));
    });
  };
  if (!walletProcessAlive) {
    respondUnavailable('Sponsor Wallet process is unavailable');
    return;
  }
  if (operationalRequest) {
    diagnosticLog('sponsor_wallet_supervisor_proxy_started', {
      method: request.method,
      pathname,
      declaredBytes: request.headers['content-length'] ?? null,
      transferEncoding: request.headers['transfer-encoding'] ?? null,
    });
  }
  const upstream = http.request({
    host: '127.0.0.1',
    port: walletPort,
    path: request.url,
    method: request.method,
    headers: {
      ...request.headers,
      host: `127.0.0.1:${walletPort}`,
    },
  }, (upstreamResponse) => {
    if (operationalRequest) {
      diagnosticLog('sponsor_wallet_supervisor_proxy_response_started', {
        method: request.method,
        pathname,
        status: upstreamResponse.statusCode ?? 502,
      });
    }
    response.writeHead(
      upstreamResponse.statusCode ?? 502,
      upstreamResponse.statusMessage,
      upstreamResponse.headers,
    );
    upstreamResponse.pipe(response);
  });
  upstream.once('error', (error) => {
    diagnosticLog('sponsor_wallet_supervisor_proxy_failed', {
      method: request.method,
      pathname: new URL(request.url ?? '/', 'http://sponsor.internal').pathname,
      ...diagnosticError(error),
    }, 'warn');
    respondUnavailable('Sponsor Wallet process is starting', error);
  });
  upstream.once('finish', () => {
    if (operationalRequest) {
      diagnosticLog('sponsor_wallet_supervisor_proxy_body_completed', {
        method: request.method,
        pathname,
        requestReadableEnded: request.readableEnded,
      });
    }
  });
  if (proxyMethodHasRequestBody(request.method)) {
    request.once('aborted', () => upstream.destroy());
    request.pipe(upstream);
  } else {
    upstream.end();
  }
}

async function readBody(request: http.IncomingMessage, maximumBytes: number): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > maximumBytes) throw new Error('Request body is too large');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

async function handleWalletSignatureVerification(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const body = await readBody(request, 8 * 1024);
  const provisioningVersion = request.headers['x-operator-provisioning'];
  verifyWalletSignatureRequest(
    typeof provisioningVersion === 'string' ? provisioningVersion : undefined,
    body,
  );
  responseJson(response, 200, { verified: true });
}

async function serveSynchronizationCheckpoint(
  response: http.ServerResponse,
): Promise<boolean> {
  const cached = await readSynchronizationCheckpointCache();
  if (!cached) return false;
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Length': cached.checkpoint.byteLength,
    'Content-Type': 'application/octet-stream',
    'X-Sponsor-Checkpoint-Boot-Id': cached.metadata.bootId,
    'X-Sponsor-Checkpoint-Phase': cached.metadata.phase,
    'X-Sponsor-Checkpoint-Shielded-Applied': cached.metadata.shieldedApplied,
    'X-Sponsor-Checkpoint-Unshielded-Applied': cached.metadata.unshieldedApplied,
    'X-Sponsor-Checkpoint-Dust-Applied': cached.metadata.dustApplied,
    'X-Sponsor-Checkpoint-Source': 'local-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(Buffer.from(cached.checkpoint));
  return true;
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://sponsor.internal').pathname;
  if (request.method === 'GET' && pathname === '/health') {
    responseJson(response, 200, supervisorHealth());
    void probeWallet();
    return;
  }
  if (request.method === 'GET' && pathname === '/checkpoint') {
    const phase = supervisorHealth().phase;
    if (phase !== 'ready') {
      void serveSynchronizationCheckpoint(response).then((served) => {
        if (!served && !response.headersSent) {
          responseJson(response, 503, { error: 'Synchronization checkpoint is not available yet' });
        }
      }).catch((error) => {
        diagnosticLog('sponsor_wallet_supervisor_checkpoint_failed', {
          ...diagnosticError(error),
        }, 'warn');
        if (!response.headersSent) {
          responseJson(response, 503, { error: 'Synchronization checkpoint is unavailable' });
        }
      });
      return;
    }
  }
  if (request.method === 'POST' && pathname === walletSignatureVerificationPath) {
    void handleWalletSignatureVerification(request, response).catch((error) => {
      diagnosticLog('sponsor_wallet_supervisor_signature_verification_failed', {
        ...diagnosticError(error),
      }, 'warn');
      if (!response.headersSent) {
        responseJson(response, 400, {
          error: error instanceof Error ? error.message : 'Wallet signature verification failed',
        });
      } else {
        response.destroy();
      }
    });
    return;
  }
  proxyToWallet(request, response);
});

walletProcess = startWalletProcess();
server.listen(supervisorPort, '0.0.0.0', () => {
  diagnosticLog('sponsor_wallet_health_supervisor_started', {
    supervisorPort,
    walletPort,
    walletProcessId: walletProcess?.pid ?? null,
    walletProbeIntervalMs,
    walletProbeTimeoutMs,
  });
  void probeWallet();
});

const probeTimer = setInterval(() => void probeWallet(), walletProbeIntervalMs);
probeTimer.unref();

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  shutdownSignal = signal;
  clearInterval(probeTimer);
  diagnosticLog('sponsor_wallet_health_supervisor_shutdown_started', {
    signal,
    walletProcessId: walletProcess?.pid ?? null,
  });
  server.close();
  walletProcess?.kill(signal);
  const forcedTimer = setTimeout(() => {
    diagnosticLog('sponsor_wallet_health_supervisor_shutdown_timed_out', {
      signal,
      walletProcessId: walletProcess?.pid ?? null,
    }, 'error');
    walletProcess?.kill('SIGKILL');
    process.exit(1);
  }, forcedShutdownMs);
  forcedTimer.unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('uncaughtExceptionMonitor', (error, origin) => {
  diagnosticLog('sponsor_wallet_health_supervisor_uncaught_exception', {
    origin,
    ...diagnosticError(error),
  }, 'error');
});
process.once('unhandledRejection', (reason) => {
  diagnosticLog('sponsor_wallet_health_supervisor_unhandled_rejection', {
    ...diagnosticError(reason),
  }, 'error');
});
