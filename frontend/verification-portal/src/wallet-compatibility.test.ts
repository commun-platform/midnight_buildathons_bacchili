import { describe, expect, it } from 'vitest';

import { requireWalletShieldedAddresses } from './wallet-compatibility.js';

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
});
