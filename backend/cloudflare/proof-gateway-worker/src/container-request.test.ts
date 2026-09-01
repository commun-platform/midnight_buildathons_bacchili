import { describe, expect, it } from 'vitest';

import { parseSponsorArtifactReference } from './container-request.js';

const proofJobId = `proof-${'ab'.repeat(24)}`;
const sha256 = 'cd'.repeat(32);

function artifactRequest(pathname: '/prepare' | '/submit', overrides = {}): Request {
  const prefix = pathname === '/prepare' ? 'device-transactions' : 'sponsor-transactions';
  return new Request(`http://sponsor-wallet${pathname}`, {
    method: 'POST',
    headers: {
      'X-Proof-Job-Id': proofJobId,
      'X-Sponsor-Artifact-Key': `${prefix}/${proofJobId}/${sha256}.tx`,
      'X-Sponsor-Artifact-Sha256': sha256,
      'X-Sponsor-Artifact-Bytes': '6100',
      ...overrides,
    },
  });
}

describe('Sponsor Wallet R2 artifact references', () => {
  it('accepts a Device transaction reference for prepare', () => {
    expect(parseSponsorArtifactReference(artifactRequest('/prepare'), '/prepare')).toEqual({
      ok: true,
      reference: {
        proofJobId,
        objectKey: `device-transactions/${proofJobId}/${sha256}.tx`,
        sha256,
        bytes: 6100,
      },
    });
  });

  it('accepts a sponsored transaction reference for submit', () => {
    expect(parseSponsorArtifactReference(artifactRequest('/submit'), '/submit')).toMatchObject({
      ok: true,
      reference: { objectKey: `sponsor-transactions/${proofJobId}/${sha256}.tx` },
    });
  });

  it('rejects another Job key and oversized artifacts', () => {
    const wrongKey = parseSponsorArtifactReference(artifactRequest('/prepare', {
      'X-Sponsor-Artifact-Key': `device-transactions/proof-${'ef'.repeat(32)}/${sha256}.tx`,
    }), '/prepare');
    const oversized = parseSponsorArtifactReference(artifactRequest('/prepare', {
      'X-Sponsor-Artifact-Bytes': String(4 * 1024 * 1024 + 1),
    }), '/prepare');

    expect(wrongKey).toMatchObject({ ok: false, status: 400 });
    expect(oversized).toMatchObject({ ok: false, status: 413 });
  });
});
