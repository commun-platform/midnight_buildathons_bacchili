import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This server deliberately has no Worker, Wallet, database, or proxy dependency.
const publicRoot = path.resolve(fileURLToPath(new URL('../../frontend/verification-portal/public/', import.meta.url)));
const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.LOCAL_DEMO_PORT || 8790);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Use a valid --port between 1 and 65535');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  const send = (status, text) => { response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(text); };
  try {
    if (!['GET', 'HEAD'].includes(request.method)) return send(405, 'Local demo is static; API and Wallet operations are disabled.\n');
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (url.origin !== `http://127.0.0.1:${port}` || ![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host)) return send(403, 'Only the local demo origin is allowed.\n');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      return response.end(JSON.stringify({ mode: 'local-demo', backend: false, wallet: false, host: '127.0.0.1' }));
    }
    if (/^\/(?:api|graphql|zk)(?:\/|$)/u.test(pathname)) return send(403, 'Backend and network endpoints are disabled in the local demo.\n');
    if (pathname.includes('\0') || pathname.split('/').some((part) => part.startsWith('.'))) return send(403, 'Path unavailable.\n');
    let file = path.resolve(publicRoot, `.${pathname}`);
    if (!file.startsWith(`${publicRoot}${path.sep}`) && file !== publicRoot) return send(403, 'Path unavailable.\n');
    const info = await stat(file);
    if (info.isDirectory()) file = path.join(file, 'index.html');
    const contentType = types[path.extname(file)];
    if (!contentType) return send(404, 'Asset unavailable.\n');
    const content = await stat(file);
    response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': content.size });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).pipe(response);
  } catch (error) {
    send(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 400, 'Local demo asset unavailable.\n');
  }
});
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Local GUI demo: http://127.0.0.1:${port}/?demo=1#/device\nStatic files only; Wallet, Worker, and outbound API access are disabled.\n`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
