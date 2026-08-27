import { startCollector } from './collector.js';
import { loadEdgeConfig } from './config.js';

async function main(): Promise<never> {
  try {
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
