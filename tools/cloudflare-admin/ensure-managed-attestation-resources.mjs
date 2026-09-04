import { spawnSync } from 'node:child_process';

import { repoRoot, wrangler, wranglerConfig } from './wrangler-context.mjs';

const resources = {
  queues: ['midnight-managed-source-jobs', 'midnight-managed-source-jobs-dlq'],
  buckets: ['midnight-managed-source-private'],
};

function run(args, capture = false) {
  const result = spawnSync(wrangler, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() : '';
    throw new Error(`Wrangler exited with status ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return capture ? `${result.stdout ?? ''}\n${result.stderr ?? ''}` : '';
}

function containsResource(listing, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(?:^|[^A-Za-z0-9._:-])${escaped}(?:$|[^A-Za-z0-9._:-])`, 'mu')
    .test(listing);
}

const queueListing = run(['queues', 'list', '--config', wranglerConfig], true);
for (const queue of resources.queues) {
  if (containsResource(queueListing, queue)) {
    process.stdout.write(`Queue already exists: ${queue}\n`);
    continue;
  }
  run(['queues', 'create', queue, '--config', wranglerConfig]);
}

const bucketListing = run(['r2', 'bucket', 'list', '--config', wranglerConfig], true);
for (const bucket of resources.buckets) {
  if (containsResource(bucketListing, bucket)) {
    process.stdout.write(`R2 bucket already exists: ${bucket}\n`);
    continue;
  }
  run(['r2', 'bucket', 'create', bucket, '--config', wranglerConfig]);
}

process.stdout.write('Managed API Attestation Cloudflare resources are ready.\n');
