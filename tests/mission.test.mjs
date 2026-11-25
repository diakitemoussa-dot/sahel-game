import test from 'node:test';
import assert from 'node:assert/strict';
import { Mission } from '../src/mission.js';

test('la mission est en cours tant qu\'il reste un milicien debout', () => {
  const m = new Mission();
  const s = m.update({ enemies: { total: 18, dead: 17 }, squad: { total: 3, alive: 3 } });
  assert.equal(s.won, false); assert.equal(s.left, 1); assert.equal(s.banner, null);
  assert.match(s.text, /17 \/ 18/); assert.match(s.text, /3 \/ 3/);
});

test('victoire quand le dernier milicien tombe, escouade au complet', () => {
  const m = new Mission();
  m.update({ enemies: { total: 18, dead: 17 }, squad: { total: 3, alive: 3 } });
  const s = m.update({ enemies: { total: 18, dead: 18 }, squad: { total: 3, alive: 3 } });
  assert.equal(s.won, true); assert.equal(s.justWon, true); assert.equal(s.squadComplete, true);
  assert.match(s.banner.title, /ACCOMPLIE/); assert.match(s.banner.sub, /au complet/);
});

test('victoire avec des hommes perdus : le bilan le dit', () => {
  const m = new Mission();
  const s = m.update({ enemies: { total: 18, dead: 18 }, squad: { total: 3, alive: 1 } });
  assert.equal(s.squadComplete, false); assert.match(s.banner.sub, /1 homme sur 3/);
});

test('la victoire n\'est annoncée qu\'une fois, et sans milicien au départ il n\'y a pas de victoire', () => {
  const m = new Mission();
  assert.equal(m.update({ enemies: { total: 0, dead: 0 }, squad: { total: 3, alive: 3 } }).won, false);
  const a = m.update({ enemies: { total: 5, dead: 5 }, squad: { total: 3, alive: 3 } });
  const b = m.update({ enemies: { total: 5, dead: 5 }, squad: { total: 3, alive: 2 } });
  assert.equal(a.justWon, true); assert.equal(b.justWon, false); assert.equal(b.won, true); assert.equal(b.banner, null);
});
