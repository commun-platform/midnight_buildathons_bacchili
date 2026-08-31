import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const benchmarkDir = path.join(repoRoot, '.state', 'development', 'benchmarks');
const artifactsRoot = path.join(
  repoRoot,
  'midnight',
  'experiments',
  'daily-attestation-cost',
  'src',
  'managed',
);

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function parseSampleCounts() {
  const value = optionValue('--samples') ?? process.env.ATTESTATION_SAMPLE_COUNTS ?? '24,96,1440';
  const counts = value
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isSafeInteger(entry) && entry > 0);
  if (counts.length === 0 || new Set(counts).size !== counts.length) {
    throw new Error('--samples must contain one or more unique positive integers');
  }
  return counts;
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function selectedCompactToolchain() {
  const versions = commandOutput('compact', ['list']);
  return versions?.match(/^\s*→\s+([^\s]+)/mu)?.[1] ?? null;
}

function fileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function sumFiles(directory, suffix) {
  try {
    return fs.readdirSync(directory)
      .filter((name) => name.endsWith(suffix))
      .reduce((total, name) => total + fs.statSync(path.join(directory, name)).size, 0);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function parseTimeMetrics(raw) {
  const values = new Map(
    raw
      .split(/\r?\n/u)
      .map((line) => line.split('=', 2))
      .filter((parts) => parts.length === 2),
  );
  const number = (key) => {
    const value = Number.parseFloat(values.get(key)?.replace(/%$/u, '') ?? '');
    return Number.isFinite(value) ? value : null;
  };
  const milliseconds = (key) => {
    const value = number(key);
    return value === null ? null : Math.round(value * 1000);
  };
  return {
    wallMs: milliseconds('wall_seconds'),
    userMs: milliseconds('user_seconds'),
    systemMs: milliseconds('system_seconds'),
    cpuPercent: number('cpu_percent'),
    maxRssKiB: number('max_rss_kib'),
  };
}

function artifactMetrics(sampleCount) {
  const profileRoot = path.join(artifactsRoot, `daily-attestation-${sampleCount}`);
  const keys = path.join(profileRoot, 'keys');
  return {
    dailyProverKeyBytes: fileSize(path.join(keys, 'submitDailyAttestation.prover')),
    dailyVerifierKeyBytes: fileSize(path.join(keys, 'submitDailyAttestation.verifier')),
    dailyZkirBytes: fileSize(path.join(profileRoot, 'zkir', 'submitDailyAttestation.bzkir')),
    allProverKeysBytes: sumFiles(keys, '.prover'),
  };
}

function hostMetadata() {
  const cpus = os.cpus();
  return {
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    cpuModel: cpus[0]?.model ?? null,
    logicalCpuCount: cpus.length,
    totalMemoryBytes: os.totalmem(),
  };
}

function toolchainMetadata() {
  const developmentPackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'tools', 'midnight-operator', 'package.json'), 'utf8'),
  );
  return {
    node: process.version,
    npm: commandOutput('npm', ['--version']),
    compactCli: commandOutput('compact', ['--version']),
    compactToolchain: selectedCompactToolchain(),
    midnightJsProtocol: developmentPackage.dependencies['@midnight-ntwrk/midnight-js-protocol'],
    walletSdk: developmentPackage.dependencies['@midnight-ntwrk/wallet-sdk'],
  };
}

function resolveGnuTime() {
  const candidates = [process.env.GNU_TIME_BIN, '/usr/bin/time', 'gtime'].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status === 0 && /GNU Time/iu.test(`${result.stdout}${result.stderr}`)) return candidate;
  }
  throw new Error('GNU time is required; set GNU_TIME_BIN if it is not installed as /usr/bin/time or gtime');
}

fs.mkdirSync(benchmarkDir, { recursive: true, mode: 0o700 });
const sampleCounts = parseSampleCounts();
const skipZk = process.argv.includes('--skip-zk') || process.env.ATTESTATION_SKIP_ZK === '1';
const gnuTime = resolveGnuTime();
const common = {
  benchmarkVersion: 1,
  implementation: 'production-daily-attestation-v1',
  gitCommit: commandOutput('git', ['rev-parse', 'HEAD']),
  host: hostMetadata(),
  toolchain: toolchainMetadata(),
};

for (const sampleCount of sampleCounts) {
  const timePath = path.join(benchmarkDir, `.daily-attestation-compile-${sampleCount}-${process.pid}.time`);
  const outputPath = path.join(benchmarkDir, `daily-attestation-compile-${sampleCount}.json`);
  const timeFormat = [
    'wall_seconds=%e',
    'user_seconds=%U',
    'system_seconds=%S',
    'cpu_percent=%P',
    'max_rss_kib=%M',
  ].join('\n');
  const command = `ATTESTATION_SAMPLE_COUNTS=${sampleCount}${skipZk ? ' ATTESTATION_SKIP_ZK=1' : ''} npm run attestation:compile`;
  process.stdout.write(`Measuring ${sampleCount}-sample daily attestation compile...\n`);
  const result = spawnSync(
    gnuTime,
    ['--quiet', '--output', timePath, '--format', timeFormat, 'npm', 'run', 'attestation:compile'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ATTESTATION_SAMPLE_COUNTS: String(sampleCount),
        ATTESTATION_SKIP_ZK: skipZk ? '1' : '',
      },
      stdio: 'inherit',
    },
  );
  const timing = fs.existsSync(timePath)
    ? parseTimeMetrics(fs.readFileSync(timePath, 'utf8'))
    : { wallMs: null, userMs: null, systemMs: null, cpuPercent: null, maxRssKiB: null };
  fs.rmSync(timePath, { force: true });
  const record = {
    ...common,
    measuredAt: new Date().toISOString(),
    sampleCount,
    skipZk,
    command,
    succeeded: result.status === 0,
    exitCode: result.status,
    error: result.error?.message ?? null,
    timing,
    artifacts: artifactMetrics(sampleCount),
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
  process.stdout.write(`Saved compile benchmark metrics to ${outputPath}\n`);
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
