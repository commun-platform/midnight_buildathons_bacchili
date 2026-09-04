import assert from 'node:assert/strict';
import test from 'node:test';

import {
  requireWalletRuntimeRole,
  walletRuntimeAllows,
  walletRuntimeRoles,
} from './runtime-role-policy.js';

test('accepts only the singleton Server Wallet runtime role', () => {
  assert.deepEqual(walletRuntimeRoles, ['server-wallet']);
  assert.equal(requireWalletRuntimeRole('server-wallet'), 'server-wallet');
  assert.throws(() => requireWalletRuntimeRole('combined'), /invalid/u);
});

test('serves fee sponsorship and both authority scopes from one internal runtime', () => {
  const common = ['/restore', '/health', '/checkpoint'];
  for (const role of walletRuntimeRoles) {
    for (const pathname of common) assert.equal(walletRuntimeAllows(role, pathname), true);
  }

  assert.equal(walletRuntimeAllows('server-wallet', '/prepare'), true);
  assert.equal(walletRuntimeAllows('server-wallet', '/operator/register-device'), true);
  assert.equal(walletRuntimeAllows('server-wallet', '/managed/attest'), true);
  assert.equal(walletRuntimeAllows('server-wallet', '/authority-submit'), false);
});
