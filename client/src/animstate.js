/** Choisit l'animation selon l'état du joueur (tableau de docs/viser-au-centre.md).
 *  state : { weapon: 'rifle'|'pistol'|'none', crouch, move: 'idle'|'walk'|'run'|'back'|'side',
 *            raised (arme levée : le canon vise le centre), sniper, airborne, downed, dead }
 *  Retourne { clip, once?, clamp? }. */
export function pickClip(s) {
  const w = s.weapon;
  if (s.dead) return { clip: w === 'rifle' ? 'Rifle Death' : 'Death', once: true, clamp: true };
  if (s.downed) return { clip: 'Rifle Death', once: true, clamp: true };
  if (s.overlay) return { clip: s.overlay, once: true };          // recharge, mêlée, dégainer, geste, coup reçu
  const tir = s.raised && (w === 'rifle' || w === 'pistol');
  const m = s.move;
  if (s.airborne) {
    if (w === 'rifle') return { clip: tir ? 'Rifle Jump Tir' : 'Rifle Jump', once: true };
    if (w === 'pistol') return { clip: tir ? 'Pistol Jump Tir' : 'Pistol Jump', once: true };
    return { clip: 'Jump', once: true };
  }
  const crouchMove = s.crouch && m !== 'idle';
  // sprint (stick gauche enfoncé + avant) : course arme baissée, animations d'origine Rifle Run / Pistol Run
  if (s.sprint && !s.crouch) return { clip: w === 'rifle' ? 'Rifle Run' : w === 'pistol' ? 'Pistol Run' : 'Run' };
  if (w === 'rifle') {
    if (s.sniper && m === 'idle' && !s.crouch) return { clip: s.firing ? 'Rifle Fire Sniper' : 'Rifle Aim Sniper' };
    if (tir) {
      if (s.firing && m === 'idle' && !s.crouch) return { clip: 'Rifle Fire' };      // recul du fusil pendant le tir
      if (s.crouch) return { clip: crouchMove ? 'Rifle Crouch Walk Tir' : 'Rifle Kneel Tir' };
      return { clip: { idle: 'Rifle Aim', walk: 'Rifle Walk Tir', run: 'Rifle Run Tir', back: 'Rifle Walk Backward Tir', side: 'Rifle Run Tir' }[m] };
    }
    if (s.crouch) return { clip: crouchMove ? 'Rifle Crouch Walk' : 'Rifle Kneel' };
    return { clip: { idle: 'Rifle Idle', walk: 'Rifle Walk', run: 'Rifle Run', back: 'Rifle Walk Backward', side: 'Rifle Run' }[m] };
  }
  if (w === 'pistol') {
    // tireur d'élite au pistolet : même caméra et même principe que le fusil (le recul est fait par le jeu)
    if (s.sniper && m === 'idle' && !s.crouch) return { clip: 'Pistol Aim Sniper' };
    if (s.crouch) return { clip: tir ? 'Pistol Kneel Tir' : 'Pistol Kneel' };
    // pas de côté : 'Pistol Strafe' va vers la gauche, 'Pistol Strafe Right' (miroir du bas du corps) vers la droite
    const base = { idle: 'Pistol Idle', walk: 'Pistol Walk', run: 'Pistol Run', back: 'Pistol Walk Backward',
                   side: s.side === 'left' ? 'Pistol Strafe' : 'Pistol Strafe Right' }[m];
    return { clip: tir ? base + ' Tir' : base };
  }
  // mains nues : groupe Idle, Walk, Run, Walk Backward, Run Backward, Strafe Left, Strafe Right
  if (s.crouch) return { clip: 'Crouch Idle' };
  const back = s.running ? 'Run Backward' : 'Walk Backward';
  const side = s.side === 'left' ? 'Strafe Left' : 'Strafe Right';
  return { clip: { idle: 'Idle', walk: 'Walk', run: 'Run', back, side }[m] };
}

// Animations d'arrêt et de visée : les passer d'une à l'autre (ou y arriver depuis un déplacement) doit être progressif
export const SOFT = new Set(['Idle', 'Rifle Idle', 'Pistol Idle', 'Pistol Idle Tir', 'Rifle Aim', 'Rifle Aim Sniper', 'Pistol Aim Sniper',
                      'Rifle Kneel', 'Rifle Kneel Tir', 'Pistol Kneel', 'Pistol Kneel Tir', 'Crouch Idle']);

export const ANIM_SPEED = 1.2;       // toutes les animations (hors combat, déjà accélérées) sont jouées 20 % plus vite : jeu plus nerveux
export const FADE_SOFT = 0.3, FADE_FAST = 0.1;

/** Durée du fondu (secondes) entre deux animations : 0,3 s autour de l'arrêt et de la visée, 0,1 s entre deux déplacements. */
export function fadeTime(from, to) {
  return SOFT.has(from) || SOFT.has(to) ? FADE_SOFT : FADE_FAST;
}

// Vitesse de lecture des animations de combat : les originales sont lentes pour un jeu d'action (1,3 à 3,2 s par coup).
// Avec ces vitesses, chaque coup dure entre 0,8 et 1,4 s. Les autres animations restent à vitesse normale.
const SPEED = {
  'Melee Punch': 1.6, 'Punch': 1.6,
  'Cross Punch': 2.0, 'Elbow Punch': 2.0, 'Kick': 2.0, 'Side Kick': 2.0,
  'Pistol Whip': 2.2,
  'Rifle Reload': 1.6, 'Pistol Reload': 1.9,       // recharge : 4,2 s à vitesse normale, trop long en plein combat (2,6 s et 2,2 s)
};

/** Vitesse supplémentaire du joueur (Player.animBoost) : seulement pour les déplacements et les actions. Les animations d'arrêt et de visée (respiration, balancement) restent à leur vitesse : accélérées, elles font trembler le personnage. */
export const boostFor = (name, boost) => (SOFT.has(name) ? 1 : boost);

/** Vitesse de lecture d'une animation (1 = normale). Les animations de combat ont leur propre vitesse (leur moment d'impact en dépend, voir combat.js). */
export function clipSpeed(name) {
  return SPEED[name] ?? ANIM_SPEED;
}

/** Arme suivante : fusil, pistolet, mains nues, puis fusil. */
export function nextWeapon(w) {
  return w === 'rifle' ? 'pistol' : w === 'pistol' ? 'none' : 'rifle';
}
