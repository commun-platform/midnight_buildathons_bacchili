import { describe, expect, it } from 'vitest';

import { serverWalletContainerName } from './sponsor-container.js';

describe('Server Wallet container identity', () => {
  it('uses the canonical singleton instance name', () => {
    expect(serverWalletContainerName).toBe('midnight-server-wallet');
  });
});
