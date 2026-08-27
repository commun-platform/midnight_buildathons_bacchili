import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const markerPath = path.join(repoRoot, '.host-role');
const markerRole = fs.existsSync(markerPath)
  ? fs.readFileSync(markerPath, 'utf8').trim().toLowerCase()
  : '';
const manifestPath = path.join(repoRoot, 'device-release-manifest.json');
let releaseRole = '';
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    releaseRole = typeof manifest.role === 'string' ? manifest.role.trim().toLowerCase() : '';
  } catch {
    releaseRole = '';
  }
}
const role = process.env.MIDNIGHT_HOST_ROLE?.trim().toLowerCase() || markerRole || releaseRole;

if (role !== 'edge' && role !== 'device') {
  process.stderr.write(
    'Refusing device-wallet command outside a device checkout. '
      + 'Install with device-installer.sh or set a .host-role marker to device.\n',
  );
  process.exit(78);
}
