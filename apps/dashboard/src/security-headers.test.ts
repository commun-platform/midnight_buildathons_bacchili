import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const headers = fs.readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const contentSecurityPolicy = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/mu)?.[1];

describe('dashboard security headers', () => {
  it('allows WebAssembly without enabling general string evaluation', () => {
    expect(contentSecurityPolicy).toBeDefined();
    expect(contentSecurityPolicy).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(contentSecurityPolicy?.match(/(?:^|\s)'unsafe-eval'(?=\s|;|$)/gu)).toBeNull();
  });

  it('allows only the browser Device workflow connection classes', () => {
    expect(contentSecurityPolicy).toContain(
      "connect-src 'self' http://127.0.0.1:8790 http://localhost:8790 "
      + 'https://*.workers.dev https://indexer.preprod.midnight.network '
      + 'wss://indexer.preprod.midnight.network https://blockfrost.lw.iog.io '
      + 'wss://blockfrost.lw.iog.io;',
    );
    const connectSources = contentSecurityPolicy
      ?.match(/(?:^|;)\s*connect-src\s+([^;]+)/u)?.[1]
      ?.trim()
      .split(/\s+/u);
    expect(connectSources).not.toContain('http:');
    expect(connectSources).not.toContain('https:');
    expect(connectSources).not.toContain('*');
  });
});
