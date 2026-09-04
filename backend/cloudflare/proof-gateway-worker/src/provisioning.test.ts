import { describe, expect, it } from 'vitest';

import {
  browserProvisioningCanonicalMessage,
  handleProvisioningApi,
  isBrowserProvisioningQueueMessage,
  walletOwnsDeviceRegistration,
} from './provisioning.js';
import { deriveBrowserWalletDeviceId } from '@midnight-demo/shared/browser-provisioning';

function challengeDatabase(
  inserted: Array<{ query: string; parameters: unknown[] }>,
  walletKeySha256: string,
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
          if (query.includes('sponsor_wallet_operating_schedule')) {
            return {
              mode: 'always-on', time_zone_offset_minutes: 540,
              opens_at_minute: 120, closes_at_minute: 360,
              updated_at: '2026-09-03T00:00:00.000Z',
            } as T;
          }
          if (query.includes('FROM browser_project_sessions')) {
            return { wallet_key_sha256: walletKeySha256, expires_at: 4_102_444_800 } as T;
          }
          if (query.includes('FROM browser_wallet_projects')) {
            return { project_id: 'measurement-authenticity-01' } as T;
          }
          return null as T | null;
        },
        async all<T>() {
          return { success: true, results: [] as T[], meta: { changes: 0 } } as D1Result<T>;
        },
        async run<T>() {
          inserted.push({ query, parameters });
          return { success: true, results: [] as T[], meta: { changes: 1 } } as D1Result<T>;
        },
        async raw() { return [[]] as [string[]]; },
      } as unknown as D1PreparedStatement;
      return statement;
    },
    async batch<T>() { return [] as D1Result<T>[]; },
  } as unknown as D1Database;
}

function operationDatabase(
  operation: Record<string, unknown>,
  expectedTokenHash: string,
): D1Database {
  return {
    prepare() {
      let parameters: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          parameters = values;
          return statement;
        },
        async first<T>() {
          return (parameters[0] === operation.id && parameters[1] === expectedTokenHash
            ? operation
            : null) as T | null;
        },
        async all<T>() {
          return { success: true, results: [] as T[], meta: { changes: 0 } } as D1Result<T>;
        },
        async run<T>() {
          return { success: true, results: [] as T[], meta: { changes: 0 } } as D1Result<T>;
        },
        async raw() { return [[]] as [string[]]; },
      } as unknown as D1PreparedStatement;
      return statement;
    },
    async batch<T>() { return [] as D1Result<T>[]; },
  } as unknown as D1Database;
}

describe('Worker browser Device provisioning', () => {
  it('routes only well-formed browser provisioning queue messages', () => {
    expect(isBrowserProvisioningQueueMessage({
      kind: 'browser-device-provisioning',
      operationId: 'prv_01990a00-0000-7000-8000-000000000001',
    })).toBe(true);
    expect(isBrowserProvisioningQueueMessage({
      kind: 'sponsor-transaction',
      operationId: 'prv_01990a00-0000-7000-8000-000000000001',
    })).toBe(false);
    expect(isBrowserProvisioningQueueMessage({
      kind: 'browser-device-provisioning',
      operationId: '../invalid',
    })).toBe(false);
  });

  it('does not let a newly connected Wallet inherit another Wallet registration', () => {
    const existing = {
      wallet_key_sha256: '11'.repeat(32),
      device_id: 'review-device-001',
      status: 'registered' as const,
      updated_at: '2026-08-30T00:00:00.000Z',
    };
    expect(walletOwnsDeviceRegistration(existing, '11'.repeat(32), 'review-device-001')).toBe(true);
    expect(walletOwnsDeviceRegistration(existing, '22'.repeat(32), 'review-device-001')).toBe(false);
    expect(walletOwnsDeviceRegistration(existing, '11'.repeat(32), 'review-device-002')).toBe(false);
    expect(walletOwnsDeviceRegistration(null, '11'.repeat(32), 'review-device-001')).toBe(false);
  });

  it('uses a stable wallet-signed canonical message', () => {
    expect(browserProvisioningCanonicalMessage({
      deviceId: 'review-device-001',
      keyId: 'p256-key-id',
      deviceAuthority: 'ab'.repeat(32),
      policyId: 'temperature-v1',
      challengeId: 'challenge-001',
      nonce: 'nonce-001',
      timestamp: '2026-08-30T00:00:00.000Z',
    })).toBe([
      'VSP-BROWSER-PROVISIONING-V1',
      'POST',
      '/api/v1/provisioning/devices',
      'review-device-001',
      'p256-key-id',
      'ab'.repeat(32),
      'temperature-v1',
      'challenge-001',
      'nonce-001',
      '2026-08-30T00:00:00.000Z',
    ].join('\n'));
  });

  it('stores a short-lived one-time challenge without invoking a Container', async () => {
    const inserted: Array<{ query: string; parameters: unknown[] }> = [];
    const walletKeySha256 = '11'.repeat(32);
    const deviceId = await deriveBrowserWalletDeviceId(
      walletKeySha256,
      'measurement-authenticity-01',
    );
    const env = {
      DB: challengeDatabase(inserted, walletKeySha256),
      AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
    } as unknown as Env;
    const response = await handleProvisioningApi(new Request(
      'https://worker.test/api/v1/provisioning/challenge',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '192.0.2.1',
        },
        body: JSON.stringify({
          deviceId,
          projectId: 'measurement-authenticity-01',
          keyId: '-f88kSuPEq4rh3PUHUWp2CmVgwhQ7pHEnqhGsB2Xtgk',
        }),
      },
    ), env);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      challengeId: expect.any(String),
      nonce: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.query).toContain('INSERT INTO browser_provisioning_challenges');
    expect(inserted[0]?.parameters).toHaveLength(7);
  });

  it('requires the unguessable progress token to read registration progress', async () => {
    const token = 'progress-token';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const tokenHash = Array.from(
      new Uint8Array(digest),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    const operation = {
      id: 'prv_01990a00-0000-7000-8000-000000000001',
      progress_token_sha256: tokenHash,
      wallet_key_sha256: '11'.repeat(32),
      device_id: 'review-device-001',
      project_id: 'measurement-authenticity-01',
      policy_id: 'temperature-v1',
      assignment_id: 'review-device-001-temperature-v1-wave1',
      enrollment_json: '{}',
      device_authority: '22'.repeat(32),
      browser_authorization_json: '{}',
      status: 'running',
      stage: 'device_zkp_generating',
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
      DB: operationDatabase(operation, tokenHash),
      PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS: '33'.repeat(32),
    } as unknown as Env;
    const pathname = `/api/v1/provisioning/operations/${operation.id}`;
    const accepted = await handleProvisioningApi(new Request(`https://worker.test${pathname}`, {
      headers: { 'X-Provisioning-Token': token },
    }), env);
    expect(accepted?.status).toBe(200);
    expect(await accepted?.json()).toMatchObject({
      operationId: operation.id,
      status: 'running',
      stage: 'device_zkp_generating',
    });
    const rejected = await handleProvisioningApi(new Request(`https://worker.test${pathname}`, {
      headers: { 'X-Provisioning-Token': 'wrong-token' },
    }), env);
    expect(rejected?.status).toBe(404);
  });

  it('rejects incomplete registration before any Sponsor Wallet operation', async () => {
    const response = await handleProvisioningApi(new Request(
      'https://worker.test/api/v1/provisioning/devices',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    ), {
      DB: challengeDatabase([], '11'.repeat(32)),
    } as unknown as Env);
    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({ error: 'enrollment is required' });
  });
});
