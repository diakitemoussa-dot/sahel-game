// Filtre de manette. Une manette connectée mais posée sur le bureau peut annoncer un axe bloqué (ex. stick à -1)
// ou un bouton enfoncé : sans filtre, le joueur courrait tout seul. Règles :
//  - la manette n'est utilisée qu'après un vrai geste (bouton, ou stick poussé de plus de 0,4) ;
//  - un axe déjà à plus de 0,5 à la connexion est ignoré jusqu'à ce qu'il revienne au neutre (moins de 0,3) :
//    un axe réellement bloqué ne revient jamais, un stick simplement tenu à la détection est utilisable dès qu'on le relâche ;
//  - un bouton déjà enfoncé (ou à une valeur parasite) à la connexion est ignoré jusqu'à ce qu'il soit relâché.
const DEAD = 0.15;

export class PadFilter {
  constructor() { this._reset(); }

  _reset() { this.first = true; this.stuckAxes = new Set(); this.stuck = new Set(); this.active = false; }

  /** pad : { axes: number[], buttons: {pressed, value}[] } ou null. Retourne null tant que la manette n'a pas servi,
   *  sinon { axes: [4 valeurs filtrées], buttons: [{pressed, value}] }. */
  read(pad) {
    if (!pad) { this._reset(); return null; }
    if (this.first) {
      this.first = false;
      [0, 1, 2, 3].forEach((i) => { if (Math.abs(pad.axes[i] || 0) > 0.5) this.stuckAxes.add(i); });
      pad.buttons.forEach((b, i) => { if (b && (b.pressed || b.value > 0.2)) this.stuck.add(i); });   // même une valeur parasite
    }
    const axes = [0, 1, 2, 3].map((i) => {
      const v = pad.axes[i] || 0;
      if (this.stuckAxes.has(i)) { if (Math.abs(v) < 0.3) this.stuckAxes.delete(i); return 0; }
      return Math.abs(v) < DEAD ? 0 : v;
    });
    const buttons = pad.buttons.map((b, i) => {
      if (this.stuck.has(i)) { if (!b || (!b.pressed && b.value < 0.1)) this.stuck.delete(i); return { pressed: false, value: 0 }; }
      return { pressed: !!b?.pressed, value: b?.value ?? 0 };
    });
    if (!this.active && (buttons.some((b) => b.pressed) || axes.some((a) => Math.abs(a) > 0.4))) this.active = true;
    return this.active ? { axes, buttons } : null;
  }
}

// Boutons de la disposition standard (Xbox / PlayStation) : A=Croix, B=Rond, Y=Triangle, L1=LB, L3=stick gauche enfoncé
export const PAD = { A: 0, B: 1, SQUARE: 2, TRIANGLE: 3, LT: 6, RT: 7, L1: 4, R1: 5, L3: 10, SELECT: 8, R3: 11, TOUCHPAD: 17, DPAD_LEFT: 14, DPAD_RIGHT: 15 };

/** Traduit l'état filtré d'une manette en commandes de jeu.
 *  prev : boutons enfoncés à l'image précédente (tableau de booléens), pour détecter les nouveaux appuis. */
export function padCommands(pad, prev = []) {
  const down = (i) => !!pad.buttons[i]?.pressed;
  const edge = (i) => down(i) && !prev[i];
  return {
    moveX: pad.axes[0], moveY: 0 - pad.axes[1],                 // stick vers le haut = avancer
    lookX: pad.axes[2], lookY: pad.axes[3],
    fire: (pad.buttons[PAD.RT]?.value ?? 0) > 0.5,              // gâchette droite
    aim: false,                                                 // plus de bouton « viser » séparé sur la manette
    sniper: (pad.buttons[PAD.LT]?.value ?? 0) > 0.5,            // L2 : tireur d'élite tant qu'elle est enfoncée
    sprint: down(PAD.L3),                                       // stick gauche enfoncé
    jump: edge(PAD.A),
    crouchToggle: edge(PAD.B),
    toggleWeapon: edge(PAD.L1),                                 // L1 : fusil, pistolet, mains nues, fusil...
    combo: edge(PAD.TRIANGLE),                                  // Triangle (Y sur une manette Xbox) : enchaîne TOUTES les animations de combat (poings, coudes, coups de pied)
    interact: edge(PAD.R1),                                     // R1 : monter dans un véhicule / en descendre
    reload: edge(PAD.SQUARE),                                   // Carré (X sur une manette Xbox) : recharge l'arme
    kick: false,                                                // plus de bouton « coup de pied » séparé sur la manette (F au clavier)
    // menu des tenues : Select / Partager / Créer, ou R3 (stick droit enfoncé), ou le pavé tactile de la PlayStation
    // (Windows et Steam capturent parfois le bouton Partager pour les captures d'écran : le jeu ne le reçoit alors pas)
    wardrobe: edge(PAD.SELECT) || edge(PAD.R3) || edge(PAD.TOUCHPAD),
    menuLeft: edge(PAD.DPAD_LEFT), menuRight: edge(PAD.DPAD_RIGHT),   // croix directionnelle : choisir dans le menu
    pressedNow: pad.buttons.map((b) => !!b?.pressed),
  };
}

/** Gère toutes les manettes connectées : une par index, on utilise la première qui sert vraiment. */
export class PadHub {
  constructor() { this.filters = new Map(); }

  /** pads : manettes connectées { index, id, axes, buttons }. Retourne { pad (ou null), status (une ligne par manette) }. */
  read(pads) {
    const seen = new Set();
    const status = [];
    let chosen = null;
    for (const p of pads) {
      seen.add(p.index);
      if (!this.filters.has(p.index)) this.filters.set(p.index, new PadFilter());
      const r = this.filters.get(p.index).read(p);
      status.push(`${String(p.id).slice(0, 28)} : ${r ? 'utilisée' : "en attente d'un geste"}`);
      if (r && !chosen) chosen = r;
    }
    for (const k of [...this.filters.keys()]) if (!seen.has(k)) this.filters.delete(k);     // débranchée : on repartira de zéro
    return { pad: chosen, status };
  }
}

/** Navigation dans les menus à la manette : croix directionnelle ou stick gauche = haut/bas/gauche/droite (répétés si on les tient),
 *  A = valider, B = retour, Start = pause/passer, Carré = son. Ne renvoie que les nouveaux appuis (une fois par appui). */
export class PadNav {
  constructor({ delay = 420, every = 120 } = {}) { this.delay = delay; this.every = every; this.reset(); }
  reset() { this.prev = {}; this.nextAt = {}; }
  /** pad : état filtré (voir PadFilter) ou null ; now : temps en ms. */
  update(pad, now) {
    const out = { up: false, down: false, left: false, right: false, ok: false, back: false, start: false, square: false };
    if (!pad) { this.reset(); return out; }
    const b = (i) => !!pad.buttons[i]?.pressed;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const cur = { up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6,
      ok: b(0), back: b(1), start: b(9), square: b(2) };
    for (const k of Object.keys(out)) {
      if (cur[k] && !this.prev[k]) { out[k] = true; this.nextAt[k] = now + this.delay; }
      else if (cur[k] && ['up', 'down', 'left', 'right'].includes(k) && now >= this.nextAt[k]) { out[k] = true; this.nextAt[k] = now + this.every; }
    }
    this.prev = cur;
    return out;
  }
}
