// Qualité adaptative (logique pure, testée sans navigateur) : le jeu surveille sa propre fluidité et, si l'ordinateur n'arrive pas à tenir environ 50 images par seconde,
// baisse la qualité par paliers (résolution de l'image, puis ombres moins fines, puis plus d'ombres) jusqu'à ce que ce soit fluide. Si la machine a de la marge pendant longtemps,
// il remonte d'un cran, avec prudence (jamais en boucle : un essai raté bloque les remontées pendant 3 minutes). Et si une baisse de qualité ne rend presque pas plus fluide (le goulot est le processeur, pas l'image),
// il la annule et arrête de dégrader pendant 5 minutes : inutile d'enlaidir le jeu pour rien.

/** Les paliers : scale = facteur sur la résolution de l'image, shadow = facteur sur la taille de la carte d'ombre (0 = pas d'ombre). */
export const QUALITY_LEVELS = [
  { name: 'maximum', scale: 1, shadow: 1 },
  { name: 'élevée', scale: 0.85, shadow: 1 },
  { name: 'moyenne', scale: 0.7, shadow: 0.5 },
  { name: 'économique', scale: 0.55, shadow: 0 },
];

export class PerfGovernor {
  /** slowMs : durée d'image médiane au-delà de laquelle c'est « pas fluide » (20 ms = 50 images/s) ; goodMs : en dessous, il y a de la marge (17,6 ms = 57 images/s, l'écran à 60 Hz plafonne ici) ;
   *  window : durée d'une mesure (s) ; cooldown : délai minimum entre deux baisses (s) ; levels : nombre de paliers. */
  constructor({ slowMs = 20, goodMs = 17.6, window = 2.5, cooldown = 4, levels = QUALITY_LEVELS.length, warmup = 6 } = {}) {
    Object.assign(this, { slowMs, goodMs, window, cooldown, levels, warmup });
    this.level = 0; this.t = 0; this.samples = []; this.sum = 0;
    this.lastChange = -1e9; this.goodRun = 0; this.upBlockedUntil = 0; this.lastUp = -1e9; this.noDownUntil = 0; this.trial = null;
  }

  /** Une image de `dt` secondes vient d'être dessinée. Renvoie le nouveau palier s'il change, sinon null. Les images très longues (onglet caché, pause) sont ignorées. */
  push(dt) {
    if (!(dt > 0) || dt > 0.25) return null;
    this.t += dt;
    if (this.t < this.warmup) return null;                                      // les premières secondes (compilation des shaders, chargement des textures) ne comptent pas
    this.samples.push(dt); this.sum += dt;
    if (this.sum < this.window) return null;
    const sorted = [...this.samples].sort((a, b) => a - b), median = sorted[sorted.length >> 1] * 1000;
    this.samples = []; this.sum = 0;
    if (this.trial) {                                                           // on vient de baisser la qualité : est-ce que ça a servi ?
      const { before, from } = this.trial; this.trial = null;
      if (median > before * 0.93) {                                              // à peine plus fluide : le ralentissement ne vient pas de l'image (processeur, trop de personnages...) : inutile de dégrader
        this.level = from; this.lastChange = this.t; this.noDownUntil = this.t + 300; this.goodRun = 0;
        return this.level;
      }
    }
    if (median > this.slowMs) {
      this.goodRun = 0;
      if (this.level < this.levels - 1 && this.t - this.lastChange >= this.cooldown && this.t >= this.noDownUntil) {
        if (this.t - this.lastUp < 12) this.upBlockedUntil = this.t + 180;           // on vient de remonter et c'est déjà trop lent : on arrête d'essayer
        this.trial = { before: median, from: this.level };
        this.level++; this.lastChange = this.t; return this.level;
      }
      return null;
    }
    if (median <= this.goodMs) {
      this.goodRun++;
      if (this.goodRun >= 8 && this.level > 0 && this.t >= this.upBlockedUntil && this.t - this.lastChange >= 40) {          // 20 s de marge de suite
        this.level--; this.lastChange = this.t; this.lastUp = this.t; this.goodRun = 0; return this.level;
      }
    } else this.goodRun = 0;
    return null;
  }
}
