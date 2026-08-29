import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  HDWallet,
  Roles,
  createKeystore,
} from '@midnight-ntwrk/wallet-sdk';

export interface SponsorCredentials {
  version: 1;
  network: 'preprod';
  seedHex: string;
  unshieldedAddress: string;
  createdAt: string;
}

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const sponsorCredentialFile = path.join(
  repoRoot,
  '.state',
  'sponsor-wallet',
  'preprod',
  'credentials.json',
);

export function deriveSponsorKeys(seedHex: string) {
  if (!/^(?:[0-9a-f]{2}){32}$/u.test(seedHex)) {
    throw new Error('Sponsor seed must be exactly 32 lowercase hexadecimal bytes');
  }
  const hdWallet = HDWallet.fromSeed(Buffer.from(seedHex, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Sponsor Wallet seed is invalid');
  const derived = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derived.type !== 'keysDerived') throw new Error('Sponsor Wallet key derivation failed');
  hdWallet.hdWallet.clear();
  return derived.keys;
}

export function sponsorAddress(seedHex: string): string {
  setNetworkId('preprod');
  const keys = deriveSponsorKeys(seedHex);
  const keystore = createKeystore(keys[Roles.NightExternal], getNetworkId());
  return keystore.getBech32Address().toString();
}

function readCredentials(): SponsorCredentials | null {
  if (!fs.existsSync(sponsorCredentialFile)) return null;
  const stat = fs.statSync(sponsorCredentialFile);
  if ((stat.mode & 0o077) !== 0) {
    throw new Error('Sponsor credentials must not be accessible by group or other users');
  }
  const parsed = JSON.parse(fs.readFileSync(sponsorCredentialFile, 'utf8')) as SponsorCredentials;
  if (
    parsed.version !== 1
    || parsed.network !== 'preprod'
    || sponsorAddress(parsed.seedHex) !== parsed.unshieldedAddress
  ) throw new Error('Sponsor credentials are malformed or inconsistent');
  return parsed;
}

export function getOrCreateSponsorCredentials(): {
  credentials: SponsorCredentials;
  created: boolean;
} {
  const existing = readCredentials();
  if (existing) return { credentials: existing, created: false };
  const seedHex = crypto.randomBytes(32).toString('hex');
  const credentials: SponsorCredentials = {
    version: 1,
    network: 'preprod',
    seedHex,
    unshieldedAddress: sponsorAddress(seedHex),
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(sponsorCredentialFile), { recursive: true, mode: 0o700 });
  const temporary = `${sponsorCredentialFile}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(credentials, null, 2)}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
  fs.renameSync(temporary, sponsorCredentialFile);
  return { credentials, created: true };
}

export function loadSponsorCredentials(): SponsorCredentials {
  const credentials = readCredentials();
  if (!credentials) {
    throw new Error('Sponsor Wallet has not been created; run npm run sponsor:wallet');
  }
  return credentials;
}
