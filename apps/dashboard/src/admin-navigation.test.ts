import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const script = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

describe('administrator daily navigation', () => {
  it('offers explicit older and newer day actions without requiring a Proof Job ID', () => {
    expect(script).toContain("olderDay: '◀ Older day'");
    expect(script).toContain("newerDay: 'Newer day ▶'");
    expect(script).toContain('class="admin-day-nav"');
    expect(script).toContain('class="daily-date-navigation"');
    expect(script).toContain("document.querySelectorAll('.admin-day-nav')");
  });
});
