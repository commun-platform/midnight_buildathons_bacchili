import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authorizeDeviceRequest,
  handleDeviceAuth,
  sessionTtlSeconds,
  sessionCanonicalMessage,
  type DeviceScope,
} from './device-auth.js';

interface ChallengeRow {
  deviceId: string;
  keyId: string;
  nonceHash: string;
  expiresAt: number;
  usedAt: number | null;
}

interface SessionRow {
  id: string;
  deviceId: string;
  projectId: string;
  keyId: string;
  tokenHash: string;
  scopesJson: string;
  issuedAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

const runtimeCrypto = crypto;

function d1Result(changes: number): D1Result {
  return {
    success: true,
    results: [],
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: changes,
      last_row_id: 0,
      changed_db: changes > 0,
      changes,
    },
  };
}

function deviceDatabase(input: {
  publicKeyJwk: JsonWebKey;
  keyId: string;
  scopes: DeviceScope[];
  challenges: Map<string, ChallengeRow>;
  sessions: Map<string, SessionRow>;
  midnightRegistered?: boolean;
  midnightEvidence?: boolean;
}): D1Database {
  const statement = (query: string): D1PreparedStatement => {
    let bindings: unknown[] = [];
    return {
      bind(...values: unknown[]) {
        bindings = values;
        return this;
      },
      async first<T>() {
        if (query.includes('FROM device_auth_keys')) {
          if (query.includes("midnight_registry_status = 'registered'")
            && input.midnightRegistered === false) return null;
          if (query.includes('midnight_registered_tx_id IS NOT NULL')
            && input.midnightEvidence === false) return null;
          if (bindings[0] !== 'edge-temp-001' || bindings[1] !== input.keyId) return null;
          return {
            device_id: 'edge-temp-001',
            project_id: 'measurement-authenticity-01',
            key_id: input.keyId,
            algorithm: 'ES256',
            public_key_jwk: JSON.stringify(input.publicKeyJwk),
            allowed_scopes_json: JSON.stringify(input.scopes),
            status: 'active',
          } as T;
        }
        if (query.includes('FROM device_auth_sessions')) {
          const session = input.sessions.get(String(bindings[0]));
          if (!session) return null;
          return {
            id: session.id,
            device_id: session.deviceId,
            project_id: session.projectId,
            key_id: session.keyId,
            token_sha256: session.tokenHash,
            scopes_json: session.scopesJson,
            issued_at: session.issuedAt,
            expires_at: session.expiresAt,
            revoked_at: session.revokedAt,
            key_status: 'active',
          } as T;
        }
        return null;
      },
      async run() {
        if (query.includes('INSERT INTO device_auth_challenges')) {
          input.challenges.set(String(bindings[0]), {
            deviceId: String(bindings[1]),
            keyId: String(bindings[2]),
            nonceHash: String(bindings[3]),
            expiresAt: Number(bindings[5]),
            usedAt: null,
          });
          return d1Result(1);
        }
        if (query.includes('UPDATE device_auth_challenges')) {
          const challenge = input.challenges.get(String(bindings[1]));
          const usedAt = Number(bindings[0]);
          if (
            challenge
            && challenge.deviceId === bindings[2]
            && challenge.keyId === bindings[3]
            && challenge.nonceHash === bindings[4]
            && challenge.usedAt === null
            && challenge.expiresAt >= usedAt
          ) {
            challenge.usedAt = usedAt;
            return d1Result(1);
          }
          return d1Result(0);
        }
        if (query.includes('INSERT INTO device_auth_sessions')) {
          input.sessions.set(String(bindings[0]), {
            id: String(bindings[0]),
            deviceId: String(bindings[1]),
            projectId: String(bindings[2]),
            keyId: String(bindings[3]),
            tokenHash: String(bindings[4]),
            scopesJson: String(bindings[5]),
            issuedAt: Number(bindings[6]),
            expiresAt: Number(bindings[7]),
            revokedAt: null,
          });
          return d1Result(1);
        }
        return d1Result(1);
      },
    } as D1PreparedStatement;
  };
  return {
    prepare: statement,
    async batch(statements: D1PreparedStatement[]) {
      return Promise.all(statements.map((item) => item.run()));
    },
  } as D1Database;
}

function base64Url(value: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

beforeEach(() => {
  vi.stubGlobal('crypto', {
    randomUUID: runtimeCrypto.randomUUID.bind(runtimeCrypto),
    getRandomValues: runtimeCrypto.getRandomValues.bind(runtimeCrypto),
    subtle: {
      digest: runtimeCrypto.subtle.digest.bind(runtimeCrypto.subtle),
      importKey: runtimeCrypto.subtle.importKey.bind(runtimeCrypto.subtle),
      verify: runtimeCrypto.subtle.verify.bind(runtimeCrypto.subtle),
      timingSafeEqual(left: ArrayBuffer, right: ArrayBufferView) {
        const leftBytes = new Uint8Array(left);
        const rightBytes = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
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
});

describe('device challenge and opaque D1 session authentication', () => {
  it('does not issue a Session from a P-256 D1 key before Midnight registration', async () => {
    const env = Object.assign({} as Env, {
      DB: deviceDatabase({
        publicKeyJwk: { kty: 'EC', crv: 'P-256', x: 'unused', y: 'unused' },
        keyId: 'd1-only-key',
        scopes: ['measurement:write'],
        challenges: new Map(),
        sessions: new Map(),
        midnightRegistered: false,
      }),
      AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
    });
    const result = await handleDeviceAuth(new Request('https://worker.test/auth/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'edge-temp-001', keyId: 'd1-only-key' }),
    }), env);
    expect(result?.status).toBe(401);
  });

  it('does not issue a Session from a forged registered status without Midnight evidence', async () => {
    const env = Object.assign({} as Env, {
      DB: deviceDatabase({
        publicKeyJwk: { kty: 'EC', crv: 'P-256', x: 'unused', y: 'unused' },
        keyId: 'status-only-key',
        scopes: ['measurement:write'],
        challenges: new Map(),
        sessions: new Map(),
        midnightEvidence: false,
      }),
      AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
    });
    const result = await handleDeviceAuth(new Request('https://worker.test/auth/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'edge-temp-001', keyId: 'status-only-key' }),
    }), env);
    expect(result?.status).toBe(401);
  });

  it('verifies P-256 identity, stores only a token hash, and consumes the challenge once', async () => {
    const keyPair = await runtimeCrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    ) as CryptoKeyPair;
    const publicKeyJwk = await runtimeCrypto.subtle.exportKey('jwk', keyPair.publicKey) as JsonWebKey;
    delete publicKeyJwk.key_ops;
    delete publicKeyJwk.ext;
    const keyId = 'test-device-key-id';
    const scopes: DeviceScope[] = ['measurement:write', 'proof:generate'];
    const challenges = new Map<string, ChallengeRow>();
    const sessions = new Map<string, SessionRow>();
    const env = Object.assign({} as Env, {
      DB: deviceDatabase({ publicKeyJwk, keyId, scopes, challenges, sessions }),
      AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
    });

    const challengeResponse = await handleDeviceAuth(new Request(
      'https://worker.test/auth/challenge',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.10' },
        body: JSON.stringify({ deviceId: 'edge-temp-001', keyId }),
      },
    ), env);
    expect(challengeResponse?.status).toBe(200);
    const challenge = await challengeResponse?.json() as {
      challengeId: string;
      nonce: string;
      canonicalization: string;
      allowedScopes: DeviceScope[];
    };
    expect(challenge.canonicalization).toBe('vsp-device-session-v2');
    expect(challenge.allowedScopes).toEqual(scopes);
    const timestamp = new Date().toISOString();
    const requestedScopes: DeviceScope[] = ['measurement:write'];
    const signature = await runtimeCrypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      keyPair.privateKey,
      new TextEncoder().encode(sessionCanonicalMessage({
        deviceId: 'edge-temp-001',
        keyId,
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        timestamp,
        requestedScopes,
      })),
    );
    const sessionBody = {
      deviceId: 'edge-temp-001',
      keyId,
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      timestamp,
      requestedScopes,
      signature: base64Url(signature),
    };
    const sessionResponse = await handleDeviceAuth(new Request(
      'https://worker.test/auth/session',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.10' },
        body: JSON.stringify(sessionBody),
      },
    ), env);
    expect(sessionResponse?.status).toBe(200);
    const session = await sessionResponse?.json() as {
      accessToken: string;
      sessionId: string;
      scope: DeviceScope[];
    };
    expect(session.scope).toEqual(requestedScopes);
    expect(session.accessToken.startsWith(`${session.sessionId}.`)).toBe(true);
    expect(session.accessToken.split('.')).toHaveLength(2);
    const stored = sessions.get(session.sessionId);
    expect(sessionTtlSeconds).toBe(24 * 60 * 60);
    expect((stored?.expiresAt ?? 0) - (stored?.issuedAt ?? 0)).toBe(sessionTtlSeconds);
    expect(stored?.tokenHash).not.toBe(session.accessToken);
    expect(stored?.tokenHash).toMatch(/^[A-Za-z\d_-]{43}$/u);

    const authorization = await authorizeDeviceRequest(new Request(
      'https://worker.test/api/v1/measurement-windows',
      { headers: { Authorization: `Bearer ${session.accessToken}` } },
    ), env, 'measurement:write');
    expect(authorization.ok).toBe(true);
    if (authorization.ok) {
      expect(authorization.principal.deviceId).toBe('edge-temp-001');
      expect(authorization.principal.projectId).toBe('measurement-authenticity-01');
    }

    if (stored) stored.revokedAt = Math.floor(Date.now() / 1000);
    const revoked = await authorizeDeviceRequest(new Request(
      'https://worker.test/api/v1/measurement-windows',
      { headers: { Authorization: `Bearer ${session.accessToken}` } },
    ), env, 'measurement:write');
    expect(revoked.ok).toBe(false);
    if (!revoked.ok) expect(revoked.response.status).toBe(401);

    const replay = await handleDeviceAuth(new Request(
      'https://worker.test/auth/session',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.10' },
        body: JSON.stringify(sessionBody),
      },
    ), env);
    expect(replay?.status).toBe(401);
  });

  it('does not expose a registration endpoint', async () => {
    const response = await handleDeviceAuth(new Request(
      'https://worker.test/auth/register',
      { method: 'POST' },
    ), {} as Env);
    expect(response?.status).toBe(404);
  });
});
