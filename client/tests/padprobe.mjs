// Usage : node tests/padprobe.mjs  -> relève 12 fois l'état de la manette vue par Chrome (axes et boutons non nuls)
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prof = path.join(os.tmpdir(), 'sahel_probe_profile'); rmSync(prof, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-sandbox', '--remote-debugging-port=9334',
  `--user-data-dir=${prof}`, 'http://localhost:8080/index.html?autotest=none'], { stdio: 'ignore' });
let page;
for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch('http://127.0.0.1:9334/json')).json()).find((x) => x.type === 'page'); } catch {} await sleep(300); }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => { ws.onopen = r; });
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await sleep(3000);
for (let k = 0; k < 12; k++) {
  const r = await send('Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify([...navigator.getGamepads()].filter(Boolean).map(p => ({id: p.id, mapping: p.mapping, connected: p.connected, axes: p.axes.map(a => +a.toFixed(2)), boutons: p.buttons.map((b,i)=> (b.pressed||b.value>0.05) ? i+':'+b.value.toFixed(2) : null).filter(Boolean)})))` });
  console.log(k, r.result?.result?.value);
  await sleep(700);
}
ws.close(); chrome.kill();
