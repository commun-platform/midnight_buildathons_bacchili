import { describe, expect, it } from 'vitest';

import { walletRuntimeProcessEnvironment } from './wallet-runtime-secrets.js';

const secrets = {
  SPONSOR_WALLET_SEED: '11'.repeat(32),
  OPERATOR_AUTHORITY_SECRET: '44'.repeat(32),
  MANAGED_ATTESTOR_ROOT_SECRET: '55'.repeat(32),
};

describe('Wallet runtime process secret boundaries', () => {
  it('gives the singleton Server Wallet all three narrowly scoped secrets', () => {
    expect(walletRuntimeProcessEnvironment('server-wallet', secrets)).toEqual({
      WALLET_RUNTIME_ROLE: 'server-wallet',
      WALLET_RUNTIME_SEED: secrets.SPONSOR_WALLET_SEED,
      OPERATOR_AUTHORITY_SECRET: secrets.OPERATOR_AUTHORITY_SECRET,
      MANAGED_ATTESTOR_ROOT_SECRET: secrets.MANAGED_ATTESTOR_ROOT_SECRET,
    });
  });

  it('fails before start when an authority secret is absent or malformed', () => {
    expect(() => walletRuntimeProcessEnvironment('server-wallet', {
      ...secrets,
      OPERATOR_AUTHORITY_SECRET: undefined,
    })).toThrow('OPERATOR_AUTHORITY_SECRET');
  });
});
