import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boostFor, pickClip, nextWeapon, fadeTime, clipSpeed, ANIM_SPEED, FADE_SOFT, FADE_FAST } from '../src/animstate.js';
import { COMBOS } from '../src/combo.js';

const exported = new Set(JSON.parse(readFileSync(new URL('../config/clips.json', import.meta.url), 'utf8')).export);
const base = { weapon: 'rifle', crouch: false, move: 'idle', raised: true, sniper: false, airborne: false, downed: false, dead: false };
const pick = (o) => pickClip({ ...base, ...o });

test('fusil prêt : immobile, course, recul', () => {
  assert.equal(pick({}).clip, 'Rifle Aim');
  assert.equal(pick({ move: 'run' }).clip, 'Rifle Run Tir');
  assert.equal(pick({ move: 'back' }).clip, 'Rifle Walk Backward Tir');
});

test("fusil baissé : animations d'origine", () => {
  assert.equal(pick({ raised: false, move: 'walk' }).clip, 'Rifle Walk');
  assert.equal(pick({ raised: false }).clip, 'Rifle Idle');
});

test('accroupi', () => {
  assert.equal(pick({ crouch: true }).clip, 'Rifle Kneel Tir');
  assert.equal(pick({ crouch: true, move: 'walk' }).clip, 'Rifle Crouch Walk Tir');
});

test('pistolet prêt', () => {
  assert.equal(pick({ weapon: 'pistol' }).clip, 'Pistol Idle Tir');
  assert.equal(pick({ weapon: 'pistol', move: 'side', side: 'left' }).clip, 'Pistol Strafe Tir');
  assert.equal(pick({ weapon: 'pistol', crouch: true }).clip, 'Pistol Kneel Tir');
});

test('pistolet : pas de côté, une animation pour chaque sens', () => {
  const p = { weapon: 'pistol', move: 'side' };
  assert.equal(pick({ ...p, side: 'left' }).clip, 'Pistol Strafe Tir');
  assert.equal(pick({ ...p, side: 'right' }).clip, 'Pistol Strafe Right Tir');
  assert.equal(pick({ ...p, side: 'left', raised: false }).clip, 'Pistol Strafe');
  assert.equal(pick({ ...p, side: 'right', raised: false }).clip, 'Pistol Strafe Right');
});

test("tireur d'élite immobile", () => {
  assert.equal(pick({ sniper: true }).clip, 'Rifle Aim Sniper');
});

test("tireur d'élite au pistolet : même principe que le fusil, seulement à l'arrêt et debout", () => {
  const p = { weapon: 'pistol', sniper: true };
  assert.equal(pick(p).clip, 'Pistol Aim Sniper');
  assert.equal(pick({ ...p, firing: true }).clip, 'Pistol Aim Sniper');          // le recul est fait par le jeu
  assert.equal(pick({ ...p, move: 'walk' }).clip, 'Pistol Walk Tir');            // en marche : visée normale
  assert.equal(pick({ ...p, crouch: true }).clip, 'Pistol Kneel Tir');           // accroupi : visée normale
  assert.equal(pick({ ...p, airborne: true }).clip, 'Pistol Jump Tir');
  assert.equal(pick({ ...p, overlay: 'Pistol Whip' }).clip, 'Pistol Whip');      // une action passe avant
  assert.equal(pick({ weapon: 'none', sniper: true }).clip, 'Idle');             // mains nues : pas de lunette
});

test('saut, mort, à terre : une seule fois, jamais en boucle', () => {
  assert.equal(pick({ airborne: true }).clip, 'Rifle Jump Tir');
  assert.equal(pick({ airborne: true }).once, true);
  assert.equal(pick({ dead: true }).clip, 'Rifle Death');
  assert.equal(pick({ downed: true }).clip, 'Rifle Death');
  assert.equal(pick({ downed: true }).clamp, true);
});

test('mains nues : tout le groupe Idle, Walk, Run, Walk Backward, Run Backward, côtés', () => {
  const n = { weapon: 'none' };
  assert.equal(pick({ ...n }).clip, 'Idle');
  assert.equal(pick({ ...n, move: 'walk' }).clip, 'Walk');
  assert.equal(pick({ ...n, move: 'run' }).clip, 'Run');
  assert.equal(pick({ ...n, move: 'back', running: false }).clip, 'Walk Backward');
  assert.equal(pick({ ...n, move: 'back', running: true }).clip, 'Run Backward');
  assert.equal(pick({ ...n, move: 'side', side: 'left' }).clip, 'Strafe Left');
  assert.equal(pick({ ...n, move: 'side', side: 'right' }).clip, 'Strafe Right');
  assert.equal(pick({ ...n, airborne: true }).clip, 'Jump');
  assert.equal(pick({ ...n, crouch: true }).clip, 'Crouch Idle');
});

test('sprint (stick gauche enfoncé + avant) : Rifle Run avec le fusil, Pistol Run avec le pistolet', () => {
  assert.equal(pick({ sprint: true, move: 'run' }).clip, 'Rifle Run');
  assert.equal(pick({ weapon: 'pistol', sprint: true, move: 'run' }).clip, 'Pistol Run');
  assert.equal(pick({ weapon: 'none', sprint: true, move: 'run' }).clip, 'Run');
});

test('sprint : le saut et l\'accroupi passent avant', () => {
  assert.equal(pick({ sprint: true, move: 'run', airborne: true }).clip, 'Rifle Jump Tir');
  assert.equal(pick({ sprint: true, move: 'run', crouch: true }).clip, 'Rifle Crouch Walk Tir');
});

test('sans sprint : la course garde la version de tir', () => {
  assert.equal(pick({ move: 'run' }).clip, 'Rifle Run Tir');
  assert.equal(pick({ weapon: 'pistol', move: 'run' }).clip, 'Pistol Run Tir');
});

test('fondu : long entre l\'arrêt et la visée, court entre deux déplacements', () => {
  assert.ok(fadeTime('Idle', 'Rifle Aim') >= 0.3, 'Idle -> Rifle Aim doit être progressif');
  assert.ok(fadeTime('Rifle Aim', 'Idle') >= 0.3);
  assert.ok(fadeTime('Rifle Idle', 'Rifle Aim') >= 0.3);
  assert.ok(fadeTime('Rifle Run Tir', 'Rifle Aim') >= 0.3, 'on s\'arrête en douceur');
  assert.equal(fadeTime('Rifle Run Tir', 'Rifle Walk Tir'), FADE_FAST);
  assert.equal(fadeTime(null, 'Rifle Run Tir'), FADE_FAST);
  assert.ok(FADE_SOFT >= 0.3 && FADE_FAST <= 0.12, 'transitions vives');
});

test('les animations de combat ont leur vitesse propre, les autres sont jouées plus vite (ANIM_SPEED)', () => {
  for (const list of Object.values(COMBOS)) for (const clip of list) assert.ok(clipSpeed(clip) > 1.2, `${clip} doit être accélérée`);
  for (const clip of ['Rifle Aim', 'Rifle Run Tir', 'Pistol Idle Tir', 'Idle', 'Wave', 'Death']) assert.equal(clipSpeed(clip), ANIM_SPEED);
  assert.ok(clipSpeed('Kick') <= 2.5, 'pas de vitesse absurde');
  assert.ok(clipSpeed('Rifle Reload') > ANIM_SPEED && clipSpeed('Pistol Reload') > ANIM_SPEED, 'les recharges sont accélérées (4,2 s à vitesse normale)');
});

test('changer d\'arme : fusil, pistolet, mains nues, puis fusil', () => {
  assert.equal(nextWeapon('rifle'), 'pistol');
  assert.equal(nextWeapon('pistol'), 'none');
  assert.equal(nextWeapon('none'), 'rifle');
});

test('action ponctuelle (recharge, mêlée, geste) : prioritaire sur le déplacement', () => {
  const r = pick({ overlay: 'Rifle Reload', move: 'run' });
  assert.equal(r.clip, 'Rifle Reload');
  assert.equal(r.once, true);
  assert.equal(pick({ overlay: 'Wave' }).clip, 'Wave');
});

test('mort et à terre passent avant les actions ponctuelles', () => {
  assert.equal(pick({ overlay: 'Wave', dead: true }).clip, 'Rifle Death');
});

test('tir continu à l\'arrêt : animation de tir', () => {
  assert.equal(pick({ firing: true }).clip, 'Rifle Fire');
  assert.equal(pick({ firing: true, sniper: true }).clip, 'Rifle Aim Sniper'.replace('Aim', 'Fire'));
  assert.equal(pick({ firing: true, move: 'run' }).clip, 'Rifle Run Tir');
  assert.equal(pick({ firing: true, weapon: 'pistol' }).clip, 'Pistol Idle Tir');
});

test('toutes les animations choisies sont exportées', () => {
  for (const weapon of ['rifle', 'pistol', 'none'])
    for (const crouch of [false, true])
      for (const move of ['idle', 'walk', 'run', 'back', 'side'])
        for (const raised of [false, true])
          for (const sniper of [false, true])
            for (const airborne of [false, true])
              for (const dead of [false, true])
                for (const downed of [false, true])
                  for (const firing of [false, true])
                    for (const running of [false, true])
                      for (const side of ['left', 'right'])
                        for (const sprint of [false, true]) {
                          const c = pick({ weapon, crouch, move, raised, sniper, airborne, dead, downed, firing, running, side, sprint }).clip;
                          assert.ok(exported.has(c), `animation non exportée : ${c}`);
                        }
});

test('accélération du joueur : pas sur les animations d arrêt et de visée (elles trembleraient)', () => {
  for (const c of ['Idle', 'Rifle Aim', 'Rifle Idle', 'Crouch Idle', 'Pistol Aim Sniper']) assert.equal(boostFor(c, 1.25), 1, c);
  for (const c of ['Run', 'Rifle Run Tir', 'Rifle Reload', 'Kick', 'Walk']) assert.equal(boostFor(c, 1.25), 1.25, c);
});
