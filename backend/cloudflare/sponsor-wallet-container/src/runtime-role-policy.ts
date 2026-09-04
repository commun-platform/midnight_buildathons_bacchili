export const walletRuntimeRoles = [
  'server-wallet',
] as const;

export type WalletRuntimeRole = typeof walletRuntimeRoles[number];

export function requireWalletRuntimeRole(value: string): WalletRuntimeRole {
  if (!(walletRuntimeRoles as readonly string[]).includes(value)) {
    throw new Error('WALLET_RUNTIME_ROLE is invalid');
  }
  return value as WalletRuntimeRole;
}

export function walletRuntimeAllows(
  role: WalletRuntimeRole,
  pathname: string,
): boolean {
  if (role !== 'server-wallet') return false;
  if (['/restore', '/health', '/checkpoint'].includes(pathname)) return true;
  return ['/prepare', '/submit', '/release'].includes(pathname)
    || pathname.startsWith('/operator/')
    || pathname.startsWith('/managed/');
}
