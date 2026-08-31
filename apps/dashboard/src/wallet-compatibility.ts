export interface WalletShieldedAddresses {
  shieldedAddress: string;
  shieldedCoinPublicKey: string;
  shieldedEncryptionPublicKey: string;
}

export function requireWalletShieldedAddresses(value: unknown): WalletShieldedAddresses {
  if (!value || typeof value !== 'object') {
    throw new Error('Connected Wallet returned invalid shielded address information');
  }
  const candidate = value as Partial<Record<keyof WalletShieldedAddresses, unknown>>;
  for (const field of [
    'shieldedAddress',
    'shieldedCoinPublicKey',
    'shieldedEncryptionPublicKey',
  ] as const) {
    if (typeof candidate[field] !== 'string' || candidate[field].trim() === '') {
      throw new Error(`Connected Wallet did not provide ${field} required by DApp Connector API 4.x`);
    }
  }
  return candidate as WalletShieldedAddresses;
}
