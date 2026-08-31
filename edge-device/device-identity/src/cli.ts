import {
  defaultDeviceHome,
  deviceAuthorizationHeaders,
  generateDeviceIdentity,
  loadDeviceEnrollment,
  refreshDeviceEnrollment,
  type DeviceScope,
} from './index.js';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3);
}

function requiredFlag(name: string): string {
  const value = flag(name)?.trim();
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const authHome = flag('auth-home');
  if (command === 'generate') {
    if (!process.argv.includes('--confirm-device-key-generation')) {
      throw new Error('Device key generation requires --confirm-device-key-generation');
    }
    const enrollment = await generateDeviceIdentity({
      deviceId: requiredFlag('device-id'),
      projectId: requiredFlag('project-id'),
      authHome,
    });
    process.stdout.write(`${JSON.stringify({
      created: true,
      deviceId: enrollment.deviceId,
      projectId: enrollment.projectId,
      keyId: enrollment.keyId,
      enrollmentFile: `${authHome ?? `${defaultDeviceHome}/device-auth`}/enrollment.json`,
    }, null, 2)}\n`);
    return;
  }
  if (command === 'refresh-enrollment') {
    const enrollment = refreshDeviceEnrollment({
      deviceId: requiredFlag('device-id'),
      projectId: requiredFlag('project-id'),
      authHome,
    });
    process.stdout.write(`${JSON.stringify({
      refreshed: true,
      deviceId: enrollment.deviceId,
      projectId: enrollment.projectId,
      keyId: enrollment.keyId,
      requestedScopes: enrollment.requestedScopes,
    }, null, 2)}\n`);
    return;
  }
  if (command === 'show') {
    process.stdout.write(`${JSON.stringify(loadDeviceEnrollment(authHome), null, 2)}\n`);
    return;
  }
  if (command === 'session') {
    const scope = requiredFlag('scope') as DeviceScope;
    await deviceAuthorizationHeaders({
      deviceId: requiredFlag('device-id'),
      projectId: requiredFlag('project-id'),
      serviceUrl: requiredFlag('url'),
      authHome,
    }, scope);
    process.stdout.write(`${JSON.stringify({ authenticated: true, scope }, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    'Usage: cli.ts <generate|refresh-enrollment|show|session> [--device-id ID --project-id ID --url URL --scope SCOPE]\n',
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
