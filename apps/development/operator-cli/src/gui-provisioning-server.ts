import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { thresholdPolicyKey } from '@midnight-demo/shared';

import { repoRoot, resolveNetwork } from './config.js';
import { retryOperation } from './retry.js';
import { loadDeployment } from './state.js';

const host = '127.0.0.1';
const port = Number(process.env.VSP_GUI_PROVISIONING_PORT ?? 8790);
const projectId = 'measurement-authenticity-01';
const maximumBodyBytes = 64 * 1024;
let operationInProgress = false;

function json(response: http.ServerResponse, status: number, value: unknown, origin?: string): void {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  });
  response.end(JSON.stringify(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function allowedOrigin(request: http.IncomingMessage): string | null {
  const origin = request.headers.origin;
  if (!origin) return '';
  try {
    const url = new URL(origin);
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return origin;
  } catch {
    return null;
  }
  return origin === process.env.VSP_GUI_ORIGIN?.trim() ? origin : null;
}

async function requestBody(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maximumBodyBytes) throw new Error('Request body is too large');
    chunks.push(bytes);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Request body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function safeIdentifier(name: string, value: unknown, maximum = 160): string {
  if (typeof value !== 'string' || value.length > maximum) throw new Error(`${name} is invalid`);
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized)) throw new Error(`${name} is invalid`);
  return normalized;
}

function publicEnrollment(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('enrollment is required');
  }
  const enrollment = value as Record<string, unknown>;
  const deviceId = safeIdentifier('deviceId', enrollment.deviceId, 80);
  if (enrollment.projectId !== projectId || enrollment.schemaVersion !== 1 || enrollment.algorithm !== 'ES256') {
    throw new Error('Enrollment metadata is invalid');
  }
  safeIdentifier('keyId', enrollment.keyId);
  const jwk = enrollment.publicKeyJwk as JsonWebKey | undefined;
  if (
    jwk?.kty !== 'EC'
    || jwk.crv !== 'P-256'
    || typeof jwk.x !== 'string'
    || typeof jwk.y !== 'string'
    || jwk.d !== undefined
  ) throw new Error('Enrollment must contain a public-only P-256 key');
  if (!Array.isArray(enrollment.requestedScopes) || enrollment.requestedScopes.length === 0) {
    throw new Error('Enrollment scopes are missing');
  }
  return { ...enrollment, deviceId };
}

async function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const append = (chunk: Buffer): void => {
      if (output.length < 128 * 1024) output += chunk.toString('utf8');
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timer = setTimeout(() => child.kill('SIGTERM'), 20 * 60 * 1000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error(output.trim().slice(-4000) || `${command} exited ${code ?? signal}`));
    });
  });
}

async function configuration() {
  const network = resolveNetwork('preprod');
  const deployment = loadDeployment('preprod');
  if (!deployment || deployment.contractSchemaVersion !== 3) {
    throw new Error('Compatible Preprod Fleet Registry deployment was not found');
  }
  return {
    network: 'preprod' as const,
    projectId,
    contractAddress: deployment.contractAddress,
    serviceUrl: process.env.VSP_PROOF_GATEWAY_URL?.trim() || network.proofServer,
    policies: [{
      policyId: deployment.policyId,
      policyKey: await thresholdPolicyKey(deployment.policyId).then((value) => Buffer.from(value).toString('hex')),
      mode: deployment.policyMode,
      minimum: deployment.thresholdMinimum,
      maximum: deployment.thresholdMaximum,
      valueScale: deployment.valueScale,
      sensorTypeCode: deployment.sensorTypeCode,
      unitCode: deployment.unitCode,
      version: deployment.policyVersion,
      registeredTxId: deployment.policyRegisteredTxId,
    }],
  };
}

async function registerDevice(body: Record<string, unknown>): Promise<unknown> {
  const enrollment = publicEnrollment(body.enrollment);
  const deviceId = safeIdentifier('deviceId', enrollment.deviceId, 80);
  const policyId = safeIdentifier('policyId', body.policyId);
  const authority = typeof body.deviceAuthority === 'string'
    ? body.deviceAuthority.trim().replace(/^0x/iu, '').toLowerCase()
    : '';
  if (!/^(?:[0-9a-f]{2}){32}$/u.test(authority)) throw new Error('deviceAuthority is invalid');
  const config = await configuration();
  const policy = config.policies.find((candidate) => candidate.policyId === policyId);
  if (!policy) throw new Error('Threshold Policy is not registered');
  const assignmentId = `${deviceId}-${policyId}-wave1`;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'vsp-browser-device-'));
  const enrollmentPath = path.join(temporary, 'enrollment.json');
  try {
    fs.writeFileSync(enrollmentPath, `${JSON.stringify(enrollment, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    await retryOperation(() => run('npm', [
      'run', 'cloudflare:device:provision-record', '--',
      '--device-id', deviceId,
      '--project-id', projectId,
      '--policy-id', policyId,
      '--name', deviceId,
      '--sponsor-daily-limit', '20',
    ]), { attempts: 2, delayMs: 1_000 });
    const currentDevice = loadDeployment('preprod')?.devices.find(
      (candidate) => candidate.deviceId === deviceId,
    );
    if (currentDevice) {
      if (
        currentDevice.status !== 'registered'
        || currentDevice.deviceAuthority.toLowerCase() !== authority
        || currentDevice.policyId !== policyId
        || currentDevice.assignmentId !== assignmentId
      ) throw new Error('Existing Midnight Device registration does not match this Device Identity');
      await run('npm', [
        'run', 'cloudflare:device:sync-midnight', '--',
        '--device-id', deviceId,
      ]);
    } else {
      await run('npm', [
        'run', 'development:device:register:cloudflare', '--',
        '--device-id', deviceId,
        '--device-authority', authority,
        '--policy-id', policyId,
        '--assignment-id', assignmentId,
      ]);
    }
    await run('npm', [
      'run', 'cloudflare:device:register', '--',
      '--enrollment', enrollmentPath,
    ]);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  const deployment = loadDeployment('preprod');
  const device = deployment?.devices.find((candidate) => candidate.deviceId === deviceId);
  if (!deployment || !device || device.status !== 'registered') {
    throw new Error('Confirmed Device registration was not persisted locally');
  }
  return {
    deviceId,
    projectId,
    contractAddress: deployment.contractAddress,
    deviceCommitment: device.deviceCommitment,
    policyId: device.policyId,
    policyKey: policy.policyKey,
    assignmentId: device.assignmentId,
    assignmentKey: device.assignmentKey,
    registeredTxId: device.registeredTxId,
    assignmentTxId: device.assignmentRegisteredTxId,
  };
}

const server = http.createServer(async (request, response) => {
  const origin = allowedOrigin(request);
  if (origin === null) return json(response, 403, { error: 'Origin is not allowed' });
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    });
    return response.end();
  }
  const url = new URL(request.url ?? '/', `http://${host}:${port}`);
  try {
    if (request.method === 'GET' && url.pathname === '/api/configuration') {
      return json(response, 200, await configuration(), origin || undefined);
    }
    if (request.method === 'POST' && url.pathname === '/api/devices') {
      if (operationInProgress) return json(response, 409, { error: 'Another provisioning operation is running' }, origin || undefined);
      operationInProgress = true;
      try {
        return json(response, 200, await registerDevice(await requestBody(request)), origin || undefined);
      } finally {
        operationInProgress = false;
      }
    }
    if (request.method === 'POST' && url.pathname === '/api/dashboard/sync') {
      if (operationInProgress) return json(response, 409, { error: 'Another development operation is running' }, origin || undefined);
      operationInProgress = true;
      try {
        const output = await run('npm', ['run', 'dashboard:sync']);
        return json(response, 200, {
          synchronized: true,
          detail: output.trim().slice(-4000),
        }, origin || undefined);
      } finally {
        operationInProgress = false;
      }
    }
    const match = /^\/api\/proof-jobs\/([A-Za-z0-9._:-]{1,160})\/admit$/u.exec(url.pathname);
    if (request.method === 'POST' && match) {
      const proofJobId = match[1];
      if (!proofJobId) throw new Error('Proof Job ID is missing');
      await run('npm', [
        'run', 'development:admit-proof-job', '--',
        '--job-id', proofJobId,
        '--confirm-integration-test',
      ]);
      return json(response, 200, { admitted: true, proofJobId }, origin || undefined);
    }
    return json(response, 404, { error: 'Not found' }, origin || undefined);
  } catch (error) {
    return json(response, 400, { error: errorMessage(error) }, origin || undefined);
  }
});

server.listen(port, host, () => {
  process.stdout.write(`GUI provisioning bridge listening on http://${host}:${port}\n`);
});
