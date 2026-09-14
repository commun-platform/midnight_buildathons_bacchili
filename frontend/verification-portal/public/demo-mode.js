/** Local presentation fixtures. Never imported into the wallet/proof runtime. */
export const DEMO_STORAGE_PREFIX = 'bacchiri-local-demo-v1:';
export function isLocalDemo(location) {
  return Boolean(location && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname)
    && ['http:', 'https:'].includes(location.protocol)
    && new URLSearchParams(location.search).get('demo') === '1');
}
export function demoPreferences(storage) {
  return {
    getItem: (key) => storage.getItem(`${DEMO_STORAGE_PREFIX}preference:${key}`),
    setItem: (key, value) => storage.setItem(`${DEMO_STORAGE_PREFIX}preference:${key}`, value),
  };
}
const clone = (value) => JSON.parse(JSON.stringify(value));
const now = () => new Date().toISOString();
const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const checks = () => ({ dailyAttestationRecorded: true, committedHourlyExtrema: true, attestationVerified: true, midnightConfirmed: true });

export function createDemoRuntime({ storage, location, delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  if (!isLocalDemo(location)) throw new Error('Demo mode requires an explicit loopback URL with ?demo=1.');
  const key = `${DEMO_STORAGE_PREFIX}state`;
  const initial = () => ({ version: 1, sequence: 0, selectedProjectId: 'demo-cold-chain', projects: [{ projectId: 'demo-cold-chain', name: 'Cold chain / コールドチェーン DEMO', timeZoneOffsetMinutes: 540, localDayStartHour: 0 }], policies: [{ projectId: 'demo-cold-chain', policyId: 'demo-policy-cold', name: 'Cold storage / 冷蔵 2–8 °C', mode: 'closed-range', minimum: 2, maximum: 8, unit: '°C', sensorType: 'temperature', version: 1, valueScale: 100, registeredTxId: 'DEMO-POLICY-ONLY', policyKey: 'demo-policy-key' }], devices: {}, captures: {}, jobs: [], sources: [], runs: [], events: [] });
  let state;
  try { state = JSON.parse(storage.getItem(key) || 'null'); } catch { /* Discard corrupt demo data only. */ }
  if (state?.version !== 1) state = initial();
  const save = () => storage.setItem(key, JSON.stringify(state));
  const id = (type) => `demo-${type}-${++state.sequence}`;
  const project = () => state.projects.find((item) => item.projectId === state.selectedProjectId);
  const deviceId = () => `demo-device-${state.selectedProjectId}`;
  const policies = () => state.policies.filter((item) => item.projectId === state.selectedProjectId);
  const device = () => state.devices[state.selectedProjectId];
  const configuration = () => ({ network: 'LOCAL DEMO', contractAddress: 'SIMULATED-CONTRACT-NO-LEDGER', projectId: state.selectedProjectId, operationalDay: { timeZoneOffsetMinutes: project().timeZoneOffsetMinutes, localDayStartHour: project().localDayStartHour }, policies: clone(policies()), processingSchedule: { mode: 'always-on', processingEligibleNow: true } });
  const event = (action, outcome = 'success', resourceId = '') => {
    state.events.unshift({ event_id: id('event'), occurred_at: now(), category: 'workflow', severity: outcome === 'failure' ? 'error' : 'info', actor_type: 'demo', actor_identifier: 'LOCAL SIMULATION', action, outcome, resource_id: resourceId, project_id: state.selectedProjectId, response_status: null, duration_ms: 0 });
    save();
  };
  const captureFor = (date, projectId = state.selectedProjectId) => state.captures[`${projectId}:${date}`];
  function generateCapture(periodDate, mode, policy, owner = state.selectedProjectId, captureScope = owner) {
    const ownerProject = state.projects.find((item) => item.projectId === owner);
    const parsedDate = Date.parse(`${periodDate}T00:00:00Z`);
    const operationalNow = Date.now() + ownerProject.timeZoneOffsetMinutes * 60_000 - ownerProject.localDayStartHour * 3_600_000;
    const currentDate = new Date(operationalNow).toISOString().slice(0, 10);
    const oldestDate = new Date(operationalNow - 30 * 86_400_000).toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(periodDate) || !Number.isFinite(parsedDate) || new Date(parsedDate).toISOString().slice(0, 10) !== periodDate || periodDate >= currentDate || periodDate < oldestDate) throw new Error('DEMO: choose a completed operational date in the previous 30 days.');
    if (!['within-threshold', 'with-outliers', 'missing-hours', 'no-data'].includes(mode)) throw new Error('DEMO: unknown generation mode.');
    const start = Date.parse(`${periodDate}T00:00:00Z`) + ownerProject.localDayStartHour * 3_600_000 - ownerProject.timeZoneOffsetMinutes * 60_000;
    const center = policy.mode === 'upper-bound' ? policy.maximum - 3 : policy.mode === 'lower-bound' ? policy.minimum + 3 : (policy.minimum + policy.maximum) / 2;
    const radius = policy.mode === 'closed-range' ? Math.min(0.4, (policy.maximum - policy.minimum) / 8) : 0.4;
    const hourResults = Array.from({ length: 24 }, (_, hour) => mode === 'no-data' || (mode === 'missing-hours' && hour >= 18) ? 'no-data' : mode === 'with-outliers' && [9, 10, 14].includes(hour) ? 'outside-threshold' : 'within-threshold');
    const windows = hourResults.flatMap((result, hour) => {
      if (result === 'no-data') return [];
      const outside = result === 'outside-threshold';
      const average = Number((outside ? policy.mode === 'lower-bound' ? policy.minimum - 2 : policy.maximum + 2 : center + Math.sin(hour / 3) * radius).toFixed(2));
      return [{ periodStart: new Date(start + hour * 3_600_000).toISOString(), periodEnd: new Date(start + (hour + 1) * 3_600_000).toISOString(), count: 60, minimum: Number((average - radius).toFixed(2)), maximum: Number((average + radius).toFixed(2)), average, unit: '°C', commitment: `DEMO-HOURLY-${periodDate}-${hour}`, thresholdPolicyVersion: policy.policyId, hourIndex: hour, thresholdResult: result }];
    });
    const observedHourCount = windows.length;
    const outlierCount = hourResults.filter((result) => result === 'outside-threshold').length * 60;
    const capture = { simulated: true, periodDate, mode, completeDay: true, outlierCount, thresholdSatisfied: outlierCount === 0, windows, records: windows.flatMap((window) => Array.from({ length: 60 }, (_, index) => ({ timestamp: new Date(Date.parse(window.periodStart) + index * 60_000).toISOString(), value: [window.minimum, window.average, window.maximum, window.average][index % 4] }))), attestation: { publicData: { attestationCommitment: `DEMO-ATTESTATION-${owner}-${periodDate}`, observedHourCount, stoppedHourCount: 24 - observedHourCount, hourResults } } };
    state.captures[`${captureScope}:${periodDate}`] = capture;
    return capture;
  }
  function makeJob(capture, policy, owner = state.selectedProjectId, sourceId) {
    const existing = state.jobs.find((job) => job.projectId === owner && job.periodDate === capture.periodDate && job.sourceId === sourceId);
    if (existing) return existing;
    const job = { ...(sourceId ? { sourceId } : {}), simulated: true, proofJobId: id('proof'), projectId: owner, periodDate: capture.periodDate, status: 'ready_for_input', sampleCount: capture.records.length, observedHourCount: capture.windows.length, stoppedHourCount: 24 - capture.windows.length, thresholdSatisfied: capture.thresholdSatisfied, thresholdPolicyVersion: policy.policyId, attestationCommitment: capture.attestation.publicData.attestationCommitment, hourResults: capture.attestation.publicData.hourResults, createdAt: now() };
    state.jobs.unshift(job);
    return job;
  }
  function confirm(job) {
    Object.assign(job, { status: 'confirmed', proofGeneratedAt: now(), attestTxId: `DEMO-TX-${job.proofJobId}`, transactionHash: `de${String(++state.sequence).padStart(62, '0')}` });
    event('simulated_attestation_confirmed', 'success', job.proofJobId);
  }
  function publicProof(job) {
    const policy = state.policies.find((item) => item.policyId === job.thresholdPolicyVersion);
    const owner = state.projects.find((item) => item.projectId === job.projectId);
    const confirmed = job.status === 'confirmed';
    return { simulated: true, proofJobId: job.proofJobId, status: job.status, periodDate: job.periodDate, sampleCount: job.sampleCount, observedHourCount: job.observedHourCount, stoppedHourCount: job.stoppedHourCount, thresholdResult: job.observedHourCount === 0 ? 'stopped' : job.thresholdSatisfied ? 'within-threshold' : 'outside-threshold', thresholdPolicyVersion: job.thresholdPolicyVersion, hourResults: [...job.hourResults], hourlyResultsAvailable: true, schemaVersion: 7, circuitVersion: 5, policy: clone(policy), operationalDay: { timeZoneOffsetMinutes: owner.timeZoneOffsetMinutes, localDayStartHour: owner.localDayStartHour }, attestationCommitment: job.attestationCommitment, deviceCommitment: `DEMO-DEVICE-COMMITMENT-${job.projectId}`, assignmentKey: 'DEMO-ASSIGNMENT', network: 'LOCAL SIMULATION — NO BLOCKCHAIN', contractAddress: 'SIMULATED-CONTRACT-NO-LEDGER', proofGeneratedAt: job.proofGeneratedAt || null, claim: `SIMULATED RESULT · ${job.observedHourCount === 0 ? 'NO DATA' : job.thresholdSatisfied ? 'WITHIN THRESHOLD' : 'OUTSIDE THRESHOLD'}. No real ZK proof or transaction was created.`, claimJa: `デモ判定 · ${job.observedHourCount === 0 ? 'データなし' : job.thresholdSatisfied ? 'しきい値内' : 'しきい値逸脱'}。実際のZK証明・取引は生成していません。`, resultVerified: false, checks: Object.fromEntries(Object.keys(checks()).map((key) => [key, confirmed])), transactions: { attest: confirmed ? { txId: job.attestTxId, txHash: job.transactionHash, blockHeight: 'SIMULATED' } : null } };
  }
  const flow = {
    loadConfiguration: async () => configuration(),
    connectWallet: async () => ({ walletName: 'Wallet / 撮影用アカウント', networkId: 'LOCAL SIMULATION', shieldedAddress: 'DEMO-ACCOUNT', walletKeySha256: 'DEMO-ONLY', projects: clone(state.projects), maximumProjects: 10, selectedProjectId: state.selectedProjectId, deviceId: deviceId(), configuration: configuration() }),
    selectProject: async (projectId) => {
      if (!state.projects.some((item) => item.projectId === projectId)) throw new Error('Unknown demo Project.');
      state.selectedProjectId = projectId; save(); return { deviceId: deviceId(), configuration: configuration() };
    },
    createProject: async ({ name, timeZoneOffsetMinutes, localDayStartHour }) => {
      if (!name.trim() || name.trim().length > 80 || state.projects.length >= 10) throw new Error('DEMO: Project name is required; maximum 10 Projects.');
      if (!Number.isInteger(timeZoneOffsetMinutes) || timeZoneOffsetMinutes < -840 || timeZoneOffsetMinutes > 840 || !Number.isInteger(localDayStartHour) || localDayStartHour < 0 || localDayStartHour > 23) throw new Error('DEMO: invalid operational day.');
      const value = { projectId: id('project'), name: name.trim(), timeZoneOffsetMinutes, localDayStartHour };
      state.projects.push(value); state.selectedProjectId = value.projectId; event('simulated_project_created');
      return { project: clone(value), configuration: configuration(), deviceId: deviceId(), maximumProjects: 10 };
    },
    createPolicy: async ({ name, mode, minimum, maximum }) => {
      if (!name.trim() || policies().length >= 10) throw new Error('DEMO: name is required; maximum 10 Policies.');
      if (!['closed-range', 'upper-bound', 'lower-bound'].includes(mode) || (mode !== 'upper-bound' && !Number.isFinite(minimum)) || (mode !== 'lower-bound' && !Number.isFinite(maximum)) || (mode === 'closed-range' && minimum > maximum)) throw new Error('DEMO: invalid threshold bounds. Minimum must not exceed maximum.');
      await delay(350);
      const value = { projectId: state.selectedProjectId, policyId: id('policy'), name: name.trim(), mode, minimum: mode === 'upper-bound' ? null : minimum, maximum: mode === 'lower-bound' ? null : maximum, unit: '°C', sensorType: 'temperature', version: 1, valueScale: 100, registeredTxId: 'DEMO-POLICY-TX', policyKey: id('policy-key') };
      state.policies.push(value); event('simulated_policy_registered');
      return { ...clone(value), operationId: id('policy-operation'), status: 'registered', stage: 'completed', policyTxId: value.registeredTxId };
    },
    loadProjectPolicies: async () => ({ policies: clone(policies()), operations: [], maximumPolicies: 10 }),
    refreshProjectConfiguration: async () => configuration(),
    createDevice: async (requestedId) => {
      if (requestedId !== deviceId()) throw new Error('DEMO: Device belongs to another Project.');
      state.devices[state.selectedProjectId] ||= { device: { deviceId: deviceId(), deviceAuthority: 'DEMO-AUTHORITY-NO-PRIVATE-KEY' }, provisioned: null };
      event('simulated_device_identity_created'); return clone(device().device);
    },
    restoreDevice: async () => device() ? clone(device()) : null,
    registerDevice: async ({ policyId }, progress) => {
      if (!device() || !policies().some((item) => item.policyId === policyId)) throw new Error('DEMO: create a Device and select a Policy first.');
      if (device().provisioned) throw new Error('DEMO: Policy assignment is immutable.');
      const operationId = id('registration');
      for (const stage of ['queued', 'device_zkp_generating', 'device_confirmed', 'assignment_zkp_generating', 'completed']) {
        progress?.({ operationId, stage, status: stage === 'completed' ? 'completed' : 'running', deviceTxId: 'DEMO-DEVICE-TX', assignmentTxId: 'DEMO-ASSIGNMENT-TX' });
        await delay(350);
      }
      device().provisioned = { deviceId: deviceId(), policyId, registeredTxId: 'DEMO-DEVICE-TX', assignmentTxId: 'DEMO-ASSIGNMENT-TX' };
      event('simulated_device_registered'); return clone(device().provisioned);
    },
    resumePendingDeviceRegistration: async () => null,
    loadDeferredWorkflow: async () => {
      const job = state.jobs.find((item) => item.projectId === state.selectedProjectId && !item.sourceId && item.queued && item.status !== 'confirmed');
      return job ? { capture: clone(captureFor(job.periodDate)), job: clone(job), workflow: { submissionRequested: true } } : null;
    },
    generateDailyMeasurements: async ({ periodDate, mode }) => {
      if (!device()?.provisioned) throw new Error('DEMO: register the Device first.');
      if (state.jobs.some((job) => job.projectId === state.selectedProjectId && job.periodDate === periodDate && !job.sourceId)) throw new Error('DEMO: this day already has a Proof Job. Select another completed day.');
      const value = generateCapture(periodDate, mode, policies().find((item) => item.policyId === device().provisioned.policyId));
      event(value.windows.length === 0 ? 'simulated_no_data_day' : value.outlierCount ? 'simulated_anomaly_open' : 'simulated_measurements_received'); return clone(value);
    },
    selectDailyCapture: async (periodDate) => clone(captureFor(periodDate)),
    loadDeviceHistory: async () => ({ localCaptures: clone(Object.entries(state.captures).filter(([key]) => key.startsWith(`${state.selectedProjectId}:`)).map(([, capture]) => capture)), windows: clone(Object.entries(state.captures).filter(([key]) => key.startsWith(`${state.selectedProjectId}:`)).flatMap(([, capture]) => capture.windows)), proofJobs: clone(state.jobs.filter((job) => job.projectId === state.selectedProjectId && !job.sourceId)) }),
    loadSponsorQuota: async () => ({ dailyLimit: 100, remaining: 100 - state.jobs.length, used: state.jobs.length, reservedProofJobIds: state.jobs.map((job) => job.proofJobId), resetAt: new Date(Date.now() + 86_400_000).toISOString() }),
    requestProof: async ({ periodDate, onAcceptanceProgress }) => {
      if (!device()?.provisioned) throw new Error('DEMO: register the Device first.');
      const capture = captureFor(periodDate); if (!capture) throw new Error('DEMO: generate a sensor day first.');
      onAcceptanceProgress?.({ stage: 'uploading', completed: 24, total: 24 }); await delay(200);
      onAcceptanceProgress?.({ stage: 'registering' });
      const job = makeJob(capture, policies().find((item) => item.policyId === device().provisioned.policyId)); event('simulated_proof_requested'); return clone(job);
    },
    queueDeferredSubmission: (periodDate) => { const job = state.jobs.find((item) => item.projectId === state.selectedProjectId && item.periodDate === periodDate && !item.sourceId); if (job) job.queued = true; save(); },
    refreshProofJob: async (proofJobId) => {
      const job = state.jobs.find((item) => item.proofJobId === proofJobId && item.projectId === state.selectedProjectId && !item.sourceId);
      if (!job) throw new Error('DEMO: Proof Job is not in the selected Project.');
      return clone(job);
    },
    proveAndSubmit: async (progress, periodDate) => {
      const job = state.jobs.find((item) => item.projectId === state.selectedProjectId && item.periodDate === periodDate && !item.sourceId);
      if (!job) throw new Error('DEMO: request a Proof Job first.');
      if (job.status !== 'confirmed') {
        for (const stage of ['checking-proof-input', 'generating-proof', 'sponsor-queued', 'sponsor-preparing', 'transaction-submitted', 'confirmed']) {
          job.status = stage === 'transaction-submitted' ? 'submitted' : 'proving'; save(); progress?.(stage); await delay(500);
        }
        confirm(job);
      }
      return { transactionId: job.attestTxId, transactionHash: job.transactionHash, simulated: true };
    },
    loadAdministratorDashboard: async () => {
      const history = await flow.loadDeviceHistory();
      const latest = history.localCaptures.filter((capture) => capture.windows.length > 0).at(-1);
      const registered = Boolean(device()?.provisioned);
      return { ...history, source: 'LOCAL DEMO / SYNTHETIC DATA', project: clone(project()), policies: clone(policies()), anomalyState: { state: latest?.outlierCount ? 'anomaly_open' : 'normal', changedAt: now() }, anomalies: history.localCaptures.filter((item) => item.outlierCount).map((item) => ({ occurredAt: item.windows.find((hour) => hour.thresholdResult === 'outside-threshold')?.periodStart, transition: 'anomaly_open', thresholdPolicyVersion: device().provisioned.policyId })), devices: registered ? [{ id: deviceId(), name: 'Browser demo sensor / 合成データ', sensorType: 'temperature', unit: '°C', thresholdPolicyVersion: device().provisioned.policyId, midnightRegistryStatus: 'registered', midnightRegistrationVersion: 1, midnightDeviceCommitment: 'DEMO-DEVICE-COMMITMENT', lastSeenAt: now() }] : [], stepper: { deviceRegistered: registered, hourlyDataReceived: history.windows.length > 0, anomalyStateAvailable: registered, proofRequested: history.proofJobs.length > 0, proofGenerated: history.proofJobs.some((job) => job.proofGeneratedAt), midnightConfirmed: history.proofJobs.some((job) => job.status === 'confirmed') } };
    },
  };
  function updateRuns() {
    for (const run of state.runs) {
      if (['confirmed', 'action_required'].includes(run.status)) continue;
      const elapsed = Date.now() - run.startedAt;
      const source = state.sources.find((item) => item.sourceId === run.sourceId);
      if (source.sourceSensorId === 'fail-once' && !run.retried && elapsed > 1_000) {
        Object.assign(run, { status: 'action_required', stage: 'source_action_required', errorSummary: 'SIMULATED source timeout. Retry this Run to continue.' });
        event('simulated_source_timeout', 'failure', run.runId); continue;
      }
      const status = elapsed < 900 ? 'fetching' : elapsed < 2_000 ? 'proof_queued' : elapsed < 3_500 ? 'proving' : 'confirmed';
      Object.assign(run, { status, stage: status, errorSummary: null });
      if (status === 'confirmed') {
        const job = state.jobs.find((item) => item.proofJobId === run.proofJobId);
        if (job.status !== 'confirmed') confirm(job);
        run.verificationUrl = `/?demo=1#/verify/${job.proofJobId}`;
      }
    }
    save();
  }
  function createRun(source, periodDate) {
    const existing = state.runs.find((item) => item.sourceId === source.sourceId && item.periodDate === periodDate);
    if (existing) return existing;
    const policy = state.policies.find((item) => item.policyId === source.policyId);
    const mode = source.sourceSensorId === 'outside' ? 'with-outliers' : source.sourceSensorId === 'no-data' ? 'no-data' : source.sourceSensorId === 'missing-hours' ? 'missing-hours' : 'within-threshold';
    const capture = generateCapture(periodDate, mode, policy, source.projectId, `managed:${source.sourceId}`);
    const job = makeJob(capture, policy, source.projectId, source.sourceId);
    job.status = 'proving';
    const run = { runId: id('run'), sourceId: source.sourceId, periodDate, projectId: source.projectId, proofJobId: job.proofJobId, sampleCount: capture.records.length, observedHourCount: capture.windows.length, status: 'fetching', stage: 'fetching', startedAt: Date.now(), createdAt: now(), hours: Array.from({ length: 24 }, (_, hourIndex) => { const window = capture.windows.find((item) => item.hourIndex === hourIndex); return { hourIndex, sampleCount: window?.count || 0, minimum: window?.minimum ?? null, maximum: window?.maximum ?? null, average: window?.average ?? null, thresholdResult: capture.attestation.publicData.hourResults[hourIndex] }; }) };
    state.runs.unshift(run); event('simulated_managed_run_started', 'success', run.runId); return run;
  }
  function overview() {
    const failed = state.runs.filter((item) => item.status === 'action_required');
    const confirmed = state.jobs.filter((job) => job.status === 'confirmed').length;
    return { simulated: true, generatedAt: now(), operator: { displayName: 'DEMO OPERATOR / 実システム接続なし' }, overall: { healthClass: failed.length ? 'degraded' : 'healthy', openAlerts: failed.length, failures24h: failed.length }, components: { sponsorWallet: { source: 'demo', live: true, healthClass: 'healthy', lastObservedAt: now(), funds: { remainingDust: 'DEMO 100', estimatedTransactionsRemaining: 100, latestFee: { dust: 'DEMO 1', recordedAt: now() } }, operatingWindow: { mode: 'always-on' }, state: { phase: 'ready', balances: { spendableDustCoins: 10, pendingDustCoins: 0, totalDustCoins: 10 }, supervisor: { status: 'SIMULATED', walletProcessAlive: false, statusAgeMs: 0 }, synchronization: [{ channel: 'demo', applied: 100, highest: 100, lag: 0, connected: false, complete: true }] } }, proofServer: { healthClass: 'healthy' } }, processing: { jobStates: { confirmed, proving: state.runs.filter((item) => item.status === 'proving').length }, proofBacklog: state.jobs.length - confirmed, proofOldestAt: null, sponsorBacklog: 0, sponsorOldestAt: null, sponsorJobs: [], terminalFailures: failed.length, openDeadLetters: 0, registrationOperations: {}, policyOperations: {} }, inventory: { projects: state.projects.length, devices: Object.keys(state.devices).length, registeredPolicies: state.policies.length }, checkpoint: { present: false }, alerts: failed.map((run) => ({ status: 'open', severity: 'warning', alert_key: 'DEMO-source-timeout', summary: run.errorSummary, first_observed_at: now(), last_observed_at: now(), occurrence_count: 1 })), thresholds: { lowDustTransactions: 10, syncLagBlocks: 100, walletNotificationGraceMinutes: 10, proofBacklog: 10, proofBacklogAgeMinutes: 15, sponsorBacklog: 5, sponsorBacklogAgeMinutes: 15, proofRateLimitEvents: 5, reminderMinutes: 60 }, notifications: { discordConfigured: false, outbox: {} } };
  }
  async function api(path, options = {}) {
    const url = new URL(path, location.origin || 'http://127.0.0.1');
    if (url.origin !== (location.origin || 'http://127.0.0.1')) throw new Error('DEMO: external requests are disabled.');
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : {};
    const parts = url.pathname.split('/').filter(Boolean);
    updateRuns();
    if (url.pathname === '/health') return { ok: true, simulated: true };
    if (url.pathname === '/api/v1/public/proofs') return { proofs: state.jobs.map(publicProof) };
    if (url.pathname.startsWith('/api/v1/public/proofs/')) {
      const job = state.jobs.find((item) => item.proofJobId === decodeURIComponent(parts[4]));
      if (!job) throw new Error('DEMO: record not found.'); return publicProof(job);
    }
    if (url.pathname === '/api/v1/managed-sources/bootstrap') return { csrfToken: 'DEMO-NON-AUTH-TOKEN', projects: clone(state.projects), policies: clone(state.policies) };
    if (url.pathname === '/api/v1/managed-sources') {
      if (method === 'POST') {
        if (!body.sourceId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u.test(body.sourceId) || state.sources.some((item) => item.sourceId === body.sourceId)) throw new Error('DEMO: use a unique Source ID.');
        if (!state.policies.some((policy) => policy.policyId === body.policyId && policy.projectId === body.projectId)) throw new Error('DEMO: Policy must belong to the selected Project.');
        const source = { sourceId: body.sourceId, name: body.name, projectId: body.projectId, policyId: body.policyId, sourceSensorId: body.sourceSensorId, status: 'active', stage: 'simulated_registration_complete' };
        // Endpoint and credential inputs are deliberately neither stored nor used.
        createRun(source, body.firstPeriodDate);
        state.sources.push(source); event('simulated_managed_source_created'); return { source: clone(source) };
      }
      return { sources: clone(state.sources) };
    }
    if (parts[2] === 'managed-sources' && parts[4] === 'runs') {
      const source = state.sources.find((item) => item.sourceId === decodeURIComponent(parts[3]));
      if (!source) throw new Error('DEMO: source not found.');
      if (!parts[5]) return method === 'POST' ? { run: clone(createRun(source, body.periodDate)) } : { runs: clone(state.runs.filter((item) => item.sourceId === source.sourceId)) };
      const run = state.runs.find((item) => item.runId === parts[5] && item.sourceId === source.sourceId);
      if (!run) throw new Error('DEMO: Run not found.');
      if (parts[6] === 'retry') {
        if (run.status !== 'action_required') throw new Error('DEMO: only failed Runs can be retried.');
        Object.assign(run, { retried: true, startedAt: Date.now(), status: 'fetching', stage: 'fetching', errorSummary: null }); event('simulated_run_retried');
      }
      const job = state.jobs.find((item) => item.proofJobId === run.proofJobId);
      return { run: clone(run), hours: clone(run.hours), proof: { proofGeneratedAt: job.proofGeneratedAt, transactionHash: job.transactionHash } };
    }
    if (url.pathname === '/api/v1/system-operations/overview') return overview();
    if (url.pathname === '/api/v1/system-operations/metrics') {
      const count = Math.max(1, Math.min(90, Number(url.searchParams.get('days')) || 7));
      return { simulated: true, series: Array.from({ length: count }, (_, index) => ({ day: daysAgo(count - index - 1), devicesRegistered: index === count - 1 ? Object.keys(state.devices).length : 0, proofJobsAccepted: index === count - 1 ? state.jobs.length : 0, proofsGenerated: index === count - 1 ? state.jobs.filter((job) => job.status === 'confirmed').length : 0, sponsoredTransactions: index === count - 1 ? state.jobs.filter((job) => job.status === 'confirmed').length : 0, terminalFailures: index === count - 1 ? state.runs.filter((run) => run.status === 'action_required').length : 0, measurementWindows: index === count - 1 ? Object.values(state.captures).reduce((sum, capture) => sum + capture.windows.length, 0) : 0, measurementSamples: index === count - 1 ? Object.values(state.captures).reduce((sum, capture) => sum + capture.records.length, 0) : 0 })) };
    }
    if (url.pathname === '/api/v1/system-operations/events') {
      const matches = state.events.filter((item) => (!url.searchParams.get('q') || JSON.stringify(item).toLowerCase().includes(url.searchParams.get('q').toLowerCase())) && (!url.searchParams.get('category') || item.category === url.searchParams.get('category')) && (!url.searchParams.get('outcome') || item.outcome === url.searchParams.get('outcome')));
      const start = Number(url.searchParams.get('cursor')) || 0;
      return { events: clone(matches.slice(start, start + 10)), nextCursor: start + 10 < matches.length ? String(start + 10) : null };
    }
    throw new Error(`DEMO: unsupported route ${method} ${url.pathname}. No network request was sent.`);
  }
  save();
  return { flow, api, reset: () => { state = initial(); save(); }, snapshot: () => clone(state), verifyPublicAttestation: async (data) => {
    await delay(700);
    const job = state.jobs.find((item) => item.proofJobId === data.proofJobId);
    if (!job || job.status !== 'confirmed' || JSON.stringify(publicProof(job)) !== JSON.stringify(data)) throw new Error('DEMO: fixture mismatch; simulated verification failed.');
    return { simulated: true, checks: checks() };
  }, loadPublicAttestationByTransactionHash: async (hash) => {
    await delay(500);
    const job = state.jobs.find((item) => item.transactionHash === hash.replace(/^0x/iu, '').toLowerCase());
    if (!job) throw new Error('DEMO: unknown transaction. Only synthetic records created in this browser can be opened.');
    return publicProof(job);
  } };
}

export function mountDemoBanner(runtime) {
  if (!runtime || typeof document === 'undefined') return;
  document.documentElement.dataset.demo = 'true';
  const styles = document.createElement('link'); styles.rel = 'stylesheet'; styles.href = '/demo-mode.css'; document.head.append(styles);
  const banner = document.createElement('aside'); banner.id = 'demo-banner'; banner.setAttribute('aria-label', 'Local demonstration');
  banner.innerHTML = '<div><strong>LOCAL DEMO / デモ</strong><span>撮影用シミュレーション / 実際のユースケースに沿った操作説明</span></div><nav aria-label="Demo views"><a href="/?demo=1#/device">Device</a><a href="/?demo=1#/admin">Administrator</a><a href="/?demo=1#/verify">Public verifier</a><a href="/managed-proof/?demo=1">Managed API</a><a href="/system-operations/?demo=1">Operations</a><button type="button" id="demo-reset">Reset demo / 初期化</button></nav>';
  document.body.prepend(banner);
  banner.querySelector('#demo-reset').addEventListener('click', () => { runtime.reset(); location.replace(`/?demo=1&reset=${Date.now()}#/device`); });
  // Keep internal navigation on the explicitly opted-in local presentation.
  document.addEventListener('click', (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor) return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin) { event.preventDefault(); return; }
    if (!url.searchParams.has('demo')) { url.searchParams.set('demo', '1'); anchor.href = url.href; }
  });
}

export const demo = typeof window !== 'undefined' && isLocalDemo(window.location)
  ? createDemoRuntime({ storage: window.localStorage, location: window.location }) : null;
