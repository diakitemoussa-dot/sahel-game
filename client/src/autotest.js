// Mode de test automatique : http://localhost:8080/index.html?autotest=<scénario>
// Rejoue un scénario sans clavier ni souris, vérifie l'animation attendue, puis affiche les mesures
// dans le texte d'aide (visible sur les captures) et dans la console.
import * as THREE from 'three';
import { wrapPi } from './orbit.js';
import { Ammo } from './ammo.js';

// once : la commande n'est envoyée qu'une fois (appui de touche) ; sinon elle reste appuyée.
// frames : image à laquelle on mesure. expect : animation attendue à ce moment.
const SCENARIOS = {
  stand:    { frames: 90,  expect: 'Rifle Aim', setup: () => {} },
  run:      { frames: 200, expect: 'Rifle Run Tir', input: { moveY: 1 } },
  back:     { frames: 60,  expect: 'Rifle Walk Backward Tir', input: { moveY: -1 } },
  side:     { frames: 60,  expect: 'Rifle Run Tir', input: { moveX: 1 } },
  // sprint = stick gauche enfoncé (L3) ou Maj gauche + avant : animations d'origine Rifle Run / Pistol Run
  sprint_rifle:  { frames: 60, expect: 'Rifle Run', input: { moveY: 1, sprint: true } },
  sprint_pistol: { frames: 60, expect: 'Pistol Run', input: { moveY: 1, sprint: true }, setup: (g) => { g.player.setWeapon('pistol'); } },
  sprint_aim:    { frames: 60, expect: 'Rifle Walk Tir', input: { moveY: 1, sprint: true, aim: true } },
  sprint_stand:  { frames: 60, expect: 'Rifle Aim', input: { sprint: true } },
  // stick droit : la caméra tourne autour du personnage à l'arrêt (le corps garde son orientation)
  orbit:       { frames: 60, expect: 'Rifle Aim', expectOrbit: true, minBodyGapDeg: 20, input: { padLookX: 0.02 } },
  // puis il avance : le corps se retourne vers la caméra
  orbit_move:  { frames: 140, expect: 'Rifle Run Tir', expectOrbit: false, maxBodyGapDeg: 5,
                 phases: [{ until: 50, input: { padLookX: 0.02 } }, { until: 140, input: { moveY: 1 } }] },
  orbit_aim:   { frames: 140, expect: 'Rifle Aim', expectOrbit: false, maxBodyGapDeg: 5,
                 phases: [{ until: 50, input: { padLookX: 0.02 } }, { until: 140, input: { aim: true } }] },
  // vitesse de lecture des animations de combat (1 = normale)
  combat_speed:  { frames: 14, expect: 'Punch', expectSpeed: 1.6, input: { combo: true }, once: true, setup: (g) => { g.player.setWeapon('none'); } },
  combat_speed_kick: { frames: 14, expect: 'Kick', expectSpeed: 2.0, input: { combo: true }, once: true, setup: (g) => { g.player.setWeapon('rifle'); g.player.combo.index = 1; g.player.combo.weapon = 'rifle'; g.player.combo.lastEnd = performance.now() / 1000; } },
  normal_speed:  { frames: 30, expect: 'Rifle Aim', expectSpeed: 1 },
  // captures en plein mouvement (la commande reste appuyée), pour comparer les postures
  pistol_run_hold: { frames: 60, expect: 'Pistol Run Tir', keep: true, input: { moveY: 1 }, setup: (g) => { g.player.setWeapon('pistol'); } },
  // transition Idle (mains nues) -> Rifle Aim : on mesure le plus grand saut du canon d'une image à l'autre (progressif = petit)
  transition_idle_aim: { frames: 75, expect: 'Rifle Aim', trackFrom: 31,
                         setup: (g) => { g.player.setWeapon('none'); },
                         phases: [{ until: 30, input: {} }, { until: 31, input: { weapon: 'rifle' } }, { until: 400, input: {} }] },
  // même passage avec l'ancien comportement (fondu court, visée d'un coup) : sert de point de comparaison
  transition_idle_aim_ancien: { frames: 75, expect: 'Rifle Aim', trackFrom: 31,
                         setup: (g) => { g.player.setWeapon('none'); g.player.smooth = false; },
                         phases: [{ until: 30, input: {} }, { until: 31, input: { weapon: 'rifle' } }, { until: 400, input: {} }] },
  // tireur d'élite actif : l'orbite est verrouillée, le stick droit fait tourner le personnage avec la caméra
  orbit_sniper: { frames: 60, expect: 'Rifle Aim Sniper', expectOrbit: false, maxBodyGapDeg: 5, input: { padLookX: 0.02 }, setup: (g) => { g.player.sniperLatched = true; } },
  orbit_sniper_l2: { frames: 60, expect: 'Rifle Aim Sniper', expectOrbit: false, maxBodyGapDeg: 5, input: { padLookX: 0.02, sniperHold: true } },
  // la souris fait toujours tourner le personnage avec la caméra
  mouse_turn:  { frames: 60, expect: 'Rifle Aim', expectOrbit: false, maxBodyGapDeg: 5, input: { lookX: 0.02 } },
  jump:     { frames: 6,  expect: 'Rifle Jump Tir', input: { jump: true }, once: true },
  crouch:   { frames: 90,  expect: 'Rifle Kneel Tir', setup: (g) => { g.player.state.crouch = true; } },
  fire:     { frames: 40,  expect: 'Rifle Fire', input: { fire: true } },
  sniper:   { frames: 90,  expect: 'Rifle Aim Sniper', setup: (g) => { g.player.sniperLatched = true; } },
  // L2 de la manette (maintenue) : tireur d'élite, avec le fusil comme avec le pistolet
  sniper_l2:     { frames: 40, expect: 'Rifle Aim Sniper', input: { sniperHold: true } },
  sniper_l2_pistol: { frames: 40, expect: 'Pistol Aim Sniper', input: { sniperHold: true }, setup: (g) => { g.player.setWeapon('pistol'); } },
  sniper_pistol: { frames: 90, expect: 'Pistol Aim Sniper', setup: (g) => { g.player.setWeapon('pistol'); g.player.sniperLatched = true; } },
  // X / Carré : enchaîne les animations de combat. Deux appuis (le 2e pendant la 1re attaque) = deux attaques à la suite.
  combo_none:   { frames: 260, expectLog: ['Punch', 'Cross Punch'], setup: (g) => { g.player.setWeapon('none'); },
                  phases: [{ until: 1, input: {} }, { until: 2, input: { combo: true } }, { until: 5, input: {} }, { until: 6, input: { combo: true } }, { until: 400, input: {} }] },
  combo_rifle:  { frames: 260, expectLog: ['Melee Punch', 'Punch'],
                  phases: [{ until: 1, input: {} }, { until: 2, input: { combo: true } }, { until: 5, input: {} }, { until: 6, input: { combo: true } }, { until: 400, input: {} }] },
  combo_pistol: { frames: 260, expectLog: ['Pistol Whip', 'Punch'], setup: (g) => { g.player.setWeapon('pistol'); },
                  phases: [{ until: 1, input: {} }, { until: 2, input: { combo: true } }, { until: 5, input: {} }, { until: 6, input: { combo: true } }, { until: 400, input: {} }] },
  // F / Triangle : coups de pied. Un appui = Kick ; un 2e appui pendant le coup = Side Kick juste après.
  kick:       { frames: 14, expect: 'Kick', expectSpeed: 2.0, input: { kick: true }, once: true, setup: (g) => { g.player.setWeapon('rifle'); } },
  kick_chain: { frames: 260, expectLog: ['Kick', 'Side Kick'], setup: (g) => { g.player.setWeapon('none'); },
                phases: [{ until: 1, input: {} }, { until: 2, input: { kick: true } }, { until: 5, input: {} }, { until: 6, input: { kick: true } }, { until: 400, input: {} }] },
  // pistolet : un pas de côté pour chaque sens (stick vers la gauche = pas à gauche, vers la droite = pas à droite)
  pistol_left:  { frames: 40, expect: 'Pistol Strafe Tir', input: { moveX: -1 }, setup: (g) => { g.player.setWeapon('pistol'); } },
  pistol_right: { frames: 40, expect: 'Pistol Strafe Right Tir', input: { moveX: 1 }, setup: (g) => { g.player.setWeapon('pistol'); } },
  // il ne glisse pas quand il tire debout ou fait une action ; accroupi il peut marcher en tirant
  fire_move:     { frames: 60, expect: 'Rifle Fire', maxMoveM: 0.05, input: { fire: true, moveY: 1 } },
  fire_crouch:   { frames: 60, expect: 'Rifle Crouch Walk Tir', minMoveM: 1, input: { fire: true, moveY: 1 }, setup: (g) => { g.player.state.crouch = true; } },
  reload_move:   { frames: 20, expect: 'Rifle Reload', maxMoveM: 0.05, setup: (g) => { g.player.ammo = new Ammo({ rifle: 30, pistol: 12 }); g.player.ammo.mag.rifle = 10; },
                   phases: [{ until: 2, input: { reload: true, moveY: 1 } }, { until: 30, input: { moveY: 1 } }] },
  melee_move:    { frames: 12, expect: 'Melee Punch', maxMoveM: 0.05,
                   phases: [{ until: 2, input: { melee: true, moveY: 1 } }, { until: 30, input: { moveY: 1 } }] },
  crouch_walk:   { frames: 60, expect: 'Rifle Crouch Walk Tir', minMoveM: 1, input: { moveY: 1 }, setup: (g) => { g.player.state.crouch = true; } },
  fps:      { frames: 90,  expect: 'Rifle Aim', setup: (g) => { g.rig.toggleView(); } },
  pistol:   { frames: 90,  expect: 'Pistol Idle Tir', setup: (g) => { g.player.setWeapon('pistol'); } },
  switch:   { frames: 12,  expect: 'Pistol Idle Tir', input: { weapon: 'pistol' }, once: true },   // changement d'arme sans geste
  reload:   { frames: 20,  expect: 'Rifle Reload', input: { reload: true }, once: true, setup: (g) => { g.player.ammo = new Ammo({ rifle: 30, pistol: 12 }); g.player.ammo.mag.rifle = 10; } },
  // chargeur vide : la recharge démarre toute seule (animation de recharge), on ne peut plus tirer pendant ; à la fin le chargeur est plein
  recharge_auto_fusil:   { frames: 45, expect: 'Rifle Reload', input: { fire: true },
                           setup: (g) => { g.player.ammo = new Ammo({ rifle: 3, pistol: 12 }); },
                           check: (g) => g.sfx.count.rifle === 3 && g.player.ammo.left('rifle') === 0 && !!g.player.ammo.reloading && g.sfx.count.reload_rifle >= 1 },
  recharge_auto_pistolet: { frames: 40, expect: 'Pistol Reload', input: { fire: true },
                           setup: (g) => { g.player.setWeapon('pistol'); g.player.ammo = new Ammo({ rifle: 30, pistol: 3 }); },
                           check: (g) => g.sfx.count.pistol === 3 && g.player.ammo.left('pistol') === 0 && !!g.player.ammo.reloading && g.sfx.count.reload_pistol >= 1 },
  recharge_fin_fusil:    { frames: 100, phases: [{ until: 2, input: {} }, { until: 14, input: { fire: true } }, { until: 200, input: {} }],
                           setup: (g) => { g.player.ammo = new Ammo({ rifle: 3, pistol: 12 }); },
                           check: (g) => g.player.ammo.left('rifle') === 3 && !g.player.ammo.reloading && !g.player.state.overlay && g.sfx.count.rifle === 3 },
  recharge_fin_pistolet: { frames: 100, phases: [{ until: 2, input: {} }, { until: 22, input: { fire: true } }, { until: 200, input: {} }],
                           setup: (g) => { g.player.setWeapon('pistol'); g.player.ammo = new Ammo({ rifle: 30, pistol: 3 }); },
                           check: (g) => g.player.ammo.left('pistol') === 3 && !g.player.ammo.reloading && !g.player.state.overlay && g.sfx.count.pistol === 3 },
  melee:    { frames: 12,  expect: 'Melee Punch', input: { melee: true }, once: true },
  whip:     { frames: 12,  expect: 'Pistol Whip', input: { melee: true }, once: true, setup: (g) => { g.player.setWeapon('pistol'); } },
  wave:     { frames: 8,   expect: 'Wave', input: { wave: true }, once: true },
  victory:  { frames: 12,  expect: 'Victory', input: { victory: true }, once: true },
  hit:      { frames: 12,  expect: 'Hit Reaction', input: { hit: true }, once: true },
  // mains nues : le groupe Idle, Walk, Run, Walk Backward, Run Backward, côtés
  nu_idle:  { frames: 60,  expect: 'Idle', setup: (g) => { g.player.setWeapon('none'); } },
  nu_walk:  { frames: 60,  expect: 'Walk', input: { moveY: 0.4 }, setup: (g) => { g.player.setWeapon('none'); } },
  nu_run:   { frames: 60,  expect: 'Run', input: { moveY: 1 }, setup: (g) => { g.player.setWeapon('none'); } },
  nu_bwalk: { frames: 60,  expect: 'Walk Backward', input: { moveY: -0.4 }, setup: (g) => { g.player.setWeapon('none'); } },
  nu_brun:  { frames: 60,  expect: 'Run Backward', input: { moveY: -1 }, setup: (g) => { g.player.setWeapon('none'); } },
  nu_left:  { frames: 60,  expect: 'Strafe Left', input: { moveX: -1 }, setup: (g) => { g.player.setWeapon('none'); } },
  nu_right: { frames: 60,  expect: 'Strafe Right', input: { moveX: 1 }, setup: (g) => { g.player.setWeapon('none'); } },
  nu_key3:  { frames: 20,  expect: 'Idle', input: { weapon: 'none' }, once: true },
  // tenues : même animation avec la tenue militaire ; le menu (U, flèches, Entrée) change et mémorise la tenue
  tenue_militaire: { frames: 150, expect: 'Rifle Aim', expectUniform: 'militaire', setup: (g) => { g.wardrobe.select('militaire'); } },
  tenue_camo: { frames: 60, expect: 'Rifle Aim', expectUniform: 'militaire_camo', setup: (g) => { g.wardrobe.select('militaire_camo'); g.look(2.6, 0.05); } },
  tenue_sable: { frames: 60, expect: 'Rifle Aim', expectUniform: 'militaire_sable', setup: (g) => { g.wardrobe.select('militaire_sable'); g.look(2.6, 0.05); } },
  tenue_roux: { frames: 60, expect: 'Rifle Aim', expectUniform: 'militaire_roux', setup: (g) => { g.wardrobe.select('militaire_roux'); g.look(2.6, 0.05); } },
  tenue_dos:       { frames: 165, expect: 'Rifle Aim', expectUniform: 'militaire', setup: (g) => { g.wardrobe.select('militaire'); g.look(0, 0.0); }, input: { padLookX: 1 } },
  tenue_run:       { frames: 200, expect: 'Rifle Run Tir', expectUniform: 'militaire', input: { moveY: 1 }, setup: (g) => { g.wardrobe.select('militaire'); } },
  tenue_pistol:    { frames: 150, expect: 'Pistol Idle Tir', expectUniform: 'militaire', setup: (g) => { g.wardrobe.select('militaire'); g.player.setWeapon('pistol'); } },
  tenue_kick:      { frames: 200, expectLog: ['Kick'], expectUniform: 'militaire', setup: (g) => { g.wardrobe.select('militaire'); },
                     phases: [{ until: 100, input: {} }, { until: 101, input: { kick: true } }, { until: 400, input: {} }] },
  tenue_menu:      { frames: 200, expect: 'Rifle Aim', expectUniform: 'militaire_camo', expectMenuOpen: false,
                     phases: [{ until: 3, input: {} }, { until: 4, input: { wardrobeToggle: true } }, { until: 6, input: {} }, { until: 7, input: { menuRight: true } },
                              { until: 90, input: {} }, { until: 91, input: { menuOk: true } }, { until: 400, input: {} }] },
  tenue_annule:    { frames: 150, expect: 'Rifle Aim', expectUniform: 'militaire', expectMenuOpen: false,
                     phases: [{ until: 3, input: {} }, { until: 4, input: { wardrobeToggle: true } }, { until: 6, input: {} }, { until: 7, input: { menuRight: true } },
                              { until: 60, input: {} }, { until: 61, input: { menuBack: true } }, { until: 400, input: {} }] },
  tenue_menu_ouvert: { frames: 80, expect: 'Rifle Aim', expectUniform: 'militaire_camo', expectMenuOpen: true, keep: true,
                     phases: [{ until: 3, input: {} }, { until: 4, input: { wardrobeToggle: true } }, { until: 6, input: {} }, { until: 7, input: { menuRight: true } }, { until: 400, input: {} }] },
  tenue_kick_milieu: { frames: 106, expectUniform: 'militaire', setup: (g) => { g.wardrobe.select('militaire'); },
                     phases: [{ until: 100, input: {} }, { until: 101, input: { kick: true } }, { until: 400, input: {} }] },
  // clic sur le bouton « TENUES » : le menu s'ouvre
  tenue_bouton: { frames: 40, expect: 'Rifle Aim', expectMenuOpen: true, setup: () => { document.getElementById('wbtn').click(); } },
  // collisions : il avance droit vers un obstacle et doit s'arrêter devant (coordonnées three.js : z = -y Blender, avancer = +z)
  col_tente:  { frames: 200, expect: 'Rifle Run Tir', input: { moveY: 1 }, watchInside: true,
                setup: (g) => { g.player.pos.set(-160, g.world.groundY(-160, 165), 165); } },
  col_caisse: { frames: 120, expect: 'Rifle Run Tir', input: { moveY: 1 }, watchInside: true,
                setup: (g) => { g.player.pos.set(-180.8, g.world.groundY(-180.8, 183), 183); } },
  vue_maison: { frames: 60, expect: 'Rifle Aim', setup: (g) => { g.player.pos.set(108.7, g.world.groundY(108.7, -126), -126); } },
  // il traverse la porte d'une maison (Cabane_11, ex-maison pleine) et se retrouve à l'intérieur : expectNear = [x Blender, y Blender, rayon]
  entre_maison: { frames: 40, expect: 'Rifle Run Tir', input: { moveY: 1 }, expectNear: [108.73, 116.37, 2.5],
                  setup: (g) => { g.player.pos.set(108.73, g.world.groundY(108.73, -126.4), -126.4); } },
  // PNJ : 3 miliciens en tenue à part, qui patrouillent avec les mêmes animations que le joueur ; le joueur est placé en face du premier
  pnj_patrouille: { frames: 120, expect: 'Rifle Aim', expectNpcs: 3,
                    setup: (g) => { const n = g.npcs[0].player.pos; g.player.pos.set(n.x, g.world.groundY(n.x, n.z - 7), n.z - 7); } },
  pnj_gros_plan: { frames: 70, expect: 'Rifle Aim', expectNpcs: 3,
                    setup: (g) => { const n = g.npcs[0].player.pos; g.player.pos.set(n.x + 0.5, g.world.groundY(n.x, n.z - 3.6), n.z - 3.6); } },
  // le PNJ a-t-il les mêmes animations que le joueur ? mêmes noms, et chaque piste d'animation trouve son os sur le squelette du PNJ
  pnj_animations: { frames: 20, expect: 'Rifle Aim', expectNpcs: 3, expectNpcClips: true },
  // le PNJ en pleine action, avec sa tenue : coup de pied, puis mort (le joueur est placé en face de lui)
  pnj_coup_de_pied: { frames: 9, expectNpcs: 3, setup: (g) => { const q = g.npcs[0]; const n = q.player.pos; g.player.pos.set(n.x + 0.6, g.world.groundY(n.x, n.z - 3.6), n.z - 3.6); q.override = { kick: true }; } },
  pnj_mort: { frames: 60, expectNpcs: 3, setup: (g) => { const q = g.npcs[0]; const n = q.player.pos; g.player.pos.set(n.x + 0.6, g.world.groundY(n.x, n.z - 3.6), n.z - 3.6); q.override = { deadToggle: true }; } },
  // ---- combat : les PNJ deviennent hostiles uniquement dans ces scénarios (hostile = true)
  // un PNJ alerté tire sur le joueur : au moins un tir, et le joueur perd de la vie
  combat_pnj_tire: { frames: 260, hostile: true, check: (g) => g.skirmish.log.some((e) => e.type === 'npc_tir') && g.player.health.hp < 100,
                     setup: (g) => { const n = g.npcs[0].player.pos; g.player.pos.set(n.x, g.world.groundY(n.x, n.z - 10), n.z - 10); g.npcs[0].brain.alarm(g.player.pos); } },
  // le joueur tire avec le vrai chemin de tir (clic) : le PNJ est placé sur le viseur à 10 m, il doit mourir en quelques balles
  combat_joueur_tire: { frames: 90, hostile: true, input: { fire: true }, check: (g) => g.npcs[0].dead && g.skirmish.kills === 1 && g.skirmish.log.some((e) => e.type === 'npc_mort'),
                        each: (g) => { const o = g.camera.getWorldPosition(new THREE.Vector3()), d = g.camera.getWorldDirection(new THREE.Vector3()); const q = g.npcs[0].player;
                                       if (!g.npcs[0].dead) { q.pos.set(o.x + d.x * 10, o.y + d.y * 10 - 1.2, o.z + d.z * 10); q.vy = 0; } } },
  // bagarre : le PNJ est collé au joueur, tous deux se frappent (le joueur enchaîne les coups avec X)
  combat_bagarre: { frames: 260, hostile: true,
                    check: (g) => g.skirmish.log.some((e) => e.type === 'npc_coup') && g.skirmish.log.some((e) => e.type === 'npc_touche' && e.how !== 'tir') && g.skirmish.log.some((e) => e.type === 'joueur_touche') && g.npcs[0].health.hp < g.npcs[0].health.max,
                    setup: (g) => { const p = g.player.pos, q = g.npcs[0]; q.player.pos.set(p.x, g.world.groundY(p.x, p.z + 1.3), p.z + 1.3); q.brain.alarm(p); q.brain.state = 'engage'; g.player.setWeapon('none'); },
                    phases: [{ until: 5, input: {} }, { until: 6, input: { combo: true } }, { until: 40, input: {} }, { until: 41, input: { combo: true } }, { until: 80, input: {} }, { until: 81, input: { combo: true } }, { until: 120, input: {} }, { until: 121, input: { combo: true } }, { until: 400, input: {} }] },
  // un coup de feu est entendu : tous les PNJ proches vont voir
  combat_bruit: { frames: 30, hostile: true, check: (g) => g.npcs.every((n) => n.brain.state === 'alert' || n.brain.state === 'engage'),
                  setup: (g) => { g.skirmish._noise(g.player.pos); } },
  // touché, un PNJ se défend : il sursaute (« Hit Reaction ») puis se bat, même si le tireur est derrière lui
  combat_defense: { frames: 80, hostile: true, check: (g) => g.skirmish.log.some((e) => e.type === 'npc_touche') && ['engage', 'melee'].includes(g.npcs[0].brain.state) && g.npcs[0].health.hp === 135,      // 160 pv - 25
                    setup: (g) => { const n = g.npcs[0]; g.player.pos.set(n.player.pos.x, g.world.groundY(n.player.pos.x, n.player.pos.z - 8), n.player.pos.z - 8); g.skirmish.hurtNpc(n, 25, 'tir'); } },
  // le joueur tombe, puis réapparaît au point de départ avec toute sa vie
  combat_mort_joueur: { frames: 420, hostile: true, check: (g) => g.skirmish.log.some((e) => e.type === 'joueur_mort') && g.skirmish.log.some((e) => e.type === 'joueur_reapparait') && g.player.health.hp > 0 && !g.player.state.dead,
                        setup: (g) => { g.player.health.hp = 5; const n = g.npcs[0].player.pos; g.player.pos.set(n.x, g.world.groundY(n.x, n.z - 6), n.z - 6); g.npcs[0].brain.alarm(g.player.pos); } },
  // ciel : la caméra regarde vers le soleil (derrière le joueur, à droite) ; puis vers les nuages, vers l'horizon
  // convoi de blindés et lance-missiles en embuscade : le joueur se tient près de la piste, à l'ouest de la première embuscade
  convoi_vue: { frames: 60, expect: 'Rifle Aim', hostile: true, setup: (g) => { const x = -150, z = 100; g.player.pos.set(x, g.world.groundY(x, z), z); g.look(1.5, 0.12); } },
  ciel_soleil: { frames: 40, expect: 'Rifle Aim', setup: (g) => { g.look(-2.2, 0.5); } },
  ciel_nuages: { frames: 40, expect: 'Rifle Aim', setup: (g) => { g.look(0.5, 0.55); } },
  ciel_horizon: { frames: 40, expect: 'Rifle Aim', setup: (g) => { g.look(0, 0.12); } },
  // poussière : le joueur court (nuages sous les pas) ; au moins une particule de poussière doit être vivante
  poussiere_course: { frames: 60, expect: 'Rifle Run Tir', input: { moveY: 1 }, check: (g) => g.dust.pool.alive > 3 },
  // gros nuage de poussière posé à 4 m devant la caméra (vérifie l'affichage des particules)
  poussiere_test: { frames: 25, expect: 'Rifle Aim', setup: (g) => { const o = g.camera.position, d = g.camera.getWorldDirection(new THREE.Vector3()); g.dust.puff({ x: o.x + d.x * 5, y: g.world.groundY(o.x + d.x * 5, o.z + d.z * 5), z: o.z + d.z * 5 }, { count: 30, spread: 1.2, up: 0.6, size: 2.5, life: 2.5, alpha: 0.6 }); } },
  // indicateur de tirs : un PNJ tire sur le joueur, un arc jaune apparaît du côté du PNJ
  indicateur_tirs: { frames: 120, hostile: true, check: (g) => g.hud.indicators.size > 0 && g.skirmish.log.some((e) => e.type === 'npc_tir'),
                     setup: (g) => { const n = g.npcs[0].player.pos; g.player.pos.set(n.x, g.world.groundY(n.x, n.z - 9), n.z - 9); g.npcs[0].brain.alarm(g.player.pos); } },
  // flamme de bouche : le joueur tire, la flamme et les étincelles sont vivantes
  tir_flamme: { frames: 22, expect: 'Rifle Fire', keep: true, input: { fire: true }, check: (g) => g.muzzle.firePool.alive > 0 && g.muzzle.sparkPool.alive > 0 },
  tir_flamme_pistolet: { frames: 22, keep: true, input: { fire: true }, setup: (g) => { g.player.setWeapon('pistol'); }, check: (g) => g.muzzle.firePool.alive > 0 },
  // sang : le PNJ est sur le viseur, le joueur tire : jet de sang à l'impact, éclaboussures au sol, puis mare sous le PNJ tombé
  sang_impact: { frames: 14, hostile: true, keep: true, input: { fire: true }, check: (g) => g.blood.dropPool.alive + g.blood.mistPool.alive > 0 && g.npcs[0].health.hp < 100,
                 each: (g) => { const o = g.camera.getWorldPosition(new THREE.Vector3()), d = g.camera.getWorldDirection(new THREE.Vector3()); const q = g.npcs[0].player;
                                if (!g.npcs[0].dead) { q.pos.set(o.x + d.x * 6, o.y + d.y * 6 - 1.2, o.z + d.z * 6); q.vy = 0; } } },
  sang_mare: { frames: 160, hostile: true, input: { fire: true }, check: (g) => g.npcs[0].dead && g.blood.decals.filter((d) => d && d.mesh.visible).length >= 2 && g.blood.decals.some((d) => d && d.grow && d.mesh.visible),
               each: (g) => { const o = g.camera.getWorldPosition(new THREE.Vector3()), d = g.camera.getWorldDirection(new THREE.Vector3()); const q = g.npcs[0].player;
                              if (!g.npcs[0].dead) { q.pos.set(o.x + d.x * 6, o.y + d.y * 6 - 1.2, o.z + d.z * 6); q.vy = 0; } } },
  // véhicule : posé à 20 m à gauche du départ ; la caméra le regarde ; on ne peut pas le traverser
  vehicule_vue: { frames: 40, expect: 'Rifle Aim', check: (g) => g.props.length === 1 && g.props[0].root.getObjectByName('V_Tourelle') && g.world.colliders.includes(g.props[0].collider),
                  setup: (g) => { g.look(-1.57, 0.12); } },
  vehicule_proche: { frames: 40, expect: 'Rifle Aim', check: (g) => g.props.length === 1, setup: (g) => { g.player.pos.set(-195, g.world.groundY(-195, 174), 174); g.look(-1.57, 0.1); } },
  vehicule_collision: { frames: 120, expect: 'Rifle Run Tir', input: { moveX: 1 }, watchInside: true, check: (g) => g.player.pos.x > -203.0 && g.player.pos.x < -196,
                        setup: (g) => { g.player.pos.set(-190, g.world.groundY(-190, 172), 172); } },
  vehicule_cote_soleil: { frames: 40, expect: 'Rifle Aim', check: (g) => g.props.length === 1, setup: (g) => { g.player.pos.set(-213, g.world.groundY(-213, 174), 174); g.look(1.57, 0.12); } },
  vehicule_avant: { frames: 40, expect: 'Rifle Aim', check: (g) => g.props.length === 1, setup: (g) => { g.player.pos.set(-204, g.world.groundY(-204, 163), 163); g.look(0, 0.1); } },
  vehicule_gros_plan: { frames: 40, expect: 'Rifle Aim', check: (g) => g.props.length === 1, setup: (g) => { g.player.pos.set(-198.2, g.world.groundY(-198.2, 177), 177); g.look(-1.15, 0.05); } },
  // sauts : un saut monte à ~1 m ; le double saut en l'air monte presque deux fois plus haut ; près d'un rebord, il fait grimper dessus
  saut_simple: { frames: 40, input: { jump: true }, once: true, check: (g) => g.player.pos.y < 0.01 && g.player.jumps === 0, expectMaxY: [0.8, 1.2] },
  double_saut: { frames: 60, check: (g) => g.player.pos.y < 0.01, expectMaxY: [1.5, 2.3],
                 phases: [{ until: 5, input: {} }, { until: 6, input: { jump: true } }, { until: 14, input: {} }, { until: 15, input: { jump: true } }, { until: 400, input: {} }] },
  // petite caisse (0,75 m) : un saut en avançant suffit pour monter dessus et s'y tenir debout (Blender (-180.8, -189) = jeu (-180.8, 189))
  saut_sur_caisse: { frames: 60, check: (g) => g.player.onGround && g.player.pos.y > g.world.groundY(g.player.pos.x, g.player.pos.z) + 0.5 && Math.abs(g.player.pos.x + 180.8) < 0.9 && Math.abs(g.player.pos.z - 189) < 0.9,
                     setup: (g) => { g.player.pos.set(-180.8, g.world.groundY(-180.8, 188.05), 188.05); },
                     phases: [{ until: 3, input: {} }, { until: 4, input: { moveY: 0.6, jump: true } }, { until: 14, input: { moveY: 0.6 } }, { until: 400, input: {} }] },
  // toit de la cabine du véhicule (2 m) : saut, puis deuxième appui près du rebord : il grimpe et se retrouve debout sur le toit
  double_saut_grimpe: { frames: 140, watchInside: true, check: (g) => g.player.onGround && g.player.pos.y > g.world.groundY(g.player.pos.x, g.player.pos.z) + 1.7 && g.player.pos.x < -203.0 && g.player.pos.x > -205.0,
                        setup: (g) => { g.player.pos.set(-201.8, g.world.groundY(-201.8, 174), 174); },
                        phases: [{ until: 3, input: {} }, { until: 4, input: { moveX: 1, jump: true } }, { until: 12, input: { moveX: 1 } }, { until: 13, input: { moveX: 1, jump: true } }, { until: 400, input: {} }] },
  // ---- alliés du joueur (PNJ de son groupe, en tenue militaire) : ils arrivent avec spawnAllies() ; les miliciens sont d'abord éliminés pour isoler le comportement testé
  // ils suivent le joueur : après sa course, chaque allié est à moins de 9 m de lui
  allie_suit: { frames: 360, hostile: true, check: (g) => g.allies.length === 3 && g.allies.every((a) => Math.hypot(a.player.pos.x - g.player.pos.x, a.player.pos.z - g.player.pos.z) < 9) && g.player.pos.z > 190,
                setup: async (g) => { g.npcs.forEach((n) => g.skirmish.hurtNpc(n, 999, 'test')); await g.spawnAllies(); },
                phases: [{ until: 150, input: {} }, { until: 250, input: { moveY: 1 } }, { until: 400, input: {} }] },
  // le joueur court : on regarde l'animation des alliés qui le suivent (captures à deux moments)
  allie_cours: { frames: 190, hostile: true, setup: async (g) => { g.npcs.forEach((n) => g.skirmish.hurtNpc(n, 999, 'test')); await g.spawnAllies(); g.look(0, 0.1); },
                 phases: [{ until: 90, input: {} }, { until: 400, input: { moveY: 1 } }] },
  allie_marche: { frames: 150, hostile: true, setup: async (g) => { g.npcs.forEach((n) => g.skirmish.hurtNpc(n, 999, 'test')); await g.spawnAllies(); g.look(0, 0.1); },
                  phases: [{ until: 90, input: {} }, { until: 400, input: { moveY: 0.5 } }] },
  // les alliés reviennent en courant vers le joueur immobile : on les voit de face
  allie_revient: { frames: 55, hostile: true, setup: async (g) => { g.npcs.forEach((n) => g.skirmish.hurtNpc(n, 999, 'test')); await g.spawnAllies(); const p = g.player.pos;
                    g.allies.forEach((a, i) => { const x = p.x + (i ? -3 : 3), z = p.z + 16; a.player.pos.set(x, g.world.groundY(x, z), z); }); g.look(0, 0.12); } },
  // ils voient un milicien et le combattent : tirs alliés, et le milicien perd de la vie
  allie_combat: { frames: 330, hostile: true, check: (g) => g.skirmish.log.some((e) => e.type === 'allie_tir') && g.npcs[0].health.hp < 100,
                  setup: async (g) => { g.npcs.slice(1).forEach((n) => g.skirmish.hurtNpc(n, 999, 'test')); await g.spawnAllies(); const e = g.npcs[0].player; e.pos.set(-190, g.world.groundY(-190, 188), 188); g.npcs[0].brain.alarm(g.player.pos); } },
  // le joueur est loin : le milicien prend l'allié pour cible et lui tire dessus
  milicien_cible_allie: { frames: 330, hostile: true, check: (g) => g.skirmish.log.some((e) => e.type === 'npc_tir' && e.cible && e.cible.startsWith('allie')) || g.skirmish.log.some((e) => e.type === 'allie_touche'),
                          setup: async (g) => { g.npcs.slice(1).forEach((n) => g.skirmish.hurtNpc(n, 999, 'test')); await g.spawnAllies(); g.player.pos.set(-120, g.world.groundY(-120, 120), 120); const e = g.npcs[0]; e.player.pos.set(-190, g.world.groundY(-190, 188), 188); e.brain.alarm({ x: -184, z: 171 }); } },
  allie_vue: { frames: 220, hostile: true, expect: 'Rifle Aim', check: (g) => g.allies.length === 3,
               setup: async (g) => { g.npcs.forEach((n) => g.skirmish.hurtNpc(n, 999, 'test')); await g.spawnAllies(); g.look(0, 0.1); } },
  // les cinq PNJ (3 miliciens, 2 alliés) en rang devant le joueur : une teinte de peau chacun (config/npcs.json)
  peaux_vue: { frames: 25, expect: 'Rifle Aim', expectNpcs: 3,
               check: (g) => [...g.npcs, ...g.allies].map((n) => { let k = 0; n.player.model.traverse((o) => { if (o.isMesh && o.material?.name === 'Ch12_body' && o.material.map?.source) k++; }); return k; }).every((k) => k >= 1) && g.allies.length === 3,
               setup: async (g) => {
                 await g.spawnAllies();
                 const row = [...g.npcs, ...g.allies], p = g.player.pos;
                 row.forEach((n, i) => { const x = p.x + (i - 2.5) * 1.1, z = p.z + 4; n.player.pos.set(x, g.world.groundY(x, z), z); n.player.yaw = Math.PI; });
                 g.look(0, 0.05);
               } },
  // un allié (tenue militaire noire) face à la caméra : on voit son gilet de face (texte ARTE-X)
  allie_face: { frames: 40, expect: 'Rifle Aim', setup: async (g) => { await g.spawnAllies(); const p = g.player.pos, a = g.allies[0].player; a.pos.set(p.x - 1.6, g.world.groundY(p.x - 1.6, p.z + 3.4), p.z + 3.4); a.yaw = Math.PI; g.allies[1].player.pos.set(p.x + 40, p.y, p.z); g.look(0, 0.05); } },
  // (outil) cherche des carrés de ronde libres (hors objets, trajets dégagés, sol plat) autour des zones : résultat dans la console
  monde_sites: { frames: 5, setup: (g) => {
    const w = g.world, m = w.mesh;
    const free = (bx, by) => { const x = bx, z = -by, gy = w.groundY(x, z); return [0.3, 0.9, 1.5].every((h) => m.insideObject(x, gy + h, z) < 0) && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => m.insideObject(x + dx, gy + 0.9, z + dz) < 0 && Math.abs(w.groundY(x + 2 * dx, z + 2 * dz) - gy) < 0.7); };
    const clear = (a, b) => !w.blocked({ x: a[0], y: w.groundY(a[0], -a[1]) + 0.5, z: -a[1] }, { x: b[0], y: w.groundY(b[0], -b[1]) + 0.5, z: -b[1] });
    const zones = { fort: [-150, 165], village: [140, 170], oasis: [160, -118], convoi: [0, -80], milieu1: [-60, 0], milieu2: [60, 40], nord: [0, 120], sud: [-60, -130] };
    const out = {};
    for (const [name, [cx, cy]] of Object.entries(zones)) {
      const sq = [];
      for (let r = 0; r <= 40; r += 4) for (let a = 0; a < 360; a += 30) {
        const x0 = cx + Math.cos(a * Math.PI / 180) * r, y0 = cy + Math.sin(a * Math.PI / 180) * r;
        const pts = [[x0, y0], [x0 + 8, y0], [x0 + 8, y0 + 6], [x0, y0 + 6]];
        if (!pts.every((q) => free(q[0], q[1]))) continue;
        if (!pts.every((q, i) => clear(q, pts[(i + 1) % 4]))) continue;
        if (sq.some((o) => Math.hypot(o[0][0] - x0, o[0][1] - y0) < 14)) continue;
        sq.push(pts);
      }
      out[name] = sq.slice(0, 4).map((p) => p.map((q) => q.map((v) => +v.toFixed(1))));
    }
    console.log('SITES ' + JSON.stringify(out));
  } },
  // intelligence : le milicien voit le joueur, cherche un abri et s'y met (journal « npc_abri »), puis alterne cache et tir ; il esquive quand on lui tire dessus
  combat_abri: { frames: 330, hostile: true,
                 check: (g) => g.skirmish.log.some((e) => e.type === 'npc_abri') && g.npcs.slice(0, 3).some((n) => n.brain.sub !== null || n.player.state.crouch || g.skirmish.log.some((e) => e.type === 'npc_tir')),
                 setup: (g) => { g.npcs.slice(1).forEach((n) => g.skirmish.hurtNpc(n, 999, 'test')); const n = g.npcs[0].player.pos; g.player.pos.set(n.x, g.world.groundY(n.x, n.z - 12), n.z - 12); g.npcs[0].brain.alarm(g.player.pos); } },
  // tout le monde : 18 miliciens chargés, ceux qui sont loin dorment ; en allant au fort, ceux du fort se réveillent (et sont affichés)
  monde_eveil: { frames: 40, hostile: true,
                 check: (g) => g.npcs.length === 21 && g.allies.length === 3
                   && g.npcs.filter((n) => n._asleep && !n.player.root.visible).length >= 12
                   && g.npcs.filter((n) => !n._asleep && n.player.root.visible && n.def.zone === 'fort').length === 3,
                 setup: async (g) => { await g.spawnAllies(); const p = g.player.pos; p.set(-150, g.world.groundY(-150, -171), -171); } },
  // on se place devant les miliciens du convoi (zone lointaine) : ils doivent être visibles, avec leur repère rouge
  monde_convoi_vue: { frames: 40, expect: 'Rifle Aim',
                      check: (g) => g.npcs.filter((n) => n.def.zone === 'convoi' && !n._asleep && n.player.root.visible).length === 3,
                      setup: (g) => { const q = g.npcs.find((n) => n.def.zone === 'convoi').player.pos; const x = q.x + 3, z = q.z - 14; g.player.pos.set(x, g.world.groundY(x, z), z); g.look(Math.atan2(q.x - x, q.z - z), 0.08); } },
  // un milicien et un allié tués ne reviennent jamais (autrefois : 30 s et 15 s) ; après la chute ils ne sont plus animés
  mort_definitive: { frames: 150, hostile: true,
                     check: (g) => g.npcs[0].dead && g.allies[0].dead && g.npcs[0].deadFor > 4 && g.allies[0].deadFor > 4 && !g.skirmish.log.some((e) => /reapparait/.test(e.type) && e.type !== 'joueur_reapparait'),
                     setup: async (g) => { await g.spawnAllies(); g.skirmish.hurtNpc(g.npcs[0], 999, 'test'); g.skirmish.hurtAlly(g.allies[0], 999, g.player.pos); } },
  // vues de face de la recharge (pour regarder le geste) : vue_recharge_<arme>_<image>
  ...Object.fromEntries(['rifle', 'pistol'].flatMap((w) => [18, 26, 34, 42, 50].map((f) => [`vue_recharge_${w}_${f}`, {
    frames: f, input: { fire: true },
    setup: (g) => { g.player.setWeapon(w); g.player.ammo = new Ammo({ rifle: 2, pistol: 2 }); },
    each: (g) => { const p = g.player.pos, y = g.player.yaw; g.camera.position.set(p.x + Math.sin(y) * 2.4 + Math.cos(y) * 0.9, p.y + 1.35, p.z + Math.cos(y) * 2.4 - Math.sin(y) * 0.9); g.camera.lookAt(p.x, p.y + 1.15, p.z); },
  }]))),
  // fumées de champ de bataille : foyers et épaves en feu présents dès le départ, un missile qui tombe, explose et laisse un nouveau foyer
  fumee_sites: { frames: 30, check: (g) => g.smoke.sites.length >= 9 && g.smoke.sites.filter((s) => s.kind === 'car').length === 3 && g.smoke.alive > 60 && g.smoke.sites.filter((s) => s.intensity > 0.3).length === 2 },
  fumee_frappe: { frames: 120, check: (g) => g.smoke.explosions >= 1 && g.sfx.count.missile >= 1 && g.sfx.count.explosion >= 1 && g.smoke.sites.some((s) => s.temp), setup: (g) => { g.smoke.strike(); } },
  // les frappes partent des avions de chasse : le passage lance des missiles, qui explosent
  fumee_avion_frappe: { frames: 260, setup: (g) => { g.air.launchPass(g.player.pos, g.getYaw()); },
                        check: (g) => g.air.strikesFired >= 2 && g.smoke.explosions >= 1 && g.sfx.count.missile >= 1 && g.smoke.missiles.length + g.smoke.explosions >= 2 },
  // le feu brûle : le joueur dans les flammes perd sa vie petit à petit (jamais d'un coup) ; sans issue il meurt
  fumee_brule_joueur: { frames: 70, setup: (g) => { const s = g.smoke.sites.find((q) => q.id === 'fumee_milieu1'); s.intensity = s.target = 1; g.player.pos.set(s.x + 0.5, g.world.groundY(s.x, s.z), s.z); g._hp = [100]; },
                        each: (g, n) => { if (g._hp && n % 10 === 0) g._hp.push(g.player.health.hp); },
                        check: (g) => { const h = g._hp, last = h[h.length - 1]; return last < 95 && last > 0 && h.every((v, i) => i === 0 || v <= h[i - 1]) && h.filter((v, i) => i && v < h[i - 1]).length >= 3; } },
  fumee_brule_mort: { frames: 120, setup: (g) => { const s = g.smoke.sites.find((q) => q.id === 'fumee_milieu1'); s.intensity = s.target = 1; g.player.health.hp = 12; g.player.pos.set(s.x + 0.5, g.world.groundY(s.x, s.z), s.z); },
                      check: (g) => g.skirmish.log.some((e) => e.type === 'joueur_mort' && e.par === 'feu') },
  // un PNJ pris dans une explosion sort du feu en courant, brûle un peu mais survit, et ne rentre plus dans les flammes
  fumee_brule_pnj: { frames: 110, setup: (g) => { const s = g.smoke.sites.find((q) => q.id === 'fumee_milieu1'); const n = g.npcs[0]; s.intensity = s.target = 1; g._site = s; g._npc = n; g._minD = 99;
                      g.player.pos.set(s.x + 18, g.world.groundY(s.x + 18, s.z), s.z); n.player.pos.set(s.x + 0.3, g.world.groundY(s.x, s.z), s.z); },
                      each: (g, n) => { if (g._npc && n > 30) g._minD = Math.min(g._minD, Math.hypot(g._npc.player.pos.x - g._site.x, g._npc.player.pos.z - g._site.z)); },
                      check: (g) => { const zs = g.smoke.burnZones(), z = zs.find((q) => Math.hypot(q.x - g._site.x, q.z - g._site.z) < 1);
                        return !!z && !g._npc.dead && g._npc.health.hp < g._npc.health.max && g._npc.health.hp > 70 && g._minD >= z.r + 0.9 && g.skirmish.log.some((e) => e.type === 'npc_brule' && e.id === g._npc.id); } },
  // la guerre en fond : combats lointains, explosion lointaine, salve d'obus, rafale d'hélicoptère (déclenchés à la main)
  fumee_guerre_helico: { frames: 220, setup: (g) => { const p = g.player.pos, y = g.getYaw(); g.war.startFight(p, y); g.war.farBlast(p, y); g.war.shellVolley(p, y); g.war.heliBurst(p); },
                         check: (g) => g.war.stats.shots > 8 && g.war.stats.far >= 1 && g.war.stats.shells >= 2 && g.war.stats.heliShots > 8 && g.smoke.explosions >= 3 && g.sfx.count.rifle > 10 } ,
  // le souffle d'une explosion blesse le joueur (et la vie basse fait pulser le bord de l'écran)
  fumee_guerre_souffle: { frames: 40, setup: (g) => { const p = g.player.pos; g.player.health.hp = 55; g.smoke.explode({ x: p.x + 5, y: p.y, z: p.z }, 1.2); },
                          check: (g) => g.player.health.hp > 0 && g.player.health.hp < 30 && g.hud.danger.classList.contains('on') && g.skirmish.log.some((e) => e.type === 'explosion' && e.joueur > 20) } ,
  // au départ presque rien ne brûle ; une frappe sur un foyer éteint l'allume (la situation empire)
  fumee_escalade: { frames: 60, setup: (g) => { const s = g.smoke.sites.find((q) => q.id === 'fumee_milieu1'); g._s = s; g._i0 = s.intensity; g.smoke.explode({ x: s.x + 4, y: s.y, z: s.z }, 1); },
                    check: (g) => g._i0 === 0 && g.smoke.ignitions >= 1 && g._s.intensity > 0 && g._s.intensity <= 1 } ,
  // animations du joueur +25 % : course jouée à 1,2 x 1,25 = 1,5 (les tests normaux gardent la vitesse 1)
  anim_rapide: { frames: 60, expect: 'Rifle Run Tir', expectSpeed: 1.5, input: { moveY: 1 }, setup: (g) => { g.player.animBoost = 1.25; } },
  anim_rapide_arret: { frames: 60, expect: 'Rifle Aim', expectSpeed: 1.2, setup: (g) => { g.player.animBoost = 1.25; } },
  // caméra : à genoux, la caméra du tireur d'élite descend au niveau de l'épaule (1,57 m debout -> ~1,02 m) ; et elle ne passe jamais sous le sol
  genou_sniper: { frames: 70, setup: (g) => { g.player.state.crouch = true; g.player.sniperLatched = true; },
                  check: (g) => { const h = g.camera.position.y - g.player.pos.y; return h > 0.95 && h < 1.1; } },
  debout_sniper: { frames: 70, setup: (g) => { g.player.sniperLatched = true; }, check: (g) => { const h = g.camera.position.y - g.player.pos.y; return h > 1.5 && h < 1.65; } },
  camera_sol: { frames: 50, setup: (g) => { g.look(0, 1.0); }, each: (g) => { g.look(0, 1.0); },
                check: (g) => g.camera.position.y >= g.world.groundY(g.camera.position.x, g.camera.position.z) + 0.29 },
  // mission : quand le dernier milicien tombe, « mission accomplie » s'affiche, avec le bilan de l'escouade
  mission_victoire: { frames: 40, setup: async (g) => { await g.spawnAllies(); for (const n of g.npcs) g.skirmish.hurtNpc(n, 999, 'test'); },
                      check: (g) => g.mission.won && /ACCOMPLIE/.test(g.hud.bannerEl.textContent) && new RegExp(`Miliciens : ${g.npcs.length} / ${g.npcs.length}`).test(g.hud.missionEl.textContent) && /Escouade : 3 \/ 3/.test(g.hud.missionEl.textContent) && /au complet/.test(g.hud.bannerEl.textContent) },
  mission_en_cours: { frames: 30, setup: (g) => { g.skirmish.hurtNpc(g.npcs[0], 999, 'test'); },
                      check: (g) => !g.mission.won && new RegExp(`Miliciens : 1 / ${g.npcs.length}`).test(g.hud.missionEl.textContent) && g.hud.bannerEl.textContent === '' },
  // mesures : hauteur de la tête et du buste au-dessus du sol, debout et à genoux (pour placer les caméras)
  mesure_debout: { frames: 70, setup: (g) => { g.player.sniperLatched = true; }, check: (g) => { logMesure(g, 'debout'); return true; } },
  mesure_genou: { frames: 70, setup: (g) => { g.player.state.crouch = true; g.player.sniperLatched = true; }, check: (g) => { logMesure(g, 'genou'); return true; } },
  // vues pour regarder le résultat : caméra placée en face d'un foyer
  vue_fumee_epave: { frames: 30, each: (g) => lookFrom(g, 'technique_brule_1', [-32, 16, -18], [0, 12, 0]) },
  vue_fumee_colonne: { frames: 30, each: (g) => lookFrom(g, 'fumee_sud_proche', [90, 4, 60], [0, 45, 0]) },
  vue_fumee_frappe: { frames: 76, setup: (g) => { const s = g.smoke.sites.find((q) => q.id === 'fumee_sud_proche'); g.smoke.launchMissile({ x: s.x + 8, z: s.z + 5 }); }, each: (g) => lookFrom(g, 'fumee_sud_proche', [60, 30, 45], [0, 12, 0]) },
  // aviation : hélicoptères qui tournent, avions de chasse qui traversent le ciel (muets/coupés en test sauf ces scénarios)
  air_helicos: { frames: 40, setup: (g) => { g._h0 = g.air.helis.map((h) => h.pos.clone()); },
                 check: (g) => g.air.helis.length === 2 && g.air.helis.every((h, i) => h.pos.distanceTo(g._h0[i]) > 3) && g.sfx.count.voice_heli === 2 && g.air.helis.every((h) => h.rotor.rotation.y !== 0) },
  air_avions: { frames: 40, setup: (g) => { g.air.launchPass(g.player.pos, g.getYaw()); },
                check: (g) => g.air.passes.length === 1 && g.air.passes[0].jets.length === 2 && g.air.passes[0].jets.every((j) => j.group.visible) && g.sfx.count.voice_jet >= 1 },
  vue_avion: { frames: 45, setup: (g) => { g.air.launchPass(g.player.pos, g.getYaw()); }, each: (g) => { const j = g.air.passes[0]?.jets[0]; if (!j) return; const p = j.group.position; g.camera.position.set(p.x + 26, p.y + 7, p.z - 34); g.camera.lookAt(p.x, p.y, p.z); } },
  vue_helico: { frames: 30, each: (g) => { const h = g.air.helis[0]; const p = h.pos; g.camera.position.set(p.x + 20, p.y + 5, p.z + 26); g.camera.lookAt(p.x, p.y, p.z); } },
  // profils de performance : à lancer avec E2E_EXTRA='&perf=eco' (profil téléphone) ou '&perf=max' (profil ordinateur)
  perf_eco: { frames: 20, check: (g) => g.perf.name === 'mobile' && g.renderer.getContext().getContextAttributes().antialias === false && g.renderer.getPixelRatio() <= 1.5
                && g.perf.shadowMap === 1024 && g.smoke.detail.rate < 1 && g.perf.fpsCap === 30 },
  perf_max: { frames: 20, check: (g) => g.perf.name === 'desktop' && g.renderer.getContext().getContextAttributes().antialias === true && g.smoke.detail.rate === 1 && g.perf.fpsCap === 0 },
  dead:     { frames: 30,  expect: 'Rifle Death', input: { deadToggle: true }, once: true },
  downed:   { frames: 30,  expect: 'Rifle Death', input: { downedToggle: true }, once: true },
};
// hauteur, côté et avant de la tête et du buste par rapport aux pieds (repère du personnage), pour placer les caméras
function logMesure(g, nom) {
  const q = new THREE.Vector3(), y = g.player.yaw, f = [Math.sin(y), Math.cos(y)], r = [-Math.cos(y), Math.sin(y)];
  const rel = (b) => { b.getWorldPosition(q); const dx = q.x - g.player.pos.x, dz = q.z - g.player.pos.z; return { h: +(q.y - g.player.pos.y).toFixed(2), droite: +(dx * r[0] + dz * r[1]).toFixed(2), avant: +(dx * f[0] + dz * f[1]).toFixed(2) }; };
  console.log('MESURE', nom, JSON.stringify({ tete: rel(g.player.bones.head), buste: rel(g.player.bones.spine), camera: { h: +(g.camera.position.y - g.player.pos.y).toFixed(2) } }));
}
// place la caméra à `off` (x, y, z) d'un foyer de fumée et la fait regarder `at` au-dessus de lui (pour les vues de contrôle)
function lookFrom(g, id, off, at) {
  const s = g.smoke.sites.find((q) => q.id === id);
  if (!s) return;
  g.camera.position.set(s.x + off[0], s.y + off[1], s.z + off[2]);
  g.camera.lookAt(s.x + at[0], s.y + at[1], s.z + at[2]);
}
// vrai si le joueur est dans un obstacle (marge de 5 cm) : position three.js (x, z) -> Blender (x, -z)
function insideAny(g) {
  if (g.world.mesh) return g.world.mesh.insideObject(g.player.pos.x, g.player.pos.y + 0.9, g.player.pos.z) >= 0;     // collision sur maillage : un point du torse est-il dans un objet ?
  const x = g.player.pos.x, y = -g.player.pos.z;
  return g.world.colliders.some((c) => {
    if (c.t === 'c') return Math.hypot(x - c.x, y - c.y) < c.r - 0.05;
    const cs = Math.cos(-c.yaw), sn = Math.sin(-c.yaw), dx = x - c.x, dy = y - c.y;
    return Math.abs(dx * cs - dy * sn) < c.hx - 0.05 && Math.abs(dx * sn + dy * cs) < c.hy - 0.05;
  });
}
// compare les animations du joueur et celles de chaque PNJ : mêmes noms, et chaque piste trouve son os (sinon l'animation ne jouerait pas)
function npcClipsReport(g) {
  const names = [...g.player.clips.keys()].sort();
  const per = g.npcs.map((q) => {
    const mine = [...q.player.clips.keys()].sort();
    let orphan = 0;
    for (const clip of q.player.clips.values()) for (const t of clip.tracks) {
      const node = THREE.PropertyBinding.parseTrackName(t.name).nodeName;
      if (!THREE.PropertyBinding.findNode(q.player.model, node)) orphan++;
    }
    let skinned = 0; q.player.model.traverse((o) => { if (o.isSkinnedMesh && o.visible && o.parent?.visible !== false) skinned++; });
    return { id: q.id, clips: mine.length, memesNoms: JSON.stringify(mine) === JSON.stringify(names), pistesSansOs: orphan, piecesHabillees: skinned };
  });
  return { clipsJoueur: names.length, pnj: per, ok: per.every((p) => p.memesNoms && p.pistesSansOs === 0 && p.piecesHabillees > 10) };
}
export const SCENARIO_NAMES = Object.keys(SCENARIOS);

export function makeAutotest(name) {
  const sc = SCENARIOS[name];
  if (!sc) return null;
  let maxY = -Infinity, insideEver = false, n = 0, result = null, startPos = null, prevDir = null, maxStep = 0;
  return {
    step(g) {
      n++;
      if (sc.phases) { const ph = sc.phases.find((p) => n <= p.until) ?? sc.phases[sc.phases.length - 1]; g.input.override = ph.input; }
      if (sc.each && n >= 2) sc.each(g, n);
      if (n === 2) { if (sc.hostile) g.skirmish.hostile = true; sc.setup?.(g); if (sc.input) g.input.override = sc.input; startPos = g.player.pos.clone(); }
      if (n === 3 && sc.once) g.input.override = {};
      if (sc.trackFrom && n >= sc.trackFrom && n < sc.frames) {                       // saut de la main droite d'une image à l'autre (en cm)
        g.player.model.updateMatrixWorld(true);
        const p = g.player.bones.hand.getWorldPosition(new THREE.Vector3());
        if (prevDir) maxStep = Math.max(maxStep, prevDir.distanceTo(p) * 100);
        prevDir = p.clone();
      }
      maxY = Math.max(maxY, g.player.pos.y);
      if (sc.watchInside && n >= 2 && insideAny(g)) insideEver = true;
      if (n === sc.frames) {
        const m = g.player.muzzleWorld();
        const o = g.camera.getWorldPosition(new THREE.Vector3());
        const d = g.camera.getWorldDirection(new THREE.Vector3());
        const want = o.clone().addScaledVector(d, 30).sub(m.pos).normalize();
        const gap = Math.abs(wrapPi(g.getYaw() - g.player.yaw)) * 180 / Math.PI;      // écart entre la caméra et le corps
        const moved = startPos ? Math.hypot(g.player.pos.x - startPos.x, g.player.pos.z - startPos.z) : 0;   // distance parcourue
        const moveOk = (sc.maxMoveM === undefined || moved <= sc.maxMoveM) && (sc.minMoveM === undefined || moved >= sc.minMoveM);
        const orbitOk = moveOk && (sc.expectOrbit === undefined || g.player.orbiting === sc.expectOrbit)
          && (sc.minBodyGapDeg === undefined || gap >= sc.minBodyGapDeg)
          && (sc.maxBodyGapDeg === undefined || gap <= sc.maxBodyGapDeg);
        result = {
          scenario: name, image: n,
          position: g.player.pos.toArray().map((v) => +v.toFixed(1)),
          animation: g.player.current, attendue: sc.expect,
          orbite: g.player.orbiting, ecartCorpsCameraDeg: +gap.toFixed(1), distanceM: +moved.toFixed(2),
          combo: g.player.comboLog,
          vitesse: g.player.action ? +g.player.action.getEffectiveTimeScale().toFixed(2) : null,
          sautMaxMainCm: +maxStep.toFixed(1),
          ok: (sc.expect === undefined || g.player.current === sc.expect) && orbitOk
            && (sc.expectLog === undefined || JSON.stringify(g.player.comboLog) === JSON.stringify(sc.expectLog))
            && !(sc.watchInside && insideEver)
            && (sc.check === undefined || !!sc.check(g))
            && (sc.expectMaxY === undefined || (maxY >= sc.expectMaxY[0] && maxY <= sc.expectMaxY[1]))
            && (!sc.expectNpcClips || npcClipsReport(g).ok)
            && (sc.expectNpcs === undefined || (g.npcs.length === sc.expectNpcs && g.npcs.every((q) => q.player.uniformId === 'pnj_milicien' && q.player.current)))
            && (sc.expectNear === undefined || Math.hypot(g.player.pos.x - sc.expectNear[0], -g.player.pos.z - sc.expectNear[1]) <= sc.expectNear[2])
            && (sc.expectUniform === undefined || g.player.uniformId === sc.expectUniform)
            && (sc.expectMenuOpen === undefined || g.wardrobe.open === sc.expectMenuOpen)
            && (sc.maxStepCm === undefined || maxStep <= sc.maxStepCm)
            && (sc.expectSpeed === undefined || (g.player.action && Math.abs(g.player.action.getEffectiveTimeScale() - sc.expectSpeed) < 1e-6)),
          arme: g.player.state.weapon, vue: g.rig.view,
          pnj: (g.npcs ?? []).map((q) => ({ id: q.id, tenue: q.player.uniformId, anim: q.player.current, mode: q.patrol.mode, x: +q.player.pos.x.toFixed(1), z: +q.player.pos.z.toFixed(1) })),
          animationsPnj: sc.expectNpcClips ? npcClipsReport(g) : undefined,
          allies: (g.allies ?? []).map((q) => ({ id: q.id, anim: q.player.current, crouch: q.player.state.crouch, raised: q.player.state.raised, relaxed: q.player.relaxed, aimW: +(q.player.aimWeight ?? 0).toFixed(2), yaw: +q.player.yaw.toFixed(2), cap: +(q.heading ?? 0).toFixed(2), orbite: q.player.orbiting, x: +q.player.pos.x.toFixed(1), z: +q.player.pos.z.toFixed(1), y: +q.player.pos.y.toFixed(2) })),
          vie: g.player.health.hp, combat: sc.hostile ? { journal: g.skirmish.log.slice(-6), pnj: g.npcs.map((q) => ({ hp: q.health.hp, etat: q.brain.state })) } : undefined,
          controle: sc.check ? !!sc.check(g) : null, hauteurMax: +maxY.toFixed(2), surObjet: g.player.onGround && g.player.pos.y > g.world.groundY(g.player.pos.x, g.player.pos.z) + 0.3, tenue: g.player.uniformId, dansObstacle: insideEver, menuOuvert: g.wardrobe.open,
          ecartCanonCentreDeg: +(m.dir.angleTo(want) * 180 / Math.PI).toFixed(2),
          commande: { x: +(g.lastInput?.moveX ?? 0).toFixed(2), y: +(g.lastInput?.moveY ?? 0).toFixed(2) },
          manettes: [...(navigator.getGamepads?.() ?? [])].filter(Boolean).map((p) => ({ id: p.id.slice(0, 30), axes: p.axes.map((a) => +a.toFixed(2)) })),
          deplacement: g.player.state.move,
          tir: !!g.lastInput?.fire, vise: !!g.lastInput?.aim,
          boutonsManette: [...(navigator.getGamepads?.() ?? [])].filter(Boolean)
            .flatMap((p) => p.buttons.map((b, i) => (b.value > 0.2 || b.pressed ? `${i}:${b.value.toFixed(2)}` : null)).filter(Boolean)),
        };
        if (!sc.keep) g.input.override = {};                       // keep : on garde la commande pour une capture en plein mouvement
        console.log('AUTOTEST ' + JSON.stringify(result));
      }
      return result ? 'AUTOTEST ' + JSON.stringify(result) : null;
    },
  };
}
