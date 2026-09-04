export interface ManagedArtifactBinding {
  objectKey: string;
  sourceId: string;
  runId: string;
  periodDate: string;
}

export interface ManagedArtifactEnvelope {
  schemaVersion: 1;
  algorithm: 'AES-256-GCM';
  keyVersion: number;
  iv: string;
  ciphertext: string;
}

const hexKeyPattern = /^[0-9a-f]{64}$/iu;

function bytesFromHex(value: string): Uint8Array {
  if (!hexKeyPattern.test(value)) {
    throw new Error('Managed artifact encryption key must be 32 bytes encoded as hexadecimal');
  }
  return Uint8Array.from(
    value.match(/.{2}/gu) ?? [],
    (pair) => Number.parseInt(pair, 16),
  );
}

function base64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('Managed artifact envelope is invalid');
  const base64 = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = `${base64}${'='.repeat((4 - base64.length % 4) % 4)}`;
  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Managed artifact envelope is invalid');
  }
}

function associatedData(binding: ManagedArtifactBinding, keyVersion: number): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    schemaVersion: 1,
    algorithm: 'AES-256-GCM',
    keyVersion,
    objectKey: binding.objectKey,
    sourceId: binding.sourceId,
    runId: binding.runId,
    periodDate: binding.periodDate,
  }));
}

async function encryptionKey(hexKey: string, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bytesFromHex(hexKey), 'AES-GCM', false, [usage]);
}

export async function encryptManagedArtifact(
  value: unknown,
  hexKey: string,
  binding: ManagedArtifactBinding,
  keyVersion = 1,
): Promise<ManagedArtifactEnvelope> {
  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) {
    throw new Error('Managed artifact key version is invalid');
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: associatedData(binding, keyVersion) },
    await encryptionKey(hexKey, 'encrypt'),
    plaintext,
  );
  return {
    schemaVersion: 1,
    algorithm: 'AES-256-GCM',
    keyVersion,
    iv: base64Url(iv),
    ciphertext: base64Url(new Uint8Array(ciphertext)),
  };
}

export async function decryptManagedArtifact<T>(
  envelope: ManagedArtifactEnvelope,
  hexKey: string,
  binding: ManagedArtifactBinding,
): Promise<T> {
  if (
    envelope.schemaVersion !== 1
    || envelope.algorithm !== 'AES-256-GCM'
    || !Number.isSafeInteger(envelope.keyVersion)
    || envelope.keyVersion < 1
  ) throw new Error('Managed artifact envelope is invalid');
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64Url(envelope.iv),
        additionalData: associatedData(binding, envelope.keyVersion),
      },
      await encryptionKey(hexKey, 'decrypt'),
      fromBase64Url(envelope.ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Managed artifact')) throw error;
    throw new Error('Managed artifact authentication failed');
  }
}
