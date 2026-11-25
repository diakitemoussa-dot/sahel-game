// Test des sons dans Chrome sans fenêtre : fabrique chaque son hors ligne et vérifie qu'il n'est ni muet ni saturé ; vérifie aussi que le jeu demande bien les sons.
// Usage : node tests/sfx_e2e.mjs [url du dossier client]
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9335;
const BASE = (process.argv[2] || 'http://localhost:8080').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prof = path.join(os.tmpdir(), 'sahel_sfx_profile'); rmSync(prof, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });
let page; for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { /* démarrage */ } await sleep(300); }
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') logs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
let ok = true; const check = (n, c, i = '') => { if (!c) ok = false; console.log(`${c ? 'OK  ' : 'ÉCHEC'} ${n}${i ? ' — ' + i : ''}`); };

await send('Page.navigate', { url: `${BASE}/sons.html` }); await sleep(1500);
const res = await ev("(async () => { const m = await import('./src/sfxsynth.js'); return await m.renderAll(); })()");
for (const [n, r] of Object.entries(res || {})) check(`son « ${n} » audible et sans saturation`, r.peak > 0.04 && r.peak <= 1.0 && r.rms > 0.002, `crête ${r.peak}, niveau ${r.rms}`);
check('la page de test se charge sans erreur', logs.length === 0, logs.join(' | '));
// voix continues (hélicoptère, avion) : les nœuds audio se construisent sans erreur quand le son est autorisé
const vr = await ev("(async () => { const ok = window.sfx.unlock(); const out = {}; for (const k of ['heli', 'jet']) { const v = window.sfx.voice(k); window.sfx.setListener({ x: 0, z: 0 }, 0); v.update({ x: 60, z: 20 }, { x: -100, z: 0 }, 1); v.update({ x: 55, z: 20 }, { x: -100, z: 0 }, 1); out[k] = !!v.g; v.stop(); } return { running: window.sfx.ctx?.state === 'running', out }; })()");
check('voix hélicoptère et avion construites (si le son est autorisé)', !vr.running || (vr.out.heli && vr.out.jet), JSON.stringify(vr));
check('page de test : toujours sans erreur après les voix', logs.length === 0, logs.join(' | '));

// le jeu : on simule les événements et on compte les sons demandés (le contexte audio est muet sans geste, mais les appels sont comptés)
logs.length = 0;
await send('Page.navigate', { url: `${BASE}/index.html` });
let ready = false; for (let i = 0; i < 240 && !ready; i++) { await sleep(500); ready = await ev('!!document.querySelector(".gm-start") && !document.querySelector(".gm-start").disabled'); }
check('le jeu se charge', ready);
await ev('document.querySelector(".gm-start").click()'); await sleep(800);
await ev('document.querySelector("[data-act=skip]").click()'); await sleep(800);
await ev('document.querySelector("[data-act=play]").click()'); await sleep(1500);
check('en jeu', (await ev('window.__game.menu.state')) === 'playing');
check('aviation : 2 hélicoptères en orbite, voix demandées', (await ev('window.__game.air.helis.length')) === 2 && (await ev('window.__game.sfx.count.voice_heli')) === 2);
const raf = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))';
const s0 = await ev('window.__game.sfx.count.step || 0'); for (let i = 0; i < 40 && (await ev('window.__game.sfx.count.step || 0')) <= s0; i++) await sleep(1000);      // (les images sont lentes sans carte graphique) le joueur ne bouge pas : les pas qu'on entend sont ceux des PNJ qui patrouillent
check('pas des PNJ : joués pendant que le joueur est immobile', (await ev('window.__game.sfx.count.step || 0')) > s0, `${s0} -> ${await ev('window.__game.sfx.count.step || 0')}`);
await ev('window.__game.input.override = { moveY: 1, sprint: true }'); await sleep(4000); await ev(raf);
await ev('window.__game.input.override = {}');
const count = JSON.parse(await ev('JSON.stringify(window.__game.sfx.count)'));
check('menu : sons de l\'interface demandés', (count.ui_start || 0) >= 1 && (count.ui_back || 0) >= 1, JSON.stringify(count));
check('en courant : des pas sont joués', (count.step || 0) >= 1, `pas : ${count.step || 0}`);
await ev('window.__game.input.override = { fire: true }'); await sleep(1500); await ev('window.__game.input.override = {}');
check('tir : le coup de feu est joué', (await ev('window.__game.sfx.count.rifle || 0')) >= 1);
await ev('window.__game.input.override = { reload: true }'); for (let i = 0; i < 20 && !(await ev('window.__game.sfx.count.reload_rifle || 0')); i++) await sleep(500); await ev('window.__game.input.override = {}');   // (images lentes sans carte graphique)
check('recharge : le son est joué', (await ev('window.__game.sfx.count.reload_rifle || 0')) >= 1);
await ev('window.__game.skirmish.hurtPlayer(10, window.__game.player.pos)');
check('touché : le son est joué', (await ev('window.__game.sfx.count.hurt || 0')) >= 1);
check('aucune erreur dans le jeu', logs.length === 0, logs.slice(0, 2).join(' | '));
ws.close(); chrome.kill();
process.exit(ok ? 0 : 1);
