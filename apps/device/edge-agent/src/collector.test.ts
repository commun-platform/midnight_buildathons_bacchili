import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTemperature } from './collector.js';

test('parses Raspberry Pi millidegrees and decimal Celsius', () => {
  assert.equal(parseTemperature('42125\n'), 42.125);
  assert.equal(parseTemperature('21.75\n'), 21.75);
});

test('rejects invalid and implausible sensor values', () => {
  assert.throws(() => parseTemperature('not-a-number'), /invalid value/);
  assert.throws(() => parseTemperature('250000'), /outside the supported range/);
});
