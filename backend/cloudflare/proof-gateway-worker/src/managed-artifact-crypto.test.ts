import { describe, expect, it } from 'vitest';

import {
  decryptManagedArtifact,
  encryptManagedArtifact,
  type ManagedArtifactBinding,
} from './managed-artifact-crypto.js';

const key = '11'.repeat(32);
const binding: ManagedArtifactBinding = {
  objectKey: 'managed-source-private/source-a/2026-09-01.v2.enc',
  sourceId: 'source-a',
  runId: 'run-a',
  periodDate: '2026-09-01',
};

describe('managed artifact authenticated encryption', () => {
  it('round-trips private proof input without placing it in the envelope', async () => {
    const privateValue = {
      nonce: 'private-nonce',
      summaries: [{ minimum: 10.5, maximum: 31.2, average: 22.1 }],
    };
    const envelope = await encryptManagedArtifact(privateValue, key, binding);
    expect(JSON.stringify(envelope)).not.toContain('private-nonce');
    expect(JSON.stringify(envelope)).not.toContain('31.2');
    await expect(decryptManagedArtifact(envelope, key, binding)).resolves.toEqual(privateValue);
  });

  it.each([
    ['another key', '22'.repeat(32), binding],
    ['another object key', key, { ...binding, objectKey: `${binding.objectKey}.moved` }],
    ['another run', key, { ...binding, runId: 'run-b' }],
    ['another period', key, { ...binding, periodDate: '2026-09-02' }],
  ])('rejects ciphertext bound to %s', async (_label, candidateKey, candidateBinding) => {
    const envelope = await encryptManagedArtifact({ private: true }, key, binding);
    await expect(decryptManagedArtifact(envelope, candidateKey, candidateBinding))
      .rejects.toThrow('Managed artifact authentication failed');
  });

  it('rejects modified ciphertext', async () => {
    const envelope = await encryptManagedArtifact({ private: true }, key, binding);
    // Change a fully significant Base64URL character. Mutating the final
    // character can alter padding bits only and decode to the original bytes.
    const first = envelope.ciphertext.startsWith('A') ? 'B' : 'A';
    const changed = { ...envelope, ciphertext: `${first}${envelope.ciphertext.slice(1)}` };
    await expect(decryptManagedArtifact(changed, key, binding))
      .rejects.toThrow('Managed artifact authentication failed');
  });
});
