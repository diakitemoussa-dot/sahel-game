import test from 'node:test';
import assert from 'node:assert/strict';
import { spatial, stepInterval, StepClock, overlaySound, stepVolume, MAX_HEAR, SpeedTracker } from '../src/sfxlogic.js';

test('spatial : plus loin = plus faible, plus sourd, plus tardif ; hors portée = silence', () => {
  const L = { x: 0, z: 0 };
  const near = spatial(L, 0, { x: 0, z: 5 }), mid = spatial(L, 0, { x: 0, z: 40 }), far = spatial(L, 0, { x: 0, z: 120 });
  assert.ok(near.gain > 0.99);
  assert.ok(mid.gain < near.gain && far.gain < mid.gain && far.gain > 0);
  assert.ok(far.lowpass < mid.lowpass && mid.lowpass < near.lowpass);
  assert.ok(far.delay > mid.delay && mid.delay > near.delay);
  assert.equal(spatial(L, 0, { x: MAX_HEAR + 1, z: 0 }).gain, 0);
});

test('spatial : côté gauche / droite selon la direction du regard', () => {
  const L = { x: 0, z: 0 };
  // on regarde vers +z (yaw 0) : +x est à gauche ... la droite du joueur est (cos yaw, -sin yaw) = (1, 0)
  assert.ok(spatial(L, 0, { x: 20, z: 0 }).pan > 0.9, 'un son à (+x) est à droite quand on regarde +z');
  assert.ok(spatial(L, 0, { x: -20, z: 0 }).pan < -0.9);
  assert.ok(Math.abs(spatial(L, 0, { x: 0, z: 20 }).pan) < 0.05, 'devant : au centre');
  assert.ok(Math.abs(spatial(L, 0, { x: 0, z: -20 }).pan) < 0.05, 'derrière : au centre');
  // on se tourne vers +x (yaw = pi/2) : le son à (+x) passe devant
  assert.ok(Math.abs(spatial(L, Math.PI / 2, { x: 20, z: 0 }).pan) < 0.05);
  assert.ok(spatial(L, Math.PI / 2, { x: 0, z: -20 }).pan > 0.9, 'quand on regarde +x, -z est à droite');
  assert.equal(spatial(L, 1, { x: 0.1, z: 0.1 }).pan, 0, 'sur place : pas de côté');
});

test('cadence des pas : plus vite = plus rapproché ; arrêt = aucun pas', () => {
  assert.equal(stepInterval(0), 0); assert.equal(stepInterval(0.3), 0);
  const walk = stepInterval(2.4), run = stepInterval(5.5), sprint = stepInterval(7);
  assert.ok(walk > run && run > sprint && sprint >= 0.24);
  assert.ok(walk > 0.45 && walk < 0.7, `marche ${walk}`);
});

test('StepClock : un pas par intervalle, rien en l\'air ni à l\'arrêt', () => {
  const c = new StepClock(); let steps = 0;
  for (let i = 0; i < 100; i++) steps += c.update(0.05, 5.5);              // 5 s de course
  assert.ok(steps >= 13 && steps <= 17, `${steps} pas en 5 s de course`);
  const d = new StepClock(); let air = 0;
  for (let i = 0; i < 40; i++) air += d.update(0.05, 5.5, false);
  assert.equal(air, 0, 'pas de pas en l\'air');
  const e = new StepClock(); let still = 0;
  for (let i = 0; i < 40; i++) still += e.update(0.05, 0);
  assert.equal(still, 0);
});

test('sons des animations d\'action et volume des pas', () => {
  assert.equal(overlaySound('Rifle Reload'), 'reload_rifle'); assert.equal(overlaySound('Pistol Reload'), 'reload_pistol');
  assert.equal(overlaySound('Kick'), 'kick'); assert.equal(overlaySound('Side Kick'), 'kick');
  assert.equal(overlaySound('Melee Punch'), 'punch'); assert.equal(overlaySound('Pistol Whip'), 'punch');
  assert.equal(overlaySound('Hit Reaction'), null); assert.equal(overlaySound(null), null);
  assert.ok(stepVolume(7) > stepVolume(2.4)); assert.ok(stepVolume(2.4, true) < stepVolume(2.4));
  assert.ok(stepVolume(20) <= 1);
});

test('SpeedTracker : vitesse d un PNJ mis à jour une image sur deux, arrêt, téléportation', () => {
  const s = new SpeedTracker();
  assert.equal(s.update(0, 0, 0), 0);
  // 2 m/s, position changée seulement toutes les 0,1 s
  let sp = 0;
  for (let i = 1; i <= 20; i++) { const tt = i * 0.05; const x = Math.floor(i / 2) * 0.2; sp = s.update(x, 0, tt); }
  assert.ok(sp > 1.7 && sp < 2.3, `vitesse ${sp}`);
  assert.equal(s.update(s.x, 0, s.t + 0.5), 0, 'immobile depuis 0,5 s');
  s.update(100, 0, s.t + 0.1); assert.equal(s.speed, 0, 'téléportation ignorée');
});
