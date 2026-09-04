import { describe, expect, it } from 'vitest';

import type { SystemOperatorPrincipal } from './system-operations-auth.js';
import {
  canOperateProject,
  canViewProject,
  hasAnySystemOperatorAccess,
  issueSystemOperatorCsrfToken,
  loadSystemOperatorAccess,
  requireSystemOperatorMutationSecurity,
  visibleProjectIds,
} from './system-operator-security.js';
import type { SqlDatabase, SqlParameter, SqlStatement } from './storage/sql.js';

interface State {
  grants: Array<{ role: 'viewer' | 'operator'; scope_key: string; project_id: string | null }>;
  csrf: Map<string, { principal_identifier: string; expires_at: string }>;
}

function memoryDatabase(state: State): SqlDatabase {
  return {
    kind: 'd1',
    async first<T>(sql: string, parameters: readonly SqlParameter[] = []) {
      if (sql.includes('FROM system_operator_csrf_tokens')) {
        const row = state.csrf.get(String(parameters[0]));
        return row && row.expires_at > String(parameters[1]) ? row as T : null;
      }
      return null;
    },
    async all<T>(sql: string) {
      return sql.includes('FROM system_operator_grants') ? state.grants as T[] : [];
    },
    async execute() { return 1; },
    async batch(statements: readonly SqlStatement[]) {
      for (const statement of statements) {
        if (statement.sql.startsWith('DELETE FROM system_operator_csrf_tokens')) {
          for (const [key, value] of state.csrf) {
            if (value.expires_at <= String(statement.parameters?.[0])) state.csrf.delete(key);
          }
        }
        if (statement.sql.includes('INSERT INTO system_operator_csrf_tokens')) {
          state.csrf.set(String(statement.parameters?.[0]), {
            principal_identifier: String(statement.parameters?.[1]),
            expires_at: String(statement.parameters?.[2]),
          });
        }
      }
    },
  };
}

function principal(overrides: Partial<SystemOperatorPrincipal> = {}): SystemOperatorPrincipal {
  return {
    identifier: 'access-user-001',
    email: 'support@commun-platform.com',
    subject: 'access-user-001',
    displayName: 'Support',
    source: 'cloudflare-access',
    ...overrides,
  };
}

function mutation(token: string, overrides: RequestInit = {}): Request {
  return new Request('https://gateway.example/api/v1/managed-sources', {
    method: 'POST',
    body: '{}',
    ...overrides,
    headers: {
      Origin: 'https://gateway.example',
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
      ...(overrides.headers ?? {}),
    },
  });
}

describe('system operator project authorization', () => {
  it('combines global and project grants using the strongest role', async () => {
    const database = memoryDatabase({
      grants: [
        { role: 'viewer', scope_key: 'project-a', project_id: 'project-a' },
        { role: 'operator', scope_key: 'project-a', project_id: 'project-a' },
        { role: 'viewer', scope_key: 'project-b', project_id: 'project-b' },
      ],
      csrf: new Map(),
    });
    const access = await loadSystemOperatorAccess(database, principal());
    expect(hasAnySystemOperatorAccess(access)).toBe(true);
    expect(visibleProjectIds(access)).toEqual(['project-a', 'project-b']);
    expect(canViewProject(access, 'project-a')).toBe(true);
    expect(canOperateProject(access, 'project-a')).toBe(true);
    expect(canOperateProject(access, 'project-b')).toBe(false);
    expect(canViewProject(access, 'project-c')).toBe(false);
  });

  it('gives the explicit local development identity global operator access', async () => {
    const access = await loadSystemOperatorAccess(
      memoryDatabase({ grants: [], csrf: new Map() }),
      principal({
        identifier: 'local-development', email: null, subject: null,
        source: 'local-development',
      }),
    );
    expect(visibleProjectIds(access)).toBeNull();
    expect(canOperateProject(access, 'any-project')).toBe(true);
  });
});

describe('system operator CSRF protection', () => {
  it('accepts a same-origin JSON mutation carrying a principal-bound token', async () => {
    const state: State = { grants: [], csrf: new Map() };
    const database = memoryDatabase(state);
    const issued = await issueSystemOperatorCsrfToken(
      database,
      principal(),
      new Date('2026-09-03T00:00:00.000Z'),
    );
    const result = await requireSystemOperatorMutationSecurity(
      mutation(issued.token),
      database,
      principal(),
      new Date('2026-09-03T00:30:00.000Z'),
    );
    expect(result).toEqual({ ok: true });
  });

  it.each([
    ['cross-origin', { headers: { Origin: 'https://attacker.example' } }, 'origin_not_allowed'],
    ['non-JSON', { headers: { 'Content-Type': 'text/plain' } }, 'json_content_type_required'],
    ['missing token', { headers: { 'X-CSRF-Token': '' } }, 'csrf_token_required'],
  ])('rejects %s mutations before business handling', async (_name, init, errorCode) => {
    const state: State = { grants: [], csrf: new Map() };
    const database = memoryDatabase(state);
    const issued = await issueSystemOperatorCsrfToken(database, principal());
    const result = await requireSystemOperatorMutationSecurity(
      mutation(issued.token, init as RequestInit),
      database,
      principal(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(await result.response.json()).toMatchObject({ errorCode });
  });

  it('rejects expired and cross-principal tokens', async () => {
    const state: State = { grants: [], csrf: new Map() };
    const database = memoryDatabase(state);
    const issued = await issueSystemOperatorCsrfToken(
      database,
      principal(),
      new Date('2026-09-03T00:00:00.000Z'),
    );
    const expired = await requireSystemOperatorMutationSecurity(
      mutation(issued.token),
      database,
      principal(),
      new Date('2026-09-03T01:00:00.001Z'),
    );
    const anotherPrincipal = await requireSystemOperatorMutationSecurity(
      mutation(issued.token),
      database,
      principal({ identifier: 'access-user-002', subject: 'access-user-002' }),
      new Date('2026-09-03T00:30:00.000Z'),
    );
    expect(expired.ok).toBe(false);
    expect(anotherPrincipal.ok).toBe(false);
  });
});
