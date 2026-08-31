import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const artifactDir = path.resolve(process.argv[2] ?? '.device-release/sensor-registry');
const manifestPath = path.join(artifactDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) throw new Error(`Artifact manifest is missing: ${manifestPath}`);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 1 || manifest.contract !== 'sensor-registry' || !Array.isArray(manifest.files)) {
  throw new Error(`Invalid device artifact manifest: ${manifestPath}`);
}
for (const entry of manifest.files) {
  if (
    typeof entry.path !== 'string'
    || typeof entry.size !== 'number'
    || typeof entry.sha256 !== 'string'
    || path.isAbsolute(entry.path)
    || entry.path.split('/').includes('..')
  ) {
    throw new Error('Artifact manifest contains an invalid file entry');
  }
  const file = path.join(artifactDir, entry.path);
  if (!fs.existsSync(file)) throw new Error(`Artifact file is missing: ${entry.path}`);
  const contents = fs.readFileSync(file);
  const digest = crypto.createHash('sha256').update(contents).digest('hex');
  if (contents.byteLength !== entry.size || digest !== entry.sha256) {
    throw new Error(`Artifact integrity check failed: ${entry.path}`);
  }
}
if (!fs.existsSync(path.join(artifactDir, 'contract', 'index.js'))) {
  throw new Error('Artifact bundle has no compiled contract module');
}
process.stdout.write(`Verified ${manifest.files.length} device runtime artifacts in ${artifactDir}\n`);
