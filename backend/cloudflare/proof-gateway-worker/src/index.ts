import { Container, getContainer } from '@cloudflare/containers';

export { ContainerProxy } from '@cloudflare/containers';

import { handleApi } from './api.js';
import {
  applyDeviceRateLimits,
  authorizeDeviceRequest,
  handleDeviceAuth,
  type DevicePrincipal,
} from './device-auth.js';
import { corsPreflightResponse, withDevelopmentCors } from './cors.js';
import {
  authorizeProofJob,
  dispatchProofJobs,
  handleJobQueue,
  markProofReady,
} from './jobs.js';
import { authorizeOperatorProofRequest } from './operator-proof.js';
import {
  maxSponsorCheckpointBytes,
  parseSponsorCheckpointUpload,
  restoreSponsorRecoveryCheckpoint,
  sponsorCheckpointKey,
  sponsorCheckpointRecoveryKey,
  storeWalletCheckpointAt,
} from './sponsor-checkpoint.js';
import {
  handleSponsorQueue,
  sponsorProofTransaction,
  stopSponsorWalletAfterDrain,
  warmSponsorWallet,
} from './sponsor.js';
import {
  prepareRequestAudit,
  recordRequestAudit,
  recordSponsorWalletHealth,
  recordSponsorWalletUnavailable,
} from './operations-audit.js';
import {
  dispatchOperationsNotifications,
  evaluateOperationalAlerts,
} from './operations-notifications.js';
import {
  deadLetterQueueNames,
  handleDeadLetterQueue,
} from './queue-dead-letters.js';
import { handleSystemOperations } from './system-operations.js';
import {
  dispatchManagedSourceJobs,
  handleManagedSourceQueue,
} from './managed-sources.js';
import { createSqlDatabase } from './storage/index.js';
import { parseSponsorArtifactReference, sha256Hex } from './container-request.js';
import {
  recordSponsorWalletStopped,
  sponsorWalletOperatingWindow,
} from './sponsor-operating-window.js';
import {
  acquireServerWalletWarmupLease,
  pendingServerWalletWork,
  processNextServerWalletWork,
  releaseServerWalletWarmupLease,
  serverWalletWorkCanProceed,
} from './server-wallet-work.js';
import {
  walletRuntimeProcessEnvironment,
  type WalletRuntimeRole,
} from './wallet-runtime-secrets.js';

const instanceName = 'midnight-proof-server';
// Keep the Durable Object lifecycle revision coupled to Sponsor Wallet image
// changes. Cloudflare can otherwise retain a stale "restarting" state after a
// container-only rollout while the replacement instance remains inactive.
const serverWalletRuntimeRevision = 'unified-wallet-v2';
const maxProofBodyBytes = 95 * 1024 * 1024;
const securityHeaders = {
  'Cross-Origin-Resource-Policy': 'same-site',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export class ProofServerContainer extends Container {
  defaultPort = 6300;
  requiredPorts = [6300];
  sleepAfter = '2m';
  // A fresh proof-server image fetches and verifies public proving parameters
  // from srs.midnight.network before it begins listening on the HTTP port. The
  // SDK egress proxy keeps every other destination blocked.
  enableInternet = false;
  interceptHttps = true;
  allowedHosts = ['srs.midnight.network'];
  envVars = {
    SSL_CERT_FILE: '/etc/cloudflare/certs/cloudflare-containers-ca.crt',
  };
  entrypoint = ['midnight-proof-server', '--port', '6300'];

  async fetch(request: Request): Promise<Response> {
    const requestId = crypto.randomUUID();
    const pathname = new URL(request.url).pathname;
    const startedAt = performance.now();
    const stateBefore = await this.getState();
    const runtime = this.ctx.container;
    const requiresStartOrPortCheck = !runtime?.running || stateBefore.status !== 'healthy';
    console.log(JSON.stringify({
      message: 'proof_server_container_request_started',
      requestId,
      pathname,
      stateBefore,
      runtimeRunning: runtime?.running ?? false,
      requiresStartOrPortCheck,
    }));
    try {
      if (requiresStartOrPortCheck) {
        await this.startAndWaitForPorts({
          startOptions: {
            enableInternet: false,
          },
          ports: this.defaultPort,
          cancellationOptions: {
            abort: request.signal,
            instanceGetTimeoutMS: 60_000,
            portReadyTimeoutMS: 10 * 60_000,
            waitInterval: 500,
          },
        });
      }
      const response = await this.containerFetch(request, this.defaultPort);
      console.log(JSON.stringify({
        message: 'proof_server_container_request_completed',
        requestId,
        pathname,
        status: response.status,
        requiredStartOrPortCheck: requiresStartOrPortCheck,
        durationMs: Math.round(performance.now() - startedAt),
      }));
      return response;
    } catch (error) {
      console.error(JSON.stringify({
        message: 'proof_server_container_request_failed',
        requestId,
        pathname,
        stateBefore,
        runtimeRunning: runtime?.running ?? false,
        durationMs: Math.round(performance.now() - startedAt),
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      }));
      throw error;
    }
  }

  onStart(): void {
    console.log(JSON.stringify({
      message: 'proof_server_container_started',
      port: this.defaultPort,
    }));
  }

  onStop({ exitCode, reason }: { exitCode: number; reason: string }): void {
    console.error(JSON.stringify({
      message: 'proof_server_container_stopped',
      exitCode,
      reason,
    }));
  }

  onError(error: unknown): void {
    console.error(JSON.stringify({
      message: 'proof_server_container_error',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
  }
}

export class ServerWalletContainer extends Container {
  defaultPort = 8789;
  requiredPorts = [8789];
  // The always-on profile touches the Wallet every minute. In the scheduled
  // profile this timeout lets an empty, synchronized runtime checkpoint and
  // stop after the eligible backlog has drained.
  sleepAfter = '10m';
  // The official Wallet SDK requires native TLS/WebSocket connections to the
  // public Indexer and RPC services. Container HTTPS interception cancels the
  // GraphQL WSS upgrades, so TLS uses native egress. Plain HTTP remains
  // restricted to the Worker-routed internal Proof Server host.
  enableInternet = true;
  interceptHttps = false;
  allowedHosts = [
    'proof.internal',
    'state.internal',
    'indexer.preprod.midnight.network',
    'rpc.preprod.midnight.network',
  ];
  pingEndpoint = 'sponsor-wallet/health';

  protected runtimeRole(): WalletRuntimeRole {
    return 'server-wallet';
  }

  protected runtimeSeed(): string | undefined {
    return this.env.SPONSOR_WALLET_SEED?.trim();
  }

  protected runtimeSecrets(seed: string): Record<string, string> {
    return walletRuntimeProcessEnvironment('server-wallet', {
      SPONSOR_WALLET_SEED: seed,
      OPERATOR_AUTHORITY_SECRET: this.env.OPERATOR_AUTHORITY_SECRET,
      MANAGED_ATTESTOR_ROOT_SECRET: this.env.MANAGED_ATTESTOR_ROOT_SECRET,
    });
  }

  private async stopRuntimeGracefully(reason: string): Promise<{
    stopped: boolean;
    state: string;
  }> {
    const runtime = this.ctx.container;
    if (!runtime?.running) {
      const state = await this.getState();
      return { stopped: false, state: state.status };
    }
    console.log(JSON.stringify({
      message: 'sponsor_wallet_scheduled_drain_stop_started',
      reason,
    }));
    await this.stop('SIGTERM');
    const deadline = Date.now() + 3 * 60_000;
    let state = await this.getState();
    while (!['stopped', 'stopped_with_code'].includes(state.status) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      state = await this.getState();
    }
    if (!['stopped', 'stopped_with_code'].includes(state.status)) {
      throw new Error('Server Wallet did not stop after the scheduled backlog drained');
    }
    console.log(JSON.stringify({
      message: 'sponsor_wallet_scheduled_drain_stop_completed',
      reason,
      state: state.status,
    }));
    return { stopped: true, state: state.status };
  }

  async stopAfterScheduledDrain(): Promise<{ stopped: boolean; state: string }> {
    return this.stopRuntimeGracefully('scheduled-drain');
  }

  private async artifactOperation<T>(
    operation: Promise<T>,
    timeoutCode: string,
  ): Promise<T> {
    return Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error(timeoutCode)), 10_000);
      }),
    ]);
  }

  private async runtimeDiagnostics(): Promise<Record<string, unknown>> {
    const state = await this.getState();
    const runtime = this.ctx.container;
    if (!runtime?.running) {
      return { containerRunning: false, state };
    }
    const script = [
      "import { readFile } from 'node:fs/promises';",
      "const readText = async (path) => { try { return await readFile(path, 'utf8'); } catch { return null; } };",
      "const parseStats = (value) => Object.fromEntries((value ?? '').trim().split('\\n').filter(Boolean).map((line) => { const [key, raw] = line.trim().split(/\\s+/, 2); return [key, Number(raw)]; }));",
      "const result = { pidOne: 'unavailable', pidOneStatus: null, stageEvents: [], healthStatus: null, healthBody: null, healthError: null, cpu: null, memory: null, pressure: null, loadAverage: null };",
      "try { result.pidOne = (await readFile('/proc/1/cmdline', 'utf8')).replaceAll('\\0', ' ').slice(0, 256); } catch {}",
      "const statusText = await readText('/proc/1/status'); result.pidOneStatus = statusText?.split('\\n').filter((line) => /^(?:State|VmRSS|Threads):/u.test(line)).join('; ') ?? null;",
      "const stageLog = await readText('/tmp/sponsor-wallet-diagnostics.jsonl'); result.stageEvents = (stageLog ?? '').split('\\n').filter(Boolean).flatMap((line) => { try { const event = JSON.parse(line); const message = String(event.message ?? ''); const operationalRequest = /^(?:sponsor_wallet_request_(?:started|completed|failed))$/u.test(message) && !['/health', '/status'].includes(String(event.pathname ?? '')); return /^(?:sponsor_wallet_(?:prepare|balance|finalize|submit|supervisor_proxy|managed_registration))/u.test(message) || operationalRequest ? [event] : []; } catch { return []; } }).slice(-40);",
      "const healthPromise = (async () => { try { const response = await fetch('http://127.0.0.1:8789/health', { signal: AbortSignal.timeout(5000) }); result.healthStatus = response.status; result.healthBody = (await response.text()).slice(0, 4096); } catch (error) { result.healthError = error instanceof Error ? `${error.name}: ${error.message}` : String(error); } })();",
      "const sampleStartedAt = performance.now(); const before = parseStats(await readText('/sys/fs/cgroup/cpu.stat'));",
      "const [cpuMaxText, memoryCurrentText, memoryMaxText, memoryEventsText, cpuPressure, memoryPressure, loadAverage] = await Promise.all([readText('/sys/fs/cgroup/cpu.max'), readText('/sys/fs/cgroup/memory.current'), readText('/sys/fs/cgroup/memory.max'), readText('/sys/fs/cgroup/memory.events'), readText('/proc/pressure/cpu'), readText('/proc/pressure/memory'), readText('/proc/loadavg')]);",
      "await new Promise((resolve) => setTimeout(resolve, 1000)); const after = parseStats(await readText('/sys/fs/cgroup/cpu.stat')); const elapsedMs = performance.now() - sampleStartedAt;",
      "const [quotaRaw, periodRaw] = (cpuMaxText ?? 'max 100000').trim().split(/\\s+/, 2); const quotaCores = quotaRaw === 'max' ? null : Number(quotaRaw) / Number(periodRaw); const usageDeltaUsec = (after.usage_usec ?? 0) - (before.usage_usec ?? 0); const usedCores = usageDeltaUsec / (elapsedMs * 1000);",
      "result.cpu = { sampleMs: Math.round(elapsedMs), quotaCores, usedCores: Number(usedCores.toFixed(3)), allocationUtilizationPct: quotaCores ? Number((usedCores / quotaCores * 100).toFixed(1)) : null, throttledEventsDelta: (after.nr_throttled ?? 0) - (before.nr_throttled ?? 0), throttledUsecDelta: (after.throttled_usec ?? 0) - (before.throttled_usec ?? 0) };",
      "const memoryCurrentBytes = Number((memoryCurrentText ?? '0').trim()); const memoryMaxRaw = (memoryMaxText ?? 'max').trim(); const memoryMaxBytes = memoryMaxRaw === 'max' ? null : Number(memoryMaxRaw); result.memory = { currentBytes: memoryCurrentBytes, maxBytes: memoryMaxBytes, utilizationPct: memoryMaxBytes ? Number((memoryCurrentBytes / memoryMaxBytes * 100).toFixed(1)) : null, events: parseStats(memoryEventsText) };",
      "result.pressure = { cpu: cpuPressure?.trim() ?? null, memory: memoryPressure?.trim() ?? null }; result.loadAverage = loadAverage?.trim() ?? null; await healthPromise;",
      'process.stdout.write(JSON.stringify(result));',
    ].join('\n');
    const process = await runtime.exec([
      '/usr/local/bin/node',
      '--input-type=module',
      '-e',
      script,
    ]);
    const output = await process.output();
    const decoder = new TextDecoder();
    return {
      containerRunning: true,
      state,
      exitCode: output.exitCode,
      stdout: decoder.decode(output.stdout).slice(0, 16_384),
      stderr: decoder.decode(output.stderr).slice(0, 4096),
    };
  }

  async fetch(request: Request): Promise<Response> {
    const requestId = crypto.randomUUID();
    const pathname = new URL(request.url).pathname;
    const startedAt = performance.now();
    const seed = this.runtimeSeed();
    if (!seed) return json(503, { error: 'Wallet runtime is not configured' });
    const stateBefore = await this.getState();
    if (pathname === '/maintenance/replay-dust') {
      if (this.runtimeRole() !== 'server-wallet') return json(404, { error: 'Not found' });
      if (
        request.method !== 'POST'
        || request.headers.get('X-Sponsor-Maintenance') !== 'replay-dust-from-chain'
      ) return json(404, { error: 'Not found' });
      if (
        await this.env.SPONSOR_STATE.head(sponsorCheckpointRecoveryKey) === null
        && await this.env.SPONSOR_STATE.head(sponsorCheckpointKey) === null
      ) {
        return json(409, { error: 'Sponsor Wallet DUST replay checkpoint is unavailable' });
      }
      // Drain the maintenance request before stopping the Container. Otherwise
      // the runtime may try to consume its stream after the 204 response.
      await request.arrayBuffer();
      const runtime = this.ctx.container;
      if (runtime?.running) {
        try {
          await this.stopRuntimeGracefully('dust-replay');
        } catch {
          return json(503, { error: 'Sponsor Wallet did not stop before DUST replay' });
        }
      }
      // The graceful shutdown first stores the latest encrypted checkpoint.
      // Replace it only after the process has stopped, so a late shutdown
      // upload cannot overwrite the selected pre-reservation recovery point.
      const recoveryCheckpointRestored = await restoreSponsorRecoveryCheckpoint(this.env);
      console.log(JSON.stringify({
        message: 'sponsor_wallet_dust_replay_scheduled',
        requestId,
        recoveryCheckpointRestored,
      }));
      return new Response(null, { status: 204 });
    }
    if (pathname === '/runtime-diagnostics') {
      if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
      try {
        const diagnostics = await this.runtimeDiagnostics();
        console.log(JSON.stringify({
          message: 'sponsor_wallet_runtime_diagnostics',
          requestId,
          ...diagnostics,
        }));
        return json(200, diagnostics);
      } catch (error) {
        console.error(JSON.stringify({
          message: 'sponsor_wallet_runtime_diagnostics_failed',
          requestId,
          stateBefore,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : String(error),
        }));
        return json(503, { error: 'Sponsor Wallet runtime diagnostics failed' });
      }
    }
    console.log(JSON.stringify({
      message: 'sponsor_wallet_container_request_started',
      requestId,
      pathname,
      stateBefore,
    }));
    try {
      const runtime = this.ctx.container;
      const requiresStartOrPortCheck = !runtime?.running || stateBefore.status !== 'healthy';
      if (requiresStartOrPortCheck) {
        await this.startAndWaitForPorts({
          startOptions: {
            envVars: {
              ...this.runtimeSecrets(seed),
              SPONSOR_ZK_CONFIG_PATH: '/app/midnight/contracts/sensor-registry/src/managed/sensor-registry',
            },
            enableInternet: true,
          },
          ports: this.defaultPort,
          cancellationOptions: {
            abort: request.signal,
            instanceGetTimeoutMS: 60_000,
            portReadyTimeoutMS: 10 * 60_000,
            waitInterval: 500,
          },
        });
      }
      let response: Response;
      if (
        request.method === 'GET'
        && ['/prepare', '/release', '/submit'].includes(pathname)
      ) {
        const parsed = parseSponsorArtifactReference(request, pathname);
        if (!parsed.ok) return json(parsed.status, { error: parsed.error });
        const artifact = await this.artifactOperation(
          this.env.SPONSOR_STATE.get(parsed.reference.objectKey),
          'sponsor_container_artifact_get_timeout',
        );
        if (!artifact) return json(404, { error: 'Sponsor Wallet artifact was not found' });
        if (artifact.size !== parsed.reference.bytes) {
          return json(400, { error: 'Sponsor Wallet artifact size does not match' });
        }
        const body = await this.artifactOperation(
          artifact.arrayBuffer(),
          'sponsor_container_artifact_body_timeout',
        );
        if (await sha256Hex(body) !== parsed.reference.sha256) {
          return json(400, { error: 'Sponsor Wallet artifact hash does not match' });
        }
        const headers = new Headers(request.headers);
        headers.set('Content-Type', 'application/octet-stream');
        headers.set('Content-Length', String(body.byteLength));
        console.log(JSON.stringify({
          message: 'sponsor_wallet_container_request_buffered',
          requestId,
          pathname,
          objectKey: parsed.reference.objectKey,
          bytes: body.byteLength,
          durationMs: Math.round(performance.now() - startedAt),
        }));
        response = await this.containerFetch(request.url, {
          // Only immutable R2 references cross the Worker-to-DO boundary.
          // The state-changing request is reconstructed inside the DO and is
          // sent as POST solely over the local Container port.
          method: 'POST',
          headers,
          body,
        }, this.defaultPort);
      } else {
        response = await this.containerFetch(request, this.defaultPort);
      }
      console.log(JSON.stringify({
        message: 'sponsor_wallet_container_request_completed',
        requestId,
        pathname,
        status: response.status,
        requiredStartOrPortCheck: requiresStartOrPortCheck,
        durationMs: Math.round(performance.now() - startedAt),
      }));
      return response;
    } catch (error) {
      console.error(JSON.stringify({
        message: 'sponsor_wallet_container_request_failed',
        requestId,
        pathname,
        stateBefore,
        durationMs: Math.round(performance.now() - startedAt),
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      }));
      throw error;
    }
  }

  onStart(): void {
    console.log(JSON.stringify({
      message: 'sponsor_wallet_container_started',
      port: this.defaultPort,
      runtimeRevision: serverWalletRuntimeRevision,
    }));
  }

  async onActivityExpired(): Promise<void> {
    console.log(JSON.stringify({
      message: 'sponsor_wallet_container_idle_stop_started',
    }));
    // The one-minute Cron keeps the active Sponsor Wallet alive. An instance
    // that is no longer addressed must be allowed to stop; otherwise a stale
    // Named Instance permanently consumes max_instances and blocks its
    // replacement. The standard lifecycle sends SIGTERM, which lets the
    // Supervisor upload its encrypted shutdown checkpoint.
    await super.onActivityExpired();
  }

  onStop({ exitCode, reason }: { exitCode: number; reason: string }): void {
    console.error(JSON.stringify({
      message: 'sponsor_wallet_container_stopped',
      exitCode,
      reason,
    }));
  }

  onError(error: unknown): void {
    console.error(JSON.stringify({
      message: 'sponsor_wallet_container_error',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
  }
}

// Assign through the SDK's inherited setter. A static class field would shadow
// that setter and install interception without registering these handlers.
const walletRuntimeOutboundByHost = {
  'proof.internal': async (request: Request, env: Env): Promise<Response> => {
    const startedAt = performance.now();
    const upstreamUrl = new URL(request.url);
    upstreamUrl.protocol = 'http:';
    upstreamUrl.hostname = 'proof-server';
    upstreamUrl.port = '';
    console.log(JSON.stringify({
      message: 'sponsor_wallet_proof_egress_started',
      pathname: upstreamUrl.pathname,
    }));
    const container = getContainer(env.PROOF_SERVER, instanceName);
    const response = await container.fetch(new Request(upstreamUrl, request));
    console.log(JSON.stringify({
      message: 'sponsor_wallet_proof_egress_completed',
      pathname: upstreamUrl.pathname,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    }));
    return response;
  },
  'state.internal': async (
    request: Request,
    env: Env,
    context: { containerId: string; className: string },
  ): Promise<Response> => {
    const startedAt = performance.now();
    try {
      const stateUrl = new URL(request.url);
      if (request.method === 'GET' && stateUrl.pathname === '/sponsor-checkpoint') {
        if (
          context.className !== 'ServerWalletContainer'
          || request.headers.get('X-Sponsor-Checkpoint-Operation') !== 'restore-v1'
        ) return json(404, { error: 'Not found' });
        const checkpoint = await env.SPONSOR_STATE.get(sponsorCheckpointKey);
        if (!checkpoint) return json(404, { error: 'Sponsor Wallet checkpoint was not found' });
        if (checkpoint.size <= 0 || checkpoint.size > maxSponsorCheckpointBytes) {
          await checkpoint.body.cancel();
          return json(500, { error: 'Sponsor Wallet checkpoint has an invalid size' });
        }
        console.log(JSON.stringify({
          message: 'sponsor_wallet_restore_checkpoint_served',
          containerId: context.containerId,
          bytes: checkpoint.size,
          durationMs: Math.round(performance.now() - startedAt),
        }));
        return new Response(checkpoint.body, {
          headers: {
            'Cache-Control': 'no-store',
            'Content-Length': String(checkpoint.size),
            'Content-Type': 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      const checkpoint = parseSponsorCheckpointUpload(request);
      const checkpointKey = sponsorCheckpointKey;
      const activeReservations = context.className === 'ServerWalletContainer'
        ? Number((await createSqlDatabase(env).first<{ active_count: number }>(
          `SELECT COUNT(*) AS active_count FROM daily_proof_jobs
           WHERE status IN ('sponsor_retryable', 'sponsoring', 'sponsored')`,
        ))?.active_count ?? 0)
        : 0;
      if (activeReservations !== 0) {
        await checkpoint.body.cancel();
        console.log(JSON.stringify({
          message: 'sponsor_wallet_checkpoint_upload_skipped_for_active_reservation',
          containerId: context.containerId,
          bootId: checkpoint.bootId,
          reason: checkpoint.reason,
          bytes: checkpoint.bytes,
          activeReservations,
          durationMs: Math.round(performance.now() - startedAt),
        }));
        return new Response(null, { status: 204 });
      }
      await storeWalletCheckpointAt(env, checkpointKey, checkpoint.body, checkpoint.bytes, {
        source: checkpoint.reason === 'periodic-sync'
          ? 'periodic-push'
          : 'graceful-shutdown',
        bootId: checkpoint.bootId,
        reason: checkpoint.reason,
        progress: checkpoint.progress,
      });
      console.log(JSON.stringify({
        message: checkpoint.reason === 'periodic-sync'
          ? 'sponsor_wallet_periodic_checkpoint_stored'
          : 'sponsor_wallet_graceful_checkpoint_stored',
        containerId: context.containerId,
        bootId: checkpoint.bootId,
        reason: checkpoint.reason,
        bytes: checkpoint.bytes,
        progress: checkpoint.progress ?? null,
        durationMs: Math.round(performance.now() - startedAt),
      }));
      return new Response(null, { status: 204 });
    } catch (error) {
      console.error(JSON.stringify({
        message: 'sponsor_wallet_graceful_checkpoint_rejected',
        containerId: context.containerId,
        durationMs: Math.round(performance.now() - startedAt),
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      }));
      return json(400, { error: 'Sponsor Wallet checkpoint was rejected' });
    }
  },
};

ServerWalletContainer.outboundByHost = walletRuntimeOutboundByHost;

function json(status: number, value: unknown): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...securityHeaders,
    },
  });
}

function validProofRequest(request: Request): boolean {
  if (request.headers.get('Content-Type')?.split(';', 1)[0]?.trim() !== 'application/octet-stream') {
    return false;
  }
  const contentLength = request.headers.get('Content-Length');
  if (!contentLength) return true;
  const bytes = Number(contentLength);
  return Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= maxProofBodyBytes;
}

async function routeRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const systemOperationsResponse = await handleSystemOperations(request, env, ctx);
  if (systemOperationsResponse) return systemOperationsResponse;
  const authResponse = await handleDeviceAuth(request, env);
  if (authResponse) return authResponse;
  const parts = url.pathname.split('/').filter(Boolean);
  if (
    request.method === 'POST'
    && parts.length === 5
    && parts[0] === 'api'
    && parts[1] === 'v1'
    && parts[2] === 'proof-jobs'
    && parts[3]
    && parts[4] === 'sponsor'
  ) return sponsorProofTransaction(request, env, parts[3], ctx);
  const apiResponse = await handleApi(request, env, ctx);
  if (apiResponse) return apiResponse;
  if (url.pathname === '/health') {
    return json(200, {
      ok: true,
      service: 'midnight-edge-attestation-cloud',
      container: 'scale-to-zero',
      gui: 'worker-spa',
    });
  }

  if (url.pathname === '/ready') {
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
    const access = await authorizeProofAccess(request, env, false);
    if (!access.ok) return access.response;
    const upstream = await forwardToProofServer(request, env, true);
    return json(upstream.status < 500 ? 200 : 502, {
      ok: upstream.status < 500,
      upstreamStatus: upstream.status,
    });
  }

  if (
    url.pathname === '/check'
    || url.pathname === '/prove'
    || url.pathname === '/proof/check'
    || url.pathname === '/proof/prove'
  ) {
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
    const access = await authorizeProofAccess(request, env, true);
    if (!access.ok) return access.response;
    if (!validProofRequest(request)) {
      return json(415, { error: 'Expected application/octet-stream within the configured size limit' });
    }
    if (
      access.kind === 'device'
      && !(await applyDeviceRateLimits(env.PROOF_RATE_LIMITER, request, access.principal))
    ) {
      return new Response(JSON.stringify({ error: 'Proof API rate limit exceeded' }), {
        status: 429,
        headers: { ...securityHeaders, 'Cache-Control': 'no-store', 'Retry-After': '60' },
      });
    }
    const response = await forwardToProofServer(request, env);
    if (
      response.ok
      && access.proofJobId
      && (url.pathname === '/prove' || url.pathname === '/proof/prove')
    ) {
      await markProofReady(env, access.proofJobId);
    }
    return response;
  }

  if (url.pathname.startsWith('/proof/')) return json(404, { error: 'Unknown proof endpoint' });
  return env.ASSETS.fetch(request);
}

async function authorizeProofAccess(
  request: Request,
  env: Env,
  startProving: boolean,
): Promise<
  | { ok: true; kind: 'operator'; proofJobId: null }
  | { ok: true; kind: 'device'; proofJobId: string; principal: DevicePrincipal }
  | { ok: false; response: Response }
> {
  const operator = await authorizeOperatorProofRequest(request, env);
  if (operator.kind === 'authorized') return { ok: true, kind: 'operator', proofJobId: null };
  if (operator.kind === 'denied') return { ok: false, response: operator.response };
  const authorization = await authorizeDeviceRequest(request, env, 'proof:generate');
  if (!authorization.ok) return authorization;
  const proofJob = await authorizeProofJob(request, env, authorization.principal, startProving);
  if (!proofJob.ok) return proofJob;
  return {
    ok: true,
    kind: 'device',
    proofJobId: proofJob.job.id,
    principal: authorization.principal,
  };
}

async function forwardToProofServer(request: Request, env: Env, ready = false): Promise<Response> {
  const startedAt = performance.now();
  const contentLength = request.headers.get('Content-Length');
  const parsedContentLength = contentLength === null ? null : Number(contentLength);
  const requestBytes = parsedContentLength !== null && Number.isSafeInteger(parsedContentLength)
    ? parsedContentLength
    : null;
  const upstreamUrl = new URL(request.url);
  upstreamUrl.pathname = ready ? '/' : upstreamUrl.pathname.replace(/^\/proof/, '');
  upstreamUrl.searchParams.delete('token');
  const headers = new Headers(request.headers);
  headers.delete('Authorization');
  headers.delete('Cookie');
  const upstreamRequest = new Request(upstreamUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? null : request.body,
    redirect: 'manual',
  });
  const container = getContainer(env.PROOF_SERVER, instanceName);
  let response: Response;
  try {
    response = await container.fetch(upstreamRequest);
  } catch (error) {
    console.error(JSON.stringify({
      message: 'proof_gateway_upstream',
      endpoint: ready ? 'ready' : upstreamUrl.pathname.slice(1),
      requestBytes,
      durationMs: Math.round(performance.now() - startedAt),
      outcome: 'exception',
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }));
    throw error;
  }
  const responseBody = request.method === 'HEAD' ? null : await response.arrayBuffer();
  const durationMs = Math.round(performance.now() - startedAt);
  const responseBytes = responseBody?.byteLength ?? 0;
  console.log(JSON.stringify({
    message: 'proof_gateway_upstream',
    endpoint: ready ? 'ready' : upstreamUrl.pathname.slice(1),
    requestBytes,
    responseBytes,
    durationMs,
    outcome: response.ok ? 'ok' : 'upstream-error',
    upstreamStatus: response.status,
  }));
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Cache-Control', 'no-store');
  responseHeaders.set('Content-Length', String(responseBytes));
  responseHeaders.set('X-Proof-Server', 'midnight-8.1.0');
  responseHeaders.set('Server-Timing', `proof-server;dur=${durationMs}`);
  responseHeaders.delete('Set-Cookie');
  for (const [name, value] of Object.entries(securityHeaders)) responseHeaders.set(name, value);
  return new Response(responseBody, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const preflight = corsPreflightResponse(request);
    if (preflight) {
      const headers = new Headers(preflight.headers);
      for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
      return new Response(null, { status: preflight.status, headers });
    }
    const requestId = crypto.randomUUID();
    const audit = prepareRequestAudit(request, requestId);
    try {
      const routed = await routeRequest(request, env, ctx);
      const response = withDevelopmentCors(request, routed);
      const headers = new Headers(response.headers);
      headers.set('X-Request-Id', requestId);
      const correlated = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      if (audit) ctx.waitUntil(recordRequestAudit(env, request, correlated, audit));
      return correlated;
    } catch (error) {
      if (audit) {
        ctx.waitUntil(recordRequestAudit(
          env,
          request,
          json(500, { error: 'Unhandled Worker error' }),
          audit,
        ));
      }
      throw error;
    }
  },
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    const sponsorMaintenance = () => warmSponsorWallet(env).then(async (result) => {
      const { health, errorCode } = result;
      if (health) await recordSponsorWalletHealth(env, health);
      else await recordSponsorWalletUnavailable(env, errorCode ?? 'sponsor_wallet_warmup_failed');
      await evaluateOperationalAlerts(env, health);
      await dispatchOperationsNotifications(env, health);
      return result;
    });
    const sponsorCycle = sponsorWalletOperatingWindow(
      env,
      new Date(controller.scheduledTime),
    ).then(async (operatingWindow) => {
      if (!operatingWindow.executionAllowed) {
        console.log(JSON.stringify({
          message: 'sponsor_wallet_processing_schedule_unavailable',
          nextProcessingStartsAt: operatingWindow.nextProcessingStartsAt,
        }));
        await evaluateOperationalAlerts(env, null, {
          sponsorScheduledOffline: false,
          sponsorScheduleUnavailable: true,
        });
        await dispatchOperationsNotifications(env, null);
        return;
      }
      const acceptedThrough = operatingWindow.mode === 'scheduled'
        ? operatingWindow.eligibleThrough
        : null;
      const pendingWork = await pendingServerWalletWork(
        env,
        controller.scheduledTime,
        acceptedThrough,
      );
      if (pendingWork) {
        if (!operatingWindow.startAllowed) {
          console.log(JSON.stringify({
            message: 'server_wallet_restart_cooldown_active',
            workKind: pendingWork.kind,
            workId: pendingWork.id,
            nextStartAllowedAt: operatingWindow.nextStartAllowedAt,
          }));
          return;
        }
        const database = createSqlDatabase(env);
        const warmupLeaseToken = await acquireServerWalletWarmupLease(
          database,
          pendingWork,
          new Date(controller.scheduledTime),
        );
        if (!warmupLeaseToken) {
          console.log(JSON.stringify({
            message: 'server_wallet_warmup_already_in_progress',
            workKind: pendingWork.kind,
            workId: pendingWork.id,
          }));
          return;
        }
        try {
          const { health } = await sponsorMaintenance();
          if (!health || !serverWalletWorkCanProceed(pendingWork, health)) {
            console.log(JSON.stringify({
              message: 'server_wallet_work_waiting_for_synchronization',
              workKind: pendingWork.kind,
              workId: pendingWork.id,
              sponsorStatus: pendingWork.sponsorStatus,
              walletPhase: health?.phase ?? 'unavailable',
              spendableDustCoins: health?.spendableDustCoins ?? null,
            }));
            return;
          }
          const result = await processNextServerWalletWork(
            env,
            controller.scheduledTime,
            acceptedThrough,
          );
          if (operatingWindow.mode !== 'always-on' && result.status === 'processed') {
            const remaining = await pendingServerWalletWork(
              env,
              Date.now(),
              acceptedThrough,
            );
            if (!remaining) {
              const stopped = await stopSponsorWalletAfterDrain(env);
              if (stopped.stopped) await recordSponsorWalletStopped(env);
            }
          }
          return;
        } finally {
          await releaseServerWalletWarmupLease(database, warmupLeaseToken);
        }
      }
      if (operatingWindow.mode === 'always-on') {
        await sponsorMaintenance();
        return;
      }
      console.log(JSON.stringify(operatingWindow.mode === 'on-demand'
        ? { message: 'sponsor_wallet_on_demand_idle' }
        : {
          message: 'sponsor_wallet_waiting_for_next_processing_start',
          eligibleThrough: operatingWindow.eligibleThrough,
          nextProcessingStartsAt: operatingWindow.nextProcessingStartsAt,
        }));
      // Scheduled waiting and on-demand idle are both intentional offline
      // states. Resolve transient Wallet alerts without waking the Container so
      // an earlier startup observation cannot leak into the next job-driven run.
      await evaluateOperationalAlerts(env, null, { sponsorScheduledOffline: true });
      await dispatchOperationsNotifications(env, null);
    });
    ctx.waitUntil(Promise.all([
      dispatchProofJobs(env, controller.scheduledTime),
      dispatchManagedSourceJobs(env, controller.scheduledTime),
      sponsorCycle,
    ]).then(() => undefined));
  },
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    if (deadLetterQueueNames.has(batch.queue)) {
      await handleDeadLetterQueue(batch, env);
      await dispatchOperationsNotifications(env, null);
      return;
    }
    if (batch.queue === 'midnight-proof-jobs') {
      await handleJobQueue(batch, env);
      return;
    }
    if (batch.queue === 'midnight-sponsor-jobs') {
      await handleSponsorQueue(batch, env);
      await dispatchOperationsNotifications(env, null);
      return;
    }
    if (batch.queue === 'midnight-managed-source-jobs') {
      await handleManagedSourceQueue(batch, env);
      return;
    }
    batch.retryAll({ delaySeconds: 60 });
  },
} satisfies ExportedHandler<Env>;
