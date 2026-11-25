import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE, lookScale, stepUser, loadUser, saveUser, MIN, MAX } from '../src/sensitivity.js';

test('par défaut le viseur est plus sensible qu avant (0,55)', () => {
  assert.equal(lookScale(), BASE);
  assert.ok(BASE > 0.55 && BASE < 1.2);
});

test('quand il vise le viseur ralentit encore, davantage en tireur d élite', () => {
  const libre = lookScale(), vise = lookScale({ aiming: true }), snipe = lookScale({ sniper: true });
  assert.ok(vise < libre && snipe < vise);
  assert.ok(Math.abs(lookScale({ aiming: true, sniper: true }) - snipe) < 1e-12, 'le tireur d élite prime sur viser');
});

test('le réglage du joueur multiplie la vitesse, par pas de 10 %, borné', () => {
  assert.ok(Math.abs(lookScale({ user: 2 }) - 2 * BASE) < 1e-12);
  assert.equal(stepUser(1, -1), 0.9); assert.equal(stepUser(1, 1), 1.1);
  assert.equal(stepUser(0.3, -1), MIN); assert.equal(stepUser(2.5, 1), MAX);
  let v = 1; for (let i = 0; i < 30; i++) v = stepUser(v, -1);
  assert.equal(v, MIN, 'on ne peut pas descendre sous le minimum (le viseur ne se bloque jamais)');
  assert.equal(stepUser(0.7, 1), 0.8, 'pas d erreur d arrondi (0,7 + 0,1)');
});

test('le réglage est mémorisé ; une valeur absente, absurde ou un stockage cassé donne 100 %', () => {
  const mem = new Map(); const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(loadUser(st), 1);
  saveUser(st, 0.6); assert.equal(loadUser(st), 0.6);
  mem.set('sahel.sensitivity', 'abc'); assert.equal(loadUser(st), 1);
  mem.set('sahel.sensitivity', '99'); assert.equal(loadUser(st), MAX);
  assert.equal(loadUser({ getItem() { throw new Error('x'); } }), 1);
  assert.doesNotThrow(() => saveUser({ setItem() { throw new Error('x'); } }, 1));
});
