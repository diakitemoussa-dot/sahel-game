import test from 'node:test';
import assert from 'node:assert/strict';
import { AwayGuard, MenuFlow, defaultOptions, sanitizeOptions, loadOptions, saveOptions, volumeOf, pixelRatioFor, QUALITES } from '../src/menustate.js';

test('parcours normal : accueil -> intro -> menu -> jeu -> pause -> reprise', () => {
  const f = new MenuFlow('splash');
  assert.equal(f.state, 'splash'); assert.equal(f.start(), false, 'le monde n est pas chargé : le clic ne fait rien');
  f.setLoaded();
  assert.equal(f.start(), true); assert.equal(f.state, 'intro');
  assert.equal(f.skipIntro(), 'main'); assert.equal(f.introSeen, true);
  assert.equal(f.play(), true); assert.equal(f.state, 'playing'); assert.equal(f.active, false);
  assert.equal(f.pause(), true); assert.equal(f.state, 'pause'); assert.equal(f.frozen, true); assert.equal(f.active, true);
  assert.equal(f.resume(), true); assert.equal(f.state, 'playing');
});

test('on ne peut pas jouer avant le chargement ni depuis un autre écran', () => {
  const f = new MenuFlow('main');
  assert.equal(f.play(), false, 'monde non chargé');
  f.setLoaded();
  f.go('options'); assert.equal(f.play(), false, 'depuis les options');
  f.back(); assert.equal(f.play(), true);
  assert.equal(new MenuFlow('splash').pause(), false, 'pas de pause hors du jeu');
});

test('les panneaux (options, crédits, tenues) reviennent d\'où l\'on vient : menu principal ou pause', () => {
  const f = new MenuFlow('main'); f.setLoaded();
  f.go('options'); assert.equal(f.back(), 'main');
  f.go('credits'); assert.equal(f.back(), 'main');
  f.go('tenues'); assert.equal(f.back(), 'main');
  f.play(); f.pause();
  f.go('options'); assert.equal(f.state, 'options'); assert.equal(f.back(), 'pause', 'les options ouvertes depuis la pause y reviennent');
  assert.equal(f.back(), 'playing', 'Échap dans la pause reprend');
});

test('Échap : l\'intro est passée, le menu principal ne bouge pas, la pause reprend', () => {
  const f = new MenuFlow('intro'); f.setLoaded();
  assert.equal(f.back(), 'main');
  assert.equal(f.back(), 'main', 'rien à quitter');
  f.play(); f.pause(); assert.equal(f.back(), 'playing');
});

test('quitter depuis la pause : retour au menu principal ; écran inconnu refusé', () => {
  const f = new MenuFlow('main'); f.setLoaded(); f.play(); f.pause();
  assert.equal(f.quitToMenu(), true); assert.equal(f.state, 'main'); assert.equal(f.frozen, false);
  assert.throws(() => f.go('plage'), /inconnu/);
  assert.equal(new MenuFlow('playing').quitToMenu(), false);
});

test('test automatique : le menu démarre « en jeu »', () => {
  const f = new MenuFlow('playing');
  assert.equal(f.active, false); assert.equal(f.showsMenu, false);
});

test('réglages : valeurs par défaut, bornes et types corrigés', () => {
  assert.deepEqual(defaultOptions(), { volume: 80, qualite: 'normale', perf: 'auto', radar: true, aide: true, sang: true });
  assert.deepEqual(sanitizeOptions(null), defaultOptions());
  assert.deepEqual(sanitizeOptions({ volume: 250, qualite: 'ultra', radar: 'oui', aide: false }), { ...defaultOptions(), volume: 100, aide: false });
  assert.equal(sanitizeOptions({ volume: -5 }).volume, 0);
  assert.equal(sanitizeOptions({ volume: '42.6' }).volume, 43);
  assert.equal(sanitizeOptions({ volume: 'x' }).volume, 80);
});

test('mémorisation des réglages, même avec un stockage abîmé ou absent', () => {
  const mem = new Map(); const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(loadOptions(st), defaultOptions());
  saveOptions(st, { volume: 30, qualite: 'haute', perf: 'eco', radar: false, aide: true, sang: false });
  assert.deepEqual(loadOptions(st), { volume: 30, qualite: 'haute', perf: 'eco', radar: false, aide: true, sang: false });
  mem.set('sahel.options', '{pas du json');
  assert.deepEqual(loadOptions(st), defaultOptions());
  assert.doesNotThrow(() => saveOptions({ setItem() { throw new Error('plein'); } }, defaultOptions()));
  assert.deepEqual(loadOptions(null), defaultOptions());
});

test('volume de la vidéo et résolution de l\'image', () => {
  assert.equal(volumeOf({ volume: 50 }), 0.5); assert.equal(volumeOf({ volume: 0 }), 0); assert.equal(volumeOf(null), 0.8);
  assert.equal(pixelRatioFor({ qualite: 'normale' }, 1.5), 1.5);
  assert.equal(pixelRatioFor({ qualite: 'basse' }, 2), 2 * QUALITES.basse);
  assert.equal(pixelRatioFor({ qualite: 'haute' }, 2), 2, 'plafonné à 2');
  assert.ok(pixelRatioFor({ qualite: 'basse' }, 0.5) >= 0.5, 'jamais sous 0,5');
});

test('fenêtre quittée : le jeu se met en pause et repart au retour, une pause du joueur reste en pause', () => {
  const g = new AwayGuard();
  assert.equal(g.leave('playing'), 'pause');
  assert.equal(g.returned('pause'), 'resume');
  assert.equal(g.returned('pause'), null, 'une seule reprise');
  assert.equal(g.leave('pause'), null, 'déjà en pause (choix du joueur) : rien à faire');
  assert.equal(g.returned('pause'), null, 'et on ne reprend pas à sa place');
  assert.equal(g.leave('main'), null); assert.equal(g.returned('main'), null);
  g.lockLostWhileAway(); assert.equal(g.returned('pause'), 'resume', 'souris libérée par le navigateur en quittant : pause automatique');
  g.leave('playing'); assert.equal(g.returned('playing'), null, 'déjà revenu en jeu : rien');
});

test('performances : valeurs permises seulement, plafond de résolution du profil', () => {
  assert.equal(sanitizeOptions({ perf: 'eco' }).perf, 'eco'); assert.equal(sanitizeOptions({ perf: 'max' }).perf, 'max');
  assert.equal(sanitizeOptions({ perf: 'turbo' }).perf, 'auto'); assert.equal(sanitizeOptions({}).perf, 'auto');
  assert.equal(pixelRatioFor({ qualite: 'normale' }, 3, 1.5), 1.5, 'un écran 3x est plafonné');
  assert.equal(pixelRatioFor({ qualite: 'haute' }, 3, 1.25), 1.25);
  assert.equal(pixelRatioFor({ qualite: 'basse' }, 2, 1.5), 1.2, 'qualité basse : sous le plafond');
  assert.equal(pixelRatioFor({ qualite: 'normale' }, 2), 2, 'sans plafond : comme avant');
});
