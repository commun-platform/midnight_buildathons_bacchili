import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  enrollmentFor,
  loadDeviceIdentity,
  loadOrCreateDeviceIdentity,
  sessionCanonicalMessage,
} from './device-identity.js';

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('vsp-device-identities-v1');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Device Identity database deletion was blocked'));
  });
});

describe('browser Device Identity', () => {
  it('stores a non-extractable P-256 key and returns public-only enrollment data', async () => {
    const identity = await loadOrCreateDeviceIdentity('browser-device-001', 'measurement-authenticity-01');
    const enrollment = enrollmentFor(identity);

    expect(identity.privateKey.extractable).toBe(false);
    expect(identity.privateKey.algorithm).toMatchObject({ name: 'ECDSA', namedCurve: 'P-256' });
    expect(identity.deviceSecretHex).toMatch(/^(?:[0-9a-f]{2}){32}$/u);
    expect(enrollment.publicKeyJwk).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect(enrollment.publicKeyJwk.d).toBeUndefined();
    expect(enrollment.requestedScopes).toContain('configuration:read');
    expect(JSON.stringify(enrollment)).not.toContain(identity.deviceSecretHex);
  });

  it('reuses the same identity for the same Device ID', async () => {
    const first = await loadOrCreateDeviceIdentity('browser-device-002', 'measurement-authenticity-01');
    const second = await loadOrCreateDeviceIdentity('browser-device-002', 'measurement-authenticity-01');

    expect(second.keyId).toBe(first.keyId);
    expect(second.deviceSecretHex).toBe(first.deviceSecretHex);
  });

  it('restores an existing identity without creating a replacement', async () => {
    const created = await loadOrCreateDeviceIdentity('browser-device-restored', 'measurement-authenticity-01');
    const restored = await loadDeviceIdentity('browser-device-restored', 'measurement-authenticity-01');
    const missing = await loadDeviceIdentity('browser-device-missing', 'measurement-authenticity-01');

    expect(restored?.keyId).toBe(created.keyId);
    expect(restored?.deviceSecretHex).toBe(created.deviceSecretHex);
    expect(restored?.privateKey.extractable).toBe(false);
    expect(missing).toBeNull();
  });

  it('canonicalizes Session scopes in sorted order', () => {
    const message = sessionCanonicalMessage({
      deviceId: 'browser-device-003',
      keyId: 'key-1',
      challengeId: 'challenge-1',
      nonce: 'nonce-1',
      timestamp: '2026-08-28T00:00:00.000Z',
      requestedScopes: ['transaction:submit', 'proof:generate'],
    });

    expect(message).toContain('proof:generate transaction:submit');
  });
});
