export type WalletRuntimeRole = 'server-wallet';

interface WalletRuntimeSecretSource {
  SPONSOR_WALLET_SEED?: string;
  OPERATOR_AUTHORITY_SECRET?: string;
  MANAGED_ATTESTOR_ROOT_SECRET?: string;
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim() ?? '';
  if (!/^(?:[0-9a-f]{2}){32}$/u.test(normalized)) {
    throw new Error(`${name} must contain exactly 32 lowercase hexadecimal bytes`);
  }
  return normalized;
}

export function walletRuntimeProcessEnvironment(
  role: WalletRuntimeRole,
  source: WalletRuntimeSecretSource,
): Record<string, string> {
  return {
    WALLET_RUNTIME_ROLE: role,
    WALLET_RUNTIME_SEED: required(source.SPONSOR_WALLET_SEED, 'SPONSOR_WALLET_SEED'),
    OPERATOR_AUTHORITY_SECRET: required(
      source.OPERATOR_AUTHORITY_SECRET,
      'OPERATOR_AUTHORITY_SECRET',
    ),
    MANAGED_ATTESTOR_ROOT_SECRET: required(
      source.MANAGED_ATTESTOR_ROOT_SECRET,
      'MANAGED_ATTESTOR_ROOT_SECRET',
    ),
  };
}
