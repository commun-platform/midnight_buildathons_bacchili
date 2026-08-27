import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const markerPath = path.join(repoRoot, '.host-role');
const markerRole = fs.existsSync(markerPath)
  ? fs.readFileSync(markerPath, 'utf8').trim().toLowerCase()
  : '';
const role = (process.env.MIDNIGHT_HOST_ROLE?.trim().toLowerCase() || markerRole || 'development');

if (role === 'edge' || role === 'device') {
  process.stderr.write(
    'Refusing development/operator command on a device host. '
      + 'This host may run only device:*, edge:*, or the device systemd service.\n',
  );
  process.exit(78);
}

if (role !== 'development' && role !== 'operator') {
  process.stderr.write(`Unsupported MIDNIGHT_HOST_ROLE: ${role}\n`);
  process.exit(78);
}
