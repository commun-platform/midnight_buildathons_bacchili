import { resolveNetwork, type NetworkConfig } from './config.js';
import {
  deviceCommitmentForId,
  confirmedTransactionId,
  disableRegisteredDevice,
  deploySensorRegistry,
  queryRegistry,
  registerAdditionalDevice,
  registerInitialConfiguration,
  rotateRegisteredDeviceAuthority,
} from './midnight.js';
import {
  bytesToHex,
  hexToBytes,
  utcDayStartMinute,
  validateOperationalDayBoundary,
  type ThresholdPolicyMode,
} from '@midnight-demo/shared';
import { getOrCreateOperatorAuthority } from './operator-authority.js';
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

type Command = 'funding' | 'wallet' | 'deploy' | 'register-device' | 'rotate-device' | 'disable-device' | 'status';

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

function numericFlag(name: string, fallback: number): number {
  const raw = flag(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a finite number`);
  return value;
}

function positiveIntegerFlag(name: string, fallback: number): number {
  const value = numericFlag(name, fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer`);
  return value;
}

function operationalDayBoundary(fallback?: { timeZoneOffsetMinutes: number; localDayStartHour: number }) {
  return validateOperationalDayBoundary({
    timeZoneOffsetMinutes: numericFlag(
      'time-zone-offset-minutes',
      fallback?.timeZoneOffsetMinutes ?? 0,
    ),
    localDayStartHour: numericFlag(
      'local-day-start-hour',
      fallback?.localDayStartHour ?? 0,
    ),
  });
}

function policyMode(): ThresholdPolicyMode {
  const value = flag('policy-mode') ?? 'closed-range';
  if (value !== 'closed-range' && value !== 'upper-bound' && value !== 'lower-bound') {
    throw new Error('--policy-mode must be closed-range, upper-bound, or lower-bound');
  }
  return value;
}

function epochFlag(name: string): bigint {
  const value = flag(name);
  if (!value) return 0n;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error(`--${name} must be an ISO-8601 timestamp`);
  return BigInt(Math.floor(milliseconds / 1000));
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

type RegistrySnapshot = Awaited<ReturnType<typeof queryRegistry>>;

async function waitForRegistryState(
  network: NetworkConfig,
  contractAddress: string,
  description: string,
  matches: (snapshot: RegistrySnapshot) => boolean,
): Promise<RegistrySnapshot> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const snapshot = await queryRegistry(network, contractAddress);
      if (matches(snapshot)) return snapshot;
      lastError = new Error(`${description} is not visible in the Indexer yet`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(
    `${description} could not be confirmed from the Indexer: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function runDeploy(network: NetworkConfig): Promise<string> {
  const authorityHex = flag('device-authority')?.trim().replace(/^0x/iu, '');
  if (!authorityHex) {
    throw new Error('--device-authority is required; transfer only the Pi enrollment public value');
  }
  const deviceAuthority = hexToBytes(authorityHex);
  if (deviceAuthority.length !== 32) throw new Error('--device-authority must contain 32 bytes');
  const deviceId = flag('device-id')?.trim() || 'edge-temp-001';
  const policyId = flag('policy-id')?.trim() || 'temperature-v1';
  const assignmentId = flag('assignment-id')?.trim() || `${deviceId}-${policyId}-wave1`;
  const mode = policyMode();
  const minimum = numericFlag('min', 10);
  const maximum = numericFlag('max', 35);
  if (mode === 'closed-range' && minimum > maximum) {
    throw new Error('--min must not exceed --max for closed-range');
  }
  const { authority: operatorAuthority, created } = getOrCreateOperatorAuthority(network.networkId);
  if (created) {
    process.stdout.write(
      `Created a development Operator Authority; public value: ${operatorAuthority.operatorAuthorityHex}\n`,
    );
  }
  const deviceCommitment = await deviceCommitmentForId(deviceId);
  const valueScale = positiveIntegerFlag('value-scale', 100);
  const sensorTypeCode = positiveIntegerFlag('sensor-type-code', 1);
  const unitCode = positiveIntegerFlag('unit-code', 1);
  const policyVersion = positiveIntegerFlag('policy-version', 1);
  const assignmentVersion = positiveIntegerFlag('assignment-version', 1);
  const boundary = operationalDayBoundary();
  const deviceRegistrationVersion = positiveIntegerFlag('device-registration-version', 1);
  const validFromEpoch = epochFlag('valid-from');
  const validUntilEpoch = epochFlag('valid-until');
  if (validUntilEpoch !== 0n && validFromEpoch >= validUntilEpoch) {
    throw new Error('--valid-until must be later than --valid-from');
  }
  const wallet = await connectWallet(network);
  try {
    await ensureDust(wallet, network.faucet);
    const deployed = await deploySensorRegistry(
      wallet,
      network,
      hexToBytes(operatorAuthority.operatorAuthorityHex),
      operatorAuthority.operatorSecretHex,
    );
    const registered = await registerInitialConfiguration(
      wallet,
      network,
      deployed.contractAddress,
      operatorAuthority.operatorSecretHex,
      deviceAuthority,
      deviceCommitment,
      {
        policyId,
        assignmentId,
        mode,
        minimum,
        maximum,
        valueScale,
        sensorTypeCode,
        unitCode,
        policyVersion,
        assignmentVersion,
        ...boundary,
        validFromEpoch,
        validUntilEpoch,
        deviceRegistrationVersion,
      },
    );
    const deviceCommitmentHex = bytesToHex(deviceCommitment);
    await waitForRegistryState(
      network,
      deployed.contractAddress,
      'Initial Device, Policy, and Assignment registration',
      (snapshot) => snapshot.devices.some((device) => (
        device.deviceCommitment === deviceCommitmentHex
        && device.deviceAuthority === authorityHex.toLowerCase()
        && device.active
      )) && snapshot.policies.some((policy) => policy.policyKey === registered.policyKey)
        && snapshot.policyAssignments.some((assignment) => (
          assignment.assignmentKey === registered.assignmentKey
          && assignment.deviceCommitment === deviceCommitmentHex
        )),
    );
    saveDeployment(network.networkId, {
      contractSchemaVersion: 4,
      contractAddress: deployed.contractAddress,
      deploymentTxId: deployed.deploymentTxId,
      deployerAddress: walletAddress(wallet),
      operatorAuthority: operatorAuthority.operatorAuthorityHex,
      deviceAuthority: authorityHex.toLowerCase(),
      deviceCommitment: deviceCommitmentHex,
      deviceId,
      policyId,
      policyKey: registered.policyKey,
      assignmentId,
      assignmentKey: registered.assignmentKey,
      policyMode: mode,
      thresholdMinimum: minimum,
      thresholdMaximum: maximum,
      valueScale,
      sensorTypeCode,
      unitCode,
      policyVersion,
      policyRegisteredTxId: registered.policyTxId,
      assignmentVersion,
      ...boundary,
      utcDayStartMinute: utcDayStartMinute(boundary),
      validFrom: validFromEpoch === 0n
        ? null
        : new Date(Number(validFromEpoch) * 1000).toISOString(),
      validUntil: validUntilEpoch === 0n
        ? null
        : new Date(Number(validUntilEpoch) * 1000).toISOString(),
      devices: [{
        deviceId,
        deviceAuthority: authorityHex.toLowerCase(),
        deviceCommitment: deviceCommitmentHex,
        registrationVersion: deviceRegistrationVersion,
        status: 'registered',
        registeredTxId: registered.deviceTxId,
        authorityTxId: registered.deviceTxId,
        disabledTxId: null,
        policyId,
        assignmentId,
        assignmentKey: registered.assignmentKey,
        assignmentVersion,
        ...boundary,
        utcDayStartMinute: utcDayStartMinute(boundary),
        assignmentRegisteredTxId: registered.assignmentTxId,
        validFrom: validFromEpoch === 0n
          ? null
          : new Date(Number(validFromEpoch) * 1000).toISOString(),
        validUntil: validUntilEpoch === 0n
          ? null
          : new Date(Number(validUntilEpoch) * 1000).toISOString(),
      }],
      deployedAt: new Date().toISOString(),
    });
    return deployed.contractAddress;
  } finally {
    await closeWallet(wallet, network);
  }
}

async function runRegisterDevice(network: NetworkConfig): Promise<void> {
  const deployment = loadDeployment(network.networkId);
  if (!deployment || deployment.contractSchemaVersion !== 4) {
    throw new Error(`No compatible ${network.networkId} fleet deployment found`);
  }
  const authorityHex = flag('device-authority')?.trim().replace(/^0x/iu, '');
  if (!authorityHex || !/^(?:[0-9a-f]{2}){32}$/iu.test(authorityHex)) {
    throw new Error('--device-authority must contain the Device public 32-byte authority value');
  }
  const deviceId = flag('device-id')?.trim();
  if (!deviceId) throw new Error('--device-id is required');
  if (deployment.devices.some((device) => device.deviceId === deviceId)) {
    throw new Error(`Device ${deviceId} already exists in the local deployment record`);
  }
  const policyId = flag('policy-id')?.trim() || deployment.policyId;
  const assignmentId = flag('assignment-id')?.trim() || `${deviceId}-${policyId}-wave1`;
  const assignmentVersion = positiveIntegerFlag('assignment-version', 1);
  const boundary = operationalDayBoundary(deployment);
  const registrationVersion = positiveIntegerFlag('device-registration-version', 1);
  const validFromEpoch = epochFlag('valid-from');
  const validUntilEpoch = epochFlag('valid-until');
  if (validUntilEpoch !== 0n && validFromEpoch >= validUntilEpoch) {
    throw new Error('--valid-until must be later than --valid-from');
  }
  const { authority } = getOrCreateOperatorAuthority(network.networkId);
  if (authority.operatorAuthorityHex !== deployment.operatorAuthority) {
    throw new Error('Local Operator Authority does not match the deployed contract record');
  }
  const deviceCommitment = await deviceCommitmentForId(deviceId);
  const wallet = await connectWallet(network);
  try {
    await ensureDust(wallet, network.faucet);
    const registered = await registerAdditionalDevice(
      wallet,
      network,
      deployment.contractAddress,
      authority.operatorSecretHex,
      hexToBytes(authorityHex),
      deviceCommitment,
      policyId,
      assignmentId,
      registrationVersion,
      assignmentVersion,
      boundary.timeZoneOffsetMinutes,
      boundary.localDayStartHour,
      validFromEpoch,
      validUntilEpoch,
    );
    const deviceCommitmentHex = bytesToHex(deviceCommitment);
    await waitForRegistryState(
      network,
      deployment.contractAddress,
      `Device ${deviceId} registration`,
      (snapshot) => snapshot.devices.some((device) => (
        device.deviceCommitment === deviceCommitmentHex
        && device.deviceAuthority === authorityHex.toLowerCase()
        && device.active
        && Number(device.version) === registrationVersion
      )) && snapshot.policyAssignments.some((assignment) => (
        assignment.assignmentKey === registered.assignmentKey
        && assignment.deviceCommitment === deviceCommitmentHex
      )),
    );
    deployment.devices.push({
      deviceId,
      deviceAuthority: authorityHex.toLowerCase(),
      deviceCommitment: deviceCommitmentHex,
      registrationVersion,
      status: 'registered',
      registeredTxId: registered.deviceTxId,
      authorityTxId: registered.deviceTxId,
      disabledTxId: null,
      policyId,
      assignmentId,
      assignmentKey: registered.assignmentKey,
      assignmentVersion,
      ...boundary,
      utcDayStartMinute: utcDayStartMinute(boundary),
      assignmentRegisteredTxId: registered.assignmentTxId,
      validFrom: validFromEpoch === 0n ? null : new Date(Number(validFromEpoch) * 1000).toISOString(),
      validUntil: validUntilEpoch === 0n ? null : new Date(Number(validUntilEpoch) * 1000).toISOString(),
    });
    saveDeployment(network.networkId, deployment);
    process.stdout.write(`Registered ${deviceId} and its device-bound Policy Assignment on Midnight.\n`);
  } finally {
    await closeWallet(wallet, network);
  }
}

async function runDisableDevice(network: NetworkConfig): Promise<void> {
  const deployment = loadDeployment(network.networkId);
  if (!deployment || deployment.contractSchemaVersion !== 4) {
    throw new Error(`No compatible ${network.networkId} fleet deployment found`);
  }
  const deviceId = flag('device-id')?.trim();
  if (!deviceId) throw new Error('--device-id is required');
  const device = deployment.devices.find((candidate) => candidate.deviceId === deviceId);
  if (!device) throw new Error(`Device ${deviceId} is not in the local deployment record`);
  if (device.status === 'disabled') throw new Error(`Device ${deviceId} is already disabled`);
  const { authority } = getOrCreateOperatorAuthority(network.networkId);
  if (authority.operatorAuthorityHex !== deployment.operatorAuthority) {
    throw new Error('Local Operator Authority does not match the deployed contract record');
  }
  const wallet = await connectWallet(network);
  try {
    await ensureDust(wallet, network.faucet);
    const transaction = await disableRegisteredDevice(
      wallet,
      network,
      deployment.contractAddress,
      authority.operatorSecretHex,
      hexToBytes(device.deviceCommitment),
    );
    await waitForRegistryState(
      network,
      deployment.contractAddress,
      `Device ${deviceId} disabling`,
      (snapshot) => snapshot.devices.some((candidate) => (
        candidate.deviceCommitment === device.deviceCommitment && !candidate.active
      )),
    );
    device.status = 'disabled';
    device.disabledTxId = confirmedTransactionId(transaction, 'Device disabling');
    saveDeployment(network.networkId, deployment);
    process.stdout.write(`Disabled ${deviceId} on Midnight. Revoke its D1 key/session mirror next.\n`);
  } finally {
    await closeWallet(wallet, network);
  }
}

async function runRotateDevice(network: NetworkConfig): Promise<void> {
  const deployment = loadDeployment(network.networkId);
  if (!deployment || deployment.contractSchemaVersion !== 4) {
    throw new Error(`No compatible ${network.networkId} fleet deployment found`);
  }
  const deviceId = flag('device-id')?.trim();
  if (!deviceId) throw new Error('--device-id is required');
  const device = deployment.devices.find((candidate) => candidate.deviceId === deviceId);
  if (!device || device.status !== 'registered') {
    throw new Error(`Active Device ${deviceId} is not in the local deployment record`);
  }
  const authorityHex = flag('device-authority')?.trim().replace(/^0x/iu, '');
  if (!authorityHex || !/^(?:[0-9a-f]{2}){32}$/iu.test(authorityHex)) {
    throw new Error('--device-authority must contain the replacement public 32-byte authority value');
  }
  const newVersion = positiveIntegerFlag('device-registration-version', device.registrationVersion + 1);
  if (newVersion <= device.registrationVersion) {
    throw new Error('--device-registration-version must increase');
  }
  const { authority } = getOrCreateOperatorAuthority(network.networkId);
  if (authority.operatorAuthorityHex !== deployment.operatorAuthority) {
    throw new Error('Local Operator Authority does not match the deployed contract record');
  }
  const wallet = await connectWallet(network);
  try {
    await ensureDust(wallet, network.faucet);
    const transaction = await rotateRegisteredDeviceAuthority(
      wallet,
      network,
      deployment.contractAddress,
      authority.operatorSecretHex,
      hexToBytes(device.deviceCommitment),
      hexToBytes(authorityHex),
      newVersion,
    );
    await waitForRegistryState(
      network,
      deployment.contractAddress,
      `Device ${deviceId} authority rotation`,
      (snapshot) => snapshot.devices.some((candidate) => (
        candidate.deviceCommitment === device.deviceCommitment
        && candidate.deviceAuthority === authorityHex.toLowerCase()
        && candidate.active
        && Number(candidate.version) === newVersion
      )),
    );
    device.deviceAuthority = authorityHex.toLowerCase();
    device.registrationVersion = newVersion;
    device.authorityTxId = confirmedTransactionId(transaction, 'Device Authority rotation');
    saveDeployment(network.networkId, deployment);
    process.stdout.write(`Rotated ${deviceId} Device Authority on Midnight. Sync the D1 mirror next.\n`);
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

  if (command === 'register-device') return runRegisterDevice(network);

  if (command === 'rotate-device') return runRotateDevice(network);

  if (command === 'disable-device') return runDisableDevice(network);

  if (command === 'status') {
    const deployment = loadDeployment(network.networkId);
    const contractAddress = flag('contract') ?? deployment?.contractAddress;
    if (!contractAddress) throw new Error(`No ${network.networkId} deployment found`);
    process.stdout.write(`${JSON.stringify(await queryRegistry(network, contractAddress), null, 2)}\n`);
    return;
  }

  process.stdout.write(
    'Usage: cli.ts <funding|wallet|deploy|register-device|rotate-device|disable-device|status> [--device-id ID] [--device-authority HEX] [options]\n',
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
