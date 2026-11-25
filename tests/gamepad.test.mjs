import test from 'node:test';
import assert from 'node:assert/strict';
import { PadFilter, PadHub, padCommands } from '../src/gamepad.js';

const pad = (axes, pressed = []) => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
});

test('manette inutilisée : rien n\'est transmis', () => {
  const f = new PadFilter();
  assert.equal(f.read(pad([0, 0, 0, 0])), null);
  assert.equal(f.read(pad([0.1, 0.05, 0, 0])), null);
});

test('manette avec un axe bloqué à -1 au repos : ignorée tant qu\'on ne s\'en sert pas, axe bloqué jamais utilisé', () => {
  const f = new PadFilter();
  assert.equal(f.read(pad([0, -1, 0, 0])), null);               // le défaut observé : le joueur courait tout seul
  assert.equal(f.read(pad([0, -1, 0, 0])), null);
  const r = f.read(pad([0.8, -1, 0, 0]));                        // le joueur pousse vraiment le stick à droite
  assert.ok(r, 'la manette devient active');
  assert.equal(r.axes[1], 0, "l'axe bloqué reste ignoré");
  assert.equal(r.axes[0], 0.8);
});

test('manette normale : active dès le premier mouvement ou bouton', () => {
  const f = new PadFilter();
  assert.equal(f.read(pad([0, 0, 0, 0])), null);
  const r = f.read(pad([0, -0.9, 0, 0]));
  assert.ok(r);
  assert.equal(r.axes[1], -0.9);
  const g = new PadFilter();
  g.read(pad([0, 0, 0, 0]));
  assert.ok(g.read(pad([0, 0, 0, 0], [0])), 'un bouton active aussi la manette');
});

test('zone morte : petits mouvements ignorés une fois active', () => {
  const f = new PadFilter();
  f.read(pad([0, 0, 0, 0]));
  f.read(pad([0.9, 0, 0, 0]));
  assert.equal(f.read(pad([0.1, 0.05, 0, 0])).axes[0], 0);
});

test('bouton déjà enfoncé à la connexion : ignoré jusqu\'à ce qu\'il soit relâché', () => {
  const f = new PadFilter();
  f.read(pad([0, 0, 0, 0], [7]));                                // gâchette droite coincée
  const a = f.read(pad([0.9, 0, 0, 0], [7]));
  assert.equal(a.buttons[7].pressed, false);
  f.read(pad([0.9, 0, 0, 0], []));                               // relâchée
  const b = f.read(pad([0.9, 0, 0, 0], [7]));
  assert.equal(b.buttons[7].pressed, true);
});

test('gâchette qui lit une valeur parasite (0,35) à la connexion : ignorée, puis utilisable une fois relâchée', () => {
  const noisy = (v7) => {
    const p = pad([0, 0, 0, 0]);
    p.buttons[7] = { pressed: false, value: v7 };
    return p;
  };
  const f = new PadFilter();
  f.read(noisy(0.35));
  const a = f.read(noisy(0.35));
  assert.equal(a, null, 'une valeur parasite seule n\'active pas la manette');
  f.read(noisy(0));                                              // relâchée : le parasite disparaît
  f.read(pad([0.9, 0, 0, 0]));                                    // vrai geste : la manette devient active
  const b = f.read(noisy(0.9));
  assert.ok(b.buttons[7].value > 0.5, 'la gâchette fonctionne ensuite');
});

test('stick tenu à fond au moment où la manette est détectée : utilisable dès qu\'on le relâche', () => {
  const f = new PadFilter();
  f.read(pad([0, -1, 0, 0]));                                   // le joueur pousse vers l'avant pendant que la page détecte la manette
  assert.equal(f.read(pad([0, -1, 0, 0])), null);
  f.read(pad([0, 0, 0, 0], [0]));                               // il relâche et appuie sur A : la manette devient active
  const r = f.read(pad([0, -0.9, 0, 0]));                       // puis il pousse à nouveau vers l'avant
  assert.equal(r.axes[1], -0.9, "l'axe n'est plus considéré comme bloqué");
});

const info = (index, id, axes, pressed = []) => ({ index, id, ...pad(axes, pressed) });

test('deux manettes : on utilise celle qui sert, même si la première est inerte', () => {
  const hub = new PadHub();
  hub.read([info(0, 'Virtuelle A', [0, 0, 0, 0]), info(1, 'Reelle B', [0, 0, 0, 0])]);
  const r = hub.read([info(0, 'Virtuelle A', [0, 0, 0, 0]), info(1, 'Reelle B', [0.8, 0, 0, 0])]);
  assert.ok(r.pad);
  assert.equal(r.pad.axes[0], 0.8);
  assert.equal(r.status.length, 2);
  assert.ok(r.status[0].includes('Virtuelle A') && r.status[1].includes('Reelle B'));
});

test('aucune manette utilisée : pas de commande, mais un état lisible', () => {
  const hub = new PadHub();
  const r = hub.read([info(0, 'Wireless Controller', [0, -1, 0, 0])]);
  assert.equal(r.pad, null);
  assert.ok(r.status[0].includes('Wireless Controller') && r.status[0].includes('attente'));
});

test('liste vide : rien', () => {
  const r = new PadHub().read([]);
  assert.equal(r.pad, null);
  assert.deepEqual(r.status, []);
});

test('L1 (bouton 4) change d\'arme, une seule fois par appui', () => {
  const none = padCommands(pad([0, 0, 0, 0]), []);
  assert.equal(none.toggleWeapon, false);
  const press = padCommands(pad([0, 0, 0, 0], [4]), none.pressedNow);
  assert.equal(press.toggleWeapon, true);
  const held = padCommands(pad([0, 0, 0, 0], [4]), press.pressedNow);
  assert.equal(held.toggleWeapon, false, 'maintenir L1 ne change pas d\'arme en boucle');
  const again = padCommands(pad([0, 0, 0, 0], [4]), padCommands(pad([0, 0, 0, 0]), held.pressedNow).pressedNow);
  assert.equal(again.toggleWeapon, true, 'un nouvel appui change à nouveau');
});

test('Triangle (bouton 3) enchaîne toutes les animations de combat, une fois par appui', () => {
  const none = padCommands(pad([0, 0, 0, 0]), []);
  assert.equal(none.combo, false);
  const press = padCommands(pad([0, 0, 0, 0], [3]), none.pressedNow);
  assert.equal(press.combo, true);
  assert.equal(padCommands(pad([0, 0, 0, 0], [3]), press.pressedNow).combo, false, 'maintenu : pas de rafale');
  assert.equal(press.reload, false, 'Triangle ne recharge pas');
  assert.equal(press.kick, false, 'plus de bouton coup de pied séparé');
});

test('Carré (bouton 2) recharge l\'arme, une fois par appui', () => {
  const none = padCommands(pad([0, 0, 0, 0]), []);
  assert.equal(none.reload, false);
  const press = padCommands(pad([0, 0, 0, 0], [2]), none.pressedNow);
  assert.equal(press.reload, true);
  assert.equal(padCommands(pad([0, 0, 0, 0], [2]), press.pressedNow).reload, false, 'maintenu : pas de rafale');
  assert.equal(press.combo, false, 'Carré ne lance pas le combo');
});

test('Y ne change plus d\'arme', () => {
  assert.equal(padCommands(pad([0, 0, 0, 0], [3]), []).toggleWeapon, false);
});

test('stick gauche enfoncé (L3, bouton 10) : sprint', () => {
  assert.equal(padCommands(pad([0, -1, 0, 0], [10]), []).sprint, true);
  assert.equal(padCommands(pad([0, -1, 0, 0]), []).sprint, false);
});

test('L2 (gâchette gauche) active le tireur d\'élite tant qu\'elle est enfoncée, et ne sert plus à viser', () => {
  const t = pad([0, 0, 0, 0]);
  t.buttons[6] = { pressed: true, value: 0.9 };
  const c = padCommands(t, []);
  assert.equal(c.sniper, true);
  assert.equal(c.aim, false);
  const l = pad([0, 0, 0, 0]);
  l.buttons[6] = { pressed: false, value: 0.2 };
  assert.equal(padCommands(l, []).sniper, false, 'une pression légère ne compte pas');
  assert.equal(padCommands(pad([0, 0, 0, 0]), []).sniper, false);
});

test('autres commandes de la manette', () => {
  const c = padCommands(pad([0.5, -0.8, 0.2, -0.3], [0, 1]), []);
  assert.equal(c.moveX, 0.5);
  assert.equal(c.moveY, 0.8, 'stick vers le haut = avancer');
  assert.equal(c.lookX, 0.2);
  assert.equal(c.jump, true);
  assert.equal(c.crouchToggle, true);
  const t = pad([0, 0, 0, 0]);
  t.buttons[7] = { pressed: true, value: 0.9 };
  t.buttons[6] = { pressed: false, value: 0.2 };
  const d = padCommands(t, []);
  assert.equal(d.fire, true);
  assert.equal(d.aim, false);
});

test('manette débranchée puis rebranchée : on repart de zéro', () => {
  const f = new PadFilter();
  f.read(pad([0, 0, 0, 0]));
  f.read(pad([0.9, 0, 0, 0]));
  assert.equal(f.read(null), null);
  assert.equal(f.read(pad([0, 0, 0, 0])), null);
});

// ---- navigation des menus à la manette
import { PadNav } from '../src/gamepad.js';
const padState = (pressed = [], axes = [0, 0, 0, 0]) => ({ axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) });

test('PadNav : un appui = une seule commande ; A valide, B revient, Start et Carré', () => {
  const n = new PadNav();
  assert.equal(n.update(padState([0]), 0).ok, true);
  assert.equal(n.update(padState([0]), 16).ok, false, 'bouton tenu : pas de répétition');
  assert.equal(n.update(padState([]), 32).ok, false);
  assert.equal(n.update(padState([1]), 48).back, true);
  assert.equal(n.update(padState([9]), 64).start, true);
  assert.equal(n.update(padState([2]), 80).square, true);
});

test('PadNav : croix et stick gauche, répétition quand on tient la direction', () => {
  const n = new PadNav({ delay: 400, every: 100 });
  assert.equal(n.update(padState([13]), 0).down, true);
  assert.equal(n.update(padState([13]), 200).down, false, 'avant le délai');
  assert.equal(n.update(padState([13]), 450).down, true, 'après le délai');
  assert.equal(n.update(padState([13]), 500).down, false);
  assert.equal(n.update(padState([13]), 560).down, true, 'répétition rapide');
  assert.equal(n.update(padState([], [0, -0.9, 0, 0]), 1000).up, true, 'stick vers le haut');
  assert.equal(n.update(padState([], [0.9, 0, 0, 0]), 1020).right, true, 'stick vers la droite');
  assert.equal(n.update(padState([], [0.3, 0.3, 0, 0]), 1040).right, false, 'petit mouvement ignoré');
});

test('PadNav : sans manette, rien ne bouge', () => {
  const n = new PadNav();
  assert.deepEqual(Object.values(n.update(null, 0)).filter(Boolean), []);
});

test('menu des tenues : Select (8), R3 (11) ou pavé tactile (17), une fois par appui', () => {
  for (const b of [8, 11, 17]) {
    const buttons = Array.from({ length: 18 }, (_, i) => ({ pressed: i === b, value: i === b ? 1 : 0 }));
    const press = padCommands({ axes: [0, 0, 0, 0], buttons }, []);
    assert.equal(press.wardrobe, true, `bouton ${b}`);
    assert.equal(padCommands({ axes: [0, 0, 0, 0], buttons }, press.pressedNow).wardrobe, false, 'maintenu : une seule fois');
  }
  assert.equal(padCommands({ axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })) }, []).wardrobe, false);
});
