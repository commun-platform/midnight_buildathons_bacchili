const state = { bootstrap: null, sources: [], runs: [], selectedRun: null, polling: null };
const notice = document.querySelector('#notice');
const projectSelect = document.querySelector('#project-select');
const policySelect = document.querySelector('#policy-select');
const runSourceSelect = document.querySelector('#run-source-select');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function short(value, length = 24) {
  const text = String(value ?? '');
  return !text ? '—' : text.length <= length ? text : `${text.slice(0, length / 2)}…${text.slice(-length / 2)}`;
}

function showNotice(message, kind = '') {
  notice.className = `notice ${kind}`.trim();
  notice.querySelector('span:last-child').textContent = message;
}

async function api(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (mutation && !state.bootstrap?.csrfToken) {
    throw new Error('The administration session is not ready. Reload this page.');
  }
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    ...(mutation && options.body === undefined ? { body: '{}' } : {}),
    headers: {
      Accept: 'application/json',
      ...(mutation ? {
        'Content-Type': 'application/json',
        'X-CSRF-Token': state.bootstrap.csrfToken,
      } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function working(status) {
  return ['provisioning', 'pending_fetch', 'fetching', 'fetch_retry', 'proof_queued', 'proving', 'proof_retry'].includes(status);
}

function stateClass(status) {
  return status === 'confirmed' || status === 'active' ? status
    : status === 'action_required' || status === 'dead_lettered' ? 'failed'
      : working(status) ? 'working' : '';
}

function stateLabel(status) {
  const labels = {
    retry_waiting: 'Retry scheduled',
    sponsor_wallet_waiting: 'Waiting for System Wallet',
    source_action_required: 'Source action required',
    proof_action_required: 'Proof action required',
  };
  return labels[status] || String(status || 'unknown').replaceAll('_', ' ');
}

function localDate(daysAgo = 2) {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function renderPolicies() {
  const projectId = projectSelect.value;
  const policies = (state.bootstrap?.policies || []).filter((policy) => policy.projectId === projectId);
  policySelect.innerHTML = policies.length
    ? policies.map((policy) => `<option value="${escapeHtml(policy.policyId)}">${escapeHtml(policy.name)} · ${escapeHtml(policy.minimum ?? '—')}–${escapeHtml(policy.maximum ?? '—')} ${escapeHtml(policy.unit)}</option>`).join('')
    : '<option value="">No registered Policy</option>';
}

function renderSourceSelect() {
  const active = state.sources.filter((source) => source.status === 'active');
  runSourceSelect.innerHTML = active.length
    ? active.map((source) => `<option value="${escapeHtml(source.sourceId)}">${escapeHtml(source.name)} · ${escapeHtml(source.sourceId)}</option>`).join('')
    : '<option value="">No active source</option>';
}

function renderSources() {
  const root = document.querySelector('#source-cards');
  if (!state.sources.length) {
    root.className = 'source-cards empty-state';
    root.textContent = 'No managed source is registered.';
    return;
  }
  root.className = 'source-cards';
  root.innerHTML = state.sources.map((source) => `<article class="source-card">
    <strong>${escapeHtml(source.name)}</strong>
    <span class="state ${stateClass(source.status)}">${escapeHtml(stateLabel(source.status))}</span>
    <dl><dt>Source</dt><dd>${escapeHtml(source.sourceId)}</dd><dt>Project</dt><dd>${escapeHtml(source.projectId)}</dd><dt>Policy</dt><dd>${escapeHtml(source.policyId)}</dd><dt>Stage</dt><dd>${escapeHtml(stateLabel(source.stage))}</dd>${source.errorSummary ? `<dt>${source.status === 'action_required' ? 'Action' : 'Status detail'}</dt><dd>${escapeHtml(source.errorSummary)}</dd>` : ''}</dl>
  </article>`).join('');
}

function resultLabel(run) {
  if (run.status === 'confirmed') return 'Recorded';
  if (run.status === 'action_required' || run.status === 'dead_lettered') return 'Action required';
  if (run.stage === 'sponsor_wallet_waiting') return 'Automatic retry scheduled';
  if (run.status === 'proof_queued' || run.status === 'proving' || run.status === 'proof_retry') return 'Proof pending';
  return 'Fetch pending';
}

function renderRuns() {
  const body = document.querySelector('#run-list');
  if (!state.runs.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-cell">No processing history.</td></tr>';
    return;
  }
  body.innerHTML = state.runs.map((run) => `<tr>
    <td><strong>${escapeHtml(run.periodDate)}</strong></td><td>${escapeHtml(run.sourceId)}</td>
    <td>${escapeHtml(run.sampleCount ?? '—')}</td><td>${escapeHtml(run.observedHourCount ?? '—')} / 24</td>
    <td><span class="state ${stateClass(run.status)}">${escapeHtml(stateLabel(run.stage))}</span></td>
    <td>${escapeHtml(resultLabel(run))}</td>
    <td><button class="secondary inspect" data-source="${escapeHtml(run.sourceId)}" data-run="${escapeHtml(run.runId)}">Inspect</button></td>
  </tr>`).join('');
  body.querySelectorAll('.inspect').forEach((button) => button.addEventListener('click', () => {
    void loadDetail(button.dataset.source, button.dataset.run);
  }));
}

async function loadSources(selectSourceId) {
  const data = await api('/api/v1/managed-sources');
  state.sources = data.sources;
  renderSources();
  renderSourceSelect();
  if (selectSourceId && [...runSourceSelect.options].some((option) => option.value === selectSourceId)) {
    runSourceSelect.value = selectSourceId;
  }
  const runs = await Promise.all(state.sources.map(async (source) => {
    const value = await api(`/api/v1/managed-sources/${encodeURIComponent(source.sourceId)}/runs`);
    return value.runs;
  }));
  state.runs = runs.flat().sort((left, right) => right.periodDate.localeCompare(left.periodDate) || right.createdAt.localeCompare(left.createdAt));
  renderRuns();
}

const pipelineStages = [
  ['Source fetch', ['pending_fetch', 'fetching', 'fetch_retry']],
  ['24-hour aggregation', ['proof_queued']],
  ['ZK proof + System Wallet', ['proving', 'proof_retry']],
  ['Midnight confirmation', ['confirmed']],
];

function renderDetail(data) {
  state.selectedRun = data.run;
  const section = document.querySelector('#evidence');
  section.classList.remove('hidden');
  document.querySelector('#detail-title').textContent = `${data.run.periodDate} · Daily proof evidence`;
  const badge = document.querySelector('#detail-status');
  badge.textContent = stateLabel(data.run.status).toUpperCase();
  const currentIndex = Math.max(0, pipelineStages.findIndex(([, values]) => values.includes(data.run.status)));
  document.querySelector('#pipeline').innerHTML = pipelineStages.map(([label], index) => `<div class="${index < currentIndex || data.run.status === 'confirmed' ? 'done' : index === currentIndex ? 'current' : ''}">${index < currentIndex || data.run.status === 'confirmed' ? '✓ ' : index === currentIndex ? '● ' : '○ '}${escapeHtml(label)}</div>`).join('');
  const error = document.querySelector('#error-card');
  if (data.run.errorSummary) {
    const actionRequired = ['action_required', 'dead_lettered'].includes(data.run.status);
    error.classList.remove('hidden');
    error.innerHTML = `<strong>${actionRequired ? 'Action required' : 'Automatic retry scheduled'}</strong><p>${escapeHtml(data.run.errorSummary)}</p>${actionRequired ? '<button id="retry-run" class="primary">Retry this Run</button>' : ''}`;
    if (actionRequired) {
      error.querySelector('#retry-run')?.addEventListener('click', () => void retrySelected());
    }
  } else error.classList.add('hidden');
  document.querySelector('#hour-list').innerHTML = data.hours.map((hour) => `<tr>
    <td>${String(hour.hourIndex).padStart(2, '0')}:00</td><td>${escapeHtml(hour.sampleCount)}</td>
    <td>${escapeHtml(hour.minimum ?? '—')}</td><td>${escapeHtml(hour.maximum ?? '—')}</td><td>${hour.average === null ? '—' : escapeHtml(Number(hour.average).toFixed(2))}</td>
    <td><span class="state ${hour.thresholdResult === 'outside-threshold' ? 'failed' : hour.thresholdResult === 'within-threshold' ? 'confirmed' : ''}">${escapeHtml(stateLabel(hour.thresholdResult || 'pending'))}</span></td>
  </tr>`).join('');
  const proof = data.proof;
  const explorer = proof?.transactionHash ? `https://preprod.midnightexplorer.com/transactions/${encodeURIComponent(proof.transactionHash)}` : '';
  document.querySelector('#proof-evidence').innerHTML = `
    <div class="evidence-item"><span>PROOF JOB</span><code>${escapeHtml(data.run.proofJobId)}</code></div>
    <div class="evidence-item"><span>ZKP GENERATED</span><code>${escapeHtml(proof?.proofGeneratedAt || 'Pending')}</code></div>
    <div class="evidence-item"><span>TX HASH</span><code>${explorer ? `<a class="external" target="_blank" rel="noopener noreferrer" href="${escapeHtml(explorer)}">${escapeHtml(short(proof.transactionHash))} ↗</a>` : 'Pending'}</code></div>
    <div class="evidence-item"><span>PUBLIC VERIFICATION</span>${data.run.verificationUrl && data.run.status === 'confirmed' ? `<a class="external" href="${escapeHtml(data.run.verificationUrl)}">Open third-party verification →</a>` : '<code>Available after confirmation</code>'}</div>`;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadDetail(sourceId, runId, quiet = false) {
  try {
    if (!quiet) showNotice('Loading proof evidence…', 'loading');
    const data = await api(`/api/v1/managed-sources/${encodeURIComponent(sourceId)}/runs/${encodeURIComponent(runId)}`);
    renderDetail(data);
    if (!quiet) showNotice('Proof evidence loaded.', 'success');
    if (working(data.run.status)) startPolling(sourceId, runId); else stopPolling();
  } catch (error) { showNotice(error.message, 'error'); }
}

function startPolling(sourceId, runId) {
  stopPolling();
  state.polling = window.setInterval(async () => {
    await loadSources(sourceId).catch(() => undefined);
    await loadDetail(sourceId, runId, true);
  }, 5000);
}
function stopPolling() { if (state.polling) window.clearInterval(state.polling); state.polling = null; }

async function retrySelected() {
  if (!state.selectedRun) return;
  try {
    showNotice('Re-queueing the failed Run…', 'loading');
    await api(`/api/v1/managed-sources/${encodeURIComponent(state.selectedRun.sourceId)}/runs/${encodeURIComponent(state.selectedRun.runId)}/retry`, { method: 'POST' });
    await loadSources(state.selectedRun.sourceId);
    await loadDetail(state.selectedRun.sourceId, state.selectedRun.runId);
  } catch (error) { showNotice(error.message, 'error'); }
}

document.querySelector('#source-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    showNotice('Registering source. Midnight registration continues in the background…', 'loading');
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const data = await api('/api/v1/managed-sources', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    event.currentTarget.elements.bearerToken.value = '';
    await loadSources(data.source.sourceId);
    showNotice('Source accepted. Track its on-chain registration under Processing history.', 'success');
  } catch (error) { showNotice(error.message, 'error'); } finally { button.disabled = false; }
});

document.querySelector('#run-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const body = Object.fromEntries(new FormData(event.currentTarget));
    if (!body.sourceId) throw new Error('An active Managed Source is required');
    showNotice('Creating the fixed 24-hour fetch job…', 'loading');
    const data = await api(`/api/v1/managed-sources/${encodeURIComponent(body.sourceId)}/runs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ periodDate: body.periodDate }),
    });
    await loadSources(body.sourceId);
    await loadDetail(body.sourceId, data.run.runId);
  } catch (error) { showNotice(error.message, 'error'); } finally { button.disabled = false; }
});

projectSelect.addEventListener('change', renderPolicies);
document.querySelector('#refresh').addEventListener('click', async () => {
  try { showNotice('Refreshing source and Run state…', 'loading'); await loadSources(runSourceSelect.value); showNotice('State refreshed.', 'success'); }
  catch (error) { showNotice(error.message, 'error'); }
});

async function initialize() {
  document.querySelector('#first-period-date').value = localDate(3);
  document.querySelector('#run-period-date').value = localDate(2);
  state.bootstrap = await api('/api/v1/managed-sources/bootstrap');
  projectSelect.innerHTML = state.bootstrap.projects.map((project) => `<option value="${escapeHtml(project.projectId)}">${escapeHtml(project.name)}</option>`).join('');
  renderPolicies();
  await loadSources();
  showNotice('Managed Proof is ready. Register a source or inspect an existing Run.', 'success');
}

initialize().catch((error) => showNotice(error.message, 'error'));
