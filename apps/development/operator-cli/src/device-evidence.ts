import {
  createHash,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { repoRoot } from './config.js';

export type HourSignaturePayload = {
  domain: 'measurement-hour-root:v1';
  deviceCommitment: string;
  schemaVersion: number;
  localDate: string;
  hourIndex: number;
  hourRoot: string;
  sampleCount: number;
  firstSequence: string;
  lastSequence: string;
  firmwareId: string;
};

export type SignedHourEvidence = {
  payload: HourSignaturePayload;
  signature: string;
};

export type DeviceSignatureBundle = {
  domain: 'measurement-device-signatures:v1';
  algorithm: 'Ed25519';
  publicKey: string;
  hours: SignedHourEvidence[];
};

export type OutlierReasonPayload = {
  domain: 'measurement-outlier-reason:v1';
  dayRoot: string;
  hourIndex: number;
  reasonCode: string;
  reasonText: string;
  operatorId: string;
  recordedAt: string;
  previousReasonHash: string;
};

export type SignedOutlierReason = {
  payload: OutlierReasonPayload;
  reasonHash: string;
  algorithm: 'Ed25519';
  publicKey: string;
  signature: string;
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(',')}}`;
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function keyPaths(keyName: string) {
  const certificateDir = path.join(repoRoot, '.certificate');
  return {
    privateKey: path.join(certificateDir, 'private', `${keyName}.pem`),
    publicKey: path.join(certificateDir, 'public', `${keyName}.pem`),
  };
}

function atomicSecretWrite(file: string, contents: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, contents, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export function ensureSigningKeyPair(keyName: string): { privateKey: string; publicKey: string } {
  const files = keyPaths(keyName);
  if (!fs.existsSync(files.privateKey) || !fs.existsSync(files.publicKey)) {
    const pair = generateKeyPairSync('ed25519');
    atomicSecretWrite(files.privateKey, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    fs.mkdirSync(path.dirname(files.publicKey), { recursive: true, mode: 0o755 });
    fs.writeFileSync(
      files.publicKey,
      pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      { mode: 0o644 },
    );
  }
  return {
    privateKey: fs.readFileSync(files.privateKey, 'utf8'),
    publicKey: fs.readFileSync(files.publicKey, 'utf8'),
  };
}

export function publicKeyCommitment(publicKey: string): string {
  return sha256Hex(publicKey);
}

export function createDeviceSignatureBundle(
  payloads: HourSignaturePayload[],
  keyName = 'device-ed25519',
): { bundle: DeviceSignatureBundle; bundleHash: string } {
  if (payloads.length !== 24) throw new Error('A daily signature bundle must contain 24 hours');
  const keys = ensureSigningKeyPair(keyName);
  const hours = payloads.map((payload) => ({
    payload,
    signature: sign(null, Buffer.from(canonicalize(payload)), keys.privateKey).toString('base64'),
  }));
  const bundle: DeviceSignatureBundle = {
    domain: 'measurement-device-signatures:v1',
    algorithm: 'Ed25519',
    publicKey: keys.publicKey,
    hours,
  };
  return { bundle, bundleHash: sha256Hex(canonicalize(bundle)) };
}

export function verifyDeviceSignatureBundle(
  bundle: DeviceSignatureBundle,
  expectedBundleHash: string,
): boolean {
  if (sha256Hex(canonicalize(bundle)) !== expectedBundleHash) return false;
  return bundle.hours.length === 24 && bundle.hours.every(({ payload, signature }) =>
    verify(
      null,
      Buffer.from(canonicalize(payload)),
      bundle.publicKey,
      Buffer.from(signature, 'base64'),
    ));
}

export function createSignedOutlierReason(
  payload: OutlierReasonPayload,
  keyName = 'operator-ed25519',
): SignedOutlierReason {
  if (payload.hourIndex < 0 || payload.hourIndex > 23) throw new Error('hourIndex must be between 0 and 23');
  const keys = ensureSigningKeyPair(keyName);
  const canonicalPayload = canonicalize(payload);
  const reasonHash = sha256Hex(canonicalPayload);
  return {
    payload,
    reasonHash,
    algorithm: 'Ed25519',
    publicKey: keys.publicKey,
    signature: sign(null, Buffer.from(reasonHash, 'hex'), keys.privateKey).toString('base64'),
  };
}

export function verifySignedOutlierReason(reason: SignedOutlierReason): boolean {
  const reasonHash = sha256Hex(canonicalize(reason.payload));
  return reasonHash === reason.reasonHash && verify(
    null,
    Buffer.from(reasonHash, 'hex'),
    reason.publicKey,
    Buffer.from(reason.signature, 'base64'),
  );
}
