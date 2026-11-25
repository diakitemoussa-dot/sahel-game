import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { solveAim, limitRotation, blendWeight, blendRotation } from '../src/aimsolve.js';

test('après rotation, le canon vise la cible', () => {
  const pivot = new THREE.Vector3(0, 1.3, 0);
  const muzzlePos = new THREE.Vector3(0.3, 1.2, 0.6);
  const muzzleDir = new THREE.Vector3(0.6, 0.1, 0.8).normalize();
  const target = new THREE.Vector3(0, 1.5, 30);
  const R = solveAim(pivot, muzzlePos, muzzleDir, target, 5);
  const newPos = muzzlePos.clone().sub(pivot).applyQuaternion(R).add(pivot);
  const newDir = muzzleDir.clone().applyQuaternion(R);
  const want = target.clone().sub(newPos).normalize();
  assert.ok(newDir.angleTo(want) < 1e-3, 'écart ' + newDir.angleTo(want));
});

test('canon déjà aligné : rotation nulle', () => {
  const R = solveAim(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0.5), new THREE.Vector3(0, 0, 1),
                     new THREE.Vector3(0, 1, 30), 5);
  assert.ok(2 * Math.acos(Math.min(1, Math.abs(R.w))) < 1e-3);
});

test('la rotation est limitée', () => {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.5);
  const l = limitRotation(q, 0.5);
  assert.ok(Math.abs(2 * Math.acos(Math.abs(l.w)) - 0.5) < 1e-6);
});

test('le poids de la visée monte et descend progressivement, sans dépasser', () => {
  let w = 0, last = 0;
  for (let i = 0; i < 40; i++) { w = blendWeight(w, 1, 1 / 60); assert.ok(w >= last && w <= 1); last = w; }
  assert.ok(w > 0.5 && w < 1, 'monte en quelques dixièmes de seconde, pas d\'un coup : ' + w);
  assert.equal(blendWeight(0.3, 1, 0), 0.3, 'durée nulle : rien ne bouge');
  let d = 1;
  for (let i = 0; i < 40; i++) { const n = blendWeight(d, 0, 1 / 60); assert.ok(n <= d && n >= 0); d = n; }
  assert.ok(d < 0.5);
});

test('le poids dose la rotation de visée : 0 = aucune, 1 = entière, 0,5 = la moitié', () => {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.8);
  const angle = (r) => 2 * Math.acos(Math.min(1, Math.abs(r.w)));
  assert.ok(angle(blendRotation(q, 0)) < 1e-9);
  assert.ok(Math.abs(angle(blendRotation(q, 1)) - 0.8) < 1e-6);
  assert.ok(Math.abs(angle(blendRotation(q, 0.5)) - 0.4) < 1e-6);
});

test('une petite rotation est conservée', () => {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.2);
  const l = limitRotation(q, 0.5);
  assert.ok(Math.abs(l.x - q.x) < 1e-9 && Math.abs(l.w - q.w) < 1e-9);
});
