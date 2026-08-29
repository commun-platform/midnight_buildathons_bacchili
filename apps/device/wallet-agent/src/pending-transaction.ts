import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { deviceWalletHome } from './config.js';

interface PendingDeviceTransactionFile {
  version: 1;
  proofJobId: string;
  serializedSha256: string;
  serializedBase64: string;
  createdAt: string;
}

export interface PendingDeviceTransaction {
  bytes: Uint8Array;
  serializedSha256: string;
}

const proofJobIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;

function serializedSha256(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function transactionPath(proofJobId: string, walletHome: string): string {
  if (!proofJobIdPattern.test(proofJobId)) throw new Error('Proof Job ID is invalid');
  return path.join(walletHome, 'pending-transactions', `${proofJobId}.json`);
}

export function loadPendingDeviceTransaction(
  proofJobId: string,
  walletHome = deviceWalletHome,
): PendingDeviceTransaction | null {
  const file = transactionPath(proofJobId, walletHome);
  if (!fs.existsSync(file)) return null;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as PendingDeviceTransactionFile;
  if (
    parsed.version !== 1
    || parsed.proofJobId !== proofJobId
    || !/^(?:[0-9a-f]{2}){32}$/u.test(parsed.serializedSha256)
    || typeof parsed.serializedBase64 !== 'string'
  ) throw new Error('Pending Device transaction metadata is invalid');
  const bytes = Uint8Array.from(Buffer.from(parsed.serializedBase64, 'base64'));
  if (bytes.byteLength === 0 || serializedSha256(bytes) !== parsed.serializedSha256) {
    throw new Error('Pending Device transaction failed its integrity check');
  }
  return { bytes, serializedSha256: parsed.serializedSha256 };
}

export function savePendingDeviceTransaction(
  proofJobId: string,
  bytes: Uint8Array,
  walletHome = deviceWalletHome,
): PendingDeviceTransaction {
  if (bytes.byteLength === 0) throw new Error('Pending Device transaction must not be empty');
  const existing = loadPendingDeviceTransaction(proofJobId, walletHome);
  const hash = serializedSha256(bytes);
  if (existing) {
    if (existing.serializedSha256 !== hash) {
      throw new Error('Proof Job is already bound to another local Device transaction');
    }
    return existing;
  }
  const file = transactionPath(proofJobId, walletHome);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  const value: PendingDeviceTransactionFile = {
    version: 1,
    proofJobId,
    serializedSha256: hash,
    serializedBase64: Buffer.from(bytes).toString('base64'),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
  return { bytes: Uint8Array.from(bytes), serializedSha256: hash };
}
