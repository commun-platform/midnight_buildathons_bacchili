import {
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
  type FetchImplementation,
  type JWTPayload,
} from 'jose';

const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);

type AccessConfiguration = Pick<
  Env,
  'CLOUDFLARE_ACCESS_TEAM_DOMAIN' | 'CLOUDFLARE_ACCESS_AUDIENCE'
>;

export interface SystemOperatorPrincipal {
  identifier: string;
  displayName: string;
  source: 'cloudflare-access' | 'local-development';
}

type SystemOperatorAuthorization =
  | { ok: true; principal: SystemOperatorPrincipal }
  | { ok: false; response: Response };

function json(status: number, value: unknown): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function principalFromIdentity(identity: Record<string, unknown>): SystemOperatorPrincipal | null {
  const email = typeof identity.email === 'string' ? identity.email.trim() : '';
  const name = typeof identity.name === 'string' ? identity.name.trim() : '';
  const userUuid = typeof identity.user_uuid === 'string' ? identity.user_uuid.trim() : '';
  const subject = typeof identity.sub === 'string' ? identity.sub.trim() : '';
  const identifier = userUuid || subject || email;
  if (!identifier) return null;
  return {
    identifier,
    displayName: name || email || userUuid || subject,
    source: 'cloudflare-access',
  };
}

function accessConfiguration(env: AccessConfiguration): {
  issuer: string;
  audience: string;
  certsUrl: URL;
} | null {
  const configuredDomain = env.CLOUDFLARE_ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.CLOUDFLARE_ACCESS_AUDIENCE?.trim();
  if (!configuredDomain || !audience) return null;
  try {
    const teamDomain = new URL(configuredDomain);
    if (teamDomain.protocol !== 'https:' || teamDomain.pathname !== '/') return null;
    return {
      issuer: teamDomain.origin,
      audience,
      certsUrl: new URL('/cdn-cgi/access/certs', teamDomain),
    };
  } catch {
    return null;
  }
}

async function principalFromAccessJwt(
  request: Request,
  env: AccessConfiguration,
  jwksFetch?: FetchImplementation,
): Promise<
  | { kind: 'authorized'; principal: SystemOperatorPrincipal }
  | { kind: 'missing' }
  | { kind: 'misconfigured' }
  | { kind: 'invalid'; errorCode: string }
> {
  const token = request.headers.get('Cf-Access-Jwt-Assertion')?.trim();
  if (!token) return { kind: 'missing' };
  const configuration = accessConfiguration(env);
  if (!configuration) return { kind: 'misconfigured' };
  try {
    const jwks = createRemoteJWKSet(configuration.certsUrl, {
      timeoutDuration: 5_000,
      ...(jwksFetch ? { [customFetch]: jwksFetch } : {}),
    });
    const { payload } = await jwtVerify<JWTPayload>(token, jwks, {
      issuer: configuration.issuer,
      audience: configuration.audience,
      algorithms: ['RS256'],
    });
    const principal = principalFromIdentity(payload);
    if (!principal) return { kind: 'invalid', errorCode: 'identity_incomplete' };
    return { kind: 'authorized', principal };
  } catch (error) {
    return {
      kind: 'invalid',
      errorCode: typeof error === 'object' && error !== null && 'code' in error
        && typeof error.code === 'string'
        ? error.code
        : error instanceof Error
          ? error.name
          : 'UnknownError',
    };
  }
}

export async function authorizeSystemOperator(
  request: Request,
  env: AccessConfiguration,
  context: ExecutionContext,
  assetRequest = false,
  jwksFetch?: FetchImplementation,
): Promise<SystemOperatorAuthorization> {
  const url = new URL(request.url);
  if (
    loopbackHosts.has(url.hostname)
    && (assetRequest || request.headers.get('X-System-Operations-Local') === 'dashboard')
  ) {
    return {
      ok: true,
      principal: {
        identifier: 'local-development',
        displayName: 'Local system operator',
        source: 'local-development',
      },
    };
  }

  if (context.access) {
    try {
      const identity = await context.access.getIdentity();
      const principal = identity ? principalFromIdentity(identity) : null;
      if (principal) return { ok: true, principal };
    } catch (error) {
      console.error(JSON.stringify({
        message: 'system_operator_identity_lookup_failed',
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }));
    }
  }

  const jwtAuthorization = await principalFromAccessJwt(request, env, jwksFetch);
  if (jwtAuthorization.kind === 'authorized') {
    return { ok: true, principal: jwtAuthorization.principal };
  }
  if (jwtAuthorization.kind === 'misconfigured') {
    return {
      ok: false,
      response: json(503, { error: 'Cloudflare Access verification is not configured' }),
    };
  }
  if (jwtAuthorization.kind === 'invalid') {
    console.error(JSON.stringify({
      message: 'system_operator_access_jwt_rejected',
      errorCode: jwtAuthorization.errorCode,
    }));
    return {
      ok: false,
      response: json(403, { error: 'Cloudflare Access authentication is invalid' }),
    };
  }
  return {
    ok: false,
    response: json(403, { error: 'Cloudflare Access authentication is required' }),
  };
}
