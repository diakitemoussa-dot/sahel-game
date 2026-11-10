import test from 'node:test';
import assert from 'node:assert/strict';
import { radarPoint, RADAR_RANGE } from '../src/radar.js';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const o = { x: 10, z: 20 };

test('devant = en haut, derrière = en bas, droite = à droite (cap 0 : la droite est -x)', () => {
  const f = radarPoint(o, 0, { x: 10, z: 20 + 70 });
  assert.ok(near(f.x, 0) && f.y < 0 && near(f.y, -0.47), 'devant, à mi-portée : en haut');
  const b = radarPoint(o, 0, { x: 10, z: 20 - 70 });
  assert.ok(b.y > 0, 'derrière : en bas');
  const r = radarPoint(o, 0, { x: 10 - 70, z: 20 });
  assert.ok(r.x > 0 && near(r.y, 0), 'à droite (-x quand on regarde +z)');
});

test('le radar tourne avec la caméra : la même cible passe de devant à droite quand la caméra tourne à gauche de 90° (vers +x)', () => {
  const t = { x: 10, z: 20 + 50 };                                // devant pour le cap 0
  assert.ok(radarPoint(o, 0, t).y < 0);
  const p = radarPoint(o, Math.PI / 2, t);                        // la caméra regarde maintenant vers +x : la cible (en +z) est à sa droite
  assert.ok(p.x > 0.3 && Math.abs(p.y) < 1e-9);
});

test('hors de portée : posée sur le bord du cercle, dans sa direction', () => {
  const p = radarPoint(o, 0, { x: 10, z: 20 + 500 });
  assert.equal(p.far, true);
  assert.ok(near(Math.hypot(p.x, p.y), 0.94) && p.y < 0 && near(p.x, 0));
  const inside = radarPoint(o, 0, { x: 10, z: 20 + RADAR_RANGE * 0.5 });
  assert.equal(inside.far, false);
  assert.ok(Math.hypot(inside.x, inside.y) < 0.94);
});

test('sur le joueur : au centre, sans division par zéro', () => {
  const p = radarPoint(o, 1.2, { x: 10, z: 20 });
  assert.ok(near(p.x, 0) && near(p.y, 0) && p.dist === 0);
});
