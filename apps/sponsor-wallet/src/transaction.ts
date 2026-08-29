import {
  Binding,
  ContractCall,
  LedgerParameters,
  Proof,
  SignatureEnabled,
  Transaction,
  entryPointHash,
  type FinalizedTransaction,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';

const expectedEntryPoint = 'submitDailyAttestation';

function emptyUnshieldedOffer(value: {
  inputs: unknown[];
  outputs: unknown[];
} | undefined): boolean {
  return !value || (value.inputs.length === 0 && value.outputs.length === 0);
}

function isExpectedEntryPoint(value: Uint8Array | string): boolean {
  if (value === expectedEntryPoint) return true;
  return entryPointHash(value) === entryPointHash(expectedEntryPoint);
}

export function validateSponsorIntentShape<
  K,
  T extends { actions: readonly unknown[]; dustActions?: unknown },
>(
  intents: ReadonlyMap<K, T> | undefined,
  allowDust = false,
): ReadonlyMap<K, T> {
  if (!intents || intents.size === 0) throw new Error('Transaction has no contract intent');
  let actions = 0;
  for (const intent of intents.values()) {
    actions += intent.actions.length;
    if (!allowDust && intent.dustActions) {
      throw new Error('Device transaction must not include DUST actions');
    }
    if (intent.actions.length === 0 && (!allowDust || !intent.dustActions)) {
      throw new Error('Sponsored transaction contains an empty contract intent');
    }
  }
  if (actions !== 1) {
    throw new Error('Sponsored transaction must contain exactly one contract action');
  }
  return intents;
}

export function deserializeFinalizedTransaction(bytes: Uint8Array): FinalizedTransaction {
  return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
    'signature',
    'proof',
    'binding',
    bytes,
  );
}

export function validateSponsorTransaction(
  transaction: FinalizedTransaction,
  contractAddress: string,
  allowDust: boolean,
): { transactionIdentifiers: string[]; transactionHash: string } {
  if (transaction.rewards) throw new Error('Rewards transactions are not eligible for sponsorship');
  if (transaction.guaranteedOffer || (transaction.fallibleOffer?.size ?? 0) > 0) {
    throw new Error('Zswap value transfers are not eligible for sponsorship');
  }
  const intents = validateSponsorIntentShape(transaction.intents, allowDust);
  let matchingCalls = 0;
  for (const intent of intents.values()) {
    if (!emptyUnshieldedOffer(intent.guaranteedUnshieldedOffer)
      || !emptyUnshieldedOffer(intent.fallibleUnshieldedOffer)) {
      throw new Error('Unshielded value transfers are not eligible for sponsorship');
    }
    for (const action of intent.actions) {
      if (!(action instanceof ContractCall)) {
        throw new Error('Deployments and maintenance actions are not eligible for sponsorship');
      }
      if (action.address !== contractAddress || !isExpectedEntryPoint(action.entryPoint)) {
        throw new Error('Transaction calls a contract or circuit outside the sponsorship policy');
      }
      matchingCalls += 1;
    }
  }
  if (matchingCalls !== 1) {
    throw new Error('Sponsored transaction must contain exactly one submitDailyAttestation call');
  }
  const transactionIdentifiers = transaction.identifiers().map(String);
  if (transactionIdentifiers.length === 0) throw new Error('Transaction has no contract identifier');
  return {
    transactionIdentifiers,
    transactionHash: transaction.transactionHash(),
  };
}

export function preservedContractTransactionId(
  deviceIdentifiers: readonly string[],
  sponsoredIdentifiers: readonly string[],
): string {
  if (deviceIdentifiers.length !== 1) {
    throw new Error('Device transaction must contain exactly one contract identifier');
  }
  const identifier = deviceIdentifiers[0];
  if (!identifier || !sponsoredIdentifiers.includes(identifier)) {
    throw new Error('Sponsorship changed the Device contract transaction identifier');
  }
  return identifier;
}

export function transactionMetrics(transaction: FinalizedTransaction): {
  feeSpecks: string;
  transactionBytes: number;
} {
  return {
    feeSpecks: transaction.fees(LedgerParameters.initialParameters()).toString(),
    transactionBytes: transaction.serialize().byteLength,
  };
}
