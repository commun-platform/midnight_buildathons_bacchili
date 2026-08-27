import { resolveNetwork, type NetworkConfig } from './config.js';
import {
  deploySensorRegistry,
  queryRegistry,
} from './midnight.js';
import {
  getOrCreateWalletCredentials,
  loadDeployment,
  saveDeployment,
} from './state.js';
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

type Command = 'funding' | 'wallet' | 'deploy' | 'status';

function formatNight(value: bigint): string {
  return `${value / 1_000_000n}.${(value % 1_000_000n).toString().padStart(6, '0')}`;
}

function formatDust(value: bigint): string {
  return `${value / 1_000_000_000_000_000n}.${(value % 1_000_000_000_000_000n)
    .toString()
    .padStart(15, '0')}`;
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  const inline = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3);
}

function networkFromArgs(): NetworkConfig {
  return resolveNetwork(flag('network'));
}

async function connectWallet(network: NetworkConfig): Promise<WalletContext> {
  const credentials = getOrCreateWalletCredentials(network.networkId);
  if (credentials.created && credentials.mnemonic) {
    process.stdout.write(`New ${network.networkId} wallet recovery phrase:\n${credentials.mnemonic}\n`);
    process.stdout.write('Back up .env.development securely; it is the development wallet recovery source.\n');
  }
  process.stdout.write(`Syncing wallet with Midnight ${network.networkId}...\n`);
  const wallet = await createWallet(network.networkId, network, credentials.seed);
  process.stdout.write(`Wallet: ${walletAddress(wallet)}\n`);
  const state = await syncWallet(wallet, network.networkId);
  const balances = walletBalances(state);
  process.stdout.write(`tNIGHT: ${formatNight(balances.night)}  DUST: ${formatDust(balances.dust)}\n`);
  return wallet;
}

async function inspectFunding(network: NetworkConfig): Promise<void> {
  const credentials = getOrCreateWalletCredentials(network.networkId);
  if (credentials.created && credentials.mnemonic) {
    process.stdout.write(`New ${network.networkId} wallet recovery phrase:\n${credentials.mnemonic}\n`);
    process.stdout.write('Back up .env.development securely; it is the development wallet recovery source.\n');
  }
  process.stdout.write(`Watching Midnight ${network.networkId} for funded tNIGHT...\n`);
  const wallet = await createWallet(network.networkId, network, credentials.seed);
  try {
    process.stdout.write(`Wallet: ${walletAddress(wallet)}\n`);
    const balance = await waitForNightBalance(wallet);
    process.stdout.write(`tNIGHT received: ${formatNight(balance)}\n`);
  } finally {
    await closeWallet(wallet, network);
  }
}

async function closeWallet(wallet: WalletContext, network: NetworkConfig): Promise<void> {
  wallet.checkpoint?.unsubscribe();
  await persistWalletState(wallet, network.networkId);
  await wallet.wallet.stop();
}

async function runDeploy(network: NetworkConfig): Promise<string> {
  const wallet = await connectWallet(network);
  try {
    await ensureDust(wallet, network.faucet);
    const contractAddress = await deploySensorRegistry(wallet, network);
    saveDeployment(network.networkId, {
      contractAddress,
      deployerAddress: walletAddress(wallet),
      deployedAt: new Date().toISOString(),
    });
    return contractAddress;
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

  if (command === 'deploy') {
    const address = await runDeploy(network);
    process.stdout.write(`SensorRegistry deployed: ${address}\n`);
    return;
  }

  if (command === 'status') {
    const deployment = loadDeployment(network.networkId);
    const contractAddress = flag('contract') ?? deployment?.contractAddress;
    if (!contractAddress) throw new Error(`No ${network.networkId} deployment found`);
    process.stdout.write(`${JSON.stringify(await queryRegistry(network, contractAddress), null, 2)}\n`);
    return;
  }

  process.stdout.write('Usage: cli.ts <funding|wallet|deploy|status> [options]\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
