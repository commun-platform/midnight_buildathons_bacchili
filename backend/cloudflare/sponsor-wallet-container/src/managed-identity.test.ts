import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  deriveManagedDeviceAuthorityHex,
} from './managed-attestation.js';
import { deriveManagedDeviceSecretHex } from './managed-identity.js';
import { deriveDeviceAuthorityHex } from './sensor-registry-witnesses.js';

describe('Managed Source contract authority', () => {
  it('deterministically derives a distinct Device authority per Project and source', () => {
    const root = '11'.repeat(32);
    const first = deriveManagedDeviceSecretHex(root, 'project-1', 'source-1');
    const repeated = deriveManagedDeviceSecretHex(root, 'project-1', 'source-1');
    const otherSource = deriveManagedDeviceSecretHex(root, 'project-1', 'source-2');
    const otherProject = deriveManagedDeviceSecretHex(root, 'project-2', 'source-1');
    assert.equal(first, repeated);
    assert.notEqual(first, root);
    assert.notEqual(first, otherSource);
    assert.notEqual(first, otherProject);
    assert.equal(
      deriveManagedDeviceAuthorityHex(root, 'project-1', 'source-1'),
      deriveDeviceAuthorityHex(first),
    );
  });

  it('rejects an invalid root without deriving any authority', () => {
    assert.throws(
      () => deriveManagedDeviceSecretHex('not-a-secret', 'project-1', 'source-1'),
      /root secret is invalid/u,
    );
  });
});
