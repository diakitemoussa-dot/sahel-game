import test from 'node:test';
import assert from 'node:assert/strict';
import { Driving, driveCommands, DRIVE_HELP } from '../src/drivelogic.js';

const run = (d, sec, cmd, dt = 1 / 60) => { for (let i = 0; i < sec / dt; i++) d.step(dt, cmd); };

test('à l\'arrêt, il reste immobile sans commande', () => {
  const d = new Driving(); d.place(5, 7, 1);
  run(d, 2, {});
  assert.equal(d.v, 0); assert.equal(d.x, 5); assert.equal(d.z, 7); assert.equal(d.heading, 1);
});

test('il accélère, ralentit près de sa vitesse maximale, sans la dépasser', () => {
  const d = new Driving();
  run(d, 2, { throttle: 1 }); const v2 = d.v;
  run(d, 30, { throttle: 1 });
  assert.ok(v2 > 6 && v2 < d.maxSpeed);
  assert.ok(d.v <= d.maxSpeed + 1e-9 && d.v > d.maxSpeed * 0.97);
});

test('il avance dans la direction du cap (cap 0 = vers +z)', () => {
  const d = new Driving(); d.place(0, 0, 0);
  run(d, 3, { throttle: 1 });
  assert.ok(d.z > 5 && Math.abs(d.x) < 1e-9);
  const e = new Driving(); e.place(0, 0, Math.PI / 2);          // cap 90° = vers +x
  run(e, 3, { throttle: 1 });
  assert.ok(e.x > 5 && Math.abs(e.z) < 1e-6);
});

test('le frein l\'arrête, puis le fait reculer', () => {
  const d = new Driving(); d.v = 12;
  run(d, 1.2, { brake: 1 });
  assert.ok(d.v < 1);
  run(d, 4, { brake: 1 });
  assert.ok(d.v < -2 && d.v >= -d.reverseMax - 1e-9 && d.gear === 'R');
});

test('sans pédale il roule sur son élan puis s\'arrête, sans jamais reculer', () => {
  const d = new Driving(); d.v = 8;
  let min = 1;
  for (let i = 0; i < 60 * 12; i++) { d.step(1 / 60, {}); min = Math.min(min, d.v); }
  assert.equal(d.v, 0); assert.ok(min >= 0);
});

test('le frein à main l\'arrête vite et ne le fait pas reculer', () => {
  const d = new Driving(); d.v = 14;
  let min = 1;
  for (let i = 0; i < 60 * 3; i++) { d.step(1 / 60, { handbrake: true }); min = Math.min(min, d.v); }
  assert.equal(d.v, 0); assert.ok(min >= 0);
});

test('tourner à droite diminue le cap (il part vers sa droite), à gauche l’augmente ; à l\'arrêt il ne pivote pas', () => {
  const r = new Driving(); r.v = 8; run(r, 1.5, { steer: 1 });
  const l = new Driving(); l.v = 8; run(l, 1.5, { steer: -1 });
  assert.ok(r.heading < -0.2 && l.heading > 0.2);
  assert.ok(Math.sin(r.heading) < 0, 'cap 0 = vers +z ; sa droite est du côté -x');
  const s = new Driving(); run(s, 2, { steer: 1 });
  assert.equal(s.heading, 0);
});

test('en marche arrière, le braquage s\'inverse', () => {
  const d = new Driving(); d.v = -3; run(d, 1, { steer: 1, brake: 1 });
  assert.ok(d.heading > 0);
});

test('le volant tourne progressivement', () => {
  const d = new Driving(); d.step(1 / 60, { steer: 1 });
  assert.ok(d.steer > 0 && d.steer < 0.1);
});

test('un choc fait perdre de la vitesse', () => {
  const d = new Driving(); d.v = 10; d.bump(0.4);
  assert.ok(Math.abs(d.v - 4) < 1e-9);
});

test('kmh, rapport et jauge', () => {
  const d = new Driving(); d.v = 10;
  assert.ok(Math.abs(d.kmh - 36) < 1e-9 && d.gear === 'D' && d.frac > 0.5 && d.frac < 0.7);
  d.v = -2; assert.equal(d.gear, 'R'); d.v = 0; assert.equal(d.gear, 'N');
});

test('driveCommands : clavier, manette et tactile', () => {
  assert.deepEqual(driveCommands({ moveY: 1, moveX: -1 }), { throttle: 1, brake: 0, steer: -1, handbrake: false });
  assert.deepEqual(driveCommands({ moveY: -0.5, moveX: 0.3, driveBrake: true }), { throttle: 0, brake: 0.5, steer: 0.3, handbrake: true });
  const c = driveCommands({ padRT: 0.8, padLT: 0.2, moveY: 0, moveX: 0 });
  assert.equal(c.throttle, 0.8); assert.equal(c.brake, 0.2);
  assert.deepEqual(driveCommands({}), { throttle: 0, brake: 0, steer: 0, handbrake: false });
});

test('l\'aide liste les commandes du clavier et de la manette', () => {
  assert.ok(DRIVE_HELP.pc.length >= 5 && DRIVE_HELP.pad.length >= 5);
  assert.ok(DRIVE_HELP.pc.some(([k]) => k === 'E') && DRIVE_HELP.pad.some(([k]) => k === 'R1'));
});
