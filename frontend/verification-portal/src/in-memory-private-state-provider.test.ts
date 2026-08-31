import { describe, expect, it } from 'vitest';

import { inMemoryPrivateStateProvider } from './in-memory-private-state-provider.js';

describe('browser private state provider', () => {
  it('isolates Device private state by contract address', async () => {
    const provider = inMemoryPrivateStateProvider<string, { secret: string }>();
    provider.setContractAddress('contract-a');
    await provider.set('sensor', { secret: 'a' });
    provider.setContractAddress('contract-b');
    await provider.set('sensor', { secret: 'b' });

    expect(await provider.get('sensor')).toEqual({ secret: 'b' });
    provider.setContractAddress('contract-a');
    expect(await provider.get('sensor')).toEqual({ secret: 'a' });
  });
});
