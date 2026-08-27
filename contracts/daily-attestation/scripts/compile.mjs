import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const sampleCounts = (process.env.ATTESTATION_SAMPLE_COUNTS ?? '24,96,1440')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isSafeInteger(value) && value > 0);
const skipZk = process.env.ATTESTATION_SKIP_ZK === '1';

for (const sampleCount of sampleCounts) {
  const source = path.join(packageRoot, 'src', 'generated', `daily-attestation-${sampleCount}.compact`);
  const output = path.join(packageRoot, 'src', 'managed', `daily-attestation-${sampleCount}`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const startedAt = Date.now();
  const compileArguments = ['compile'];
  if (skipZk) compileArguments.push('--skip-zk');
  compileArguments.push(source, output);
  const result = spawnSync('compact', compileArguments, {
    cwd: packageRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
  process.stdout.write(
    `Compiled production ${sampleCount}-sample attestation${skipZk ? ' without ZK keys' : ''} in ${Date.now() - startedAt}ms\n`,
  );
}
