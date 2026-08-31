import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  browserPolicyCanonicalMessage,
  browserProjectCanonicalMessage,
  browserProvisioningCanonicalMessage,
  type BrowserPolicyAuthorization,
  type BrowserProjectAuthorization,
  type BrowserProvisioningAuthorization,
} from '@midnight-demo/shared/browser-provisioning';
import {
  sampleSigningKey,
  signData,
  signatureVerifyingKey,
} from '@midnight-ntwrk/onchain-runtime-v3';

import { verifyBrowserProvisioningAuthorization } from './operator-registration.js';
import { verifyWalletSignatureRequest } from './wallet-signature.js';

function signedAuthorization(
  timestamp = '2026-08-30T00:00:00.000Z',
): BrowserProvisioningAuthorization {
  const signingKey = sampleSigningKey();
  const unsigned = {
    deviceId: 'review-device-001',
    keyId: '-f88kSuPEq4rh3PUHUWp2CmVgwhQ7pHEnqhGsB2Xtgk',
    deviceAuthority: 'ab'.repeat(32),
    policyId: 'temperature-v1',
    challengeId: 'challenge-001',
    nonce: 'nonce-001',
    timestamp,
  };
  const data = browserProvisioningCanonicalMessage(unsigned);
  return {
    ...unsigned,
    walletSignature: {
      data,
      signature: signData(signingKey, new TextEncoder().encode(data)),
      verifyingKey: signatureVerifyingKey(signingKey),
    },
  };
}

describe('Browser provisioning Wallet authorization', () => {
  it('accepts an official signature whose key ID starts with a Base64URL symbol', () => {
    assert.doesNotThrow(() => verifyBrowserProvisioningAuthorization(signedAuthorization()));
  });

  it('does not expire a valid signature again after the Worker accepted the Job', () => {
    assert.doesNotThrow(() => verifyBrowserProvisioningAuthorization(
      signedAuthorization('2000-01-01T00:00:00.000Z'),
    ));
  });

  it('rejects a signature replayed for another Device', () => {
    const authorization = signedAuthorization();
    authorization.deviceId = 'review-device-002';
    assert.throws(
      () => verifyBrowserProvisioningAuthorization(authorization),
      /Midnight Wallet signature verification failed/u,
    );
  });

  it('verifies the same request in the health supervisor without the Wallet runtime', () => {
    const authorization = signedAuthorization();
    assert.doesNotThrow(() => verifyWalletSignatureRequest(
      'verify-wallet-signature-v1',
      new TextEncoder().encode(JSON.stringify(authorization)),
    ));
  });

  it('verifies a one-time Browser Project session authorization', () => {
    const signingKey = sampleSigningKey();
    const unsigned = {
      challengeId: 'project-challenge-001',
      nonce: 'project-nonce-001',
      timestamp: '2026-08-31T00:00:00.000Z',
    };
    const data = browserProjectCanonicalMessage(unsigned);
    const authorization: BrowserProjectAuthorization = {
      ...unsigned,
      walletSignature: {
        data,
        signature: signData(signingKey, new TextEncoder().encode(data)),
        verifyingKey: signatureVerifyingKey(signingKey),
      },
    };

    assert.doesNotThrow(() => verifyWalletSignatureRequest(
      'verify-project-signature-v1',
      new TextEncoder().encode(JSON.stringify(authorization)),
    ));
    authorization.challengeId = 'project-challenge-replayed';
    assert.throws(() => verifyWalletSignatureRequest(
      'verify-project-signature-v1',
      new TextEncoder().encode(JSON.stringify(authorization)),
    ), /signature verification failed/u);
  });

  it('binds a Browser Policy signature to its Project, mode, and centi-degree bounds', () => {
    const signingKey = sampleSigningKey();
    const unsigned = {
      projectId: 'project-001',
      policyId: 'policy-001',
      name: 'Concrete curing temperature',
      mode: 'closed-range' as const,
      minimumCentiCelsius: 1_000,
      maximumCentiCelsius: 3_500,
      challengeId: 'policy-challenge-001',
      nonce: 'policy-nonce-001',
      timestamp: '2026-08-31T00:00:00.000Z',
    };
    const data = browserPolicyCanonicalMessage(unsigned);
    const authorization: BrowserPolicyAuthorization = {
      ...unsigned,
      walletSignature: {
        data,
        signature: signData(signingKey, new TextEncoder().encode(data)),
        verifyingKey: signatureVerifyingKey(signingKey),
      },
    };

    assert.doesNotThrow(() => verifyWalletSignatureRequest(
      'verify-policy-signature-v1',
      new TextEncoder().encode(JSON.stringify(authorization)),
    ));
    authorization.maximumCentiCelsius = 3_600;
    assert.throws(() => verifyWalletSignatureRequest(
      'verify-policy-signature-v1',
      new TextEncoder().encode(JSON.stringify(authorization)),
    ), /signature verification failed/u);
  });
});

describe('Operator Policy transaction stages', () => {
  const source = readFileSync(new URL('./operator-policy.ts', import.meta.url), 'utf8');

  it('generates, submits, and confirms the immutable Policy on Midnight', () => {
    for (const stage of [
      'policy_zkp_generating',
      'policy_tx_submitting',
      'policy_tx_submitted',
      'policy_confirmation_waiting',
      'policy_confirmed',
    ]) assert.match(source, new RegExp(stage, 'u'));
    assert.match(source, /deployed\.callTx\.registerThresholdPolicy\(/u);
    assert.match(source, /await waitForPolicy\(/u);
  });
});

describe('Operator registration transaction ordering', () => {
  const source = readFileSync(new URL('./operator-registration.ts', import.meta.url), 'utf8');

  it('confirms the Device before rehearsing the Policy Assignment', () => {
    const deviceConfirmation = source.indexOf("stage: 'device_confirmation_waiting'");
    const rejoinComment = source.indexOf('Rejoin only after the Device transaction is visible');
    const assignmentCall = source.indexOf('deployed.callTx.registerPolicyAssignment(');
    assert.ok(deviceConfirmation >= 0);
    assert.ok(rejoinComment > deviceConfirmation);
    assert.ok(assignmentCall > rejoinComment);
  });

  it('reports proof generation, submission, and confirmation for both transactions', () => {
    for (const stage of [
      'device_zkp_generating',
      'device_tx_submitting',
      'device_confirmation_waiting',
      'device_confirmed',
      'assignment_zkp_generating',
      'assignment_tx_submitting',
      'assignment_confirmation_waiting',
      'assignment_confirmed',
    ]) assert.match(source, new RegExp(stage, 'u'));
  });
});
