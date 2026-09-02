import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const script = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

describe('administrator daily navigation', () => {
  it('treats missing Wallet or Device registration as an access gate instead of a view failure', () => {
    expect(script).toContain('function administratorAccessGate()');
    expect(script).toContain("id=\"admin-access-gate\"");
    expect(script).toContain('if (!deviceState.wallet || !deviceState.provisioned)');
    expect(script).toContain('main.innerHTML = administratorAccessGate();');
    expect(script).toContain("adminDeviceRequiredTitle: 'Device registration required'");
  });

  it('rerenders the Administrator route immediately after Wallet restoration', () => {
    expect(script).toContain("else if (completed && fullRender && route().name === 'admin')");
    expect(script).toContain('await render({ showLoading: false });');
  });

  it('offers explicit older and newer day actions without requiring a Proof Job ID', () => {
    expect(script).toContain("olderDay: '◀ Older day'");
    expect(script).toContain("newerDay: 'Newer day ▶'");
    expect(script).toContain('class="admin-day-nav"');
    expect(script).toContain('class="daily-date-navigation"');
    expect(script).toContain("document.querySelectorAll('.admin-day-nav')");
  });
});
