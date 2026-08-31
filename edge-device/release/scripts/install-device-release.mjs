import fs from 'node:fs';
import path from 'node:path';

const sourceRoot = path.resolve(process.argv[2] ?? '.');
const destinationRoot = path.resolve(process.argv[3] ?? '');
const manifestPath = path.join(sourceRoot, 'device-release-manifest.json');

if (!process.argv[3]) throw new Error('Usage: install-device-release.mjs SOURCE DESTINATION');
if (!fs.existsSync(manifestPath)) throw new Error(`Device release manifest is missing: ${manifestPath}`);

const manifestText = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(manifestText);
if (manifest.schemaVersion !== 2 || manifest.role !== 'device' || !Array.isArray(manifest.files)) {
  throw new Error(`Invalid device release manifest: ${manifestPath}`);
}

const destinationManifest = path.join(destinationRoot, 'device-release-manifest.json');
if (fs.existsSync(destinationRoot)) {
  if (fs.existsSync(destinationManifest) && fs.readFileSync(destinationManifest, 'utf8') === manifestText) {
    process.stdout.write(`Reusing installed device release at ${destinationRoot}\n`);
    process.exit(0);
  }
  throw new Error(`Refusing to overwrite a different installed release: ${destinationRoot}`);
}

const temporaryRoot = `${destinationRoot}.tmp-${process.pid}`;
fs.mkdirSync(path.dirname(destinationRoot), { recursive: true, mode: 0o700 });
fs.mkdirSync(temporaryRoot, { recursive: false, mode: 0o700 });

function safeSource(relative) {
  if (
    typeof relative !== 'string'
    || path.isAbsolute(relative)
    || relative.split('/').includes('..')
  ) {
    throw new Error(`Invalid device release path: ${String(relative)}`);
  }
  const resolved = path.resolve(sourceRoot, relative);
  if (resolved !== sourceRoot && !resolved.startsWith(`${sourceRoot}${path.sep}`)) {
    throw new Error(`Device release path escapes its root: ${relative}`);
  }
  return resolved;
}

try {
  for (const entry of manifest.files) {
    const source = safeSource(entry.path);
    if (!fs.statSync(source).isFile()) throw new Error(`Release entry is not a file: ${entry.path}`);
    const destination = path.join(temporaryRoot, entry.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o755 });
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(destination, fs.statSync(source).mode & 0o777);
  }
  fs.copyFileSync(manifestPath, path.join(temporaryRoot, 'device-release-manifest.json'));
  fs.chmodSync(path.join(temporaryRoot, 'device-release-manifest.json'), 0o644);
  fs.renameSync(temporaryRoot, destinationRoot);
} catch (error) {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
  throw error;
}

process.stdout.write(`Installed device release at ${destinationRoot}\n`);
