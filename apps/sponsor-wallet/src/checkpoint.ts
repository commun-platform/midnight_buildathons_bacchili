import crypto from 'node:crypto';

const magic = Buffer.from('VSP-SPONSOR-CHECKPOINT-V1\0', 'utf8');

function encryptionKey(seedHex: string): Buffer {
  return crypto
    .createHash('sha256')
    .update('vsp:sponsor-checkpoint-key:v1\n', 'utf8')
    .update(seedHex, 'utf8')
    .digest();
}

export function encryptCheckpoint(seedHex: string, state: unknown): Uint8Array {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(seedHex), iv);
  cipher.setAAD(magic);
  const plaintext = Buffer.from(JSON.stringify({ version: 1, state }), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([magic, iv, tag, ciphertext]);
}

export function decryptCheckpoint(seedHex: string, encrypted: Uint8Array): unknown {
  const bytes = Buffer.from(encrypted);
  const minimumLength = magic.length + 12 + 16 + 1;
  if (bytes.length < minimumLength || !bytes.subarray(0, magic.length).equals(magic)) {
    throw new Error('Sponsor checkpoint format is invalid');
  }
  const ivStart = magic.length;
  const tagStart = ivStart + 12;
  const ciphertextStart = tagStart + 16;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(seedHex),
    bytes.subarray(ivStart, tagStart),
  );
  decipher.setAAD(magic);
  decipher.setAuthTag(bytes.subarray(tagStart, ciphertextStart));
  const plaintext = Buffer.concat([
    decipher.update(bytes.subarray(ciphertextStart)),
    decipher.final(),
  ]);
  const parsed = JSON.parse(plaintext.toString('utf8')) as { version?: unknown; state?: unknown };
  if (parsed.version !== 1 || !('state' in parsed)) {
    throw new Error('Sponsor checkpoint payload is incompatible');
  }
  return parsed.state;
}
