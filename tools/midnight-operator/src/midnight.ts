import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createSensorPrivateState,
  SENSOR_PRIVATE_STATE_ID,
  witnesses,
  type SensorPrivateState,
} from '@midnight-demo/sensor-registry-contract/witnesses';
import {
  bytesToHex,
  encodeTemperature,
  hexToBytes,
  policyAssignmentKey,
  sensorDeviceCommitment,
  thresholdPolicyKey,
  utcDayStartMinute,
  type ThresholdPolicyMode,
} from '@midnight-demo/shared';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

import {
  contractArtifactsPath,
  contractModulePath,
  privateStatePassword,
  proofServerHeaders,
  stateDir,
  type NetworkConfig,
} from './config.js';
import { walletAddress, type WalletContext } from './wallet.js';

interface LoadedContract {
  module: {
    Contract: new (witnesses: unknown) => unknown;
    ledger(state: unknown): {
      policies: Iterable<[Uint8Array, {
        mode: number;
        minimumCentiOffset: bigint;
        maximumCentiOffset: bigint;
        valueScale: bigint;
        sensorTypeCode: bigint;
        unitCode: bigint;
        version: bigint;
      }]>;
      policyAssignments: Iterable<[Uint8Array, {
        policyId: Uint8Array;
        deviceCommitment: Uint8Array;
        timeZoneOffsetMinutesBias: bigint;
        localDayStartHour: bigint;
        utcDayStartMinute: bigint;
        validFrom: bigint;
        validUntil: bigint;
        version: bigint;
      }]>;
      attestations: Iterable<[Uint8Array, {
        attestationCommitment: Uint8Array;
        measurementGroupId: Uint8Array;
        deviceCommitment: Uint8Array;
        policyId: Uint8Array;
        assignmentId: Uint8Array;
        measurementDay: bigint;
        periodStart: bigint;
        periodEnd: bigint;
        hourPresence: boolean[];
        hourResults: number[];
        observedHourCount: bigint;
        sampleCount: bigint;
        schemaVersion: bigint;
        circuitVersion: bigint;
        thresholdSatisfied: boolean;
        verified: boolean;
      }]>;
      devices: Iterable<[Uint8Array, {
        authority: Uint8Array;
        active: boolean;
        version: bigint;
      }]>;
      operatorAuthority: Uint8Array;
      deviceCount: bigint;
      disabledDeviceCount: bigint;
      policyCount: bigint;
      assignmentCount: bigint;
      attestationCount: bigint;
      lastAttestationCommitment: Uint8Array;
      lastAttestationThresholdSatisfied: boolean;
    };
  };
  compiledContract: unknown;
}

export interface InitialPolicyConfig {
  policyId: string;
  assignmentId: string;
  mode: ThresholdPolicyMode;
  minimum: number;
  maximum: number;
  valueScale: number;
  sensorTypeCode: number;
  unitCode: number;
  policyVersion: number;
  assignmentVersion: number;
  timeZoneOffsetMinutes: number;
  localDayStartHour: number;
  validFromEpoch: bigint;
  validUntilEpoch: bigint;
  deviceRegistrationVersion: number;
}

function policyModeCode(mode: ThresholdPolicyMode): number {
  if (mode === 'closed-range') return 0;
  if (mode === 'upper-bound') return 1;
  return 2;
}

export async function loadCompiledContract(): Promise<LoadedContract> {
  if (!fs.existsSync(contractModulePath)) {
    throw new Error('Contract artifacts are missing. Run npm run contract:compile');
  }
  const contractModule = await import(pathToFileURL(contractModulePath).href) as LoadedContract['module'];
  const compiledContract = CompiledContract.make(
    'sensor-registry',
    contractModule.Contract as never,
  ).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(contractArtifactsPath),
  );
  return { module: contractModule, compiledContract };
}

export function createProviders(
  wallet: WalletContext,
  network: NetworkConfig,
) {
  const walletProvider = {
    getCoinPublicKey: () => wallet.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => wallet.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(transaction: unknown, ttl?: Date) {
      const recipe = await wallet.wallet.balanceUnboundTransaction(
        transaction as never,
        {
          shieldedSecretKeys: wallet.shieldedSecretKeys,
          dustSecretKey: wallet.dustSecretKey,
        },
        {
          ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000),
          tokenKindsToBalance: ['dust'],
        },
      );
      return wallet.wallet.finalizeRecipe(recipe);
    },
    submitTx: (transaction: unknown) => wallet.wallet.submitTransaction(transaction as never) as never,
  };
  const zkConfigProvider = new NodeZkConfigProvider(contractArtifactsPath);
  const proofHeaders = proofServerHeaders(network.proofServer);
  const accountId = walletAddress(wallet);
  const privateStateProvider = levelPrivateStateProvider<string, SensorPrivateState>({
    midnightDbName: path.join(stateDir, 'midnight-level-db'),
    privateStateStoreName: 'sensor-private-state',
    signingKeyStoreName: 'sensor-signing-keys',
    accountId,
    privateStoragePasswordProvider: privateStatePassword,
  });

  return {
    privateStateProvider,
    publicDataProvider: indexerPublicDataProvider(network.indexer, network.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(network.proofServer, zkConfigProvider, {
      timeout: 900_000,
      headers: proofHeaders,
    }),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

export async function waitForProofServer(network: NetworkConfig): Promise<void> {
  const base = new URL(network.proofServer);
  const local = base.hostname === '127.0.0.1' || base.hostname === 'localhost';
  const readyUrl = local ? base : new URL('/ready', base);
  let lastError: unknown;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(readyUrl, {
        headers: proofServerHeaders(network.proofServer),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return;
      lastError = new Error(`Proof server returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Proof server is unavailable: ${lastError instanceof Error ? lastError.message : lastError}`);
}

export async function deploySensorRegistry(
  wallet: WalletContext,
  network: NetworkConfig,
  operatorAuthority: Uint8Array,
  operatorSecretHex: string,
): Promise<{ contractAddress: string; deploymentTxId: string }> {
  if (operatorAuthority.length !== 32) throw new Error('Operator authority must contain 32 bytes');
  const loaded = await loadCompiledContract();
  const providers = createProviders(wallet, network);
  await waitForProofServer(network);
  const deployed = await deployContract(providers as never, {
    compiledContract: loaded.compiledContract as never,
    args: [operatorAuthority],
    privateStateId: SENSOR_PRIVATE_STATE_ID,
    initialPrivateState: createSensorPrivateState([], undefined, operatorSecretHex),
  });
  return {
    contractAddress: deployed.deployTxData.public.contractAddress,
    deploymentTxId: confirmedTransactionId(deployed.deployTxData, 'contract deployment'),
  };
}

export function confirmedTransactionId(transaction: unknown, operation: string): string {
  const value = (transaction as { public?: { txId?: unknown } })?.public?.txId;
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`${operation} did not return a confirmed transaction ID`);
  }
  return String(value);
}

export async function registerInitialConfiguration(
  wallet: WalletContext,
  network: NetworkConfig,
  contractAddress: string,
  operatorSecretHex: string,
  deviceAuthority: Uint8Array,
  deviceCommitment: Uint8Array,
  config: InitialPolicyConfig,
): Promise<{
  policyKey: string;
  assignmentKey: string;
  policyTxId: string;
  deviceTxId: string;
  assignmentTxId: string;
}> {
  const loaded = await loadCompiledContract();
  const providers = createProviders(wallet, network);
  providers.privateStateProvider.setContractAddress(contractAddress);
  if (deviceAuthority.length !== 32) throw new Error('Device authority must contain 32 bytes');
  if (deviceCommitment.length !== 32) throw new Error('Device commitment must contain 32 bytes');
  const privateState = createSensorPrivateState([], undefined, operatorSecretHex);
  await providers.privateStateProvider.set(SENSOR_PRIVATE_STATE_ID, privateState);
  const deployed = await findDeployedContract(providers as never, {
    compiledContract: loaded.compiledContract as never,
    contractAddress,
    privateStateId: SENSOR_PRIVATE_STATE_ID,
    initialPrivateState: privateState,
  }) as unknown as {
    callTx: {
      registerDevice(
        deviceCommitment: Uint8Array,
        deviceAuthority: Uint8Array,
        version: bigint,
      ): Promise<unknown>;
      registerThresholdPolicy(policyId: Uint8Array, policy: Record<string, unknown>): Promise<unknown>;
      registerPolicyAssignment(
        assignmentId: Uint8Array,
        policyId: Uint8Array,
        deviceCommitment: Uint8Array,
        timeZoneOffsetMinutesBias: bigint,
        localDayStartHour: bigint,
        utcDayStartMinute: bigint,
        validFrom: bigint,
        validUntil: bigint,
        version: bigint,
      ): Promise<unknown>;
    };
  };
  const policyKeyBytes = await thresholdPolicyKey(config.policyId);
  const assignmentKeyBytes = await policyAssignmentKey(config.assignmentId);
  const minimum = config.mode === 'upper-bound' ? 0n : encodeTemperature(config.minimum);
  const maximum = config.mode === 'lower-bound' ? 0xffff_ffffn : encodeTemperature(config.maximum);
  const deviceTransaction = await deployed.callTx.registerDevice(
    deviceCommitment,
    deviceAuthority,
    BigInt(config.deviceRegistrationVersion),
  );
  const policyTransaction = await deployed.callTx.registerThresholdPolicy(policyKeyBytes, {
    mode: policyModeCode(config.mode),
    minimumCentiOffset: minimum,
    maximumCentiOffset: maximum,
    valueScale: BigInt(config.valueScale),
    sensorTypeCode: BigInt(config.sensorTypeCode),
    unitCode: BigInt(config.unitCode),
    version: BigInt(config.policyVersion),
  });
  const assignmentTransaction = await deployed.callTx.registerPolicyAssignment(
    assignmentKeyBytes,
    policyKeyBytes,
    deviceCommitment,
    BigInt(config.timeZoneOffsetMinutes + 840),
    BigInt(config.localDayStartHour),
    BigInt(utcDayStartMinute(config)),
    config.validFromEpoch,
    config.validUntilEpoch,
    BigInt(config.assignmentVersion),
  );
  return {
    policyKey: bytesToHex(policyKeyBytes),
    assignmentKey: bytesToHex(assignmentKeyBytes),
    deviceTxId: confirmedTransactionId(deviceTransaction, 'Device registration'),
    policyTxId: confirmedTransactionId(policyTransaction, 'Threshold Policy registration'),
    assignmentTxId: confirmedTransactionId(assignmentTransaction, 'Policy Assignment registration'),
  };
}

export async function registerAdditionalDevice(
  wallet: WalletContext,
  network: NetworkConfig,
  contractAddress: string,
  operatorSecretHex: string,
  deviceAuthority: Uint8Array,
  deviceCommitment: Uint8Array,
  policyId: string,
  assignmentId: string,
  deviceRegistrationVersion: number,
  assignmentVersion: number,
  timeZoneOffsetMinutes: number,
  localDayStartHour: number,
  validFromEpoch: bigint,
  validUntilEpoch: bigint,
): Promise<{ deviceTxId: string; assignmentTxId: string; policyKey: string; assignmentKey: string }> {
  if (deviceAuthority.length !== 32 || deviceCommitment.length !== 32) {
    throw new Error('Device authority and commitment must contain 32 bytes');
  }
  const loaded = await loadCompiledContract();
  const providers = createProviders(wallet, network);
  providers.privateStateProvider.setContractAddress(contractAddress);
  const privateState = createSensorPrivateState([], undefined, operatorSecretHex);
  await providers.privateStateProvider.set(SENSOR_PRIVATE_STATE_ID, privateState);
  const deployed = await findDeployedContract(providers as never, {
    compiledContract: loaded.compiledContract as never,
    contractAddress,
    privateStateId: SENSOR_PRIVATE_STATE_ID,
    initialPrivateState: privateState,
  }) as unknown as {
    callTx: {
      registerDevice(deviceCommitment: Uint8Array, deviceAuthority: Uint8Array, version: bigint): Promise<unknown>;
      registerPolicyAssignment(
        assignmentId: Uint8Array,
        policyId: Uint8Array,
        deviceCommitment: Uint8Array,
        timeZoneOffsetMinutesBias: bigint,
        localDayStartHour: bigint,
        utcDayStartMinute: bigint,
        validFrom: bigint,
        validUntil: bigint,
        version: bigint,
      ): Promise<unknown>;
    };
  };
  const policyKeyBytes = await thresholdPolicyKey(policyId);
  const assignmentKeyBytes = await policyAssignmentKey(assignmentId);
  const deviceTransaction = await deployed.callTx.registerDevice(
    deviceCommitment,
    deviceAuthority,
    BigInt(deviceRegistrationVersion),
  );
  const assignmentTransaction = await deployed.callTx.registerPolicyAssignment(
    assignmentKeyBytes,
    policyKeyBytes,
    deviceCommitment,
    BigInt(timeZoneOffsetMinutes + 840),
    BigInt(localDayStartHour),
    BigInt(utcDayStartMinute({ timeZoneOffsetMinutes, localDayStartHour })),
    validFromEpoch,
    validUntilEpoch,
    BigInt(assignmentVersion),
  );
  return {
    deviceTxId: confirmedTransactionId(deviceTransaction, 'Device registration'),
    assignmentTxId: confirmedTransactionId(assignmentTransaction, 'Policy Assignment registration'),
    policyKey: bytesToHex(policyKeyBytes),
    assignmentKey: bytesToHex(assignmentKeyBytes),
  };
}

export async function disableRegisteredDevice(
  wallet: WalletContext,
  network: NetworkConfig,
  contractAddress: string,
  operatorSecretHex: string,
  deviceCommitment: Uint8Array,
): Promise<unknown> {
  const loaded = await loadCompiledContract();
  const providers = createProviders(wallet, network);
  providers.privateStateProvider.setContractAddress(contractAddress);
  const privateState = createSensorPrivateState([], undefined, operatorSecretHex);
  await providers.privateStateProvider.set(SENSOR_PRIVATE_STATE_ID, privateState);
  const deployed = await findDeployedContract(providers as never, {
    compiledContract: loaded.compiledContract as never,
    contractAddress,
    privateStateId: SENSOR_PRIVATE_STATE_ID,
    initialPrivateState: privateState,
  }) as unknown as { callTx: { disableDevice(deviceCommitment: Uint8Array): Promise<unknown> } };
  return deployed.callTx.disableDevice(deviceCommitment);
}

export async function rotateRegisteredDeviceAuthority(
  wallet: WalletContext,
  network: NetworkConfig,
  contractAddress: string,
  operatorSecretHex: string,
  deviceCommitment: Uint8Array,
  newDeviceAuthority: Uint8Array,
  newVersion: number,
): Promise<unknown> {
  if (newDeviceAuthority.length !== 32) throw new Error('Device authority must contain 32 bytes');
  const loaded = await loadCompiledContract();
  const providers = createProviders(wallet, network);
  providers.privateStateProvider.setContractAddress(contractAddress);
  const privateState = createSensorPrivateState([], undefined, operatorSecretHex);
  await providers.privateStateProvider.set(SENSOR_PRIVATE_STATE_ID, privateState);
  const deployed = await findDeployedContract(providers as never, {
    compiledContract: loaded.compiledContract as never,
    contractAddress,
    privateStateId: SENSOR_PRIVATE_STATE_ID,
    initialPrivateState: privateState,
  }) as unknown as {
    callTx: {
      rotateDeviceAuthority(
        deviceCommitment: Uint8Array,
        newDeviceAuthority: Uint8Array,
        newVersion: bigint,
      ): Promise<unknown>;
    };
  };
  return deployed.callTx.rotateDeviceAuthority(deviceCommitment, newDeviceAuthority, BigInt(newVersion));
}

export async function deviceCommitmentForId(deviceId: string): Promise<Uint8Array> {
  return sensorDeviceCommitment(deviceId);
}

export async function queryRegistry(network: NetworkConfig, contractAddress: string) {
  const loaded = await loadCompiledContract();
  const provider = indexerPublicDataProvider(network.indexer, network.indexerWS);
  const contractState = await provider.queryContractState(contractAddress);
  if (!contractState) throw new Error(`Contract state not found: ${contractAddress}`);
  const state = loaded.module.ledger(contractState.data);
  return {
    contractAddress,
    network: network.networkId,
    operatorAuthority: bytesToHex(state.operatorAuthority),
    deviceCount: state.deviceCount.toString(),
    disabledDeviceCount: state.disabledDeviceCount.toString(),
    policyCount: state.policyCount.toString(),
    assignmentCount: state.assignmentCount.toString(),
    attestationCount: state.attestationCount.toString(),
    lastAttestationCommitment: bytesToHex(state.lastAttestationCommitment),
    lastAttestationThresholdSatisfied: state.lastAttestationThresholdSatisfied,
    devices: Array.from(state.devices, ([deviceCommitment, device]) => ({
      deviceCommitment: bytesToHex(deviceCommitment),
      deviceAuthority: bytesToHex(device.authority),
      active: device.active,
      version: device.version.toString(),
    })),
    policies: Array.from(state.policies, ([policyId, policy]) => ({
      policyKey: bytesToHex(policyId),
      mode: policy.mode,
      minimum: policy.mode === 1 ? null : (Number(policy.minimumCentiOffset) - 10_000) / 100,
      maximum: policy.mode === 2 ? null : (Number(policy.maximumCentiOffset) - 10_000) / 100,
      valueScale: policy.valueScale.toString(),
      sensorTypeCode: policy.sensorTypeCode.toString(),
      unitCode: policy.unitCode.toString(),
      version: policy.version.toString(),
    })),
    policyAssignments: Array.from(state.policyAssignments, ([assignmentId, assignment]) => ({
      assignmentKey: bytesToHex(assignmentId),
      policyKey: bytesToHex(assignment.policyId),
      deviceCommitment: bytesToHex(assignment.deviceCommitment),
      timeZoneOffsetMinutes: Number(assignment.timeZoneOffsetMinutesBias) - 840,
      localDayStartHour: Number(assignment.localDayStartHour),
      utcDayStartMinute: Number(assignment.utcDayStartMinute),
      validFrom: new Date(Number(assignment.validFrom) * 1000).toISOString(),
      validUntil: assignment.validUntil === 0n
        ? null
        : new Date(Number(assignment.validUntil) * 1000).toISOString(),
      version: assignment.version.toString(),
    })),
    attestations: Array.from(state.attestations, ([attestationId, attestation]) => ({
      attestationId: bytesToHex(attestationId),
      attestationCommitment: bytesToHex(attestation.attestationCommitment),
      measurementGroupId: bytesToHex(attestation.measurementGroupId),
      deviceCommitment: bytesToHex(attestation.deviceCommitment),
      policyKey: bytesToHex(attestation.policyId),
      assignmentKey: bytesToHex(attestation.assignmentId),
      measurementDay: attestation.measurementDay.toString(),
      periodStart: new Date(Number(attestation.periodStart) * 1000).toISOString(),
      periodEnd: new Date(Number(attestation.periodEnd) * 1000).toISOString(),
      hourPresence: attestation.hourPresence,
      hourResults: attestation.hourResults.map((result) => result === 2
        ? 'outside-threshold'
        : result === 1
          ? 'within-threshold'
          : 'no-data'),
      observedHourCount: attestation.observedHourCount.toString(),
      stoppedHourCount: (24n - attestation.observedHourCount).toString(),
      sampleCount: attestation.sampleCount.toString(),
      thresholdSatisfied: attestation.thresholdSatisfied,
      verified: attestation.verified,
      schemaVersion: attestation.schemaVersion.toString(),
      circuitVersion: attestation.circuitVersion.toString(),
    })),
  };
}
