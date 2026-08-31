import { getOrCreateSponsorCredentials, sponsorCredentialFile } from './identity.js';

function main(): void {
  const command = process.argv[2];
  if (command !== 'wallet') {
    process.stdout.write('Usage: cli.ts wallet\n');
    return;
  }
  const { credentials, created } = getOrCreateSponsorCredentials();
  process.stdout.write(`${JSON.stringify({
    created,
    network: credentials.network,
    sponsorAddress: credentials.unshieldedAddress,
    credentialFile: sponsorCredentialFile,
    recoveryMaterialPrinted: false,
    next: created
      ? 'Back up the owner-only credential file offline, fund this address with tNIGHT, then configure the deployment secret.'
      : 'Use this dedicated address only for sponsorship funding.',
  }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
