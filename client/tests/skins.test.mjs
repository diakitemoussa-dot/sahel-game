import test from 'node:test';
import assert from 'node:assert/strict';
import { SKINS, skinUrl, loadSkin, applySkin } from '../src/skins.js';

const mat = (name) => ({ name, map: 'origine', clone() { return { ...this, clone: this.clone }; } });
const mesh = (material) => ({ isMesh: true, material });
const root = (...meshes) => ({ traverse(f) { meshes.forEach(f); } });

test('trois teintes : noire, métisse, blanche, avec un fichier chacune', () => {
  assert.deepEqual(SKINS, ['noire', 'metisse', 'blanche']);
  assert.match(skinUrl('blanche'), /^assets\/skins\/peau_blanche\.webp\?v=/);
});

test('une teinte inconnue est refusée', async () => {
  await assert.rejects(loadSkin('verte'), /inconnue/);
});

test('seul le matériau de peau est remplacé, par une copie (le matériau partagé reste intact)', () => {
  const body = mat('Ch12_body'), hair = mat('Ch12_hair');
  const a = mesh(body), b = mesh(hair);
  assert.equal(applySkin(root(a, b, { isMesh: false }), 'texture_claire'), 1);
  assert.notEqual(a.material, body, 'copie propre au personnage');
  assert.equal(a.material.map, 'texture_claire');
  assert.equal(body.map, 'origine', 'le matériau d origine, partagé par les autres personnages, n est pas touché');
  assert.equal(b.material, hair, 'cheveux inchangés');
});

test('matériaux en liste : seul celui de la peau change', () => {
  const body = mat('Ch12_body'), other = mat('CreamFab');
  const m = mesh([other, body]);
  assert.equal(applySkin(root(m), 'x'), 1);
  assert.equal(m.material[0], other); assert.equal(m.material[1].map, 'x');
});
