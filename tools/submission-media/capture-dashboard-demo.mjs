import crypto from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import WebSocket from 'ws';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function executable(name, configured, fallback) {
  const candidate = configured?.trim() || fallback;
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return candidate;
  } catch {
    throw new Error(`${name} executable not found: ${candidate}`);
  }
}

function versionLine(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).split('\n')[0].trim();
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForFile(file, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for Chrome DevTools endpoint: ${file}`);
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    socket.on('message', (data) => {
      const message = JSON.parse(String(data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
    });
    socket.on('close', () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error('Chrome DevTools connection closed'));
      }
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

const proofJobId = flag('proof-job-id')?.trim() ?? '';
const transactionHash = flag('transaction-hash')?.trim().replace(/^0x/iu, '').toLowerCase() ?? '';
if (proofJobId && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(proofJobId)) {
  throw new Error('--proof-job-id must be a valid Proof Job ID');
}
if (transactionHash && !/^[a-f\d]{64}$/u.test(transactionHash)) {
  throw new Error('--transaction-hash must be 64 hexadecimal characters');
}
if ((proofJobId ? 1 : 0) + (transactionHash ? 1 : 0) !== 1) {
  throw new Error('Pass exactly one of --proof-job-id or --transaction-hash');
}

const language = flag('language')?.trim() || 'en';
if (!['en', 'ja'].includes(language)) throw new Error('--language must be en or ja');
const verificationIdentifier = transactionHash || proofJobId;

const baseUrl = new URL(
  flag('base-url')?.trim() || 'http://127.0.0.1:8787',
);
if (!['http:', 'https:'].includes(baseUrl.protocol)) {
  throw new Error('--base-url must use HTTP or HTTPS');
}
if (
  baseUrl.protocol !== 'https:'
  && !['127.0.0.1', 'localhost', '::1'].includes(baseUrl.hostname)
) throw new Error('--base-url requires HTTPS unless it uses a loopback host');

const outputDirectory = path.resolve(
  repoRoot,
  flag('output-dir') || path.join('.demo-output', `dashboard-${verificationIdentifier}`),
);
if (fs.existsSync(outputDirectory) && !hasFlag('overwrite')) {
  throw new Error(`Output already exists: ${outputDirectory}; pass --overwrite to replace it`);
}
if (fs.existsSync(outputDirectory)) fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });
const framesDirectory = path.join(outputDirectory, 'frames');
fs.mkdirSync(framesDirectory);

const chrome = executable('Chrome', process.env.CHROME_EXECUTABLE, '/usr/bin/google-chrome');
const ffmpeg = executable('FFmpeg', process.env.FFMPEG_EXECUTABLE, '/usr/bin/ffmpeg');
const chromeVersion = versionLine(chrome, ['--version']);
const ffmpegVersion = versionLine(ffmpeg, ['-version']);
const healthResponse = await fetch(new URL('/health', baseUrl), {
  headers: { Accept: 'application/json' },
  signal: AbortSignal.timeout(10_000),
});
if (!healthResponse.ok) throw new Error(`Dashboard health returned HTTP ${healthResponse.status}`);

const userDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vsp-dashboard-chrome-'));
const chromeProcess = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0',
  `--user-data-dir=${userDataDirectory}`,
  '--window-size=1440,900',
  'about:blank',
], { detached: process.platform !== 'win32', stdio: 'ignore' });

let cdp;
try {
  const activePortFile = path.join(userDataDirectory, 'DevToolsActivePort');
  await waitForFile(activePortFile);
  const [port] = fs.readFileSync(activePortFile, 'utf8').trim().split('\n');
  const targetResponse = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`,
    { method: 'PUT', signal: AbortSignal.timeout(10_000) },
  );
  if (!targetResponse.ok) throw new Error(`Could not create Chrome target: HTTP ${targetResponse.status}`);
  const target = await targetResponse.json();
  cdp = await CdpClient.connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('vsp-language', ${JSON.stringify(language)});`,
  });

  const evaluate = async (expression) => {
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error('Dashboard browser evaluation failed');
    return result.result?.value;
  };
  const waitFor = async (expression, timeoutMs = 20_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await sleep(150);
    }
    throw new Error(`Timed out waiting for dashboard state: ${expression}`);
  };
  const navigate = async (url) => {
    await cdp.send('Page.navigate', { url });
    await waitFor(`document.readyState === 'complete'`);
  };
  const capture = async (file) => {
    const screenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    fs.writeFileSync(file, screenshot.data, 'base64');
  };

  let frameNumber = 0;
  const framePath = () => path.join(framesDirectory, `frame-${String(frameNumber++).padStart(5, '0')}.png`);
  const hold = async (seconds) => {
    const still = path.join(framesDirectory, `.still-${frameNumber}.png`);
    await capture(still);
    for (let index = 0; index < seconds * 5; index += 1) {
      const destination = framePath();
      try {
        fs.linkSync(still, destination);
      } catch {
        fs.copyFileSync(still, destination);
      }
    }
    fs.unlinkSync(still);
  };
  const caption = (text) => evaluate(`(() => {
    let caption = document.querySelector('#vsp-demo-caption');
    if (!caption) {
      caption = document.createElement('div');
      caption.id = 'vsp-demo-caption';
      Object.assign(caption.style, {
        position: 'fixed', left: '50%', bottom: '42px', transform: 'translateX(-50%)',
        zIndex: '2147483647', maxWidth: '88vw', padding: '12px 22px',
        border: '2px solid white', background: 'rgba(0, 0, 80, 0.94)', color: 'white',
        font: 'bold 22px sans-serif', textAlign: 'center', boxShadow: '4px 4px 0 rgba(0,0,0,.45)'
      });
      document.body.append(caption);
    }
    caption.textContent = ${JSON.stringify(text)};
  })()`);
  const smoothScroll = async (targetExpression, steps = 12) => {
    const target = Number(await evaluate(targetExpression));
    const start = Number(await evaluate('window.scrollY'));
    for (let step = 1; step <= steps; step += 1) {
      const position = Math.round(start + ((target - start) * step) / steps);
      await evaluate(`window.scrollTo(0, ${position})`);
      await sleep(80);
      await capture(framePath());
    }
  };

  const verificationRoute = transactionHash
    ? `/#/verify-tx/${encodeURIComponent(transactionHash)}`
    : `/#/verify/${encodeURIComponent(proofJobId)}`;
  const verificationUrl = new URL(verificationRoute, baseUrl).toString();
  await navigate(verificationUrl);
  await waitFor(`location.hash.includes(${JSON.stringify(encodeURIComponent(verificationIdentifier))}) && document.querySelector('.check-list') && document.querySelector('.public-proof-pipeline') && document.querySelector('.raw-values-redacted')`, 90_000);
  await waitFor(`(document.querySelectorAll('.check-list .check-code:not(.waiting)').length === 4 && document.querySelectorAll('.public-proof-pipeline li.complete').length === 5) || document.querySelector('.dashboard-sync-state.failed')`, 90_000);
  await evaluate('window.scrollTo(0, 0)');
  await evaluate(`document.querySelector('#vsp-demo-caption')?.remove()`);
  await capture(path.join(outputDirectory, 'third-party-verification.png'));
  const verificationFailure = await evaluate(`document.querySelector('.dashboard-sync-state.failed')?.innerText || ''`);
  if (verificationFailure) throw new Error(`Third-party verification failed: ${verificationFailure}`);
  await caption(language === 'ja'
    ? '1. センサー値を開示せず、時間帯別結果とMidnight記録を検証'
    : '1. Verify the threshold result and Midnight record without revealing sensor values');
  await hold(5);

  await caption(language === 'ja'
    ? '2. 公開証拠と、第三者には非公開のセンサー値を確認'
    : '2. Review public evidence and the sensor values hidden from third parties');
  await smoothScroll(`Math.max(0, document.querySelector('.hourly-results-scroll').getBoundingClientRect().top + window.scrollY - 110)`);
  await hold(5);
  await evaluate(`document.querySelector('#vsp-demo-caption')?.remove()`);
  await capture(path.join(outputDirectory, 'third-party-hourly-results.png'));
  await smoothScroll(`Math.max(0, document.documentElement.scrollHeight - window.innerHeight)`);
  await hold(5);

  const resources = await evaluate(`performance.getEntriesByType('resource').map((entry) => entry.name)`);
  const d1BackedApiRequests = resources.filter((resource) => (
    new URL(resource).origin === baseUrl.origin
    && new URL(resource).pathname.startsWith('/api/')
  ));
  if (transactionHash && d1BackedApiRequests.length > 0) {
    throw new Error(`TX-hash verification unexpectedly used Worker API: ${d1BackedApiRequests.join(', ')}`);
  }
  if (transactionHash && !resources.some((resource) => (
    new URL(resource).hostname === 'indexer.preprod.midnight.network'
  ))) throw new Error('TX-hash verification did not contact the Midnight Preprod Indexer');

  const video = path.join(outputDirectory, `vsp-midnight-proof-verification-${language}.mp4`);
  const ffmpegResult = spawnSync(ffmpeg, [
    '-y',
    '-framerate', '5',
    '-i', path.join(framesDirectory, 'frame-%05d.png'),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    video,
  ], { encoding: 'utf8' });
  if (ffmpegResult.status !== 0) {
    throw new Error(ffmpegResult.stderr.trim() || `FFmpeg exited ${ffmpegResult.status}`);
  }
  const videoBytes = fs.statSync(video).size;
  const videoSha256 = crypto.createHash('sha256').update(fs.readFileSync(video)).digest('hex');
  const metadata = {
    createdAt: new Date().toISOString(),
    proofJobId: proofJobId || null,
    transactionHash: transactionHash || null,
    baseUrl: baseUrl.toString(),
    verificationUrl,
    language,
    resourceOrigins: [...new Set(resources.map((resource) => new URL(resource).origin))].sort(),
    d1BackedApiRequests,
    chromeVersion,
    ffmpegVersion,
    frameRate: 5,
    frameCount: frameNumber,
    video: {
      file: path.basename(video),
      bytes: videoBytes,
      sha256: videoSha256,
    },
  };
  fs.writeFileSync(
    path.join(outputDirectory, 'capture-metadata.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    { mode: 0o600 },
  );
  process.stdout.write(`${JSON.stringify({ ...metadata, outputDirectory }, null, 2)}\n`);
} finally {
  cdp?.close();
  const waitForChromeExit = async (timeoutMs) => {
    if (chromeProcess.exitCode !== null || chromeProcess.signalCode !== null) return;
    await Promise.race([
      new Promise((resolve) => chromeProcess.once('exit', resolve)),
      sleep(timeoutMs),
    ]);
  };
  const signalChrome = (signal) => {
    try {
      if (process.platform === 'win32') chromeProcess.kill(signal);
      else process.kill(-chromeProcess.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  if (chromeProcess.exitCode === null && chromeProcess.signalCode === null) {
    signalChrome('SIGTERM');
    await waitForChromeExit(2_000);
  }
  if (chromeProcess.exitCode === null && chromeProcess.signalCode === null) {
    signalChrome('SIGKILL');
    await waitForChromeExit(2_000);
  }
  await sleep(250);
  fs.rmSync(userDataDirectory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
