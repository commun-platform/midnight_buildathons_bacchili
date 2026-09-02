import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  deviceAuthenticatedFetch,
  deviceAuthorizationHeaders,
  fetchDeviceOperationConfiguration,
  generateDeviceIdentity,
  loadDeviceEnrollment,
  loadDeviceIdentity,
  refreshDeviceEnrollment,
} from './index.js';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

test('device authentication has no Compact, wallet, prover, or deployment dependency', () => {
  const packageJson = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'edge-device/device-identity/package.json'),
    'utf8',
  )) as { dependencies?: Record<string, string>; scripts?: Record<string, string> };
  assert.deepEqual(Object.keys(packageJson.dependencies ?? {}), []);
  assert.equal(packageJson.scripts?.deploy, undefined);
  const source = fs.readFileSync(
    path.join(repoRoot, 'edge-device/device-identity/src/index.ts'),
    'utf8',
  );
  assert.doesNotMatch(source, /@midnight-ntwrk|wallet|Compact|wrangler/i);
});

test('reissues a cached Session that is not bound to the current service origin', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'device-auth-origin-'));
  const originalFetch = globalThis.fetch;
  try {
    const enrollment = await generateDeviceIdentity({
      deviceId: 'edge-test-001',
      projectId: 'project-test-001',
      authHome: temporary,
    });
    fs.writeFileSync(path.join(temporary, 'session.json'), `${JSON.stringify({
      schemaVersion: 1,
      deviceId: enrollment.deviceId,
      projectId: enrollment.projectId,
      keyId: enrollment.keyId,
      accessToken: 'stale-session-token',
      scope: enrollment.requestedScopes,
      sessionId: 'stale-session',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    })}\n`, { mode: 0o600 });
    const requestedPaths: string[] = [];
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      requestedPaths.push(url.pathname);
      if (url.pathname === '/auth/challenge') return Response.json({
        challengeId: 'challenge-001',
        nonce: 'nonce-001',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        serverTime: new Date().toISOString(),
        canonicalization: 'vsp-device-session-v2',
        allowedScopes: enrollment.requestedScopes,
      });
      if (url.pathname === '/auth/session') return Response.json({
        tokenType: 'Bearer',
        accessToken: 'fresh-session-token',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        deviceId: enrollment.deviceId,
        projectId: enrollment.projectId,
        scope: enrollment.requestedScopes,
        sessionId: 'fresh-session',
      });
      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    const headers = await deviceAuthorizationHeaders({
      deviceId: enrollment.deviceId,
      projectId: enrollment.projectId,
      serviceUrl: 'https://new-worker.test',
      authHome: temporary,
    }, 'configuration:read');

    assert.equal(headers.Authorization, 'Bearer fresh-session-token');
    assert.deepEqual(requestedPaths, ['/auth/challenge', '/auth/session']);
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('reissues a server-rejected cached Session once and retries the Device request', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'device-auth-rejected-'));
  const originalFetch = globalThis.fetch;
  try {
    const enrollment = await generateDeviceIdentity({
      deviceId: 'edge-test-001',
      projectId: 'project-test-001',
      authHome: temporary,
    });
    fs.writeFileSync(path.join(temporary, 'session.json'), `${JSON.stringify({
      schemaVersion: 1,
      deviceId: enrollment.deviceId,
      projectId: enrollment.projectId,
      keyId: enrollment.keyId,
      serviceOrigin: 'https://worker.test',
      accessToken: 'rejected-session-token',
      scope: enrollment.requestedScopes,
      sessionId: 'rejected-session',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    })}\n`, { mode: 0o600 });
    const requests: Array<{ path: string; authorization: string | null }> = [];
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      const authorization = new Headers(init?.headers).get('Authorization');
      requests.push({ path: url.pathname, authorization });
      if (url.pathname === '/resource' && authorization === 'Bearer rejected-session-token') {
        return Response.json({ error: 'expired' }, { status: 401 });
      }
      if (url.pathname === '/auth/challenge') return Response.json({
        challengeId: 'challenge-001',
        nonce: 'nonce-001',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        serverTime: new Date().toISOString(),
        canonicalization: 'vsp-device-session-v2',
        allowedScopes: enrollment.requestedScopes,
      });
      if (url.pathname === '/auth/session') return Response.json({
        tokenType: 'Bearer',
        accessToken: 'fresh-session-token',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        deviceId: enrollment.deviceId,
        projectId: enrollment.projectId,
        scope: enrollment.requestedScopes,
        sessionId: 'fresh-session',
      });
      if (url.pathname === '/resource' && authorization === 'Bearer fresh-session-token') {
        return Response.json({ ok: true });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    const response = await deviceAuthenticatedFetch({
      deviceId: enrollment.deviceId,
      projectId: enrollment.projectId,
      serviceUrl: 'https://worker.test',
      authHome: temporary,
    }, 'configuration:read', new URL('https://worker.test/resource'));

    assert.equal(response.status, 200);
    assert.deepEqual(requests.map(({ path: requestPath }) => requestPath), [
      '/resource',
      '/auth/challenge',
      '/auth/session',
      '/resource',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('refreshes public enrollment scopes without rotating the Device key', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'device-auth-refresh-'));
  try {
    const original = await generateDeviceIdentity({
      deviceId: 'edge-test-001',
      projectId: 'project-test-001',
      authHome: temporary,
    });
    const privateKeyPath = path.join(temporary, 'device-private-key.pk8');
    const privateKeyBefore = fs.readFileSync(privateKeyPath);
    fs.writeFileSync(path.join(temporary, 'enrollment.json'), `${JSON.stringify({
      ...original,
      requestedScopes: original.requestedScopes.filter((scope) => scope !== 'configuration:read'),
    }, null, 2)}\n`, { mode: 0o600 });

    const refreshed = refreshDeviceEnrollment({
      deviceId: 'edge-test-001',
      projectId: 'project-test-001',
      authHome: temporary,
    });

    assert.equal(refreshed.keyId, original.keyId);
    assert.equal(refreshed.publicKeyJwk.d, undefined);
    assert.ok(refreshed.requestedScopes.includes('configuration:read'));
    assert.deepEqual(fs.readFileSync(privateKeyPath), privateKeyBefore);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('generates a device-only P-256 identity and public enrollment bundle', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'device-auth-'));
  try {
    const enrollment = await generateDeviceIdentity({
      deviceId: 'edge-test-001',
      projectId: 'project-test-001',
      authHome: temporary,
    });
    const identity = loadDeviceIdentity({
      deviceId: 'edge-test-001',
      projectId: 'project-test-001',
      authHome: temporary,
    });
    assert.equal(identity.keyId, enrollment.keyId);
    assert.equal(enrollment.algorithm, 'ES256');
    assert.equal(enrollment.publicKeyJwk.crv, 'P-256');
    assert.equal(enrollment.publicKeyJwk.d, undefined);
    assert.equal(loadDeviceEnrollment(temporary).keyId, enrollment.keyId);
    assert.equal(fs.statSync(path.join(temporary, 'device-private-key.pk8')).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.join(temporary, 'identity.json')).mode & 0o777, 0o600);
    await assert.rejects(
      generateDeviceIdentity({
        deviceId: 'edge-test-001',
        projectId: 'project-test-001',
        authHome: temporary,
      }),
      /already exists/,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('fetches configuration with a reusable Device Session and rejects another Device', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'device-config-fetch-'));
  const originalFetch = globalThis.fetch;
  try {
    const enrollment = await generateDeviceIdentity({
      deviceId: 'edge-test-001',
      projectId: 'project-test-001',
      authHome: temporary,
    });
    fs.writeFileSync(path.join(temporary, 'session.json'), `${JSON.stringify({
      schemaVersion: 1,
      deviceId: 'edge-test-001',
      projectId: 'project-test-001',
      keyId: enrollment.keyId,
      serviceOrigin: 'https://worker.test',
      accessToken: 'reusable-session-token',
      scope: ['configuration:read'],
      sessionId: 'session-001',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    })}\n`, { mode: 0o600 });
    let requestedUrl = '';
    let authorization = '';
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      authorization = new Headers(init?.headers).get('Authorization') ?? '';
      return Response.json({
        schemaVersion: 2,
        configurationVersion: 1,
        updatedAt: '2026-08-28T00:00:00.000Z',
        device: {
          deviceId: 'edge-test-001', projectId: 'project-test-001',
          sensorType: 'temperature', unit: '°C',
        },
        midnight: {
          network: 'preprod', contractAddress: 'ab'.repeat(32),
          contractSchemaVersion: 4, registrationVersion: 1,
        },
        policy: {
          id: 'temperature-v1', key: 'cd'.repeat(32), mode: 'closed-range',
          minimum: 10, maximum: 35, valueScale: 100,
          sensorTypeCode: 1, unitCode: 1, version: 1,
        },
        assignment: {
          id: 'edge-test-001-temperature-v1', key: 'ef'.repeat(32), version: 1,
          timeZoneOffsetMinutes: 540, localDayStartHour: 6, utcDayStartMinute: 1260,
          validFrom: null, validUntil: null,
        },
        evidence: {
          deviceRegisteredTxId: 'device-tx', deviceAuthorityTxId: 'authority-tx',
          policyRegisteredTxId: 'policy-tx', assignmentRegisteredTxId: 'assignment-tx',
        },
      });
    };
    const fetched = await fetchDeviceOperationConfiguration({
      deviceId: 'edge-test-001',
      projectId: 'project-test-001',
      serviceUrl: 'https://worker.test/proof',
      authHome: temporary,
    });
    assert.equal(fetched.midnight.contractAddress, 'ab'.repeat(32));
    assert.equal(requestedUrl, 'https://worker.test/api/v1/device/configuration');
    assert.equal(authorization, 'Bearer reusable-session-token');

    globalThis.fetch = async () => Response.json({
      ...fetched,
      device: { ...fetched.device, deviceId: 'another-device' },
    });
    await assert.rejects(
      fetchDeviceOperationConfiguration({
        deviceId: 'edge-test-001',
        projectId: 'project-test-001',
        serviceUrl: 'https://worker.test/proof',
        authHome: temporary,
      }),
      /another Device/u,
    );
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
