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
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const operatorSecretHex = crypto.randomBytes(32).toString('hex');
  const authority: OperatorAuthority = {
    schemaVersion: 1,
    network,
    algorithm: 'Compact-persistentHash-v1',
    operatorSecretHex,
    operatorAuthorityHex: deriveOperatorAuthorityHex(operatorSecretHex),
    createdAt: new Date().toISOString(),
  };
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(authority, null, 2)}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
  return { authority, created: true };
}
