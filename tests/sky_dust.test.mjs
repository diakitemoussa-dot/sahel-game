import test from 'node:test';
import assert from 'node:assert/strict';
import { sunDirection, SUN } from '../src/sky.js';
import { wrap, wind, ParticlePool } from '../src/dust.js';

test('direction du soleil : vecteur unitaire, à l élévation demandée, du côté demandé', () => {
  const d = sunDirection(38, 34);
  assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9);
  assert.ok(Math.abs(Math.asin(d[1]) * 180 / Math.PI - 34) < 1e-9, 'élévation');
  assert.ok(d[0] > 0 && d[2] > 0, 'azimut positif : vers l avant et la gauche');
  assert.deepEqual(sunDirection(0, 90).map((v) => +v.toFixed(9)), [0, 1, 0]);
  assert.ok(Math.abs(Math.hypot(...SUN) - 1) < 1e-9);
  assert.ok(SUN[2] < 0 && SUN[0] < 0 && SUN[1] > 0.5, 'le soleil est celui de la lumière d origine du jeu : derrière le joueur au départ, à droite, haut');
  assert.ok(Math.abs(SUN[0] / SUN[1] - (-60 / 90)) < 1e-9 && Math.abs(SUN[2] / SUN[1] - (-40 / 90)) < 1e-9, 'même direction que la lumière (-60, 90, -40)');
});

test('les grains qui sortent de la zone ressortent de l autre côté', () => {
  assert.equal(wrap(9, 0, 10), 9);
  assert.ok(Math.abs(wrap(11, 0, 10) - (-9)) < 1e-9);
  assert.ok(Math.abs(wrap(-11, 0, 10) - 9) < 1e-9);
  assert.ok(Math.abs(wrap(105, 100, 10) - 105) < 1e-9);
  for (const v of [-1000, -13.3, 0, 7, 99.9, 12345]) { const w = wrap(v, 5, 20); assert.ok(w >= -15 && w <= 25); }
});

test('le vent souffle toujours dans le même sens, avec des rafales, sans jamais tomber à zéro', () => {
  const speeds = []; for (let t = 0; t < 120; t += 0.5) { const [x, z] = wind(t); assert.ok(x > 0 && z > 0); speeds.push(Math.hypot(x, z)); }
  assert.ok(Math.max(...speeds) > 1.6 * Math.min(...speeds), 'les rafales font varier la force du vent');
  assert.ok(Math.min(...speeds) > 0.3);
});

test('nuage de poussière : naît, grossit, s s efface, puis libère sa place', () => {
  const p = new ParticlePool(8);
  p.spawn(0, 0, 0, 1, 0, 0, 1.0, 0.2, 1.0, 0.5);
  assert.equal(p.alive, 1);
  const start = p.look(0), mid = (p.update(0.5), p.look(0));
  assert.ok(start.alpha < 0.05, 'invisible à la naissance (pas de pop)');
  assert.ok(mid.size > start.size, 'elle grossit');
  assert.ok(p.pos[0] > 0, 'elle avance avec sa vitesse');
  p.update(0.6);
  assert.equal(p.alive, 0, 'morte au bout de sa durée de vie');
  assert.deepEqual(p.look(0), { size: 0, alpha: 0 });
});

test('réserve pleine : la plus ancienne particule est remplacée, aucune ne dépasse la capacité', () => {
  const p = new ParticlePool(4);
  for (let i = 0; i < 10; i++) p.spawn(i, 0, 0, 0, 0, 0, 5, 1, 1, 1);
  assert.equal(p.alive, 4);
  assert.ok([...p.pos].filter((_, k) => k % 3 === 0).every((x) => x >= 6), 'seules les 4 dernières sont gardées');
});

test('le vent pousse les particules et le freinage les ralentit', () => {
  const p = new ParticlePool(2);
  p.spawn(0, 0, 0, 5, 0, 0, 10, 1, 1, 1);
  for (let i = 0; i < 20; i++) p.update(0.1, 0, 0);
  assert.ok(Math.abs(p.vel[0]) < 1, 'freinée');
  const q = new ParticlePool(2); q.spawn(0, 0, 0, 0, 0, 0, 10, 1, 1, 1);
  for (let i = 0; i < 20; i++) q.update(0.1, 2, 0);
  assert.ok(q.vel[0] > 0.5, 'poussée par le vent');
});
