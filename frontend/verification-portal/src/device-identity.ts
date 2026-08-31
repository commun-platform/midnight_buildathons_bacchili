export const deviceAuthProtocol = 'vsp-device-session-v2';

export type DeviceScope =
  | 'measurement:write'
  | 'anomaly:write'
  | 'proof:request'
  | 'proof:read'
  | 'proof:generate'
  | 'transaction:submit'
  | 'configuration:read'
  | 'device:status';

const requestedScopes: DeviceScope[] = [
  'measurement:write',
  'anomaly:write',
  'proof:request',
  'proof:read',
  'proof:generate',
  'transaction:submit',
  'configuration:read',
  'device:status',
];

const databaseName = 'vsp-device-identities-v1';
const identityStoreName = 'identities';
const encoder = new TextEncoder();

export interface BrowserDeviceIdentity {
  schemaVersion: 1;
  deviceId: string;
  projectId: string;
  keyId: string;
  algorithm: 'ES256';
  createdAt: string;
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey;
  deviceSecretHex: string;
}

export interface DeviceEnrollment {
  schemaVersion: 1;
  deviceId: string;
  projectId: string;
  keyId: string;
  algorithm: 'ES256';
  createdAt: string;
  publicKeyJwk: JsonWebKey;
  requestedScopes: DeviceScope[];
}

export interface DeviceSession {
  accessToken: string;
  expiresAt: string;
  deviceId: string;
  projectId: string;
  sessionId: string;
  scope: DeviceScope[];
}

export class DeviceAuthenticationHttpError extends Error {
  constructor(
    operation: string,
    readonly status: number,
    detail: string,
  ) {
    super(`${operation} failed with HTTP ${status}: ${detail}`);
    this.name = 'DeviceAuthenticationHttpError';
  }
}

interface ChallengeResponse {
  challengeId: string;
  nonce: string;
  expiresAt: string;
  serverTime: string;
  canonicalization: string;
  allowedScopes: DeviceScope[];
}

interface SessionResponse extends DeviceSession {
  tokenType: 'Bearer';
}

const sessions = new Map<string, DeviceSession>();

function validateIdentifier(label: string, value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(normalized)) {
    throw new Error(`${label} must contain 1-160 safe identifier characters`);
  }
  return normalized;
}

function serviceUrl(value: string): URL {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !loopback) {
    throw new Error('Device authentication requires HTTPS unless the service is loopback');
  }
  return url;
}

function endpoint(base: string, pathname: string): URL {
  const url = serviceUrl(base);
  url.pathname = pathname;
  url.search = '';
  url.hash = '';
  return url;
}

function base64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(identityStoreName)) {
        request.result.createObjectStore(identityStoreName, { keyPath: 'deviceId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open Device Identity storage'));
  });
}

async function storedIdentity(deviceId: string): Promise<BrowserDeviceIdentity | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(identityStoreName, 'readonly')
        .objectStore(identityStoreName)
        .get(deviceId);
      request.onsuccess = () => resolve((request.result as BrowserDeviceIdentity | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Could not read Device Identity'));
    });
  } finally {
    database.close();
  }
}

async function storeIdentity(identity: BrowserDeviceIdentity): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(identityStoreName, 'readwrite');
      transaction.objectStore(identityStoreName).add(identity);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not store Device Identity'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Device Identity storage was aborted'));
    });
  } finally {
    database.close();
  }
}

export async function loadOrCreateDeviceIdentity(
  rawDeviceId: string,
  rawProjectId: string,
): Promise<BrowserDeviceIdentity> {
  const deviceId = validateIdentifier('deviceId', rawDeviceId);
  const projectId = validateIdentifier('projectId', rawProjectId);
  const existing = await loadDeviceIdentity(deviceId, projectId);
  if (existing) return existing;

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  );
  const [publicKeyJwk, spki] = await Promise.all([
    crypto.subtle.exportKey('jwk', keyPair.publicKey),
    crypto.subtle.exportKey('spki', keyPair.publicKey),
  ]);
  delete publicKeyJwk.key_ops;
  delete publicKeyJwk.ext;
  const identity: BrowserDeviceIdentity = {
    schemaVersion: 1,
    deviceId,
    projectId,
    keyId: base64Url(await crypto.subtle.digest('SHA-256', spki)),
    algorithm: 'ES256',
    createdAt: new Date().toISOString(),
    publicKeyJwk,
    privateKey: keyPair.privateKey,
    deviceSecretHex: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
  };
  await storeIdentity(identity);
  return identity;
}

export async function loadDeviceIdentity(
  rawDeviceId: string,
  rawProjectId: string,
): Promise<BrowserDeviceIdentity | null> {
  const deviceId = validateIdentifier('deviceId', rawDeviceId);
  const projectId = validateIdentifier('projectId', rawProjectId);
  const existing = await storedIdentity(deviceId);
  if (existing) {
    if (existing.projectId !== projectId) {
      throw new Error('Stored Device Identity belongs to a different project');
    }
    if (
      existing.schemaVersion !== 1
      || existing.deviceId !== deviceId
      || existing.algorithm !== 'ES256'
      || !existing.keyId
      || existing.privateKey?.type !== 'private'
      || existing.publicKeyJwk.kty !== 'EC'
      || existing.publicKeyJwk.crv !== 'P-256'
      || !/^(?:[0-9a-f]{2}){32}$/u.test(existing.deviceSecretHex)
    ) throw new Error('Stored Device Identity is invalid');
    return existing;
  }
  return null;
}

export function enrollmentFor(identity: BrowserDeviceIdentity): DeviceEnrollment {
  return {
    schemaVersion: identity.schemaVersion,
    deviceId: identity.deviceId,
    projectId: identity.projectId,
    keyId: identity.keyId,
    algorithm: identity.algorithm,
    createdAt: identity.createdAt,
    publicKeyJwk: identity.publicKeyJwk,
    requestedScopes: [...requestedScopes],
  };
}

export function sessionCanonicalMessage(input: {
  deviceId: string;
  keyId: string;
  challengeId: string;
  nonce: string;
  timestamp: string;
  requestedScopes: DeviceScope[];
}): string {
  return [
    'VSP-DEVICE-SESSION-V2',
    'POST',
    '/auth/session',
    input.deviceId,
    input.keyId,
    input.challengeId,
    input.nonce,
    input.timestamp,
    [...input.requestedScopes].sort().join(' '),
  ].join('\n');
}

async function jsonResponse<T>(response: Response, operation: string): Promise<T> {
  const body = await response.text();
  if (body.length > 64 * 1024) throw new Error(`${operation} response is too large`);
  if (!response.ok) {
    throw new DeviceAuthenticationHttpError(operation, response.status, body.slice(0, 240));
  }
  return JSON.parse(body) as T;
}

export async function deviceSession(
  baseUrl: string,
  identity: BrowserDeviceIdentity,
  requiredScope: DeviceScope,
): Promise<DeviceSession> {
  const cacheKey = `${baseUrl}\n${identity.keyId}`;
  const cached = sessions.get(cacheKey);
  if (
    cached
    && cached.scope.includes(requiredScope)
    && Date.parse(cached.expiresAt) > Date.now() + 60_000
  ) return cached;

  const challenge = await jsonResponse<ChallengeResponse>(await fetch(
    endpoint(baseUrl, '/auth/challenge'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: identity.deviceId, keyId: identity.keyId }),
      signal: AbortSignal.timeout(15_000),
    },
  ), 'Device challenge');
  if (
    challenge.canonicalization !== deviceAuthProtocol
    || !challenge.challengeId
    || !challenge.nonce
    || !requestedScopes.every((scope) => challenge.allowedScopes.includes(scope))
  ) throw new Error('Device challenge response is invalid');

  const timestamp = new Date().toISOString();
  const scopes = [...requestedScopes].sort();
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    identity.privateKey,
    encoder.encode(sessionCanonicalMessage({
      deviceId: identity.deviceId,
      keyId: identity.keyId,
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      timestamp,
      requestedScopes: scopes,
    })),
  );
  const issued = await jsonResponse<SessionResponse>(await fetch(
    endpoint(baseUrl, '/auth/session'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: identity.deviceId,
        keyId: identity.keyId,
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        timestamp,
        requestedScopes: scopes,
        signature: base64Url(signature),
      }),
      signal: AbortSignal.timeout(15_000),
    },
  ), 'Device session');
  if (
    issued.tokenType !== 'Bearer'
    || issued.deviceId !== identity.deviceId
    || issued.projectId !== identity.projectId
    || !issued.scope.includes(requiredScope)
  ) throw new Error('Device session response is invalid');
  sessions.set(cacheKey, issued);
  return issued;
}
