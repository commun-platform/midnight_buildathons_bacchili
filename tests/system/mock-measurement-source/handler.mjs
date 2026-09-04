const expectedToken = 'test-managed-source-token';
const minuteMilliseconds = 60_000;

function json(status, value, headers = {}) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

function measurement(sourceId, start, index, value) {
  return {
    id: `${sourceId}:${String(index).padStart(4, '0')}`,
    recordedAt: new Date(start + index * minuteMilliseconds + 30_000).toISOString(),
    value,
  };
}

function dailyValue(index) {
  return Number((22 + Math.sin(index / 1440 * Math.PI * 2) * 3).toFixed(2));
}

function normalMeasurements(sourceId, start) {
  return Array.from({ length: 1440 }, (_value, index) => (
    measurement(sourceId, start, index, dailyValue(index))
  ));
}

function successfulBody(sourceId, from, to, measurements, overrides = {}) {
  return {
    schemaVersion: 1,
    sourceId,
    sensorType: 'temperature',
    unit: '°C',
    from,
    to,
    measurements,
    ...overrides,
  };
}

export async function handleMeasurementSource(request) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') {
    return json(200, { ok: true, service: 'deterministic-measurement-source' });
  }
  if (request.method !== 'GET' || url.pathname !== '/v1/measurements') {
    return json(404, { error: 'Not found' });
  }
  const sourceId = url.searchParams.get('sourceId') ?? '';
  if (sourceId === 'unauthorized') return json(401, { error: 'Unauthorized' });
  if (sourceId === 'forbidden') return json(403, { error: 'Forbidden' });
  if (sourceId === 'not-found') return json(404, { error: 'Source not found' });
  if (sourceId === 'rate-limited') return json(429, { error: 'Try later' }, { 'Retry-After': '3' });
  if (sourceId === 'server-error') return json(503, { error: 'Temporary source outage' });
  if (sourceId === 'redirect') {
    return new Response(null, { status: 302, headers: { Location: '/v1/measurements' } });
  }
  if (request.headers.get('Authorization') !== `Bearer ${expectedToken}`) {
    return json(401, { error: 'Unauthorized' });
  }
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!sourceId || !Number.isFinite(start) || end - start !== 86_400_000) {
    return json(400, { error: 'sourceId and an exact 24-hour interval are required' });
  }
  if (sourceId === 'timeout') {
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
  if (sourceId === 'malformed-json') {
    return new Response('{"schemaVersion":1,"measurements":[', {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  let measurements = normalMeasurements(sourceId, start);
  if (sourceId === 'outside-threshold') {
    measurements[120] = measurement(sourceId, start, 120, 40);
    measurements[980] = measurement(sourceId, start, 980, 5);
  } else if (sourceId === 'missing-hour') {
    measurements = measurements.filter((_value, index) => Math.floor(index / 60) !== 12);
  } else if (sourceId === 'sparse-day') {
    measurements = [0, 360, 720, 1080].map((index) => measurement(sourceId, start, index, dailyValue(index)));
  } else if (sourceId === 'empty-day') {
    measurements = [];
  } else if (sourceId === 'duplicate-identical') {
    measurements.push({ ...measurements[500] });
  } else if (sourceId === 'duplicate-conflict') {
    measurements.push({ ...measurements[500], value: measurements[500].value + 1 });
  } else if (sourceId === 'outside-range') {
    measurements = [{ id: `${sourceId}:outside`, recordedAt: to, value: 22 }];
  } else if (sourceId === 'oversized') {
    measurements = Array.from({ length: 2_001 }, (_value, index) => (
      measurement(sourceId, start, index % 1440, dailyValue(index % 1440))
    ));
  }
  const overrides = {};
  if (sourceId === 'wrong-source') overrides.sourceId = 'different-source';
  if (sourceId === 'wrong-range') overrides.to = new Date(end + minuteMilliseconds).toISOString();
  if (sourceId === 'wrong-unit') overrides.unit = '°F';
  const body = successfulBody(sourceId, from, to, measurements, overrides);
  if (sourceId === 'invalid-value') {
    body.measurements = [{ id: `${sourceId}:invalid`, recordedAt: from, value: '__INVALID__' }];
    const serialized = JSON.stringify(body).replace('"__INVALID__"', '1e309');
    return new Response(serialized, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  return json(200, body);
}

export default { fetch: handleMeasurementSource };
