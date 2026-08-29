import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import os from 'node:os';

import { diagnosticError, diagnosticLog } from './diagnostics.js';
import {
  SupervisorHealthState,
  type CachedWalletHealth,
} from './supervisor-health.js';

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
const walletProbeTimeoutMs = 250;
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
  if (!walletProcessAlive) {
    responseJson(response, 503, { error: 'Sponsor Wallet process is unavailable' });
    return;
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
    if (!response.headersSent) {
      responseJson(response, 503, { error: 'Sponsor Wallet process is starting' });
    } else {
      response.destroy(error);
    }
  });
  request.once('aborted', () => upstream.destroy());
  request.pipe(upstream);
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://sponsor.internal').pathname;
  if (request.method === 'GET' && pathname === '/health') {
    responseJson(response, 200, healthState.snapshot(
      walletProcess?.pid ?? null,
      walletProcessAlive,
    ));
    void probeWallet();
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
