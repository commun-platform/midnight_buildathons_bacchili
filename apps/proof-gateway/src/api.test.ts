import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleApi, scheduleDailyAttestations } from './api.js';

type StatementBehavior = {
  first?: (bindings: unknown[]) => unknown | Promise<unknown>;
  all?: (bindings: unknown[]) => unknown[] | Promise<unknown[]>;
  run?: (bindings: unknown[]) => number | Promise<number>;
};

type StatementRecord = {
  query: string;
  bindings: unknown[];
};

const statementRecords = new WeakMap<D1PreparedStatement, StatementRecord>();
const runtimeCrypto = crypto;

function d1Result<T>(results: T[], changes = 0): D1Result<T> {
  return {
    success: true,
    results,
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: results.length,
      rows_written: changes,
      last_row_id: 0,
      changed_db: changes > 0,
      changes,
    },
  };
}

function preparedStatement(query: string, behavior: StatementBehavior = {}): D1PreparedStatement {
  let bindings: unknown[] = [];
  const statement = {
    bind(...values: unknown[]) {
      bindings = values;
      const record = statementRecords.get(statement as D1PreparedStatement);
      if (record) record.bindings = values;
      return statement;
    },
    async first<T = Record<string, unknown>>(): Promise<T | null> {
      const value = behavior.first ? await behavior.first(bindings) : null;
      return value as T | null;
    },
    async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
      const values = behavior.all ? await behavior.all(bindings) : [];
      return d1Result(values as T[]);
    },
    async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
      const changes = behavior.run ? await behavior.run(bindings) : 0;
      return d1Result<T>([], changes);
    },
    async raw(): Promise<unknown[]> {
      return [];
    },
  } as D1PreparedStatement;
  statementRecords.set(statement, { query, bindings });
  return statement;
}

function database(
  resolve: (query: string) => StatementBehavior = () => ({}),
  onBatch: (records: StatementRecord[]) => void = () => undefined,
): D1Database {
  return {
    prepare(query: string) {
      return preparedStatement(query, resolve(query));
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      onBatch(statements.map((statement) => statementRecords.get(statement) ?? {
        query: '',
        bindings: [],
      }));
      return statements.map(() => d1Result<T>([], 1));
    },
  } as D1Database;
}

function unavailableDatabase(): D1Database {
  return database(() => {
    throw new Error('D1 unavailable in test');
  });
}

function env(db: D1Database, secrets: Partial<Env> = {}): Env {
  return {
    DB: db,
    DEMO_PROJECT_ID: 'measurement-authenticity-01',
    ...secrets,
  } as Env;
}

async function api(path: string, testEnv = env(unavailableDatabase())): Promise<Response> {
  const response = await handleApi(new Request(`https://worker.test${path}`), testEnv);
  if (!response) throw new Error(`No API response for ${path}`);
  return response;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('crypto', {
    randomUUID: () => '00000000-0000-4000-8000-000000000001',
    subtle: {
      digest: runtimeCrypto.subtle.digest.bind(runtimeCrypto.subtle),
      timingSafeEqual(left: ArrayBuffer, right: ArrayBuffer) {
        const leftBytes = new Uint8Array(left);
        const rightBytes = new Uint8Array(right);
        if (leftBytes.length !== rightBytes.length) return false;
        let difference = 0;
        for (let index = 0; index < leftBytes.length; index += 1) {
          difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
        }
        return difference === 0;
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('public project API', () => {
  it('does not substitute synthetic data when D1 is unavailable', async () => {
    const response = await api('/api/v1/projects/measurement-authenticity-01/summary');
    const body = await response.json() as { error: string };

    expect(response.status).toBe(503);
    expect(body.error).toBe('Project database is unavailable');
  });

  it('returns one localized temperature sensor without generated readings', async () => {
    const db = database((query) => {
      if (query.includes('FROM projects WHERE')) {
        return { first: () => ({
          id: 'measurement-authenticity-01',
          name: 'Measurement Data Authenticity',
          name_ja: '計測データ真贋性証明',
          organization: 'Measurement Environment',
          organization_ja: '計測環境',
          timezone: 'Asia/Tokyo',
          expected_interval_minutes: 1,
        }) };
      }
      if (query.includes('FROM devices WHERE')) {
        return { all: () => [{
          id: 'edge-temp-001',
          project_id: 'measurement-authenticity-01',
          name: 'Temperature Sensor',
          name_ja: '温度センサー',
          device_type: 'Edge Device',
          device_type_ja: 'Edge Device',
          sensor_type: 'temperature',
          unit: '°C',
          expected_interval_minutes: 1,
          last_seen_at: null,
        }] };
      }
      if (query.includes('COUNT(*) AS received_count')) {
        return { first: () => ({ received_count: 0, outlier_count: 0 }) };
      }
      return {};
    });
    const response = await api(
      '/api/v1/projects/measurement-authenticity-01/summary',
      env(db),
    );
    const body = await response.json() as {
      source: string;
      project: { name: string; nameJa: string };
      latestReadings: unknown[];
      devices: Array<{ name: string; nameJa: string; sensorType: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.source).toBe('d1');
    expect(body.project.name).toBe('Measurement Data Authenticity');
    expect(body.project.nameJa).toBe('計測データ真贋性証明');
    expect(body.latestReadings).toEqual([]);
    expect(body.devices).toEqual([expect.objectContaining({
      name: 'Temperature Sensor',
      nameJa: '温度センサー',
      sensorType: 'temperature',
    })]);
  });

  it('returns redacted public verification data', async () => {
    const db = database((query) => query.includes('FROM attestations WHERE id') ? {
      first: () => ({
        id: 'att-temperature-2026-08-25',
        project_id: 'measurement-authenticity-01',
        period_date: '2026-08-25',
        status: 'confirmed',
        sample_count: 8,
        expected_count: 8,
        missing_count: 0,
        outlier_count: 0,
        merkle_root: 'merkle-root',
        device_commitment: 'device-commitment',
        register_tx_id: 'register-tx',
        register_tx_hash: '0xregister-hash',
        register_block_height: '100',
        verify_tx_id: 'verify-tx',
        verify_tx_hash: '0xverify-hash',
        verify_block_height: '101',
        verification_result: 1,
        error_message: null,
        created_at: '2026-08-26T04:16:00.000Z',
        updated_at: '2026-08-26T04:17:00.000Z',
      }),
    } : {});
    const contractAddress = 'a'.repeat(64);
    const response = await api('/api/v1/attestations/att-temperature-2026-08-25', env(db, {
      PUBLIC_MIDNIGHT_NETWORK: 'Midnight Testnet',
      PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS: contractAddress,
    }));
    const body = await response.json() as {
      attestation: Record<string, unknown> & {
        registerTx: { txId: string; txHash: string };
        verifyTx: { txId: string; txHash: string };
        verificationResult: boolean;
      };
      claim: string;
      claimJa: string;
      privacy: Record<string, string | string[]>;
      checks: Record<string, boolean>;
      network: string;
      contractAddress: string | null;
    };

    expect(response.status).toBe(200);
    expect(body.attestation.verificationResult).toBe(true);
    expect(body.attestation.registerTx).toEqual(expect.objectContaining({
      txId: 'register-tx',
      txHash: '0xregister-hash',
    }));
    expect(body.attestation.verifyTx).toEqual(expect.objectContaining({
      txId: 'verify-tx',
      txHash: '0xverify-hash',
    }));
    expect(body.checks).toEqual({
      datasetRegistered: true,
      merkleInclusion: true,
      privateRange: true,
      midnightConfirmed: true,
    });
    expect(body.claim).toContain('selected private sensor value');
    expect(body.claimJa).toContain('選択センサー値');
    expect(body.network).toBe('Midnight Testnet');
    expect(body.contractAddress).toBe(contractAddress);
    expect(body.privacy.rawSensorValues).toBe('private');
    expect(body.attestation).not.toHaveProperty('value');
    expect(body.attestation).not.toHaveProperty('thresholdMin');
    expect(body.attestation).not.toHaveProperty('thresholdMax');
    expect(body.attestation).not.toHaveProperty('nonce');
    expect(body.attestation).not.toHaveProperty('merklePath');
  });
});

describe('protected write API', () => {
  it('distinguishes missing configuration from an invalid token', async () => {
    const unconfigured = await handleApi(new Request('https://worker.test/api/v1/readings', {
      method: 'POST',
    }), env(unavailableDatabase()));
    const unauthorized = await handleApi(new Request('https://worker.test/api/v1/readings', {
      method: 'POST',
      headers: { Authorization: 'Bearer incorrect' },
    }), env(unavailableDatabase(), { INGEST_API_TOKEN: 'ingest-secret' }));

    expect(unconfigured?.status).toBe(503);
    expect(unauthorized?.status).toBe(401);
  });

  it('accepts an authenticated reading and calculates its outlier state', async () => {
    const batches: StatementRecord[][] = [];
    const db = database((query) => query.includes('SELECT d.id') ? {
      first: () => ({
        id: 'edge-temp-001',
        project_id: 'measurement-authenticity-01',
        sensor_type: 'temperature',
        unit: '°C',
        normal_min: 10,
        normal_max: 35,
        timezone: 'Asia/Tokyo',
      }),
    } : {}, (records) => batches.push(records));
    const response = await handleApi(new Request('https://worker.test/api/v1/readings', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ingest-secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId: 'measurement-authenticity-01',
        deviceId: 'edge-temp-001',
        sensorType: 'temperature',
        unit: '°C',
        value: 35.25,
        recordedAt: '2026-08-26T14:59:00+09:00',
      }),
    }), env(db, { INGEST_API_TOKEN: 'ingest-secret' }));
    const body = await response?.json() as { accepted: boolean; readingId: string; isOutlier: boolean };

    expect(response?.status).toBe(202);
    expect(body).toEqual({
      accepted: true,
      readingId: '00000000-0000-4000-8000-000000000001',
      isOutlier: true,
    });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0]?.[0]?.query).toContain('INSERT INTO readings');
    expect(batches[0]?.[0]?.bindings.at(-1)).toBe(1);
  });

  it('rejects sensor metadata that does not match the temperature device', async () => {
    const db = database((query) => query.includes('SELECT d.id') ? {
      first: () => ({
        id: 'edge-temp-001',
        project_id: 'measurement-authenticity-01',
        sensor_type: 'temperature',
        unit: '°C',
        normal_min: 10,
        normal_max: 35,
        timezone: 'Asia/Tokyo',
      }),
    } : {});
    const response = await handleApi(new Request('https://worker.test/api/v1/readings', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ingest-secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId: 'measurement-authenticity-01',
        deviceId: 'edge-temp-001',
        sensorType: 'humidity',
        unit: '%',
        value: 50,
        recordedAt: '2026-08-26T14:59:00+09:00',
      }),
    }), env(db, { INGEST_API_TOKEN: 'ingest-secret' }));

    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({
      error: 'sensorType and unit must match the registered device',
    });
  });

  it('stores transaction hashes used by Preprod Explorer links', async () => {
    let update: StatementRecord | undefined;
    const db = database((query) => query.includes('UPDATE attestations SET') ? {
      run: (bindings) => {
        update = { query, bindings };
        return 1;
      },
    } : {});
    const response = await handleApi(new Request(
      'https://worker.test/api/internal/attestations/att-temperature/result',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer agent-secret',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'confirmed',
          registerTxId: 'register-id',
          registerTxHash: '0xregister-hash',
          registerBlockHeight: '100',
          verifyTxId: 'verify-id',
          verifyTxHash: '0xverify-hash',
          verifyBlockHeight: '101',
          verificationResult: true,
        }),
      },
    ), env(db, { ATTESTATION_API_TOKEN: 'agent-secret' }));

    expect(response?.status).toBe(200);
    expect(update?.query).toContain('register_tx_hash');
    expect(update?.query).toContain('verify_tx_hash');
    expect(update?.bindings[4]).toBe('0xregister-hash');
    expect(update?.bindings[7]).toBe('0xverify-hash');
  });

  it('returns an empty 204 response when no attestation is pending', async () => {
    const db = database((query) => query.includes("status = 'pending'") ? {
      first: () => null,
    } : {});
    const response = await handleApi(new Request(
      'https://worker.test/api/internal/attestations/claim',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer agent-secret' },
      },
    ), env(db, { ATTESTATION_API_TOKEN: 'agent-secret' }));

    expect(response?.status).toBe(204);
    expect(await response?.text()).toBe('');
  });
});

describe('daily attestation scheduler', () => {
  it('creates the previous local day and associates its readings', async () => {
    const batches: StatementRecord[][] = [];
    const db = database((query) => {
      if (query.includes('FROM projects')) {
        return {
          all: () => [{
            id: 'measurement-authenticity-01',
            name: '実証プロジェクト',
            organization: '計測データ実証環境',
            timezone: 'Asia/Tokyo',
            expected_interval_minutes: 1,
          }],
        };
      }
      if (query.includes('COUNT(*) AS sample_count')) {
        return { first: () => ({ sample_count: 5, outlier_count: 1 }) };
      }
      if (query.includes('AS expected_count')) {
        return { first: () => ({ expected_count: 10 }) };
      }
      return {};
    }, (records) => batches.push(records));

    await scheduleDailyAttestations(env(db), Date.parse('2026-08-26T15:05:00.000Z'));

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0]?.[0]?.query).toContain('INSERT OR IGNORE INTO attestations');
    expect(batches[0]?.[0]?.bindings).toEqual([
      'att-measurement-authenticity-01-2026-08-26',
      'measurement-authenticity-01',
      '2026-08-26',
      5,
      10,
      5,
      1,
      '2026-08-26T15:05:00.000Z',
    ]);
    expect(batches[0]?.[1]?.query).toContain('UPDATE readings SET attestation_id');
    expect(batches[0]?.[1]?.bindings).toEqual([
      'att-measurement-authenticity-01-2026-08-26',
      'measurement-authenticity-01',
      '2026-08-26',
    ]);
  });
});
