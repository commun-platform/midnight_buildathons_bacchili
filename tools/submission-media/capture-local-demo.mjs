import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const baseUrl = new URL(flag('base-url', 'http://127.0.0.1:8790'));
if (baseUrl.protocol !== 'http:' || baseUrl.hostname !== '127.0.0.1') throw new Error('Capture accepts only http://127.0.0.1 loopback URLs');
const output = path.resolve(repoRoot, flag('output-dir', '.demo-output/local-demo-20260911'));
const frames = path.join(output, 'frames');
const raw = path.join(output, 'raw');
const inspectOnly = process.argv.includes('--inspect');
const validateOnly = process.argv.includes('--validate-only');
const language = flag('language', 'ja');
if (!['en', 'ja'].includes(language)) throw new Error('--language must be en or ja');
const translationFile = path.join(repoRoot, 'tools/submission-media/local-demo-ui-en.json');
const localizationFile = path.join(repoRoot, 'tools/submission-media/localize-demo-recording.js');
const filmingLocalization = language === 'en' ? JSON.parse(fs.readFileSync(translationFile, 'utf8')) : null;
const onlyScene = flag('scene', '');
const resume = process.argv.includes('--resume');
let replaying = false;
const chrome = process.env.CHROME_EXECUTABLE || '/usr/bin/google-chrome';
const ffmpeg = process.env.FFMPEG_EXECUTABLE || '/usr/bin/ffmpeg';
for (const directory of [output, frames, raw]) fs.mkdirSync(directory, { recursive: true });
const evidence = {
  createdAt: new Date().toISOString(), validateOnly,
  mode: 'local synthetic GUI demonstration; no ledger submission or verification',
  command: `node tools/submission-media/capture-local-demo.mjs ${process.argv.slice(2).join(' ')}`.trim(),
  baseUrl: baseUrl.origin, width: 1920, height: 1080, fps: 24, targetCaptureFps: 12, language,
  chrome: execFileSync(chrome, ['--version'], { encoding: 'utf8' }).trim(),
  ffmpeg: execFileSync(ffmpeg, ['-version'], { encoding: 'utf8' }).split('\n')[0],
  scenes: [], checks: [], networkRequests: [], blockedRequests: [], pageErrors: [], consoleErrors: [],
  ...(filmingLocalization ? { filmingTextLocalization: { dictionary: path.relative(repoRoot, translationFile), dictionarySha256: createHash('sha256').update(fs.readFileSync(translationFile)).digest('hex'), scriptSha256: createHash('sha256').update(fs.readFileSync(localizationFile)).digest('hex'), purpose: 'English text for filming; actual GUI controls, state and results are preserved.' } } : {}),
};
if (resume) {
  const previous = JSON.parse(fs.readFileSync(path.join(output,'capture-evidence.json'),'utf8'));
  if(previous.language!==language || previous.validateOnly) throw new Error('Resume requires a matching-language recording manifest');
  if (JSON.stringify(previous.filmingTextLocalization) !== JSON.stringify(evidence.filmingTextLocalization)) throw new Error('Filming text changed; use a new output directory for a fresh recording');
  if(previous.completedAt && !previous.failure)throw new Error('This capture is already complete; use a new output directory for another recording');
  const attemptFile=`capture-attempt-${(previous.captureAttempts?.length||0)+1}.json`;
  for(const scene of previous.scenes) {
    for(const [file,expected] of [[scene.file,scene.sha256],[scene.screenshot,scene.screenshotSha256]]) {
      const actual=createHash('sha256').update(fs.readFileSync(path.join(output,file))).digest('hex');
      if(actual!==expected)throw new Error(`Resume artifact hash mismatch: ${file}`);
    }
    scene.targetCaptureFps ||= previous.targetCaptureFps;
    scene.recordingSessionStartedAt ||= previous.createdAt;
    scene.screenshotCapturedAt ||= fs.statSync(path.join(output,scene.screenshot)).mtime.toISOString();
    scene.encodedAt ||= fs.statSync(path.join(output,scene.file)).mtime.toISOString();
    scene.resumedFrom ||= attemptFile;
  }
  const reason=flag('resume-reason',previous.failure || 'Interrupted recording; preserving completed scene artifacts');
  fs.writeFileSync(path.join(output,attemptFile),JSON.stringify({...previous,interruptionReason:reason},null,2)+'\n');
  evidence.captureAttempts=[...(previous.captureAttempts||[]),{startedAt:previous.createdAt,result:'recorder_interrupted',reason,evidenceFile:attemptFile,preservedScenes:previous.scenes.map(scene=>scene.name)}];
  evidence.scenes=previous.scenes;
  evidence.networkRequests=previous.networkRequests;
  evidence.blockedRequests=previous.blockedRequests;
  evidence.pageErrors=previous.pageErrors;
  evidence.consoleErrors=previous.consoleErrors;
  evidence.checks=previous.checks;
  evidence.resumedFrom=attemptFile;
}
const health = await fetch(new URL('/health', baseUrl)).then((response) => response.json());
if (health.mode !== 'local-demo' || health.backend !== false || health.wallet !== false) throw new Error('Capture requires the dedicated static local demo server');
evidence.server = health;
for (const [endpoint, method] of [['/api/demo-isolation-check', 'GET'], ['/api/demo-isolation-check', 'POST']]) {
  const response = await fetch(new URL(endpoint, baseUrl), { method });
  if (![403, 405].includes(response.status)) throw new Error(`Server failed API isolation: ${method} ${endpoint}`);
  evidence.checks.push({ name: `server rejects ${method} API access`, passed: true, status: response.status });
}

class Cdp {
  constructor(socket) {
    this.socket = socket; this.sequence = 0; this.pending = new Map(); this.listeners = new Map();
    socket.on('message', (data) => {
      const message = JSON.parse(String(data));
      if (!message.id) { for (const callback of this.listeners.get(message.method) || []) callback(message.params); return; }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result || {});
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    return new Cdp(socket);
  }
  on(method, callback) { const listeners = this.listeners.get(method) || []; listeners.push(callback); this.listeners.set(method, listeners); }
  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20_000);
      this.pending.set(id, { resolve, reject, timeout }); this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bacchiri-local-demo-'));
const chromeProcess = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
  '--disable-features=Translate,MediaRouter', '--hide-scrollbars', '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1920,1080', 'about:blank',
], { detached: true, stdio: 'ignore' });
let cdp;
let activeCapture;
const cursorScript = `(() => {
  const install = () => {
    if (document.getElementById('capture-cursor')) return;
    document.body.style.zoom = '1.25';
    const cursor = document.createElement('div'); cursor.id = 'capture-cursor';
    Object.assign(cursor.style, { zoom:'0.8',position:'fixed',left:'56px',top:'210px',width:'24px',height:'24px',border:'3px solid #ffbd42',background:'rgba(255,189,66,.22)',borderRadius:'50%',pointerEvents:'none',zIndex:'2147483647',boxShadow:'0 0 0 5px rgba(255,189,66,.10)',transform:'translate(-50%,-50%)' });
    document.body.append(cursor);
    document.addEventListener('mousemove', (event) => {cursor.style.left=event.clientX+'px';cursor.style.top=event.clientY+'px';});
    document.addEventListener('mousedown', () => {cursor.style.background='rgba(255,189,66,.85)';cursor.style.transform='translate(-50%,-50%) scale(1.3)';});
    document.addEventListener('mouseup', () => {cursor.style.background='rgba(255,189,66,.22)';cursor.style.transform='translate(-50%,-50%)';});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();`;
try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; !fs.existsSync(portFile) && i < 150; i++) await sleep(100);
  if (!fs.existsSync(portFile)) throw new Error('Chrome failed to start');
  const [port] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json());
  cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  cdp.on('Network.requestWillBeSent', ({ request, type }) => evidence.networkRequests.push({ url: request.url, method: request.method, type }));
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => evidence.pageErrors.push(exceptionDetails.exception?.description || exceptionDetails.text));
  cdp.on('Runtime.consoleAPICalled', ({ type, args }) => { if (type === 'error') evidence.consoleErrors.push(args.map((item) => item.value || item.description).join(' ')); });
  cdp.on('Fetch.requestPaused', (event) => {
    const url = new URL(event.request.url);
    if (url.origin === baseUrl.origin && !/^\/(?:api|graphql|zk)(?:\/|$)/u.test(url.pathname)) {
      void cdp.send('Fetch.continueRequest', { requestId: event.requestId });
    } else {
      evidence.blockedRequests.push({ url: event.request.url, method: event.request.method });
      void cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
    }
  });
  for (const method of ['Page.enable', 'Runtime.enable', 'Network.enable']) await cdp.send(method);
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('vsp-language', ${JSON.stringify(language)}); localStorage.setItem('bacchiri-local-demo-v1:preference:vsp-language',${JSON.stringify(language)}); ${cursorScript}` });
  if (filmingLocalization) await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `globalThis.__bacchiriFilmingTranslations=${JSON.stringify(filmingLocalization)};\n${fs.readFileSync(localizationFile, 'utf8')}` });
  const evaluate = async (expression) => {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const waitFor = async (expression, ms = 25_000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) { if (await evaluate(`Boolean(${expression})`)) return; await sleep(120); }
    throw new Error(`Timed out waiting for ${expression}`);
  };
  const check = async (name, expression) => {
    const actual = await evaluate(expression);
    evidence.checks.push({ name, passed: Boolean(actual), actual });
    if (!actual) throw new Error(`GUI check failed: ${name}`);
  };
  let screenshotPaused=false;
  let screenshotQueue=Promise.resolve();
  const takeScreenshot = (params) => {
    const result=screenshotQueue.then(()=>cdp.send('Page.captureScreenshot',params));
    screenshotQueue=result.catch(()=>{});
    return result;
  };
  const navigate = async (route) => {
    screenshotPaused=true;
    await screenshotQueue;
    try {
    await cdp.send('Page.navigate', { url: new URL(route, baseUrl).href });
    await waitFor(`document.readyState === 'complete' && document.body.innerText.includes('LOCAL DEMO')`);
    await sleep(450);
    } finally { screenshotPaused=false; }
  };
  const screenshot = async (name) => {
    if(replaying)return;
    const { data } = await takeScreenshot( { format: 'png', fromSurface: true, captureBeyondViewport: false });
    fs.writeFileSync(path.join(frames, `${name}.png`), data, 'base64');
  };
  const scroll = async (y) => {
    if(validateOnly||replaying){await evaluate(`window.scrollTo(0,${y})`);return;}
    const start = await evaluate('window.scrollY');
    for (let i = 1; i <= 24; i++) {
      const t = i / 24; const ease = t < .5 ? 2*t*t : 1 - ((-2*t+2)**2)/2;
      await evaluate(`window.scrollTo(0, ${Math.round(start + (y - start) * ease)})`); await sleep(40);
    }
  };
  const reveal = async (selector) => {
    const rect = await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw new Error(${JSON.stringify('Missing '+selector)});const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,scroll:window.scrollY};})()`);
    if (rect.top < 150 || rect.bottom > 980) await scroll(Math.max(0, rect.scroll + rect.top - 230));
  };
  let pointer = { x: 56, y: 210 };
  const move = async (x, y) => {
    if(validateOnly||replaying){await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});pointer={x,y};return;}
    const start = pointer;
    for (let i = 1; i <= 15; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x + (x - start.x) * i/15, y: start.y + (y - start.y) * i/15 }); await sleep(18); }
    pointer = { x, y };
  };
  const click = async (selector) => {
    await waitFor(`document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`);
    await reveal(selector);
    const { x, y } = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await move(x,y); await sleep(validateOnly||replaying?10:180);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await sleep(validateOnly||replaying?10:130);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(validateOnly||replaying?100:350);
  };
  const type = async (selector, value) => {
    await click(selector);
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: 2, commands: ['selectAll'] });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: 2 });
    await cdp.send('Input.insertText', { text: value }); await sleep(350);
    if (await evaluate(`document.querySelector(${JSON.stringify(selector)}).value`) !== value) throw new Error(`Input did not accept exact value for ${selector}`);
  };
  const select = async (selector, value) => {
    await reveal(selector);
    await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`); await sleep(450);
  };
  const record = async (name, action, minSeconds = 19) => {
    if(resume && evidence.scenes.some(scene=>scene.name===name)) {
      process.stdout.write(`Replaying ${name}; preserving original video and screenshot\n`);
      replaying=true;try{await action(false);}finally{replaying=false;}return;
    }
    if (validateOnly || (onlyScene && onlyScene !== name)) { process.stdout.write(`Validating ${name}\n`); await action(false); return; }
    process.stdout.write(`Recording ${name}\n`);
    const directory = path.join(output, '.capture-frames', name);
    fs.mkdirSync(directory, { recursive: true });
    const captured = []; const started = Date.now(); let running = true; let recordingError;
    const loop = (async () => {
      while (running) {
        if(screenshotPaused){await sleep(50);continue;}
        const tick = Date.now();
        const { data } = await takeScreenshot({ format: 'jpeg', quality: 90, fromSurface: true, captureBeyondViewport: false });
        const file = path.join(directory, `${String(captured.length).padStart(5,'0')}.jpg`);
        fs.writeFileSync(file, data, 'base64'); captured.push({ file, timestamp: Date.now() });
        await sleep(Math.max(1, 84 - (Date.now()-tick)));
      }
    })().catch(error=>{recordingError=error;running=false;});
    activeCapture = () => { running = false; };
    try { await action(true); await sleep(Math.max(1000, minSeconds*1000-(Date.now()-started))); }
    finally { running = false; await loop; activeCapture = undefined; }
    if(recordingError)throw recordingError;
    const ended = Date.now();
    const list = captured.map((item, index) => `file '${path.basename(item.file)}'\nduration ${((captured[index+1]?.timestamp || ended)-item.timestamp)/1000}`).join('\n') + `\nfile '${path.basename(captured.at(-1).file)}'\n`;
    fs.writeFileSync(path.join(directory,'frames.txt'), list);
    const video = path.join(raw, `${name}.mp4`);
    await new Promise((resolve, reject) => {
      const process = spawn(ffmpeg, ['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',path.join(directory,'frames.txt'),'-vf','fps=24','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',video], { stdio:['ignore','ignore','pipe'] });
      let error=''; process.stderr.on('data',(data)=>{error+=data;}); process.on('error',reject);process.on('exit',(code)=>code===0?resolve():reject(new Error(error)));
    });
    const sha256 = createHash('sha256').update(fs.readFileSync(video)).digest('hex');
    const screenshotSha256=createHash('sha256').update(fs.readFileSync(path.join(frames, `${name}.png`))).digest('hex');
    evidence.scenes.push({ name, targetCaptureFps:evidence.targetCaptureFps,captureStartedAt:new Date(started).toISOString(),captureEndedAt:new Date(ended).toISOString(),recordingSessionStartedAt:evidence.createdAt,screenshotSha256, file: path.relative(output, video), screenshot: `frames/${name}.png`, seconds: (ended-started)/1000, capturedFrames: captured.length, sha256 });
    fs.rmSync(directory,{recursive:true,force:true});
    fs.writeFileSync(path.join(output,'capture-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  };

  await navigate('/?demo=1#/device');
  if (inspectOnly) {
    await screenshot('inspect');
    process.stdout.write(JSON.stringify(await evaluate(`({text:document.body.innerText,controls:[...document.querySelectorAll('button,input,select')].map(el=>({tag:el.tagName,id:el.id,name:el.name,value:el.value,text:el.innerText,disabled:el.disabled}))})`),null,2)+'\n');
  } else {
    // Capture scenarios are below. Each state is reached through visible UI controls.
    await runScenes({ evaluate, waitFor, check, navigate, screenshot, scroll, reveal, click, type, select, record, sleep:(ms)=>sleep(replaying?Math.min(ms,100):ms) });
    await check('no wallet extension installed', `!window.midnight`);
    if (evidence.blockedRequests.length) throw new Error('The GUI attempted blocked network access');
    if (evidence.pageErrors.length || evidence.consoleErrors.length) throw new Error('The GUI emitted a browser error');
    const networkIsolationPassed=evidence.networkRequests.every(({url,type})=>url.startsWith('data:image/')&&type==='Image'||new URL(url).origin===baseUrl.origin&&!new URL(url).pathname.startsWith('/api/'));
    evidence.checks.push({name:'all network requests are loopback static assets; date-control data images stay inline; no API, Indexer, or Wallet calls',passed:networkIsolationPassed,actual:{inlineImages:evidence.networkRequests.filter(({url})=>url.startsWith('data:image/')).length}});
    if(!networkIsolationPassed)throw new Error('A resource request violates local demo network isolation');
    if (validateOnly) evidence.validatedAt = new Date().toISOString();
    else evidence.completedAt = new Date().toISOString();
    process.stdout.write(JSON.stringify({ output, validateOnly, checks: evidence.checks.length, scenes: evidence.scenes.map(scene=>scene.name), pageErrors:evidence.pageErrors.length,blockedRequests:evidence.blockedRequests.length })+'\n');
  }
} catch(error) {
  evidence.failure = error.stack; process.exitCode=1; process.stderr.write(`${error.stack}\n`);
  if(cdp) { try { const {data}=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true});fs.writeFileSync(path.join(frames,'failure.png'),data,'base64');const result=await cdp.send('Runtime.evaluate',{expression:'document.body.innerText',returnByValue:true});evidence.failurePageText=result.result?.value; } catch {} }
} finally {
  activeCapture?.();
  fs.writeFileSync(path.join(output,inspectOnly?'inspect-evidence.json':validateOnly?'validation-evidence.json':'capture-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  if(cdp) { try {await cdp.send('Browser.close');} catch {} cdp.socket.close(); }
  await sleep(500);
  try {process.kill(-chromeProcess.pid,'SIGTERM');} catch {}
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}


async function runScenes({ evaluate, waitFor, check, navigate, screenshot, scroll, reveal, click, type, select, record, sleep }) {
  const state = "JSON.parse(localStorage.getItem('bacchiri-local-demo-v1:state'))";
  const selected = `${state}.selectedProjectId`;
  const date = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
  const day = date(2);
  const position = async (selector, offset = 160) => scroll(await evaluate(`Math.max(0,document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().top+window.scrollY-${offset})`));
  await waitFor(`document.querySelector('#device-project-select') && !document.querySelector('#device-project-add').disabled`);
  await check('prepared connected Wallet account is displayed', `document.querySelector('#wallet-connect-button').disabled && document.querySelector('#wallet-connect-button').innerText.includes('Wallet /') && document.querySelector('#wallet-connect-button').innerText.includes('DEMO-ACCOUNT') && !document.querySelector('.wallet-gate')`);
  await check('demo flags reject ordinary and remote URLs', `import('/demo-mode.js').then(({isLocalDemo})=>!isLocalDemo(new URL('https://example.com/?demo=1'))&&!isLocalDemo(new URL('http://127.0.0.1:8790/')))`);
  await evaluate(`localStorage.setItem('vsp-device-id','CAPTURE-ISOLATION-SENTINEL');localStorage.setItem('vsp-wallet-key','CAPTURE-ISOLATION-SENTINEL')`);

  await record('device', async () => {
    await click('#device-project-add');
    await type('#device-project-name', 'Cold chain pilot');
    await select('#device-project-time-zone', '540');
    await click('#device-project-create-form button[type="submit"]');
    await waitFor(`document.querySelector('#device-policy-list .data-state-empty')`);
    await check('new Project has its own Device ID and empty Policy state', `${state}.projects.length===2 && document.querySelector('#device-id-input').value!=='demo-device-demo-cold-chain' && Boolean(document.querySelector('#device-policy-list .data-state-empty'))`);
    await click('#device-policy-add');
    await type('#device-policy-name', 'Cold storage 2–8 °C');
    await type('#device-policy-minimum', '2');
    await type('#device-policy-maximum', '8');
    await click('#device-policy-create-form button[type="submit"]');
    await sleep(550);
    await click('#device-policy-refresh');
    await waitFor(`document.querySelector('#device-policy').options.length===1`);
    await check('new Policy preserves exact 2–8 degree bounds', `${state}.policies.find(policy=>policy.projectId===${selected}).minimum===2 && ${state}.policies.find(policy=>policy.projectId===${selected}).maximum===8`);
    await click('#device-identity-create');
    await click('#device-register');
    await waitFor(`${state}.devices[${selected}]?.provisioned`);
    await sleep(350);
    await position('#device-stepper-content', 150);
    await check('Device identity and immutable Policy assignment registered in demo', `document.querySelector('#device-policy').disabled && document.querySelector('#device-identity-create').disabled && !document.querySelector('#device-capture').disabled`);
    await screenshot('device');
  }, 22);

  await record('day', async () => {
    await select('#device-period-date', day);
    await select('#device-generation-mode', 'within-threshold');
    await click('#device-capture');
    await waitFor(`document.querySelector('#device-sensor-summary').innerText.includes('1440')`);
    await check('one completed day contains 1440 generated readings and 24 ordered hours', `${state}.captures[${selected}+':${day}'].records.length===1440 && ${state}.captures[${selected}+':${day}'].windows.length===24`);
    await position('#device-generation-mode', 190);
    await screenshot('day');
    await sleep(2500);
    await click('#nav-admin');
    await waitFor(`document.querySelector('#admin-day-select')`);
    await check('Administrator renders all 24 hourly rows', `document.querySelectorAll('.daily-hourly-table tbody tr').length===24 || [...document.querySelectorAll('table')].some(table=>table.querySelectorAll('tbody tr').length===24)`);
    await position('#admin-day-select', 185);
    await screenshot('administrator');
    await sleep(2000);
    await click('#nav-device');
    await waitFor(`document.querySelector('#device-submit')`);
    await position('#device-sensor-summary', 180);
  }, 19);

  await record('request', async () => {
    await position('#device-submit', 240);
    await sleep(1200);
    await click('#device-submit');
    await waitFor(`${state}.jobs.length>0`);
    await screenshot('request');
    await check('Proof request uses a stable demo Job ID', `${state}.jobs[0].proofJobId.startsWith('demo-proof-')`);
    await waitFor(`${state}.jobs[0].status==='confirmed'`, 20_000);
    await sleep(600);
  }, 19);

  const job = await evaluate(`${state}.jobs.find(job=>job.projectId===${selected}&&job.periodDate==='${day}')`);
  if(!resume && !validateOnly) {
    const identity=await evaluate(`({projectId:${selected},deviceId:${state}.devices[${selected}].device.deviceId,policy:${state}.policies.find(policy=>policy.projectId===${selected})})`);
    fs.writeFileSync(path.join(output,'original-capture-identity.json'),JSON.stringify({...identity,job},null,2)+'\n');
  }
  if(resume) {
    const original=JSON.parse(fs.readFileSync(path.join(output,'original-capture-identity.json'),'utf8'));
    const current=await evaluate(`({projectId:${selected},deviceId:${state}.devices[${selected}].device.deviceId,policy:${state}.policies.find(policy=>policy.projectId===${selected})})`);
    const keys=['policyId','name','mode','minimum','maximum'];
    const matches=current.projectId===original.projectId&&current.deviceId===original.deviceId&&keys.every(key=>current.policy[key]===original.policy[key])&&['proofJobId','periodDate','transactionHash'].every(key=>job[key]===original.job[key]);
    evidence.checks.push({name:'resumed GUI reproduces the original Device, day, Policy bounds, Job and synthetic TX hash',passed:matches,actual:{projectId:current.projectId,deviceId:current.deviceId,policyId:current.policy.policyId,minimum:current.policy.minimum,maximum:current.policy.maximum,proofJobId:job.proofJobId,periodDate:job.periodDate,transactionHash:job.transactionHash}});
    if(!matches)throw new Error('Resumed demo identity differs from preserved footage');
  }
  await record('confirmed', async () => {
    await position('#device-proof-summary', 210);
    await waitFor(`document.querySelector('#device-proof-summary .status-confirmed') && document.querySelector('#device-chain-details .transaction-id').innerText.includes('DEMO-TX-')`);
    await check('same Job reaches simulated confirmation and a marked synthetic TX', `Boolean(document.querySelector('#device-proof-summary .status-confirmed')) && document.querySelector('#device-chain-details .transaction-id').innerText.includes('DEMO-TX-') && ${state}.jobs.find(job=>job.proofJobId==='${job.proofJobId}').status==='confirmed'`);
    await screenshot('confirmed');
    await sleep(3000);
    await navigate('/?demo=1#/device');
    await waitFor(`document.querySelector('#device-proof-summary .status-confirmed')`);
    await position('#device-proof-summary', 210);
    await check('refresh preserves the selected day and confirmed Job without a Wallet', `${state}.jobs.find(job=>job.proofJobId==='${job.proofJobId}').status==='confirmed' && document.querySelector('#device-chain-details .transaction-id').innerText.includes('DEMO-TX-')`);
    await screenshot('confirmed');
  }, 20);

  await record('verify', async () => {
    await click('#nav-verify');
    await waitFor(`document.querySelector('#transaction-hash-input')`);
    await type('#transaction-hash-input', '0'.repeat(64));
    await click('#transaction-hash-form button[type="submit"]');
    await waitFor(`document.querySelector('.error-window')?.innerText.includes('unknown transaction')`);
    await check('unknown synthetic transaction is rejected in the public lookup', `document.querySelector('.error-window').innerText.includes('unknown transaction')`);
    await screenshot('unknown-transaction');
    await click('#nav-verify');
    await waitFor(`document.querySelector('#transaction-hash-input')`);
    await type('#transaction-hash-input', job.transactionHash);
    await click('#transaction-hash-form button[type="submit"]');
    await waitFor(`document.querySelector('.raw-values-redacted') && document.querySelectorAll('.public-proof-pipeline li.complete').length===5`);
    await check('public verifier displays 24 results and keeps private values hidden', `document.querySelectorAll('.hourly-results-scroll tbody tr').length===24 && Boolean(document.querySelector('.raw-values-redacted')) && !document.querySelector('.hourly-results-scroll').innerText.includes('Minimum')`);
    await scroll(0);
    await screenshot('verify');
    await sleep(3000);
    await position('.hourly-results-scroll', 180);
    await sleep(2500);
  }, 22);

  await record('scenarios', async () => {
    await click('#nav-device');
    await waitFor(`document.querySelector('#device-generation-mode')`);
    await select('#device-period-date', date(3));
    await select('#device-generation-mode', 'with-outliers');
    await click('#device-capture');
    await waitFor(`document.querySelector('#device-sensor-summary').innerText.includes('180')`);
    await check('OUTSIDE scenario preserves 180 outliers in three hourly slots', `${state}.captures[${selected}+':${date(3)}'].outlierCount===180 && ${state}.captures[${selected}+':${date(3)}'].attestation.publicData.hourResults.filter(value=>value==='outside-threshold').length===3`);
    await position('#device-generation-mode', 180);
    await screenshot('outside');
    await sleep(2000);
    await select('#device-period-date', date(4));
    await select('#device-generation-mode', 'missing-hours');
    await click('#device-capture');
    await waitFor(`document.querySelector('#device-sensor-summary').innerText.includes('1080')`);
    await check('missing hours preserve 18 observed and 6 NO DATA slots', `${state}.captures[${selected}+':${date(4)}'].records.length===1080 && ${state}.captures[${selected}+':${date(4)}'].attestation.publicData.stoppedHourCount===6`);
    await click('#device-submit');
    await waitFor(`document.querySelector('#device-proof-summary .status-confirmed')`);
    const missingJob = await evaluate(`${state}.jobs.find(job=>job.projectId===${selected}&&job.periodDate==='${date(4)}')`);
    await click(`a[href='#/verify/${missingJob.proofJobId}']`);
    await waitFor(`document.querySelectorAll('.hour-result.no-data').length===6`);
    await check('Public verifier explicitly renders six missing hours as NO DATA', `document.querySelectorAll('.hour-result.no-data').length===6 && document.querySelectorAll('.hourly-results-scroll tbody tr').length===24`);
    await position('.hourly-results-scroll tbody tr:nth-child(11)', 175);
    await screenshot('scenarios');
    await sleep(2000);
  }, 23);

  // The all-empty case is also exercised through the same visible generator.
  await click('#nav-device');
  await select('#device-period-date', date(5));
  await select('#device-generation-mode', 'no-data');
  await click('#device-capture');
  await check('empty day stays 24 NO DATA slots with zero invented samples', `${state}.captures[${selected}+':${date(5)}'].records.length===0 && ${state}.captures[${selected}+':${date(5)}'].attestation.publicData.hourResults.every(value=>value==='no-data')`);
  await screenshot('no-data');

  await record('managed', async () => {
    await navigate('/managed-proof/?demo=1');
    await waitFor(`document.querySelector('#project-select').options.length>0`);
    const projectId = await evaluate(selected);
    await select('#project-select', projectId);
    await type('#source-form input[name="sourceId"]', 'cold-chain-api-demo');
    await type('#source-form input[name="name"]', 'Cold chain cloud API');
    await type('#source-form input[name="sourceSensorId"]', 'normal-1440');
    await select('#first-period-date', date(6));
    await click('#source-form button[type="submit"]');
    await waitFor(`document.querySelector('#run-list .inspect')`);
    await click('#run-list .inspect');
    await waitFor(`document.querySelector('#detail-status').innerText.includes('CONFIRMED')`, 15_000);
    await check('Managed API registration and first fetch reach synthetic confirmation', `${state}.sources.length===1 && ${state}.runs[0].status==='confirmed' && document.querySelectorAll('#hour-list tr').length===24`);
    await check('Managed endpoint and credential are neither persisted nor transmitted', `!JSON.stringify(${state}).includes('bearerToken') && !JSON.stringify(${state}).includes('endpointUrl')`);
    await position('#evidence', 135);
    await screenshot('managed');
    await sleep(2500);
  }, 22);

  // Exercise the existing fetch-a-day action as well as registration-triggered fetch.
  await select('#run-period-date', date(7));
  await click('#run-form button[type="submit"]');
  await waitFor(`${state}.runs.length===2`);
  await sleep(4200);
  await click('#refresh');
  await check('Managed fetch-a-day creates and confirms a second distinct run', `${state}.runs.length===2 && ${state}.runs.every(run=>run.status==='confirmed')`);

  // Rejection and retry remain a real UI sequence and are retained as an extra clip.
  await record('recovery', async () => {
    await type('#source-form input[name="sourceId"]', 'retry-api-demo');
    await type('#source-form input[name="name"]', 'Recovery demonstration');
    await type('#source-form input[name="sourceSensorId"]', 'fail-once');
    await select('#first-period-date', date(8));
    await click('#source-form button[type="submit"]');
    await waitFor(`document.querySelector('#run-list .inspect[data-source="retry-api-demo"]')`);
    await click('#run-list .inspect[data-source="retry-api-demo"]');
    await waitFor(`document.querySelector('#retry-run')`, 15_000);
    await position('#error-card', 280);
    await screenshot('rejection');
    await check('simulated fetch failure exposes an explicit retry action', `document.querySelector('#error-card').innerText.includes('SIMULATED source timeout') && !document.querySelector('#error-card').classList.contains('hidden')`);
    await sleep(2200);
    const runId = await evaluate(`${state}.runs.find(run=>run.sourceId==='retry-api-demo').runId`);
    await click('#retry-run');
    await waitFor(`document.querySelector('#detail-status').innerText.includes('CONFIRMED')`, 15_000);
    await check('retry confirms the same failed Run without duplicating it', `${state}.runs.filter(run=>run.sourceId==='retry-api-demo').length===1 && ${state}.runs.find(run=>run.sourceId==='retry-api-demo').runId==='${runId}' && ${state}.runs.find(run=>run.sourceId==='retry-api-demo').status==='confirmed'`);
    await position('#evidence', 135);
    await screenshot('recovery');
  }, 23);

  await record('operations', async () => {
    await navigate('/system-operations/?demo=1');
    await waitFor(`!document.querySelector('#summary-cards').hasAttribute('aria-busy') && document.querySelector('#summary-cards').children.length>0`);
    await check('Operations renders synthetic system health and a simulated idle sponsor Wallet', `document.querySelector('#operator-name').innerText.includes('DEMO') && document.querySelector('#wallet-panel').innerText.length>30 && document.querySelectorAll('#events-table tr').length>0`);
    await screenshot('operations');
    await sleep(3500);
    await select('#metrics-days', '7');
    await position('#metrics-chart', 170);
    await sleep(1800);
    await position('#event-filters', 175);
    await type('#event-query', 'retried');
    await click('#event-filters button[type="submit"]');
    await waitFor(`document.querySelector('#events-table').innerText.includes('simulated_run_retried')`);
    await check('Operations filters the redacted audit trail by the recovery action', `document.querySelector('#events-table').innerText.includes('simulated_run_retried')`);
    await click('#events-table button');
    await waitFor(`document.querySelector('#event-detail').innerText.includes('simulated_run_retried')`);
    await screenshot('operations-audit');
    await sleep(2500);
  }, 23);

  await click('#dialog-close');
  await click('#demo-reset');
  await waitFor(`document.querySelector('#device-id-input')?.value==='demo-device-demo-cold-chain' && document.querySelector('#device-register')?.disabled`);
  await check('Reset demo button returns to a clean wallet-free Device workflow', `${state}.projects.length===1 && ${state}.jobs.length===0 && Object.keys(${state}.devices).length===0 && !window.midnight && !document.querySelector('.wallet-gate')`);
  await screenshot('reset');
  await check('demo state leaves ordinary application identity storage unchanged', `localStorage.getItem('vsp-device-id')==='CAPTURE-ISOLATION-SENTINEL' && localStorage.getItem('vsp-wallet-key')==='CAPTURE-ISOLATION-SENTINEL'`);
  await evaluate(`localStorage.removeItem('vsp-device-id');localStorage.removeItem('vsp-wallet-key')`);
}
