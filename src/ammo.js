// Munitions : un chargeur par arme (fusil, pistolet). Quand il est vide, le personnage recharge (animation de recharge) ;
// pendant la recharge on ne peut pas tirer. Logique pure, testée sans navigateur.
export const MAG_SIZE = { rifle: 50, pistol: 12 };           // chargeur du fusil : 50 balles (30 au début)
export const RELOAD_CLIP = { rifle: 'Rifle Reload', pistol: 'Pistol Reload' };

export class Ammo {
  constructor(sizes = MAG_SIZE) {
    this.size = { ...sizes };
    this.mag = { ...sizes };                  // balles restantes dans chaque chargeur
    this.reloading = null;                    // { weapon, t, dur } pendant une recharge
  }
  uses(w) { return w in this.size; }          // les mains nues n'ont pas de munitions
  left(w) { return this.uses(w) ? this.mag[w] : 0; }
  /** Peut-il tirer maintenant ? (arme à feu, chargeur non vide, pas en recharge) */
  canFire(w) { return this.uses(w) && !this.reloading && this.mag[w] > 0; }
  /** Une balle part. Renvoie faux si le tir est impossible. */
  fire(w) {
    if (!this.canFire(w)) return false;
    this.mag[w]--;
    return true;
  }
  /** Y a-t-il quelque chose à recharger ? (chargeur entamé, pas déjà en recharge) */
  needsReload(w) { return this.uses(w) && !this.reloading && this.mag[w] < this.size[w]; }
  /** Début de recharge ; dur = durée de l'animation (s), sert de sécurité si l'animation est interrompue. */
  startReload(w, dur) {
    if (!this.needsReload(w)) return false;
    this.reloading = { weapon: w, t: 0, dur };
    return true;
  }
  /** Fin de l'animation : le chargeur est plein. Renvoie l'arme rechargée (ou null). */
  finishReload() {
    const r = this.reloading;
    if (!r) return null;
    this.mag[r.weapon] = this.size[r.weapon];
    this.reloading = null;
    return r.weapon;
  }
  cancel() { this.reloading = null; }
  refillAll() { this.mag = { ...this.size }; this.reloading = null; }
  /** Sécurité : si l'animation n'a pas prévenu de sa fin (interrompue), la recharge se termine un peu après sa durée normale. */
  update(dt) {
    const r = this.reloading;
    if (!r) return null;
    r.t += dt;
    return r.t >= r.dur + 0.5 ? this.finishReload() : null;
  }
}
