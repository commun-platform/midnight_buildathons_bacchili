import type { SystemOperatorPrincipal } from './system-operations-auth.js';
import type { SqlDatabase } from './storage/sql.js';

export type SystemOperatorRole = 'viewer' | 'operator';

interface GrantRow {
  role: SystemOperatorRole;
  scope_key: string;
  project_id: string | null;
}

interface CsrfRow {
  principal_identifier: string;
  expires_at: string;
}

export interface SystemOperatorAccess {
  principal: SystemOperatorPrincipal;
  globalRole: SystemOperatorRole | null;
  projectRoles: ReadonlyMap<string, SystemOperatorRole>;
}

export interface IssuedCsrfToken {
  token: string;
  expiresAt: string;
}

export type MutationSecurityResult =
  | { ok: true }
  | { ok: false; response: Response };

const csrfLifetimeMs = 60 * 60 * 1000;
const hexTokenPattern = /^[0-9a-f]{64}$/u;

function json(status: number, error: string, errorCode: string): Response {
  return Response.json({ error, errorCode }, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function strongerRole(
  current: SystemOperatorRole | null,
  candidate: SystemOperatorRole,
): SystemOperatorRole {
  return current === 'operator' || candidate === 'operator' ? 'operator' : 'viewer';
}

function principalKeys(principal: SystemOperatorPrincipal): string[] {
  const keys: string[] = [];
  if (principal.email) keys.push(`email:${principal.email}`);
  if (principal.subject) keys.push(`subject:${principal.subject}`);
  return [...new Set(keys)];
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  ));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes: number): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function loadSystemOperatorAccess(
  database: SqlDatabase,
  principal: SystemOperatorPrincipal,
): Promise<SystemOperatorAccess> {
  if (principal.source === 'local-development') {
    return { principal, globalRole: 'operator', projectRoles: new Map() };
  }
  const keys = principalKeys(principal);
  if (keys.length === 0) {
    return { principal, globalRole: null, projectRoles: new Map() };
  }
  const placeholders = keys.map((_, index) => `?${index + 1}`).join(', ');
  const rows = await database.all<GrantRow>(
    `SELECT role, scope_key, project_id FROM system_operator_grants
     WHERE active = 1 AND principal_key IN (${placeholders})`,
    keys,
  );
  let globalRole: SystemOperatorRole | null = null;
  const projectRoles = new Map<string, SystemOperatorRole>();
  for (const row of rows) {
    if (row.scope_key === '*' && row.project_id === null) {
      globalRole = strongerRole(globalRole, row.role);
      continue;
    }
    if (!row.project_id || row.scope_key !== row.project_id) continue;
    projectRoles.set(
      row.project_id,
      strongerRole(projectRoles.get(row.project_id) ?? null, row.role),
    );
  }
  return { principal, globalRole, projectRoles };
}

export function hasAnySystemOperatorAccess(access: SystemOperatorAccess): boolean {
  return access.globalRole !== null || access.projectRoles.size > 0;
}

export function canViewProject(access: SystemOperatorAccess, projectId: string): boolean {
  return access.globalRole !== null || access.projectRoles.has(projectId);
}

export function canOperateProject(access: SystemOperatorAccess, projectId: string): boolean {
  return access.globalRole === 'operator' || access.projectRoles.get(projectId) === 'operator';
}

export function isGlobalSystemOperator(access: SystemOperatorAccess): boolean {
  return access.globalRole !== null;
}

export function visibleProjectIds(access: SystemOperatorAccess): string[] | null {
  return access.globalRole ? null : [...access.projectRoles.keys()].sort();
}

export async function issueSystemOperatorCsrfToken(
  database: SqlDatabase,
  principal: SystemOperatorPrincipal,
  now = new Date(),
): Promise<IssuedCsrfToken> {
  const token = randomHex(32);
  const tokenSha256 = await sha256Hex(token);
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + csrfLifetimeMs).toISOString();
  await database.batch([
    {
      sql: 'DELETE FROM system_operator_csrf_tokens WHERE expires_at <= ?1',
      parameters: [createdAt],
    },
    {
      sql: `INSERT INTO system_operator_csrf_tokens (
              token_sha256, principal_identifier, expires_at, created_at
            ) VALUES (?1, ?2, ?3, ?4)`,
      parameters: [tokenSha256, principal.identifier, expiresAt, createdAt],
    },
  ]);
  return { token, expiresAt };
}

export async function requireSystemOperatorMutationSecurity(
  request: Request,
  database: SqlDatabase,
  principal: SystemOperatorPrincipal,
  now = new Date(),
): Promise<MutationSecurityResult> {
  const contentType = request.headers.get('Content-Type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== 'application/json') {
    return {
      ok: false,
      response: json(415, 'Managed API mutations require application/json', 'json_content_type_required'),
    };
  }

  const origin = request.headers.get('Origin')?.trim();
  if (!origin || origin !== new URL(request.url).origin) {
    return {
      ok: false,
      response: json(403, 'Managed API mutation origin is not allowed', 'origin_not_allowed'),
    };
  }

  const token = request.headers.get('X-CSRF-Token')?.trim().toLowerCase() ?? '';
  if (!hexTokenPattern.test(token)) {
    return {
      ok: false,
      response: json(403, 'Managed API CSRF token is required', 'csrf_token_required'),
    };
  }
  const row = await database.first<CsrfRow>(
    `SELECT principal_identifier, expires_at FROM system_operator_csrf_tokens
     WHERE token_sha256 = ?1 AND expires_at > ?2`,
    [await sha256Hex(token), now.toISOString()],
  );
  if (!row || row.principal_identifier !== principal.identifier) {
    return {
      ok: false,
      response: json(403, 'Managed API CSRF token is invalid or expired', 'csrf_token_invalid'),
    };
  }
  return { ok: true };
}
