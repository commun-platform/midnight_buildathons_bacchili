import {
  browserPolicyCanonicalMessage,
  browserProjectCanonicalMessage,
  browserProvisioningCanonicalMessage,
  type BrowserPolicyAuthorization,
  type BrowserProjectAuthorization,
  type BrowserProvisioningAuthorization,
} from '@midnight-demo/shared/runtime';
import { verifySignature } from '@midnight-ntwrk/onchain-runtime-v3';

export const walletSignatureVerificationPath = '/operator/verify-wallet-signature';
export const walletSignatureVerificationVersion = 'verify-wallet-signature-v1';
export const projectSignatureVerificationVersion = 'verify-project-signature-v1';
export const policySignatureVerificationVersion = 'verify-policy-signature-v1';

function safeIdentifier(name: string, value: unknown, maximum = 160): string {
  if (typeof value !== 'string' || value.length > maximum) throw new Error(`${name} is invalid`);
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized)) throw new Error(`${name} is invalid`);
  return normalized;
}

function safeP256KeyId(name: string, value: unknown): string {
  if (typeof value !== 'string') throw new Error(`${name} is invalid`);
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{43}$/u.test(normalized)) throw new Error(`${name} is invalid`);
  return normalized;
}

export function verifyBrowserProvisioningAuthorization(
  input: unknown,
): asserts input is BrowserProvisioningAuthorization {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Browser provisioning authorization is required');
  }
  const authorization = input as Partial<BrowserProvisioningAuthorization>;
  const deviceId = safeIdentifier('Browser provisioning Device ID', authorization.deviceId, 80);
  const keyId = safeP256KeyId('Browser provisioning key ID', authorization.keyId);
  const deviceAuthority = typeof authorization.deviceAuthority === 'string'
    ? authorization.deviceAuthority.trim().replace(/^0x/iu, '').toLowerCase()
    : '';
  if (!/^(?:[0-9a-f]{2}){32}$/u.test(deviceAuthority)) {
    throw new Error('Browser provisioning Device Authority is invalid');
  }
  const policyId = safeIdentifier('Browser provisioning Policy ID', authorization.policyId);
  const challengeId = safeIdentifier('Browser provisioning challenge ID', authorization.challengeId);
  const nonce = typeof authorization.nonce === 'string' && authorization.nonce.length <= 128
    ? authorization.nonce
    : '';
  const timestamp = typeof authorization.timestamp === 'string' ? authorization.timestamp : '';
  if (!nonce || !Number.isFinite(Date.parse(timestamp))) {
    throw new Error('Browser provisioning timestamp or nonce is invalid');
  }
  const walletSignature = authorization.walletSignature;
  if (
    !walletSignature
    || typeof walletSignature !== 'object'
    || typeof walletSignature.data !== 'string'
    || typeof walletSignature.signature !== 'string'
    || typeof walletSignature.verifyingKey !== 'string'
    || walletSignature.data.length > 2048
    || walletSignature.signature.length > 1024
    || walletSignature.verifyingKey.length > 1024
  ) throw new Error('Browser provisioning Wallet signature is invalid');
  const canonical = browserProvisioningCanonicalMessage({
    deviceId,
    keyId,
    deviceAuthority,
    policyId,
    challengeId,
    nonce,
    timestamp,
  });
  if (
    walletSignature.data !== canonical
    || !verifySignature(
      walletSignature.verifyingKey,
      new TextEncoder().encode(canonical),
      walletSignature.signature,
    )
  ) throw new Error('Midnight Wallet signature verification failed');
}

export function verifyBrowserProjectAuthorization(
  input: unknown,
): asserts input is BrowserProjectAuthorization {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Browser Project authorization is required');
  }
  const authorization = input as Partial<BrowserProjectAuthorization>;
  const challengeId = safeIdentifier('Browser Project challenge ID', authorization.challengeId);
  const nonce = typeof authorization.nonce === 'string' && authorization.nonce.length <= 128
    ? authorization.nonce
    : '';
  const timestamp = typeof authorization.timestamp === 'string' ? authorization.timestamp : '';
  if (!nonce || !Number.isFinite(Date.parse(timestamp))) {
    throw new Error('Browser Project timestamp or nonce is invalid');
  }
  const walletSignature = authorization.walletSignature;
  if (
    !walletSignature
    || typeof walletSignature !== 'object'
    || typeof walletSignature.data !== 'string'
    || typeof walletSignature.signature !== 'string'
    || typeof walletSignature.verifyingKey !== 'string'
    || walletSignature.data.length > 2048
    || walletSignature.signature.length > 1024
    || walletSignature.verifyingKey.length > 1024
  ) throw new Error('Browser Project Wallet signature is invalid');
  const canonical = browserProjectCanonicalMessage({ challengeId, nonce, timestamp });
  if (
    walletSignature.data !== canonical
    || !verifySignature(
      walletSignature.verifyingKey,
      new TextEncoder().encode(canonical),
      walletSignature.signature,
    )
  ) throw new Error('Midnight Wallet signature verification failed');
}

function policyBound(name: string, value: unknown): number | null {
  if (value === null) return null;
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < -10_000
    || value > 0xffff_ffff - 10_000
  ) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

export function verifyBrowserPolicyAuthorization(
  input: unknown,
): asserts input is BrowserPolicyAuthorization {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Browser Policy authorization is required');
  }
  const authorization = input as Partial<BrowserPolicyAuthorization>;
  const projectId = safeIdentifier('Browser Policy Project ID', authorization.projectId);
  const policyId = safeIdentifier('Browser Policy ID', authorization.policyId);
  const name = typeof authorization.name === 'string' ? authorization.name.trim() : '';
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new Error('Browser Policy name is invalid');
  }
  const mode = authorization.mode;
  if (!['closed-range', 'upper-bound', 'lower-bound'].includes(mode ?? '')) {
    throw new Error('Browser Policy mode is invalid');
  }
  const minimumCentiCelsius = policyBound(
    'Browser Policy minimum',
    authorization.minimumCentiCelsius,
  );
  const maximumCentiCelsius = policyBound(
    'Browser Policy maximum',
    authorization.maximumCentiCelsius,
  );
  if (
    (mode === 'closed-range' && (
      minimumCentiCelsius === null
      || maximumCentiCelsius === null
      || minimumCentiCelsius > maximumCentiCelsius
    ))
    || (mode === 'upper-bound' && (minimumCentiCelsius !== null || maximumCentiCelsius === null))
    || (mode === 'lower-bound' && (minimumCentiCelsius === null || maximumCentiCelsius !== null))
  ) throw new Error('Browser Policy bounds are not canonical');
  const challengeId = safeIdentifier('Browser Policy challenge ID', authorization.challengeId);
  const nonce = typeof authorization.nonce === 'string' && authorization.nonce.length <= 128
    ? authorization.nonce
    : '';
  const timestamp = typeof authorization.timestamp === 'string' ? authorization.timestamp : '';
  if (!nonce || !Number.isFinite(Date.parse(timestamp))) {
    throw new Error('Browser Policy timestamp or nonce is invalid');
  }
  const walletSignature = authorization.walletSignature;
  if (
    !walletSignature
    || typeof walletSignature !== 'object'
    || typeof walletSignature.data !== 'string'
    || typeof walletSignature.signature !== 'string'
    || typeof walletSignature.verifyingKey !== 'string'
    || walletSignature.data.length > 4096
    || walletSignature.signature.length > 1024
    || walletSignature.verifyingKey.length > 1024
  ) throw new Error('Browser Policy Wallet signature is invalid');
  const canonical = browserPolicyCanonicalMessage({
    projectId,
    policyId,
    name,
    mode: mode as BrowserPolicyAuthorization['mode'],
    minimumCentiCelsius,
    maximumCentiCelsius,
    challengeId,
    nonce,
    timestamp,
  });
  if (
    walletSignature.data !== canonical
    || !verifySignature(
      walletSignature.verifyingKey,
      new TextEncoder().encode(canonical),
      walletSignature.signature,
    )
  ) throw new Error('Midnight Wallet signature verification failed');
}

export function verifyWalletSignatureRequest(
  provisioningVersion: string | undefined,
  body: Uint8Array,
): void {
  const parsed = JSON.parse(Buffer.from(body).toString('utf8')) as unknown;
  if (provisioningVersion === walletSignatureVerificationVersion) {
    verifyBrowserProvisioningAuthorization(parsed);
    return;
  }
  if (provisioningVersion === projectSignatureVerificationVersion) {
    verifyBrowserProjectAuthorization(parsed);
    return;
  }
  if (provisioningVersion === policySignatureVerificationVersion) {
    verifyBrowserPolicyAuthorization(parsed);
    return;
  }
  throw new Error('Operator provisioning request is invalid');
}
