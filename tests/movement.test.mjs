import test from 'node:test';
import assert from 'node:assert/strict';
import { canMove } from '../src/movement.js';

const base = { dead: false, downed: false, overlay: null, shooting: false, crouch: false, onGround: true };
const can = (o) => canMove({ ...base, ...o });

test('déplacement libre en temps normal', () => {
  assert.equal(can({}), true);
});

test('il ne bouge pas quand il tire debout', () => {
  assert.equal(can({ shooting: true }), false);
});

test('accroupi, il peut se déplacer en marchant, même en tirant', () => {
  assert.equal(can({ crouch: true }), true);
  assert.equal(can({ crouch: true, shooting: true }), true);
});

test('il ne bouge pas pendant une action (recharge, mêlée, geste, coup reçu), même accroupi', () => {
  assert.equal(can({ overlay: 'Rifle Reload' }), false);
  assert.equal(can({ overlay: 'Melee Punch', crouch: true }), false);
  assert.equal(can({ overlay: 'Wave' }), false);
});

test('il ne bouge pas à terre ni mort', () => {
  assert.equal(can({ dead: true }), false);
  assert.equal(can({ downed: true }), false);
  assert.equal(can({ dead: true, crouch: true }), false);
});

test('en l\'air, le tir ne le fige pas', () => {
  assert.equal(can({ shooting: true, onGround: false }), true);
});
