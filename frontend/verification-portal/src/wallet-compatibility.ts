export interface WalletShieldedAddresses {
  shieldedAddress: string;
  shieldedCoinPublicKey: string;
  shieldedEncryptionPublicKey: string;
}

type WalletConnectorError = {
  type?: unknown;
  code?: unknown;
  message?: unknown;
  reason?: unknown;
  walletConnectionStage?: unknown;
};

export function walletConnectionFailureStage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const stage = (error as WalletConnectorError).walletConnectionStage;
  return typeof stage === 'string' && stage.length > 0 ? stage : null;
}

export function isWalletConnectionLost(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as WalletConnectorError;
  if (
    candidate.type === 'DAppConnectorAPIError'
    && candidate.code === 'Disconnected'
  ) return true;
  const detail = [candidate.message, candidate.reason]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  return /Remote API with channel .* was shutdown/iu.test(detail)
    || /object can no longer be used/iu.test(detail);
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
