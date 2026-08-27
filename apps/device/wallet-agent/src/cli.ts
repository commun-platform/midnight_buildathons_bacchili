import fs from 'node:fs';
import path from 'node:path';

import {
  prepareDataset,
  type PreparedDataset,
  type SensorRecord,
} from '@midnight-demo/shared';

import {
  deviceContractAddress,
  deviceWalletHome,
  repoRoot,
  resolveNetwork,
  type NetworkConfig,
} from './config.js';
import {
  queryRegistry,
  submitDataset,
  type SubmissionResult,
} from './midnight.js';
import { getOrCreateWalletCredentials } from './state.js';
import {
  createWallet,
  ensureDust,
  persistWalletState,
  syncWallet,
  waitForNightBalance,
  walletAddress,
  walletBalances,
  type WalletContext,
} from './wallet.js';

type Command = 'funding' | 'wallet' | 'submit' | 'status';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  const inline = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function numericFlag(name: string, fallback: number): number {
  const raw = flag(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number`);
  return value;
}

function networkFromArgs(): NetworkConfig {
  return resolveNetwork(flag('network'));
}

function formatNight(value: bigint): string {
  return `${value / 1_000_000n}.${(value % 1_000_000n).toString().padStart(6, '0')}`;
}

function formatDust(value: bigint): string {
  return `${value / 1_000_000_000_000_000n}.${(value % 1_000_000_000_000_000n)
    .toString()
    .padStart(15, '0')}`;
}

async function loadPreparedDataset(): Promise<PreparedDataset> {
  const input = flag('input');
  if (!input) throw new Error('--input is required; generated sensor data is not accepted');
  const inputPath = path.isAbsolute(input) ? input : path.resolve(repoRoot, input);
  const parsed = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as PreparedDataset | SensorRecord[];
  if (!Array.isArray(parsed) && parsed.publicData && parsed.privateData) return parsed;
  if (Array.isArray(parsed)) {
    return prepareDataset(parsed, {
      thresholdMin: numericFlag('min', 10),
      thresholdMax: numericFlag('max', 35),
      selectedIndex: numericFlag('selected-index', Math.floor(parsed.length / 2)),
    });
  }
  throw new Error('Input must be a PreparedDataset or SensorRecord array');
}

async function connectWallet(network: NetworkConfig): Promise<WalletContext> {
  const credentials = getOrCreateWalletCredentials(network.networkId);
  if (credentials.created && credentials.mnemonic) {
    process.stdout.write(`New ${network.networkId} device wallet recovery phrase:\n${credentials.mnemonic}\n`);
    process.stdout.write(`Back it up offline. The wallet file is stored under ${deviceWalletHome}.\n`);
  }
  process.stdout.write(`Syncing device wallet with Midnight ${network.networkId}...\n`);
  const wallet = await createWallet(network.networkId, network, credentials.seed);
  process.stdout.write(`Device wallet: ${walletAddress(wallet)}\n`);
  const state = await syncWallet(wallet, network.networkId);
  const balances = walletBalances(state);
  process.stdout.write(`tNIGHT: ${formatNight(balances.night)}  DUST: ${formatDust(balances.dust)}\n`);
  return wallet;
}

async function closeWallet(wallet: WalletContext, network: NetworkConfig): Promise<void> {
  wallet.checkpoint?.unsubscribe();
  await persistWalletState(wallet, network.networkId);
  await wallet.wallet.stop();
}

async function inspectFunding(network: NetworkConfig): Promise<void> {
  const credentials = getOrCreateWalletCredentials(network.networkId);
  if (credentials.created && credentials.mnemonic) {
    process.stdout.write(`New ${network.networkId} device wallet recovery phrase:\n${credentials.mnemonic}\n`);
    process.stdout.write(`Back it up offline. The wallet file is stored under ${deviceWalletHome}.\n`);
  }
  const wallet = await createWallet(network.networkId, network, credentials.seed);
  try {
    process.stdout.write(`Device wallet: ${walletAddress(wallet)}\n`);
    const balance = await waitForNightBalance(wallet);
    process.stdout.write(`tNIGHT received: ${formatNight(balance)}\n`);
  } finally {
    await closeWallet(wallet, network);
  }
}

async function runSubmit(
  network: NetworkConfig,
  dataset: PreparedDataset,
  verifyOnly: boolean,
): Promise<SubmissionResult> {
  const wallet = await connectWallet(network);
  try {
    await ensureDust(wallet, network.faucet);
    return await submitDataset(
      wallet,
      network,
      deviceContractAddress(flag('contract')),
      dataset,
      verifyOnly,
    );
  } finally {
    await closeWallet(wallet, network);
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] as Command | undefined;
  const network = networkFromArgs();

  if (command === 'wallet') {
    const wallet = await connectWallet(network);
    return closeWallet(wallet, network);
  }
  if (command === 'funding') return inspectFunding(network);
  if (command === 'submit') {
    const transactions = await runSubmit(
      network,
      await loadPreparedDataset(),
      hasFlag('verify-only'),
    );
    process.stdout.write(`${JSON.stringify(transactions, null, 2)}\n`);
    return;
  }
  if (command === 'status') {
    const address = deviceContractAddress(flag('contract'));
    process.stdout.write(`${JSON.stringify(await queryRegistry(network, address), null, 2)}\n`);
    return;
  }
  process.stdout.write('Usage: cli.ts <funding|wallet|submit|status> [options]\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
