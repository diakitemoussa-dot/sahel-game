import test from 'node:test';
import assert from 'node:assert/strict';
import { orbitPose, planPass, passPosition, dopplerRatio, radialSpeed } from '../src/aircraftlogic.js';

test('orbite : reste sur le cercle, avance à la bonne vitesse, cap tangent, penché vers le centre', () => {
  const o = { cx: 10, cz: -20, radius: 100, alt: 80, speed: 20, dir: 1, phase: 0.3 };
  for (const t of [0, 7, 31]) {
    const p = orbitPose(o, t);
    assert.ok(Math.abs(Math.hypot(p.x - o.cx, p.z - o.cz) - 100) < 1e-9, 'sur le cercle');
    assert.ok(Math.abs(Math.hypot(p.vx, p.vz) - 20) < 1e-9, 'vitesse');
    assert.ok(Math.abs(Math.sin(p.yaw) * p.vz - Math.cos(p.yaw) * p.vx) < 1e-9, 'cap dans le sens de la marche');
    assert.ok(Math.abs(p.y - 80) <= 1.2 + 1e-9, 'altitude stable (léger roulis vertical)');
  }
  const a = orbitPose(o, 0), b = orbitPose(o, 1);
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - 20) < 0.2, '20 m en 1 s');
  assert.equal(orbitPose(o, 0).bank > 0, true); assert.equal(orbitPose({ ...o, dir: -1 }, 0).bank < 0, true);
  // le centre est bien du côté où il penche : à droite pour dir = +1 (droite = (-fz, fx))
  const p = orbitPose(o, 5), fx = p.vx / 20, fz = p.vz / 20, toC = { x: o.cx - p.x, z: o.cz - p.z };
  assert.ok(toC.x * -fz + toC.z * fx > 0, 'centre à droite');
});

test('sens inverse : tourne dans l\'autre sens', () => {
  const o = { cx: 0, cz: 0, radius: 50, alt: 60, speed: 10, dir: 1 }, r = { ...o, dir: -1 };
  const a = orbitPose(o, 2), b = orbitPose(r, 2);
  assert.ok(Math.abs(a.z + b.z) < 1e-9 && Math.abs(a.x - b.x) < 1e-9, 'symétrique par rapport à l\'axe x');
});

test('passage d\'avions : traverse devant le joueur, perpendiculairement à son regard', () => {
  const player = { x: 5, z: -3 };
  for (const heading of [0, 1.2, -2.5]) for (let i = 0; i < 30; i++) {
    const p = planPass(player, heading, Math.random);
    const fwd = { x: Math.sin(heading), z: Math.cos(heading) };
    assert.ok(Math.abs(p.dir.x * fwd.x + p.dir.z * fwd.z) < 1e-9, 'trajectoire perpendiculaire au regard');
    const mid = passPosition(p, p.dur / 2);
    const rel = { x: mid.x - player.x, z: mid.z - player.z };
    assert.ok(rel.x * fwd.x + rel.z * fwd.z > 100, 'le point de passage est devant');
    assert.ok(Math.hypot(rel.x, rel.z) < 280, 'et pas trop loin pour qu\'on le voie');
    assert.ok(p.alt >= 85 && p.alt <= 135 && p.speed >= 140 && p.speed <= 170);
    assert.ok(Math.abs(p.dur * p.speed - 1300) < 1e-6);
  }
});

test('position le long du passage : départ, arrivée, fin', () => {
  const p = planPass({ x: 0, z: 0 }, 0, () => 0.5);
  assert.deepEqual({ x: passPosition(p, 0).x, z: passPosition(p, 0).z }, p.from);
  const e = passPosition(p, p.dur + 5);
  assert.ok(e.done && Math.abs(e.x - p.to.x) < 1e-9 && Math.abs(e.z - p.to.z) < 1e-9);
  assert.equal(passPosition(p, 1).done, false);
});

test('effet Doppler : plus aigu en approche, plus grave en s\'éloignant, borné', () => {
  assert.ok(dopplerRatio(-150) > 1.5 && dopplerRatio(150) < 0.8);
  assert.equal(dopplerRatio(0), 1);
  assert.ok(isFinite(dopplerRatio(-1e6)) && dopplerRatio(1e6) > 0);
  const L = { x: 0, z: 0 };
  assert.ok(radialSpeed({ x: 100, z: 0 }, { x: -150, z: 0 }, L) < -149, 's\'approche');
  assert.ok(radialSpeed({ x: 100, z: 0 }, { x: 150, z: 0 }, L) > 149, 's\'éloigne');
  assert.ok(Math.abs(radialSpeed({ x: 0, z: 100 }, { x: 150, z: 0 }, L)) < 1e-9, 'passe au plus près : pas de variation');
  assert.equal(radialSpeed(L, { x: 5, z: 5 }, L), 0);
});
