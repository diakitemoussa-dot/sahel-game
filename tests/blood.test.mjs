import test from 'node:test';
import assert from 'node:assert/strict';
import { splatSpecs, poolRadius, decalAlpha, groundNormal } from '../src/blood.js';
import { mulberry32 } from '../src/combat.js';

const norm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };

test('le jet part dans le sens du tir : les gouttes vont en moyenne dans la direction de la balle', () => {
  const dir = norm([1, 0, 0]);
  const s = splatSpecs(mulberry32(4), dir, 0.6);
  const mean = s.drops.reduce((a, d) => a + d.v[0], 0) / s.drops.length;
  assert.ok(mean > 2, 'vers +x');
  const dir2 = norm([0, 0, -1]);
  const s2 = splatSpecs(mulberry32(4), dir2, 0.6);
  assert.ok(s2.drops.reduce((a, d) => a + d.v[2], 0) / s2.drops.length < -2, 'vers -z');
});

test('plus le coup est grave, plus il y a de sang', () => {
  const a = splatSpecs(mulberry32(1), [1, 0, 0], 0.2), b = splatSpecs(mulberry32(1), [1, 0, 0], 1.2);
  assert.ok(b.drops.length > a.drops.length * 2);
  assert.ok(b.mist.length > a.mist.length);
  assert.ok(a.drops.length >= 4 && a.drops.length <= 10, 'une égratignure : quelques gouttes seulement');
  assert.ok(b.drops.length <= 26, 'même un coup fatal reste mesuré');
});

test('gouttes fines et brèves, brume qui grossit en s effaçant, un peu de relief vers le haut', () => {
  const s = splatSpecs(mulberry32(9), [0, 0, 1], 0.8);
  assert.ok(s.drops.every((d) => d.size >= 0.018 && d.size <= 0.05 && d.life >= 0.5 && d.life <= 1.2));
  assert.ok(s.drops.every((d) => d.v[1] > 0), 'elles sont projetées vers le haut avant de retomber');
  assert.ok(s.mist.every((m) => m.size1 > m.size0 && m.alpha > 0 && m.alpha < 0.5 && m.life < 0.4));
});

test('tirage reproductible avec la même graine', () => {
  assert.deepEqual(splatSpecs(mulberry32(7), [0, 0, 1], 0.5), splatSpecs(mulberry32(7), [0, 0, 1], 0.5));
  assert.notDeepEqual(splatSpecs(mulberry32(7), [0, 0, 1], 0.5), splatSpecs(mulberry32(8), [0, 0, 1], 0.5));
});

test('mare : naît à rayon nul, s étend vite puis se stabilise sous le maximum', () => {
  assert.equal(poolRadius(0), 0); assert.equal(poolRadius(-3), 0);
  assert.ok(poolRadius(1) > 0.15 && poolRadius(1) < poolRadius(3));
  assert.ok(poolRadius(30) < 0.5 + 1e-9 && poolRadius(30) > 0.49, 'mare discrète : 1 m de large au maximum');
  let prev = -1; for (let t = 0; t < 12; t += 0.5) { const r = poolRadius(t); assert.ok(r >= prev); prev = r; }
});

test('tache : nette longtemps, puis elle sèche et s efface, puis disparaît', () => {
  assert.equal(decalAlpha(0), 0.85); assert.equal(decalAlpha(20), 0.85);
  assert.ok(decalAlpha(45) < 0.85 && decalAlpha(45) > 0);
  assert.ok(decalAlpha(40) > decalAlpha(55));
  assert.equal(decalAlpha(60), 0); assert.equal(decalAlpha(999), 0); assert.equal(decalAlpha(-1), 0);
});

test('normale du sol : verticale sur du plat, penchée du bon côté sur une pente', () => {
  const plat = groundNormal(() => 3, 10, 10);
  assert.ok(Math.abs(plat[1] - 1) < 1e-9 && Math.abs(plat[0]) < 1e-9 && Math.abs(plat[2]) < 1e-9);
  const pente = groundNormal((x) => 0.5 * x, 0, 0);                    // monte vers +x : la normale penche vers -x
  assert.ok(pente[0] < -0.4 && pente[1] > 0.8);
  assert.ok(Math.abs(Math.hypot(...pente) - 1) < 1e-9);
  const penteZ = groundNormal((x, z) => -0.3 * z, 0, 0);               // descend vers +z : la normale penche vers +z
  assert.ok(penteZ[2] > 0.2);
});
