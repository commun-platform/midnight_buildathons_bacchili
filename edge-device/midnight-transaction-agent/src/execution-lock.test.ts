import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { acquireWalletExecutionLock } from './execution-lock.js';

test('Device Wallet execution lock rejects a concurrent operation and can be released', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'device-wallet-lock-'));
  const lockDirectory = path.join(temporary, 'operation.lock');
  try {
    const first = acquireWalletExecutionLock('benchmark', lockDirectory);
    assert.equal(fs.statSync(lockDirectory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(lockDirectory, 'owner.json')).mode & 0o777, 0o600);
    assert.throws(
      () => acquireWalletExecutionLock('submit', lockDirectory),
      /already running.*benchmark/,
    );
    first.release();
    assert.equal(fs.existsSync(lockDirectory), false);

    const next = acquireWalletExecutionLock('submit', lockDirectory);
    next.release();
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('Device Wallet execution lock reclaims a stale process owner', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'device-wallet-stale-lock-'));
  const lockDirectory = path.join(temporary, 'operation.lock');
  const ownerFile = path.join(lockDirectory, 'owner.json');
  try {
    fs.mkdirSync(lockDirectory, { mode: 0o700 });
    fs.writeFileSync(ownerFile, `${JSON.stringify({
      version: 1,
      pid: 2_147_483_647,
      command: 'benchmark',
      startedAt: '2026-08-28T00:00:00.000Z',
      token: 'stale-token',
    })}\n`, { mode: 0o600 });

    const lock = acquireWalletExecutionLock('wallet', lockDirectory);
    const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8')) as { pid: number; command: string };
    assert.equal(owner.pid, process.pid);
    assert.equal(owner.command, 'wallet');
    lock.release();
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
