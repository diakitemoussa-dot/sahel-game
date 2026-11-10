import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Patrol } from '../src/patrol.js';
import { pushOut } from '../src/colliders.js';

const square = [[0, 0], [10, 0], [10, 10], [0, 10]];

// simule un PNJ qui avance à 2 m/s vers le cap demandé
function run(patrol, secs, start = { x: 0, z: 0 }, speed = 2, obstacle = null) {
  const p = { ...start }, log = [];
  for (let t = 0; t < secs; t += 0.05) {
    const b = patrol.step(0.05, p);
    if (b.moving) { const nx = p.x + Math.sin(b.heading) * speed * 0.05, nz = p.z + Math.cos(b.heading) * speed * 0.05; if (!obstacle || !obstacle(nx, nz)) { p.x = nx; p.z = nz; } }
    log.push({ ...b, x: p.x, z: p.z });
  }
  return log;
}

test('il va vers le premier point, puis fait une pause, puis repart vers le suivant', () => {
  const pa = new Patrol(square, { wait: 2, startIndex: 1 });
  const log = run(pa, 30);
  assert.ok(log.some((l) => l.mode === 'wait'), 'il s\'arrête à un point');
  assert.deepEqual([...new Set(log.map((l) => l.index))].slice(0, 3), [1, 2, 3], 'il enchaîne les points dans l\'ordre');
});

test('le cap est celui du point visé (angle autour de Y : 0 = +z, pi/2 = +x)', () => {
  const pa = new Patrol([[0, 0], [10, 0]], { startIndex: 1 });
  assert.ok(Math.abs(pa.step(0.05, { x: 0, z: 0 }).heading - Math.PI / 2) < 1e-9);
  const pb = new Patrol([[0, 0], [0, 10]], { startIndex: 1 });
  assert.ok(Math.abs(pb.step(0.05, { x: 0, z: 0 }).heading) < 1e-9);
});

test('pendant la pause il ne bouge pas et garde son cap', () => {
  const pa = new Patrol([[0, 0], [5, 0]], { wait: 3, startIndex: 1 });
  const log = run(pa, 10, { x: 0, z: 0 });
  const wait = log.filter((l) => l.mode === 'wait');
  assert.ok(wait.length > 40);
  assert.ok(wait.every((l) => !l.moving));
  assert.ok(new Set(wait.slice(0, 40).map((l) => l.heading.toFixed(3))).size === 1);
});

test('bloqué par un obstacle : il abandonne ce point au bout de quelques secondes', () => {
  const pa = new Patrol([[0, 0], [10, 0], [0, 10]], { startIndex: 1, stuckTime: 2 });
  const log = run(pa, 12, { x: 0, z: 0 }, 2, (x) => x > 3);       // mur en x = 3
  assert.ok(log.some((l) => l.index === 2), 'il a continué vers le point suivant');
});

test('une patrouille a besoin de 2 points', () => {
  assert.throws(() => new Patrol([[0, 0]]), /2 points/);
});

// --- la vraie configuration des PNJ : routes libres d'obstacles, tenue connue, fichier présent
const npcs = JSON.parse(readFileSync(new URL('../config/npcs.json', import.meta.url), 'utf8')).npcs;
const cols = JSON.parse(readFileSync(new URL('../config/colliders.json', import.meta.url), 'utf8'));
const uniforms = JSON.parse(readFileSync(new URL('../config/uniforms.json', import.meta.url), 'utf8')).uniforms;
const free = (x, y, r) => { const p = { x, y }; pushOut(p, r, cols); return Math.hypot(p.x - x, p.y - y) < 1e-6; };

for (const n of npcs) {
  test(`PNJ ${n.id} : tenue existante, fichier présent, route libre d'obstacles`, () => {
    const u = uniforms.find((x) => x.id === n.uniform);
    assert.ok(u, `tenue inconnue : ${n.uniform}`);
    assert.ok(existsSync(new URL('../' + u.file, import.meta.url)), u.file);
    assert.ok(n.route.length >= 2);
    for (let i = 0; i < n.route.length; i++) {
      const a = n.route[i], b = n.route[(i + 1) % n.route.length];
      const k = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.3);
      for (let j = 0; j <= k; j++) assert.ok(free(a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k, 0.5), `obstacle sur la route de ${n.id}`);
    }
  });
}
