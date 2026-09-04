import crypto from 'node:crypto';

const bytes32Pattern = /^(?:[0-9a-f]{2}){32}$/u;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;

export function deriveManagedDeviceSecretHex(
  rootSecretHex: string,
  projectId: string,
  sourceId: string,
): string {
  if (!bytes32Pattern.test(rootSecretHex)) {
    throw new Error('Managed Attestor root secret is invalid');
  }
  if (!identifierPattern.test(projectId) || !identifierPattern.test(sourceId)) {
    throw new Error('Managed Source identity is invalid');
  }
  return crypto.createHmac('sha256', Buffer.from(rootSecretHex, 'hex'))
    .update(`managed-device-secret:v1\n${projectId}\n${sourceId}`, 'utf8')
    .digest('hex');
}
