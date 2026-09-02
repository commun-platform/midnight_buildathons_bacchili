import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

const defaultScopes: DeviceScope[] = [
  'measurement:write',
  'anomaly:write',
  'proof:request',
  'proof:read',
  'proof:generate',
  'transaction:submit',
  'configuration:read',
  'device:status',
];
const encoder = new TextEncoder();

export const defaultDeviceHome = path.join(
  os.homedir(),
  '.midnight',
  'midnight-cloudflare-demo',
);

export interface DeviceIdentity {
  schemaVersion: 1;
  deviceId: string;
  projectId: string;
  keyId: string;
  algorithm: 'ES256';
  createdAt: string;
}

export interface DeviceEnrollment extends DeviceIdentity {
  publicKeyJwk: JsonWebKey;
  requestedScopes: DeviceScope[];
}

export interface DeviceAuthConfig {
  deviceId: string;
  projectId: string;
  serviceUrl: string;
  authHome?: string;
}

export interface DeviceOperationConfiguration {
  schemaVersion: 2;
  configurationVersion: number;
  updatedAt: string;
  device: {
    deviceId: string;
    projectId: string;
    sensorType: string;
    unit: string;
  };
  midnight: {
    network: 'preview' | 'preprod';
    contractAddress: string;
    contractSchemaVersion: 4;
    registrationVersion: number;
  };
  policy: {
    id: string;
    key: string;
    mode: 'closed-range' | 'upper-bound' | 'lower-bound';
    minimum: number | null;
    maximum: number | null;
    valueScale: number;
    sensorTypeCode: number;
    unitCode: number;
    version: number;
  };
  assignment: {
    id: string;
    key: string;
    version: number;
    timeZoneOffsetMinutes: number;
    localDayStartHour: number;
    utcDayStartMinute: number;
    validFrom: string | null;
    validUntil: string | null;
  };
  evidence: {
    deviceRegisteredTxId: string;
    deviceAuthorityTxId: string;
    policyRegisteredTxId: string;
    assignmentRegisteredTxId: string;
  };
}

interface StoredSession {
  schemaVersion: 1;
  deviceId: string;
  projectId: string;
  keyId: string;
  serviceOrigin: string;
  accessToken: string;
  scope: DeviceScope[];
  sessionId: string;
  expiresAt: string;
}

interface ChallengeResponse {
  challengeId: string;
  nonce: string;
  expiresAt: string;
  serverTime: string;
  canonicalization: string;
  allowedScopes: DeviceScope[];
}

interface SessionResponse {
  tokenType: string;
  accessToken: string;
  expiresAt: string;
  deviceId: string;
  projectId: string;
  scope: DeviceScope[];
  sessionId: string;
}

function base64Url(value: ArrayBuffer | Uint8Array): string {
  return Buffer.from(value instanceof Uint8Array ? value : new Uint8Array(value))
    .toString('base64url');
}

function identityDirectory(authHome = path.join(defaultDeviceHome, 'device-auth')): string {
  return path.resolve(authHome);
}

function identityPath(authHome?: string): string {
  return path.join(identityDirectory(authHome), 'identity.json');
}

function enrollmentPath(authHome?: string): string {
  return path.join(identityDirectory(authHome), 'enrollment.json');
}

function privateKeyPath(authHome?: string): string {
  return path.join(identityDirectory(authHome), 'device-private-key.pk8');
}

function sessionPath(authHome?: string): string {
  return path.join(identityDirectory(authHome), 'session.json');
}

function writeOwnerOnly(file: string, value: string | Uint8Array): void {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, value, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function validateIdentifier(name: string, value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(normalized)) {
    throw new Error(`${name} contains unsupported characters or exceeds 160 characters`);
  }
  return normalized;
}

function ensurePrivateKeyPermissions(file: string): void {
  const permissions = fs.statSync(file).mode & 0o777;
  if ((permissions & 0o077) !== 0) {
    throw new Error(`Device private key permissions are too broad: ${file}`);
  }
}

function validateIdentity(value: DeviceIdentity): DeviceIdentity {
  if (
    value.schemaVersion !== 1
    || value.algorithm !== 'ES256'
    || !value.keyId
    || !value.createdAt
  ) throw new Error('Device identity metadata is invalid');
  validateIdentifier('deviceId', value.deviceId);
  validateIdentifier('projectId', value.projectId);
  return value;
}

function validateServiceUrl(value: string): URL {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !loopback) {
    throw new Error('Device authentication requires HTTPS unless the service is loopback');
  }
  return url;
}

function authEndpoint(serviceUrl: string, pathname: string): URL {
  const url = validateServiceUrl(serviceUrl);
  url.pathname = pathname;
  url.search = '';
  url.hash = '';
  return url;
}

function serviceOrigin(serviceUrl: string): string {
  return validateServiceUrl(serviceUrl).origin;
}

async function responseJson<T>(response: Response, operation: string): Promise<T> {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${operation} failed with HTTP ${response.status}: ${body.slice(0, 240)}`);
  }
  if (body.length > 16 * 1024) throw new Error(`${operation} response is too large`);
  return JSON.parse(body) as T;
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

export async function generateDeviceIdentity(input: {
  deviceId: string;
  projectId: string;
  authHome?: string;
}): Promise<DeviceEnrollment> {
  const directory = identityDirectory(input.authHome);
  const deviceId = validateIdentifier('deviceId', input.deviceId);
  const projectId = validateIdentifier('projectId', input.projectId);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const managedFiles = [identityPath(directory), enrollmentPath(directory), privateKeyPath(directory)];
  if (managedFiles.some((file) => fs.existsSync(file))) {
    throw new Error(`Device identity already exists under ${directory}; rotation requires an explicit removal step`);
  }
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const [privateKey, publicKey, publicKeyJwk] = await Promise.all([
    crypto.subtle.exportKey('pkcs8', keyPair.privateKey),
    crypto.subtle.exportKey('spki', keyPair.publicKey),
    crypto.subtle.exportKey('jwk', keyPair.publicKey),
  ]);
  delete publicKeyJwk.key_ops;
  delete publicKeyJwk.ext;
  const keyId = base64Url(await crypto.subtle.digest('SHA-256', publicKey));
  const createdAt = new Date().toISOString();
  const identity: DeviceIdentity = {
    schemaVersion: 1,
    deviceId,
    projectId,
    keyId,
    algorithm: 'ES256',
    createdAt,
  };
  const enrollment: DeviceEnrollment = {
    ...identity,
    publicKeyJwk,
    requestedScopes: [...defaultScopes],
  };
  writeOwnerOnly(privateKeyPath(directory), new Uint8Array(privateKey));
  writeOwnerOnly(identityPath(directory), `${JSON.stringify(identity, null, 2)}\n`);
  writeOwnerOnly(enrollmentPath(directory), `${JSON.stringify(enrollment, null, 2)}\n`);
  return enrollment;
}

export function refreshDeviceEnrollment(input: {
  deviceId: string;
  projectId: string;
  authHome?: string;
}): DeviceEnrollment {
  const identity = loadDeviceIdentity(input);
  const privateKey = crypto.createPrivateKey({
    key: fs.readFileSync(privateKeyPath(input.authHome)),
    format: 'der',
    type: 'pkcs8',
  });
  const publicKey = crypto.createPublicKey(privateKey);
  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
  const keyId = crypto.createHash('sha256').update(publicKeyDer).digest('base64url');
  if (keyId !== identity.keyId) {
    throw new Error('Device private key does not match the identity keyId');
  }
  const publicKeyJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
  delete publicKeyJwk.key_ops;
  delete publicKeyJwk.ext;
  const enrollment: DeviceEnrollment = {
    ...identity,
    publicKeyJwk,
    requestedScopes: [...defaultScopes],
  };
  writeOwnerOnly(enrollmentPath(input.authHome), `${JSON.stringify(enrollment, null, 2)}\n`);
  return enrollment;
}

export function loadDeviceIdentity(input: {
  deviceId: string;
  projectId: string;
  authHome?: string;
}): DeviceIdentity {
  const identity = validateIdentity(readJson<DeviceIdentity>(identityPath(input.authHome)));
  ensurePrivateKeyPermissions(privateKeyPath(input.authHome));
  if (identity.deviceId !== validateIdentifier('deviceId', input.deviceId)) {
    throw new Error('Configured deviceId does not match the device identity');
  }
  if (identity.projectId !== validateIdentifier('projectId', input.projectId)) {
    throw new Error('Configured projectId does not match the device identity');
  }
  return identity;
}

export function loadDeviceEnrollment(authHome?: string): DeviceEnrollment {
  const enrollment = readJson<DeviceEnrollment>(enrollmentPath(authHome));
  validateIdentity(enrollment);
  if (
    enrollment.publicKeyJwk?.kty !== 'EC'
    || enrollment.publicKeyJwk.crv !== 'P-256'
    || typeof enrollment.publicKeyJwk.x !== 'string'
    || typeof enrollment.publicKeyJwk.y !== 'string'
    || enrollment.publicKeyJwk.d !== undefined
    || !Array.isArray(enrollment.requestedScopes)
    || !enrollment.requestedScopes.every((scope) => defaultScopes.includes(scope))
  ) throw new Error('Device enrollment file is invalid');
  return enrollment;
}

function loadReusableSession(
  config: DeviceAuthConfig,
  identity: DeviceIdentity,
  requiredScope: DeviceScope,
): StoredSession | null {
  const file = sessionPath(config.authHome);
  if (!fs.existsSync(file)) return null;
  try {
    ensurePrivateKeyPermissions(file);
    const session = readJson<StoredSession>(file);
    if (
      session.schemaVersion !== 1
      || session.deviceId !== identity.deviceId
      || session.projectId !== identity.projectId
      || session.keyId !== identity.keyId
      || session.serviceOrigin !== serviceOrigin(config.serviceUrl)
      || !session.scope.includes(requiredScope)
      || Date.parse(session.expiresAt) <= Date.now() + 60_000
    ) return null;
    return session;
  } catch {
    return null;
  }
}

async function requestSession(
  config: DeviceAuthConfig,
  identity: DeviceIdentity,
): Promise<StoredSession> {
  const challenge = await responseJson<ChallengeResponse>(await fetch(
    authEndpoint(config.serviceUrl, '/auth/challenge'),
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
    || !Array.isArray(challenge.allowedScopes)
    || defaultScopes.some((scope) => !challenge.allowedScopes.includes(scope))
  ) throw new Error('Device challenge response is invalid');
  const timestamp = new Date().toISOString();
  const requestedScopes = [...defaultScopes].sort();
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    fs.readFileSync(privateKeyPath(config.authHome)),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    encoder.encode(sessionCanonicalMessage({
      deviceId: identity.deviceId,
      keyId: identity.keyId,
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      timestamp,
      requestedScopes,
    })),
  );
  const issued = await responseJson<SessionResponse>(await fetch(
    authEndpoint(config.serviceUrl, '/auth/session'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: identity.deviceId,
        keyId: identity.keyId,
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        timestamp,
        requestedScopes,
        signature: base64Url(signature),
      }),
      signal: AbortSignal.timeout(15_000),
    },
  ), 'Device session');
  if (
    issued.tokenType !== 'Bearer'
    || !issued.accessToken
    || issued.deviceId !== identity.deviceId
    || issued.projectId !== identity.projectId
    || !Array.isArray(issued.scope)
    || !issued.sessionId
    || !Number.isFinite(Date.parse(issued.expiresAt))
  ) throw new Error('Device session response is invalid');
  const stored: StoredSession = {
    schemaVersion: 1,
    deviceId: issued.deviceId,
    projectId: issued.projectId,
    keyId: identity.keyId,
    serviceOrigin: serviceOrigin(config.serviceUrl),
    accessToken: issued.accessToken,
    scope: issued.scope,
    sessionId: issued.sessionId,
    expiresAt: issued.expiresAt,
  };
  writeOwnerOnly(sessionPath(config.authHome), `${JSON.stringify(stored, null, 2)}\n`);
  return stored;
}

const pendingSessions = new Map<string, Promise<StoredSession>>();

export async function deviceAuthorizationHeaders(
  config: DeviceAuthConfig,
  requiredScope: DeviceScope,
): Promise<Record<string, string>> {
  const identity = loadDeviceIdentity(config);
  const reusable = loadReusableSession(config, identity, requiredScope);
  if (reusable) return { Authorization: `Bearer ${reusable.accessToken}` };
  const pendingKey = `${identityDirectory(config.authHome)}:${serviceOrigin(config.serviceUrl)}:${requiredScope}`;
  let pending = pendingSessions.get(pendingKey);
  if (!pending) {
    pending = requestSession(config, identity).finally(() => pendingSessions.delete(pendingKey));
    pendingSessions.set(pendingKey, pending);
  }
  const session = await pending;
  if (!session.scope.includes(requiredScope)) {
    throw new Error(`Issued device session lacks ${requiredScope} scope`);
  }
  return { Authorization: `Bearer ${session.accessToken}` };
}

function invalidateCachedSession(config: DeviceAuthConfig, accessToken: string): void {
  const file = sessionPath(config.authHome);
  if (!fs.existsSync(file)) return;
  try {
    const session = readJson<StoredSession>(file);
    if (session.accessToken !== accessToken) return;
  } catch {
    // A malformed cache is never reusable and may be removed safely.
  }
  fs.rmSync(file, { force: true });
}

export async function deviceAuthenticatedFetch(
  config: DeviceAuthConfig,
  requiredScope: DeviceScope,
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const send = async (): Promise<{ response: Response; accessToken: string }> => {
    const authorization = await deviceAuthorizationHeaders(config, requiredScope);
    const authorizationValue = authorization.Authorization;
    if (!authorizationValue?.startsWith('Bearer ')) {
      throw new Error('Device authorization header is invalid');
    }
    const accessToken = authorizationValue.slice('Bearer '.length);
    const headers = new Headers(init.headers);
    headers.set('Authorization', authorizationValue);
    return {
      response: await fetch(input, { ...init, headers }),
      accessToken,
    };
  };
  const first = await send();
  if (first.response.status !== 401) return first.response;
  invalidateCachedSession(config, first.accessToken);
  return (await send()).response;
}

function validOperationConfiguration(
  value: unknown,
  config: DeviceAuthConfig,
): value is DeviceOperationConfiguration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<DeviceOperationConfiguration>;
  const device = candidate.device;
  const midnight = candidate.midnight;
  const policy = candidate.policy;
  const assignment = candidate.assignment;
  const evidence = candidate.evidence;
  const validDate = (input: unknown) => typeof input === 'string'
    && Number.isFinite(Date.parse(input));
  const validOptionalDate = (input: unknown) => input === null || validDate(input);
  const validPositiveInteger = (input: unknown) => Number.isSafeInteger(input) && Number(input) > 0;
  const validHex32 = (input: unknown) => typeof input === 'string'
    && /^(?:[0-9a-f]{2}){32}$/u.test(input);
  const validIdentifier = (input: unknown) => typeof input === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(input);
  return candidate.schemaVersion === 2
    && validPositiveInteger(candidate.configurationVersion)
    && validDate(candidate.updatedAt)
    && device?.deviceId === config.deviceId
    && device.projectId === config.projectId
    && typeof device.sensorType === 'string'
    && Boolean(device.sensorType)
    && typeof device.unit === 'string'
    && Boolean(device.unit)
    && (midnight?.network === 'preview' || midnight?.network === 'preprod')
    && validHex32(midnight.contractAddress)
    && midnight.contractSchemaVersion === 4
    && validPositiveInteger(midnight.registrationVersion)
    && policy !== undefined
    && validIdentifier(policy.id)
    && validHex32(policy.key)
    && ['closed-range', 'upper-bound', 'lower-bound'].includes(String(policy.mode))
    && (policy.minimum === null || Number.isFinite(policy.minimum))
    && (policy.maximum === null || Number.isFinite(policy.maximum))
    && validPositiveInteger(policy.valueScale)
    && validPositiveInteger(policy.sensorTypeCode)
    && validPositiveInteger(policy.unitCode)
    && validPositiveInteger(policy.version)
    && assignment !== undefined
    && validIdentifier(assignment.id)
    && validHex32(assignment.key)
    && validPositiveInteger(assignment.version)
    && Number.isSafeInteger(assignment.timeZoneOffsetMinutes)
    && assignment.timeZoneOffsetMinutes >= -840
    && assignment.timeZoneOffsetMinutes <= 840
    && Number.isSafeInteger(assignment.localDayStartHour)
    && assignment.localDayStartHour >= 0
    && assignment.localDayStartHour <= 23
    && Number.isSafeInteger(assignment.utcDayStartMinute)
    && assignment.utcDayStartMinute >= 0
    && assignment.utcDayStartMinute <= 1439
    && ((assignment.localDayStartHour * 60 - assignment.timeZoneOffsetMinutes) % 1440 + 1440) % 1440
      === assignment.utcDayStartMinute
    && validOptionalDate(assignment.validFrom)
    && validOptionalDate(assignment.validUntil)
    && typeof evidence?.deviceRegisteredTxId === 'string'
    && Boolean(evidence.deviceRegisteredTxId)
    && typeof evidence.deviceAuthorityTxId === 'string'
    && Boolean(evidence.deviceAuthorityTxId)
    && typeof evidence.policyRegisteredTxId === 'string'
    && Boolean(evidence.policyRegisteredTxId)
    && typeof evidence.assignmentRegisteredTxId === 'string'
    && Boolean(evidence.assignmentRegisteredTxId);
}

export async function fetchDeviceOperationConfiguration(
  config: DeviceAuthConfig,
): Promise<DeviceOperationConfiguration> {
  const value = await responseJson<unknown>(await deviceAuthenticatedFetch(
    config,
    'configuration:read',
    authEndpoint(config.serviceUrl, '/api/v1/device/configuration'),
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    },
  ), 'Device configuration');
  if (!validOperationConfiguration(value, config)) {
    throw new Error('Device configuration response is invalid or belongs to another Device');
  }
  return value;
}
