import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleMeasurementSource } from './handler.mjs';

const from = '2026-08-29T15:00:00.000Z';
const to = '2026-08-30T15:00:00.000Z';

function request(sourceId, token = 'test-managed-source-token') {
  const url = new URL('https://source.test/v1/measurements');
  url.searchParams.set('sourceId', sourceId);
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  return new Request(url, { headers: { Authorization: `Bearer ${token}` } });
}

describe('deterministic measurement source', () => {
  it('returns a byte-stable 1,440-sample day', async () => {
    const first = await handleMeasurementSource(request('normal-1440'));
    const second = await handleMeasurementSource(request('normal-1440'));
    assert.equal(first.status, 200);
    assert.equal(await first.clone().text(), await second.text());
    const body = await first.json();
    assert.equal(body.measurements.length, 1440);
    assert.equal(body.from, from);
    assert.equal(body.to, to);
  });

  it('models missing and stopped hours without inventing samples', async () => {
    const missing = await (await handleMeasurementSource(request('missing-hour'))).json();
    const empty = await (await handleMeasurementSource(request('empty-day'))).json();
    assert.equal(missing.measurements.length, 1380);
    assert.equal(empty.measurements.length, 0);
  });

  it('requires the registered Bearer credential', async () => {
    const response = await handleMeasurementSource(request('normal-1440', 'wrong'));
    assert.equal(response.status, 401);
    assert.doesNotMatch(await response.text(), /test-managed-source-token/u);
  });

  it('provides deterministic HTTP failure scenarios', async () => {
    for (const [sourceId, status] of [
      ['unauthorized', 401], ['forbidden', 403], ['not-found', 404],
      ['rate-limited', 429], ['server-error', 503], ['redirect', 302],
    ]) {
      const response = await handleMeasurementSource(request(sourceId));
      assert.equal(response.status, status, sourceId);
    }
  });
});
