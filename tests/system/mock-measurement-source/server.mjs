import http from 'node:http';

import { handleMeasurementSource } from './handler.mjs';

const port = Number(process.env.MOCK_MEASUREMENT_SOURCE_PORT ?? 8791);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error('MOCK_MEASUREMENT_SOURCE_PORT must be a valid port');
}

const server = http.createServer((incoming, outgoing) => {
  const run = async () => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const request = new Request(`http://127.0.0.1:${port}${incoming.url ?? '/'}`, {
      method: incoming.method,
      headers: Object.fromEntries(Object.entries(incoming.headers).flatMap(([name, value]) => (
        value === undefined ? [] : [[name, Array.isArray(value) ? value.join(', ') : value]]
      ))),
      body: ['GET', 'HEAD'].includes(incoming.method ?? 'GET') ? undefined : Buffer.concat(chunks),
    });
    const response = await handleMeasurementSource(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  };
  void run().catch((error) => {
    outgoing.writeHead(500, { 'Content-Type': 'application/json' });
    outgoing.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Mock service failed' }));
  });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Deterministic measurement source listening on http://127.0.0.1:${port}\n`);
});
