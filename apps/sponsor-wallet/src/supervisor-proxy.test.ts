import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import {
  drainProxyRequest,
  proxyMethodHasRequestBody,
} from './supervisor-proxy.js';

test('does not wait for a request body before proxying GET or HEAD', () => {
  assert.equal(proxyMethodHasRequestBody('GET'), false);
  assert.equal(proxyMethodHasRequestBody('head'), false);
  assert.equal(proxyMethodHasRequestBody(undefined), false);
});

test('continues streaming mutation request bodies to the Wallet service', () => {
  assert.equal(proxyMethodHasRequestBody('POST'), true);
  assert.equal(proxyMethodHasRequestBody('PUT'), true);
});

test('drains a mutation request before the Supervisor sends an early response', async () => {
  const request = new PassThrough();
  const drained = drainProxyRequest(request);

  request.write('checkpoint-part-one');
  request.end('-part-two');

  await drained;
  assert.equal(request.readableEnded, true);
});

test('does not wait again after a mutation request has already ended', async () => {
  const request = new PassThrough();
  request.resume();
  request.end('checkpoint');
  await new Promise<void>((resolve) => request.once('end', resolve));

  await drainProxyRequest(request);
  assert.equal(request.readableEnded, true);
});
