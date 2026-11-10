// Combo de combat : chaque appui sur X (clavier) ou Triangle (manette) enchaîne l'attaque suivante (poings, coudes, coups de pied : toutes les animations).
// Un appui pendant une attaque est mis en attente (une seule) et part dès qu'elle se termine.
// Sans nouvel appui pendant `windowS` secondes après la fin d'une attaque, le combo repart du début.
// Changer d'arme remet aussi le combo au début.
export const COMBOS = {
  // Triangle (manette) / X (clavier) : toutes les animations de combat à la suite, celle de l'arme tenue en premier
  none:   ['Punch', 'Cross Punch', 'Elbow Punch', 'Melee Punch', 'Kick', 'Side Kick'],
  rifle:  ['Melee Punch', 'Punch', 'Cross Punch', 'Elbow Punch', 'Kick', 'Side Kick'],
  pistol: ['Pistol Whip', 'Punch', 'Cross Punch', 'Elbow Punch', 'Kick', 'Side Kick'],
  kick:   ['Kick', 'Side Kick'],          // Triangle (manette) / F (clavier) : coups de pied, quelle que soit l'arme
};

export class Combo {
  constructor(windowS = 0.9) {
    this.windowS = windowS;
    this.index = 0;
    this.lastEnd = -Infinity;
    this.queued = false;
    this.weapon = null;
  }

  _next(weapon, now) {
    if (weapon !== this.weapon || now - this.lastEnd > this.windowS) this.index = 0;
    this.weapon = weapon;
    const list = COMBOS[weapon] || COMBOS.none;
    return list[this.index++ % list.length];
  }

  /** Appui sur la touche. playing : une attaque du combo est en cours. Retourne l'animation à lancer, ou null (mise en attente). */
  press(weapon, playing, now) {
    if (playing) { this.queued = true; return null; }
    return this._next(weapon, now);
  }

  /** L'attaque en cours vient de se terminer. Retourne l'animation suivante si un appui était en attente, sinon null. */
  finished(now) {
    this.lastEnd = now;
    if (!this.queued) return null;
    this.queued = false;
    return this._next(this.weapon, now);
  }
}
