import test from 'node:test';
import assert from 'node:assert/strict';
import { Mind } from '../src/npcmind.js';
import { NpcBrain } from '../src/npcbrain.js';
import { assignRoles, flankPoint, flankCandidates } from '../src/squad.js';

const situation = (o = {}) => ({ dist: 20, sees: true, hpFrac: 1, friends: 2, foes: 1, role: 'solo', canFlank: false, hasCover: true, inCover: false, ...o });
const settle = (mind, s, n = 12) => { for (let i = 0; i < n; i++) { mind.tick(0.5, { sees: s.sees }); mind.decide(s); } return mind.plan; };

test('chaque PNJ a un caractère différent, mais toujours le même pour une graine donnée', () => {
  const a = new Mind({ seed: 1 }).traits, b = new Mind({ seed: 2 }).traits, a2 = new Mind({ seed: 1 }).traits;
  assert.notDeepEqual(a, b);
  assert.deepEqual(a, a2);
  for (const v of Object.values(a)) assert.ok(v >= 0 && v <= 1);
});

test('le moral baisse quand il est touché, plus chez un peureux que chez un brave', () => {
  const coward = new Mind({ traits: { courage: 0.1, aggression: 0.5, caution: 0.5, teamwork: 0.5 } });
  const brave = new Mind({ traits: { courage: 0.95, aggression: 0.5, caution: 0.5, teamwork: 0.5 } });
  for (const m of [coward, brave]) { m.onHit(25, { x: 0, z: 0 }); m.onHit(25, { x: 0, z: 0 }); }
  assert.ok(coward.morale < brave.morale);
  assert.ok(coward.morale < 1);
  assert.deepEqual(coward.memory.shotFrom, { x: 0, z: 0 }, 'il se souvient d’où on lui a tiré dessus');
});

test('un camarade qui tombe tout près fait plus peur que s’il tombe au loin', () => {
  const near = new Mind({ seed: 3 }), far = new Mind({ seed: 3 });
  near.onAllyDown(5); far.onAllyDown(60);
  assert.ok(near.morale < far.morale);
  assert.equal(far.morale, 1);
});

test('le moral remonte quand il est tranquille et il reprend confiance en abattant un adversaire', () => {
  const m = new Mind({ seed: 4 });
  m.onHit(60); const low = m.morale;
  m.tick(2, { calm: true, safe: true, friends: 2 });
  assert.ok(m.morale > low);
  const before = m.morale; m.onSuccess(true);
  assert.ok(m.morale > before);
});

test('en bonne forme et avec le moral, un agressif fonce ; démoralisé, il se replie ou fuit', () => {
  const bold = new Mind({ traits: { courage: 0.9, aggression: 0.95, caution: 0.1, teamwork: 0.5 } });
  assert.equal(settle(bold, situation()), 'advance');
  const shaken = new Mind({ traits: { courage: 0.2, aggression: 0.5, caution: 0.5, teamwork: 0.5 } });
  shaken.morale = 0.3;
  assert.ok(['fallback', 'flee'].includes(settle(shaken, situation({ hpFrac: 0.5 }))));
  const broken = new Mind({ traits: { courage: 0.2, aggression: 0.5, caution: 0.5, teamwork: 0.5 } });
  broken.morale = 0.05;
  assert.equal(settle(broken, situation({ hpFrac: 0.3 })), 'flee');
});

test('celui qui a le rôle de contourner le fait quand c’est possible, sinon il couvre', () => {
  const m = new Mind({ traits: { courage: 0.7, aggression: 0.3, caution: 0.4, teamwork: 0.9 } });
  assert.equal(settle(m, situation({ role: 'flank', canFlank: true, flankSide: -1 })), 'flank');
  const n = new Mind({ traits: { courage: 0.7, aggression: 0.3, caution: 0.4, teamwork: 0.9 } });
  assert.notEqual(settle(n, situation({ role: 'flank', canFlank: false })), 'flank');
});

test('il ne change pas d’avis à chaque image : le plan tient au moins 1,5 s', () => {
  const m = new Mind({ seed: 9 });
  m.setPlan('suppress');
  m.planAge = 0; m.thinkIn = 0; m.morale = 0.45;
  const before = m.plan;
  m.decide(situation({ hpFrac: 0.8 }));
  assert.equal(m.plan, before, 'bonus du plan courant tant qu’il vient d’être choisi');
});

test('il pense à voix haute : une phrase en français accompagne chaque nouveau plan', () => {
  const m = new Mind({ seed: 5 });
  m.setPlan('flank', { flankSide: -1 });
  assert.match(m.thought, /gauche/);
  m.setPlan('flee');
  assert.ok(m.thought.length > 3);
  assert.equal(m.thoughtAge, 0);
});

test('mémoire : il déduit où l’adversaire va et le cherche plus loin que sa dernière position', () => {
  const m = new Mind({ seed: 6 });
  m.onSeen({ x: 0, z: 0 }, 0.1); m.onSeen({ x: 1, z: 0 }, 0.1); m.onSeen({ x: 2, z: 0 }, 0.1);   // il court vers +x
  assert.ok(m.memory.vel.x > 3);
  m.tick(2, { sees: false });
  const p = m.predicted();
  assert.ok(p.x > 2, 'plus loin que la dernière position vue');
  assert.ok(p.x < 2 + 7 * 2 + 0.1, 'sans dépasser un sprint');
  assert.equal(new Mind({ seed: 7 }).predicted(), null);
});

// ---------------------------------------------------------------- équipe
const mk = (id, x, z, courage = 0.5) => ({ id, x, z, courage, teamwork: 0.5 });

test('équipe : seul, il agit seul ; à plusieurs, un couvre et les autres contournent des deux côtés', () => {
  assert.equal(assignRoles([mk('a', 0, 20)], { x: 0, z: 0 }).a.role, 'solo');
  const r = assignRoles([mk('a', 0, 10), mk('b', -8, 25), mk('c', 9, 25)], { x: 0, z: 0 });
  assert.equal(r.a.role, 'suppress', 'le plus proche couvre');
  assert.equal(r.b.role, 'flank'); assert.equal(r.c.role, 'flank');
  assert.notEqual(r.b.side, r.c.side, 'tenaille : chacun d’un côté');
});

test('équipe : si tous sont du même côté, on alterne quand même', () => {
  const r = assignRoles([mk('a', 0, 10), mk('b', 6, 25), mk('c', 7, 28), mk('d', 8, 30)], { x: 0, z: 0 });
  const sides = ['b', 'c', 'd'].map((id) => r[id].side);
  assert.ok(sides.includes(1) && sides.includes(-1));
});

test('équipe : deux groupes éloignés ne se coordonnent pas ; les rôles restent stables', () => {
  const r = assignRoles([mk('a', 0, 10), mk('b', 5, 12), mk('c', 200, 10), mk('d', 205, 12)], { x: 0, z: 0 });
  assert.equal(r.a.size, 2); assert.equal(r.c.size, 2);
  const again = assignRoles([mk('a', 3, 3), mk('b', 5, 12), mk('c', 200, 10), mk('d', 205, 12)], { x: 0, z: 0 }, r);
  assert.deepEqual(again.a, r.a); assert.deepEqual(again.b, r.b);
});

test('contournement : le point est de côté de l’adversaire, pas devant le PNJ', () => {
  const pos = { x: 0, z: 20 }, threat = { x: 0, z: 0 };
  const l = flankPoint(pos, threat, -1), r = flankPoint(pos, threat, 1);
  assert.ok(Math.abs(l.x) > 8 && Math.abs(r.x) > 8);
  assert.ok(l.x * r.x < 0, 'un de chaque côté');
  assert.ok(flankCandidates(pos, threat, 1).length >= 8);
});

// ---------------------------------------------------------------- cerveau avec esprit
const ctxFor = (o = {}) => ({ pos: { x: 0, z: 0 }, yaw: 0, player: { x: 0, z: 20, alive: true, speed: 0 }, canSee: true, hpFrac: 1, ...o });
const brainWith = (traits, seed = 1) => new NpcBrain({ seed, mind: new Mind({ seed, traits }) });
const toEngage = (b, ctx) => { b.update(0.1, ctx); for (let i = 0; i < 20; i++) b.update(0.1, ctx); };

test('cerveau : un PNJ qui panique fuit vers un abri sans viser ni tirer', () => {
  const b = brainWith({ courage: 0.1, aggression: 0.3, caution: 0.5, teamwork: 0.5 });
  const ctx = ctxFor({ cover: { find: () => ({ x: -10, z: -15, low: true }) } });
  toEngage(b, ctx);
  b.mind.morale = 0.02; b.mind.thinkIn = 0; b.mind.planAge = 5;
  let cmd; for (let i = 0; i < 6; i++) { b.mind.thinkIn = 0; cmd = b.update(0.2, ctx); }
  assert.equal(b.plan, 'flee');
  assert.equal(cmd.fire, false); assert.equal(cmd.aim, false); assert.equal(cmd.sprint, true); assert.equal(cmd.moveY, 1);
  assert.ok(Math.sin(cmd.heading) < 0, 'il court vers le point de repli (à gauche)');
});

test('cerveau : celui qui contourne va vers le point de flanc fourni par le monde', () => {
  const b = brainWith({ courage: 0.8, aggression: 0.2, caution: 0.5, teamwork: 0.95 });
  const ctx = ctxFor({ nav: { flank: () => ({ x: 14, z: 12 }) }, tactics: { friends: 2, foes: 1, role: 'flank', side: 1 } });
  toEngage(b, ctx);
  let cmd; for (let i = 0; i < 12; i++) { b.mind.thinkIn = 0; cmd = b.update(0.1, ctx); }
  assert.equal(b.plan, 'flank');
  assert.ok(cmd.moveY === 1 && cmd.aim === false);
  assert.ok(Math.sin(cmd.heading) > 0.4, 'il se dirige vers le côté droit');
});

test('cerveau : sans chemin de contournement il renonce et attaque de front', () => {
  const b = brainWith({ courage: 0.8, aggression: 0.2, caution: 0.5, teamwork: 0.95 });
  const ctx = ctxFor({ nav: { flank: () => null }, tactics: { friends: 2, foes: 1, role: 'flank', side: 1 } });
  toEngage(b, ctx);
  for (let i = 0; i < 12; i++) { b.mind.thinkIn = 0; b.update(0.1, ctx); }
  assert.notEqual(b.plan, 'flank');
});

test('cerveau : un appel radio l’alerte vers la bonne zone ; touché, il perd du moral', () => {
  const b = brainWith({ courage: 0.5, aggression: 0.5, caution: 0.5, teamwork: 0.5 });
  b.intel({ x: 30, z: 40 }, 3);
  assert.equal(b.state, 'alert');
  assert.ok(Math.abs(b.last.x - 30) <= 3 && Math.abs(b.last.z - 40) <= 3);
  assert.ok(b.thought.length > 0);
  const m0 = b.mind.morale; b.hit({ x: 0, z: 0 }, 40);
  assert.ok(b.mind.morale < m0);
});

test('cerveau : il a perdu l’adversaire de vue, il va là où il a dû passer', () => {
  const b = brainWith({ courage: 0.8, aggression: 0.9, caution: 0.1, teamwork: 0.5 });
  let player = { x: 0, z: 20, alive: true, speed: 5 };
  for (let i = 0; i < 25; i++) { player = { ...player, x: player.x + 0.5 }; b.update(0.1, ctxFor({ player })); }      // il court vers +x à 5 m/s
  for (let i = 0; i < 20; i++) b.update(0.1, ctxFor({ player, canSee: false }));
  const cmd = b.update(0.1, ctxFor({ player, canSee: false }));
  assert.ok(Math.sin(cmd.heading) > Math.sin(Math.atan2(player.x, player.z - 0)) - 0.2, 'il vise plus loin que la dernière position vue');
});
