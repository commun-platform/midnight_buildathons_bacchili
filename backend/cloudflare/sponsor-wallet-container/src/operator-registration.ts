import { Contract, ledger as decodeLedger } from '@midnight-demo/sensor-registry-contract/contract';
import {
  bytesToHex,
  hexToBytes,
  policyAssignmentKey,
  sensorDeviceCommitment,
  thresholdPolicyKey,
  type BrowserProvisioningAuthorization,
} from '@midnight-demo/shared/runtime';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import WebSocketImplementation from 'isomorphic-ws';

import { inMemoryPrivateStateProvider } from './in-memory-private-state-provider.js';
import {
  createSensorPrivateState,
  SENSOR_PRIVATE_STATE_ID,
  witnesses,
  type SensorPrivateState,
} from './sensor-registry-witnesses.js';
import type { AuthorityTransactionRuntime } from './authority-transaction-runtime.js';
import { verifyBrowserProvisioningAuthorization } from './wallet-signature.js';

export { verifyBrowserProvisioningAuthorization } from './wallet-signature.js';

const indexerUrl = 'https://indexer.preprod.midnight.network/api/v4/graphql';
const indexerWsUrl = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
const proofServerUrl = 'http://proof.internal';
const zkConfigPath = process.env.SPONSOR_ZK_CONFIG_PATH
  ?? '/app/midnight/contracts/sensor-registry/src/managed/sensor-registry';

type SensorRegistryCircuit =
  | 'rotateOperatorAuthority'
  | 'registerDevice'
  | 'rotateDeviceAuthority'
  | 'disableDevice'
  | 'registerThresholdPolicy'
  | 'registerPolicyAssignment'
  | 'closePolicyAssignment'
  | 'submitDailyAttestation';

export interface OperatorDeviceRegistration {
  contractAddress: string;
  operatorSecretHex: string;
  deviceId: string;
  deviceAuthority: string;
  policyId: string;
  assignmentId: string;
  deviceRegistrationVersion: number;
  assignmentVersion: number;
  timeZoneOffsetMinutes: number;
  localDayStartHour: number;
  utcDayStartMinute: number;
  validFromEpoch: string;
  validUntilEpoch: string;
  knownDeviceTxId?: string;
  knownAssignmentTxId?: string;
  browserAuthorization?: BrowserProvisioningAuthorization;
}

export type ServiceDeviceRegistration = Omit<OperatorDeviceRegistration, 'browserAuthorization'>;

export type OperatorRegistrationStage =
  | 'sponsor_wallet_ready'
  | 'device_zkp_generating'
  | 'device_tx_submitting'
  | 'device_tx_submitted'
  | 'device_confirmation_waiting'
  | 'device_confirmed'
  | 'assignment_zkp_generating'
  | 'assignment_tx_submitting'
  | 'assignment_tx_submitted'
  | 'assignment_confirmation_waiting'
  | 'assignment_confirmed';

export interface OperatorRegistrationProgress {
  stage: OperatorRegistrationStage;
  transactionId?: string;
}

export type OperatorRegistrationProgressReporter = (
  progress: OperatorRegistrationProgress,
) => void | Promise<void>;

export interface OperatorDeviceRegistrationResult {
  deviceCommitment: string;
  policyKey: string;
  assignmentKey: string;
  deviceTxId: string;
  assignmentTxId: string;
}

interface RegistrationVisibility {
  deviceConfirmed: boolean;
  assignmentConfirmed: boolean;
}

async function registrationVisibility(
  provider: ReturnType<typeof indexerPublicDataProvider>,
  input: OperatorDeviceRegistration,
  deviceCommitment: string,
  policyKey: string,
  assignmentKey: string,
): Promise<RegistrationVisibility> {
  const contractState = await provider.queryContractState(input.contractAddress);
  if (!contractState) throw new Error('Sensor Registry state was not found');
  const state = decodeLedger(contractState.data);
  const deviceConfirmed = Array.from(state.devices, ([key, device]) => (
    bytesToHex(key) === deviceCommitment
    && bytesToHex(device.authority) === input.deviceAuthority
    && device.active
    && device.version === BigInt(input.deviceRegistrationVersion)
  )).some(Boolean);
  const assignmentConfirmed = Array.from(state.policyAssignments, ([key, assignment]) => (
    bytesToHex(key) === assignmentKey
    && bytesToHex(assignment.policyId) === policyKey
    && bytesToHex(assignment.deviceCommitment) === deviceCommitment
    && Number(assignment.timeZoneOffsetMinutesBias) - 840 === input.timeZoneOffsetMinutes
    && Number(assignment.localDayStartHour) === input.localDayStartHour
    && Number(assignment.utcDayStartMinute) === input.utcDayStartMinute
    && assignment.version === BigInt(input.assignmentVersion)
  )).some(Boolean);
  return { deviceConfirmed, assignmentConfirmed };
}

async function waitForRegistration(
  provider: ReturnType<typeof indexerPublicDataProvider>,
  input: OperatorDeviceRegistration,
  deviceCommitment: string,
  policyKey: string,
  assignmentKey: string,
  requireAssignment: boolean,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const visibility = await registrationVisibility(
        provider,
        input,
        deviceCommitment,
        policyKey,
        assignmentKey,
      );
      if (visibility.deviceConfirmed && (!requireAssignment || visibility.assignmentConfirmed)) return;
      lastError = new Error('Registration is not visible in the Indexer yet');
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(
    `Device registration could not be confirmed from the Indexer: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function transactionId(transaction: unknown, operation: string): string {
  const value = (transaction as { public?: { txId?: unknown } })?.public?.txId;
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`${operation} did not return a transaction ID`);
  }
  return String(value);
}

function validate(input: OperatorDeviceRegistration, requireBrowserAuthorization = true): void {
  if (!/^(?:[0-9a-f]{2}){32}$/u.test(input.operatorSecretHex)) {
    throw new Error('Operator Authority secret is invalid');
  }
  if (!/^(?:[0-9a-f]{2}){32}$/u.test(input.deviceAuthority)) {
    throw new Error('Device Authority is invalid');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(input.deviceId)) {
    throw new Error('Device ID is invalid');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(input.policyId)) {
    throw new Error('Policy ID is invalid');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(input.assignmentId)) {
    throw new Error('Assignment ID is invalid');
  }
  if (!input.contractAddress || input.contractAddress.length > 160) {
    throw new Error('Contract address is invalid');
  }
  if (!Number.isSafeInteger(input.deviceRegistrationVersion) || input.deviceRegistrationVersion < 1) {
    throw new Error('Device registration version is invalid');
  }
  if (!Number.isSafeInteger(input.assignmentVersion) || input.assignmentVersion < 1) {
    throw new Error('Assignment version is invalid');
  }
  if (
    !Number.isSafeInteger(input.timeZoneOffsetMinutes)
    || input.timeZoneOffsetMinutes < -840
    || input.timeZoneOffsetMinutes > 840
    || !Number.isSafeInteger(input.localDayStartHour)
    || input.localDayStartHour < 0
    || input.localDayStartHour > 23
    || !Number.isSafeInteger(input.utcDayStartMinute)
    || input.utcDayStartMinute < 0
    || input.utcDayStartMinute > 1439
    || ((input.localDayStartHour * 60 - input.timeZoneOffsetMinutes) % 1440 + 1440) % 1440
      !== input.utcDayStartMinute
  ) throw new Error('Operational day boundary is invalid');
  if (!/^\d+$/u.test(input.validFromEpoch) || !/^\d+$/u.test(input.validUntilEpoch)) {
    throw new Error('Assignment validity is invalid');
  }
  for (const [name, value] of [
    ['knownDeviceTxId', input.knownDeviceTxId],
    ['knownAssignmentTxId', input.knownAssignmentTxId],
  ] as const) {
    if (value !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(value)) {
      throw new Error(`${name} is invalid`);
    }
  }
  if (requireBrowserAuthorization) {
    if (!input.browserAuthorization) throw new Error('Browser provisioning authorization is required');
    verifyBrowserProvisioningAuthorization(input.browserAuthorization);
    if (
      input.browserAuthorization.deviceId !== input.deviceId
      || input.browserAuthorization.deviceAuthority !== input.deviceAuthority
      || input.browserAuthorization.policyId !== input.policyId
    ) throw new Error('Browser provisioning authorization does not match the registration');
  }
}

async function registerAuthorizedDevice(
  runtime: AuthorityTransactionRuntime,
  input: OperatorDeviceRegistration,
  reportProgress: OperatorRegistrationProgressReporter = () => undefined,
): Promise<OperatorDeviceRegistrationResult> {
  await runtime.waitUntilReady();
  await reportProgress({ stage: 'sponsor_wallet_ready' });
  const compiledContract = CompiledContract.make('sensor-registry', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
  const privateState = createSensorPrivateState([], undefined, input.operatorSecretHex);
  const privateStateProvider = inMemoryPrivateStateProvider<string, SensorPrivateState>();
  privateStateProvider.setContractAddress(input.contractAddress);
  await privateStateProvider.set(SENSOR_PRIVATE_STATE_ID, privateState);
  const zkConfigProvider = new NodeZkConfigProvider<SensorRegistryCircuit>(zkConfigPath);
  const walletProvider = {
    getCoinPublicKey: () => runtime.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => runtime.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(transaction: UnboundTransaction, ttl?: Date) {
      return runtime.finalizeAuthorityTransaction(transaction, ttl);
    },
  };
  const publicDataProvider = indexerPublicDataProvider(
    indexerUrl,
    indexerWsUrl,
    WebSocketImplementation,
  );
  let activeRegistration: 'device' | 'assignment' | null = null;
  const proofProvider = httpClientProofProvider(
    proofServerUrl,
    zkConfigProvider,
    { timeout: 900_000 },
  );
  const providers = {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider: {
      ...proofProvider,
      async proveTx(...args: Parameters<typeof proofProvider.proveTx>) {
        if (activeRegistration) {
          await reportProgress({ stage: `${activeRegistration}_zkp_generating` });
        }
        return proofProvider.proveTx(...args);
      },
    },
    walletProvider,
    midnightProvider: {
      submitTx: async (transaction: Parameters<AuthorityTransactionRuntime['sponsorContractTransactionAndConfirm']>[0]) => {
        if (!activeRegistration) throw new Error('Operator registration circuit is unavailable');
        await reportProgress({ stage: `${activeRegistration}_tx_submitting` });
        const submitted = await runtime.sponsorContractTransactionAndConfirm(
          transaction,
          input.contractAddress,
          activeRegistration === 'device' ? 'registerDevice' : 'registerPolicyAssignment',
          activeRegistration === 'device'
            ? `register-device:${input.deviceId}:${input.deviceRegistrationVersion}`
            : `register-assignment:${input.assignmentId}:${input.assignmentVersion}`,
        );
        await reportProgress({
          stage: `${activeRegistration}_tx_submitted`,
          transactionId: submitted.contractTransactionId,
        });
        return submitted.contractTransactionId as never;
      },
    },
  };
  let deployed = await findDeployedContract(providers, {
    compiledContract,
    contractAddress: input.contractAddress,
    privateStateId: SENSOR_PRIVATE_STATE_ID,
    initialPrivateState: privateState,
  });
  const deviceCommitment = await sensorDeviceCommitment(input.deviceId);
  const policyKey = await thresholdPolicyKey(input.policyId);
  const assignmentKey = await policyAssignmentKey(input.assignmentId);
  const deviceCommitmentHex = bytesToHex(deviceCommitment);
  const policyKeyHex = bytesToHex(policyKey);
  const assignmentKeyHex = bytesToHex(assignmentKey);
  const initialVisibility = await registrationVisibility(
    publicDataProvider,
    input,
    deviceCommitmentHex,
    policyKeyHex,
    assignmentKeyHex,
  );
  let deviceTxId = input.knownDeviceTxId;
  if (!initialVisibility.deviceConfirmed) {
    activeRegistration = 'device';
    const deviceTransaction = await deployed.callTx.registerDevice(
      deviceCommitment,
      hexToBytes(input.deviceAuthority),
      BigInt(input.deviceRegistrationVersion),
    );
    activeRegistration = null;
    deviceTxId = transactionId(deviceTransaction, 'Device registration');
    await reportProgress({ stage: 'device_confirmation_waiting', transactionId: deviceTxId });
    await waitForRegistration(
      publicDataProvider,
      input,
      deviceCommitmentHex,
      policyKeyHex,
      assignmentKeyHex,
      false,
    );
  } else if (!deviceTxId) {
    throw new Error('Device is registered but its original transaction ID is unavailable');
  }
  await reportProgress({ stage: 'device_confirmed', transactionId: deviceTxId });

  const afterDevice = await registrationVisibility(
    publicDataProvider,
    input,
    deviceCommitmentHex,
    policyKeyHex,
    assignmentKeyHex,
  );
  let assignmentTxId = input.knownAssignmentTxId;
  if (!afterDevice.assignmentConfirmed) {
    // Rejoin only after the Device transaction is visible. This prevents the
    // Assignment transaction from being rehearsed against the pre-registration state.
    deployed = await findDeployedContract(providers, {
      compiledContract,
      contractAddress: input.contractAddress,
      privateStateId: SENSOR_PRIVATE_STATE_ID,
      initialPrivateState: privateState,
    });
    activeRegistration = 'assignment';
    const assignmentTransaction = await deployed.callTx.registerPolicyAssignment(
      assignmentKey,
      policyKey,
      deviceCommitment,
      BigInt(input.timeZoneOffsetMinutes + 840),
      BigInt(input.localDayStartHour),
      BigInt(input.utcDayStartMinute),
      BigInt(input.validFromEpoch),
      BigInt(input.validUntilEpoch),
      BigInt(input.assignmentVersion),
    );
    activeRegistration = null;
    assignmentTxId = transactionId(assignmentTransaction, 'Policy assignment registration');
    await reportProgress({
      stage: 'assignment_confirmation_waiting',
      transactionId: assignmentTxId,
    });
    await waitForRegistration(
      publicDataProvider,
      input,
      deviceCommitmentHex,
      policyKeyHex,
      assignmentKeyHex,
      true,
    );
  } else if (!assignmentTxId) {
    throw new Error('Policy Assignment is registered but its original transaction ID is unavailable');
  }
  await reportProgress({ stage: 'assignment_confirmed', transactionId: assignmentTxId });
  return {
    deviceCommitment: deviceCommitmentHex,
    policyKey: policyKeyHex,
    assignmentKey: assignmentKeyHex,
    deviceTxId,
    assignmentTxId,
  };
}

export async function registerOperatorDevice(
  runtime: AuthorityTransactionRuntime,
  input: OperatorDeviceRegistration,
  reportProgress: OperatorRegistrationProgressReporter = () => undefined,
): Promise<OperatorDeviceRegistrationResult> {
  validate(input);
  return registerAuthorizedDevice(runtime, input, reportProgress);
}

export async function registerServiceDevice(
  runtime: AuthorityTransactionRuntime,
  input: ServiceDeviceRegistration,
  reportProgress: OperatorRegistrationProgressReporter = () => undefined,
): Promise<OperatorDeviceRegistrationResult> {
  validate(input, false);
  return registerAuthorizedDevice(runtime, input, reportProgress);
}
