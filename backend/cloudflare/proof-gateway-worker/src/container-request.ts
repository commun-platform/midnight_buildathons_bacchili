const maxSponsorTransactionBodyBytes = 4 * 1024 * 1024;
// Browser and Device flows deterministically derive Proof Job IDs from the
// first 24 bytes of SHA-256 (48 lowercase hex characters).
const proofJobIdPattern = /^proof-[0-9a-f]{48}$/u;
const sha256Pattern = /^(?:[0-9a-f]{2}){32}$/u;

export type SponsorArtifactReference = {
  proofJobId: string;
  objectKey: string;
  sha256: string;
  bytes: number;
};

export type ParsedSponsorArtifactReference =
  | { ok: true; reference: SponsorArtifactReference }
  | { ok: false; status: 400 | 413; error: string };

export function parseSponsorArtifactReference(
  request: Request,
  pathname: string,
): ParsedSponsorArtifactReference {
  const proofJobId = request.headers.get('X-Proof-Job-Id') ?? '';
  const objectKey = request.headers.get('X-Sponsor-Artifact-Key') ?? '';
  const sha256 = request.headers.get('X-Sponsor-Artifact-Sha256') ?? '';
  const bytes = Number(request.headers.get('X-Sponsor-Artifact-Bytes'));
  if (!proofJobIdPattern.test(proofJobId) || !sha256Pattern.test(sha256)) {
    return { ok: false, status: 400, error: 'Sponsor Wallet artifact identity is invalid' };
  }
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > maxSponsorTransactionBodyBytes) {
    return { ok: false, status: 413, error: 'Sponsor Wallet artifact size is invalid' };
  }
  const prefix = pathname === '/prepare' ? 'device-transactions' : 'sponsor-transactions';
  const expectedKey = `${prefix}/${proofJobId}/${sha256}.tx`;
  if (objectKey !== expectedKey) {
    return { ok: false, status: 400, error: 'Sponsor Wallet artifact key is invalid' };
  }
  return {
    ok: true,
    reference: { proofJobId, objectKey, sha256, bytes },
  };
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
