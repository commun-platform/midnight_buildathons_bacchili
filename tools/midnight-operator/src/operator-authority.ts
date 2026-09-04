import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { deriveOperatorAuthorityHex } from '@midnight-demo/sensor-registry-contract/witnesses';

import { stateDir, type NetworkId } from './config.js';

export interface OperatorAuthority {
  schemaVersion: 1;
  network: NetworkId;
  algorithm: 'Compact-persistentHash-v1';
  operatorSecretHex: string;
  operatorAuthorityHex: string;
  createdAt: string;
}

const bytes32Pattern = /^(?:[0-9a-f]{2}){32}$/u;

function authorityPath(network: NetworkId): string {
  return path.join(stateDir, `operator-authority-${network}.json`);
}

function pendingAuthorityPath(network: NetworkId): string {
  return path.join(stateDir, `operator-authority-${network}.pending.json`);
}

function freshAuthority(network: NetworkId): OperatorAuthority {
  const operatorSecretHex = crypto.randomBytes(32).toString('hex');
  return {
    schemaVersion: 1,
    network,
    algorithm: 'Compact-persistentHash-v1',
    operatorSecretHex,
    operatorAuthorityHex: deriveOperatorAuthorityHex(operatorSecretHex),
    createdAt: new Date().toISOString(),
  };
}

function writeAuthority(file: string, authority: OperatorAuthority): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(authority, null, 2)}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

function validate(value: OperatorAuthority, network: NetworkId): OperatorAuthority {
  if (
    value.schemaVersion !== 1
    || value.network !== network
    || value.algorithm !== 'Compact-persistentHash-v1'
    || !bytes32Pattern.test(value.operatorSecretHex)
    || !bytes32Pattern.test(value.operatorAuthorityHex)
    || !Number.isFinite(Date.parse(value.createdAt))
    || deriveOperatorAuthorityHex(value.operatorSecretHex) !== value.operatorAuthorityHex
  ) throw new Error('Development Operator Authority file is invalid');
  return value;
}

export function getOrCreateOperatorAuthority(network: NetworkId): {
  authority: OperatorAuthority;
  created: boolean;
} {
  const file = authorityPath(network);
  if (fs.existsSync(file)) {
    if ((fs.statSync(file).mode & 0o077) !== 0) {
      throw new Error(`Operator Authority file permissions are too broad: ${file}`);
    }
    return {
      authority: validate(JSON.parse(fs.readFileSync(file, 'utf8')) as OperatorAuthority, network),
      created: false,
    };
  }
  const authority = freshAuthority(network);
  writeAuthority(file, authority);
  return { authority, created: true };
}

export function getOrCreateOperatorAuthorityReplacement(network: NetworkId): OperatorAuthority {
  const file = pendingAuthorityPath(network);
  if (fs.existsSync(file)) {
    if ((fs.statSync(file).mode & 0o077) !== 0) {
      throw new Error(`Pending Operator Authority file permissions are too broad: ${file}`);
    }
    return validate(JSON.parse(fs.readFileSync(file, 'utf8')) as OperatorAuthority, network);
  }
  const replacement = freshAuthority(network);
  writeAuthority(file, replacement);
  return replacement;
}

export function persistOperatorAuthorityReplacement(
  network: NetworkId,
  current: OperatorAuthority,
  replacement: OperatorAuthority,
): string {
  validate(current, network);
  validate(replacement, network);
  if (current.operatorAuthorityHex === replacement.operatorAuthorityHex) {
    throw new Error('Replacement Operator Authority must be different');
  }
  const file = authorityPath(network);
  const pendingFile = pendingAuthorityPath(network);
  if (!fs.existsSync(pendingFile)) throw new Error('Pending Operator Authority file is missing');
  const pending = validate(
    JSON.parse(fs.readFileSync(pendingFile, 'utf8')) as OperatorAuthority,
    network,
  );
  if (pending.operatorAuthorityHex !== replacement.operatorAuthorityHex) {
    throw new Error('Pending Operator Authority does not match the confirmed replacement');
  }
  const archive = path.join(
    stateDir,
    `operator-authority-${network}-retired-${current.createdAt.replaceAll(/[:.]/gu, '-')}.json`,
  );
  if (!fs.existsSync(file)) throw new Error('Current Operator Authority file is missing');
  if (fs.existsSync(archive)) throw new Error(`Retired Operator Authority archive already exists: ${archive}`);
  fs.copyFileSync(file, archive, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(archive, 0o600);
  fs.renameSync(pendingFile, file);
  fs.chmodSync(file, 0o600);
  return archive;
}
