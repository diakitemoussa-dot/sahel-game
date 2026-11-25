import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { ConvoyLogic } from '../src/convoy.js';
import { buildPath } from '../src/vehicle.js';

const J = (f) => JSON.parse(readFileSync(new URL('../config/' + f, import.meta.url), 'utf8'));
const cfg = J('convoy.json'), road = J('road.json').roads.find((r) => r.id === cfg.road), npcs = J('npcs.json').npcs;
const step = (c, t, dt = 0.05) => { for (let i = 0; i < t / dt; i++) c.update(dt); };

test('le convoi roule doucement, en file, sans que personne ne rattrape celui qui le précède', () => {
  const c = new ConvoyLogic({ starts: [60, 43, 26], cruise: 3.2, spacing: 17 });
  step(c, 30);
  for (const v of c.vehicles) assert.ok(v.v > 3 && v.v <= 3.2001, `vitesse ${v.v}`);
  for (let i = 1; i < c.vehicles.length; i++) assert.ok(c.vehicles[i - 1].s - c.vehicles[i].s >= 16.5, 'distance gardée');
  assert.ok(c.vehicles[0].s > 60 + 80, 'il avance');
});

test('un blindé touché deux fois est neutralisé et s’arrête ; il garde sa place sur la piste', () => {
  const c = new ConvoyLogic({ starts: [60, 43, 26], cruise: 3.2, spacing: 17, hp: 3 });
  step(c, 10);
  assert.equal(c.damage(0, 1), false); assert.equal(c.vehicles[0].state, 'roule');
  assert.equal(c.damage(0, 2), true); assert.equal(c.vehicles[0].state, 'neutralise');
  assert.equal(c.damage(0, 5), false, 'une épave ne meurt pas deux fois');
  step(c, 20);
  assert.ok(c.vehicles[0].v < 0.01, 'l’épave s’arrête');
  assert.equal(c.alive.length, 2); assert.equal(c.allDown, false);
});

test('contournement : les blindés qui suivent dépassent l’épave en se décalant, sans la toucher, puis reviennent sur la piste', () => {
  const c = new ConvoyLogic({ starts: [60, 43, 26], cruise: 3.2, spacing: 17, hp: 3, clear: 5.6 });
  step(c, 8); c.damage(0, 3);
  const wreck = c.vehicles[0];
  let minLat = [99, 99], maxLat = [0, 0];
  for (let k = 0; k < 90 / 0.05; k++) {
    c.update(0.05);
    for (const i of [1, 2]) {
      const v = c.vehicles[i], along = Math.abs(v.s - wreck.s), side = Math.abs(v.lat - wreck.lat);
      if (along < 12) minLat[i - 1] = Math.min(minLat[i - 1], side);                                 // à hauteur de l'épave (deux boîtes de 10 m de long : elles se chevaucheraient en dessous de 10 m)
      maxLat[i - 1] = Math.max(maxLat[i - 1], Math.abs(v.lat));
    }
  }
  for (const i of [1, 2]) {
    const v = c.vehicles[i];
    assert.ok(v.s > wreck.s + 15, `blindé ${i} est passé (s=${v.s.toFixed(0)}, épave ${wreck.s.toFixed(0)})`);
    assert.ok(Math.abs(v.lat) < 0.2, `blindé ${i} est revenu sur la piste (lat ${v.lat.toFixed(2)})`);
    assert.ok(minLat[i - 1] >= 4.4, `marge latérale suffisante (${minLat[i - 1].toFixed(2)} m, il faut plus de 4,2 m)`);
    assert.ok(maxLat[i - 1] < 6.8, 'il ne s’écarte pas plus que nécessaire');
  }
  assert.ok(c.vehicles[1].s - c.vehicles[2].s > 12, 'la file garde ses distances');
});

test('contournement : il choisit le côté praticable, et s’arrête avant l’épave si aucun côté ne l’est', () => {
  const droite = new ConvoyLogic({ starts: [60, 43], hp: 3, sideOk: (s, lat) => lat < 0 });           // le côté gauche est bloqué
  step(droite, 5); droite.damage(0, 3); step(droite, 80);
  assert.ok(droite.vehicles[1].s > droite.vehicles[0].s + 15, 'il passe par la droite');
  const bloque = new ConvoyLogic({ starts: [60, 43], hp: 3, sideOk: () => false });
  step(bloque, 5); bloque.damage(0, 3); step(bloque, 80);
  assert.ok(bloque.vehicles[1].v < 0.01 && bloque.vehicles[1].s < bloque.vehicles[0].s - 12, 'aucun passage : il attend derrière');
});

test('explosion : 2 points de dégâts en plein dessus, 1 à moins de 8 m, rien au-delà', () => {
  const c = new ConvoyLogic({ starts: [60, 43, 26], hp: 3 });
  const pos = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 40, z: 0 }];
  assert.deepEqual(c.blast(2, 0, pos).map((h) => [h.i, h.dmg]), [[0, 2]]);
  assert.deepEqual(c.blast(26, 0, pos).map((h) => [h.i, h.dmg]), [[1, 1]]);
  assert.deepEqual(c.blast(100, 0, pos), []);
  assert.equal(c.vehicles[0].hp, 1); assert.equal(c.vehicles[1].hp, 2);
  const k = c.blast(0, 0, pos); assert.equal(k[0].killed, true, 'le deuxième tir neutralise');
});

test('arrivé au bout de la piste, le convoi s’arrête sans se chevaucher', () => {
  const c = new ConvoyLogic({ starts: [60, 43], cruise: 5, spacing: 17, length: 130 });
  step(c, 60);
  assert.ok(c.vehicles.every((v) => v.v < 0.01));
  assert.ok(c.vehicles[0].s <= 130 && c.vehicles[0].s - c.vehicles[1].s >= 16);
});

test('config : le convoi démarre sur la piste, en file, et des lance-missiles sont en embuscade près de la piste', () => {
  const path = buildPath(road.points);
  assert.ok(existsSync(new URL('../' + cfg.file, import.meta.url)));
  assert.ok(cfg.starts.every((s) => s > 0 && s < path.length - 100));
  const sorted = [...cfg.starts].sort((a, b) => b - a);
  assert.deepEqual(cfg.starts, sorted, 'le premier est en tête');
  for (let i = 1; i < cfg.starts.length; i++) assert.ok(cfg.starts[i - 1] - cfg.starts[i] >= cfg.spacing - 0.5);
  const lanceurs = npcs.filter((n) => n.launcher);
  assert.ok(lanceurs.length >= 3);
  for (const n of lanceurs) {
    const [x, y] = n.route[0];
    const d = Math.min(...path.pts.map((p) => Math.hypot(p[0] - x, p[1] - y)));
    assert.ok(d > cfg.launcher.min * 0.6 && d < cfg.launcher.max, `${n.id} à ${d.toFixed(0)} m de la piste`);
  }
});

import { Convoy } from '../src/convoy.js';
import { Skirmish } from '../src/skirmish.js';

test('avancement pour la carte : vivants, pourcentage du plus avancé des vivants, position de chacun sur la route', () => {
  const logic = new ConvoyLogic({ starts: [200, 183, 166], hp: 3 });
  const ctx = { path: { length: 400 }, logic };
  let p = Convoy.prototype.progress.call(ctx);
  assert.equal(p.alive, 3); assert.equal(p.total, 3); assert.equal(p.fraction, 0.5); assert.equal(p.done, false);
  assert.deepEqual(p.vehicles.map((v) => v.f), [0.5, 0.4575, 0.415]);
  logic.damage(0, 3);                                                         // la tête est neutralisée : l'avancement suit le plus avancé des vivants
  p = Convoy.prototype.progress.call(ctx);
  assert.equal(p.alive, 2); assert.equal(p.fraction, 0.4575); assert.equal(p.vehicles[0].alive, false);
  logic.damage(1, 3); logic.damage(2, 3);
  p = Convoy.prototype.progress.call(ctx);
  assert.equal(p.alive, 0); assert.ok(p.fraction > 0.4);
});

test('tirs aériens : ils visent un groupe de miliciens loin du joueur et des alliés, et d’abord un lance-missiles qui vient de tirer', () => {
  const npc = (x, z, o = {}) => ({ dead: false, _asleep: false, player: { pos: { x, z } }, brain: { state: 'patrol' }, ...o });
  const ctx = (npcs, allies = []) => ({ player: { pos: { x: 0, z: 0 } }, allies, npcs, time: 100, rng: () => 0 });
  const aim = (c) => Skirmish.prototype.airTarget.call(c);
  assert.equal(aim(ctx([])), null, 'personne : pas de cible (retour aux foyers habituels)');
  // trop près du joueur, trop loin, endormi, mort : ignorés
  assert.equal(aim(ctx([npc(20, 0), npc(400, 0), npc(100, 0, { _asleep: true }), npc(120, 0, { dead: true })])), null);
  // un groupe de 3 à l'est, un milicien isolé au nord : le groupe
  const group = [npc(150, 0), npc(153, 2), npc(148, -3)], alone = npc(0, 150);
  const t = aim(ctx([alone, ...group])); assert.ok(Math.hypot(t.x - 150, t.z) < 5, 'le groupe');
  // un lance-missiles qui vient de tirer passe avant le groupe
  const launcher = npc(0, 200, { _firedAt: 95 });
  assert.deepEqual(aim(ctx([...group, launcher])), { x: 0, z: 200 });
  const old = npc(0, 200, { _firedAt: 10 });
  assert.ok(Math.hypot(aim(ctx([...group, old])).x - 150, aim(ctx([...group, old])).z) < 5, 'un tir ancien ne compte plus');
  // pas de tir fratricide : un groupe à moins de 30 m d'un allié est évité
  const ally = { dead: false, player: { pos: { x: 150, z: 10 } } };
  assert.ok(Math.hypot(aim(ctx([alone, ...group], [ally])).x, aim(ctx([alone, ...group], [ally])).z - 150) < 5, 'il vise le milicien isolé, pas le groupe près de l’allié');
});

test('contournement : le contrôle du terrain de chaque côté fonctionne (terrain plat praticable, forte pente ou objet : refusé)', () => {
  const path = buildPath(road.points);
  const ctx = (groundY, mesh = null) => ({ path, world: { groundY, mesh } });
  const sideOk = (c, s, lat) => Convoy.prototype._sideOk.call(c, s, lat);
  assert.equal(sideOk(ctx(() => 0), 100, 5.6), true, 'terrain plat');
  assert.equal(sideOk(ctx((x, z) => 0.8 * x), 100, 5.6), false, 'pente de 39° : trop raide');
  assert.equal(sideOk(ctx(() => 0, { insideObject: () => 3 }), 100, 5.6), false, 'un objet de la carte (rocher, mur) est dans le passage');
  assert.equal(sideOk(ctx(() => 0, { insideObject: () => -1 }), 100, 5.6), true, 'aucun objet');
});
