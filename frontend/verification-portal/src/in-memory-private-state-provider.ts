import type {
  ExportPrivateStatesOptions,
  ExportSigningKeysOptions,
  ImportPrivateStatesOptions,
  ImportPrivateStatesResult,
  ImportSigningKeysOptions,
  ImportSigningKeysResult,
  PrivateStateExport,
  PrivateStateId,
  PrivateStateProvider,
  SigningKeyExport,
} from '@midnight-ntwrk/midnight-js-types';
import type {
  ContractAddress,
  SigningKey,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

export function inMemoryPrivateStateProvider<PSI extends PrivateStateId, PS>(): PrivateStateProvider<PSI, PS> {
  const privateStates = new Map<ContractAddress, Map<PSI, PS>>();
  const signingKeys = new Map<ContractAddress, SigningKey>();
  let contractAddress: ContractAddress | null = null;

  const requireContractAddress = (): ContractAddress => {
    if (contractAddress === null) throw new Error('Contract address is not set');
    return contractAddress;
  };
  const scopedStates = (address: ContractAddress): Map<PSI, PS> => {
    const existing = privateStates.get(address);
    if (existing) return existing;
    const created = new Map<PSI, PS>();
    privateStates.set(address, created);
    return created;
  };
  const encode = (value: unknown): string => JSON.stringify(value);
  const decode = <T>(value: string): T => JSON.parse(value) as T;

  return {
    setContractAddress(address) {
      contractAddress = address;
    },
    async set(key, state) {
      scopedStates(requireContractAddress()).set(key, state);
    },
    async get(key) {
      return scopedStates(requireContractAddress()).get(key) ?? null;
    },
    async remove(key) {
      scopedStates(requireContractAddress()).delete(key);
    },
    async clear() {
      privateStates.delete(requireContractAddress());
    },
    async setSigningKey(address, key) {
      signingKeys.set(address, key);
    },
    async getSigningKey(address) {
      return signingKeys.get(address) ?? null;
    },
    async removeSigningKey(address) {
      signingKeys.delete(address);
    },
    async clearSigningKeys() {
      signingKeys.clear();
    },
    async exportPrivateStates(_options?: ExportPrivateStatesOptions): Promise<PrivateStateExport> {
      const address = requireContractAddress();
      return {
        format: 'midnight-private-state-export',
        encryptedPayload: encode({
          states: Object.fromEntries(
            Array.from(scopedStates(address), ([key, value]) => [key, encode(value)]),
          ),
        }),
        salt: 'in-memory',
      };
    },
    async importPrivateStates(
      exported: PrivateStateExport,
      options?: ImportPrivateStatesOptions,
    ): Promise<ImportPrivateStatesResult> {
      const target = scopedStates(requireContractAddress());
      const payload = decode<{ states?: Record<string, string> }>(exported.encryptedPayload);
      let imported = 0;
      let skipped = 0;
      let overwritten = 0;
      for (const [rawKey, serialized] of Object.entries(payload.states ?? {})) {
        const key = rawKey as PSI;
        if (target.has(key)) {
          if (options?.conflictStrategy === 'skip') {
            skipped += 1;
            continue;
          }
          if (!options?.conflictStrategy || options.conflictStrategy === 'error') {
            throw new Error(`Private state conflict for ${rawKey}`);
          }
          overwritten += 1;
        } else {
          imported += 1;
        }
        target.set(key, decode<PS>(serialized));
      }
      return { imported, skipped, overwritten };
    },
    async exportSigningKeys(_options?: ExportSigningKeysOptions): Promise<SigningKeyExport> {
      return {
        format: 'midnight-signing-key-export',
        encryptedPayload: encode({ keys: Object.fromEntries(signingKeys) }),
        salt: 'in-memory',
      };
    },
    async importSigningKeys(
      exported: SigningKeyExport,
      options?: ImportSigningKeysOptions,
    ): Promise<ImportSigningKeysResult> {
      const payload = decode<{ keys?: Record<string, SigningKey> }>(exported.encryptedPayload);
      let imported = 0;
      let skipped = 0;
      let overwritten = 0;
      for (const [address, key] of Object.entries(payload.keys ?? {})) {
        if (signingKeys.has(address)) {
          if (options?.conflictStrategy === 'skip') {
            skipped += 1;
            continue;
          }
          if (!options?.conflictStrategy || options.conflictStrategy === 'error') {
            throw new Error(`Signing key conflict for ${address}`);
          }
          overwritten += 1;
        } else {
          imported += 1;
        }
        signingKeys.set(address, key);
      }
      return { imported, skipped, overwritten };
    },
  };
}
