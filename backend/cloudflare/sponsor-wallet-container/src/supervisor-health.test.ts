import assert from 'node:assert/strict';
import test from 'node:test';

import { SupervisorHealthState } from './supervisor-health.js';

test('starts responsive while requesting Wallet initialization', () => {
  const health = new SupervisorHealthState(30_000).snapshot(42, true, 1_000);

  assert.equal(health.phase, 'starting');
  assert.equal(health.initialization?.status, 'not-started');
  assert.equal(health.supervisor.status, 'degraded');
  assert.equal(health.supervisor.walletProcessAlive, true);
  assert.equal(health.supervisor.lastSuccessfulProbeAt, null);
});

test('keeps the last Wallet state while reporting its freshness separately', () => {
  const health = new SupervisorHealthState(30_000);
  health.recordSuccess({
    phase: 'syncing',
    progress: { dust: 'syncing (10/20)' },
    error: null,
  }, 1_000);

  const fresh = health.snapshot(42, true, 20_000);
  assert.equal(fresh.phase, 'syncing');
  assert.equal(fresh.supervisor.status, 'healthy');
  assert.equal(fresh.supervisor.walletStatusFresh, true);

  health.recordFailure(new Error('probe timed out'), 32_000);
  const stale = health.snapshot(42, true, 32_001);
  assert.equal(stale.phase, 'syncing');
  assert.equal(stale.supervisor.status, 'degraded');
  assert.equal(stale.supervisor.walletStatusFresh, false);
  assert.equal(stale.supervisor.consecutiveProbeFailures, 1);
  assert.equal(stale.supervisor.lastProbeError, 'probe timed out');
});

test('reports a probe failure immediately even while the cached state is fresh', () => {
  const health = new SupervisorHealthState(30_000);
  health.recordSuccess({ phase: 'syncing', progress: null, error: null }, 1_000);
  health.recordFailure(new Error('probe timed out'), 2_000);

  const snapshot = health.snapshot(42, true, 2_001);
  assert.equal(snapshot.supervisor.walletStatusFresh, true);
  assert.equal(snapshot.supervisor.status, 'degraded');
});

test('reports an exited Wallet process without losing the last status', () => {
  const health = new SupervisorHealthState();
  health.recordSuccess({ phase: 'ready', progress: null, error: null }, 1_000);

  const snapshot = health.snapshot(null, false, 1_100);
  assert.equal(snapshot.phase, 'ready');
  assert.equal(snapshot.supervisor.status, 'unavailable');
  assert.equal(snapshot.supervisor.walletProcessAlive, false);
});
