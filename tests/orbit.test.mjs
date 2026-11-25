import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapPi, updateOrbit, followYaw } from '../src/orbit.js';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('wrapPi ramène un angle dans [-pi, pi]', () => {
  assert.ok(near(wrapPi(3 * Math.PI / 2), -Math.PI / 2));
  assert.ok(near(wrapPi(-3 * Math.PI / 2), Math.PI / 2));
  assert.ok(near(wrapPi(0.3), 0.3));
});

test('stick droit à l\'arrêt : la caméra tourne autour du personnage', () => {
  assert.equal(updateOrbit({ orbiting: false, active: false, mouseLook: false, stickLook: true }), true);
});

test('on reste en orbite tant que le joueur ne fait rien d\'autre', () => {
  assert.equal(updateOrbit({ orbiting: true, active: false, mouseLook: false, stickLook: false }), true);
});

test('avancer, viser, tirer ou sprinter ramène le personnage face à la caméra', () => {
  assert.equal(updateOrbit({ orbiting: true, active: true, mouseLook: false, stickLook: true }), false);
});

test('la souris fait tourner le personnage comme avant (pas d\'orbite)', () => {
  assert.equal(updateOrbit({ orbiting: true, active: false, mouseLook: true, stickLook: false }), false);
  assert.equal(updateOrbit({ orbiting: false, active: false, mouseLook: true, stickLook: true }), false);
});

test('rien ne se passe : pas d\'orbite', () => {
  assert.equal(updateOrbit({ orbiting: false, active: false, mouseLook: false, stickLook: false }), false);
});

test('le corps rejoint la caméra par le chemin le plus court, même à travers +-pi', () => {
  let body = Math.PI - 0.1;
  const cam = -Math.PI + 0.1;                 // 0,2 rad plus loin en passant par pi
  for (let i = 0; i < 60; i++) body = followYaw(body, cam, 1 / 60);
  assert.ok(Math.abs(wrapPi(body - cam)) < 0.01, 'écart ' + Math.abs(wrapPi(body - cam)));
});

test('le corps ne bouge pas si la durée est nulle', () => {
  assert.equal(followYaw(1, 2, 0), 1);
});
