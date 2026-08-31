import { describe, expect, it } from 'vitest';

import { requiredBlockHeight } from './wave1-api.js';

describe('Proof result block height validation', () => {
  it.each(['0', '1', '2317466'])('accepts numeric block height %s', (value) => {
    expect(requiredBlockHeight(value)).toBe(value);
  });

  it.each([
    'confirmed-by-indexer',
    '-1',
    '01',
    '1.5',
    '',
    null,
    2_317_466,
  ])('rejects invalid block height %s', (value) => {
    expect(() => requiredBlockHeight(value)).toThrow(/blockHeight/u);
  });
});
