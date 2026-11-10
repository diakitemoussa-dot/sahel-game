import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { MeshWorld, decodeSCOL, closestPointOnTriangle } from '../src/meshworld.js';
import { sampleHeight } from '../src/heightmap.js';

/** Boîte [x0, x1] x [0, h] x [z0, z1] : 12 triangles aux normales vers l'extérieur. */
function box(x0, x1, h, z0, z1) {
  const p = [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]];
  const f = [[4, 7, 6], [4, 6, 5], [0, 1, 2], [0, 2, 3], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];
  return { positions: new Float32Array(p.flat()), indices: new Uint32Array(f.flat()) };
}
const world = (...boxes) => { const w = new MeshWorld(); boxes.forEach((b) => w.add(b)); return w; };

test('dessus d un objet : on peut s y tenir debout ; rien à côté ; filtré par la hauteur', () => {
  const w = world(box(0, 2, 1, 0, 2));
  assert.ok(Math.abs(w.surfaceY(1, 1, 5) - 1) < 1e-6);
  assert.equal(w.surfaceY(3, 1, 5), null);
  assert.equal(w.surfaceY(1, 1, 0.5), null, 'trop haut pour des pieds à 0,05 m');
});

test('paroi : le personnage est repoussé ; mais il enjambe ce qui est assez bas', () => {
  const w = world(box(0, 2, 1, 0, 2));
  const p = { x: -0.2, y: 0, z: 1 };
  assert.ok(w.pushOut(p, 0.4));
  assert.ok(Math.abs(p.x - (-0.4)) < 1e-3, `repoussé à x = -0,4 (reçu ${p.x})`);
  const q = { x: -0.2, y: 0.6, z: 1 };                           // pieds à 0,6 : le haut (1,0) est à moins de 0,45 : il monte dessus
  assert.equal(w.pushOut(q, 0.4), false);
  const low = world(box(0, 2, 0.3, 0, 2)), r = { x: -0.2, y: 0, z: 1 };
  assert.equal(low.pushOut(r, 0.4), false, 'une marche de 30 cm s enjambe');
});

test('un objet au-dessus de la tête ne bloque pas (porte, linteau)', () => {
  const w = world(box(0, 2, 3, 0, 2));
  const elevated = { positions: new Float32Array(box(0, 2, 1, 0, 2).positions).map((v, i) => (i % 3 === 1 ? v + 2.2 : v)), indices: box(0, 2, 1, 0, 2).indices };
  const lintel = new MeshWorld().add(elevated);
  const p = { x: -0.2, y: 0, z: 1 };
  assert.equal(lintel.pushOut(p, 0.4), false, 'bas à 2,2 m : on passe dessous');
  assert.ok(w.pushOut({ x: -0.2, y: 0, z: 1 }, 0.4));
});

test('forme réelle : un coin de pyramide est libre, le centre est solide', () => {
  const pyr = { positions: new Float32Array([0, 0, 0, 4, 0, 0, 4, 0, 4, 0, 0, 4, 2, 3, 2]), indices: new Uint32Array([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4, 0, 2, 1, 0, 3, 2]) };
  const w = new MeshWorld().add(pyr);
  assert.ok(w.insideObject(2.4, 0.5, 2.2) >= 0, 'centre : dans la pyramide');
  assert.equal(w.insideObject(0.1, 2.5, 0.1), -1, 'coin haut : dehors (une boîte l aurait compté)');
});

test('ligne de vue et tirs : un objet bloque, au-dessus ou à côté non', () => {
  const w = world(box(0, 2, 1, 0, 2));
  assert.equal(w.blocked({ x: -3, y: 0.5, z: 1 }, { x: 5, y: 0.5, z: 1 }), true);
  assert.equal(w.blocked({ x: -3, y: 1.6, z: 1 }, { x: 5, y: 1.6, z: 1 }), false, 'au-dessus d une caisse basse');
  assert.equal(w.blocked({ x: -3, y: 0.5, z: 3 }, { x: 5, y: 0.5, z: 3 }), false, 'à côté');
  assert.equal(w.blocked({ x: -3, y: 0.5, z: 1 }, { x: -1, y: 0.5, z: 1 }), false, 'avant l objet');
  const t = w.raycast({ x: -3, y: 0.5, z: 1 }, { x: 1, y: 0, z: 0 }, 50);
  assert.ok(Math.abs(t - 3) < 1e-6, `le rayon touche à 3 m (reçu ${t})`);
  assert.equal(w.raycast({ x: -3, y: 2, z: 1 }, { x: 1, y: 0, z: 0 }, 50), null);
});

test('rebord à grimper : à portée, ni trop bas, ni trop haut, avec de la place au-dessus', () => {
  const dir = { x: 1, z: 0 };
  const at = (h) => world(box(0.2, 3, h, -1, 3)).findLedge({ x: -0.3, y: 0.5, z: 1 }, dir);
  const ok = at(1.6);
  assert.ok(ok && Math.abs(ok.y - 1.6) < 1e-6 && ok.x > 0.2, 'rebord de 1,6 m');
  assert.equal(at(3.5), null, 'trop haut (hors de portée)');
  assert.equal(at(0.7), null, 'trop bas : on l enjambe, pas besoin de grimper');
  const ceiling = box(-1, 4, 2.0, -1, 4);                                  // dalle épaisse dont le dessous est à 2,0 m : son dessus (4 m) est hors de portée
  const covered = world(box(0.2, 3, 1.6, -1, 3), { positions: new Float32Array(ceiling.positions).map((v, i) => (i % 3 === 1 ? v + 2.0 : v)), indices: ceiling.indices });
  assert.equal(covered.findLedge({ x: -0.3, y: 0.5, z: 1 }, dir), null, 'un plafond bas au-dessus : pas la place de se tenir debout');
  assert.equal(world(box(0.2, 3, 1.6, -1, 3)).findLedge({ x: -0.3, y: 0.5, z: 1 }, { x: -1, z: 0 }), null, 'il regarde dans l autre sens');
});

test('point le plus proche d un triangle', () => {
  const out = [0, 0, 0];
  closestPointOnTriangle(0.2, 5, 0.2, 0, 0, 0, 1, 0, 0, 0, 0, 1, out);
  assert.deepEqual(out.map((v) => +v.toFixed(6)), [0.2, 0, 0.2], 'au-dessus : le point de la face');
  closestPointOnTriangle(-3, 0, -3, 0, 0, 0, 1, 0, 0, 0, 0, 1, out);
  assert.deepEqual(out, [0, 0, 0], 'loin : le sommet');
});

// ---------------------------------------------------------------- les vraies données de la carte
const rd = (f) => { const b = readFileSync(new URL('../' + f, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const hm = JSON.parse(readFileSync(new URL('../config/heightmap.json', import.meta.url), 'utf8'));
const ground = (x, z) => sampleHeight(hm, x, -z);
const map = new MeshWorld().add(decodeSCOL(rd('assets/collision.bin')));

test('carte : fichier de collision valide et léger', () => {
  assert.ok(existsSync(new URL('../assets/collision.bin', import.meta.url)));
  assert.ok(map.triangles > 20000 && map.triangles < 60000, `${map.triangles} triangles`);
  assert.ok(map.nObj > 500, 'un morceau par objet solide');
});

test('carte : la tente est une pyramide (coin de l ancienne boîte libre), la caisse a son dessus à 0,75 m', () => {
  assert.ok(map.insideObject(-160, 1.0, 180) >= 0, 'centre de la tente : dedans');
  assert.equal(map.insideObject(-156.2, 1.0, 177), -1, 'coin de l ancienne boîte : dehors');
  const top = map.surfaceY(-180.8, 189, 5);
  assert.ok(top > 0.7 && top < 0.8, `dessus de caisse ${top}`);
});

test('carte : on ne traverse pas une tente ni un mur de cabane', () => {
  const p = { x: -160, y: ground(-160, 175), z: 172 };
  for (let i = 0; i < 160; i++) { p.z += 0.05; map.pushOut(p, 0.4); p.y = ground(p.x, p.z); assert.equal(map.insideObject(p.x, p.y + 0.9, p.z), -1, `dans la tente en (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`); }
});

// accès par la porte aux 18 maisons : parcours en largeur depuis l extérieur jusqu au centre
const MAISONS = [[108.52, 133.48], [107.13, 165.51], [125.31, 118.25], [125.59, 180.87], [156.5, 117.13], [156.02, 180.98], [170.03, 133.11],
  [171.27, 164.78], [190, -114], [128, -112], [108.73, 116.37], [109.35, 180.36], [122.85, 133.67], [124.32, 164.09], [154.19, 133.8],
  [156.6, 165.36], [171.18, 116.85], [173.59, 182.8]];

function accessible(bx, by, half = 10, step = 0.2) {
  const cx = bx, cz = -by;                                              // Blender (x, y) -> jeu (x, z = -y)
  const n = Math.round((2 * half) / step) + 1;
  const free = (i, j) => { const x = cx - half + i * step, z = cz - half + j * step; const p = { x, y: ground(x, z), z }; return !map.pushOut(p, 0.4) && p.x === x && p.z === z; };
  const seen = new Uint8Array(n * n), stack = [];
  const push = (i, j) => { if (i < 0 || j < 0 || i >= n || j >= n || seen[i * n + j] || !free(i, j)) return; seen[i * n + j] = 1; stack.push([i, j]); };
  for (let k = 0; k < n; k++) { push(0, k); push(n - 1, k); push(k, 0); push(k, n - 1); }
  while (stack.length) { const [i, j] = stack.pop(); push(i + 1, j); push(i - 1, j); push(i, j + 1); push(i, j - 1); }
  const c = Math.round(half / step);
  return seen[c * n + c] === 1;
}

test('carte : les 18 maisons ont une porte par laquelle le personnage entre (collision sur maillage)', () => {
  const fermees = MAISONS.map(([x, y], i) => [i + 1, accessible(x, y)]).filter(([, ok]) => !ok).map(([i]) => i);
  assert.deepEqual(fermees, [], `maisons inaccessibles : ${fermees.join(', ')}`);
});

test('véhicule : sa maille de collision est un vrai maillage (toit de cabine à 1,94 m, on ne passe pas à travers)', () => {
  assert.ok(existsSync(new URL('../assets/vehicles/technique_collision.bin', import.meta.url)));
  const v = new MeshWorld().add(decodeSCOL(rd('assets/vehicles/technique_collision.bin')));
  assert.ok(v.triangles > 500 && v.triangles < 6000);
  const roof = v.surfaceY(-0.5, -0.1, 5);
  assert.ok(roof > 1.9 && roof < 2.0, `toit ${roof}`);
  assert.ok(v.surfaceY(-0.5, -1.8, 5) < 1.4, 'le capot est plus bas que le toit');
  const p = { x: 3, y: 0, z: -0.1 };
  for (let i = 0; i < 100; i++) { p.x -= 0.05; v.pushOut(p, 0.4); }
  assert.ok(p.x > 0.8, 'il s arrête contre la caisse du véhicule');
});
