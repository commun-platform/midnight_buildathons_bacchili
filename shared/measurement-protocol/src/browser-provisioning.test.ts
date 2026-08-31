import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  browserPolicyCanonicalMessage,
  browserProjectCanonicalMessage,
  deriveBrowserWalletDeviceId,
} from './browser-provisioning.js';

describe('Wallet-derived Browser Device ID', () => {
  it('is deterministic, address-like, and does not expose the Wallet identifier', async () => {
    const walletKey = '11'.repeat(32);
    const first = await deriveBrowserWalletDeviceId(walletKey, 'measurement-authenticity-01');
    const second = await deriveBrowserWalletDeviceId(walletKey, 'measurement-authenticity-01');

    assert.equal(second, first);
    assert.match(first, /^device-[0-9a-f]{64}$/u);
    assert.equal(first.includes(walletKey), false);
  });

  it('binds a Project session signature to its one-time challenge', () => {
    const first = browserProjectCanonicalMessage({
      challengeId: 'project-challenge-1',
      nonce: 'nonce-1',
      timestamp: '2026-08-31T00:00:00.000Z',
    });
    const replayed = browserProjectCanonicalMessage({
      challengeId: 'project-challenge-2',
      nonce: 'nonce-1',
      timestamp: '2026-08-31T00:00:00.000Z',
    });

    assert.notEqual(replayed, first);
    assert.match(first, /VSP-BROWSER-PROJECT-SESSION-V1/u);
  });

  it('isolates Device IDs between Wallets and projects', async () => {
    const first = await deriveBrowserWalletDeviceId('11'.repeat(32), 'measurement-authenticity-01');
    const anotherWallet = await deriveBrowserWalletDeviceId('22'.repeat(32), 'measurement-authenticity-01');
    const anotherProject = await deriveBrowserWalletDeviceId('11'.repeat(32), 'another-project');

    assert.notEqual(anotherWallet, first);
    assert.notEqual(anotherProject, first);
  });

  it('binds a Policy signature to its Project and exact public bounds', () => {
    const base = {
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
    const first = browserPolicyCanonicalMessage(base);
    const changedProject = browserPolicyCanonicalMessage({ ...base, projectId: 'project-002' });
    const changedMaximum = browserPolicyCanonicalMessage({ ...base, maximumCentiCelsius: 3_600 });

    assert.match(first, /VSP-BROWSER-POLICY-V1/u);
    assert.notEqual(changedProject, first);
    assert.notEqual(changedMaximum, first);
  });

  it('rejects malformed Wallet public identifiers', async () => {
    await assert.rejects(
      deriveBrowserWalletDeviceId('not-a-wallet-key', 'measurement-authenticity-01'),
      /Wallet public identifier/u,
    );
  });
});
