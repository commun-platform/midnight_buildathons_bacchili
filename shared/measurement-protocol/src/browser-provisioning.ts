export interface BrowserWalletSignature {
  data: string;
  signature: string;
  verifyingKey: string;
}

export interface BrowserProvisioningAuthorization {
  deviceId: string;
  keyId: string;
  deviceAuthority: string;
  policyId: string;
  challengeId: string;
  nonce: string;
  timestamp: string;
  walletSignature: BrowserWalletSignature;
}

export interface BrowserProjectAuthorization {
  challengeId: string;
  nonce: string;
  timestamp: string;
  walletSignature: BrowserWalletSignature;
}

export type BrowserPolicyMode = 'closed-range' | 'upper-bound' | 'lower-bound';

export interface BrowserPolicyAuthorization {
  projectId: string;
  policyId: string;
  name: string;
  mode: BrowserPolicyMode;
  minimumCentiCelsius: number | null;
  maximumCentiCelsius: number | null;
  challengeId: string;
  nonce: string;
  timestamp: string;
  walletSignature: BrowserWalletSignature;
}

const browserWalletDeviceIdDomain = 'VSP-BROWSER-DEVICE-ID-V1';

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function deriveBrowserWalletDeviceId(
  walletKeySha256: string,
  projectId: string,
): Promise<string> {
  const normalizedWalletKey = walletKeySha256.trim().toLowerCase();
  const normalizedProjectId = projectId.trim();
  if (!/^(?:[0-9a-f]{2}){32}$/u.test(normalizedWalletKey)) {
    throw new Error('Wallet public identifier must be a 32-byte SHA-256 value');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(normalizedProjectId)) {
    throw new Error('Project ID must contain 1-160 safe identifier characters');
  }
  const input = [browserWalletDeviceIdDomain, normalizedProjectId, normalizedWalletKey].join('\n');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return `device-${bytesToHex(new Uint8Array(digest))}`;
}

export function browserProvisioningCanonicalMessage(
  input: Omit<BrowserProvisioningAuthorization, 'walletSignature'>,
): string {
  return [
    'VSP-BROWSER-PROVISIONING-V1',
    'POST',
    '/api/v1/provisioning/devices',
    input.deviceId,
    input.keyId,
    input.deviceAuthority,
    input.policyId,
    input.challengeId,
    input.nonce,
    input.timestamp,
  ].join('\n');
}

export function browserProjectCanonicalMessage(
  input: Omit<BrowserProjectAuthorization, 'walletSignature'>,
): string {
  return [
    'VSP-BROWSER-PROJECT-SESSION-V1',
    'POST',
    '/api/v1/projects/session',
    input.challengeId,
    input.nonce,
    input.timestamp,
  ].join('\n');
}

export function browserPolicyCanonicalMessage(
  input: Omit<BrowserPolicyAuthorization, 'walletSignature'>,
): string {
  return [
    'VSP-BROWSER-POLICY-V1',
    'POST',
    '/api/v1/policies',
    input.projectId,
    input.policyId,
    input.name,
    input.mode,
    input.minimumCentiCelsius === null ? '-' : String(input.minimumCentiCelsius),
    input.maximumCentiCelsius === null ? '-' : String(input.maximumCentiCelsius),
    input.challengeId,
    input.nonce,
    input.timestamp,
  ].join('\n');
}
