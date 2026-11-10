import test from 'node:test';
import assert from 'node:assert/strict';
import { pushOut } from '../src/colliders.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;

test('cercle : le joueur est repoussé', () => {
  const p = { x: 1.2, y: 0 };
  pushOut(p, 0.4, [{ t: 'c', x: 0, y: 0, r: 1 }]);
  assert.ok(near(p.x, 1.4) && near(p.y, 0));
});

test('boîte : repoussé par la face', () => {
  const p = { x: 1.2, y: 0 };
  pushOut(p, 0.5, [{ t: 'b', x: 0, y: 0, hx: 1, hy: 1, yaw: 0 }]);
  assert.ok(near(p.x, 1.5) && near(p.y, 0));
});

test('boîte tournée de 90 degrés', () => {
  const p = { x: 0, y: 2.2 };
  pushOut(p, 0.5, [{ t: 'b', x: 0, y: 0, hx: 2, hy: 0.5, yaw: Math.PI / 2 }]);
  assert.ok(near(p.x, 0) && near(p.y, 2.5));
});

test('centre dans la boîte : le joueur ressort par le bord le plus proche', () => {
  const p = { x: 0.9, y: 0 };
  pushOut(p, 0.5, [{ t: 'b', x: 0, y: 0, hx: 1, hy: 1, yaw: 0 }]);
  assert.ok(near(p.x, 1.5));
});

test('loin de tout : inchangé', () => {
  const p = { x: 10, y: 10 };
  pushOut(p, 0.4, [{ t: 'c', x: 0, y: 0, r: 1 }, { t: 'b', x: 0, y: 0, hx: 1, hy: 1, yaw: 0 }]);
  assert.deepEqual(p, { x: 10, y: 10 });
});

// --- la vraie carte : chaque type d'objet solide a un collider (positions relevées dans Blender, repère Blender x, y)
import { readFileSync } from 'node:fs';
const real = JSON.parse(readFileSync(new URL('../config/colliders.json', import.meta.url), 'utf8'));
const SOLIDES = {
  'tente': [-160, -180], 'caisse': [-180.8, -189], 'épave (benne)': [-61.2, -40.5], 'arbre mort': [174.7, -41.1],
  'gravats': [-131.8, 181.6], 'poteau du puits': [-178.8, -180], 'buisson': [157.2, -156.1],
  'lit de cabane': [106.8, 131.7], 'table de cabane': [106.7, 135.5], 'tabouret de cabane': [106.9, 134.6], 'pot de cabane': [110.3, 135.9],
};
for (const [nom, [x, y]] of Object.entries(SOLIDES)) {
  test(`carte : ${nom} est solide (le joueur placé dessus est repoussé)`, () => {
    const p = { x, y };
    pushOut(p, 0.4, real);
    assert.ok(Math.hypot(p.x - x, p.y - y) > 0.3, `${nom} : le joueur est resté à l'intérieur`);
  });
}

// vrai si le point (x, y) est à l'intérieur d'un obstacle (marge de 5 cm)
export function inside(x, y, cols, m = 0.05) {
  return cols.some((c) => {
    if (c.t === 'c') return Math.hypot(x - c.x, y - c.y) < c.r - m;
    const cs = Math.cos(-c.yaw), sn = Math.sin(-c.yaw), dx = x - c.x, dy = y - c.y;
    return Math.abs(dx * cs - dy * sn) < c.hx - m && Math.abs(dx * sn + dy * cs) < c.hy - m;
  });
}

test('carte : en marchant droit vers une tente ou une caisse, le joueur n entre jamais dedans', () => {
  for (const [x0, y0] of [[-160, -165], [-180.8, -183], [-171, -170]]) {
    const p = { x: x0, y: y0 };
    for (let i = 0; i < 600; i++) { p.y -= 0.08; pushOut(p, 0.4, real); assert.ok(!inside(p.x, p.y, real), `entré dans un obstacle en (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`); }
  }
});

test('carte : les anciens colliders sont toujours là', () => {
  assert.ok(real.length >= 279);
  assert.ok(real.every((c) => (c.t === 'c' && c.r > 0) || (c.t === 'b' && c.hx > 0 && c.hy > 0)), 'tailles valides');
});

// --- toutes les maisons du village et de l'oasis sont accessibles par leur porte (centres relevés dans Blender : Cabane_01 à Cabane_18)
const MAISONS = [[108.52, 133.48], [107.13, 165.51], [125.31, 118.25], [125.59, 180.87], [156.5, 117.13], [156.02, 180.98], [170.03, 133.11],
  [171.27, 164.78], [190, -114], [128, -112], [108.73, 116.37], [109.35, 180.36], [122.85, 133.67], [124.32, 164.09], [154.19, 133.8],
  [156.6, 165.36], [171.18, 116.85], [173.59, 182.8]];

/** Le joueur (rayon r) peut-il aller du bord de la zone (extérieur) jusqu'au centre ? Parcours en largeur sur une grille de 15 cm. */
function accessible(cx, cy, cols, r = 0.4, half = 12, step = 0.15) {
  const n = Math.round((2 * half) / step) + 1;
  const near = cols.filter((c) => Math.abs(c.x - cx) < half + 12 && Math.abs(c.y - cy) < half + 12);
  const free = (i, j) => { const p = { x: cx - half + i * step, y: cy - half + j * step }, q = { ...p }; pushOut(q, r, near); return Math.hypot(q.x - p.x, q.y - p.y) < 1e-6; };
  const seen = new Uint8Array(n * n), queue = [];
  const push = (i, j) => { if (i < 0 || j < 0 || i >= n || j >= n || seen[i * n + j] || !free(i, j)) return; seen[i * n + j] = 1; queue.push([i, j]); };
  for (let k = 0; k < n; k++) { push(0, k); push(n - 1, k); push(k, 0); push(k, n - 1); }
  while (queue.length) { const [i, j] = queue.pop(); push(i + 1, j); push(i - 1, j); push(i, j + 1); push(i, j - 1); }
  const ci = Math.round(half / step);
  return seen[ci * n + ci] === 1;
}

test('toutes les maisons ont une porte par laquelle le joueur entre (18 maisons)', () => {
  const fermees = MAISONS.map(([x, y], i) => [i + 1, accessible(x, y, real)]).filter(([, ok]) => !ok).map(([i]) => i);
  assert.deepEqual(fermees, [], `maisons inaccessibles : Cabane_${fermees.join(', ')}`);
});

test('contrôle du test : une maison sans porte serait détectée', () => {
  const [x, y] = MAISONS[0];
  const fermee = [...real, { t: 'b', x, y, hx: 3.5, hy: 3.0, yaw: 0 }, { t: 'b', x, y, hx: 3.0, hy: 2.5, yaw: 0 }].filter(() => true);
  const sansPorte = real.filter((c) => Math.hypot(c.x - x, c.y - y) > 6).concat([{ t: 'b', x: x + 3, y, hx: 0.2, hy: 3, yaw: 0 }, { t: 'b', x: x - 3, y, hx: 0.2, hy: 3, yaw: 0 }, { t: 'b', x, y: y + 3, hx: 3, hy: 0.2, yaw: 0 }, { t: 'b', x, y: y - 3, hx: 3, hy: 0.2, yaw: 0 }]);
  assert.equal(accessible(x, y, sansPorte), false);
  assert.equal(fermee.length > 0, true);
});
