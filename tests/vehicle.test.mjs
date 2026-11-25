import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPath, pathAt, nearestS, Cruise, vehiclePose, smoothAngle } from '../src/vehicle.js';
import { BoardingFlow, groundBlend } from '../src/boarding.js';
import { MeshWorld } from '../src/meshworld.js';

const cfg = JSON.parse(readFileSync(new URL('../config/road.json', import.meta.url), 'utf8'));

test('chemin : longueur de la piste, cap vers l’est sur le premier tronçon (repère Blender -> three.js)', () => {
  const path = buildPath(cfg.roads[0].points);
  assert.ok(path.length > 350);
  const a = pathAt(path, 5);
  assert.ok(Math.sin(a.heading) > 0.9, 'la piste part vers l’est (+x)');
  assert.deepEqual([pathAt(path, -10).x, pathAt(path, 1e9).x].map(Math.round), [Math.round(path.pts[0][0]), Math.round(path.pts.at(-1)[0])], 'bornes');
});

test('régulateur : il accélère, tient sa vitesse et s’arrête pile au bout', () => {
  const c = new Cruise({ cruise: 8, accel: 2, brake: 4 });
  let s = 0; const stopAt = 100;
  for (let i = 0; i < 4000 && !(c.stopped && s > 50); i++) { const v = c.update(0.05, s, stopAt); s += v * 0.05; assert.ok(v <= 8.0001); if (i === 100) assert.ok(v > 7.9, 'vitesse de croisière'); }
  assert.ok(s <= stopAt + 0.2 && s > stopAt - 1, `arrêt près du bout (${s.toFixed(2)})`);
  const d = new Cruise({ cruise: 8, accel: 8, brake: 4 }); for (let i = 0; i < 100; i++) d.update(0.05, 0, 1e9);
  d.braking = true; let n = 0; while (!d.stopped && n++ < 400) d.update(0.05, 0, 1e9);
  assert.ok(d.stopped && n * 0.05 < 3, 'il freine à la demande');
});

test('inclinaison : le nez monte sur une pente qui monte devant, et reste à plat sur du plat', () => {
  assert.deepEqual([vehiclePose(() => 5, 0, 0, 0).pitch, vehiclePose(() => 5, 0, 0, 0).roll], [0, 0]);
  const up = vehiclePose((x, z) => z * 0.2, 0, 0, 0);                  // cap 0 = vers +z, le sol monte de 20 %
  assert.ok(up.pitch > 0.18 && up.pitch < 0.22);
  assert.ok(Math.abs(smoothAngle(3.1, -3.1, 1) - (-3.1)) < 1e-9 || Math.abs(smoothAngle(3.1, -3.1, 1) - (2 * Math.PI - 3.1)) < 1e-9, 'plus court chemin');
});

test('passager : entrée, glissement, place, puis sortie à l’envers', () => {
  const f = new BoardingFlow({ clipDur: 6, speed: 2, alignTime: 0.5, slideTime: 1 });
  assert.equal(f.phase, 'wait'); f.tick(5); assert.equal(f.phase, 'wait', 'il attend son tour');
  f.go(); assert.equal(f.phase, 'align'); f.tick(0.6); assert.equal(f.phase, 'enter');
  f.tick(1.5); assert.ok(Math.abs(f.pose.clipT - 3) < 1e-9, 'animation à vitesse x2');
  f.tick(1.6); assert.equal(f.phase, 'slide'); assert.equal(f.pose.clipT, 6);
  f.tick(1.1); assert.ok(f.seated); assert.equal(f.pose.slide, 1);
  f.release(); assert.equal(f.phase, 'unslide'); f.tick(1.1); assert.equal(f.phase, 'exit');
  f.tick(1.5); assert.ok(Math.abs(f.pose.clipT - 3) < 1e-9, 'l’animation se joue à l’envers');
  f.tick(2); assert.ok(f.done);
});

test('collision : le véhicule peut être retiré puis reposé sans toucher au reste de la carte', () => {
  const tri = (dx) => ({ positions: new Float32Array([dx, 0, 0, dx, 0, 1, dx + 1, 0, 0]), indices: new Uint32Array([0, 1, 2]) });
  const m = new MeshWorld(); m.add(tri(0)); m.add(tri(10));
  const h = m.lastAdd; m.add(tri(20));
  assert.equal(m.triangles, 3);
  m.remove(h); assert.equal(m.triangles, 2);
  assert.ok(m.surfaceY(0.2, 0.2, 5) !== null, 'le premier est toujours là');
  assert.equal(m.surfaceY(10.2, 0.2, 5), null, 'le retiré a disparu');
  assert.ok(m.surfaceY(20.2, 0.2, 5) !== null, 'celui posé après aussi est resté');
  m.add(tri(10)); assert.equal(m.triangles, 3);
});

test('tireur : après l’entrée il se lève, marche jusqu’à la trappe, monte à son poste, y reste debout, et redescend directement par la porte', () => {
  const f = new BoardingFlow({ clipDur: 6, speed: 2, alignTime: 0.5, slideTime: 1.0, gunner: true, walkTime: 1.6 });
  f.go(); f.tick(0.6); assert.equal(f.phase, 'enter');
  f.tick(3.1); assert.equal(f.phase, 'walk'); assert.ok(f.standing && !f.seated);
  f.tick(0.8); assert.ok(Math.abs(f.pose.slide - 0.5) < 1e-9, 'à mi-chemin vers la trappe');
  f.tick(0.9); assert.equal(f.phase, 'rise');
  f.tick(0.5); assert.ok(Math.abs(f.pose.slide - 0.5) < 1e-9, 'à mi-hauteur');
  f.tick(0.6); assert.equal(f.phase, 'gunner'); assert.ok(f.standing && f.seated, 'compte comme installé : le blindé peut partir');
  f.tick(100); assert.equal(f.phase, 'gunner', 'il reste à sa place');
  f.release(); assert.equal(f.phase, 'exit'); assert.equal(f.pose.clipT, 6, 'la sortie repart de la fin de l’animation');
  f.tick(3.1); assert.ok(f.done);
  const g = new BoardingFlow({ clipDur: 6, speed: 1, gunner: true, walkTime: 1 }); g.go(); g.tick(0.7); g.tick(6.1); g.tick(0.5);
  g.release(); assert.equal(g.phase, 'exit', 'on peut aussi redescendre pendant la marche');
});

test('sol : plein effet dehors, effacé à l’intérieur, progressif pendant la montée sur le marchepied', () => {
  assert.equal(groundBlend(0, 6.5), 1);
  assert.equal(groundBlend(6.5 * 0.1, 6.5), 1);
  assert.equal(groundBlend(6.5, 6.5), 0);
  assert.equal(groundBlend(6.5 * 0.45, 6.5), 0);
  const mid = groundBlend(6.5 * 0.305, 6.5);
  assert.ok(mid > 0.4 && mid < 0.6, `à mi-montée ${mid}`);
  let prev = 1; for (let i = 0; i <= 100; i++) { const v = groundBlend(i / 100 * 6.5, 6.5); assert.ok(v <= prev + 1e-12); prev = v; }
});


import { rideOnSurface } from '../src/vehicle.js';

test('posé sur ses roues : sur un plan incliné, les quatre roues touchent le sol, quel que soit le cap', () => {
  const W = { front: 2.91, rear: -1.69, half: 1.72 };
  const plane = (a, b, c) => (x, z) => a * x + b * z + c;
  for (const heading of [0, 0.7, 1.9, -2.4]) {
    const s = plane(0.12, -0.2, 5);
    const p = rideOnSurface(s, 10, -20, heading, W);
    const fx = Math.sin(heading), fz = Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
    for (const [a, b] of [[W.front, -W.half], [W.front, W.half], [W.rear, -W.half], [W.rear, W.half]]) {
      // hauteur de la roue = origine + inclinaison : doit égaler le sol sous elle
      const wy = p.y + Math.tan(p.pitch) * a + Math.tan(p.roll) * b;
      assert.ok(Math.abs(wy - s(10 + fx * a + rx * b, -20 + fz * a + rz * b)) < 1e-6, `cap ${heading}`);
    }
  }
});

test('posé sur ses roues : une bosse sous une seule roue ne fait enfoncer aucune roue', () => {
  const W = { front: 2.91, rear: -1.69, half: 1.72 };
  const bump = (x, z) => (Math.hypot(x - 1.72, z - 2.91) < 0.6 ? 0.5 : 0);        // bosse de 50 cm sous la roue avant droite (cap 0)
  const p = rideOnSurface(bump, 0, 0, 0, W);
  for (const [a, b] of [[W.front, -W.half], [W.front, W.half], [W.rear, -W.half], [W.rear, W.half]]) {
    const wy = p.y + Math.tan(p.pitch) * a + Math.tan(p.roll) * b;
    assert.ok(wy >= bump(b, a) - 1e-6, `aucune roue sous le sol (${wy.toFixed(3)})`);
  }
  assert.ok(p.roll > 0 && p.pitch > 0, 'il se penche du côté de la bosse : côté droit en haut, nez en haut');
  assert.equal(p.drops.length, 4); assert.ok(p.drops.every((d) => d >= 0), 'une suspension ne peut que descendre');
  assert.ok(Math.min(...p.drops) < 1e-9, 'la roue qui porte n’a pas besoin de descendre');
  const plane = rideOnSurface((x, z) => 0.1 * x, 0, 0, 0, W);
  assert.ok(plane.drops.every((d) => d < 1e-9), 'sur un plan, aucune roue ne pend');
});
