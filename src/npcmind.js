// L'esprit d'un PNJ (logique pure, testée sans navigateur) : ce qui le fait réfléchir, hésiter et choisir comme une vraie personne.
// Par-dessus le cerveau de combat (npcbrain.js), il ajoute :
//  - une PERSONNALITÉ propre à chaque PNJ (courage, agressivité, prudence, esprit d'équipe) : deux PNJ face à la même situation ne font pas le même choix ;
//  - un MORAL qui baisse quand il est touché, qu'on lui tire dessus, qu'un camarade tombe ou qu'il est en infériorité, et remonte quand il est à l'abri ou quand il gagne ;
//  - une MÉMOIRE : où il a vu l'adversaire en dernier, dans quelle direction il allait, d'où on lui a tiré dessus ;
//  - une DÉLIBÉRATION : toutes les ~0,5 s il pèse ses options (foncer, couvrir, contourner, se replier, fuir, attendre en embuscade) et choisit la meilleure,
//    sans changer d'avis à chaque image (il garde son choix un minimum de temps) ;
//  - une PENSÉE lisible (« Je le contourne par la gauche ») affichée au-dessus de sa tête.
// Coordonnées du plan (x, z) de three.js.
import { mulberry32 } from './combat.js';

export const PLANS = ['advance', 'suppress', 'flank', 'fallback', 'flee', 'hold'];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/** Les phrases qu'un PNJ « pense » selon son plan. */
export const THOUGHTS = {
  advance: ['Je fonce, il ne tiendra pas !', 'On le prend de front.', 'Pas le temps de traîner.'],
  suppress: ['Je le cloue au sol.', 'Je tiens la position.', 'Je couvre mes camarades.'],
  flank_left: ['Je le contourne par la gauche.', 'Je passe sur son flanc gauche.'],
  flank_right: ['Je le contourne par la droite.', 'Je passe sur son flanc droit.'],
  fallback: ['Trop chaud ici, je recule.', 'Je me replie sous couverture.', 'Je change de position.'],
  flee: ['À l’aide ! Je me replie !', 'Je ne peux pas tenir !', 'Je file, je file !'],
  hold: ['J’attends dans l’ombre.', 'Je reste caché, il va se montrer.', 'Patience…'],
  contact: ['Contact !', 'Je l’ai vu !', 'Ennemi en vue !'],
  noise: ['Qu’est-ce que c’était ?', 'J’ai entendu quelque chose…', 'Qui va là ?'],
  help: ['Il est là-bas !', 'Par ici, vite !', 'Ils sont là, tous avec moi !'],
  ally_down: ['Un des nôtres est tombé !', 'Ils l’ont eu !'],
  search: ['Où est-il passé ?', 'Il ne peut pas être loin.'],
};

export class Mind {
  constructor({ seed = 1, team = 'enemy', traits = null } = {}) {
    this.rng = mulberry32(seed * 7919 + 13);
    const r = () => this.rng();
    // chaque PNJ a son caractère (entre 0 et 1) ; les alliés sont un peu plus braves et disciplinés
    this.traits = traits ?? {
      courage: clamp(0.3 + r() * 0.6 + (team === 'ally' ? 0.1 : 0)),
      aggression: clamp(0.25 + r() * 0.65),
      caution: clamp(0.15 + r() * 0.7),
      teamwork: clamp(0.35 + r() * 0.6 + (team === 'ally' ? 0.1 : 0)),
    };
    this.team = team;
    this.morale = 1;
    this.plan = 'suppress'; this.planAge = 0; this.thinkIn = 0;
    this.thought = ''; this.thoughtAge = 99;
    this.memory = { seen: null, vel: { x: 0, z: 0 }, lostFor: 0, shotFrom: null, hits: 0, downs: 0 };
    this.flank = null;                                     // { x, z, side, until }
    this.lastScores = {};
    this.reaction = 0.35 + (1 - this.traits.caution) * 0.15 + r() * 0.2;       // « temps de réflexion » entre deux délibérations
  }

  // ------------------------------------------------------------------ ce qui lui arrive
  say(kind) {
    const list = THOUGHTS[kind]; if (!list) return;
    this.thought = list[Math.floor(this.rng() * list.length)]; this.thoughtAge = 0;
  }

  /** Il est touché : dégâts en points de vie. Le moral baisse plus vite chez les peureux. */
  onHit(dmg = 10, from = null) {
    this.morale = clamp(this.morale - (0.05 + dmg / 220) * (1.25 - this.traits.courage));
    this.memory.hits++;
    if (from) this.memory.shotFrom = { x: from.x, z: from.z };
  }

  /** Une balle le frôle. */
  onNearMiss(from = null) {
    this.morale = clamp(this.morale - 0.025 * (1.1 - this.traits.courage));
    if (from) this.memory.shotFrom = { x: from.x, z: from.z };
  }

  /** Un camarade est tombé à `dist` mètres. */
  onAllyDown(dist = 20) {
    this.memory.downs++;
    const near = clamp(1 - dist / 45);
    this.morale = clamp(this.morale - 0.2 * near * (1.1 - this.traits.courage * 0.7));
    if (near > 0.2) this.say('ally_down');
  }

  /** Il vient de toucher ou d'abattre un adversaire : il reprend confiance. */
  onSuccess(kill = false) { this.morale = clamp(this.morale + (kill ? 0.16 : 0.03)); }

  /** Il voit (ou croit voir) l'adversaire en `pos` ; `dt` = temps écoulé depuis la dernière observation (pour en déduire sa vitesse). */
  onSeen(pos, dt = 0.1) {
    const m = this.memory;
    if (m.seen && dt > 0 && dt < 1) {
      const k = 0.5;                                        // lissage : la vitesse estimée ne saute pas
      m.vel.x = m.vel.x * (1 - k) + ((pos.x - m.seen.x) / dt) * k;
      m.vel.z = m.vel.z * (1 - k) + ((pos.z - m.seen.z) / dt) * k;
    }
    m.seen = { x: pos.x, z: pos.z }; m.lostFor = 0;
  }

  /** Où il pense retrouver l'adversaire qu'il a perdu de vue : sa dernière position, prolongée dans la direction où il allait (au plus 4 s). */
  predicted() {
    const m = this.memory;
    if (!m.seen) return null;
    const t = Math.min(m.lostFor, 4), sp = Math.hypot(m.vel.x, m.vel.z), cap = sp > 7 ? 7 / sp : 1;      // pas plus vite qu'un sprint
    return { x: m.seen.x + m.vel.x * cap * t, z: m.seen.z + m.vel.z * cap * t };
  }

  // ------------------------------------------------------------------ moral
  /** Moral effectif : le moral de fond, entamé par les blessures. */
  effectiveMorale(hpFrac = 1) { return clamp(this.morale * (0.55 + 0.45 * clamp(hpFrac))); }

  /** Faire passer le temps. calm : il n'est ni touché ni visé ; safe : il est loin de l'adversaire ou à couvert. */
  tick(dt, { calm = false, safe = false, friends = 0, sees = false } = {}) {
    this.planAge += dt; this.thoughtAge += dt; this.thinkIn -= dt;
    if (this.memory.seen && !sees) this.memory.lostFor += dt;
    let regen = 0.004 + (friends >= 2 ? 0.006 : 0);
    if (calm) regen += 0.025;
    if (safe) regen += 0.02 * (0.5 + this.traits.courage);
    this.morale = clamp(this.morale + regen * dt);
  }

  // ------------------------------------------------------------------ délibération
  /** Pèse les options et renvoie le plan retenu. s : situation
   *  { dist (m, jusqu'à l'adversaire), sees, hpFrac, friends (camarades vivants proches), foes (adversaires visibles), role ('suppress' | 'flank' | 'solo'),
   *    canFlank, hasCover, inCover }. Le plan courant reçoit un bonus (il ne change pas d'avis sans raison) et dure au moins 1,5 s. */
  decide(s) {
    if (this.thinkIn > 0) return this.plan;
    this.thinkIn = this.reaction * (0.8 + this.rng() * 0.5);
    const t = this.traits, m = this.effectiveMorale(s.hpFrac), dist = s.dist ?? 15;
    const outnumbered = (s.foes ?? 1) > (s.friends ?? 0) + 1;
    const sc = {
      advance: t.aggression * clamp((m - 0.28) / 0.6) * (dist > 8 ? 1 : 0.5) * (outnumbered ? 0.55 : 1) * (s.sees ? 1 : 0.7),
      suppress: 0.34 + (s.role === 'suppress' ? 0.3 + 0.2 * t.teamwork : 0) + (s.inCover ? 0.12 : 0),
      flank: s.canFlank && s.role === 'flank' && dist > 9 ? 0.5 + 0.4 * t.teamwork + 0.1 * t.caution : 0,
      fallback: clamp((0.52 - m) * 2.2) * (1.15 - t.courage * 0.55) + (s.hpFrac < 0.25 ? 0.25 : 0) + (outnumbered && m < 0.7 ? 0.15 : 0),
      flee: m < 0.17 ? 1.0 + (0.17 - m) * 4 : 0,                  // panique : l'emporte sur tout le reste
      hold: t.caution * 0.32 + (s.sees ? 0 : 0.28 * t.caution) + (s.inCover && m < 0.7 ? 0.1 : 0),
    };
    if (!s.sees && sc.advance > 0) sc.advance *= 0.8;
    if (sc[this.plan] !== undefined && this.planAge < 1.5) sc[this.plan] += 0.5;      // il garde son choix un minimum de temps
    else if (sc[this.plan] !== undefined) sc[this.plan] += 0.12;
    let best = this.plan, bv = -1;
    for (const k of PLANS) if (sc[k] > bv) { bv = sc[k]; best = k; }
    this.lastScores = sc;
    if (best !== this.plan) this.setPlan(best, s);
    return this.plan;
  }

  setPlan(plan, s = {}) {
    this.plan = plan; this.planAge = 0;
    if (plan === 'flank') this.say(s.flankSide < 0 ? 'flank_left' : 'flank_right');
    else this.say(plan);
  }
}
