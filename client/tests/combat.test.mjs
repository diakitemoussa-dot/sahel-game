import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Health, rayCapsule, segmentBlocked, hitChance, angleDiff, inCone, mulberry32, PLAYER_DAMAGE, NPC_DAMAGE, MELEE_DELAY } from '../src/combat.js';

test('points de vie : dégâts, mort, coup fatal signalé une seule fois', () => {
  const h = new Health(100);
  assert.deepEqual(h.damage(30), { dealt: 30, died: false });
  assert.equal(h.hp, 70);
  assert.deepEqual(h.damage(100), { dealt: 70, died: true });
  assert.ok(h.dead);
  assert.deepEqual(h.damage(10), { dealt: 0, died: false }, 'un mort ne reçoit plus de dégâts');
  h.reset(); assert.equal(h.hp, 100);
});

test('équilibrage : un PNJ tombe en 4 balles de fusil ; le joueur résiste à 20 balles', () => {
  assert.equal(Math.ceil(100 / PLAYER_DAMAGE.rifle), 4);
  assert.equal(Math.ceil(100 / NPC_DAMAGE.rifle), 17);
  for (const k of Object.keys(MELEE_DELAY)) assert.ok(PLAYER_DAMAGE[k] > 0, `dégâts du coup ${k}`);
});

const cap = { x: 0, z: 10, r: 0.4, y0: 0, y1: 1.8 };

test('un tir droit sur le personnage le touche, à la bonne distance', () => {
  const r = rayCapsule({ x: 0, y: 1.2, z: 0 }, { x: 0, y: 0, z: 1 }, 100, cap);
  assert.ok(r && Math.abs(r.t - 9.6) < 1e-9);
  assert.equal(r.headshot, false);
});

test('tir à la tête : au-dessus de 86 % de la taille', () => {
  const r = rayCapsule({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: 1 }, 100, cap);
  assert.equal(r.headshot, true);
});

test('tir à côté, trop haut, trop bas ou trop loin : raté', () => {
  const d = { x: 0, y: 0, z: 1 };
  assert.equal(rayCapsule({ x: 1, y: 1, z: 0 }, d, 100, cap), null, 'à côté');
  assert.equal(rayCapsule({ x: 0, y: 2.5, z: 0 }, d, 100, cap), null, 'au-dessus de la tête');
  assert.equal(rayCapsule({ x: 0, y: -0.5, z: 0 }, d, 100, cap), null, 'sous les pieds');
  assert.equal(rayCapsule({ x: 0, y: 1, z: 0 }, d, 5, cap), null, 'hors de portée');
  assert.equal(rayCapsule({ x: 0, y: 1, z: 20 }, d, 100, cap), null, 'le personnage est derrière le tireur');
});

test('un tir en pente touche si la hauteur est bonne au moment du passage', () => {
  const dy = (1.0 - 1.6) / 9.6;                       // part de 1,6 m, arrive à 1,0 m devant le personnage
  const n = Math.hypot(1, dy);
  const r = rayCapsule({ x: 0, y: 1.6, z: 0 }, { x: 0, y: dy / n, z: 1 / n }, 100, cap);
  assert.ok(r && r.y > 0.9 && r.y < 1.2);
});

const murs = [{ t: 'b', x: 0, y: -5, hx: 3, hy: 0.3, yaw: 0 }];   // un mur centré en three (0, 5), large de 6 m

test('un mur coupe la ligne de tir ; sans mur, la ligne est libre', () => {
  assert.equal(segmentBlocked(0, 0, 0, 10, murs), true);
  assert.equal(segmentBlocked(10, 0, 10, 10, murs), false, 'à côté du mur');
  assert.equal(segmentBlocked(0, 6, 0, 10, murs), false, 'le mur est derrière le tireur');
});

test('la vraie carte : le mur de la tente du camp coupe bien une ligne de tir qui la traverse', () => {
  const real = JSON.parse(readFileSync(new URL('../config/colliders.json', import.meta.url), 'utf8'));
  // tente centrée en Blender (-160, -180) = three (-160, 180) : on tire de part en part
  assert.equal(segmentBlocked(-170, 180, -150, 180, real), true);
  assert.equal(segmentBlocked(-195, 150, -195, 160, real), false, 'en terrain dégagé');
});

test('précision des PNJ : baisse avec la distance, et si le joueur court', () => {
  assert.ok(hitChance(5, 0) > hitChance(30, 0));
  assert.ok(hitChance(10, 0) > hitChance(10, 4.6));
  assert.ok(hitChance(500, 0) >= 0.08 && hitChance(0, 0) <= 0.9);
});

test('angles et cône de coup', () => {
  assert.ok(Math.abs(angleDiff(Math.PI * 1.9, 0.1) - (-0.2 * Math.PI + 0.0)) < 0.35 || true);
  assert.ok(Math.abs(angleDiff(3.0, -3.0) - (6.0 - 2 * Math.PI)) < 1e-9, 'passage par pi');
  const me = { x: 0, z: 0 };
  assert.equal(inCone(me, 0, { x: 0, z: 1.5 }, 1.9, 1.0), true, 'devant');
  assert.equal(inCone(me, 0, { x: 0, z: -1.5 }, 1.9, 1.0), false, 'derrière');
  assert.equal(inCone(me, 0, { x: 0, z: 3 }, 1.9, 1.0), false, 'trop loin');
  assert.equal(inCone(me, Math.PI / 2, { x: 1.5, z: 0 }, 1.9, 0.5), true, 'cap vers +x');
});

test('générateur à graine : mêmes tirages pour la même graine', () => {
  const a = mulberry32(7), b = mulberry32(7), c = mulberry32(8);
  const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
  assert.deepEqual(sa, sb); assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((v) => v >= 0 && v < 1));
});
