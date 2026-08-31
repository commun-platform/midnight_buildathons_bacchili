import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { retryOperation } from './retry.js';

describe('retryOperation', () => {
  it('retries an idempotent transient failure and returns the successful result', async () => {
    let attempt = 0;
    const operation = mock.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('temporary failure');
      return 'ok';
    });

    assert.equal(await retryOperation(operation, { attempts: 2, delayMs: 0 }), 'ok');
    assert.equal(operation.mock.callCount(), 2);
  });

  it('returns the final error after the configured attempts', async () => {
    const operation = mock.fn(async () => {
      throw new Error('persistent failure');
    });

    await assert.rejects(
      retryOperation(operation, { attempts: 2, delayMs: 0 }),
      /persistent failure/u,
    );
    assert.equal(operation.mock.callCount(), 2);
  });
});
