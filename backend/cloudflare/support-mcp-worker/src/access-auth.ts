import {
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
  type FetchImplementation,
} from 'jose';

export interface SupportPrincipal {
  identifier: string;
  email: string;
  displayName: string;
}

export type SupportAuthorization =
  | { ok: true; principal: SupportPrincipal }
  | { ok: false; response: Response };

interface AccessConfiguration {
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: string;
  CLOUDFLARE_ACCESS_AUDIENCE: string;
}

function denied(status: number, error: string): SupportAuthorization {
  return {
    ok: false,
    response: Response.json({ error }, {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
        'X-Content-Type-Options': 'nosniff',
      },
    }),
  };
}

export async function authorizeSupportRequest(
  request: Request,
  env: AccessConfiguration,
  jwksFetch?: FetchImplementation,
): Promise<SupportAuthorization> {
  const configuredDomain = env.CLOUDFLARE_ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.CLOUDFLARE_ACCESS_AUDIENCE?.trim();
  if (
    !configuredDomain
    || !audience
    || audience === 'SET_AFTER_PRIVATE_ACCESS_APPLICATION_CREATION'
  ) return denied(503, 'Private MCP Access verification is not configured');

  let issuer: URL;
  try {
    issuer = new URL(configuredDomain);
  } catch {
    return denied(503, 'Private MCP Access verification is not configured');
  }
  if (issuer.protocol !== 'https:' || issuer.pathname !== '/') {
    return denied(503, 'Private MCP Access verification is not configured');
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion')?.trim();
  if (!token) return denied(403, 'Cloudflare Access authentication is required');
  try {
    const jwks = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer), {
      timeoutDuration: 5_000,
      ...(jwksFetch ? { [customFetch]: jwksFetch } : {}),
    });
    const { payload } = await jwtVerify(token, jwks, {
      issuer: issuer.origin,
      audience,
      algorithms: ['RS256'],
    });
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const subject = typeof payload.sub === 'string' ? payload.sub.trim() : '';
    const userUuid = typeof payload.user_uuid === 'string' ? payload.user_uuid.trim() : '';
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!email || !(userUuid || subject)) return denied(403, 'Cloudflare Access identity is incomplete');
    return {
      ok: true,
      principal: {
        identifier: userUuid || subject,
        email,
        displayName: name || email,
      },
    };
  } catch (error) {
    console.error(JSON.stringify({
      message: 'support_mcp_access_jwt_rejected',
      errorCode: typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : error instanceof Error ? error.name : 'UnknownError',
    }));
    return denied(403, 'Cloudflare Access authentication is invalid');
  }
}

export async function requireSupportGrant(
  env: { DB: D1Database },
  principal: SupportPrincipal,
): Promise<SupportAuthorization> {
  const grants = await env.DB.prepare(
    `SELECT role FROM system_operator_grants
     WHERE active = 1 AND scope_key = '*' AND project_id IS NULL
       AND principal_key IN (?1, ?2)
     ORDER BY CASE role WHEN 'operator' THEN 0 ELSE 1 END LIMIT 1`,
  ).bind(`email:${principal.email}`, `subject:${principal.identifier}`).first<{ role: string }>();
  return grants?.role === 'viewer' || grants?.role === 'operator'
    ? { ok: true, principal }
    : denied(403, 'Customer Support MCP authorization is required');
}
