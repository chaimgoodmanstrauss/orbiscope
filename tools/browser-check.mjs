// Headless-Chrome check for Orbiscope (no dependencies; Chrome DevTools Protocol).
// Usage: node tools/browser-check.mjs <url> [script.json]
//   script.json: [{ "eval": "js expression" } | { "shot": "file.png" } | { "wait": ms }
//                 | { "mouse": [type, x, y, opts] } | { "key": "..." } | { "size": [w, h] }]
// Prints console messages, exceptions and every eval result; exits 1 on any page error.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = process.argv[2];
const steps = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : [{ wait: 1500 }];
const port = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'orbi-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
  '--use-angle=metal', '--enable-unsafe-swiftshader', '--window-size=1400,900', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); let errors = 0;
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const pg = list.find(t => t.type === 'page');
      if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r); return; }
    } catch {}
    await sleep(150);
  }
  throw new Error('no chrome');
}
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

try {
  await connect();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      const t = m.params.type, txt = m.params.args.map(a => a.value ?? a.description ?? '').join(' ');
      if (t === 'error') errors++;
      console.log(`[console.${t}] ${txt}`);
    }
    if (m.method === 'Runtime.exceptionThrown') { errors++; const d = m.params.exceptionDetails; console.log('[exception]', d.exception?.description || d.text, d.url || '', d.lineNumber); }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') { errors++; console.log('[log.error]', m.params.entry.text, m.params.entry.url || ''); }
    if (m.method === 'Network.requestWillBeSent') { const u = m.params.request.url; if (!u.startsWith(new URL(url).origin) && !u.startsWith('data:')) console.log('[network: off-origin]', u); }
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(1800);
  for (const s of steps) {
    if (s.wait) await sleep(s.wait);
    if (s.size) { await send('Emulation.setDeviceMetricsOverride', { width: s.size[0], height: s.size[1], deviceScaleFactor: s.size[2] || 1, mobile: s.size[0] < 600 }); await sleep(400); }
    if (s.eval) {
      const r = await send('Runtime.evaluate', { expression: s.eval, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) { errors++; console.log('[eval error]', s.eval.slice(0, 80), r.exceptionDetails.exception?.description); }
      else console.log('[eval]', s.label || s.eval.slice(0, 70), '=>', JSON.stringify(r.result?.value));
    }
    if (s.mouse) { const [type, x, y, o = {}] = s.mouse; await send('Input.dispatchMouseEvent', { type, x, y, button: o.button || 'left', buttons: o.buttons ?? (type === 'mouseMoved' ? 0 : 1), clickCount: 1, modifiers: o.modifiers || 0, deltaX: o.dx || 0, deltaY: o.dy || 0 }); await sleep(30); }
    if (s.key) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: s.key, text: s.key.length === 1 ? s.key : undefined }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: s.key }); await sleep(30); }
    if (s.shot) { await sleep(200); const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(s.shot, Buffer.from(r.data, 'base64')); console.log('[shot]', s.shot); }
  }
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  console.log(errors ? `ERRORS: ${errors}` : 'no page errors');
  process.exitCode = errors ? 1 : 0;
}
