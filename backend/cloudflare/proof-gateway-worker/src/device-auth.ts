import { createSqlDatabase } from './storage/index.js';

export const deviceAuthProtocol = 'vsp-device-session-v2';
export const challengeTtlSeconds = 5 * 60;
export const sessionTtlSeconds = 24 * 60 * 60;
export const timestampToleranceSeconds = 5 * 60;

export type DeviceScope =
  | 'measurement:write'
  | 'anomaly:write'
  | 'proof:request'
  | 'proof:read'
  | 'proof:generate'
  | 'transaction:submit'
  | 'configuration:read'
  | 'device:status';

const allowedScopes = new Set<DeviceScope>([
  'measurement:write',
  'anomaly:write',
  'proof:request',
  'proof:read',
  'proof:generate',
  'transaction:submit',
  'configuration:read',
  'device:status',
]);
const encoder = new TextEncoder();

interface DeviceKeyRow {
  device_id: string;
  project_id: string;
  key_id: string;
  algorithm: string;
  public_key_jwk: string;
  allowed_scopes_json: string;
  status: string;
}

interface SessionRow {
  id: string;
  device_id: string;
  project_id: string;
  key_id: string;
  token_sha256: string;
  scopes_json: string;
  issued_at: number;
  expires_at: number;
  revoked_at: number | null;
  key_status: string;
}

interface ActiveDeviceKey {
  deviceId: string;
  projectId: string;
  keyId: string;
  publicKeyJwk: JsonWebKey;
  allowedScopes: DeviceScope[];
}

export interface DevicePrincipal {
  deviceId: string;
  projectId: string;
  keyId: string;
  scopes: DeviceScope[];
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
}

type AuthorizationResult =
  | { ok: true; principal: DevicePrincipal }
  | { ok: false; response: Response };

const authHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

function json(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), { status, headers: authHeaders });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function base64UrlEncode(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z\d_-]+$/u.test(value)) throw new Error('Invalid base64url value');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', encoder.encode(value));
}

async function sha256Base64Url(value: string): Promise<string> {
  return base64UrlEncode(await sha256(value));
}

function requiredString(body: Record<string, unknown>, key: string, max = 512): string {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`${key} must be a non-empty string up to ${max} characters`);
  }
  return value.trim();
}

function requestedScopes(body: Record<string, unknown>): DeviceScope[] {
  const scopes = body.requestedScopes;
  if (
    !Array.isArray(scopes)
    || scopes.length === 0
    || scopes.length > allowedScopes.size
    || !scopes.every((scope) => typeof scope === 'string' && allowedScopes.has(scope as DeviceScope))
  ) throw new Error('requestedScopes must contain supported scopes');
  return [...new Set(scopes as DeviceScope[])].sort();
}

function parseStoredScopes(value: string): DeviceScope[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((scope) => allowedScopes.has(scope as DeviceScope))) {
      return null;
    }
    return parsed as DeviceScope[];
  } catch {
    return null;
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 16 * 1024) {
    throw new Error('Request body is too large');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Request body is required');
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 16 * 1024) throw new Error('Request body is too large');
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Request body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function isPublicP256Jwk(value: JsonWebKey): boolean {
  return value.kty === 'EC'
    && value.crv === 'P-256'
    && typeof value.x === 'string'
    && typeof value.y === 'string'
    && value.d === undefined;
}

async function loadActiveKey(env: Env, deviceId: string, keyId: string): Promise<ActiveDeviceKey | null> {
  const row = await createSqlDatabase(env).first<DeviceKeyRow>(
    `SELECT k.device_id, k.project_id, k.key_id, k.algorithm, k.public_key_jwk,
            k.allowed_scopes_json, k.status
     FROM device_auth_keys k
     JOIN devices d ON d.id = k.device_id AND d.project_id = k.project_id
     WHERE k.device_id = ?1 AND k.key_id = ?2 AND k.status = 'active'
       AND d.midnight_registry_status = 'registered'
       AND d.midnight_device_commitment IS NOT NULL
       AND d.midnight_device_authority IS NOT NULL
       AND d.midnight_registration_version IS NOT NULL
       AND d.midnight_contract_address IS NOT NULL
       AND d.midnight_registered_tx_id IS NOT NULL
       AND d.midnight_authority_tx_id IS NOT NULL`,
    [deviceId, keyId],
  );
  if (!row || row.algorithm !== 'ES256' || row.status !== 'active') return null;
  try {
    const publicKeyJwk = JSON.parse(row.public_key_jwk) as JsonWebKey;
    const scopes = parseStoredScopes(row.allowed_scopes_json);
    if (!isPublicP256Jwk(publicKeyJwk) || !scopes) return null;
    return {
      deviceId: row.device_id,
      projectId: row.project_id,
      keyId: row.key_id,
      publicKeyJwk,
      allowedScopes: scopes,
    };
  } catch {
    return null;
  }
}

async function applyRateLimits(
  limiter: RateLimit,
  request: Request,
  deviceId: string,
  sessionId?: string,
): Promise<boolean> {
  const ip = request.headers.get('CF-Connecting-IP')?.trim() || 'unknown';
  const keys = [`device:${deviceId}`, `ip:${ip}`];
  if (sessionId) keys.push(`session:${sessionId}`);
  for (const key of keys) {
    if (!(await limiter.limit({ key })).success) return false;
  }
  return true;
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

function sessionIdFromToken(token: string): string | null {
  if (token.length > 256) return null;
  const [sessionId, secret, extra] = token.split('.');
  if (
    extra !== undefined
    || !sessionId
    || !secret
    || !/^[0-9a-f-]{36}$/iu.test(sessionId)
    || !/^[A-Za-z\d_-]{43}$/u.test(secret)
  ) return null;
  return sessionId;
}

async function verifySessionToken(env: Env, token: string): Promise<DevicePrincipal | null> {
  const sessionId = sessionIdFromToken(token);
  if (!sessionId) return null;
  const row = await createSqlDatabase(env).first<SessionRow>(
    `SELECT s.id, s.device_id, s.project_id, s.key_id, s.token_sha256,
            s.scopes_json, s.issued_at, s.expires_at, s.revoked_at,
            k.status AS key_status
     FROM device_auth_sessions s
     JOIN device_auth_keys k ON k.key_id = s.key_id AND k.device_id = s.device_id
     JOIN devices d ON d.id = s.device_id AND d.project_id = s.project_id
       AND d.midnight_registry_status = 'registered'
       AND d.midnight_device_commitment IS NOT NULL
       AND d.midnight_device_authority IS NOT NULL
       AND d.midnight_registration_version IS NOT NULL
       AND d.midnight_contract_address IS NOT NULL
       AND d.midnight_registered_tx_id IS NOT NULL
       AND d.midnight_authority_tx_id IS NOT NULL
     WHERE s.id = ?1`,
    [sessionId],
  );
  const now = Math.floor(Date.now() / 1000);
  if (!row || row.revoked_at !== null || row.expires_at <= now || row.key_status !== 'active') return null;
  const scopes = parseStoredScopes(row.scopes_json);
  if (!scopes) return null;
  const providedHash = await sha256(token);
  let storedHash: Uint8Array;
  try {
    storedHash = base64UrlDecode(row.token_sha256);
  } catch {
    return null;
  }
  if (storedHash.byteLength !== 32 || !crypto.subtle.timingSafeEqual(providedHash, storedHash)) return null;
  return {
    deviceId: row.device_id,
    projectId: row.project_id,
    keyId: row.key_id,
    scopes,
    sessionId: row.id,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
  };
}

export async function authorizeDeviceRequest(
  request: Request,
  env: Env,
  requiredScope: DeviceScope,
): Promise<AuthorizationResult> {
  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return { ok: false, response: json(401, { error: 'A valid device session is required' }) };
  }
  try {
    const principal = await verifySessionToken(env, authorization.slice('Bearer '.length).trim());
    if (!principal) {
      return { ok: false, response: json(401, { error: 'Device session is invalid, revoked, or expired' }) };
    }
    if (!principal.scopes.includes(requiredScope)) {
      return { ok: false, response: json(403, { error: `Device session lacks ${requiredScope} scope` }) };
    }
    return { ok: true, principal };
  } catch (error) {
    console.error(JSON.stringify({ event: 'device_auth_lookup_failed', message: errorMessage(error) }));
    return { ok: false, response: json(503, { error: 'Device session store is unavailable' }) };
  }
}

async function challenge(request: Request, env: Env): Promise<Response> {
  try {
    const body = await readJson(request);
    const deviceId = requiredString(body, 'deviceId', 160);
    const keyId = requiredString(body, 'keyId', 160);
    if (!(await applyRateLimits(env.AUTH_RATE_LIMITER, request, deviceId))) {
      return json(429, { error: 'Authentication rate limit exceeded' });
    }
    const key = await loadActiveKey(env, deviceId, keyId);
    if (!key) return json(401, { error: 'Device identity is not active' });
    const challengeId = crypto.randomUUID();
    const nonce = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + challengeTtlSeconds;
    await createSqlDatabase(env).execute(
      `INSERT INTO device_auth_challenges (
         id, device_id, key_id, nonce_sha256, created_at, expires_at, used_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)`,
      [challengeId, deviceId, keyId, await sha256Base64Url(nonce), now, expiresAt],
    );
    return json(200, {
      challengeId,
      nonce,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      serverTime: new Date(now * 1000).toISOString(),
      canonicalization: deviceAuthProtocol,
      allowedScopes: key.allowedScopes,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'device_auth_challenge_failed', message: errorMessage(error) }));
    return json(400, { error: 'Invalid challenge request' });
  }
}

async function session(request: Request, env: Env): Promise<Response> {
  try {
    const body = await readJson(request);
    const deviceId = requiredString(body, 'deviceId', 160);
    const keyId = requiredString(body, 'keyId', 160);
    const challengeId = requiredString(body, 'challengeId', 160);
    const nonce = requiredString(body, 'nonce', 256);
    const timestamp = requiredString(body, 'timestamp', 64);
    const signature = requiredString(body, 'signature', 256);
    const scopes = requestedScopes(body);
    if (!(await applyRateLimits(env.AUTH_RATE_LIMITER, request, deviceId))) {
      return json(429, { error: 'Authentication rate limit exceeded' });
    }
    const timestampSeconds = Math.floor(Date.parse(timestamp) / 1000);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(timestampSeconds) || Math.abs(now - timestampSeconds) > timestampToleranceSeconds) {
      return json(401, { error: 'Device timestamp is outside the allowed window' });
    }
    const key = await loadActiveKey(env, deviceId, keyId);
    if (!key || scopes.some((scope) => !key.allowedScopes.includes(scope))) {
      return json(401, { error: 'Device identity or requested scopes are not active' });
    }
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      key.publicKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const validSignature = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      base64UrlDecode(signature),
      encoder.encode(sessionCanonicalMessage({
        deviceId,
        keyId,
        challengeId,
        nonce,
        timestamp,
        requestedScopes: scopes,
      })),
    );
    if (!validSignature) return json(401, { error: 'Device signature is invalid' });
    const database = createSqlDatabase(env);
    const usedAt = Math.floor(Date.now() / 1000);
    const changes = await database.execute(
      `UPDATE device_auth_challenges SET used_at = ?1
       WHERE id = ?2 AND device_id = ?3 AND key_id = ?4
         AND nonce_sha256 = ?5 AND used_at IS NULL AND expires_at >= ?1`,
      [usedAt, challengeId, deviceId, keyId, await sha256Base64Url(nonce)],
    );
    if (changes !== 1) return json(401, { error: 'Challenge is invalid, expired, or already used' });
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + sessionTtlSeconds;
    const sessionId = crypto.randomUUID();
    const sessionSecret = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
    const token = `${sessionId}.${sessionSecret}`;
    await database.batch([
      {
        sql: `INSERT INTO device_auth_sessions (
           id, device_id, project_id, key_id, token_sha256, scopes_json,
           issued_at, expires_at, revoked_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL)`,
        parameters: [
          sessionId,
          deviceId,
          key.projectId,
          keyId,
          await sha256Base64Url(token),
          JSON.stringify(scopes),
          issuedAt,
          expiresAt,
        ],
      },
      {
        sql: 'UPDATE device_auth_keys SET last_authenticated_at = ?1 WHERE key_id = ?2',
        parameters: [new Date(issuedAt * 1000).toISOString(), keyId],
      },
    ]);
    return json(200, {
      tokenType: 'Bearer',
      accessToken: token,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      deviceId,
      projectId: key.projectId,
      scope: scopes,
      sessionId,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'device_auth_session_failed', message: errorMessage(error) }));
    return json(400, { error: 'Invalid session request' });
  }
}

export async function handleDeviceAuth(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/auth/')) return null;
  if (request.method === 'POST' && url.pathname === '/auth/challenge') return challenge(request, env);
  if (request.method === 'POST' && url.pathname === '/auth/session') return session(request, env);
  return json(404, { error: 'Authentication endpoint not found' });
}

export async function applyDeviceRateLimits(
  limiter: RateLimit,
  request: Request,
  principal: DevicePrincipal,
): Promise<boolean> {
  return applyRateLimits(limiter, request, principal.deviceId, principal.sessionId);
}
