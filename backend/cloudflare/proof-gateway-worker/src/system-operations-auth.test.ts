import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type FetchImplementation,
} from 'jose';
import { describe, expect, it } from 'vitest';

import { authorizeSystemOperator } from './system-operations-auth.js';

const accessIssuer = 'https://access-test.cloudflareaccess.com';
const accessAudience = 'access-audience-test';

function context(value: unknown = {}): ExecutionContext {
  return value as ExecutionContext;
}

function accessEnvironment(overrides: Partial<Pick<
  Env,
  'CLOUDFLARE_ACCESS_TEAM_DOMAIN' | 'CLOUDFLARE_ACCESS_AUDIENCE'
>> = {}): Pick<Env, 'CLOUDFLARE_ACCESS_TEAM_DOMAIN' | 'CLOUDFLARE_ACCESS_AUDIENCE'> {
  return {
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: accessIssuer,
    CLOUDFLARE_ACCESS_AUDIENCE: accessAudience,
    ...overrides,
  };
}

async function signedAccessRequest(
  audience = accessAudience,
): Promise<{ request: Request; jwksFetch: FetchImplementation }> {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'access-test-key';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  const token = await new SignJWT({
    email: 'operator@example.com',
    name: 'System Operator',
    user_uuid: 'access-user-jwt-001',
  })
    .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
    .setIssuer(accessIssuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  return {
    request: new Request('https://gateway.example/api/v1/system-operations/overview', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }),
    jwksFetch: async () => Response.json({ keys: [publicJwk] }),
  };
}

describe('system operations authorization', () => {
  it('fails closed on a public route without a validated Access context', async () => {
    const result = await authorizeSystemOperator(
      new Request('https://gateway.example/api/v1/system-operations/overview'),
      accessEnvironment(),
      context(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('allows a loopback page but requires an explicit local header for its API', async () => {
    const page = await authorizeSystemOperator(
      new Request('http://127.0.0.1:8787/system-operations/'),
      accessEnvironment(),
      context(),
      true,
    );
    const deniedApi = await authorizeSystemOperator(
      new Request('http://127.0.0.1:8787/api/v1/system-operations/overview'),
      accessEnvironment(),
      context(),
    );
    const allowedApi = await authorizeSystemOperator(
      new Request('http://127.0.0.1:8787/api/v1/system-operations/overview', {
        headers: { 'X-System-Operations-Local': 'dashboard' },
      }),
      accessEnvironment(),
      context(),
    );
    expect(page).toMatchObject({ ok: true });
    expect(deniedApi.ok).toBe(false);
    expect(allowedApi).toMatchObject({
      ok: true,
      principal: { identifier: 'local-development', source: 'local-development' },
    });
  });

  it('uses the identity supplied by Cloudflare Access', async () => {
    const result = await authorizeSystemOperator(
      new Request('https://gateway.example/api/v1/system-operations/events'),
      accessEnvironment(),
      context({
        access: {
          getIdentity: async () => ({
            email: 'operator@example.com',
            name: 'System Operator',
            user_uuid: 'access-user-001',
          }),
        },
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      principal: {
        identifier: 'access-user-001',
        displayName: 'System Operator',
        source: 'cloudflare-access',
      },
    });
  });

  it('verifies the Access JWT when Static Assets omit context.access', async () => {
    const { request, jwksFetch } = await signedAccessRequest();
    const result = await authorizeSystemOperator(
      request,
      accessEnvironment(),
      context(),
      false,
      jwksFetch,
    );
    expect(result).toMatchObject({
      ok: true,
      principal: {
        identifier: 'access-user-jwt-001',
        displayName: 'System Operator',
        source: 'cloudflare-access',
      },
    });
  });

  it('rejects a correctly signed Access JWT for another application audience', async () => {
    const { request, jwksFetch } = await signedAccessRequest('different-application');
    const result = await authorizeSystemOperator(
      request,
      accessEnvironment(),
      context(),
      false,
      jwksFetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});
