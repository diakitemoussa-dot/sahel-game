import * as THREE from 'three';
import { Input } from './input.js';
import { loadWorld } from './world.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Hud } from './hud.js';
import { makeAutotest } from './autotest.js';
import { loadLibrary, Outfit } from './uniforms.js';
import { Wardrobe, WardrobeUI } from './wardrobe.js';
import { loadNpcs, loadNpcDefs } from './npc.js';
import { giveSkin } from './skins.js';
import { Skirmish } from './skirmish.js';
import { Sky, SUN, HORIZON } from './sky.js';
import { DustSystem } from './dust.js';
import { MuzzleFlash } from './muzzle.js';
import { BloodFx } from './blood.js';
import { loadProps } from './props.js';
import { lookScale, stepUser, loadUser, saveUser } from './sensitivity.js';
import { GameMenu } from './menu.js';
import { pixelRatioFor, volumeOf, AwayGuard, loadOptions } from './menustate.js';
import { resolveProfile, settingsFor } from './perfprofile.js';
import { Sfx } from './sfx.js';
import { Ammo } from './ammo.js';
import { SmokeSystem } from './smoke.js';
import { War } from './war.js';
import { Mission, MISSION_TITLE } from './mission.js';
import { AirTraffic } from './aircraft.js';
import { ASSET_VERSION } from './version.js';
import { StepClock, SpeedTracker, NPC_STEP_RANGE, overlaySound, stepVolume } from './sfxlogic.js';

// commandes du jeu quand le menu des tenues est ouvert : le personnage et la caméra ne bougent pas
const NEUTRAL = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, padLookX: 0, padLookY: 0, fire: false, aim: false, sprint: false, sniperHold: false,
  jump: false, crouchToggle: false, toggleWeapon: false, weapon: null, viewToggle: false, sniperToggle: false, reload: false, melee: false,
  combo: false, kick: false, wave: false, victory: false, hit: false, deadToggle: false, downedToggle: false };

const canvas = document.getElementById('c');
const hud = new Hud();
// profil de performance : ordinateur, téléphone ou téléphone modeste (voir perfprofile.js). ?perf=eco|max|auto pour l'essayer à la main.
const isTestRun = new URLSearchParams(location.search).has('autotest');
const urlPerf = new URLSearchParams(location.search).get('perf');
const perfEnv = { coarse: matchMedia('(pointer: coarse)').matches, ua: navigator.userAgent, memory: navigator.deviceMemory, cores: navigator.hardwareConcurrency };
const profileFor = (o) => (isTestRun && !urlPerf ? 'desktop' : resolveProfile(o.perf, perfEnv, urlPerf));      // test automatique : toujours le profil ordinateur (sauf ?perf=)
let perfName = profileFor(loadOptions(isTestRun ? null : localStorage));
let perf = settingsFor(perfName);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: perf.antialias, powerPreference: perf.powerPreference });      // l'anti-aliasing se choisit à la création : il change au prochain lancement
renderer.setPixelRatio(Math.min(devicePixelRatio, perf.maxPixelRatio));
renderer.shadowMap.enabled = true;
// même tonalité que Blender (AgX) : sans elle le sable sort saturé et orange, et le relief s'écrase
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(HORIZON);
scene.fog = new THREE.Fog(HORIZON, 90, 380);                     // brume de l'horizon : la même couleur que le bas du ciel, le sable lointain s'y fond
const sky = new Sky();                                           // dôme du ciel : dégradé, soleil, nuages qui dérivent
scene.add(sky.mesh);
const SUN_VEC = new THREE.Vector3(...SUN);
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 900);

// ambiance plus faible qu'avant (0,9) : la lumière ambiante n'a pas d'ombre ni de relief, elle écrasait le sable.
// Soleil bas (34° au-dessus de l'horizon) : le relief du sable apparaît. Sa direction est celle du soleil visible dans le ciel (sky.js).
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0xc29a6a, 0.5));
const sun = new THREE.DirectionalLight(0xffe6c0, 3.0);
sun.position.copy(SUN_VEC).multiplyScalar(115);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 250 });
scene.add(sun, sun.target);

const PLAYER_ANIM_BOOST = 1.25;                                      // +25 % sur toutes les animations du joueur (et ses déplacements, pour que les pas collent au sol)
const input = new Input(canvas, { gamepad: !new URLSearchParams(location.search).has('autotest') });
const tracers = [];

function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

let dustRef = null, worldRef = null, muzzleRef = null;                              // renseignés au démarrage (la poussière et la carte n'existent pas avant)

function addTracer(from, to, color = 0xfff2a0) {
  if (dustRef && worldRef && from.distanceTo(to) > 3) {              // balle qui finit au sol : jet de poussière
    const gy = worldRef.groundY(to.x, to.z);
    if (to.y < gy + 0.8) { dustRef.impact(new THREE.Vector3(to.x, gy, to.z)); sfx.play('impact_dust', { pos: to }); }
  }
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
  scene.add(line);
  tracers.push({ line, t: 0.08 });
}

/** Tir du joueur : le rayon part de la caméra (milieu de l'écran) ; le combat dit s'il touche un PNJ, sinon il va jusqu'au sol. */
function shoot(player, world, skirmish) {
  const { pos, dir: mdir } = player.muzzleWorld();
  muzzleRef?.shot(pos, mdir, player.state.weapon === 'pistol' ? 0.7 : 1);      // flamme de bouche
  sfx.play(player.state.weapon === 'pistol' ? 'pistol' : 'rifle', { vol: 0.9 });
  const o = camera.getWorldPosition(new THREE.Vector3());
  const d = camera.getWorldDirection(new THREE.Vector3());
  const res = skirmish.playerShoot(o, d, player.state.weapon);
  addTracer(pos, res.point ?? world.rayGround(o, d, 120));
}

// menu du jeu : accueil, vidéo d'intro, menu principal, options, pause. Il existe avant le chargement du monde (l'accueil attend « Chargement du monde… »).
const sfx = new Sfx({ enabled: !new URLSearchParams(location.search).has('autotest') });      // effets sonores (muets en test automatique)
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => sfx.unlock(), { passive: true });   // le navigateur n'autorise le son qu'après un geste
const G = {};                                                        // renseigné par start() : ce que le menu pilote (joueur, PNJ, tenues…)
const testingMode = new URLSearchParams(location.search).has('autotest');
const lockPointer = () => { if (!input.isTouch) { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* capture refusée : le joueur clique sur l'image */ } } };
const menu = new GameMenu({ testing: testingMode, storage: testingMode ? null : localStorage, hooks: {
  onPlay: () => { G.setHostile?.(true); G.facePlay?.(); lockPointer(); },     // clic sur JOUER = geste de l'utilisateur : le pointeur peut être capturé
  onResume: () => lockPointer(),
  onQuit: () => { G.setHostile?.(false); document.exitPointerLock?.(); },
  onPause: () => document.exitPointerLock?.(),
  onSfx: (name) => sfx.play(name),
  onOptions: (o) => { sfx.setVolume(volumeOf(o)); applyPerf(o); if (G.blood) G.blood.enabled = o.sang; },
  onTenues: () => G.wardrobe?.toggle(),
  wardrobeOpen: () => !!G.wardrobe?.open,
  sens: { get: () => G.getSens?.() ?? 1, set: (v) => G.setSens?.(v) },
} });
sfx.setVolume(volumeOf(menu.startupOptions()));

/** Applique le profil de performance : résolution, ombres, fumée, plafond d'images par seconde (tout sauf l'anti-aliasing, qui se règle à la création). */
function applyPerf(o = menu.startupOptions()) {
  perfName = profileFor(o); perf = settingsFor(perfName);
  renderer.setPixelRatio(pixelRatioFor(o, devicePixelRatio, perf.maxPixelRatio));
  resize();
  sun.castShadow = perf.shadowMap > 0;
  if (perf.shadowMap > 0) {
    const sh = sun.shadow, e = perf.shadowExtent;
    if (sh.mapSize.x !== perf.shadowMap) { sh.mapSize.set(perf.shadowMap, perf.shadowMap); sh.map?.dispose(); sh.map = null; }
    Object.assign(sh.camera, { left: -e, right: e, top: e, bottom: -e }); sh.camera.updateProjectionMatrix();
  }
  G.smoke?.setDetail(perf.smoke);
  G.fpsCap = perf.fpsCap;
  G.war?.setLevel(perf.war ?? 1);
  if (window.__game) window.__game.perf = { name: perf.name, ...perf };
}
applyPerf();
{ const pb = document.getElementById('pbtn');
  if (testingMode) pb.style.display = 'none';
  else pb.addEventListener('click', (e) => { e.stopPropagation(); if (menu.pause()) menu.hooks.onPause?.(); }); }
// le joueur quitte la fenêtre : pause et silence ; il revient : le jeu et le son repartent tout seuls
const away = new AwayGuard();
const isAway = () => document.hidden || !document.hasFocus();
function onAway() {
  sfx.suspend(); menu.suspendMedia();
  if (!testingMode && away.leave(menu.state) === 'pause' && menu.pause()) menu.hooks.onPause?.();     // (test automatique : jamais de pause)
}
function onBack() {
  sfx.resume(); menu.resumeMedia();
  if (away.returned(menu.state) === 'resume') { menu.resumeGame(); menu.hooks.onResume?.(); }
}
document.addEventListener('visibilitychange', () => (document.hidden ? onAway() : onBack()));
addEventListener('blur', onAway);
addEventListener('focus', onBack);
// la souris libérée en jeu (Échap du navigateur) = pause
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) G.locked = true;
  else if (G.locked) { G.locked = false; if (menu.state === 'playing' && !G.wardrobe?.open && menu.pause()) { menu.hooks.onPause?.(); if (isAway()) away.lockLostWhileAway(); } }
});

async function start() {
  const world = await loadWorld(scene);
  worldRef = world;
  let props = [];
  try { props = await loadProps(scene, world); } catch (e) { console.error('décors non chargés', e); }      // véhicules et autres objets posés dans le monde
  const blood = new BloodFx(scene, world, camera, { enabled: new URLSearchParams(location.search).get('sang') !== '0' });   // ?sang=0 : sans sang
  blood.renderer = renderer;
  addEventListener('resize', () => blood._resize());
  const muzzle = new MuzzleFlash(scene, camera);
  muzzle.renderer = renderer; muzzleRef = muzzle;
  addEventListener('resize', () => muzzle._resize());
  const dust = new DustSystem(scene, world, camera);
  dust.renderer = renderer; dustRef = dust;
  addEventListener('resize', () => dust._resize());
  // fumées de champ de bataille : foyers (config/smoke.json), véhicules en feu (config/props.json) et missiles qui tombent de temps en temps
  const scenario = new URLSearchParams(location.search).get('autotest') ?? '';
  const isTest = new URLSearchParams(location.search).has('autotest');
  const smoke = new SmokeSystem(scene, world, camera, { enabled: !isTest || /fumee/.test(scenario), strikes: false });      // pas de missile au hasard : les frappes partent des avions de chasse (aircraft.js)
  try {
    const sj = await (await fetch(`config/smoke.json?v=${ASSET_VERSION}`)).json();
    for (const s of sj.sites ?? []) smoke.addSite({ id: s.id, x: s.pos[0], z: -s.pos[1], kind: s.kind, scale: s.scale ?? 1, intensity: s.start ?? 1, target: s.start ?? 1 });
  } catch (e) { console.error('fumées : config/smoke.json non chargé', e); }
  for (const pr of props) if (pr.def.smoke) smoke.addSite({ id: pr.def.id, x: pr.def.pos[0], z: -pr.def.pos[1], y: pr.root.position.y, kind: pr.def.smoke.kind ?? 'car', scale: pr.def.smoke.scale ?? 1, intensity: pr.def.smoke.start ?? 1, target: pr.def.smoke.start ?? 1 });
  smoke.onExplosion = (pos, s) => { sfx.play('explosion', { pos, vol: Math.min(1, 0.85 * s), ear: { ref: 25, max: 700 } }); window.__game?.skirmish?.blast(pos, s); };      // on l'entend de loin ; le souffle blesse
  smoke.onMissile = (pos) => sfx.play('missile', { pos, vol: 0.9, ear: { ref: 25, max: 600 } });
  smoke.onCrackle = (pos) => sfx.play('crackle', { pos, vol: 0.7 });
  G.smoke = smoke; smoke.setDetail(perf.smoke);
  smoke.prewarm(16);                                                 // au démarrage les colonnes sont déjà hautes
  // hélicoptères qui tournent au-dessus de la carte, avions de chasse qui traversent le ciel de temps en temps
  const air = new AirTraffic(scene, camera, world, { sfx, smoke, enabled: !isTest || /(avion|helico)/.test(scenario), passes: !isTest });
  // la guerre en fond : combats lointains, explosions, obus, rafales d'hélicoptère (muette et sans effet en test automatique, sauf scénarios « guerre »)
  const war = new War({ world, smoke, air, sfx, tracer: addTracer, muzzle, enabled: !isTest || /guerre/.test(scenario), level: perf.war ?? 1 });
  G.war = war;
  const mission = new Mission();
  const player = await Player.load(scene);
  player.animBoost = isTest ? 1 : PLAYER_ANIM_BOOST;                              // le personnage principal : animations et déplacements plus vifs
  await giveSkin(player.model, 'noire');                             // teinte de peau du joueur : noire (les PNJ ont la leur : config/npcs.json)
  const rig = new CameraRig(camera, world.cams);
  player.pos.copy(world.spawn('Spawn_Joueur_1'));
  player.pos.y = world.groundY(player.pos.x, player.pos.z);
  let yaw = 0, pitch = 0, cooldown = 0, last = performance.now();
  const testing = new URLSearchParams(location.search).has('autotest');
  if (testing) player.ammo = new Ammo({ rifle: 99999, pistol: 99999 });        // test automatique : chargeurs sans fin (les scénarios « recharge_* » mettent les leurs)
  let sens = testing ? 1 : loadUser(localStorage);              // réglage du joueur (100 % = défaut) ; en test automatique, aucun ralentissement
  Object.assign(G, { blood, getSens: () => sens, setSens: (v) => { sens = v; if (!testing) saveUser(localStorage, v); } });
  if (!testing && !menu.startupOptions().sang) blood.enabled = false;
  // bibliothèque de tenues : si le fichier de tenue est absent ou abîmé, on garde la tenue de base (le jeu démarre quand même)
  const lib = await loadLibrary();
  const wardrobe = new Wardrobe({ outfit: new Outfit(player, lib), lib, storage: testing ? null : localStorage, ui: new WardrobeUI() });
  await wardrobe.start();
  // PNJ : même personnage que le joueur, tenue à part, patrouille. S'ils ne se chargent pas, le jeu démarre quand même.
  let npcs = [], allies = [];
  const npcDefs = await loadNpcDefs().catch(() => ({ npcs: [], allies: [] }));
  // miliciens : tous en jeu normal ; en test automatique seulement ceux du camp de départ (les autres : scénarios « monde_* »), pour garder les tests rapides
  const wantFar = !testing || /^monde_/.test(new URLSearchParams(location.search).get('autotest') ?? '');
  try { npcs = await loadNpcs(scene, world, lib, npcDefs.npcs.filter((d) => wantFar || !d.far), 'enemy'); } catch (e) { console.error('PNJ non chargés', e); }
  // alliés du joueur : en jeu normal ils sont là dès le départ ; en test automatique, un scénario les fait venir avec spawnAllies()
  try { if (!testing) allies = await loadNpcs(scene, world, lib, npcDefs.allies, 'ally'); } catch (e) { console.error('alliés non chargés', e); }
  // raccourci pour voir les miliciens des autres zones : index.html?tp=fort (village, oasis, convoi, milieu1, milieu2, nord, sud)
  { const zone = new URLSearchParams(location.search).get('tp'); const t = zone && npcs.find((n) => n.def.zone === zone);
    if (t) {
      const q = t.player.pos;
      const spot = [[0, -14], [14, 0], [-14, 0], [0, 14], [0, -9], [9, 0]].map(([dx, dz]) => [q.x + dx, q.z + dz])
        .find(([x, z]) => !world.mesh || world.mesh.insideObject(x, world.groundY(x, z) + 0.9, z) < 0) ?? [q.x, q.z - 14];
      player.pos.set(spot[0], world.groundY(spot[0], spot[1]), spot[1]);
      yaw = Math.atan2(q.x - spot[0], q.z - spot[1]);
      allies.forEach((a, i) => { const x = spot[0] + (i - 1) * 2.2, z = spot[1] - 2; a.player.pos.set(x, world.groundY(x, z), z); });
    } }
  const skirmish = new Skirmish({ player, npcs, allies, world, tracer: addTracer, hud, muzzleFx: (pos, dir) => { muzzle.shot(pos, dir, 1); sfx.play('rifle', { pos, vol: 0.85 }); }, bloodFx: blood, sfx, smoke,
    spawnPlayer: (p) => { p.pos.copy(world.spawn('Spawn_Joueur_1')); p.pos.y = world.groundY(p.pos.x, p.pos.z); } });
  skirmish.onHurt = (dmg) => { smoke.shake = Math.max(smoke.shake, Math.min(0.6, 0.15 + dmg / 25)); };      // le joueur touché : la caméra tremble
  skirmish.hostile = false;                                  // derrière le menu les PNJ ne tirent pas ; JOUER les rend hostiles (en test automatique : jamais, sauf scénarios de combat)
  G.wardrobe = wardrobe;
  hud.hideMessage();
  menu.setLoaded();
  window.__game = { player, rig, input, world, camera, wardrobe, npcs, skirmish, sky, dust, hud, muzzle, blood, props, allies,
    spawnAllies: async () => { const a = await loadNpcs(scene, world, lib, npcDefs.allies, 'ally'); a.forEach((x) => { skirmish.addAlly(x); allies.push(x); }); return a; }, getYaw: () => yaw, look: (y, p) => { yaw = y; pitch = p; }, menu };     // accès pour les tests automatiques
  const auto = makeAutotest(new URLSearchParams(location.search).get('autotest'));

  // derrière le menu : le héros debout, la caméra qui tourne doucement autour, les PNJ vivants mais pas hostiles
  let menuT = 0, inGame = false;
  // orbite contrôlée par le joueur : souris (glisser), molette (zoom), stick droit de la manette ; sans geste pendant 4 s, la caméra tourne doucement toute seule
  const orb = { a: 0, p: 0.1, r: 3.4, idle: 99 };
  const orbitOn = () => menu.flow.active && !inGame && ['main', 'tenues', 'options', 'credits'].includes(menu.state);
  let drag = null;
  addEventListener('pointerdown', (e) => { if (orbitOn() && e.button === 0 && !e.target.closest('button, input, .gm-panel, .w-box, .gm-col')) { drag = { x: e.clientX, y: e.clientY }; e.preventDefault?.(); } });
  addEventListener('pointermove', (e) => {
    if (!drag) return;
    orb.a -= (e.clientX - drag.x) * 0.008; orb.p = THREE.MathUtils.clamp(orb.p + (e.clientY - drag.y) * 0.005, -0.15, 1.0); orb.idle = 0;
    drag = { x: e.clientX, y: e.clientY };
  });
  addEventListener('pointerup', () => { drag = null; });
  addEventListener('pointercancel', () => { drag = null; });
  addEventListener('wheel', (e) => { if (orbitOn() && !e.target.closest?.('.gm-panel')) { orb.r = THREE.MathUtils.clamp(orb.r + Math.sign(e.deltaY) * 0.3, 1.8, 6); orb.idle = 0; } }, { passive: true });
  window.__game.orbit = orb; window.__game.sfx = sfx; window.__game.smoke = smoke; window.__game.air = air; window.__game.war = war; window.__game.mission = mission; window.__game.renderer = renderer; window.__game.perf = { name: perf.name, ...perf };
  const _c = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3(), _t = new THREE.Vector3();
  Object.assign(G, { setHostile: (h) => { if (!testing) skirmish.hostile = h; inGame = h; if (h && !testing && !mission.won) hud.toast(`Mission : ${MISSION_TITLE}`, 6000); }, facePlay: () => { pitch = 0; } });
  // sons liés au joueur : pas, atterrissage, recharge, coups, changement d'arme
  const steps = new StepClock(), prevPos = player.pos.clone(), _lv = new THREE.Vector3();
  let prevOverlay = null, prevWeapon = player.state.weapon, wasGround = true;
  let heading = 0;
  function listen() { camera.getWorldDirection(_lv); heading = Math.atan2(_lv.x, _lv.z); sfx.setListener(camera.position, heading); }
  function playerSounds(dt) {
    const st = player.state;
    const sp = Math.hypot(player.pos.x - prevPos.x, player.pos.z - prevPos.z) / Math.max(dt, 1e-3);
    prevPos.copy(player.pos);
    const real = sp < 12;                                                  // une réapparition ou une téléportation n'est pas une course
    if (!st.dead && !st.downed && steps.update(dt, real ? sp : 0, player.onGround)) sfx.play('step', { vol: stepVolume(sp, st.crouch) });
    if (player.onGround && !wasGround && real) sfx.play('land');
    wasGround = player.onGround;
    if (st.overlay !== prevOverlay) { const n = overlaySound(st.overlay); if (n) sfx.play(n); prevOverlay = st.overlay; }
    if (st.weapon !== prevWeapon) { sfx.play('switch'); prevWeapon = st.weapon; }
  }

  // pas des PNJ (miliciens et alliés) : joués à leur position, plus ou moins fort selon la distance
  let gameT = 0;                                                     // temps du jeu (et non de l'horloge) : si l'image ralentit, les PNJ aussi
  function npcSteps(dt) {
    const t = (gameT += dt);
    for (const n of [...npcs, ...allies]) {
      if (n.dead || n._asleep) continue;
      const p = n.player;
      if (Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z) > NPC_STEP_RANGE) continue;
      const tr = (n._spd ??= new SpeedTracker()), ck = (n._stepClock ??= new StepClock());
      const sp = tr.update(p.pos.x, p.pos.z, t);
      if (ck.update(dt, sp, p.onGround)) sfx.play('step', { pos: p.pos, vol: 1.8 * stepVolume(sp, p.state.crouch) });
    }
  }

  function menuFrame(dt, now) {
    const raw = input.poll();
    const wasTenues = menu.state === 'tenues';                             // le même appui (A, X) qui ouvre le menu des tenues ne doit pas aussitôt le valider et le refermer
    menu.nav(raw.nav);                                                     // manette : croix, A, B, Start
    if (wasTenues && menu.state === 'tenues') wardrobe.update(raw);                    // le choix de tenue garde ses touches ; sa fermeture ramène au menu
    menu.update();
    if (inGame) { air.setAudible(false); renderer.render(scene, camera); return; }                // pause : le monde est figé, les moteurs se taisent                // pause : le monde est figé (la caméra reste où elle était)
    menuT += dt;
    skirmish.update(dt);
    npcSteps(dt);
    smoke.update(dt, player.pos, heading, ['main', 'options', 'credits', 'tenues'].includes(menu.state));
    air.setAudible(menu.state !== 'intro' && menu.state !== 'splash');
    air.update(dt, player.pos, heading, ['main', 'options', 'credits', 'tenues'].includes(menu.state));
    if (menu.state !== 'intro' && menu.state !== 'splash') war.update(dt, player.pos, heading);
    player.step(dt, NEUTRAL, world, yaw);
    if (orbitOn()) {
      if (raw.padLookX || raw.padLookY) { orb.a -= raw.padLookX; orb.p = THREE.MathUtils.clamp(orb.p + raw.padLookY * 0.7, -0.15, 1.0); orb.idle = 0; }   // stick droit
      orb.idle += dt;
      if (orb.idle > 4 && menu.state === 'main') orb.a += dt * 0.12;      // personne ne touche à rien : tour lent (jamais pendant le choix de tenue)
    }
    const a = yaw + orb.a, r = orb.r, hd = r * Math.cos(orb.p);
    _c.copy(player.pos); _c.y += 1.05;
    const cx = _c.x + Math.sin(a) * hd, cz = _c.z + Math.cos(a) * hd;
    camera.position.set(cx, Math.max(_c.y + r * Math.sin(orb.p) + 0.1, world.groundY(cx, cz) + 0.5), cz);
    _d.copy(_c).sub(camera.position).normalize(); _r.crossVectors(_d, camera.up).normalize();
    _t.copy(_c).addScaledVector(_r, -0.9);                                 // le héros se place à droite : le menu occupe la colonne de gauche
    camera.fov = 38; camera.updateProjectionMatrix(); camera.lookAt(_t);
    player.pose(dt, _t.set(player.pos.x + Math.sin(yaw) * 10, player.pos.y + 1.4, player.pos.z + Math.cos(yaw) * 10));
    sun.position.copy(player.pos).addScaledVector(SUN_VEC, 115); sun.target.position.copy(player.pos);
    sky.update(camera, now / 1000);
    listen();
    blood.update(dt); muzzle.update(dt);
    dust.update(dt, [player, ...npcs.filter((n) => !n._asleep).map((n) => n.player)]);
    renderer.render(scene, camera);
  }

  let lastDraw = 0;
  function frame(now) {
    if (G.fpsCap && now - lastDraw < 1000 / G.fpsCap - 3) { requestAnimationFrame(frame); return; }        // plafond d'images par seconde (téléphone : 30)
    lastDraw = now;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    sfx.setAmbient(menu.state !== 'intro' && menu.state !== 'splash');         // vent du désert, sauf pendant la vidéo (qui a sa propre bande son)
    if (menu.flow.active) { menuFrame(dt, now); requestAnimationFrame(frame); return; }
    const raw = input.poll();
    if (raw.nav?.start && !wardrobe.open && menu.pause()) menu.hooks.onPause?.();          // Start de la manette : pause
    if (menu.flow.active) { renderer.render(scene, camera); requestAnimationFrame(frame); return; }
    const inp = wardrobe.update(raw) ? { ...raw, ...NEUTRAL } : raw;
    window.__game.lastInput = inp;
    if (!testing && (inp.sensUp || inp.sensDown)) {              // PageUp / PageDown : sensibilité du viseur
      sens = stepUser(sens, inp.sensUp ? 1 : -1); saveUser(localStorage, sens);
      hud.toast(`Sensibilité du viseur : ${Math.round(sens * 100)} %`, 1500);
    }
    // souris, stick droit et doigt tournent la caméra ; plus lent quand on vise, encore plus en tireur d'élite
    const k = testing ? 1 : lookScale({ user: sens, aiming: inp.aim, sniper: player.state.sniper });
    yaw -= (inp.lookX + inp.padLookX) * k;
    pitch = THREE.MathUtils.clamp(pitch - (inp.lookY + inp.padLookY) * k, -1.0, 1.0);
    if (inp.viewToggle) rig.toggleView();
    player.fps = rig.view === 'fps';

    player.step(dt, inp, world, yaw);
    rig.update(dt, player.pos, yaw, pitch, { ...player.state }, world);
    // point visé : le centre de l'image, à 30 m devant la caméra
    const target = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 30);
    player.pose(dt, target);
    listen(); playerSounds(dt);
    skirmish.update(dt);
    npcSteps(dt);
    smoke.update(dt, player.pos, heading);
    air.setAudible(true); air.update(dt, player.pos, heading);
    war.update(dt, player.pos, heading);
    if (smoke.shake > 0.01) camera.position.add(_lv.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4).multiplyScalar(smoke.shake));      // secousse d'une explosion proche                                      // PNJ : vue, bruit, tirs, coups, mort ; dégâts du joueur
    { const d = camera.getWorldDirection(new THREE.Vector3()); hud.updateIndicators(dt, Math.atan2(d.x, d.z), player.pos); }     // arcs : d'où viennent les tirs

    cooldown -= dt;
    if (inp.fire && cooldown <= 0 && player.canShoot()) { shoot(player, world, skirmish); player.onShot(); cooldown = player.state.weapon === 'rifle' ? 0.1 : 0.25; }
    for (let i = tracers.length - 1; i >= 0; i--) {
      tracers[i].t -= dt;
      if (tracers[i].t <= 0) { scene.remove(tracers[i].line); tracers[i].line.geometry.dispose(); tracers.splice(i, 1); }
    }
    sun.position.copy(player.pos).addScaledVector(SUN_VEC, 115);       // la lumière suit le joueur, toujours du côté du soleil du ciel
    sun.target.position.copy(player.pos);
    sky.update(camera, now / 1000);
    muzzle.update(dt);
    hud.updateTags([                                            // repères nom + vie au-dessus de la tête : joueur (bleu), alliés (vert), miliciens (rouge)
      { id: 'joueur', kind: 'self', name: 'Joueur', player, health: player.health, dead: player.health.dead, hidden: rig.view === 'fps' },
      ...allies.map((a) => ({ id: a.id, kind: 'ally', name: a.def.name ?? a.id.replace('allie_', 'Allié '), player: a.player, health: a.health, dead: a.dead })),
      ...npcs.map((n) => ({ id: n.id, kind: 'enemy', name: n.def.name ?? n.id.replace('pnj_', 'Milicien '), player: n.player, health: n.health, dead: n.dead, hidden: !!n._asleep })),
    ], camera);
    { const d = camera.getWorldDirection(new THREE.Vector3());          // carte de repérage : le haut = où regarde la caméra
      hud.updateRadar({ origin: player.pos, heading: Math.atan2(d.x, d.z),
        enemies: npcs.map((n) => ({ pos: n.player.pos, state: n.brain.state, dead: n.dead })), allies: allies.map((a) => ({ pos: a.player.pos, dead: a.dead })) }); }
    blood.update(dt);
    dust.update(dt, [player, ...npcs.filter((n) => !n._asleep).map((n) => n.player)]);           // grains et voiles de poussière ; nuages sous les pas de ceux qui courent
    { const w = player.state.weapon; hud.setAmmo(w, player.ammo.left(w), player.ammo.size[w] ?? 0, !!player.ammo.reloading); }
    {                                                              // mission : tous les miliciens, avec l'escouade
      const m = mission.update({ enemies: { total: npcs.length, dead: npcs.filter((n) => n.dead).length }, squad: { total: allies.length, alive: allies.filter((a) => !a.dead).length } });
      hud.setMission(m.text);
      if (m.banner) { hud.showBanner(m.banner.title, m.banner.sub); sfx.play('ui_start'); }
    }
    hud.update(player, rig, input.padStatus);
    const report = auto?.step(window.__game);
    if (report) hud.el.textContent += '\n' + report;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

start().catch((e) => { console.error(e); hud.showMessage('Erreur : ' + e.message); });
