// Test de bout en bout : lance Chrome sans fenêtre, ouvre le jeu pour chaque scénario, attend le rapport du jeu,
// enregistre une capture et affiche les messages de la console.
// Usage : node tests/e2e.mjs [url] [dossier des captures] [scénarios séparés par des virgules]
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const URL = process.argv[2] || 'http://localhost:8080/index.html';
const OUT = process.argv[3] || path.join(os.tmpdir(), 'sahel_shots');
const scenarios = (process.argv[4] || 'stand,run,back,side,combo_none,combo_rifle,combo_pistol,kick,kick_chain,pistol_left,pistol_right,sniper_l2,sniper_l2_pistol,fire_move,fire_crouch,reload_move,melee_move,crouch_walk,orbit,orbit_sniper,orbit_sniper_l2,orbit_move,orbit_aim,mouse_turn,sprint_rifle,sprint_pistol,sprint_aim,sprint_stand,jump,crouch,fire,sniper,fps,pistol,switch,reload,melee,whip,wave,victory,hit,dead,downed,nu_idle,nu_walk,nu_run,nu_bwalk,nu_brun,nu_left,nu_right,nu_key3').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const prof = path.join(os.tmpdir(), 'sahel_e2e_profile');
rmSync(prof, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--window-size=1280,720', 'about:blank'],
  { stdio: 'ignore' });

async function findPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const t = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const pg = t.find((x) => x.type === 'page');
      if (pg) return pg;
    } catch { /* Chrome démarre */ }
    await sleep(300);
  }
  throw new Error('Chrome ne répond pas');
}

const page = await findPage();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === 'Runtime.consoleAPICalled') logs.push(`[${d.params.type}] ` + d.params.args.map((a) => a.value ?? a.description).join(' '));
  else if (d.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

let failed = false;
for (const sc of scenarios) {
  logs.length = 0;
  await send('Page.navigate', { url: `${URL}?autotest=${sc}${process.env.E2E_EXTRA || ''}` });
  let text = '';
  for (let i = 0; i < 400; i++) {
    await sleep(500);
    const r = await send('Runtime.evaluate', { returnByValue: true,
      expression: "(document.getElementById('hud')?.textContent || '') + '|' + (document.getElementById('msg')?.textContent || '')" });
    text = r.result?.result?.value || '';
    if (text.includes('AUTOTEST') || text.includes('Erreur')) break;
  }
  await sleep(500);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(OUT, `${sc}.png`), Buffer.from(shot.result.data, 'base64'));
  const line = text.split('\n').find((l) => l.includes('AUTOTEST')) || text.slice(0, 300);
  console.log(`== ${sc} ==\n${line}`);
  const useful = logs.filter((l) => !/favicon|DevTools/.test(l)).slice(0, 10);
  if (useful.length) console.log(useful.join('\n'));
  if (!text.includes('AUTOTEST') || text.includes('"ok":false') || logs.some((l) => l.startsWith('[exception]') || l.startsWith('[error]'))) {
    failed = true;
    console.log('   >>> ÉCHEC pour ce scénario');
  }
}
ws.close();
chrome.kill();
console.log(failed ? 'RÉSULTAT : problèmes détectés' : 'RÉSULTAT : tous les scénarios sont passés');
process.exit(failed ? 1 : 0);
