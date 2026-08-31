import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { deriveDeviceAuthorityHex } from '@midnight-demo/sensor-registry-contract/witnesses';

import { deviceWalletHome, type NetworkId } from './config.js';

interface ContractAuthorityFile {
  schemaVersion: 1;
  network: NetworkId;
  algorithm: 'Compact-persistentHash-v1';
  deviceSecretHex: string;
  deviceAuthorityHex: string;
  createdAt: string;
}

export interface ContractAuthorityEnrollment {
  schemaVersion: 1;
  network: NetworkId;
  algorithm: 'Compact-persistentHash-v1';
  deviceAuthorityHex: string;
  createdAt: string;
}

export interface ContractAuthority extends ContractAuthorityEnrollment {
  deviceSecretHex: string;
}

const bytes32Pattern = /^(?:[0-9a-f]{2}){32}$/u;

function authorityDirectory(network: NetworkId, authorityHome?: string): string {
  return path.resolve(authorityHome ?? path.join(deviceWalletHome, network, 'contract-authority'));
}

function authorityPath(network: NetworkId, authorityHome?: string): string {
  return path.join(authorityDirectory(network, authorityHome), 'authority.json');
}

function enrollmentPath(network: NetworkId, authorityHome?: string): string {
  return path.join(authorityDirectory(network, authorityHome), 'enrollment.json');
}

function writeOwnerOnly(file: string, value: unknown): void {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function requireOwnerOnly(file: string): void {
  if ((fs.statSync(file).mode & 0o077) !== 0) {
    throw new Error(`Contract authority file permissions are too broad: ${file}`);
  }
}

function validateAuthority(value: ContractAuthorityFile, network: NetworkId): ContractAuthority {
  if (
    value.schemaVersion !== 1
    || value.network !== network
    || value.algorithm !== 'Compact-persistentHash-v1'
    || !bytes32Pattern.test(value.deviceSecretHex)
    || !bytes32Pattern.test(value.deviceAuthorityHex)
    || !Number.isFinite(Date.parse(value.createdAt))
  ) throw new Error('Device contract authority file is invalid');
  const expected = deriveDeviceAuthorityHex(value.deviceSecretHex);
  if (expected !== value.deviceAuthorityHex) {
    throw new Error('Device contract authority public value does not match its secret');
  }
  return value;
}

export function generateContractAuthority(
  network: NetworkId,
  authorityHome?: string,
): ContractAuthorityEnrollment {
  const directory = authorityDirectory(network, authorityHome);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const privateFile = authorityPath(network, directory);
  const publicFile = enrollmentPath(network, directory);
  if (fs.existsSync(privateFile) || fs.existsSync(publicFile)) {
    throw new Error(`Device contract authority already exists under ${directory}`);
  }
  const deviceSecretHex = crypto.randomBytes(32).toString('hex');
  const createdAt = new Date().toISOString();
  const authority: ContractAuthorityFile = {
    schemaVersion: 1,
    network,
    algorithm: 'Compact-persistentHash-v1',
    deviceSecretHex,
    deviceAuthorityHex: deriveDeviceAuthorityHex(deviceSecretHex),
    createdAt,
  };
  const enrollment: ContractAuthorityEnrollment = {
    schemaVersion: authority.schemaVersion,
    network: authority.network,
    algorithm: authority.algorithm,
    deviceAuthorityHex: authority.deviceAuthorityHex,
    createdAt: authority.createdAt,
  };
  writeOwnerOnly(privateFile, authority);
  writeOwnerOnly(publicFile, enrollment);
  return enrollment;
}

export function loadContractAuthority(
  network: NetworkId,
  authorityHome?: string,
): ContractAuthority {
  const file = authorityPath(network, authorityHome);
  requireOwnerOnly(file);
  return validateAuthority(readJson<ContractAuthorityFile>(file), network);
}

export function loadContractAuthorityEnrollment(
  network: NetworkId,
  authorityHome?: string,
): ContractAuthorityEnrollment {
  const file = enrollmentPath(network, authorityHome);
  requireOwnerOnly(file);
  const enrollment = readJson<ContractAuthorityEnrollment>(file);
  if (
    enrollment.schemaVersion !== 1
    || enrollment.network !== network
    || enrollment.algorithm !== 'Compact-persistentHash-v1'
    || !bytes32Pattern.test(enrollment.deviceAuthorityHex)
    || !Number.isFinite(Date.parse(enrollment.createdAt))
  ) throw new Error('Device contract authority enrollment is invalid');
  return enrollment;
}

export function contractAuthorityEnrollmentFile(
  network: NetworkId,
  authorityHome?: string,
): string {
  return enrollmentPath(network, authorityHome);
}
