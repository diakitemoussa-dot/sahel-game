import test from 'node:test';
import assert from 'node:assert/strict';
import { rampIntensity, columnLook, fireLook, siteRate, fadeIntensity, StrikeScheduler, pickStrike, missilePath } from '../src/smokelogic.js';

test('fumée : petite et chaude au pied, grosse et claire en haut, qui s\'efface à la fin', () => {
  const lo = columnLook(0.03, 3, 20, 0.8), mid = columnLook(0.5, 3, 20, 0.8), hi = columnLook(0.95, 3, 20, 0.8);
  assert.ok(lo.size < mid.size && mid.size < hi.size);
  assert.ok(lo.heat > 0.5 && mid.heat < 0.05, 'lueur orange seulement près du foyer');
  assert.ok(lo.light < mid.light && mid.light < hi.light, 's\'éclaircit en montant');
  assert.ok(mid.alpha > 0.7 && hi.alpha < mid.alpha * 0.4, 'presque invisible à la fin');
  assert.equal(columnLook(1, 3, 20, 0.8).alpha, 0); assert.equal(columnLook(0, 3, 20, 0.8).alpha, 0);
  assert.ok(columnLook(2, 3, 20, 0.8).size <= 20.001 && columnLook(-1, 3, 20, 0.8).size >= 3, 'âge hors bornes ramené dans [0,1]');
});

test('flamme : rétrécit, perd sa blancheur, s\'éteint', () => {
  const a = fireLook(0.1, 2, 1), b = fireLook(0.8, 2, 1);
  assert.ok(a.size > b.size && a.heat > b.heat && a.alpha > b.alpha);
  assert.equal(fireLook(1, 2, 1).alpha, 0);
});

test('cadence d\'émission : normale de près, réduite au loin, nulle très loin ou éteint', () => {
  assert.equal(siteRate(10, 1, 100), 10);
  assert.ok(siteRate(10, 1, 400) < 10 && siteRate(10, 1, 400) > 0);
  assert.equal(siteRate(10, 1, 600), 0); assert.equal(siteRate(10, 0, 50), 0);
  assert.equal(siteRate(10, 0.5, 100), 5);
});

test('foyer d\'impact : monte vite, brûle, puis s\'éteint', () => {
  assert.ok(fadeIntensity(0, 80) < 0.01 && fadeIntensity(10, 80) > 0.95);
  assert.ok(fadeIntensity(70, 80) < fadeIntensity(40, 80)); assert.equal(fadeIntensity(80, 80), 0);
});

test('les frappes sont espacées : la première après le délai, puis entre min et max', () => {
  let r = 0; const s = new StrikeScheduler({ first: 10, min: 20, max: 40, rng: () => r });
  let t = 0, n = 0; const times = [];
  for (; t < 200; t += 0.5) if (s.update(0.5)) { n++; times.push(t); }
  assert.ok(times[0] >= 9.5 && times[0] <= 10.5);
  assert.ok(times[1] - times[0] >= 19.5 && times[1] - times[0] <= 20.5, 'rng=0 : intervalle minimum');
  r = 0.999; const s2 = new StrikeScheduler({ first: 0, min: 20, max: 40, rng: () => r });
  s2.update(0.1); assert.ok(s2.left > 39);
});

test('cible d\'une frappe : ni trop près ni trop loin, de préférence devant le joueur', () => {
  const player = { x: 0, z: 0 };
  const sites = [{ x: 10, z: 10 }, { x: 0, z: 150 }, { x: 0, z: -150 }, { x: 900, z: 0 }];
  assert.equal(pickStrike([{ x: 10, z: 10 }, { x: 900, z: 0 }], player, 0), null, 'trop près et trop loin : aucune');
  let front = 0;
  for (let i = 0; i < 400; i++) { const p = pickStrike(sites, player, 0, Math.random); if (p.z > 0) front++; assert.ok(Math.hypot(p.x, p.z) > 100); }
  assert.ok(front > 280, `devant : ${front}/400 (poids 4 contre 1)`);
  const p = pickStrike([{ x: 0, z: 150 }], player, 0, () => 0.5);
  assert.ok(Math.hypot(p.x, p.z - 150) <= 16 + 1e-9, 'tombe près du foyer, pas pile dessus');
});

test('trajectoire du missile : part d\'en haut et arrive au sol à l\'impact', () => {
  const from = { x: 200, y: 120, z: 0 }, to = { x: 0, y: 0, z: 0 };
  const a = missilePath(from, to, 0), b = missilePath(from, to, 0.5), c = missilePath(from, to, 1);
  assert.deepEqual(a, from); assert.deepEqual(c, to);
  assert.ok(b.y > 120 * 0.3, 'à mi-chemin il est encore haut'); assert.equal(b.x, 100);
  assert.ok(missilePath(from, to, 2).y === 0 && missilePath(from, to, -1).y === 120);
});

test('foyer qui s allume : monte progressivement jusqu a la cible, sans la dépasser', () => {
  let v = 0, t = 0; while (v < 1 && t < 30) { v = rampIntensity(v, 1, 0.05, 0.12); t += 0.05; }
  assert.ok(t > 7 && t < 9.5, `plein feu après ${t.toFixed(1)} s`);
  assert.equal(rampIntensity(0.99, 1, 1), 1); assert.equal(rampIntensity(1, 1, 1), 1);
  assert.ok(rampIntensity(1, 0, 1) < 1 && rampIntensity(0.05, 0, 1) === 0, 'redescend aussi');
});
