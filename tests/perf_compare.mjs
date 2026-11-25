// Compare la fluidité des profils de performance sur un écran de téléphone simulé (844x390, écran 3x), dans une scène chargée (fumée, feu, soldats).
// Chrome sans fenêtre dessine avec le processeur (pas de carte graphique) : les chiffres absolus n'ont aucun sens, mais le rapport entre profils indique l'économie de travail.
// Usage : node tests/perf_compare.mjs [url] [secondes de mesure]
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9336;
const URL = process.argv[2] || 'http://localhost:8080/index.html';
const SECS = Number(process.argv[3] || 20);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prof = path.join(os.tmpdir(), 'sahel_perf_profile'); rmSync(prof, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--window-size=844,390', 'about:blank'], { stdio: 'ignore' });
let page; for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { /* démarrage */ } await sleep(300); }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: false });

const out = {};
for (const mode of ['max', 'eco']) {
  await send('Page.navigate', { url: `${URL}?autotest=vue_fumee_colonne&perf=${mode}` });
  let ok = false; for (let i = 0; i < 240 && !ok; i++) { await sleep(500); ok = await ev('!!window.__game?.perf'); }
  await sleep(3000);
  const f0 = await ev('window.__game.renderer.info.render.frame'), t0 = Date.now();
  await sleep(SECS * 1000);
  const f1 = await ev('window.__game.renderer.info.render.frame'), dt = (Date.now() - t0) / 1000;
  const info = await ev('({ pr: window.__game.renderer.getPixelRatio(), w: window.__game.renderer.domElement.width, h: window.__game.renderer.domElement.height, aa: window.__game.renderer.getContext().getContextAttributes().antialias, calls: window.__game.renderer.info.render.calls, tris: window.__game.renderer.info.render.triangles, smoke: window.__game.smoke.alive })');
  out[mode] = { fps: +((f1 - f0) / dt).toFixed(2), ...info };
  console.log(mode, JSON.stringify(out[mode]));
}
console.log(`rapport : le profil Économie dessine ${(out.eco.fps / out.max.fps).toFixed(2)} fois plus d'images par seconde que Maximum (même scène, même écran)`);
ws.close(); chrome.kill();
process.exit(0);
