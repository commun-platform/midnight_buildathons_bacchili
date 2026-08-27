import {
  deserializeMerklePath,
  encodeTemperature,
  hexToBytes,
  toCompactSensorLeaf,
  type CompactSensorLeaf,
  type PrivateDataset,
} from '@midnight-demo/shared';
import type {
  MerkleTreePath,
  WitnessContext,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

export type SensorPrivateState = {
  datasets: PrivateDataset[];
};

export const SENSOR_PRIVATE_STATE_ID = 'sensorPrivateState';

export function createSensorPrivateState(datasets: PrivateDataset[] = []): SensorPrivateState {
  return { datasets };
}

function findDataset(privateState: SensorPrivateState, datasetRoot: bigint): PrivateDataset {
  const dataset = privateState.datasets.find((candidate) => candidate.datasetRoot === datasetRoot.toString());
  if (!dataset) throw new Error(`Private dataset not found for root ${datasetRoot}`);
  return dataset;
}

function selectedSample(dataset: PrivateDataset) {
  const sample = dataset.samples[dataset.selectedIndex];
  if (!sample) throw new Error(`Private sample ${dataset.selectedIndex} is missing`);
  return sample;
}

export const witnesses = {
  privateSensorLeaf(
    { privateState }: WitnessContext<unknown, SensorPrivateState>,
    datasetRoot: bigint,
  ): [SensorPrivateState, CompactSensorLeaf] {
    const dataset = findDataset(privateState, datasetRoot);
    return [privateState, toCompactSensorLeaf(selectedSample(dataset))];
  },
  privateSensorNonce(
    { privateState }: WitnessContext<unknown, SensorPrivateState>,
    datasetRoot: bigint,
  ): [SensorPrivateState, Uint8Array] {
    const dataset = findDataset(privateState, datasetRoot);
    return [privateState, hexToBytes(dataset.selectedNonceHex)];
  },
  privateThresholdMin(
    { privateState }: WitnessContext<unknown, SensorPrivateState>,
    datasetRoot: bigint,
  ): [SensorPrivateState, bigint] {
    const dataset = findDataset(privateState, datasetRoot);
    return [privateState, encodeTemperature(dataset.threshold.min)];
  },
  privateThresholdMax(
    { privateState }: WitnessContext<unknown, SensorPrivateState>,
    datasetRoot: bigint,
  ): [SensorPrivateState, bigint] {
    const dataset = findDataset(privateState, datasetRoot);
    return [privateState, encodeTemperature(dataset.threshold.max)];
  },
  privateMerklePath(
    { privateState }: WitnessContext<unknown, SensorPrivateState>,
    datasetRoot: bigint,
  ): [SensorPrivateState, MerkleTreePath<Uint8Array>] {
    const dataset = findDataset(privateState, datasetRoot);
    return [privateState, deserializeMerklePath(dataset.merklePath)];
  },
};
