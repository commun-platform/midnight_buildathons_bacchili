import { describe, expect, it } from 'vitest';

import { sponsorContainerName } from './sponsor-container.js';

describe('Sponsor Wallet container identity', () => {
  it('uses the canonical singleton instance name', () => {
    expect(sponsorContainerName).toBe('midnight-sponsor-wallet');
  });
});
