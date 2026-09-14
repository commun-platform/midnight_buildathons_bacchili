import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';

import { deviceWalletHome, type NetworkId } from './config.js';

interface WalletFile {
  version: 1;
  seed: string;
  mnemonic?: string;
  createdAt: string;
}

export interface WalletCredentials {
  seed: string;
  mnemonic?: string;
  created: boolean;
}

const seedPattern = /^(?:[0-9a-fA-F]{2}){16,64}$/;

function normalizeMnemonic(value: string): string {
  return value.trim().toLowerCase().split(/\s+/).join(' ');
}

function walletPath(network: NetworkId): string {
  return path.join(deviceWalletHome, network, 'credentials.json');
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

export function getOrCreateWalletCredentials(network: NetworkId, allowCreate = true): WalletCredentials {
  const existing = readJson<WalletFile>(walletPath(network));
  if (existing?.version === 1 && seedPattern.test(existing.seed)) {
    if (existing.mnemonic) {
      const normalized = normalizeMnemonic(existing.mnemonic);
      if (!validateMnemonic(normalized, wordlist)) {
        throw new Error(`Device wallet file contains an invalid mnemonic: ${walletPath(network)}`);
      }
    }
    return { seed: existing.seed, created: false };
  }

  if (existing || !allowCreate) {
    throw new Error('Device transaction credentials are missing or invalid; initialize and back up the identity explicitly');
  }

  const mnemonic = generateMnemonic(wordlist, 256);
  const seed = Buffer.from(mnemonicToSeedSync(mnemonic)).toString('hex');
  writeSecretJson(walletPath(network), {
    version: 1,
    seed,
    mnemonic,
    createdAt: new Date().toISOString(),
  } satisfies WalletFile);
  return { seed, mnemonic, created: true };
}
