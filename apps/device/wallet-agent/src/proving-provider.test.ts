import assert from 'node:assert/strict';
import test from 'node:test';

import { refreshingProvingProvider } from './proving-provider.js';

test('refreshes authorization before every proof-server operation', async () => {
  const acquisitions: number[] = [];
  const provider = refreshingProvingProvider(async () => {
    const acquisition = acquisitions.push(acquisitions.length + 1);
    return {
      async check() {
        return [BigInt(acquisition)];
      },
      async prove() {
        return Uint8Array.of(acquisition);
      },
    };
  });

  assert.deepEqual(await provider.check(Uint8Array.of(1), 'submitDailyAttestation'), [1n]);
  assert.deepEqual(await provider.prove(Uint8Array.of(2), 'submitDailyAttestation'), Uint8Array.of(2));
  assert.equal(acquisitions.length, 2);
});
