import test from 'node:test';
import assert from 'node:assert/strict';
import { NpcBrain } from '../src/npcbrain.js';

// contexte : le PNJ est en (0, 0) et regarde vers +z (yaw 0) ; le joueur est en (px, pz)
const ctx = (px, pz, o = {}) => ({ pos: { x: 0, z: 0 }, yaw: 0, player: { x: px, z: pz, alive: true, speed: 0 }, canSee: true, hpFrac: 1, ...o });
const run = (b, secs, c, dt = 0.05) => { let r; for (let t = 0; t < secs; t += dt) r = b.update(dt, c); return r; };

test('il patrouille tant qu il ne voit personne (joueur derrière lui, trop loin ou caché)', () => {
  const b = new NpcBrain();
  assert.equal(b.update(0.05, ctx(0, -20)).mode, 'patrol', 'derrière lui, hors du champ de vision');
  assert.equal(b.update(0.05, ctx(0, 60)).mode, 'patrol', 'trop loin');
  assert.equal(b.update(0.05, ctx(0, 10, { canSee: false })).mode, 'patrol', 'un mur le cache');
});

test('il repère le joueur devant lui : alerte avec un temps de réaction, puis il combat', () => {
  const b = new NpcBrain({ reaction: 0.5 });
  b.update(0.05, ctx(0, 12));
  assert.equal(b.state, 'alert');
  const a = b.update(0.05, ctx(0, 12));
  assert.equal(a.mode, 'alert'); assert.equal(a.aim, true); assert.equal(a.fire, false, 'il ne tire pas avant d avoir réagi');
  run(b, 0.6, ctx(0, 12));
  assert.equal(b.state, 'engage');
});

test('combat : il s approche si le joueur est loin, tire par rafales à bonne distance', () => {
  const b = new NpcBrain({ seed: 3 });
  b.state = 'engage';
  const loin = b.update(0.05, ctx(0, 25));
  assert.equal(loin.moveY, 1, 'il court vers le joueur'); assert.equal(loin.fire, false);
  const cmds = []; for (let t = 0; t < 3; t += 0.05) cmds.push(b.update(0.05, ctx(0, 10)));
  assert.ok(cmds.some((c) => c.fire), 'il tire');
  assert.ok(cmds.some((c) => !c.fire), 'avec des pauses entre les rafales');
  assert.ok(cmds.every((c) => c.aim), 'il vise');
  assert.ok(cmds.filter((c) => !c.fire).some((c) => c.moveX !== 0), 'il se déplace de côté entre deux rafales');
});

test('il ne tire pas s il n est pas tourné vers le joueur', () => {
  const b = new NpcBrain();
  b.state = 'engage';
  const cmds = []; for (let t = 0; t < 2; t += 0.05) cmds.push(b.update(0.05, { ...ctx(0, 10), yaw: 2.0 }));
  assert.ok(cmds.every((c) => !c.fire));
});

test('corps à corps quand le joueur est collé à lui', () => {
  const b = new NpcBrain(); b.state = 'engage';
  const c = b.update(0.05, ctx(0, 1.2));
  assert.equal(c.mode, 'melee'); assert.equal(c.melee, true); assert.equal(c.moveY, 0);
});

test('trop près pour tirer mais pas au corps à corps : il recule', () => {
  const b = new NpcBrain({ engageMin: 4 }); b.state = 'engage';
  const cmds = []; for (let t = 0; t < 2; t += 0.05) cmds.push(b.update(0.05, ctx(0, 3)));
  assert.ok(cmds.some((c) => c.moveY < 0));
});

test('blessé (moins de 30 % de vie) : il se met à genoux pour tirer', () => {
  const b = new NpcBrain(); b.state = 'engage';
  const c = b.update(0.05, ctx(0, 10, { hpFrac: 0.2 }));
  assert.equal(c.crouch, true);
  assert.equal(b.update(0.05, ctx(0, 10, { hpFrac: 0.9 })).crouch, false);
});

test('touché : sursaut, puis il se bat, même sans voir le joueur', () => {
  const b = new NpcBrain({ hurtTime: 0.7 });
  b.hit({ x: 0, z: -15 });                              // le tireur est derrière lui
  assert.equal(b.update(0.05, ctx(0, -15, { canSee: false })).mode, 'hurt');
  run(b, 0.8, ctx(0, -15, { canSee: false }));
  assert.equal(b.state, 'engage');
  const c = b.update(0.05, ctx(0, -15, { canSee: false }));
  assert.ok(Math.abs(Math.abs(c.heading) - Math.PI) < 1e-9, 'il se retourne vers l endroit d où on lui a tiré dessus');
  assert.equal(c.moveY, 1, 'il va vers l ennemi');
});

test('bruit de tir : un PNJ tranquille va voir ; un PNJ trop loin n entend pas', () => {
  const b = new NpcBrain({ hearing: 45 });
  b.hear({ x: 0, z: -30 }, 30);
  assert.equal(b.state, 'alert');
  const far = new NpcBrain({ hearing: 45 });
  far.hear({ x: 0, z: -80 }, 80);
  assert.equal(far.state, 'patrol');
});

test('allié tombé : il est alerté, mais un PNJ déjà au combat ne change pas d état', () => {
  const b = new NpcBrain(); b.alarm({ x: 5, z: 5 }); assert.equal(b.state, 'alert');
  const c = new NpcBrain(); c.state = 'engage'; c.alarm({ x: 5, z: 5 }); assert.equal(c.state, 'engage');
});

test('il perd le joueur de vue : il cherche à sa dernière position, puis reprend sa ronde', () => {
  const b = new NpcBrain({ loseSight: 2 });
  b.state = 'engage'; b.update(0.05, ctx(0, 10));      // il voit : dernière position connue (0, 10)
  run(b, 2.5, ctx(0, 30, { canSee: false }));
  assert.equal(b.state, 'search');
  const m = b.update(0.05, ctx(0, 30, { canSee: false }));
  assert.equal(m.mode, 'search'); assert.ok(m.moveY > 0);
  const arrive = run(b, 4, { pos: { x: 0, z: 10 }, yaw: 0, player: { x: 0, z: 30, alive: true, speed: 0 }, canSee: false, hpFrac: 1 });
  assert.equal(b.state, 'patrol', 'après quelques secondes sur place, il retourne patrouiller');
});

test('le joueur est mort : le PNJ cesse le combat', () => {
  const b = new NpcBrain(); b.state = 'engage';
  b.update(0.05, ctx(0, 10, {}));
  const c = { ...ctx(0, 10), player: { x: 0, z: 10, alive: false, speed: 0 } };
  b.update(0.05, c);
  assert.equal(b.state, 'patrol');
});

test('mort : plus aucune commande, et les coups, bruits et alarmes sont ignorés', () => {
  const b = new NpcBrain(); b.die();
  assert.equal(b.update(0.05, ctx(0, 5)).mode, 'dead');
  b.hit({ x: 0, z: 1 }); b.hear({ x: 0, z: 1 }, 1); b.alarm({ x: 0, z: 1 });
  assert.equal(b.state, 'dead');
  b.reset(); assert.equal(b.state, 'patrol');
});

test('mêmes graines : les mêmes déplacements de côté (combats reproductibles)', () => {
  const seq = (seed) => { const b = new NpcBrain({ seed }); b.state = 'engage'; const r = []; for (let t = 0; t < 8; t += 0.05) r.push(b.update(0.05, ctx(0, 10)).moveX); return r; };
  assert.deepEqual(seq(5), seq(5));
});

// ---------------------------------------------------------------------------------------------- abri et esquive
const withCover = (c, find) => ({ ...c, cover: { find } });
const coverAt = (x, z, low = true) => () => ({ x, z, low });
const cmdsOver = (b, secs, c, dt = 0.05) => { const out = []; for (let t = 0; t < secs; t += dt) out.push(b.update(dt, c)); return out; };

test('abri : dès qu il voit l adversaire il court à l abri, s y accroupit, puis se relève pour tirer', () => {
  const b = new NpcBrain({ seed: 5, hideTime: 0.5, peekTime: 1.2 });
  b.state = 'engage';
  const c = withCover(ctx(0, 12), coverAt(-4, 0));          // abri à 4 m à l ouest
  const first = b.update(0.05, c);
  assert.equal(first.mode, 'cover'); assert.equal(b.sub, 'seek');
  assert.equal(first.moveY, 1, 'il court'); assert.equal(first.fire, false); assert.equal(first.aim, false);
  assert.ok(Math.abs(first.heading - Math.atan2(-4, 0)) < 1e-9, 'cap vers l abri');
  // arrivé à l abri : accroupi, caché
  const arrived = { ...c, pos: { x: -4, z: 0 }, yaw: Math.atan2(4, 12) };      // il regarde déjà l adversaire
  const hid = b.update(0.05, arrived);
  assert.equal(hid.crouch, true); assert.equal(hid.fire, false); assert.equal(b.sub, 'hide');
  // puis il se relève et tire
  const seq = cmdsOver(b, 2.5, arrived);
  assert.ok(seq.some((x) => x.crouch === false && x.aim && x.fire), 'il se relève et tire depuis l abri');
  assert.ok(seq.some((x) => x.crouch === true), 'il se recache entre deux sorties');
});

test('abri : sans abri disponible il combat à découvert comme avant', () => {
  const b = new NpcBrain({ seed: 3 });
  b.state = 'engage';
  const cmds = cmdsOver(b, 3, withCover(ctx(0, 10), () => null));
  assert.ok(cmds.every((x) => x.mode === 'engage'));
  assert.ok(cmds.some((x) => x.fire));
});

test('abri : il n en cherche pas s il ne voit pas l adversaire, et pas plus d un essai toutes les 2,5 s', () => {
  const b = new NpcBrain({ seed: 3 });
  b.state = 'engage';
  let calls = 0;
  const find = () => { calls++; return null; };
  cmdsOver(b, 1, withCover(ctx(0, 10, { canSee: false }), find));
  assert.equal(calls, 0, 'rien à fuir : il ne voit personne');
  cmdsOver(b, 5, withCover(ctx(0, 10), find));
  assert.ok(calls >= 1 && calls <= 3, `recherches espacées (${calls})`);
});

test('abri : après trois sorties il en cherche un autre ; touché, il réévalue aussitôt', () => {
  const b = new NpcBrain({ seed: 2, hideTime: 0.2, peekTime: 0.4 });
  b.state = 'engage';
  let n = 0;
  const find = () => { n++; return { x: -3, z: 0, low: true }; };
  const at = { ...withCover(ctx(0, 12), find), pos: { x: -3, z: 0 } };
  cmdsOver(b, 8, at);
  assert.ok(n >= 2, `nouvel abri choisi après les sorties (${n})`);
  b.coverPt = { x: -3, z: 0 }; b.sub = 'hide';
  b.hit({ x: 0, z: 12 });
  assert.equal(b.coverPt, null, 'touché : son abri n a pas suffi');
});

test('esquive : tiré dessus en combat, un pas de côté rapide (sans viser : viser ralentit), puis un temps de repos', () => {
  const b = new NpcBrain({ seed: 4, dodgeTime: 0.4, dodgeCooldown: 1.5 });
  b.state = 'engage';
  b.update(0.05, ctx(0, 10));
  b.underFire();
  const d = b.update(0.05, ctx(0, 10));
  assert.equal(Math.abs(d.moveX), 1, 'pas de côté à pleine allure'); assert.equal(d.aim, false); assert.equal(d.fire, false);
  const rest = cmdsOver(b, 0.6, ctx(0, 10));
  assert.ok(rest.some((x) => Math.abs(x.moveX) !== 1), 'l esquive est brève');
  b.underFire();      // dans la période de repos : ignoré
  assert.equal(b.dodgeT, 0);
});

test('esquive : sans effet hors combat, ou caché derrière l abri', () => {
  const p = new NpcBrain(); p.underFire(); assert.equal(p.dodgeT, 0, 'en patrouille');
  const h = new NpcBrain(); h.state = 'engage'; h.sub = 'hide'; h.underFire(); assert.equal(h.dodgeT, 0, 'caché : il ne bouge pas');
});

test('corps à corps : il quitte son abri pour frapper', () => {
  const b = new NpcBrain();
  b.state = 'engage'; b.coverPt = { x: 1, z: 0 }; b.sub = 'hide';
  const m = b.update(0.05, ctx(0, 1.2));
  assert.equal(m.mode, 'melee'); assert.equal(b.coverPt, null);
});

test('abri : le joueur est trop loin, il quitte l abri et avance', () => {
  const b = new NpcBrain(); b.state = 'engage'; b.coverPt = { x: -2, z: 0 }; b.sub = 'hide';
  const m = b.update(0.05, ctx(0, 24));
  assert.equal(m.moveY, 1); assert.equal(b.coverPt, null);
});
