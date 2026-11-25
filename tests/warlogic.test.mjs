import test from 'node:test';
import assert from 'node:assert/strict';
import { WAR, ringPoint, fightPlan, strafeLine, blastDamage, cadence } from '../src/warlogic.js';
import { mulberry32 } from '../src/combat.js';

const P = { x: 10, z: -20 };

test('point autour du joueur : dans la bonne distance, et le plus souvent devant lui', () => {
  const rng = mulberry32(5); let front = 0;
  for (let i = 0; i < 400; i++) {
    const heading = 0.7, q = ringPoint(P, heading, rng, [100, 300]);
    const d = Math.hypot(q.x - P.x, q.z - P.z); assert.ok(d >= 100 - 1e-9 && d <= 300 + 1e-9);
    const dot = ((q.x - P.x) * Math.sin(heading) + (q.z - P.z) * Math.cos(heading)) / d;
    if (dot > 0.45) front++;
  }
  assert.ok(front > 400 * 0.55, `${front} sur 400 devant`);
});

test('combat lointain : deux groupes éloignés du joueur, face à face, rafales de taille raisonnable', () => {
  const rng = mulberry32(9);
  for (let i = 0; i < 100; i++) {
    const f = fightPlan(P, 0, rng);
    assert.ok(Math.hypot(f.a.x - P.x, f.a.z - P.z) >= WAR.fight.range[0] - 1e-9);
    const sep = Math.hypot(f.a.x - f.b.x, f.a.z - f.b.z); assert.ok(sep >= WAR.fight.len[0] - 1e-9 && sep <= WAR.fight.len[1] + 1e-9);
    assert.ok(f.shots >= WAR.fight.shots[0] && f.shots <= WAR.fight.shots[1] && f.gap >= WAR.fight.gap[0] && f.gap <= WAR.fight.gap[1]);
  }
});

test('rafale d\'hélicoptère : ne commence jamais sur le joueur, avance sur 20-45 m', () => {
  const rng = mulberry32(3);
  for (let i = 0; i < 100; i++) {
    const s = strafeLine(P, rng);
    assert.ok(Math.hypot(s.from.x - P.x, s.from.z - P.z) >= WAR.heli.ring[0] - 1e-9);
    const L = Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z); assert.ok(L >= WAR.heli.length[0] - 1e-9 && L <= WAR.heli.length[1] + 1e-9);
  }
});

test('souffle d\'une explosion : fort au centre, décroît, nul au bord ; plus grosse = plus large', () => {
  assert.ok(blastDamage(0) >= 70 && blastDamage(0) <= 80);
  assert.ok(blastDamage(3) > blastDamage(6) && blastDamage(6) > blastDamage(9));
  assert.equal(blastDamage(10), 0); assert.equal(blastDamage(50), 0);
  assert.ok(blastDamage(12, 1.5) > 0 && blastDamage(12, 1) === 0);
  assert.ok(blastDamage(4) < 100, 'un obus à 4 m ne tue pas d\'un coup un joueur en pleine forme');
  assert.ok(blastDamage(0, 1.45) >= 75);
});

test('cadence : le niveau divise les intervalles (téléphone = moins d\'événements)', () => {
  const full = cadence(WAR.fight, 1), half = cadence(WAR.fight, 0.5);
  assert.equal(half.min, full.min * 2); assert.equal(half.max, full.max * 2); assert.equal(half.first, full.first * 2);
});
