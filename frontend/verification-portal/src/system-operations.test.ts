import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const directory = new URL('../public/system-operations/', import.meta.url);
const html = fs.readFileSync(new URL('index.html', directory), 'utf8');
const script = fs.readFileSync(new URL('operations.js', directory), 'utf8');
const migration = fs.readFileSync(
  new URL('../../../backend/cloudflare/d1-schema/migrations/0023_system_operations.sql', import.meta.url),
  'utf8',
);
const deviceFlow = fs.readFileSync(new URL('device-flow.ts', import.meta.url), 'utf8');
const midnightDevice = fs.readFileSync(new URL('midnight-device.ts', import.meta.url), 'utf8');

describe('system operations console', () => {
  it('shows health, Sponsor Wallet, alerts, daily metrics, and the customer audit trail', () => {
    expect(html).toContain('現在の稼働状態');
    expect(html).toContain('Sponsor Wallet');
    expect(html).toContain('要対応アラート');
    expect(html).toContain('日次処理量');
    expect(html).toContain('顧客操作・運用イベント');
    expect(html).toContain('Raw センサー値は監査ログへ保存しません');
  });

  it('uses protected APIs, visible loading states, and a 30-second live refresh', () => {
    expect(script).toContain('/api/v1/system-operations/overview');
    expect(script).toContain('/api/v1/system-operations/metrics');
    expect(script).toContain('/api/v1/system-operations/events');
    expect(script).toContain("'X-System-Operations-Local': 'dashboard'");
    expect(script).toContain('setInterval(() => loadOverview(true), 30_000)');
    expect(script).toContain('運用状態を読み込んでいます');
  });

  it('labels DUST amounts, UTXO diagnostics, metrics, and pipeline counts by their actual meaning', () => {
    expect(script).toContain("dataCell('DUST残高', dust(funds?.remainingDust))");
    expect(script).toContain("dataCell('直近Sponsored TX手数料', dust(funds?.latestFee?.dust))");
    expect(script).toContain("dataCell('使用可能DUST UTXO数'");
    expect(script).toContain("['推定残りSponsored TX', `≤ ${data.thresholds.lowDustTransactions}件`]");
    expect(script).not.toContain('Spendable DUST coins');
    expect(script).not.toContain("dataCell('Remaining DUST'");
    expect(html).toContain('サンプル数');
    expect(html).toContain('要対応Job（更新日）');
    expect(html).not.toContain('<th>センサー値</th>');
  });

  it('distinguishes wallet alert detection from Discord delivery during the grace period', () => {
    expect(script).toContain("'sponsor-wallet-low-dust'");
    expect(script).toContain('data.thresholds.walletNotificationGraceMinutes');
    expect(script).toContain('検知中（');
    expect(script).toContain('分継続後に通知');
    expect(script).toContain('通知済み');
  });

  it('defines bounded redacted audit, health, alert, and notification storage', () => {
    expect(migration).toContain('CREATE TABLE operational_events');
    expect(migration).toContain('CREATE TABLE system_health_snapshots');
    expect(migration).toContain('CREATE TABLE operations_alert_state');
    expect(migration).toContain('CREATE TABLE operations_notification_outbox');
    expect(migration).toContain('enqueue_sponsor_receipt');
    const auditColumns = migration.slice(
      migration.indexOf('CREATE TABLE operational_events'),
      migration.indexOf('CREATE INDEX operational_events_time'),
    );
    expect(auditColumns).not.toMatch(/\b(?:authorization|access_token|signature|raw_value)\s+TEXT\b/iu);
  });

  it('correlates each state-changing browser UC across Worker calls', () => {
    for (const operation of [
      'wallet-connect',
      'project-create',
      'policy-create',
      'device-register',
      'measurement-day',
      'proof-request',
      'proof-submit',
    ]) expect(deviceFlow).toContain(`clientOperationId('${operation}')`);
    expect(deviceFlow).toContain("'X-Client-Operation-Id': operationId");
    expect(midnightDevice).toContain("'X-Client-Operation-Id': input.clientOperationId");
  });
});
