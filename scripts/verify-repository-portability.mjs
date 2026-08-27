import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const ignoredDirectories = new Set([
  '.benchmark-cache',
  '.certificate',
  '.device-release',
  '.edge-release',
  '.git',
  '.state',
  '.wrangler',
  'coverage',
  'data',
  'dist',
  'node_modules',
  'runtime',
]);
const ignoredFiles = new Set([
  '.dev.vars',
  '.env',
  '.env.development',
  '.env.device',
  '.env.edge',
  '.host-role',
]);
const textExtensions = new Set([
  '',
  '.compact',
  '.conf',
  '.css',
  '.example',
  '.html',
  '.js',
  '.json',
  '.jsonc',
  '.md',
  '.mjs',
  '.service',
  '.sh',
  '.sql',
  '.timer',
  '.ts',
]);
const forbiddenPatterns = [
  { label: 'Linux user home path', expression: /\/home\/[A-Za-z0-9._-]+\//g },
  { label: 'macOS user home path', expression: /\/Users\/[A-Za-z0-9._-]+\//g },
  { label: 'root home path', expression: /\/root\//g },
  {
    label: 'concrete Cloudflare Workers hostname',
    expression: /https?:\/\/(?:[A-Za-z0-9-]+\.)+[A-Za-z0-9-]+\.workers\.dev(?:[/:]|$)/g,
  },
  {
    label: 'private IPv4 address',
    expression: /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/g,
  },
  {
    label: 'literal deployed contract address',
    expression: /(?:DEVICE_CONTRACT_ADDRESS\s*=\s*|contractAddress\s*:\s*['"])(?:0x)?[a-f\d]{64}/gi,
  },
];

function isGeneratedContractPath(relative) {
  const parts = relative.split(path.sep);
  const sourceIndex = parts.indexOf('src');
  return parts[0] === 'contracts'
    && sourceIndex >= 0
    && (parts[sourceIndex + 1] === 'managed' || parts[sourceIndex + 1] === 'generated');
}

function filesUnder(directory, prefix = '') {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'midnight-level-db') {
        throw new Error(`Runtime LevelDB exists inside the source tree: ${relative}`);
      }
      if (ignoredDirectories.has(entry.name) || isGeneratedContractPath(relative)) continue;
      result.push(...filesUnder(path.join(directory, entry.name), relative));
      continue;
    }
    if (entry.isFile() && !ignoredFiles.has(entry.name)) result.push(relative);
  }
  return result;
}

const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim());
for (const required of [
  '.certificate/',
  '.device-release/',
  '.env',
  '.env.*',
  '!.env.*.example',
  '.dev.vars',
  '!.dev.vars.example',
  '.state/',
  'midnight-level-db/',
]) {
  if (!gitignore.includes(required)) throw new Error(`Required private/runtime ignore rule is missing: ${required}`);
}

const violations = [];
for (const relative of filesUnder(repoRoot)) {
  if (!textExtensions.has(path.extname(relative))) continue;
  const contents = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  for (const { label, expression } of forbiddenPatterns) {
    expression.lastIndex = 0;
    const match = expression.exec(contents);
    if (match) {
      const line = contents.slice(0, match.index).split('\n').length;
      violations.push(`${relative}:${line}: ${label}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Repository portability check failed:\n${violations.join('\n')}`);
}
process.stdout.write('Verified repository source contains no machine-specific paths or deployment values\n');
