import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BURN, BurnState, burnRadius, zoneOf, fireZones, inFire, keepOut } from '../src/firelogic.js';

const COL = { radius: 3 }, CAR = { radius: 1.3 };
const site = (o = {}) => ({ fire: true, x: 0, z: 0, y: 0, scale: 1, intensity: 1, age: 0, p: COL, ...o });

test('zone de brûlure : plus large que la zone des flammes, selon la taille du foyer', () => {
  assert.ok(burnRadius(COL, 1) > 1.65 && burnRadius(COL, 1) < 3.5);
  assert.ok(burnRadius(COL, 1.2) > burnRadius(COL, 1) && burnRadius(CAR, 1) < burnRadius(COL, 1));
});

test('un foyer qui brûle donne une zone ; éteint, il n\'en donne plus', () => {
  assert.ok(zoneOf(site()));
  assert.equal(zoneOf(site({ fire: false })), null);
  assert.equal(zoneOf(site({ intensity: 0.1 })), null, 'presque éteint');
  const tmp = (age) => site({ temp: true, age, life: 80 });
  assert.equal(zoneOf(tmp(0)), null, 'l\'impact vient d\'arriver : le feu n\'a pas encore pris (intensité 0)');
  assert.ok(zoneOf(tmp(10)));
  assert.equal(zoneOf(tmp(79)), null, 'en fin de vie le feu est éteint');
  assert.equal(fireZones([site(), site({ fire: false }), site({ x: 50 })]).length, 2);
});

test('dans le feu : cercle, et pas au-dessus (toit, saut)', () => {
  const z = fireZones([site({ x: 10, z: 10 })]);
  assert.ok(inFire({ x: 10, z: 11 }, z)); assert.ok(!inFire({ x: 10, z: 10 + 5 }, z));
  assert.ok(inFire({ x: 10, z: 10 + 5 }, z, 3), 'avec une marge');
  assert.ok(!inFire({ x: 10, z: 11, y: 4 }, z), 'à 4 m au-dessus : pas brûlé');
  assert.ok(inFire({ x: 10, z: 11, y: 0.5 }, z));
});

test('brûlure : les dégâts montent progressivement, la mort prend plusieurs secondes', () => {
  const b = new BurnState(); let hp = 100, t = 0, first = null, dead = null;
  const dmgAt = [];
  while (hp > 0 && t < 30) { const r = b.update(0.05, true); hp -= r.dmg; t += 0.05; if (first === null) first = r.dmg / 0.05; if (Math.abs(t - 1) < 1e-6 || Math.abs(t - 4) < 1e-6) dmgAt.push(r.dmg / 0.05); }
  assert.ok(Math.abs(first - BURN.dps0) < 0.5, 'au contact : peu de dégâts');
  assert.ok(dmgAt[1] > dmgAt[0] && dmgAt[1] <= BURN.dps1 + 1e-9, 'plus il reste, plus ça brûle');
  assert.ok(t > 4 && t < 9, `mort après ${t.toFixed(1)} s`);
  // une courte traversée : survit
  const c = new BurnState(); let h = 100; for (let i = 0; i < 20; i++) h -= c.update(0.05, true).dmg; for (let i = 0; i < 100; i++) h -= c.update(0.05, false).dmg;
  assert.ok(h > 60 && h < 95, `traversée d'une seconde : ${h.toFixed(0)} pv restants`);
});

test('après la sortie : il brûle encore un moment, de moins en moins, puis plus rien', () => {
  const b = new BurnState(); b.update(0.5, true);
  const first = b.update(0.1, false), later = (() => { for (let i = 0; i < 15; i++) b.update(0.1, false); return b.update(0.1, false); })();
  assert.ok(first.burning && first.dmg > 0);
  assert.ok(later.dmg < first.dmg);
  for (let i = 0; i < 40; i++) b.update(0.1, false);
  const end = b.update(0.1, false); assert.equal(end.dmg, 0); assert.equal(end.burning, false);
  assert.equal(new BurnState().update(0.1, false).dmg, 0, 'jamais allumé : aucun dégât');
});

test('started : vrai seulement à l\'allumage', () => {
  const b = new BurnState();
  assert.equal(b.update(0.1, false).started, false);
  assert.equal(b.update(0.1, true).started, true); assert.equal(b.update(0.1, true).started, false);
});

test('un PNJ qui marche vers le feu reste dehors et contourne', () => {
  const zones = fireZones([site()]), R = zones[0].r + BURN.margin;
  // part de loin, marche droit sur le centre à 2,4 m/s
  const p = { x: 20, z: 0 }; let minD = 99;
  for (let i = 0; i < 600; i++) {
    const prev = { x: p.x, z: p.z }, d = Math.hypot(p.x, p.z), s = 2.4 / 60;
    p.x -= p.x / d * s; p.z -= p.z / d * s;
    keepOut(p, prev, zones, 1, 1 / 60);
    minD = Math.min(minD, Math.hypot(p.x, p.z));
  }
  assert.ok(minD >= R - 1e-6, `distance minimale ${minD.toFixed(2)} >= ${R.toFixed(2)}`);
  assert.ok(!inFire(p, zones), 'jamais brûlé');
  assert.ok(Math.abs(p.z) > 0.5, 'il a glissé sur le côté au lieu de rester bloqué en face');
});

test('un PNJ pris par une explosion sort du feu en courant (sans téléportation)', () => {
  const zones = fireZones([site()]), R = zones[0].r + BURN.margin;
  const p = { x: 0.5, z: 0 }; let frames = 0, maxJump = 0;
  while (Math.hypot(p.x, p.z) < R - 1e-6 && frames < 600) {
    const prev = { x: p.x, z: p.z }; keepOut(p, prev, zones, 1, 1 / 60);
    maxJump = Math.max(maxJump, Math.hypot(p.x - prev.x, p.z - prev.z)); frames++;
  }
  assert.ok(maxJump <= BURN.flee / 60 + 1e-6, 'pas plus vite que sa course');
  assert.ok(frames > 10 && frames < 120, `sorti en ${frames} images`);
});

test('plusieurs foyers côte à côte, et pas de zone : rien ne bouge', () => {
  const p = { x: 3, z: 3 }; assert.equal(keepOut(p, { x: 3, z: 3 }, [], 1), false);
  const zones = fireZones([site({ x: 0 }), site({ x: 6 })]);
  const q = { x: 3, z: 0 }; keepOut(q, { x: 3, z: 6 }, zones, 1, 1 / 60);
  assert.ok(!inFire(q, zones), 'entre deux foyers rapprochés : il est écarté des deux');
});

test('les routes de patrouille (config) ne passent pas dans les zones de feu', () => {
  const r = (f) => JSON.parse(fs.readFileSync(new URL(`../config/${f}`, import.meta.url), 'utf8'));
  const sites = [
    ...r('smoke.json').sites.map((s) => ({ id: s.id, x: s.pos[0], y: s.pos[1], r: burnRadius(COL, s.scale ?? 1) })),
    ...(r('props.json').props ?? r('props.json')).filter((p) => p.smoke).map((p) => ({ id: p.id, x: p.pos[0], y: p.pos[1], r: burnRadius(p.smoke.kind === 'column' ? COL : CAR, p.smoke.scale ?? 1) })),
  ];
  assert.ok(sites.length >= 9);
  const segDist = (a, b, s) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((s.x - a[0]) * dx + (s.y - a[1]) * dy) / L)) : 0; return Math.hypot(a[0] + dx * t - s.x, a[1] + dy * t - s.y); };
  const npcs = r('npcs.json');
  for (const e of npcs.npcs) {
    const pts = e.route; if (!pts) continue;
    for (const s of sites) {
      const d = Math.min(...pts.map((a, i) => segDist(a, pts[(i + 1) % pts.length], s)));
      assert.ok(d >= s.r + BURN.margin + 0.3, `${e.id} passe à ${d.toFixed(1)} m de ${s.id} (zone évitée : ${(s.r + BURN.margin).toFixed(1)} m)`);
    }
  }
});
