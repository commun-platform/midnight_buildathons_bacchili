import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const network = process.env.MIDNIGHT_NETWORK ?? 'preprod';
const deploymentPath = path.resolve(
  process.argv[2] ?? path.join(repoRoot, `.state/development/deployment-${network}.json`),
);
const deviceEnvPath = path.resolve(
  process.argv[3] ?? path.join(repoRoot, 'edge-device/release/.env.device'),
);

if (!fs.existsSync(deploymentPath)) throw new Error(`Development deployment record not found: ${deploymentPath}`);
if (!fs.existsSync(deviceEnvPath)) throw new Error(`Device environment file not found: ${deviceEnvPath}`);

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const contractAddress = typeof deployment.contractAddress === 'string'
  ? deployment.contractAddress.trim()
  : '';
if (!contractAddress || /[\r\n]/.test(contractAddress)) {
  throw new Error(`Development deployment record has no valid contract address: ${deploymentPath}`);
}

const lines = fs.readFileSync(deviceEnvPath, 'utf8').split(/\r?\n/);
let found = false;
const updated = lines.map((line) => {
  if (!line.startsWith('DEVICE_CONTRACT_ADDRESS=')) return line;
  found = true;
  const current = line.slice('DEVICE_CONTRACT_ADDRESS='.length).trim();
  if (current && current !== contractAddress) {
    throw new Error('DEVICE_CONTRACT_ADDRESS already names a different deployment; refusing to overwrite it');
  }
  return `DEVICE_CONTRACT_ADDRESS=${contractAddress}`;
});
if (!found) updated.push(`DEVICE_CONTRACT_ADDRESS=${contractAddress}`);

const temporary = `${deviceEnvPath}.tmp-${process.pid}`;
fs.writeFileSync(temporary, `${updated.join('\n').replace(/\n+$/, '')}\n`, {
  encoding: 'utf8',
  mode: 0o600,
  flag: 'wx',
});
fs.renameSync(temporary, deviceEnvPath);
fs.chmodSync(deviceEnvPath, 0o600);
process.stdout.write(`Configured ${deviceEnvPath} from the development deployment record; the address was not printed.\n`);
