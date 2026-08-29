import { seedSyntheticDemoWindow, startCollector } from './collector.js';
import { loadEdgeConfig } from './config.js';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3);
}

async function main(): Promise<void> {
  try {
    if (process.argv[2] === 'demo-seed') {
      if (!process.argv.includes('--confirm-synthetic-demo')) {
        throw new Error('Synthetic demo seed requires --confirm-synthetic-demo');
      }
      const samples = Number(flag('samples') ?? 60);
      const seeded = seedSyntheticDemoWindow(loadEdgeConfig(), samples);
      process.stdout.write(`${JSON.stringify({ seeded: true, ...seeded }, null, 2)}\n`);
      return;
    }
    await startCollector(loadEdgeConfig());
    // The tsx runtime and HTTP client can retain idle worker/socket handles after
    // graceful shutdown. All collector work is complete here, so terminate the
    // service process explicitly instead of making systemd wait for those handles.
    process.exit(0);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      component: 'edge-agent',
      event: 'fatal',
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    })}\n`);
    process.exit(1);
  }
}

void main();
