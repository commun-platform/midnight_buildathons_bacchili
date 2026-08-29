import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dashboardRoot = fileURLToPath(new URL('../', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const managedRoot = path.join(
  repositoryRoot,
  'contracts/sensor-registry/src/managed/sensor-registry',
);
const publicRoot = path.join(dashboardRoot, 'public');

for (const artifact of ['device-flow.js', 'device-flow.js.map']) {
  fs.rmSync(path.join(publicRoot, artifact), { force: true });
}

for (const directory of ['keys', 'zkir']) {
  const source = path.join(managedRoot, directory);
  if (!fs.existsSync(source)) {
    throw new Error('Contract artifacts are missing. Run npm run contract:compile first.');
  }
  fs.cpSync(source, path.join(publicRoot, directory), { recursive: true, force: true });
}
