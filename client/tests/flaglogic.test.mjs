import test from 'node:test';
import assert from 'node:assert/strict';
import { apparentWind, windFactor, flagPoint, FLAG } from '../src/flaglogic.js';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const rot = (yaw) => [Math.cos(yaw), -Math.sin(yaw)];            // où va l'axe x du drapeau (x, z) après une rotation `yaw` autour de Y (three.js)

test('le drapeau se tourne vers l\'aval du vent', () => {
  for (const [wx, wz] of [[3, 0], [0, 3], [-2, 1], [1.5, -2.5]]) {
    const a = apparentWind(wx, wz, 0, 0), [dx, dz] = rot(a.yaw), n = Math.hypot(wx, wz);
    assert.ok(near(dx, wx / n, 1e-9) && near(dz, wz / n, 1e-9), `vent ${wx},${wz}`);
  }
});

test('un véhicule qui roule fait flotter le drapeau vers l\'arrière, même sans vent', () => {
  const a = apparentWind(0, 0, 0, 10);                      // il roule vers +z à 10 m/s
  const [dx, dz] = rot(a.yaw);
  assert.ok(dz < -0.99 && Math.abs(dx) < 1e-9);             // le drapeau pointe vers -z : derrière lui
  assert.equal(a.speed, 10);
});

test('en roulant avec le vent, le vent apparent diminue ; contre le vent, il augmente', () => {
  assert.ok(apparentWind(3, 0, 5, 0).speed < apparentWind(3, 0, -5, 0).speed);
});

test('la force du vent est bornée entre 0 et 1', () => {
  assert.equal(windFactor(0), 0); assert.equal(windFactor(100), 1); assert.ok(windFactor(3) > 0 && windFactor(3) < 1);
});

test('le bord du mât ne bouge jamais', () => {
  for (const wf of [0, 0.4, 1]) for (const t of [0, 1.3, 7.9]) {
    const [x, y, z] = flagPoint(0, 0.5, t, wf);
    assert.ok(near(x, 0) && near(y, 0.5 * FLAG.h) && near(z, 0), `wf ${wf} t ${t}`);
  }
});

test('sans vent il pend ; avec du vent il se tend à l\'horizontale', () => {
  const calm = flagPoint(1, 0, 0, 0), strong = flagPoint(1, 0, 0, 1);
  assert.ok(calm[1] < -0.7 * FLAG.w, 'le bout pend vers le bas');
  assert.ok(Math.abs(strong[1]) < 0.1 * FLAG.w && strong[0] > 0.98 * FLAG.w, 'le bout est tendu');
});

test('l\'ondulation grandit avec la distance au mât et avec la force du vent', () => {
  const amp = (u, wf) => { let m = 0; for (let t = 0; t < 4; t += 0.02) m = Math.max(m, Math.abs(flagPoint(u, 0, t, wf)[2])); return m; };
  assert.ok(amp(0.9, 1) > amp(0.3, 1));
  assert.ok(amp(0.9, 1) > amp(0.9, 0.2));
});

test('le tissu ondule dans le temps et son mouvement se répète', () => {
  const z0 = flagPoint(0.8, 0, 0, 1)[2], z1 = flagPoint(0.8, 0, 0.1, 1)[2];
  assert.notEqual(z0, z1);
  const period = 1 / (0.7 + 3);                              // période de l'onde pour wf = 1
  assert.ok(near(flagPoint(0.8, 0, 0.37, 1)[2], flagPoint(0.8, 0, 0.37 + period, 1)[2], 1e-9));
});

test('deux drapeaux ont des phases différentes (ils ne battent pas à l\'unisson)', () => {
  assert.notEqual(flagPoint(0.8, 0, 1, 1, FLAG, 0)[2], flagPoint(0.8, 0, 1, 1, FLAG, 2)[2]);
});

test('toutes les valeurs restent finies', () => {
  for (let u = 0; u <= 1; u += 0.1) for (let v = -0.5; v <= 0.5; v += 0.25) for (const wf of [0, 0.5, 1]) assert.ok(flagPoint(u, v, 12.3, wf).every(Number.isFinite));
});
