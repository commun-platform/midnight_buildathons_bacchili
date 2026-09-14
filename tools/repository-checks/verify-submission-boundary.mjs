import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const requiredFiles = [
  'README.md',
  'LICENSE',
  'docs/submission/README.md',
  'docs/submission/evidence_matrix.md',
  'docs/submission/technical_gate_checklist.md',
  'docs/submission/final_delivery.md',
  'midnight/contracts/sensor-registry/src/sensor-registry.compact',
  'shared/public-attestation-verifier/src/index.ts',
];

const forbiddenReviewText = [
  /\.demo-output/iu,
  /\.sct-output/iu,
  /submission\/deck/iu,
  /tools\/submission-media/iu,
  /(?:^|[\\/])(?:local_demo|cloudflare_operations_media|new_gui_recording_handoff|demo_script)(?:[.\\/)]|$)/imu,
  /(?:Review|review) (?:commit|baseline)[^\n`]*[a-f\d]{40}/u,
];
const markdownLink = /!?\[[^\]]*\]\(([^)]+)\)/gu;

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean);
}

const missing = requiredFiles.filter((relative) => !fs.existsSync(path.join(repoRoot, relative)));
if (missing.length > 0) {
  throw new Error(`Required review files are missing: ${missing.join(', ')}`);
}

const violations = [];
for (const relative of trackedFiles().filter((file) => file.endsWith('.md'))) {
  const contents = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  for (const expression of forbiddenReviewText) {
    if (expression.test(contents)) violations.push(`${relative}: ${expression}`);
    expression.lastIndex = 0;
  }
  for (const match of contents.matchAll(markdownLink)) {
    const target = match[1].trim().split(/\s+/u)[0].replace(/^<|>$/gu, '');
    if (!target || target.startsWith('#') || /^(?:https?:|mailto:)/iu.test(target)) continue;
    const relativeTarget = target.split('#', 1)[0];
    if (!relativeTarget) continue;
    if (!fs.existsSync(path.resolve(path.dirname(path.join(repoRoot, relative)), relativeTarget))) {
      violations.push(`${relative}: broken relative link ${target}`);
    }
  }
}

const reviewGuide = fs.readFileSync(path.join(repoRoot, 'docs/submission/README.md'), 'utf8');
for (const requiredPhrase of [
  'tracked source',
  'tracked tests',
  'public URL',
  'git rev-parse HEAD',
  'npm run verify:source',
]) {
  if (!reviewGuide.includes(requiredPhrase)) {
    violations.push(`docs/submission/README.md: missing required review-boundary phrase: ${requiredPhrase}`);
  }
}

if (violations.length > 0) {
  throw new Error(`Submission-boundary check failed:\n${violations.join('\n')}`);
}

process.stdout.write(
  `Verified ${trackedFiles().filter((file) => file.endsWith('.md')).length} tracked Markdown files stay within the source-only review boundary\n`,
);
