// Test de bout en bout du menu : accueil -> intro -> menu principal -> options -> jeu -> pause -> reprise -> retour au menu.
// Usage : node tests/menu_e2e.mjs [url] [dossier des captures]
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9334;
const URL = process.argv[2] || 'http://localhost:8080/index.html';
const OUT = process.argv[3] || path.join(os.tmpdir(), 'sahel_menu_shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const prof = path.join(os.tmpdir(), 'sahel_menu_profile');
rmSync(prof, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });
async function findPage() {
  for (let i = 0; i < 60; i++) {
    try { const t = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); const pg = t.find((x) => x.type === 'page'); if (pg) return pg; } catch { /* démarrage */ }
    await sleep(300);
  }
  throw new Error('Chrome ne répond pas');
}
const page = await findPage();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === 'Runtime.consoleAPICalled') logs.push(`[${d.params.type}] ` + d.params.args.map((a) => a.value ?? a.description).join(' '));
  else if (d.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression })).result?.result?.value;
const shot = async (name) => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(s.data ? s.data : s.result.data, 'base64')); };
const key = (code, k = code) => send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: k, windowsVirtualKeyCode: code === 'Escape' ? 27 : 0 }).then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k }));
const state = () => ev('window.__game?.menu?.state ?? document.querySelector(".gm-screen.on")?.dataset.screen');
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

const results = []; const check = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${name}${info ? ' — ' + info : ''}`); };
await send('Page.navigate', { url: URL });
let ready = false;
for (let i = 0; i < 240 && !ready; i++) { await sleep(500); ready = await ev('!!document.querySelector(".gm-start") && !document.querySelector(".gm-start").disabled'); }
check('le monde se charge et le bouton de l\'accueil s\'active', ready);
await sleep(800); await shot('1_accueil');
check('accueil affiché', (await state()) === 'splash');
await ev('document.querySelector(".gm-start").click()'); await sleep(5000);
check('clic -> intro', (await state()) === 'intro');
const vid = await ev('({t: document.querySelector(".gm-video").currentTime, paused: document.querySelector(".gm-video").paused, err: !!document.querySelector(".gm-video").error, rs: document.querySelector(".gm-video").readyState, src: document.querySelector(".gm-video").currentSrc})');
check('la vidéo d\'intro se lit', vid && !vid.err && vid.t > 0.3 && !vid.paused, JSON.stringify(vid));
await shot('2_intro');
await key('Escape'); await sleep(1200);
check('Échap passe l\'intro -> menu principal', (await state()) === 'main');
await sleep(1500); await shot('3_menu_principal');
await ev('document.querySelector("[data-act=options]").click()'); await sleep(700);
check('options', (await state()) === 'options'); await shot('4_options');
await ev('document.querySelector("[data-act=toggle][data-key=radar]").click()');
check('un réglage s\'enregistre', (await ev('JSON.parse(localStorage.getItem("sahel.options")).radar')) === false);
await ev('document.querySelector("[data-act=toggle][data-key=radar]").click()');
await key('Escape'); await sleep(600);
check('Échap des options -> menu principal', (await state()) === 'main');
await ev('document.querySelector("[data-act=credits]").click()'); await sleep(600); await shot('5_credits'); await key('Escape'); await sleep(500);
await ev('document.querySelector("[data-act=tenues]").click()'); await sleep(2500); await shot('5b_tenues');
check('le menu des tenues est à gauche', (await ev('document.querySelector("#wardrobe .w-box").getBoundingClientRect().right')) < 520);
{ const a0 = await ev('window.__game.orbit.a'); const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  await mouse('mousePressed', 900, 300); await mouse('mouseMoved', 800, 300); await mouse('mouseMoved', 700, 320); await mouse('mouseReleased', 700, 320); await sleep(400);
  const a1 = await ev('window.__game.orbit.a'); check('glisser la souris tourne la caméra autour du personnage', Math.abs(a1 - a0) > 0.5, `${a0} -> ${a1}`);
  await ev("document.getElementById('c').dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }))"); await sleep(300);
  check('la molette éloigne la caméra', (await ev('window.__game.orbit.r')) > 3.4, String(await ev('window.__game.orbit.r'))); }
await key('Escape'); await sleep(900);
check('Échap des tenues -> menu principal', (await state()) === 'main');
await ev('document.querySelector("[data-act=play]").click()'); await sleep(2500);
check('JOUER -> en jeu', (await state()) === 'playing');
check('les miliciens sont hostiles en jeu', (await ev('window.__game.skirmish.hostile')) === true);
await shot('6_en_jeu');
await ev('document.getElementById("pbtn").click()'); await sleep(900);
check('bouton pause -> pause', (await state()) === 'pause'); await shot('7_pause');
const p0 = await ev('JSON.stringify(window.__game.player.pos)'); await sleep(800);
check('le monde est figé en pause', p0 === (await ev('JSON.stringify(window.__game.player.pos)')));
await key('Escape'); await sleep(600);
check('Échap en pause -> reprise', (await state()) === 'playing');
await ev('window.__game.menu.pause()'); await sleep(300);
await ev('document.querySelector("[data-act=quit]").click()'); await sleep(1500);
check('QUITTER -> menu principal, PNJ calmés', (await state()) === 'main' && (await ev('window.__game.skirmish.hostile')) === false);
await shot('8_retour_menu');
// ---- manette simulée : toute la navigation sans souris ni clavier
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__pad = { axes: [0,0,0,0], buttons: Array.from({length:17}, () => ({pressed:false,value:0})) };
  navigator.getGamepads = () => [{ index: 0, id: 'Fausse manette', connected: true, axes: window.__pad.axes, buttons: window.__pad.buttons }];` });
await send('Page.navigate', { url: URL });
ready = false;
for (let i = 0; i < 240 && !ready; i++) { await sleep(500); ready = await ev('!!document.querySelector(".gm-start") && !document.querySelector(".gm-start").disabled'); }
const raf2 = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))';   // l'image est lente sans carte graphique : on attend vraiment le passage du jeu
const press = async (i) => { await ev(`window.__pad.buttons[${i}] = {pressed:true,value:1}`); await ev(raf2); await ev(`window.__pad.buttons[${i}] = {pressed:false,value:0}`); await ev(raf2); };
const focused = () => ev('document.activeElement?.textContent?.trim().replace(/s+/g, " ")');
await ev('window.__game.input.padNav.delay = 1e9');            // sans carte graphique les images durent plus d'une seconde : pas de répétition automatique dans ce test
await sleep(600);
await press(0);                                                  // A sur l'accueil
await sleep(1200);
check('manette : A sur l accueil lance l intro', (await state()) === 'intro');
await press(0); await sleep(1200);
check('manette : A passe l intro', (await state()) === 'main');
check('manette : JOUER est choisi au départ', /JOUER/.test(await focused()), await focused());
await press(13); await press(13);
check('manette : croix bas x2 -> OPTIONS', /OPTIONS/.test(await focused()), await focused());
await press(0); await sleep(600);
check('manette : A ouvre les options', (await state()) === 'options');
await press(13);                                                 // curseur de volume -> sensibilité? (premier : volume)
const v0 = await ev('document.querySelector("[data-key=volume]").value');
await press(15);
const sel = await ev('document.activeElement?.dataset?.key');
check('manette : on se déplace dans les options', !!sel, String(sel));
await press(1); await sleep(600);
check('manette : B revient au menu principal', (await state()) === 'main');
await press(12); await press(12); await sleep(200);
{ const a0 = await ev('window.__game.orbit.a'); await ev('window.__pad.axes[2] = 0.9'); await ev(raf2); await ev('window.__pad.axes[2] = 0'); await ev(raf2);
  check('manette : le stick droit tourne la caméra', Math.abs((await ev('window.__game.orbit.a')) - a0) > 0.02); }
// X (bouton 2, Xbox) valide dans le menu : croix bas -> TENUES, X ouvre le menu des tenues, B revient
for (let i = 0; i < 6 && !/TENUES/.test(await focused()); i++) await press(13);
check('manette : croix bas -> TENUES', /TENUES/.test(await focused()), await focused());
await press(2); await sleep(900);
check('manette : X ouvre le menu des tenues', (await state()) === 'tenues', await state());
await press(1); await sleep(900);
check('manette : B ferme le menu des tenues', (await state()) === 'main', await state());
await press(12); await press(12); await sleep(200);
// JOUER est en premier : on y revient avec la croix, puis A lance la partie
await ev('document.querySelector("[data-act=play]").focus()'); await press(0); await sleep(2000);
check('manette : A sur JOUER lance la partie', (await state()) === 'playing');
await press(9); await sleep(800);
check('manette : Start met en pause', (await state()) === 'pause');
await press(9); await sleep(800);
check('manette : Start reprend', (await state()) === 'playing');

// ---- fenêtre quittée / retrouvée
const fire = (n) => ev(`window.dispatchEvent(new Event('${n}'))`);
await fire('blur'); await sleep(400);
check('fenêtre quittée : le jeu se met en pause', (await state()) === 'pause');
check('fenêtre quittée : le son est coupé', (await ev('window.__game.sfx.away')) === true);
await fire('focus'); await sleep(500);
check('retour dans la fenêtre : le jeu reprend tout seul', (await state()) === 'playing');
check('retour dans la fenêtre : le son revient', (await ev('window.__game.sfx.away')) === false);
await ev('window.__game.menu.pause()'); await sleep(300); await fire('blur'); await fire('focus'); await sleep(500);
check('une pause choisie par le joueur reste en pause', (await state()) === 'pause');
await ev('window.__game.menu.resumeGame()'); await sleep(300);
await ev('window.__game.menu.pause()'); await ev('document.querySelector("[data-act=quit]").click()'); await sleep(800);
await ev('window.__game.menu.go("intro")'); await sleep(2500);
await fire('blur'); await sleep(300);
check('fenêtre quittée pendant l intro : la vidéo s arrête', (await ev('document.querySelector(".gm-video").paused')) === true);
const t0 = await ev('document.querySelector(".gm-video").currentTime');
await fire('focus'); await sleep(2500);
check('retour : la vidéo repart', (await ev('document.querySelector(".gm-video").currentTime')) > t0 + 0.3);

const bad = logs.filter((l) => /^\[(exception|error)\]/.test(l) && !/favicon|autoplay|play\(\)|NotAllowed|ERR_/.test(l));
check('aucune erreur dans la console', bad.length === 0, bad.slice(0, 3).join(' | '));
ws.close(); chrome.kill();
console.log(`Captures : ${OUT}`);
process.exit(results.every(Boolean) ? 0 : 1);
