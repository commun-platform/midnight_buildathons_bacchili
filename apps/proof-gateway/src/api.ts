import { createSqlDatabase } from './storage/index.js';

const apiHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
};

const maxRequestBodyBytes = 64 * 1024;
type AttestationStatus =
  | 'pending'
  | 'aggregating'
  | 'proving'
  | 'submitted'
  | 'confirmed'
  | 'failed';

interface ProjectRow {
  id: string;
  name: string;
  name_ja: string | null;
  organization: string;
  organization_ja: string | null;
  timezone: string;
  expected_interval_minutes: number;
}

interface DeviceRow {
  id: string;
  project_id: string;
  name: string;
  name_ja: string | null;
  device_type: string;
  device_type_ja: string | null;
  sensor_type: string;
  unit: string;
  expected_interval_minutes: number;
  last_seen_at: string | null;
}

interface ReadingRow {
  id: string;
  project_id: string;
  device_id: string;
  device_name: string;
  device_name_ja: string | null;
  device_type: string;
  device_type_ja: string | null;
  sensor_type: string;
  value: number;
  unit: string;
  recorded_at: string;
  received_at: string;
  is_outlier: number;
  attestation_id: string | null;
  attestation_status: AttestationStatus | null;
  verify_tx_id: string | null;
}

interface AttestationRow {
  id: string;
  project_id: string;
  period_date: string;
  status: AttestationStatus;
  sample_count: number;
  expected_count: number;
  missing_count: number;
  outlier_count: number;
  merkle_root: string | null;
  device_commitment: string | null;
  register_tx_id: string | null;
  register_tx_hash: string | null;
  register_block_height: string | null;
  verify_tx_id: string | null;
  verify_tx_hash: string | null;
  verify_block_height: string | null;
  verification_result: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

function json(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), { status, headers: apiHeaders });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function publicNetworkName(env: Env): string {
  return env.PUBLIC_MIDNIGHT_NETWORK?.trim() || 'Midnight network';
}

function publicContractAddress(env: Env): string | null {
  const configured = env.PUBLIC_SENSOR_REGISTRY_CONTRACT_ADDRESS?.trim() ?? '';
  const normalized = configured.replace(/^0x/i, '');
  return /^[a-f\d]{64}$/i.test(normalized) ? normalized : null;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxRequestBodyBytes) throw new Error('Request body is too large');
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Request body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  return crypto.subtle.timingSafeEqual(leftHash, rightHash);
}

async function hasBearerToken(request: Request, expected?: string): Promise<boolean> {
  if (!expected?.trim()) return false;
  return constantTimeEqual(request.headers.get('Authorization') ?? '', `Bearer ${expected.trim()}`);
}

function localDate(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function localHour(value: Date, timezone: string): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(value);
  return Number(hour);
}

function previousDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function connectionState(device: DeviceRow, now = Date.now()): 'online' | 'delayed' | 'offline' {
  if (!device.last_seen_at) return 'offline';
  const elapsedMinutes = (now - Date.parse(device.last_seen_at)) / 60_000;
  const delayedAfter = Math.max(device.expected_interval_minutes * 3, 5);
  if (elapsedMinutes <= delayedAfter) return 'online';
  if (elapsedMinutes <= delayedAfter * 6) return 'delayed';
  return 'offline';
}

function publicAttestation(row: AttestationRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    periodDate: row.period_date,
    status: row.status,
    sampleCount: row.sample_count,
    expectedCount: row.expected_count,
    missingCount: row.missing_count,
    outlierCount: row.outlier_count,
    merkleRoot: row.merkle_root,
    deviceCommitment: row.device_commitment,
    registerTx: row.register_tx_id ? {
      txId: row.register_tx_id,
      txHash: row.register_tx_hash,
      blockHeight: row.register_block_height,
    } : null,
    verifyTx: row.verify_tx_id ? {
      txId: row.verify_tx_id,
      txHash: row.verify_tx_hash,
      blockHeight: row.verify_block_height,
    } : null,
    verificationResult: row.verification_result === null ? null : row.verification_result === 1,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readingView(reading: ReadingRow) {
  return {
    id: reading.id,
    projectId: reading.project_id,
    deviceId: reading.device_id,
    deviceName: reading.device_name,
    deviceNameJa: reading.device_name_ja,
    deviceType: reading.device_type,
    deviceTypeJa: reading.device_type_ja,
    sensorType: reading.sensor_type,
    value: reading.value,
    unit: reading.unit,
    recordedAt: reading.recorded_at,
    receivedAt: reading.received_at,
    isOutlier: reading.is_outlier === 1,
    attestationId: reading.attestation_id,
    attestationStatus: reading.attestation_status ?? 'pending',
    verifyTxId: reading.verify_tx_id,
  };
}

async function projectSummary(env: Env, projectId: string): Promise<Response> {
  const database = createSqlDatabase(env);
  try {
    const project = await database.first<ProjectRow>(
      `SELECT id, name, name_ja, organization, organization_ja,
              timezone, expected_interval_minutes
       FROM projects WHERE id = ?1`,
      [projectId],
    );
    if (!project) return json(404, { error: 'Project not found' });
    const [devices, latestReadings, collection, attestations] = await Promise.all([
      database.all<DeviceRow>(
        `SELECT id, project_id, name, name_ja, device_type, device_type_ja,
                sensor_type, unit,
                expected_interval_minutes, last_seen_at
         FROM devices WHERE project_id = ?1 ORDER BY name`,
        [projectId],
      ),
      database.all<ReadingRow>(
        `SELECT id, project_id, device_id, device_name, device_name_ja,
                device_type, device_type_ja, sensor_type,
                value, unit, recorded_at, received_at, is_outlier,
                attestation_id, attestation_status, verify_tx_id
         FROM (
           SELECT r.*, d.name AS device_name, d.name_ja AS device_name_ja,
                  d.device_type, d.device_type_ja,
                  a.status AS attestation_status, a.verify_tx_id,
                  ROW_NUMBER() OVER (
                    PARTITION BY r.device_id, r.sensor_type ORDER BY r.recorded_at DESC
                  ) AS row_number
           FROM readings r
           JOIN devices d ON d.id = r.device_id
           LEFT JOIN attestations a ON a.id = r.attestation_id
           WHERE r.project_id = ?1
         ) WHERE row_number = 1 ORDER BY device_name`,
        [projectId],
      ),
      database.first<{
        received_count: number;
        outlier_count: number;
      }>(
        `SELECT COUNT(*) AS received_count,
                SUM(CASE WHEN is_outlier = 1 THEN 1 ELSE 0 END) AS outlier_count
         FROM readings WHERE project_id = ?1 AND local_date = ?2`,
        [projectId, localDate(new Date(), project.timezone)],
      ),
      database.all<AttestationRow>(
        `SELECT * FROM attestations WHERE project_id = ?1
         ORDER BY period_date DESC LIMIT 20`,
        [projectId],
      ),
    ]);
    const expectedCount = devices.reduce(
      (sum, device) => sum + Math.floor(1_440 / device.expected_interval_minutes),
      0,
    );
    const onlineCount = devices.filter((device) => connectionState(device) === 'online').length;
    const latestAttestation = attestations[0] ?? null;
    const lastConfirmed = attestations.find((row) => row.status === 'confirmed') ?? null;
    return json(200, {
      source: database.kind,
      project: {
        id: project.id,
        name: project.name,
        nameJa: project.name_ja,
        organization: project.organization,
        organizationJa: project.organization_ja,
        timezone: project.timezone,
        privacyMode: 'Cloud backend private state / public Midnight attestation',
      },
      latestReadings: latestReadings.map(readingView),
      devices: devices.map((device) => ({
        id: device.id,
        name: device.name,
        nameJa: device.name_ja,
        deviceType: device.device_type,
        deviceTypeJa: device.device_type_ja,
        sensorType: device.sensor_type,
        unit: device.unit,
        lastSeenAt: device.last_seen_at,
        connectionState: connectionState(device),
      })),
      collection: {
        date: localDate(new Date(), project.timezone),
        receivedCount: collection?.received_count ?? 0,
        expectedCount,
        missingCount: Math.max(expectedCount - (collection?.received_count ?? 0), 0),
        outlierCount: collection?.outlier_count ?? 0,
        onlineDeviceCount: onlineCount,
        deviceCount: devices.length,
      },
      latestAttestation: latestAttestation ? publicAttestation(latestAttestation) : null,
      lastConfirmedAttestation: lastConfirmed ? publicAttestation(lastConfirmed) : null,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'project_summary_failed', message: errorMessage(error) }));
    return json(503, { error: 'Project database is unavailable' });
  }
}

async function projectReadings(env: Env, projectId: string, url: URL): Promise<Response> {
  const database = createSqlDatabase(env);
  const conditions = ['r.project_id = ?'];
  const bindings: Array<string | number> = [projectId];
  const addFilter = (sql: string, value: string) => {
    conditions.push(sql);
    bindings.push(value);
  };
  const device = url.searchParams.get('device');
  const sensor = url.searchParams.get('sensor');
  const outlier = url.searchParams.get('outlier');
  const status = url.searchParams.get('status');
  if (device) addFilter('r.device_id = ?', device);
  if (sensor) addFilter('r.sensor_type = ?', sensor);
  if (outlier === 'true' || outlier === 'false') {
    conditions.push('r.is_outlier = ?');
    bindings.push(outlier === 'true' ? 1 : 0);
  }
  if (status) addFilter("COALESCE(a.status, 'pending') = ?", status);
  try {
    const readings = await database.all<ReadingRow>(
      `SELECT r.id, r.project_id, r.device_id, d.name AS device_name,
              d.name_ja AS device_name_ja, d.device_type, d.device_type_ja,
              r.sensor_type, r.value, r.unit,
              r.recorded_at, r.received_at, r.is_outlier, r.attestation_id,
              a.status AS attestation_status, a.verify_tx_id
       FROM readings r
       JOIN devices d ON d.id = r.device_id
       LEFT JOIN attestations a ON a.id = r.attestation_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.recorded_at DESC LIMIT 200`,
      bindings,
    );
    return json(200, { source: database.kind, readings: readings.map(readingView) });
  } catch (error) {
    console.error(JSON.stringify({ event: 'readings_failed', message: errorMessage(error) }));
    return json(503, { error: 'Reading database is unavailable' });
  }
}

async function projectAttestations(env: Env, projectId: string): Promise<Response> {
  const database = createSqlDatabase(env);
  try {
    const attestations = await database.all<AttestationRow>(
      `SELECT * FROM attestations WHERE project_id = ?1
       ORDER BY period_date DESC LIMIT 100`,
      [projectId],
    );
    return json(200, { source: database.kind, attestations: attestations.map(publicAttestation) });
  } catch (error) {
    console.error(JSON.stringify({ event: 'attestations_failed', message: errorMessage(error) }));
    return json(503, { error: 'Attestation database is unavailable' });
  }
}

async function verificationDetail(env: Env, attestationId: string): Promise<Response> {
  const database = createSqlDatabase(env);
  let row: AttestationRow | null = null;
  try {
    row = await database.first<AttestationRow>(
      'SELECT * FROM attestations WHERE id = ?1',
      [attestationId],
    );
  } catch (error) {
    console.error(JSON.stringify({ event: 'verification_failed', message: errorMessage(error) }));
    return json(503, { error: 'Attestation database is unavailable' });
  }
  if (!row) return json(404, { error: 'Attestation not found' });
  return json(200, {
    attestation: publicAttestation(row),
    claim: row.status === 'confirmed'
      ? 'The selected private sensor value is included in the registered daily dataset and is within the private policy range.'
      : 'The daily dataset is pending. It is not treated as verified until Midnight confirms it.',
    claimJa: row.status === 'confirmed'
      ? '登録済み日次データセットに含まれる選択センサー値が、非公開ポリシー範囲内であることを証明しました。'
      : '日次データセットは処理待ちです。Midnightで確認されるまで証明済みとは扱いません。',
    checks: {
      datasetRegistered: Boolean(row.register_tx_id),
      merkleInclusion: row.verification_result === 1,
      privateRange: row.verification_result === 1,
      midnightConfirmed: row.status === 'confirmed',
    },
    privacy: {
      rawSensorValues: 'private',
      thresholdPolicy: 'private',
      merklePath: 'private',
      publicFields: ['merkleRoot', 'period', 'sampleCount', 'verificationResult', 'transactionId'],
    },
    network: publicNetworkName(env),
    contractAddress: publicContractAddress(env),
  });
}

function requiredString(body: Record<string, unknown>, key: string, maxLength = 160): string {
  const value = body[key];
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new Error(`${key} must be a non-empty string up to ${maxLength} characters`);
  }
  return value.trim();
}

function requiredNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number`);
  }
  return value;
}

async function ingestReading(request: Request, env: Env): Promise<Response> {
  if (!(await hasBearerToken(request, env.INGEST_API_TOKEN))) {
    return json(env.INGEST_API_TOKEN ? 401 : 503, { error: 'Ingestion is not configured or authorized' });
  }
  const database = createSqlDatabase(env);
  try {
    const body = await readJson(request);
    const projectId = requiredString(body, 'projectId');
    const deviceId = requiredString(body, 'deviceId');
    const sensorType = requiredString(body, 'sensorType', 64);
    const unit = requiredString(body, 'unit', 24);
    const value = requiredNumber(body, 'value');
    const recordedAt = requiredString(body, 'recordedAt');
    const parsedRecordedAt = new Date(recordedAt);
    if (Number.isNaN(parsedRecordedAt.valueOf())) throw new Error('recordedAt must be an ISO date');
    const device = await database.first<{
      id: string;
      project_id: string;
      sensor_type: string;
      unit: string;
      normal_min: number | null;
      normal_max: number | null;
      timezone: string;
    }>(
      `SELECT d.id, d.project_id, d.sensor_type, d.unit,
              d.normal_min, d.normal_max, p.timezone
       FROM devices d JOIN projects p ON p.id = d.project_id
       WHERE d.id = ?1 AND d.project_id = ?2`,
      [deviceId, projectId],
    );
    if (!device) return json(404, { error: 'Device not found' });
    if (sensorType !== device.sensor_type || unit !== device.unit) {
      return json(400, { error: 'sensorType and unit must match the registered device' });
    }
    const receivedAt = new Date().toISOString();
    const isOutlier = (
      (device.normal_min !== null && value < device.normal_min) ||
      (device.normal_max !== null && value > device.normal_max)
    ) ? 1 : 0;
    const readingId = crypto.randomUUID();
    await database.batch([
      {
        sql: `INSERT INTO readings (
           id, project_id, device_id, sensor_type, value, unit,
           recorded_at, received_at, local_date, is_outlier
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
        parameters: [
          readingId,
          projectId,
          deviceId,
          sensorType,
          value,
          unit,
          parsedRecordedAt.toISOString(),
          receivedAt,
          localDate(parsedRecordedAt, device.timezone),
          isOutlier,
        ],
      },
      {
        sql: 'UPDATE devices SET last_seen_at = ?1 WHERE id = ?2',
        parameters: [receivedAt, deviceId],
      },
    ]);
    return json(202, { accepted: true, readingId, isOutlier: isOutlier === 1 });
  } catch (error) {
    return json(400, { error: errorMessage(error) });
  }
}

async function claimAttestation(request: Request, env: Env): Promise<Response> {
  if (!(await hasBearerToken(request, env.ATTESTATION_API_TOKEN))) {
    return json(env.ATTESTATION_API_TOKEN ? 401 : 503, { error: 'Attestation agent is not configured or authorized' });
  }
  const database = createSqlDatabase(env);
  const row = await database.first<AttestationRow>(
    `SELECT * FROM attestations WHERE status = 'pending'
     ORDER BY period_date ASC LIMIT 1`,
  );
  if (!row) return new Response(null, { status: 204 });
  const updatedAt = new Date().toISOString();
  const changes = await database.execute(
    `UPDATE attestations SET status = 'aggregating', updated_at = ?1
     WHERE id = ?2 AND status = 'pending'`,
    [updatedAt, row.id],
  );
  if (!changes) return json(409, { error: 'Attestation was claimed by another agent' });
  return json(200, { attestation: publicAttestation({ ...row, status: 'aggregating', updated_at: updatedAt }) });
}

async function updateAttestation(
  request: Request,
  env: Env,
  attestationId: string,
): Promise<Response> {
  if (!(await hasBearerToken(request, env.ATTESTATION_API_TOKEN))) {
    return json(env.ATTESTATION_API_TOKEN ? 401 : 503, { error: 'Attestation agent is not configured or authorized' });
  }
  const database = createSqlDatabase(env);
  try {
    const body = await readJson(request);
    const status = requiredString(body, 'status') as AttestationStatus;
    const statuses: AttestationStatus[] = [
      'aggregating', 'proving', 'submitted', 'confirmed', 'failed',
    ];
    if (!statuses.includes(status)) throw new Error('Unsupported attestation status');
    const value = (key: string) => typeof body[key] === 'string' ? body[key] : null;
    const verificationResult = typeof body.verificationResult === 'boolean'
      ? body.verificationResult ? 1 : 0
      : null;
    const updatedAt = new Date().toISOString();
    const changes = await database.execute(
      `UPDATE attestations SET
         status = ?1,
         merkle_root = COALESCE(?2, merkle_root),
         device_commitment = COALESCE(?3, device_commitment),
         register_tx_id = COALESCE(?4, register_tx_id),
         register_tx_hash = COALESCE(?5, register_tx_hash),
         register_block_height = COALESCE(?6, register_block_height),
         verify_tx_id = COALESCE(?7, verify_tx_id),
         verify_tx_hash = COALESCE(?8, verify_tx_hash),
         verify_block_height = COALESCE(?9, verify_block_height),
         verification_result = COALESCE(?10, verification_result),
         error_message = ?11,
         updated_at = ?12
       WHERE id = ?13`,
      [
        status,
        value('merkleRoot'),
        value('deviceCommitment'),
        value('registerTxId'),
        value('registerTxHash'),
        value('registerBlockHeight'),
        value('verifyTxId'),
        value('verifyTxHash'),
        value('verifyBlockHeight'),
        verificationResult,
        value('errorMessage'),
        updatedAt,
        attestationId,
      ],
    );
    if (!changes) return json(404, { error: 'Attestation not found' });
    return json(200, { updated: true, attestationId, status, updatedAt });
  } catch (error) {
    return json(400, { error: errorMessage(error) });
  }
}

export async function handleApi(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  const parts = url.pathname.split('/').filter(Boolean);

  if (request.method === 'GET' && parts.length === 5 && parts[1] === 'v1' && parts[2] === 'projects') {
    const projectId = parts[3];
    if (!projectId) return json(404, { error: 'Project not found' });
    if (parts[4] === 'summary') return projectSummary(env, projectId);
    if (parts[4] === 'readings') return projectReadings(env, projectId, url);
    if (parts[4] === 'attestations') return projectAttestations(env, projectId);
  }
  if (request.method === 'GET' && parts.length === 4 && parts[1] === 'v1' && parts[2] === 'attestations') {
    const attestationId = parts[3];
    if (!attestationId) return json(404, { error: 'Attestation not found' });
    return verificationDetail(env, attestationId);
  }
  if (request.method === 'POST' && url.pathname === '/api/v1/readings') {
    return ingestReading(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/api/internal/attestations/claim') {
    return claimAttestation(request, env);
  }
  if (
    request.method === 'POST' &&
    parts.length === 5 &&
    parts[1] === 'internal' &&
    parts[2] === 'attestations' &&
    parts[4] === 'result'
  ) {
    const attestationId = parts[3];
    if (!attestationId) return json(404, { error: 'Attestation not found' });
    return updateAttestation(request, env, attestationId);
  }
  return json(404, { error: 'API endpoint not found' });
}

export async function scheduleDailyAttestations(env: Env, scheduledTime: number): Promise<void> {
  const scheduledAt = new Date(scheduledTime);
  const database = createSqlDatabase(env);
  let projects: ProjectRow[];
  try {
    projects = await database.all<ProjectRow>(
      `SELECT id, name, name_ja, organization, organization_ja,
              timezone, expected_interval_minutes FROM projects`,
    );
  } catch (error) {
    console.error(JSON.stringify({ event: 'attestation_schedule_failed', message: errorMessage(error) }));
    return;
  }
  for (const project of projects) {
    if (localHour(scheduledAt, project.timezone) !== 0) continue;
    const periodDate = previousDate(localDate(scheduledAt, project.timezone));
    const [counts, expected] = await Promise.all([
      database.first<{ sample_count: number; outlier_count: number }>(
        `SELECT COUNT(*) AS sample_count,
                SUM(CASE WHEN is_outlier = 1 THEN 1 ELSE 0 END) AS outlier_count
         FROM readings WHERE project_id = ?1 AND local_date = ?2`,
        [project.id, periodDate],
      ),
      database.first<{ expected_count: number }>(
        `SELECT COALESCE(SUM(1440 / expected_interval_minutes), 0) AS expected_count
         FROM devices WHERE project_id = ?1`,
        [project.id],
      ),
    ]);
    const sampleCount = counts?.sample_count ?? 0;
    const expectedCount = expected?.expected_count ?? 0;
    const attestationId = `att-${project.id}-${periodDate}`;
    const now = scheduledAt.toISOString();
    await database.batch([
      {
        sql: `INSERT OR IGNORE INTO attestations (
           id, project_id, period_date, status, sample_count, expected_count,
           missing_count, outlier_count, created_at, updated_at
         ) VALUES (?1, ?2, ?3, 'pending', ?4, ?5, ?6, ?7, ?8, ?8)`,
        parameters: [
          attestationId,
          project.id,
          periodDate,
          sampleCount,
          expectedCount,
          Math.max(expectedCount - sampleCount, 0),
          counts?.outlier_count ?? 0,
          now,
        ],
      },
      {
        sql: `UPDATE readings SET attestation_id = ?1
         WHERE project_id = ?2 AND local_date = ?3 AND attestation_id IS NULL`,
        parameters: [attestationId, project.id, periodDate],
      },
    ]);
  }
}
