import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { authorizeSupportRequest, requireSupportGrant } from './access-auth.js';

const issuer = 'https://support-access.cloudflareaccess.com';
const audience = 'support-mcp-audience';

async function signedRequest(email = 'support@commun-platform.com') {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'support-test-key';
  jwk.alg = 'RS256';
  const token = await new SignJWT({
    email,
    name: 'Customer Support',
    user_uuid: 'support-user-001',
  })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  return {
    request: new Request('https://midnight-support-mcp.commun-official.workers.dev/mcp', {
      method: 'POST',
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }),
    jwksFetch: async () => Response.json({ keys: [jwk] }),
  };
}

describe('private Support MCP authorization', () => {
  it('fails closed without a Cloudflare Access JWT', async () => {
    const result = await authorizeSupportRequest(
      new Request('https://midnight-support-mcp.commun-official.workers.dev/mcp'),
      { CLOUDFLARE_ACCESS_TEAM_DOMAIN: issuer, CLOUDFLARE_ACCESS_AUDIENCE: audience },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('fails closed while the dedicated Access audience is not configured', async () => {
    const result = await authorizeSupportRequest(
      new Request('https://midnight-support-mcp.commun-official.workers.dev/mcp'),
      {
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: issuer,
        CLOUDFLARE_ACCESS_AUDIENCE: 'SET_AFTER_PRIVATE_ACCESS_APPLICATION_CREATION',
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });

  it('accepts only a correctly signed JWT for the private MCP audience', async () => {
    const { request, jwksFetch } = await signedRequest();
    const result = await authorizeSupportRequest(
      request,
      { CLOUDFLARE_ACCESS_TEAM_DOMAIN: issuer, CLOUDFLARE_ACCESS_AUDIENCE: audience },
      jwksFetch,
    );
    expect(result).toMatchObject({
      ok: true,
      principal: {
        identifier: 'support-user-001',
        email: 'support@commun-platform.com',
      },
    });
  });

  it('requires an active global D1 support grant after Access authentication', async () => {
    const principal = {
      identifier: 'support-user-001',
      email: 'support@commun-platform.com',
      displayName: 'Customer Support',
    };
    const granted = await requireSupportGrant({
      DB: {
        prepare: () => ({
          bind: () => ({ first: async () => ({ role: 'viewer' }) }),
        }),
      } as unknown as D1Database,
    }, principal);
    const denied = await requireSupportGrant({
      DB: {
        prepare: () => ({
          bind: () => ({ first: async () => null }),
        }),
      } as unknown as D1Database,
    }, principal);
    expect(granted.ok).toBe(true);
    expect(denied.ok).toBe(false);
  });
});
