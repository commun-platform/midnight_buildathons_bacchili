import {
  bytesToHex,
  hexToBytes,
  toCompactDailyExtremaInput,
  type CompactDailyExtremaInput,
  type PrivateDailyExtremaAttestation,
} from '@midnight-demo/shared/runtime';
import type { WitnessContext } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

export type SensorPrivateState = {
  deviceSecretHex?: string;
  operatorSecretHex?: string;
  dailyAttestations: PrivateDailyExtremaAttestation[];
};

export const SENSOR_PRIVATE_STATE_ID = 'sensorPrivateStateV4';

export function createSensorPrivateState(
  dailyAttestations: PrivateDailyExtremaAttestation[] = [],
  deviceSecretHex?: string,
  operatorSecretHex?: string,
): SensorPrivateState {
  return { deviceSecretHex, operatorSecretHex, dailyAttestations };
}

function requiredSecret(value: string | undefined, label: string): Uint8Array {
  if (!value) throw new Error(`${label} is missing from private state`);
  const secret = hexToBytes(value);
  if (secret.length !== 32) throw new Error(`${label} must contain 32 bytes`);
  return secret;
}

function findDailyAttestation(
  privateState: SensorPrivateState,
  attestationCommitment: Uint8Array,
): PrivateDailyExtremaAttestation {
  const commitmentHex = bytesToHex(attestationCommitment);
  const attestation = privateState.dailyAttestations.find(
    (candidate) => candidate.attestationCommitment === commitmentHex,
  );
  if (!attestation) throw new Error(`Private daily extrema not found for ${commitmentHex}`);
  return attestation;
}

export const witnesses = {
  privateDeviceSecret(
    { privateState }: WitnessContext<unknown, SensorPrivateState>,
  ): [SensorPrivateState, Uint8Array] {
    return [
      privateState,
      requiredSecret(privateState.deviceSecretHex, 'Device contract authority secret'),
    ];
  },
  privateOperatorSecret(
    { privateState }: WitnessContext<unknown, SensorPrivateState>,
  ): [SensorPrivateState, Uint8Array] {
    return [
      privateState,
      requiredSecret(privateState.operatorSecretHex, 'Operator authority secret'),
    ];
  },
  privateDailyExtrema(
    { privateState }: WitnessContext<unknown, SensorPrivateState>,
    attestationCommitment: Uint8Array,
  ): [SensorPrivateState, CompactDailyExtremaInput] {
    const attestation = findDailyAttestation(privateState, attestationCommitment);
    return [privateState, toCompactDailyExtremaInput(attestation)];
  },
  privateDailyNonce(
    { privateState }: WitnessContext<unknown, SensorPrivateState>,
    attestationCommitment: Uint8Array,
  ): [SensorPrivateState, Uint8Array] {
    const attestation = findDailyAttestation(privateState, attestationCommitment);
    return [privateState, hexToBytes(attestation.nonceHex)];
  },
};
