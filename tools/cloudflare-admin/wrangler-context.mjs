import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export const wrangler = path.join(repoRoot, 'node_modules', '.bin', 'wrangler');
export const wranglerConfig = path.join(
  repoRoot,
  'backend',
  'cloudflare',
  'deployment',
  'wrangler.jsonc',
);
