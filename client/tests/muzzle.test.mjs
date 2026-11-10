import test from 'node:test';
import assert from 'node:assert/strict';
import { heatColor, flashLevel, burstSpecs, FLAME_SIZE } from '../src/muzzle.js';
import { mulberry32 } from '../src/combat.js';

test('couleur de flamme : cœur blanc-jaune, puis orange, puis braise rouge sombre', () => {
  const [r1, g1, b1] = heatColor(1), [r2, g2] = heatColor(0.35), [r3, g3] = heatColor(0);
  assert.ok(r1 > 0.95 && g1 > 0.9 && b1 > 0.6, 'chaud : presque blanc');
  assert.ok(r2 > 0.95 && g2 > 0.3 && g2 < 0.5, 'orange');
  assert.ok(r3 < 0.5 && g3 < 0.15, 'froid : rouge sombre');
  for (let h = 0; h <= 1; h += 0.05) { const c = heatColor(h); assert.ok(c.every((v) => v >= 0 && v <= 1)); }
  assert.ok(heatColor(0.9)[1] > heatColor(0.4)[1], 'plus c est chaud, plus c est clair');
  assert.deepEqual(heatColor(-5), heatColor(0)); assert.deepEqual(heatColor(9), heatColor(1));
});

test('éclair : maximal au premier instant, il s éteint, puis plus rien', () => {
  assert.equal(flashLevel(0), 1);
  assert.ok(flashLevel(0.02) > flashLevel(0.05));
  assert.equal(flashLevel(0.07), 0); assert.equal(flashLevel(1), 0); assert.equal(flashLevel(-0.1), 0);
});

test('un coup de feu : de la flamme, des étincelles et un peu de fumée, surtout vers l avant', () => {
  const s = burstSpecs(mulberry32(5));
  assert.ok(s.fire.length >= 8 && s.sparks.length >= 4 && s.smoke.length >= 2);
  const avant = s.fire.filter((p) => p.v[0] > 2).length;
  assert.ok(avant >= s.fire.length * 0.6, 'la boule de feu jaillit vers l avant');
  assert.ok(s.fire.some((p) => p.v[0] <= 0), 'avec un peu de reflux vers l arrière');
  const vf = Math.max(...s.fire.map((p) => p.v[0])), vs = Math.max(...s.sparks.map((p) => p.v[0]));
  assert.ok(vs > vf * 0.9, 'les étincelles vont plus vite que la flamme');
});

test('durées : la flamme est brève (dixièmes de seconde), la fumée s attarde, les étincelles sont fines', () => {
  const s = burstSpecs(mulberry32(9));
  assert.ok(s.fire.every((p) => p.life >= 0.08 && p.life <= 0.3));
  assert.ok(s.smoke.every((p) => p.life >= 0.5 && p.life <= 1.2));
  assert.ok(s.sparks.every((p) => p.size0 < 0.08) && s.fire.every((p) => p.size0 > 0.1));
  assert.ok(s.fire.every((p) => p.size1 > p.size0), 'la flamme grossit en s éteignant');
  assert.ok(s.fire.every((p) => p.alpha > 0.5 && p.alpha <= 1));
});

test('l échelle (pistolet) rétrécit l effet ; même graine = même flamme', () => {
  const g = burstSpecs(mulberry32(3), 1), p = burstSpecs(mulberry32(3), 0.6);
  assert.ok(p.fire[5].size1 < g.fire[5].size1);
  assert.deepEqual(burstSpecs(mulberry32(3)), g);
  assert.notDeepEqual(burstSpecs(mulberry32(4)), g);
});

test('la flamme reste petite : réglage de taille bien en dessous du modèle de base', () => {
  assert.ok(FLAME_SIZE > 0.1 && FLAME_SIZE <= 0.4, 'une petite flamme, pas une boule de feu');
});
