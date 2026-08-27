import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';

import { developmentEnvPath, stateDir, type NetworkId } from './config.js';

export interface WalletCredentials {
  seed: string;
  mnemonic?: string;
  created: boolean;
}

export interface DeploymentRecord {
  contractAddress: string;
  deployerAddress: string;
  deployedAt: string;
}

const seedPattern = /^(?:[0-9a-fA-F]{2}){16,64}$/;

function normalizeMnemonic(value: string): string {
  return value.trim().toLowerCase().split(/\s+/).join(' ');
}

function deploymentPath(network: NetworkId): string {
  return path.join(stateDir, `deployment-${network}.json`);
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function writeSecretJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export function getOrCreateWalletCredentials(network: NetworkId): WalletCredentials {
  const envSeed = process.env.DEVELOPMENT_WALLET_SEED?.trim();
  const envMnemonic = process.env.DEVELOPMENT_WALLET_MNEMONIC?.trim();
  if (envSeed && envMnemonic) throw new Error('Set only one of DEVELOPMENT_WALLET_SEED or DEVELOPMENT_WALLET_MNEMONIC');

  if (envSeed) {
    const normalized = envSeed.replace(/^0x/i, '');
    if (!seedPattern.test(normalized)) throw new Error('DEVELOPMENT_WALLET_SEED is not valid hex seed material');
    return { seed: normalized, created: false };
  }

  if (envMnemonic) {
    const normalized = normalizeMnemonic(envMnemonic);
    if (!validateMnemonic(normalized, wordlist)) throw new Error('DEVELOPMENT_WALLET_MNEMONIC is invalid');
    return {
      seed: Buffer.from(mnemonicToSeedSync(normalized)).toString('hex'),
      mnemonic: normalized,
      created: false,
    };
  }

  if (!fs.existsSync(developmentEnvPath)) {
    throw new Error(`Create ${developmentEnvPath} from .env.development.example before initializing the development wallet`);
  }
  const mnemonic = generateMnemonic(wordlist, 256);
  const seed = Buffer.from(mnemonicToSeedSync(mnemonic)).toString('hex');
  persistDevelopmentMnemonic(mnemonic);
  return { seed, mnemonic, created: true };
}

function persistDevelopmentMnemonic(mnemonic: string): void {
  const lines = fs.readFileSync(developmentEnvPath, 'utf8').split(/\r?\n/);
  let foundMnemonic = false;
  let foundSeed = false;
  const updated = lines.map((line) => {
    if (line.startsWith('DEVELOPMENT_WALLET_MNEMONIC=')) {
      foundMnemonic = true;
      return `DEVELOPMENT_WALLET_MNEMONIC=${mnemonic}`;
    }
    if (line.startsWith('DEVELOPMENT_WALLET_SEED=')) {
      foundSeed = true;
      return 'DEVELOPMENT_WALLET_SEED=';
    }
    return line;
  });
  if (!foundMnemonic) updated.push(`DEVELOPMENT_WALLET_MNEMONIC=${mnemonic}`);
  if (!foundSeed) updated.push('DEVELOPMENT_WALLET_SEED=');
  const temporary = `${developmentEnvPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${updated.join('\n').replace(/\n+$/, '')}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  fs.renameSync(temporary, developmentEnvPath);
  fs.chmodSync(developmentEnvPath, 0o600);
  process.env.DEVELOPMENT_WALLET_MNEMONIC = mnemonic;
  delete process.env.DEVELOPMENT_WALLET_SEED;
}

export function loadDeployment(network: NetworkId): DeploymentRecord | null {
  return readJson<DeploymentRecord>(deploymentPath(network));
}

export function saveDeployment(network: NetworkId, deployment: DeploymentRecord): void {
  writeSecretJson(deploymentPath(network), deployment);
}
