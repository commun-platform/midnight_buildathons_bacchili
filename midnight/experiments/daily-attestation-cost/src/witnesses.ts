import type { WitnessContext } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

export type DailyAttestationPrivateState<DayInput> = {
  operatorSecret: Uint8Array;
  days: Array<{
    dayRoot: Uint8Array;
    input: DayInput;
  }>;
};

export const DAILY_ATTESTATION_PRIVATE_STATE_ID = 'dailyAttestationPrivateState';

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function createDailyAttestationWitnesses<DayInput>() {
  return {
    operatorSecret(
      { privateState }: WitnessContext<unknown, DailyAttestationPrivateState<DayInput>>,
    ): [DailyAttestationPrivateState<DayInput>, Uint8Array] {
      return [privateState, privateState.operatorSecret];
    },
    privateDay(
      { privateState }: WitnessContext<unknown, DailyAttestationPrivateState<DayInput>>,
      dayRoot: Uint8Array,
    ): [DailyAttestationPrivateState<DayInput>, DayInput] {
      const day = privateState.days.find((candidate) => equalBytes(candidate.dayRoot, dayRoot));
      if (!day) throw new Error('Private daily attestation input is missing');
      return [privateState, day.input];
    },
  };
}
