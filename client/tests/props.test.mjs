import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseProps, colliderFor } from '../src/props.js';
import { pushOut } from '../src/colliders.js';

const cfg = JSON.parse(readFileSync(new URL('../config/props.json', import.meta.url), 'utf8'));
const cols = JSON.parse(readFileSync(new URL('../config/colliders.json', import.meta.url), 'utf8'));
const defs = parseProps(cfg);

test('configuration des décors valide, fichiers présents', () => {
  assert.ok(defs.length >= 1);
  for (const d of defs) assert.ok(existsSync(new URL('../' + d.file, import.meta.url)), d.file);
  assert.throws(() => parseProps({ props: [{ id: 'a', file: 'x.glb' }] }), /incomplet/);
  assert.throws(() => parseProps({ props: [{ id: 'a', file: 'x.glb', pos: [0, 0] }, { id: 'a', file: 'y.glb', pos: [1, 1] }] }), /double/);
});

test('boîte de collision : au bon endroit, tournée avec le véhicule', () => {
  const c = colliderFor({ pos: [10, 20], yaw: 0, collider: { hx: 1, hy: 3, dx: 0, dy: 0.5 } });
  assert.deepEqual([c.x, c.y, c.hx, c.hy, c.yaw], [10, 20.5, 1, 3, 0]);
  const r = colliderFor({ pos: [0, 0], yaw: Math.PI / 2, collider: { hx: 1, hy: 3, dx: 0, dy: 1 } });   // tourné de 90° : le décalage en y part vers -x
  assert.ok(Math.abs(r.x - (-1)) < 1e-9 && Math.abs(r.y) < 1e-9);
  assert.equal(colliderFor({ pos: [0, 0] }), null);
});

test('le véhicule du jeu est posé sur un terrain libre (aucun obstacle de la carte dessous) et bloque le joueur', () => {
  const d = defs.find((x) => x.id === 'technique_1');
  const box = colliderFor(d);
  for (const c of cols) {                                              // aucun collider existant ne chevauche la boîte du véhicule
    const p = { x: c.x, y: c.y };
    if (c.t === 'c') { const q = { x: c.x, y: c.y }; pushOut(q, 0.01, [box]); assert.ok(Math.hypot(q.x - c.x, q.y - c.y) < 1e-9, `chevauchement avec un obstacle en (${c.x}, ${c.y})`); }
  }
  const p = { x: box.x, y: box.y + box.hy - 0.5 };                     // un joueur placé dans le véhicule en est repoussé
  pushOut(p, 0.4, [box]);
  assert.ok(Math.hypot(p.x - box.x, p.y - box.y) > 1.0);
  const walk = { x: box.x + 6, y: box.y };                              // il marche droit vers le côté du véhicule : il s'arrête devant
  for (let i = 0; i < 200; i++) { walk.x -= 0.05; pushOut(walk, 0.4, [box]); }
  assert.ok(walk.x >= box.x + box.hx + 0.39, 'il ne traverse pas la carrosserie');
});

test('le fichier du véhicule contient les nœuds mobiles : 4 roues, roue de secours, tourelle, canons', () => {
  const b = readFileSync(new URL('../assets/vehicles/technique.glb', import.meta.url));
  const j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString());
  const names = new Set(j.nodes.map((n) => n.name));
  for (const n of ['V_RoueAvG', 'V_RoueAvD', 'V_RoueArG', 'V_RoueArD', 'V_RoueSecours', 'V_Tourelle', 'V_Canons', 'Technique']) assert.ok(names.has(n), `nœud ${n}`);
  assert.ok(j.meshes.length < 80, 'pièces fixes regroupées (peu d objets à dessiner)');
  assert.ok(b.length < 1.2e6, 'fichier léger');
});
