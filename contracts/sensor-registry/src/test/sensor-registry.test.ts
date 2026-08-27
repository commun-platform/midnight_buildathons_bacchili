import {
  CostModel,
  QueryContext,
  createConstructorContext,
  sampleContractAddress,
  type CircuitContext,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  generateSensorRecords,
  hexToBytes,
  prepareDataset,
  type PreparedDataset,
} from '@midnight-demo/shared';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  Contract,
  ledger,
  type Ledger,
} from '../managed/sensor-registry/contract/index.js';
import {
  createSensorPrivateState,
  witnesses,
  type SensorPrivateState,
} from '../witnesses.js';

class SensorRegistrySimulator {
  readonly contract: Contract<SensorPrivateState>;
  context: CircuitContext<SensorPrivateState>;

  constructor(dataset: PreparedDataset) {
    this.contract = new Contract<SensorPrivateState>(witnesses);
    const initial = this.contract.initialState(
      createConstructorContext(
        createSensorPrivateState([dataset.privateData]),
        '0'.repeat(64),
      ),
    );
    this.context = {
      currentPrivateState: initial.currentPrivateState,
      currentZswapLocalState: initial.currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(
        initial.currentContractState.data,
        sampleContractAddress(),
      ),
    };
  }

  register(dataset: PreparedDataset): Ledger {
    const data = dataset.publicData;
    this.context = this.contract.impureCircuits.registerDataset(
      this.context,
      BigInt(data.datasetRoot),
      hexToBytes(data.deviceCommitment),
      BigInt(data.periodStartEpoch),
      BigInt(data.periodEndEpoch),
      BigInt(data.sampleCount),
      BigInt(data.schemaVersion),
    ).context;
    return ledger(this.context.currentQueryContext.state);
  }

  verify(datasetRoot: string): Ledger {
    this.context = this.contract.impureCircuits.verifySensorValue(
      this.context,
      BigInt(datasetRoot),
    ).context;
    return ledger(this.context.currentQueryContext.state);
  }
}

describe('SensorRegistry dual-state contract', () => {
  let validDataset: PreparedDataset;

  beforeAll(async () => {
    validDataset = await prepareDataset(
      generateSensorRecords({ samples: 16, seed: 101 }),
      { nonceSeed: 'contract-valid', thresholdMin: 10, thresholdMax: 35 },
    );
  });

  it('registers only commitments and verifies a private sample', () => {
    const simulator = new SensorRegistrySimulator(validDataset);
    const registered = simulator.register(validDataset);
    const root = BigInt(validDataset.publicData.datasetRoot);

    expect(registered.datasets.lookup(root).verified).toBe(false);
    expect(registered.registrationCount).toBe(1n);

    const verified = simulator.verify(validDataset.publicData.datasetRoot);
    expect(verified.datasets.lookup(root).verified).toBe(true);
    expect(verified.verificationResult).toBe(true);
    expect(verified.verificationCount).toBe(1n);
  });

  it('rejects an out-of-range private value', async () => {
    const dataset = await prepareDataset(
      generateSensorRecords({ samples: 16, seed: 102 }),
      { nonceSeed: 'contract-range', thresholdMin: 0, thresholdMax: 20 },
    );
    const simulator = new SensorRegistrySimulator(dataset);
    simulator.register(dataset);
    expect(() => simulator.verify(dataset.publicData.datasetRoot)).toThrow(
      'private sensor value is outside the allowed range',
    );
  });

  it('rejects tampered raw sensor data', async () => {
    const dataset = await prepareDataset(
      generateSensorRecords({ samples: 16, seed: 103 }),
      { nonceSeed: 'contract-sample-tamper' },
    );
    const selected = dataset.privateData.samples[dataset.privateData.selectedIndex];
    expect(selected).toBeDefined();
    if (selected) selected.temperature += 1;

    const simulator = new SensorRegistrySimulator(dataset);
    simulator.register(dataset);
    expect(() => simulator.verify(dataset.publicData.datasetRoot)).toThrow(
      'private sample commitment mismatch',
    );
  });

  it('rejects a tampered Merkle path', async () => {
    const dataset = await prepareDataset(
      generateSensorRecords({ samples: 16, seed: 104 }),
      { nonceSeed: 'contract-path-tamper' },
    );
    const entry = dataset.privateData.merklePath.path[0];
    expect(entry).toBeDefined();
    if (entry) entry.sibling = (BigInt(entry.sibling) + 1n).toString();

    const simulator = new SensorRegistrySimulator(dataset);
    simulator.register(dataset);
    expect(() => simulator.verify(dataset.publicData.datasetRoot)).toThrow(
      'Merkle inclusion proof mismatch',
    );
  });
});
