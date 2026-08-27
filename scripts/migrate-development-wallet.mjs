import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

const sourceEnvPath = path.resolve(process.argv[2] ?? '.env');
const sourceWalletPath = path.resolve(
  process.argv[3] ?? `.state/wallet-${process.env.MIDNIGHT_NETWORK ?? 'preprod'}.json`,
);
const destinationPath = path.resolve(process.argv[4] ?? '.env.development');
const examplePath = path.resolve(path.dirname(destinationPath), '.env.development.example');

function parseEnvironment(contents) {
  const values = new Map();
  for (const line of contents.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator < 1 || line.trimStart().startsWith('#')) continue;
    values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return values;
}

function parseWallet() {
  if (!fs.existsSync(sourceWalletPath)) return {};
  const value = JSON.parse(fs.readFileSync(sourceWalletPath, 'utf8'));
  if (value?.version !== 1) throw new Error(`Unsupported legacy wallet file: ${sourceWalletPath}`);
  return {
    mnemonic: typeof value.mnemonic === 'string' ? value.mnemonic.trim() : '',
    seed: typeof value.seed === 'string' ? value.seed.trim() : '',
  };
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2
    && ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) return trimmed.slice(1, -1);
  return trimmed;
}

function normalizeMnemonic(value) {
  return unquote(value).trim().toLowerCase().split(/\s+/).join(' ');
}

function normalizeSeed(value) {
  return unquote(value).trim().replace(/^0x/i, '').toLowerCase();
}

function setValue(lines, key, value) {
  let found = false;
  const result = lines.map((line) => {
    if (!line.startsWith(`${key}=`)) return line;
    found = true;
    return `${key}=${value}`;
  });
  if (!found) result.push(`${key}=${value}`);
  return result;
}

if (!fs.existsSync(examplePath)) throw new Error(`Development environment example not found: ${examplePath}`);
if (fs.existsSync(destinationPath)) throw new Error(`Refusing to overwrite existing file: ${destinationPath}`);

const legacy = fs.existsSync(sourceEnvPath)
  ? parseEnvironment(fs.readFileSync(sourceEnvPath, 'utf8'))
  : new Map();
const wallet = parseWallet();
const envMnemonic = normalizeMnemonic(legacy.get('DEVELOPMENT_WALLET_MNEMONIC')
  || legacy.get('MIDNIGHT_WALLET_MNEMONIC')
  || '');
const envSeed = normalizeSeed(legacy.get('DEVELOPMENT_WALLET_SEED')
  || legacy.get('MIDNIGHT_WALLET_SEED')
  || '');
const walletMnemonic = normalizeMnemonic(wallet.mnemonic || '');
const walletSeed = normalizeSeed(wallet.seed || '');
const mnemonicCandidates = [envMnemonic, walletMnemonic].filter(Boolean);
if (new Set(mnemonicCandidates).size > 1) {
  throw new Error('Legacy .env and wallet JSON contain different mnemonics; refusing automatic migration');
}
const mnemonic = mnemonicCandidates[0] || '';
if (mnemonic && !validateMnemonic(mnemonic, wordlist)) {
  throw new Error('Legacy wallet contains an invalid mnemonic; refusing automatic migration');
}
const derivedSeed = mnemonic
  ? Buffer.from(mnemonicToSeedSync(mnemonic)).toString('hex')
  : '';
const seedCandidates = [envSeed, walletSeed].filter(Boolean);
if (new Set(seedCandidates).size > 1 || (derivedSeed && seedCandidates.some((value) => value !== derivedSeed))) {
  throw new Error('Legacy wallet recovery sources resolve to different seeds; refusing automatic migration');
}
const seed = mnemonic ? '' : (seedCandidates[0] || '');
if (!mnemonic && !seed) throw new Error('No wallet recovery material was found');

let lines = fs.readFileSync(examplePath, 'utf8').split(/\r?\n/);
for (const key of [
  'MIDNIGHT_NETWORK',
  'MIDNIGHT_PROOF_SERVER_URL',
  'MIDNIGHT_PROOF_SERVER_TOKEN',
  'MIDNIGHT_SYNC_TIMEOUT_MS',
  'MIDNIGHT_DUST_TIMEOUT_MS',
  'MIDNIGHT_DUST_BATCH_SIZE',
]) {
  if (legacy.has(key)) lines = setValue(lines, key, legacy.get(key));
}
const oldPassword = legacy.get('DEVELOPMENT_PRIVATE_STATE_PASSWORD')
  || legacy.get('PRIVATE_STATE_PASSWORD');
if (oldPassword) lines = setValue(lines, 'DEVELOPMENT_PRIVATE_STATE_PASSWORD', oldPassword);
lines = setValue(lines, 'DEVELOPMENT_WALLET_MNEMONIC', mnemonic);
lines = setValue(lines, 'DEVELOPMENT_WALLET_SEED', seed);

const temporaryPath = `${destinationPath}.tmp-${process.pid}`;
fs.writeFileSync(temporaryPath, `${lines.join('\n').replace(/\n+$/, '')}\n`, {
  encoding: 'utf8',
  mode: 0o600,
  flag: 'wx',
});
fs.renameSync(temporaryPath, destinationPath);
fs.chmodSync(destinationPath, 0o600);
process.stdout.write(
  `Migrated development wallet recovery material to ${destinationPath}; no secret values were printed. Back up this file securely.\n`,
);
