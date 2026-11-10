import test from 'node:test';
import assert from 'node:assert/strict';
import { Ammo, MAG_SIZE, RELOAD_CLIP } from '../src/ammo.js';

test('chargeurs pleins au départ, mains nues sans munitions', () => {
  const a = new Ammo();
  assert.equal(a.left('rifle'), MAG_SIZE.rifle); assert.equal(a.left('pistol'), MAG_SIZE.pistol);
  assert.equal(a.canFire('none'), false); assert.equal(a.left('none'), 0);
  assert.equal(a.needsReload('rifle'), false, 'chargeur plein : rien à recharger');
});

test('le chargeur se vide à chaque tir puis le tir est refusé', () => {
  const a = new Ammo({ rifle: 3, pistol: 2 });
  assert.ok(a.fire('rifle') && a.fire('rifle') && a.fire('rifle'));
  assert.equal(a.left('rifle'), 0);
  assert.equal(a.fire('rifle'), false); assert.equal(a.canFire('rifle'), false);
  assert.equal(a.left('pistol'), 2, 'l\'autre arme n\'est pas touchée');
});

test('recharge : pas de tir pendant, chargeur plein à la fin (deux armes)', () => {
  const a = new Ammo({ rifle: 3, pistol: 2 });
  for (const w of ['rifle', 'pistol']) {
    while (a.fire(w)) { /* on vide */ }
    assert.equal(a.needsReload(w), true);
    assert.equal(a.startReload(w, 2), true);
    assert.equal(a.canFire(w), false, 'en recharge');
    assert.equal(a.startReload(w, 2), false, 'pas deux recharges à la fois');
    assert.equal(a.finishReload(), w);
    assert.equal(a.left(w), a.size[w]); assert.equal(a.canFire(w), true);
  }
});

test('recharge manuelle : possible chargeur entamé, refusée chargeur plein', () => {
  const a = new Ammo({ rifle: 30, pistol: 12 });
  assert.equal(a.startReload('rifle', 2), false);
  a.fire('rifle'); assert.equal(a.startReload('rifle', 2), true);
});

test('annulation (changement d\'arme) et sécurité si l\'animation est coupée', () => {
  const a = new Ammo({ rifle: 3, pistol: 2 });
  while (a.fire('rifle')) { /* vide */ }
  a.startReload('rifle', 2); a.cancel();
  assert.equal(a.left('rifle'), 0, 'annulée : toujours vide'); assert.equal(a.reloading, null);
  a.startReload('rifle', 2);
  assert.equal(a.update(2.2), null, 'avant la fin de la durée + marge');
  assert.equal(a.update(0.5), 'rifle'); assert.equal(a.left('rifle'), 3);
  a.fire('pistol'); a.refillAll(); assert.equal(a.left('pistol'), 2);
});

test('animations de recharge des deux armes', () => {
  assert.equal(RELOAD_CLIP.rifle, 'Rifle Reload'); assert.equal(RELOAD_CLIP.pistol, 'Pistol Reload');
});
