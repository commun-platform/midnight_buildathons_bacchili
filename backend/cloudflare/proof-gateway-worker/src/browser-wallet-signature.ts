import {
  browserPolicyCanonicalMessage,
  browserProjectCanonicalMessage,
  browserProvisioningCanonicalMessage,
  type BrowserPolicyAuthorization,
  type BrowserProjectAuthorization,
  type BrowserProvisioningAuthorization,
} from '@midnight-demo/shared/browser-provisioning';
import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';

const encoder = new TextEncoder();

function validWalletSignature(
  value: unknown,
  maximumDataLength: number,
): value is { data: string; signature: string; verifyingKey: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const signature = value as Record<string, unknown>;
  return typeof signature.data === 'string'
    && typeof signature.signature === 'string'
    && typeof signature.verifyingKey === 'string'
    && signature.data.length <= maximumDataLength
    && signature.signature.length <= 1024
    && signature.verifyingKey.length <= 1024;
}

function verifyCanonicalSignature(
  signature: { data: string; signature: string; verifyingKey: string },
  canonical: string,
): void {
  let valid = false;
  try {
    // Midnight's official on-chain runtime uses k256's Signer/Verifier API,
    // which SHA-256 prehashes the arbitrary payload before applying BIP-340.
    // Noble provides the same BIP-340 verification without loading WASM in a
    // Cloudflare Worker. The Server Wallet repeats verification with the
    // official runtime before constructing the on-chain transaction.
    valid = signature.data === canonical && schnorr.verify(
      signature.signature,
      sha256(encoder.encode(canonical)),
      signature.verifyingKey,
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new Error('Midnight Wallet signature verification failed');
}

export function verifyBrowserProjectAuthorization(
  authorization: BrowserProjectAuthorization,
): void {
  if (!validWalletSignature(authorization.walletSignature, 2048)) {
    throw new Error('Browser Project Wallet signature is invalid');
  }
  verifyCanonicalSignature(
    authorization.walletSignature,
    browserProjectCanonicalMessage({
      challengeId: authorization.challengeId,
      nonce: authorization.nonce,
      timestamp: authorization.timestamp,
    }),
  );
}

export function verifyBrowserPolicyAuthorization(
  authorization: BrowserPolicyAuthorization,
): void {
  if (!validWalletSignature(authorization.walletSignature, 4096)) {
    throw new Error('Browser Policy Wallet signature is invalid');
  }
  verifyCanonicalSignature(
    authorization.walletSignature,
    browserPolicyCanonicalMessage({
      projectId: authorization.projectId,
      policyId: authorization.policyId,
      name: authorization.name,
      mode: authorization.mode,
      minimumCentiCelsius: authorization.minimumCentiCelsius,
      maximumCentiCelsius: authorization.maximumCentiCelsius,
      challengeId: authorization.challengeId,
      nonce: authorization.nonce,
      timestamp: authorization.timestamp,
    }),
  );
}

export function verifyBrowserProvisioningAuthorization(
  authorization: BrowserProvisioningAuthorization,
): void {
  if (!validWalletSignature(authorization.walletSignature, 2048)) {
    throw new Error('Browser provisioning Wallet signature is invalid');
  }
  verifyCanonicalSignature(
    authorization.walletSignature,
    browserProvisioningCanonicalMessage({
      deviceId: authorization.deviceId,
      keyId: authorization.keyId,
      deviceAuthority: authorization.deviceAuthority,
      policyId: authorization.policyId,
      challengeId: authorization.challengeId,
      nonce: authorization.nonce,
      timestamp: authorization.timestamp,
    }),
  );
}
