import test from 'node:test';
import assert from 'node:assert/strict';
import { Follower, chooseTarget } from '../src/allybrain.js';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('formation : la place est à côté et derrière le joueur (gauche = +x quand il regarde +z)', () => {
  const f = new Follower({ slot: [2, 3] });
  const g = f.goal({ x: 10, z: 10, yaw: 0 });
  assert.ok(near(g.x, 12) && near(g.z, 7), 'à gauche (+x) et 3 m derrière (-z)');
  const h = f.goal({ x: 0, z: 0, yaw: Math.PI / 2 });          // il regarde +x : derrière = -x, gauche = -z
  assert.ok(near(h.x, -3) && near(h.z, -2, 1e-9));
  const r = new Follower({ slot: [-2, 3] }).goal({ x: 0, z: 0, yaw: 0 });
  assert.ok(near(r.x, -2), 'slot négatif : à droite');
});

test('il reste près du joueur sans bouger, repart quand il s éloigne, et ne tremble pas', () => {
  const f = new Follower({ slot: [0, 2], stop: 1, go: 2.5 });
  const leader = { x: 0, z: 0, yaw: 0 };                         // place visée : (0, -2)
  assert.equal(f.command({ x: 0, z: -2.3 }, leader).moveY, 0, 'à 0,3 m de sa place : il ne bouge pas');
  assert.equal(f.command({ x: 0, z: -4.2 }, leader).moveY, 0, 'à 2,2 m : sous la marge de départ (2,5) : toujours immobile');
  assert.equal(f.command({ x: 0, z: -5 }, leader).moveY, 0.5, 'à 3 m : il se met en marche');
  assert.equal(f.command({ x: 0, z: -3.6 }, leader).moveY, 0.5, 'à 1,6 m : il continue (marge)');
  assert.equal(f.command({ x: 0, z: -2.5 }, leader).moveY, 0, 'à 0,5 m : arrêté');
});

test('allure selon la distance : marche, course, sprint', () => {
  const l = { x: 0, z: 0, yaw: 0 };
  const walk = new Follower({ slot: [0, 0] }).command({ x: 3, z: 0 }, l);
  assert.equal(walk.moveY, 0.5); assert.equal(walk.sprint, false);
  const run = new Follower({ slot: [0, 0] }).command({ x: 6, z: 0 }, l);
  assert.equal(run.moveY, 1); assert.equal(run.sprint, false);
  const sprint = new Follower({ slot: [0, 0] }).command({ x: 25, z: 0 }, l);
  assert.equal(sprint.moveY, 1); assert.equal(sprint.sprint, true);
});

test('cap : il se tourne vers sa place en marchant, et regarde comme le joueur quand il est arrêté', () => {
  const f = new Follower({ slot: [0, 0] });
  const go = f.command({ x: 5, z: 0 }, { x: 0, z: 0, yaw: 1.0 });
  assert.ok(near(go.heading, -Math.PI / 2), 'la place est à l ouest (-x) : cap -pi/2');
  const idle = new Follower({ slot: [0, 0] }).command({ x: 0.2, z: 0 }, { x: 0, z: 0, yaw: 1.0 });
  assert.equal(idle.moveY, 0); assert.equal(idle.heading, 1.0);
  assert.equal(go.mode, 'follow'); assert.equal(go.fire, false);
  assert.equal(go.ready, true, 'le fusil reste levé en suivant (pas de pose détendue voûtée)'); assert.equal(idle.ready, true);
});

const los = (visibles) => (c) => visibles.includes(c.id);

test('cible : le plus proche des visibles ; un visible lointain avant un proche caché', () => {
  const pos = { x: 0, z: 0 };
  const cs = [{ id: 'a', x: 5, z: 0 }, { id: 'b', x: 20, z: 0 }, { id: 'c', x: 12, z: 0 }];
  assert.equal(chooseTarget(pos, cs, los(['a', 'b', 'c'])).target.id, 'a');
  assert.equal(chooseTarget(pos, cs, los(['b', 'c'])).target.id, 'c', 'a est caché : on prend le plus proche des visibles');
  const r = chooseTarget(pos, cs, los([]));
  assert.equal(r.target.id, 'a'); assert.equal(r.visible, false, 'aucun visible : le plus proche, signalé comme non visible');
  assert.equal(chooseTarget(pos, [], los([])), null);
});

test('cible : portée maximale, et fidélité à la cible précédente', () => {
  const pos = { x: 0, z: 0 };
  assert.equal(chooseTarget(pos, [{ id: 'x', x: 50, z: 0 }], () => true, { range: 30 }).visible, false, 'trop loin : pas considéré comme visible');
  const cs = [{ id: 'a', x: 10, z: 0 }, { id: 'b', x: 9, z: 0 }];
  assert.equal(chooseTarget(pos, cs, () => true).target.id, 'b');
  assert.equal(chooseTarget(pos, cs, () => true, { previous: 'a' }).target.id, 'a', 'il reste sur a (légèrement plus loin)');
  const far = [{ id: 'a', x: 20, z: 0 }, { id: 'b', x: 6, z: 0 }];
  assert.equal(chooseTarget(pos, far, () => true, { previous: 'a' }).target.id, 'b', 'mais change si l autre est bien plus proche');
});

test('anti-blocage : coincé contre un obstacle, il saute et contourne d un côté, puis de l autre', () => {
  const f = new Follower({ slot: [0, 0] });
  const leader = { x: 0, z: 20, yaw: 0 };
  const stuck = { x: 0, z: 0 };                                     // il n avance pas
  let first = null, jumps = 0; const heads = [];
  for (let t = 0; t < 3.5; t += 0.05) {
    const c = f.command(stuck, leader, 0.05);
    if (c.jump) jumps++;
    if (first === null) first = c.heading;
    heads.push(c.heading);
  }
  assert.ok(near(first, 0), 'd abord droit vers sa place');
  assert.ok(jumps >= 2, `il saute quand il est coincé (${jumps})`);
  const dev = heads.filter((h) => Math.abs(h) > 0.5);
  assert.ok(dev.some((h) => h > 0.5) && dev.some((h) => h < -0.5), 'il tente à droite puis à gauche');
});

test('anti-blocage : s il avance normalement, il ne saute pas et ne dévie pas', () => {
  const f = new Follower({ slot: [0, 0] });
  const leader = { x: 0, z: 40, yaw: 0 };
  let z = 0, jumps = 0, dev = 0;
  for (let t = 0; t < 4; t += 0.05) {
    const c = f.command({ x: 0, z }, leader, 0.05);
    if (c.jump) jumps++; if (Math.abs(c.heading) > 0.01) dev++;
    z += 5 * 0.05;
  }
  assert.equal(jumps, 0); assert.equal(dev, 0);
});
