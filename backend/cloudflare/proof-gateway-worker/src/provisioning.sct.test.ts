import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveBrowserWalletDeviceId } from '@midnight-demo/shared/browser-provisioning';

const sponsorMocks = vi.hoisted(() => ({
  sponsorWalletHealth: vi.fn(),
}));

const containerMocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock('./sponsor.js', () => ({
  sponsorWalletHealth: sponsorMocks.sponsorWalletHealth,
}));

vi.mock('@cloudflare/containers', () => ({
  getContainer: () => ({ fetch: containerMocks.fetch }),
}));

import {
  browserProvisioningCanonicalMessage,
  handleProvisioningApi,
  processBrowserProvisioningQueueMessage,
} from './provisioning.js';

const operationId = 'prv_01990a00-0000-7000-8000-000000000101';
const progressToken = 'sct-progress-token';
const walletVerifyingKey = 'wallet-verifying-key';

async function p256Enrollment() {
  const keyId = '-f88kSuPEq4rh3PUHUWp2CmVgwhQ7pHEnqhGsB2Xtgk';
  const publicKeyJwk: JsonWebKey = {
    key_ops: ['verify'],
    ext: true,
    kty: 'EC',
    x: 'Is4uZAY5PJTgFDuOFMo8VOlTtYt7I6egeSxrnhIXVe4',
    y: 'Wx3Vra9f3HUkNFS43zx8uNFC8RFS4SdvyqSqS7waZHE',
    crv: 'P-256',
  };
  return {
    schemaVersion: 1,
    deviceId: await deriveBrowserWalletDeviceId(
      await sha256Hex(walletVerifyingKey),
      'measurement-authenticity-01',
    ),
    projectId: 'measurement-authenticity-01',
    keyId,
    algorithm: 'ES256',
    publicKeyJwk,
    requestedScopes: [
      'anomaly:write',
      'configuration:read',
      'device:status',
      'measurement:write',
      'proof:generate',
      'proof:read',
      'proof:request',
      'transaction:submit',
    ],
    createdAt: '2026-08-30T00:00:00.000Z',
  };
}

async function tokenHash(): Promise<string> {
  return sha256Hex(progressToken);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  ));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function admissionDatabase(input: {
  challengeId: string;
  challengeNonce: string;
  enrollment: Awaited<ReturnType<typeof p256Enrollment>>;
  operation: Record<string, unknown>;
}): D1Database {
  return {
    prepare(query: string) {
      let parameters: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          parameters = values;
          return statement;
        },
        async first<T>() {
          if (query.includes('FROM browser_project_sessions')) {
            return {
              wallet_key_sha256: await sha256Hex(walletVerifyingKey),
              expires_at: Math.floor(Date.now() / 1_000) + 86_400,
            } as T;
          }
          if (query.includes('FROM browser_wallet_projects')) {
            return { project_id: input.enrollment.projectId } as T;
          }
          if (query.includes('FROM browser_provisioning_challenges')) {
            return (parameters[0] === input.challengeId ? {
              id: input.challengeId,
              device_id: input.enrollment.deviceId,
              project_id: input.enrollment.projectId,
              key_id: input.enrollment.keyId,
              nonce_sha256: await sha256Hex(input.challengeNonce),
              expires_at: Math.floor(Date.now() / 1_000) + 300,
              consumed_at: null,
            } : null) as T | null;
          }
          if (query.includes('FROM threshold_policies')) {
            return {
              policy_id: 'temperature-v1',
              policy_key: '44'.repeat(32),
              mode: 'closed-range',
              minimum: 10,
              maximum: 35,
              value_scale: 100,
              sensor_type_code: 1,
              unit_code: 1,
              policy_version: 1,
              registered_tx_id: 'policy-tx',
            } as T;
          }
          if (query.includes('FROM browser_wallet_devices')) return null as T | null;
          if (query.includes('FROM devices d')) return null as T | null;
          if (query.includes('FROM browser_provisioning_operations')) {
            return (parameters[0] === input.operation.id
              && parameters[1] === input.operation.progress_token_sha256
              ? input.operation
              : null) as T | null;
          }
          return null as T | null;
        },
        async all<T>() {
          return { success: true, results: [] as T[], meta: { changes: 0 } } as D1Result<T>;
        },
        async run<T>() {
          if (query.includes('INSERT INTO browser_provisioning_operations')) {
            Object.assign(input.operation, {
              id: parameters[0],
              progress_token_sha256: parameters[1],
              wallet_key_sha256: parameters[2],
              device_id: parameters[3],
              project_id: parameters[4],
              policy_id: parameters[5],
              assignment_id: parameters[6],
              enrollment_json: parameters[7],
              device_authority: parameters[8],
              browser_authorization_json: parameters[9],
              status: 'queued',
              stage: 'queued',
              device_commitment: null,
              policy_key: null,
              assignment_key: null,
              device_tx_id: null,
              assignment_tx_id: null,
              error_message: null,
              created_at: parameters[10],
              updated_at: parameters[10],
            });
          }
          return { success: true, results: [] as T[], meta: { changes: 1 } } as D1Result<T>;
        },
        async raw() { return [[]] as [string[]]; },
      } as unknown as D1PreparedStatement;
      return statement;
    },
    async batch<T>(statements: D1PreparedStatement[]) {
      for (const statement of statements) await statement.run();
      return statements.map(() => ({
        success: true,
        results: [] as T[],
        meta: { changes: 1 },
      } as D1Result<T>));
    },
  } as unknown as D1Database;
}

function database(
  operation: Record<string, unknown>,
  expectedTokenHash: string,
): D1Database {
  return {
    prepare(query: string) {
      let parameters: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          parameters = values;
          return statement;
        },
        async first<T>() {
          if (query.includes('FROM browser_provisioning_operations')) {
            const tokenMatches = parameters.length < 2 || parameters[1] === expectedTokenHash;
            return (parameters[0] === operation.id && tokenMatches ? operation : null) as T | null;
          }
          if (query.includes('FROM threshold_policies')) {
            return {
              policy_id: 'temperature-v1',
              policy_key: '44'.repeat(32),
              mode: 'closed-range',
              minimum: 10,
              maximum: 35,
              value_scale: 100,
              sensor_type_code: 1,
              unit_code: 1,
              policy_version: 1,
              registered_tx_id: 'policy-tx',
            } as T;
          }
          return null as T | null;
        },
        async all<T>() {
          return { success: true, results: [] as T[], meta: { changes: 0 } } as D1Result<T>;
        },
        async run<T>() {
          if (query.includes('UPDATE browser_provisioning_operations')) {
            if (query.includes("SET status = 'retrying'")) {
              operation.status = 'retrying';
              operation.stage = 'retry_waiting';
              operation.error_message = parameters[0];
              operation.updated_at = parameters[1];
            } else if (query.includes("SET status = 'running'")) {
              operation.status = 'running';
              operation.stage = 'sponsor_wallet_syncing';
              operation.error_message = null;
              operation.updated_at = parameters[0];
            } else if (query.includes("SET status = 'failed'")) {
              operation.status = 'failed';
              operation.stage = 'failed';
              operation.error_message = parameters[0];
              operation.updated_at = parameters[1];
            }
          }
          return { success: true, results: [] as T[], meta: { changes: 1 } } as D1Result<T>;
        },
        async raw() { return [[]] as [string[]]; },
      } as unknown as D1PreparedStatement;
      return statement;
    },
    async batch<T>(statements: D1PreparedStatement[]) {
      for (const statement of statements) await statement.run();
      return statements.map(() => ({
        success: true,
        results: [] as T[],
        meta: { changes: 1 },
      } as D1Result<T>));
    },
  } as unknown as D1Database;
}

describe('SCT: asynchronous Browser Device provisioning API', () => {
  beforeEach(() => {
    sponsorMocks.sponsorWalletHealth.mockReset();
    containerMocks.fetch.mockReset();
  });

  it('accepts registration as a queued Job without waiting for Midnight transactions', async () => {
    const enrollment = await p256Enrollment();
    const challengeId = 'challenge-sct-001';
    const challengeNonce = 'challenge-nonce-sct-001';
    const timestamp = new Date().toISOString();
    const deviceAuthority = '22'.repeat(32);
    const canonical = browserProvisioningCanonicalMessage({
      deviceId: enrollment.deviceId,
      keyId: enrollment.keyId,
      deviceAuthority,
      policyId: 'temperature-v1',
      challengeId,
      nonce: challengeNonce,
      timestamp,
    });
    const operation: Record<string, unknown> = {};
    const send = vi.fn(async () => undefined);
    const env = {
      DB: admissionDatabase({ challengeId, challengeNonce, enrollment, operation }),
      SPONSOR_QUEUE: { send },
      SPONSOR_WALLET: {},
      PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS: '33'.repeat(32),
    } as unknown as Env;
    containerMocks.fetch.mockImplementation(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe('/operator/verify-wallet-signature');
      return Response.json({ valid: true });
    });

    const response = await handleProvisioningApi(new Request(
      'https://worker.test/api/v1/provisioning/devices',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enrollment,
          deviceAuthority,
          policyId: 'temperature-v1',
          challengeId,
          nonce: challengeNonce,
          timestamp,
          walletSignature: {
            data: canonical,
            signature: 'wallet-signature',
            verifyingKey: walletVerifyingKey,
          },
        }),
      },
    ), env);

    expect(response?.status).toBe(202);
    const accepted = await response?.json() as {
      operationId: string;
      progressToken: string;
      statusUrl: string;
      status: string;
      stage: string;
    };
    expect(accepted).toMatchObject({
      operationId: expect.stringMatching(/^prv_/u),
      progressToken: expect.any(String),
      statusUrl: expect.stringMatching(/^\/api\/v1\/provisioning\/operations\/prv_/u),
      status: 'queued',
      stage: 'queued',
    });
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({
      kind: 'browser-device-provisioning',
      operationId: accepted.operationId,
    });
    expect(containerMocks.fetch).toHaveBeenCalledOnce();
    expect(operation).toMatchObject({
      id: accepted.operationId,
      status: 'queued',
      stage: 'queued',
      device_tx_id: null,
      assignment_tx_id: null,
    });

    const status = await handleProvisioningApi(new Request(
      new URL(accepted.statusUrl, 'https://worker.test'),
      { headers: { 'X-Provisioning-Token': accepted.progressToken } },
    ), env);
    expect(status?.status).toBe(200);
    expect(await status?.json()).toMatchObject({
      operationId: accepted.operationId,
      status: 'queued',
      stage: 'queued',
      deviceTxId: null,
      assignmentTxId: null,
    });
  });

  it('rejects a Device ID that was not derived from the signing Wallet', async () => {
    const enrollment = {
      ...await p256Enrollment(),
      deviceId: `device-${'ff'.repeat(32)}`,
    };
    const challengeId = 'challenge-sct-wallet-mismatch';
    const challengeNonce = 'challenge-nonce-wallet-mismatch';
    const timestamp = new Date().toISOString();
    const deviceAuthority = '22'.repeat(32);
    const canonical = browserProvisioningCanonicalMessage({
      deviceId: enrollment.deviceId,
      keyId: enrollment.keyId,
      deviceAuthority,
      policyId: 'temperature-v1',
      challengeId,
      nonce: challengeNonce,
      timestamp,
    });
    const send = vi.fn(async () => undefined);
    const env = {
      DB: admissionDatabase({ challengeId, challengeNonce, enrollment, operation: {} }),
      SPONSOR_QUEUE: { send },
      SPONSOR_WALLET: {},
      PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS: '33'.repeat(32),
    } as unknown as Env;

    const response = await handleProvisioningApi(new Request(
      'https://worker.test/api/v1/provisioning/devices',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enrollment,
          deviceAuthority,
          policyId: 'temperature-v1',
          challengeId,
          nonce: challengeNonce,
          timestamp,
          walletSignature: {
            data: canonical,
            signature: 'wallet-signature',
            verifyingKey: walletVerifyingKey,
          },
        }),
      },
    ), env);

    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({
      error: 'Device ID does not match the connected Midnight Wallet',
    });
    expect(containerMocks.fetch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps a Wallet-syncing Job server-owned and observable after the Queue retry budget', async () => {
    const enrollment = await p256Enrollment();
    const operation = {
      id: operationId,
      progress_token_sha256: await tokenHash(),
      wallet_key_sha256: '11'.repeat(32),
      device_id: enrollment.deviceId,
      project_id: enrollment.projectId,
      policy_id: 'temperature-v1',
      assignment_id: `${enrollment.deviceId}-temperature-v1-wave1`,
      enrollment_json: JSON.stringify(enrollment),
      device_authority: '22'.repeat(32),
      browser_authorization_json: JSON.stringify({ timestamp: '2000-01-01T00:00:00.000Z' }),
      status: 'queued',
      stage: 'queued',
      device_commitment: null,
      policy_key: null,
      assignment_key: null,
      device_tx_id: null,
      assignment_tx_id: null,
      error_message: null,
      created_at: '2026-08-30T00:00:00.000Z',
      updated_at: '2026-08-30T00:00:00.000Z',
    };
    const send = vi.fn(async () => undefined);
    const env = {
      DB: database(operation, operation.progress_token_sha256),
      SPONSOR_QUEUE: { send },
      PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS: '33'.repeat(32),
    } as unknown as Env;
    const ack = vi.fn();
    const retry = vi.fn();
    const message = {
      body: { kind: 'browser-device-provisioning', operationId },
      attempts: 12,
      ack,
      retry,
    } as unknown as Message<unknown>;

    const before = await handleProvisioningApi(new Request(
      `https://worker.test/api/v1/provisioning/operations/${operationId}`,
      { headers: { 'X-Provisioning-Token': progressToken } },
    ), env);
    expect(before?.status).toBe(200);
    expect(await before?.json()).toMatchObject({ status: 'queued', stage: 'queued' });

    sponsorMocks.sponsorWalletHealth.mockResolvedValue({
      phase: 'syncing',
      spendableDustCoins: 0,
      supervisor: {
        status: 'healthy',
        walletProcessAlive: true,
        walletStatusFresh: true,
      },
    });
    expect(await processBrowserProvisioningQueueMessage(message, env)).toBe(true);

    expect(send).toHaveBeenCalledWith(
      { kind: 'browser-device-provisioning', operationId },
      { delaySeconds: 60 },
    );
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(operation).toMatchObject({
      status: 'retrying',
      stage: 'retry_waiting',
      device_tx_id: null,
      assignment_tx_id: null,
    });

    const after = await handleProvisioningApi(new Request(
      `https://worker.test/api/v1/provisioning/operations/${operationId}`,
      { headers: { 'X-Provisioning-Token': progressToken } },
    ), env);
    expect(after?.status).toBe(200);
    expect(await after?.json()).toMatchObject({
      operationId,
      status: 'retrying',
      stage: 'retry_waiting',
      error: expect.stringContaining('Sponsor Wallet is not ready'),
    });
  });

  it('exposes a terminal processing failure only after the server retry budget is exhausted', async () => {
    const enrollment = await p256Enrollment();
    const operation = {
      id: operationId,
      progress_token_sha256: await tokenHash(),
      wallet_key_sha256: '11'.repeat(32),
      device_id: enrollment.deviceId,
      project_id: enrollment.projectId,
      policy_id: 'temperature-v1',
      assignment_id: `${enrollment.deviceId}-temperature-v1-wave1`,
      enrollment_json: JSON.stringify(enrollment),
      device_authority: '22'.repeat(32),
      browser_authorization_json: JSON.stringify({ timestamp: '2000-01-01T00:00:00.000Z' }),
      status: 'retrying',
      stage: 'retry_waiting',
      device_commitment: null,
      policy_key: null,
      assignment_key: null,
      device_tx_id: null,
      assignment_tx_id: null,
      error_message: null,
      created_at: '2026-08-30T00:00:00.000Z',
      updated_at: '2026-08-30T00:01:00.000Z',
    };
    const env = {
      DB: database(operation, operation.progress_token_sha256),
      SPONSOR_QUEUE: { send: vi.fn(async () => undefined) },
      SPONSOR_WALLET: {},
      PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS: '33'.repeat(32),
    } as unknown as Env;
    const ack = vi.fn();
    const retry = vi.fn();
    const message = {
      body: { kind: 'browser-device-provisioning', operationId },
      attempts: 12,
      ack,
      retry,
    } as unknown as Message<unknown>;
    sponsorMocks.sponsorWalletHealth.mockResolvedValue({
      phase: 'ready',
      spendableDustCoins: 1,
      supervisor: {
        status: 'healthy',
        walletProcessAlive: true,
        walletStatusFresh: true,
      },
    });
    containerMocks.fetch.mockResolvedValue(new Response('operator failure', { status: 500 }));

    expect(await processBrowserProvisioningQueueMessage(message, env)).toBe(true);

    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(operation).toMatchObject({
      status: 'failed',
      stage: 'failed',
      error_message: expect.stringContaining('Operator Wallet returned HTTP 500'),
    });
    const status = await handleProvisioningApi(new Request(
      `https://worker.test/api/v1/provisioning/operations/${operationId}`,
      { headers: { 'X-Provisioning-Token': progressToken } },
    ), env);
    expect(status?.status).toBe(200);
    expect(await status?.json()).toMatchObject({
      operationId,
      status: 'failed',
      stage: 'failed',
      error: expect.stringContaining('Operator Wallet returned HTTP 500'),
    });
  });
});
