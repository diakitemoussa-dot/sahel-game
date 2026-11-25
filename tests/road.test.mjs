import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sampleCurve } from '../src/road.js';

const cfg = JSON.parse(readFileSync(new URL('../config/road.json', import.meta.url), 'utf8'));

test('la courbe passe par le premier et le dernier point, sans trou', () => {
  const pts = cfg.roads[0].points;
  const c = sampleCurve(pts, 1.5);
  assert.deepEqual(c[0].map(Math.round), pts[0]);
  assert.deepEqual(c.at(-1).map(Math.round), pts.at(-1));
  for (let i = 1; i < c.length; i++) assert.ok(Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]) < 2.5, 'pas de saut');
});

test('la piste est longue (plus de 350 m) et reste dans la carte', () => {
  const c = sampleCurve(cfg.roads[0].points, 1.5);
  let len = 0; for (let i = 1; i < c.length; i++) len += Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]);
  assert.ok(len > 350, `longueur ${len}`);
  for (const [x, y] of c) assert.ok(Math.abs(x) <= 250 && Math.abs(y) <= 250);
});

import { roadGroundPatch } from '../src/road.js';

test('le sol prend la hauteur de la piste sur la piste, puis retombe à zéro autour', () => {
  const samples = []; for (let x = 0; x <= 40; x += 1.5) samples.push({ x, z: 0, d: 0.15 });
  const patch = roadGroundPatch(samples, 3);
  assert.ok(Math.abs(patch(20, 0) - 0.15) < 1e-9, 'sur l’axe');
  assert.ok(Math.abs(patch(20, 2.9) - 0.15) < 1e-9, 'sur le bord de la piste');
  assert.ok(patch(20, 4) > 0 && patch(20, 4) < 0.15, 'fondu sur les côtés');
  assert.equal(patch(20, 8), 0, 'loin de la piste : le sol ne change pas');
  assert.equal(patch(500, 500), 0);
});
