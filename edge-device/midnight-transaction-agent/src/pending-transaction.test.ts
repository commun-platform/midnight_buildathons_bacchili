import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  loadPendingDeviceTransaction,
  retirePendingDeviceTransactionForReproof,
  savePendingDeviceTransaction,
} from './pending-transaction.js';

test('retains rejected bytes and retires once per server-authorized reproof generation', (context) => {
  const walletHome = fs.mkdtempSync(path.join(os.tmpdir(), 'reproof-device-transaction-'));
  context.after(() => fs.rmSync(walletHome, { recursive: true, force: true }));
  const job = {
    proofJobId: 'proof-abc', status: 'ready_for_input', sponsorStage: 'reproof_queued',
    attemptCount: 2, deviceTransactionHash: null, sponsorTransactionId: null, attestTxId: null,
  };
  const old = Uint8Array.of(1, 2, 3);
  savePendingDeviceTransaction(job.proofJobId, old, walletHome);
  const file = path.join(walletHome, 'pending-transactions', 'proof-abc.json');
  const before = fs.readFileSync(file);
  retirePendingDeviceTransactionForReproof({ ...job, status: 'submitted' }, walletHome);
  retirePendingDeviceTransactionForReproof({ ...job, deviceTransactionHash: 'bound' }, walletHome);
  assert.deepEqual(loadPendingDeviceTransaction(job.proofJobId, walletHome)?.bytes, old);
  retirePendingDeviceTransactionForReproof(job, walletHome);
  assert.equal(loadPendingDeviceTransaction(job.proofJobId, walletHome), null);
  assert.deepEqual(fs.readFileSync(`${file}.reproof-2`), before);
  const fresh = Uint8Array.of(4, 5, 6);
  savePendingDeviceTransaction(job.proofJobId, fresh, walletHome);
  retirePendingDeviceTransactionForReproof(job, walletHome);
  assert.deepEqual(loadPendingDeviceTransaction(job.proofJobId, walletHome)?.bytes, fresh);
});

test('records an empty old generation so subsequent retries retain new bytes', (context) => {
  const walletHome = fs.mkdtempSync(path.join(os.tmpdir(), 'reproof-empty-'));
  context.after(() => fs.rmSync(walletHome, { recursive: true, force: true }));
  const job = {
    proofJobId: 'proof-abc', status: 'proof_ready', sponsorStage: 'reproof_queued',
    attemptCount: 2, deviceTransactionHash: null, sponsorTransactionId: null, attestTxId: null,
  };
  retirePendingDeviceTransactionForReproof(job, walletHome);
  savePendingDeviceTransaction(job.proofJobId, Uint8Array.of(4), walletHome);
  retirePendingDeviceTransactionForReproof(job, walletHome);
  assert.deepEqual(loadPendingDeviceTransaction(job.proofJobId, walletHome)?.bytes, Uint8Array.of(4));
});

test('atomically persists and idempotently reloads one Device transaction per Proof Job', (context) => {
  const walletHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pending-device-transaction-'));
  context.after(() => fs.rmSync(walletHome, { recursive: true, force: true }));
  const bytes = Uint8Array.of(1, 2, 3, 4);
  const first = savePendingDeviceTransaction('proof-abc', bytes, walletHome);
  const repeated = savePendingDeviceTransaction('proof-abc', bytes, walletHome);
  const loaded = loadPendingDeviceTransaction('proof-abc', walletHome);
  assert.deepEqual(repeated, first);
  assert.deepEqual(loaded, first);
  assert.equal(fs.statSync(path.join(walletHome, 'pending-transactions', 'proof-abc.json')).mode & 0o777, 0o600);
});

test('rejects another transaction for the same Proof Job and detects stored-byte tampering', (context) => {
  const walletHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pending-device-transaction-'));
  context.after(() => fs.rmSync(walletHome, { recursive: true, force: true }));
  savePendingDeviceTransaction('proof-abc', Uint8Array.of(1, 2, 3), walletHome);
  assert.throws(
    () => savePendingDeviceTransaction('proof-abc', Uint8Array.of(4, 5, 6), walletHome),
    /already bound/u,
  );
  const file = path.join(walletHome, 'pending-transactions', 'proof-abc.json');
  const value = JSON.parse(fs.readFileSync(file, 'utf8')) as { serializedBase64: string };
  value.serializedBase64 = Buffer.from([9, 9, 9]).toString('base64');
  fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
  assert.throws(() => loadPendingDeviceTransaction('proof-abc', walletHome), /integrity check/u);
});
