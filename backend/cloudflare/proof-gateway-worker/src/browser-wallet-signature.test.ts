import { describe, expect, it } from 'vitest';
import {
  browserPolicyCanonicalMessage,
  browserProjectCanonicalMessage,
  browserProvisioningCanonicalMessage,
} from '@midnight-demo/shared/browser-provisioning';
import {
  sampleSigningKey,
  signData,
  signatureVerifyingKey,
} from '@midnight-ntwrk/onchain-runtime-v3';

import {
  verifyBrowserPolicyAuthorization,
  verifyBrowserProjectAuthorization,
  verifyBrowserProvisioningAuthorization,
} from './browser-wallet-signature.js';

function signature(data: string) {
  const signingKey = sampleSigningKey();
  return {
    data,
    signature: signData(signingKey, new TextEncoder().encode(data)),
    verifyingKey: signatureVerifyingKey(signingKey),
  };
}

describe('stateless Browser Wallet signature admission', () => {
  it('accepts an official Project signature and rejects canonical-message tampering', () => {
    const unsigned = {
      challengeId: 'project-challenge-001',
      nonce: 'project-nonce-001',
      timestamp: '2026-09-03T00:00:00.000Z',
    };
    const data = browserProjectCanonicalMessage(unsigned);
    const authorization = { ...unsigned, walletSignature: signature(data) };

    expect(() => verifyBrowserProjectAuthorization(authorization)).not.toThrow();
    expect(() => verifyBrowserProjectAuthorization({
      ...authorization,
      nonce: 'tampered-nonce',
    })).toThrow(/signature verification failed/u);
  });

  it('binds an official Policy signature to the exact threshold', () => {
    const unsigned = {
      projectId: 'project-001',
      policyId: 'policy-001',
      name: 'Temperature range',
      mode: 'closed-range' as const,
      minimumCentiCelsius: 1_000,
      maximumCentiCelsius: 3_500,
      challengeId: 'policy-challenge-001',
      nonce: 'policy-nonce-001',
      timestamp: '2026-09-03T00:00:00.000Z',
    };
    const data = browserPolicyCanonicalMessage(unsigned);
    const authorization = { ...unsigned, walletSignature: signature(data) };

    expect(() => verifyBrowserPolicyAuthorization(authorization)).not.toThrow();
    expect(() => verifyBrowserPolicyAuthorization({
      ...authorization,
      maximumCentiCelsius: 3_600,
    })).toThrow(/signature verification failed/u);
  });

  it('binds an official Device signature to its Project-derived identity request', () => {
    const unsigned = {
      deviceId: `device-${'11'.repeat(32)}`,
      keyId: '-f88kSuPEq4rh3PUHUWp2CmVgwhQ7pHEnqhGsB2Xtgk',
      deviceAuthority: '22'.repeat(32),
      policyId: 'policy-001',
      challengeId: 'device-challenge-001',
      nonce: 'device-nonce-001',
      timestamp: '2026-09-03T00:00:00.000Z',
    };
    const data = browserProvisioningCanonicalMessage(unsigned);
    const authorization = { ...unsigned, walletSignature: signature(data) };

    expect(() => verifyBrowserProvisioningAuthorization(authorization)).not.toThrow();
    expect(() => verifyBrowserProvisioningAuthorization({
      ...authorization,
      policyId: 'policy-002',
    })).toThrow(/signature verification failed/u);
  });
});
