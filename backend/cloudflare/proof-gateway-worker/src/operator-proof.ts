import { createSqlDatabase } from './storage/index.js';

interface OperatorProofLeaseRow {
  id: string;
  purpose: string;
  status: string;
  issued_at: number;
  expires_at: number;
  revoked_at: number | null;
}

export type OperatorProofAuthorization =
  | { kind: 'not-operator' }
  | { kind: 'authorized'; leaseId: string; purpose: 'contract_deploy' | 'contract_admin' }
  | { kind: 'denied'; response: Response };

function json(status: number, value: unknown): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('Authorization')?.trim() ?? '';
  const match = /^Bearer\s+(.+)$/iu.exec(authorization);
  return match?.[1]?.trim() || null;
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

export async function authorizeOperatorProofRequest(
  request: Request,
  env: Env,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<OperatorProofAuthorization> {
  const token = bearerToken(request);
  if (!token?.startsWith('vsp_operator_')) return { kind: 'not-operator' };
  if (!/^vsp_operator_[A-Za-z0-9_-]{43}$/u.test(token)) {
    return { kind: 'denied', response: json(401, { error: 'Operator Proof Lease is invalid' }) };
  }
  const tokenHash = await sha256Base64Url(token);
  const lease = await createSqlDatabase(env).first<OperatorProofLeaseRow>(
    `SELECT id, purpose, status, issued_at, expires_at, revoked_at
     FROM operator_proof_leases WHERE token_sha256 = ?1 LIMIT 1`,
    [tokenHash],
  );
  if (
    !lease
    || (lease.purpose !== 'contract_deploy' && lease.purpose !== 'contract_admin')
    || lease.status !== 'active'
    || lease.revoked_at !== null
    || lease.expires_at <= nowSeconds
  ) {
    return { kind: 'denied', response: json(401, { error: 'Operator Proof Lease is expired or revoked' }) };
  }
  return { kind: 'authorized', leaseId: lease.id, purpose: lease.purpose } as {
    kind: 'authorized';
    leaseId: string;
    purpose: 'contract_deploy' | 'contract_admin';
  };
}
