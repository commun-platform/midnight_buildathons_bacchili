import { describe, expect, it } from 'vitest';

import {
  isWalletConnectionLost,
  requireWalletShieldedAddresses,
  walletConnectionFailureStage,
} from './wallet-compatibility.js';

describe('Wallet DApp Connector API compatibility', () => {
  it('accepts complete API 4.x shielded address information', () => {
    const addresses = {
      shieldedAddress: 'shielded-address',
      shieldedCoinPublicKey: 'coin-public-key',
      shieldedEncryptionPublicKey: 'encryption-public-key',
    };
    expect(requireWalletShieldedAddresses(addresses)).toBe(addresses);
  });

  it.each([
    ['shieldedAddress'],
    ['shieldedCoinPublicKey'],
    ['shieldedEncryptionPublicKey'],
  ] as const)('rejects a Wallet response without %s', (missingField) => {
    const addresses: Record<string, string> = {
      shieldedAddress: 'shielded-address',
      shieldedCoinPublicKey: 'coin-public-key',
      shieldedEncryptionPublicKey: 'encryption-public-key',
    };
    delete addresses[missingField];
    expect(() => requireWalletShieldedAddresses(addresses)).toThrow(missingField);
  });

  it('recognizes the official disconnected connector error', () => {
    expect(isWalletConnectionLost({
      type: 'DAppConnectorAPIError',
      code: 'Disconnected',
      reason: 'Connection to the Wallet was lost',
    })).toBe(true);
  });

  it('recognizes a Wallet extension channel that can no longer be used', () => {
    expect(isWalletConnectionLost(new Error(
      "Remote API with channel 'midnight-authenticator' was shutdown: object can no longer be used.",
    ))).toBe(true);
  });

  it('does not treat a rejected authorization as a disconnected Wallet', () => {
    expect(isWalletConnectionLost({
      type: 'DAppConnectorAPIError',
      code: 'Rejected',
      reason: 'User rejected the request',
    })).toBe(false);
  });

  it('extracts a connection failure stage without relying on an Error subclass', () => {
    expect(walletConnectionFailureStage({
      walletConnectionStage: 'authorization',
    })).toBe('authorization');
    expect(walletConnectionFailureStage(new Error('ordinary failure'))).toBeNull();
  });
});
