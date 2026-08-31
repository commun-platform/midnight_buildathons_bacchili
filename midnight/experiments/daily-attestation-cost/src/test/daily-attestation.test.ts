import {
  CostModel,
  QueryContext,
  createConstructorContext,
  sampleContractAddress,
  type CircuitContext,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { describe, expect, it } from 'vitest';

import {
  Contract,
  ledger,
  pureCircuits,
  type DayInput,
  type Ledger,
} from '../managed/daily-attestation-24/contract/index.js';
import {
  createDailyAttestationWitnesses,
  type DailyAttestationPrivateState,
} from '../witnesses.js';

function bytes(label: string): Uint8Array {
  return new Uint8Array(32).fill(label.charCodeAt(0));
}

function dayInput(): DayInput {
  let sequence = 1n;
  return {
    hours: Array.from({ length: 24 }, (_, hourIndex) => ({
      measurements: [{
        timestamp: 1_787_673_600n + BigInt(hourIndex * 3600),
        sequence: sequence++,
        sensorId: bytes('s'),
        temperatureCentiOffset: hourIndex === 18 ? 14_000n : 12_500n,
        schemaVersion: 1n,
      }],
      nonces: [bytes(String.fromCharCode(65 + hourIndex))],
    })),
    policy: {
      minimumCentiOffset: 12_000n,
      maximumCentiOffset: 13_500n,
      policyVersion: 1n,
    },
    policyNonce: bytes('p'),
  };
}

class DailyAttestationSimulator {
  readonly contract: Contract<DailyAttestationPrivateState<DayInput>>;
  context: CircuitContext<DailyAttestationPrivateState<DayInput>>;
  readonly input: DayInput;
  readonly dayRoot: Uint8Array;
  readonly deviceCommitment = bytes('d');
  readonly policyCommitment: Uint8Array;

  constructor(input = dayInput()) {
    this.input = input;
    this.dayRoot = pureCircuits.computeDayRoot(input.hours);
    this.policyCommitment = pureCircuits.policyCommitment(input.policy, input.policyNonce);
    const operatorSecret = bytes('o');
    const privateState: DailyAttestationPrivateState<DayInput> = {
      operatorSecret,
      days: [{ dayRoot: this.dayRoot, input }],
    };
    this.contract = new Contract(createDailyAttestationWitnesses<DayInput>());
    const initial = this.contract.initialState(
      createConstructorContext(privateState, '0'.repeat(64)),
      pureCircuits.deriveOperatorCommitment(operatorSecret),
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

  register(): void {
    this.context = this.contract.impureCircuits.registerDevice(
      this.context,
      this.deviceCommitment,
    ).context;
    this.context = this.contract.impureCircuits.registerPolicy(
      this.context,
      this.policyCommitment,
    ).context;
  }

  submit(): Ledger {
    this.context = this.contract.impureCircuits.submitDailyAttestation(
      this.context,
      this.dayRoot,
      this.deviceCommitment,
      this.policyCommitment,
      bytes('b'),
      1_787_673_600n,
      1_787_760_000n,
      1n,
    ).context;
    return ledger(this.context.currentQueryContext.state);
  }

  appendReason(reasonHash: Uint8Array, previousReasonHash: Uint8Array): Ledger {
    this.context = this.contract.impureCircuits.appendOutlierReason(
      this.context,
      this.dayRoot,
      18n,
      reasonHash,
      previousReasonHash,
      1_787_760_100n,
    ).context;
    return ledger(this.context.currentQueryContext.state);
  }
}

describe('production daily attestation contract', () => {
  it('proves all samples, hourly claims, and anomaly completeness', () => {
    const simulator = new DailyAttestationSimulator();
    simulator.register();
    const state = simulator.submit();
    const attestation = state.attestations.lookup(simulator.dayRoot);
    const claims = pureCircuits.computeHourClaims(simulator.input.hours, simulator.input.policy);

    expect(attestation.verified).toBe(true);
    expect(attestation.sampleCount).toBe(24n);
    expect(attestation.anomalyCount).toBe(1n);
    expect(attestation.hourClaimsRoot).toEqual(pureCircuits.computeHourClaimsRoot(claims));
    expect(claims[18]?.anomalyCount).toBe(1n);
    expect(claims[18]?.allWithinRange).toBe(false);
  });

  it('rejects changed raw data against the signed day root', () => {
    const simulator = new DailyAttestationSimulator();
    simulator.input.hours[3]!.measurements[0]!.temperatureCentiOffset += 1n;
    simulator.register();
    expect(() => simulator.submit()).toThrow('daily root mismatch');
  });

  it('rejects a private policy that differs from its registered commitment', () => {
    const simulator = new DailyAttestationSimulator();
    simulator.input.policy.maximumCentiOffset += 1n;
    simulator.register();
    expect(() => simulator.submit()).toThrow('private policy commitment mismatch');
  });

  it('rejects sequence gaps across hours', () => {
    const input = dayInput();
    input.hours[8]!.measurements[0]!.sequence += 1n;
    const simulator = new DailyAttestationSimulator(input);
    simulator.register();
    expect(() => simulator.submit()).toThrow('day sequence is invalid');
  });

  it('maintains an append-only signed-reason hash chain', () => {
    const simulator = new DailyAttestationSimulator();
    simulator.register();
    simulator.submit();
    const first = bytes('1');
    const second = bytes('2');
    simulator.appendReason(first, new Uint8Array(32));
    const state = simulator.appendReason(second, first);
    expect(state.reasonCount).toBe(2n);
    expect(state.reasons.lookup(second).previousReasonHash).toEqual(first);
    expect(() => simulator.appendReason(bytes('3'), first)).toThrow('reason chain mismatch');
  });
});
