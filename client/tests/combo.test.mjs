import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Combo, COMBOS } from '../src/combo.js';

test('premier appui : première attaque de l\'arme', () => {
  const c = new Combo();
  assert.equal(c.press('none', false, 0), COMBOS.none[0]);
  assert.equal(new Combo().press('rifle', false, 0), COMBOS.rifle[0]);
  assert.equal(new Combo().press('pistol', false, 0), COMBOS.pistol[0]);
});

test('un appui pendant une attaque est mis en attente et part quand elle se termine', () => {
  const c = new Combo();
  const first = c.press('none', false, 0);
  assert.equal(c.press('none', true, 0.4), null, 'mis en attente');
  assert.equal(c.finished(1.3), COMBOS.none[1], 'la suivante démarre');
  assert.equal(first, COMBOS.none[0]);
});

test('sans appui en attente, la fin d\'une attaque ne lance rien', () => {
  const c = new Combo();
  c.press('none', false, 0);
  assert.equal(c.finished(1.3), null);
});

test('plusieurs appuis pendant la même attaque : une seule suite, pas de rafale', () => {
  const c = new Combo();
  c.press('none', false, 0);
  c.press('none', true, 0.2); c.press('none', true, 0.3); c.press('none', true, 0.4);
  assert.equal(c.finished(1.3), COMBOS.none[1]);
  assert.equal(c.finished(2.5), null, 'rien de plus en attente');
});

test('appui peu après la fin (dans la fenêtre) : le combo continue', () => {
  const c = new Combo(0.9);
  c.press('none', false, 0);
  c.finished(1.0);
  assert.equal(c.press('none', false, 1.5), COMBOS.none[1]);
});

test('appui trop tard (hors fenêtre) : le combo repart du début', () => {
  const c = new Combo(0.9);
  c.press('none', false, 0);
  c.finished(1.0);
  assert.equal(c.press('none', false, 2.5), COMBOS.none[0]);
});

test('changer d\'arme remet le combo au début', () => {
  const c = new Combo();
  c.press('none', false, 0);
  c.finished(1.0);
  assert.equal(c.press('rifle', false, 1.2), COMBOS.rifle[0]);
});

test('à la fin de la liste, on recommence', () => {
  const c = new Combo();
  const seen = [];
  let t = 0;
  for (let i = 0; i < COMBOS.none.length + 2; i++) { seen.push(c.press('none', false, t)); c.finished(t + 1); t += 1.2; }
  assert.deepEqual(seen.slice(0, COMBOS.none.length), COMBOS.none);
  assert.equal(seen[COMBOS.none.length], COMBOS.none[0]);
  assert.equal(seen[COMBOS.none.length + 1], COMBOS.none[1]);
});

test('toutes les animations de combat sont exportées', () => {
  const exported = new Set(JSON.parse(readFileSync(new URL('../config/clips.json', import.meta.url), 'utf8')).export);
  for (const [weapon, list] of Object.entries(COMBOS)) for (const clip of list) assert.ok(exported.has(clip), `${weapon} : ${clip} n'est pas exportée`);
});

test('coups de pied : Kick puis Side Kick, puis on repart de Kick, quelle que soit l\'arme', () => {
  assert.deepEqual(COMBOS.kick, ['Kick', 'Side Kick']);
  const c = new Combo();
  assert.equal(c.press('kick', false, 0), 'Kick');
  assert.equal(c.press('kick', true, 0.3), null, 'appui pendant le coup : mis en attente');
  assert.equal(c.finished(1.0), 'Side Kick');
  assert.equal(c.finished(2.0), null);
  assert.equal(c.press('kick', false, 2.3), 'Kick', 'la liste boucle');
});

test('coups de pied : trop tard, ça repart du premier', () => {
  const c = new Combo();
  c.press('kick', false, 0);
  c.finished(1.0);
  assert.equal(c.press('kick', false, 3.0), 'Kick');
});
