import test from 'node:test';
import assert from 'node:assert/strict';
import { tuneMaterial, tuneVehicle, VEHICLE_LOOK } from '../src/vehiclefx.js';

const mat = (name, roughness, metalness, extra = {}) => ({ name, roughness, metalness, userData: {}, ...extra });

test('la peinture devient un peu métallique et un peu moins lisse', () => {
  const m = mat('Peinture_Sable', 0.75, 0);
  assert.equal(tuneMaterial(m, null), true);
  assert.ok(Math.abs(m.roughness - (0.75 + VEHICLE_LOOK.roughUp)) < 1e-9);
  assert.equal(m.metalness, VEHICLE_LOOK.paintMetal);
});

test('le métal brut garde son métal, mais devient un peu moins lisse', () => {
  const m = mat('Metal_Brut', 0.45, 0.9);
  tuneMaterial(m, null);
  assert.equal(m.metalness, 0.9); assert.ok(m.roughness > 0.45);
});

test('la rugosité ne dépasse jamais 1', () => {
  const m = mat('Interieur_Gris', 0.98, 0);
  tuneMaterial(m, null);
  assert.equal(m.roughness, 1);
});

test('vitres, phares, feux et plafonnier ne changent pas', () => {
  for (const n of ['Vitre_Blindee', 'Phare_Blanc', 'Feu_Rouge', 'Plafonnier']) { const m = mat(n, 0.2, 0); assert.equal(tuneMaterial(m, null), false); assert.equal(m.roughness, 0.2); }
  const t = mat('Autre', 0.5, 0, { transparent: true }); assert.equal(tuneMaterial(t, null), false);
});

test('un matériau partagé par plusieurs véhicules n\'est réglé qu\'une fois', () => {
  const m = mat('Peinture_Sable', 0.75, 0);
  tuneMaterial(m, null); const r = m.roughness; tuneMaterial(m, null);
  assert.equal(m.roughness, r);
});

test('le reflet est posé sur le matériau', () => {
  const m = mat('Peinture_Sable', 0.75, 0), tex = { id: 'ciel' };
  tuneMaterial(m, tex);
  assert.equal(m.envMap, tex); assert.equal(m.envMapIntensity, VEHICLE_LOOK.envIntensity);
});

test('tuneVehicle parcourt tous les maillages', () => {
  const a = mat('Peinture_Sable', 0.75, 0), b = mat('Metal_Brut', 0.45, 0.9);
  const root = { traverse(f) { f({ isMesh: true, material: a }); f({ isMesh: true, material: [b] }); f({ isMesh: false }); } };
  tuneVehicle(root, null);
  assert.ok(a.metalness > 0 && b.roughness > 0.45);
});
