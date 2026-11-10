import test from 'node:test';
import assert from 'node:assert/strict';
import { headingTo, indicatorAngle, indicatorAlpha, crescent, arrowhead } from '../src/hitdir.js';

const me = { x: 0, z: 0 };
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('tireur devant la caméra : arc en haut (0°)', () => {
  assert.ok(near(indicatorAngle(0, me, { x: 0, z: 10 }), 0));          // la caméra regarde +z
  assert.ok(near(indicatorAngle(Math.PI / 2, me, { x: 10, z: 0 }), 0)); // la caméra regarde +x
});

test('tireur derrière : arc en bas (180°)', () => {
  assert.ok(near(Math.abs(indicatorAngle(0, me, { x: 0, z: -10 })), 180));
});

test('droite et gauche : +x est à gauche de la caméra qui regarde +z', () => {
  assert.ok(near(indicatorAngle(0, me, { x: -10, z: 0 }), 90), 'tireur en -x = à droite de l écran');
  assert.ok(near(indicatorAngle(0, me, { x: 10, z: 0 }), -90), 'tireur en +x = à gauche de l écran');
});

test('l arc tourne quand la caméra tourne : le tireur reste au même endroit du monde', () => {
  const s = { x: 10, z: 0 };                                       // tireur à l est
  assert.ok(near(indicatorAngle(0, me, s), -90));                  // caméra vers le nord : à gauche
  assert.ok(near(indicatorAngle(Math.PI / 2, me, s), 0));          // la caméra se tourne vers lui : il est devant
  assert.ok(near(Math.abs(indicatorAngle(Math.PI, me, s)), 90));
});

test('angle toujours entre -180 et 180, même avec des caps énormes', () => {
  for (const cam of [-50, -7, 0, 3.3, 12, 100]) for (const t of [{ x: 3, z: 4 }, { x: -3, z: 4 }, { x: 0, z: -5 }, { x: -9, z: -1 }]) {
    const a = indicatorAngle(cam, me, t); assert.ok(a >= -180 && a <= 180);
  }
});

test('cap vers un point', () => {
  assert.ok(near(headingTo(me, { x: 0, z: 5 }), 0)); assert.ok(near(headingTo(me, { x: 5, z: 0 }), Math.PI / 2));
});

test('opacité : pleine au début, s efface, puis nulle', () => {
  assert.equal(indicatorAlpha(0), 1); assert.equal(indicatorAlpha(0.5), 1);
  assert.ok(indicatorAlpha(1.3) > 0 && indicatorAlpha(1.3) < 1);
  assert.ok(indicatorAlpha(1.0) > indicatorAlpha(1.8), 'décroissante');
  assert.equal(indicatorAlpha(2.2), 0); assert.equal(indicatorAlpha(5), 0); assert.equal(indicatorAlpha(-1), 0);
});

test('croissant : effilé aux deux bouts, épais au milieu, centré en haut', () => {
  const pts = crescent(92, 13, 36, 18), n = pts.length / 2;
  assert.equal(pts.length, 38);
  const ends = Math.hypot(pts[0][0] - pts[2 * n - 1][0], pts[0][1] - pts[2 * n - 1][1]);
  const mid = Math.hypot(pts[9][0] - pts[2 * n - 1 - 9][0], pts[9][1] - pts[2 * n - 1 - 9][1]);
  assert.ok(ends < 1e-9, 'les deux bords se rejoignent au bout');
  assert.ok(Math.abs(mid - 13) < 1e-6, 'épaisseur 13 au milieu');
  assert.ok(near(pts[9][0], 0) && pts[9][1] < 0, 'milieu au-dessus du centre');
  assert.ok(near(pts[0][0], -pts[18][0]), 'symétrique');
});

test('pointe de flèche : au milieu de l arc, tournée vers l extérieur, symétrique, creusée à l arrière', () => {
  const [tip, right, notch, left] = arrowhead();
  assert.ok(near(tip[0], 0) && near(notch[0], 0), 'sur l axe du tireur (en haut)');
  assert.ok(near(right[0], -left[0]) && near(right[1], left[1]), 'symétrique');
  assert.ok(tip[1] < notch[1] && notch[1] < right[1], 'de l extérieur vers le centre : pointe, creux, ailes (y négatif = vers le haut)');
  const arc = crescent();
  const outer = Math.min(...arc.map((p) => p[1]));
  assert.ok(tip[1] < outer - 10, 'la pointe dépasse nettement de l arc (au moins 10 px)');
  assert.ok(right[1] > outer, 'les ailes se posent sur l arc : la pointe est attachée à l arc');
});
