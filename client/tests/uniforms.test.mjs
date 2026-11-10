import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseLibrary, pickUniform, hideableNames } from '../src/uniforms.js';
import { WardrobeMenu, Wardrobe, loadSavedId, saveId } from '../src/wardrobe.js';
import { padCommands, PAD } from '../src/gamepad.js';

const real = JSON.parse(readFileSync(new URL('../config/uniforms.json', import.meta.url), 'utf8'));
const lib = parseLibrary(real);

test('la vraie bibliothèque est valide, avec la tenue wax par défaut et la tenue militaire', () => {
  assert.equal(lib.default, 'wax');
  assert.deepEqual(lib.uniforms.map((u) => u.id), ['wax', 'militaire', 'militaire_camo', 'militaire_sable', 'militaire_roux', 'militaire_gris', 'pnj_milicien']);
});

test('chaque fichier de tenue annoncé existe', () => {
  for (const u of lib.uniforms.filter((x) => x.file)) assert.ok(existsSync(new URL('../' + u.file, import.meta.url)), u.file);
});

test('la tenue militaire cache les vêtements de base mais pas la peau', () => {
  const mil = pickUniform(lib, 'militaire');
  assert.deepEqual(mil.hide.sort(), ['Hair_Twists', 'Hoodie', 'Pants', 'Shoes']);
  assert.ok(!hideableNames(lib).includes('Body'));
  assert.deepEqual(pickUniform(lib, 'wax').hide, []);
});

test('identifiant inconnu : on retombe sur la tenue par défaut', () => {
  assert.equal(pickUniform(lib, 'nimporte-quoi').id, 'wax');
  assert.equal(pickUniform(lib, null).id, 'wax');
});

test('configuration incohérente : erreurs claires', () => {
  assert.throws(() => parseLibrary({ uniforms: [] }), /aucune tenue/);
  assert.throws(() => parseLibrary({ uniforms: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }] }), /double/);
  assert.throws(() => parseLibrary({ default: 'z', uniforms: [{ id: 'a', name: 'A' }] }), /par défaut inconnue/);
  assert.throws(() => parseLibrary({ uniforms: [{ id: 'a', name: 'A', file: 'x.obj' }] }), /\.glb/);
});

test('menu : aperçu au déplacement, validation, annulation', () => {
  const m = new WardrobeMenu(lib.uniforms.filter((u) => u.menu), 'wax');
  assert.equal(m.move(1), null, 'fermé : rien ne se passe');
  m.show();
  assert.equal(m.move(1), 'militaire');
  assert.equal(m.move(1), 'militaire_camo');
  for (const id of ['militaire_sable', 'militaire_roux', 'militaire_gris', 'wax']) assert.equal(m.move(1), id, id === 'wax' ? 'la sélection boucle' : undefined);
  assert.equal(m.move(-1), 'militaire_gris');
  assert.equal(m.cancel(), 'wax', 'annuler remet la tenue validée');
  assert.equal(m.open, false);
  m.show(); m.move(1);
  assert.equal(m.confirm(), 'militaire');
  assert.equal(m.saved, 'militaire');
  m.show();
  assert.equal(m.hovered.id, 'militaire', 'rouvert sur la tenue validée');
});

function fake() {
  const applied = [];
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const outfit = { apply: async (id) => { applied.push(id); } };
  return { applied, storage, outfit };
}

test('wardrobe : les commandes pilotent le menu, le choix est mémorisé', async () => {
  const f = fake();
  const w = new Wardrobe({ outfit: f.outfit, lib, storage: f.storage });
  await w.start();
  assert.deepEqual(f.applied, ['wax']);
  assert.equal(w.update({ wardrobeToggle: true }), true, 'ouvert : le jeu doit ignorer les commandes');
  assert.equal(w.update({ menuRight: true }), true);
  assert.equal(w.update({ menuOk: true }), false, 'validé : menu fermé');
  assert.equal(loadSavedId(f.storage), 'militaire');
  assert.equal(f.applied.at(-1), 'militaire');
  const w2 = new Wardrobe({ outfit: fake().outfit, lib, storage: f.storage });   // nouvelle partie : même choix
  assert.equal(w2.menu.saved, 'militaire');
});

test('wardrobe : Échap (ou B) annule et remet la tenue précédente', async () => {
  const f = fake();
  const w = new Wardrobe({ outfit: f.outfit, lib, storage: f.storage, savedId: 'wax' });
  w.update({ wardrobeToggle: true }); w.update({ menuRight: true });
  assert.equal(w.update({ menuBack: true }), false);
  assert.equal(f.applied.at(-1), 'wax');
  assert.equal(loadSavedId(f.storage), null, 'rien de mémorisé');
  w.update({ wardrobeToggle: true }); w.update({ menuLeft: true });
  assert.equal(w.update({ crouchToggle: true }), false, 'B de la manette annule aussi');
});

test('wardrobe : une tenue qui ne charge pas donne un message, pas un plantage', async () => {
  const outfit = { apply: async () => { throw new Error('fichier absent'); } };
  const w = new Wardrobe({ outfit, lib, storage: null });
  const log = console.error; console.error = () => {};
  await w.start();
  console.error = log;
  assert.match(w.error, /fichier absent/);
});

test('sauvegarde : un stockage qui plante est ignoré', () => {
  const bad = { getItem() { throw new Error('refusé'); }, setItem() { throw new Error('refusé'); } };
  assert.equal(loadSavedId(bad), null);
  assert.doesNotThrow(() => saveId(bad, 'militaire'));
});

test('manette : Select ouvre le menu, la croix choisit', () => {
  const pad = (down) => ({ axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })) });
  const c = padCommands(pad([PAD.SELECT, PAD.DPAD_LEFT]), []);
  assert.equal(c.wardrobe, true); assert.equal(c.menuLeft, true); assert.equal(c.menuRight, false);
  const again = padCommands(pad([PAD.SELECT]), c.pressedNow);
  assert.equal(again.wardrobe, false, 'un seul déclenchement par appui');
});

test('la tenue des PNJ est à part : absente du menu du joueur, et un joueur ne peut pas la porter', async () => {
  assert.equal(pickUniform(lib, 'pnj_milicien').menu, false);
  const f = fake();
  const w = new Wardrobe({ outfit: f.outfit, lib, storage: f.storage });
  assert.deepEqual(w.menu.entries.map((e) => e.id), ['wax', 'militaire', 'militaire_camo', 'militaire_sable', 'militaire_roux', 'militaire_gris']);
  await w.select('pnj_milicien');                                 // identifiant de PNJ : le joueur garde la tenue par défaut
  assert.equal(w.menu.saved, 'wax');
  const w2 = new Wardrobe({ outfit: f.outfit, lib, storage: null, savedId: 'pnj_milicien' });
  assert.equal(w2.menu.saved, 'wax', 'une ancienne sauvegarde ne peut pas imposer une tenue de PNJ');
});
