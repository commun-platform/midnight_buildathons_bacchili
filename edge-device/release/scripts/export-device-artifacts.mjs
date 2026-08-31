import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const sourceDir = path.join(
  repoRoot,
  'midnight',
  'contracts',
  'sensor-registry',
  'src',
  'managed',
  'sensor-registry',
);
const outputDir = path.resolve(
  repoRoot,
  process.argv[2] ?? path.join('.device-release', 'sensor-registry'),
);

function filesUnder(directory, prefix = '') {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...filesUnder(absolute, relative));
    else if (entry.isFile()) result.push(relative);
  }
  return result.sort();
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

if (!fs.existsSync(path.join(sourceDir, 'contract', 'index.js'))) {
  throw new Error('Compiled sensor-registry artifacts are missing; run npm run contract:compile in the build environment');
}
if (fs.existsSync(outputDir)) throw new Error(`Refusing to overwrite existing export: ${outputDir}`);

const sourceFiles = filesUnder(sourceDir);
for (const relative of sourceFiles) {
  const size = fs.statSync(path.join(sourceDir, relative)).size;
  if (size === 0) throw new Error(`Refusing to export zero-byte artifact: ${relative}`);
}
const temporary = `${outputDir}.tmp-${process.pid}`;
fs.mkdirSync(path.dirname(outputDir), { recursive: true });
fs.cpSync(sourceDir, temporary, { recursive: true, errorOnExist: true });
const manifest = {
  schemaVersion: 1,
  contract: 'sensor-registry',
  exportedAt: new Date().toISOString(),
  files: sourceFiles.map((relative) => ({
    path: relative,
    size: fs.statSync(path.join(sourceDir, relative)).size,
    sha256: sha256(path.join(sourceDir, relative)),
  })),
};
fs.writeFileSync(
  path.join(temporary, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  { encoding: 'utf8', mode: 0o644 },
);
fs.renameSync(temporary, outputDir);
process.stdout.write(`Exported verified device runtime artifacts to ${outputDir}\n`);
