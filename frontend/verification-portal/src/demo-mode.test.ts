import { afterEach, describe, expect, it, vi } from 'vitest';
// The static browser module is deliberately independent of the wallet build.
// @ts-expect-error Static presentation module has no TypeScript declarations.
import { createDemoRuntime, demoPreferences, isLocalDemo, DEMO_STORAGE_PREFIX } from '../public/demo-mode.js';

function fixture() {
  const values = new Map<string, string>([['vsp-language', 'ja'], ['wallet-private-state', 'untouched']]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  const location = new URL('http://127.0.0.1:8790/?demo=1');
  const runtime = createDemoRuntime({ storage, location, delay: async () => undefined });
  return { runtime, storage, location, values };
}
async function registered() {
  const value = fixture();
  const actor = await value.runtime.flow.connectWallet();
  await value.runtime.flow.createDevice(actor.deviceId);
  await value.runtime.flow.registerDevice({ policyId: 'demo-policy-cold' });
  return value;
}
const date = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);
afterEach(() => vi.useRealTimers());

describe('explicit isolated local demonstration', () => {
  it('requires exact loopback and query opt-in, rejecting production and lookalike hosts', () => {
    for (const host of ['127.0.0.1', 'localhost', '[::1]']) expect(isLocalDemo(new URL(`http://${host}/?demo=1`))).toBe(true);
    for (const url of ['https://example.com/?demo=1', 'http://localhost.evil/?demo=1', 'http://127.0.0.1/', 'http://127.0.0.1/?demo=true', 'file:///tmp/index.html?demo=1']) expect(isLocalDemo(new URL(url))).toBe(false);
    expect(() => createDemoRuntime({ storage: {}, location: new URL('https://example.com/?demo=1') })).toThrow(/loopback/);
  });
  it('isolates data and preferences, and resets only demo state', async () => {
    const { runtime, storage, values } = fixture();
    const preferences = demoPreferences(storage);
    preferences.setItem('vsp-language', 'en');
    expect(preferences.getItem('vsp-language')).toBe('en');
    runtime.reset();
    expect(values.get('vsp-language')).toBe('ja');
    expect(values.get('wallet-private-state')).toBe('untouched');
    expect([...values.keys()].filter((key) => !['vsp-language', 'wallet-private-state'].includes(key)).every((key) => key.startsWith(DEMO_STORAGE_PREFIX))).toBe(true);
    expect(JSON.stringify(runtime.snapshot())).not.toMatch(/privateKey|mnemonic|seedPhrase/);
  });
  it('rejects unknown and external API paths without invoking fetch', async () => {
    const { runtime } = fixture();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
    await expect(runtime.api('/api/v1/real-wallet')).rejects.toThrow(/No network request/);
    await expect(runtime.api('https://example.com/api')).rejects.toThrow(/external/);
    expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore();
  });
  it('rejects invalid Policy bounds and preserves the Project quota', async () => {
    const { runtime } = fixture();
    await expect(runtime.flow.createPolicy({ name: 'invalid', mode: 'closed-range', minimum: 8, maximum: 2 })).rejects.toThrow(/Minimum/);
    for (let i = 0; i < 9; i++) await runtime.flow.createProject({ name: `Project ${i}`, timeZoneOffsetMinutes: 0, localDayStartHour: 0 });
    await expect(runtime.flow.createProject({ name: 'Overflow', timeZoneOffsetMinutes: 0, localDayStartHour: 0 })).rejects.toThrow(/maximum 10/);
  });
  it.each([
    ['upper-bound', null, 8],
    ['lower-bound', 2, null],
  ])('supports immutable %s Policies and in-range synthetic readings', async (mode, minimum, maximum) => {
    const { runtime } = fixture();
    const actor = await runtime.flow.connectWallet();
    const policy = await runtime.flow.createPolicy({ name: 'One bound', mode, minimum, maximum });
    await runtime.flow.createDevice(actor.deviceId);
    await runtime.flow.registerDevice({ policyId: policy.policyId });
    const capture = await runtime.flow.generateDailyMeasurements({ periodDate: date(2), mode: 'within-threshold' });
    expect(capture.outlierCount).toBe(0);
    expect(capture.records.every((record: { value: number }) => mode === 'upper-bound' ? record.value <= 8 : record.value >= 2)).toBe(true);
    const firstHour = capture.records.slice(0, 60).map((record: { value: number }) => record.value);
    expect(Math.min(...firstHour)).toBe(capture.windows[0].minimum);
    expect(Math.max(...firstHour)).toBe(capture.windows[0].maximum);
  });
  it('keeps Device registration and proof data isolated when switching Projects', async () => {
    const { runtime } = await registered();
    await runtime.flow.generateDailyMeasurements({ periodDate: date(2), mode: 'within-threshold' });
    const job = await runtime.flow.requestProof({ periodDate: date(2) });
    await runtime.flow.createProject({ name: 'Other', timeZoneOffsetMinutes: 0, localDayStartHour: 0 });
    expect(await runtime.flow.restoreDevice()).toBeNull();
    expect((await runtime.flow.loadDeviceHistory()).localCaptures).toHaveLength(0);
    await expect(runtime.flow.refreshProofJob(job.proofJobId)).rejects.toThrow(/selected Project/);
    await expect(runtime.flow.requestProof({ periodDate: date(2) })).rejects.toThrow(/register the Device/);
    await runtime.flow.selectProject('demo-cold-chain');
    expect((await runtime.flow.loadDeviceHistory()).localCaptures).toHaveLength(1);
  });
  it('keeps registered Policy assignments immutable', async () => {
    const { runtime } = await registered();
    await expect(runtime.flow.registerDevice({ policyId: 'demo-policy-cold' })).rejects.toThrow(/immutable/);
  });
  it.each([
    ['within-threshold', 24, 0, 'within-threshold'],
    ['with-outliers', 24, 180, 'outside-threshold'],
    ['missing-hours', 18, 0, 'within-threshold'],
    ['no-data', 0, 0, 'stopped'],
  ])('runs %s through request, progress, confirmation and redacted public output', async (mode, observed, outliers, result) => {
    const { runtime } = await registered();
    const capture = await runtime.flow.generateDailyMeasurements({ periodDate: date(2), mode });
    expect(capture.windows).toHaveLength(observed as number);
    expect(capture.outlierCount).toBe(outliers);
    const job = await runtime.flow.requestProof({ periodDate: date(2) });
    const stages: string[] = [];
    const tx = await runtime.flow.proveAndSubmit((stage: string) => stages.push(stage), date(2));
    expect(stages).toContain('generating-proof'); expect(stages.at(-1)).toBe('confirmed');
    expect(tx.transactionId).toMatch(/^DEMO-/);
    const record = await runtime.api(`/api/v1/public/proofs/${job.proofJobId}`);
    expect(record.simulated).toBe(true); expect(record.thresholdResult).toBe(result);
    expect(record.hourResults).toHaveLength(24);
    expect(record).not.toHaveProperty('records'); expect(record).not.toHaveProperty('windows');
    expect(JSON.stringify(record)).not.toMatch(/"average"|"nonce"|"witness"|"privateKey"/);
    expect((await runtime.verifyPublicAttestation(record)).simulated).toBe(true);
    await expect(runtime.verifyPublicAttestation({ ...record, sampleCount: record.sampleCount + 1 })).rejects.toThrow(/mismatch/);
  });
  it('does not clear an existing anomaly when a new day has no measurements', async () => {
    const { runtime } = await registered();
    await runtime.flow.generateDailyMeasurements({ periodDate: date(3), mode: 'with-outliers' });
    await runtime.flow.generateDailyMeasurements({ periodDate: date(2), mode: 'no-data' });
    expect((await runtime.flow.loadAdministratorDashboard()).anomalyState.state).toBe('anomaly_open');
  });
  it('restores queued work from demo storage and does not duplicate a submitted day', async () => {
    const { runtime, storage, location } = await registered();
    await runtime.flow.generateDailyMeasurements({ periodDate: date(2), mode: 'within-threshold' });
    const first = await runtime.flow.requestProof({ periodDate: date(2) });
    runtime.flow.queueDeferredSubmission(date(2));
    const restored = createDemoRuntime({ storage, location, delay: async () => undefined });
    expect((await restored.flow.loadDeferredWorkflow()).job.proofJobId).toBe(first.proofJobId);
    expect((await restored.flow.requestProof({ periodDate: date(2) })).proofJobId).toBe(first.proofJobId);
    await expect(restored.flow.generateDailyMeasurements({ periodDate: date(2), mode: 'with-outliers' })).rejects.toThrow(/already has a Proof Job/);
  });
  it('uses the Project operational day and rejects normalized invalid calendar dates', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-11T17:00:00Z'));
    const { runtime } = await registered();
    // JST has reached September 12, so September 11 is already complete.
    expect((await runtime.flow.generateDailyMeasurements({ periodDate: '2026-09-11', mode: 'within-threshold' })).periodDate).toBe('2026-09-11');
    await expect(runtime.flow.generateDailyMeasurements({ periodDate: '2026-09-12', mode: 'within-threshold' })).rejects.toThrow(/completed/);
    await expect(runtime.flow.generateDailyMeasurements({ periodDate: '2026-09-31', mode: 'within-threshold' })).rejects.toThrow(/completed/);
  });
  it('simulates managed source failure and retry while never storing credentials or sharing Device capture state', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-11T08:00:00Z'));
    const { runtime } = fixture();
    await runtime.api('/api/v1/managed-sources', { method: 'POST', body: JSON.stringify({ sourceId: 'customer-api', name: 'Customer API', projectId: 'demo-cold-chain', policyId: 'demo-policy-cold', firstPeriodDate: '2026-09-09', sourceSensorId: 'fail-once', endpointUrl: 'https://private.invalid', bearerToken: 'NEVER-PERSIST-THIS' }) });
    expect(JSON.stringify(runtime.snapshot())).not.toMatch(/NEVER-PERSIST-THIS|private.invalid|bearerToken/);
    expect((await runtime.flow.loadDeviceHistory()).localCaptures).toHaveLength(0);
    expect((await runtime.flow.loadDeviceHistory()).proofJobs).toHaveLength(0);
    vi.advanceTimersByTime(1_500);
    const run = (await runtime.api('/api/v1/managed-sources/customer-api/runs')).runs[0];
    expect(run.status).toBe('action_required');
    await runtime.api(`/api/v1/managed-sources/customer-api/runs/${run.runId}/retry`, { method: 'POST' });
    vi.advanceTimersByTime(4_000);
    const complete = await runtime.api(`/api/v1/managed-sources/customer-api/runs/${run.runId}`);
    expect(complete.run.status).toBe('confirmed'); expect(complete.run.proofJobId).toBe(run.proofJobId);
    expect(runtime.snapshot().jobs).toHaveLength(1);
    const failure = await runtime.api('/api/v1/system-operations/events?outcome=failure');
    expect(failure.events).toHaveLength(1);
    expect((await runtime.api('/api/v1/system-operations/overview')).overall.openAlerts).toBe(0);
    await expect(runtime.loadPublicAttestationByTransactionHash('0'.repeat(64))).rejects.toThrow(/unknown transaction/);
  });
});
