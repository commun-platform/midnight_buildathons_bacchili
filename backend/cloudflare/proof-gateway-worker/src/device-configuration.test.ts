import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleApi } from './api.js';

const runtimeCrypto = crypto;
const sessionId = '12345678-1234-1234-1234-123456789abc';
const token = `${sessionId}.${'A'.repeat(43)}`;

function tokenHash(value: string): string {
  let binary = '';
  for (const byte of new Uint8Array(requireDigest(value))) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function requireDigest(value: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(value);
  const output = new Uint8Array(32);
  // This test uses a deterministic digest supplied by the stub below. The
  // production path uses Web Crypto SHA-256.
  for (let index = 0; index < bytes.length; index += 1) {
    const outputIndex = index % output.length;
    output[outputIndex] = (output[outputIndex] ?? 0) ^ (bytes[index] ?? 0);
  }
  return output.buffer.slice(
    output.byteOffset,
    output.byteOffset + output.byteLength,
  ) as ArrayBuffer;
}

interface TestDatabaseOptions {
  scopes?: string[];
  contractAddress?: string;
}

function database(options: TestDatabaseOptions = {}): {
  db: D1Database;
  configurationBindings: unknown[][];
  historyBindings: unknown[][];
} {
  const configurationBindings: unknown[][] = [];
  const historyBindings: unknown[][] = [];
  const contractAddress = options.contractAddress ?? 'ab'.repeat(32);
  const db = {
    prepare(query: string) {
      let bindings: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bindings = values;
          return statement;
        },
        async first<T>() {
          if (query.includes('FROM device_auth_sessions')) {
            if (bindings[0] !== sessionId) return null;
            return {
              id: sessionId,
              device_id: 'edge-temp-001',
              project_id: 'measurement-authenticity-01',
              key_id: 'device-key',
              token_sha256: tokenHash(token),
              scopes_json: JSON.stringify(options.scopes ?? ['configuration:read']),
              issued_at: Math.floor(Date.now() / 1000) - 60,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              revoked_at: null,
              key_status: 'active',
            } as T;
          }
          if (query.includes('d.operation_configuration_version')) {
            configurationBindings.push(bindings);
            return {
              device_id: 'edge-temp-001',
              project_id: 'measurement-authenticity-01',
              sensor_type: 'temperature',
              unit: '°C',
              midnight_registration_version: 1,
              midnight_contract_address: contractAddress,
              midnight_registered_tx_id: 'device-registration-tx',
              midnight_authority_tx_id: 'device-authority-tx',
              operation_configuration_version: 4,
              operation_configuration_updated_at: '2026-08-28T00:00:00.000Z',
              assignment_id: 'edge-temp-001-temperature-v1-wave1',
              assignment_key: 'ef'.repeat(32),
              valid_from: null,
              valid_until: null,
              assignment_version: 1,
              time_zone_offset_minutes: 540,
              local_day_start_hour: 6,
              utc_day_start_minute: 1260,
              device_commitment: '01'.repeat(32),
              assignment_registered_tx_id: 'assignment-registration-tx',
              policy_id: 'temperature-v1',
              policy_key: 'cd'.repeat(32),
              mode: 'closed-range',
              minimum: 10,
              maximum: 35,
              value_scale: 100,
              sensor_type_code: 1,
              unit_code: 1,
              policy_version: 1,
              policy_registered_tx_id: 'policy-registration-tx',
              provisioning_wallet_key_sha256: '98'.repeat(32),
            } as T;
          }
          return null;
        },
        async all<T>() {
          if (query.includes('FROM measurement_windows') || query.includes('FROM daily_proof_jobs')) {
            historyBindings.push(bindings);
          }
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
  return { db, configurationBindings, historyBindings };
}

function environment(db: D1Database, workerAddress = 'ab'.repeat(32)): Env {
  return {
    DB: db,
    API_RATE_LIMITER: { limit: async () => ({ success: true }) },
    PUBLIC_MIDNIGHT_NETWORK: 'Midnight Preprod',
    PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS: workerAddress,
  } as unknown as Env;
}

beforeEach(() => {
  vi.stubGlobal('crypto', {
    subtle: {
      digest: async (_algorithm: string, value: BufferSource) => {
        const bytes = ArrayBuffer.isView(value)
          ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
          : new Uint8Array(value);
        return requireDigest(new TextDecoder().decode(bytes));
      },
      timingSafeEqual(left: ArrayBuffer, right: ArrayBufferView) {
        const first = new Uint8Array(left);
        const second = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
        if (first.length !== second.length) return false;
        return first.every((value, index) => value === second[index]);
      },
    },
    randomUUID: runtimeCrypto.randomUUID.bind(runtimeCrypto),
    getRandomValues: runtimeCrypto.getRandomValues.bind(runtimeCrypto),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authenticated Device operation configuration', () => {
  it('returns only configuration bound to the authenticated Device and Project', async () => {
    const store = database();
    const result = await handleApi(new Request(
      'https://worker.test/api/v1/device/configuration',
      { headers: { Authorization: `Bearer ${token}` } },
    ), environment(store.db));
    expect(result?.status).toBe(200);
    expect(store.configurationBindings[0]?.slice(0, 2)).toEqual([
      'edge-temp-001',
      'measurement-authenticity-01',
    ]);
    expect(await result?.json()).toMatchObject({
      schemaVersion: 2,
      configurationVersion: 4,
      device: {
        deviceId: 'edge-temp-001',
        projectId: 'measurement-authenticity-01',
        commitment: '01'.repeat(32),
        provisioningWalletKeySha256: '98'.repeat(32),
      },
      midnight: {
        network: 'preprod',
        contractAddress: 'ab'.repeat(32),
        contractSchemaVersion: 4,
      },
      policy: { id: 'temperature-v1', minimum: 10, maximum: 35 },
      assignment: {
        id: 'edge-temp-001-temperature-v1-wave1',
        timeZoneOffsetMinutes: 540,
        localDayStartHour: 6,
        utcDayStartMinute: 1260,
      },
    });
  });

  it('requires the dedicated configuration scope', async () => {
    const store = database({ scopes: ['device:status'] });
    const result = await handleApi(new Request(
      'https://worker.test/api/v1/device/configuration',
      { headers: { Authorization: `Bearer ${token}` } },
    ), environment(store.db));
    expect(result?.status).toBe(403);
  });

  it('returns only daily history owned by the authenticated Device', async () => {
    const store = database({ scopes: ['device:status'] });
    const result = await handleApi(new Request(
      'https://worker.test/api/v1/device/history',
      { headers: { Authorization: `Bearer ${token}` } },
    ), environment(store.db));
    expect(result?.status).toBe(200);
    expect(store.historyBindings).toEqual([
      ['edge-temp-001', 'measurement-authenticity-01'],
      ['edge-temp-001', 'measurement-authenticity-01'],
    ]);
    expect(await result?.json()).toEqual({ windows: [], proofJobs: [] });
  });

  it('refuses a D1 address that differs from the Worker deployment setting', async () => {
    const store = database({ contractAddress: '12'.repeat(32) });
    const result = await handleApi(new Request(
      'https://worker.test/api/v1/device/configuration',
      { headers: { Authorization: `Bearer ${token}` } },
    ), environment(store.db));
    expect(result?.status).toBe(409);
  });
});
