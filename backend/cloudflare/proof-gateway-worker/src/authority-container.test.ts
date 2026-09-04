import { describe, expect, it } from 'vitest';

import {
  AuthorityRuntimeNotReadyError,
  authorityRuntimeReady,
} from './authority-container.js';

describe('Server Wallet authority readiness', () => {
  it('allows mutations only after initialization and base chain synchronization complete', () => {
    expect(authorityRuntimeReady({
      phase: 'ready',
      initialization: { status: 'succeeded' },
    })).toBe(true);
    expect(authorityRuntimeReady({
      phase: 'syncing',
      initialization: { status: 'succeeded' },
    })).toBe(false);
    expect(authorityRuntimeReady({
      phase: 'ready',
      initialization: { status: 'running' },
    })).toBe(false);
  });

  it('provides a stable retryable error without exposing Wallet secrets', () => {
    const error = new AuthorityRuntimeNotReadyError(
      'fleet-authority',
      'syncing',
      'succeeded',
    );
    expect(error.code).toBe('authority_runtime_not_ready');
    expect(error.message).toBe(
      'Server Wallet is synchronizing for fleet-authority: phase=syncing, initialization=succeeded',
    );
    expect(error.message).not.toContain('seed');
  });
});
