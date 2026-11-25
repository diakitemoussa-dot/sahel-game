// Fumées de champ de bataille : logique pure (testée sans navigateur).
//  - columnLook / fireLook : taille, opacité, teinte d'une particule de fumée ou de flamme selon son âge (0 = naissance, 1 = disparition) ;
//  - siteRate : combien de particules émet un foyer, selon son intensité et sa distance (les foyers lointains coûtent moins) ;
//  - StrikeScheduler / pickStrike : quand un missile tombe et où (loin du joueur, de préférence dans son champ de vision).

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Fumée : naît petite et chaude (lueur orange au pied de la colonne), grossit en s'élevant, s'éclaircit, puis s'efface doucement.
 *  s0, s1 : taille au départ et à la fin (m) ; a0 : opacité maximale. Renvoie { size, alpha, heat, light } ; light = 0 noir, 1 gris clair. */
export function columnLook(age, s0, s1, a0) {
  const a = clamp01(age);
  const size = s0 + (s1 - s0) * Math.pow(a, 0.72);
  const alpha = a0 * smooth(0, 0.07, a) * (1 - smooth(0.6, 1, a));
  const heat = Math.pow(1 - smooth(0, 0.13, a), 1.5);                       // la lueur orange ne dure que le premier cinquième de la montée
  const light = smooth(0.05, 0.85, a);
  return { size, alpha, heat, light };
}

/** Flamme : vive au début, rétrécit et s'éteint ; heat 1 = blanc-jaune, 0 = rouge sombre. */
export function fireLook(age, s0, a0) {
  const a = clamp01(age);
  return { size: s0 * (1 - 0.55 * a), alpha: a0 * smooth(0, 0.08, a) * Math.pow(1 - a, 1.1), heat: 1 - a * 0.85 };
}

/** Nombre de particules par seconde d'un foyer. rate : cadence de base à portée normale ; au-delà de 260 m la cadence diminue, au-delà de 520 m elle est nulle. */
export function siteRate(rate, intensity, dist) {
  if (!(intensity > 0)) return 0;
  const lod = 1 - smooth(260, 520, dist) * 0.8;
  return dist > 520 ? 0 : rate * intensity * lod;
}

/** Intensité d'un foyer temporaire (point d'impact d'un missile) : il brûle fort puis faiblit jusqu'à s'éteindre. t = temps écoulé, life = durée totale. */
export function fadeIntensity(t, life) {
  if (t >= life) return 0;
  return smooth(0, 3, t) * (1 - smooth(life * 0.55, life, t));
}

/** Quand un missile tombe : un premier après `first` secondes, puis un toutes les min..max secondes (hasard rng()). */
export class StrikeScheduler {
  constructor({ first = 14, min = 28, max = 55, rng = Math.random } = {}) { this.min = min; this.max = max; this.rng = rng; this.left = first; }
  /** Renvoie vrai quand c'est l'heure d'une frappe (puis programme la suivante). */
  update(dt) {
    this.left -= dt;
    if (this.left > 0) return false;
    this.left = this.min + this.rng() * (this.max - this.min);
    return true;
  }
}

/** Un foyer qui s'allume (ou s'éteint) : l'intensité rejoint la cible au rythme `rate` par seconde (1 / rate secondes de zéro à plein). */
export function rampIntensity(cur, target, dt, rate = 0.12) {
  if (cur === target) return cur;
  const step = rate * dt;
  return cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
}

/** Choisit où tombe un missile : un foyer ni trop près ni trop loin du joueur, de préférence devant lui (pour qu'il le voie).
 *  sites : [{ x, z }] ; player : { x, z } ; heading : direction du regard (avant = (sin h, cos h)). Renvoie le point d'impact { x, z } ou null. */
export function pickStrike(sites, player, heading, rng = Math.random, { minD = 70, maxD = 280, spread = 16 } = {}) {
  const fwd = { x: Math.sin(heading), z: Math.cos(heading) };
  const cand = [];
  for (const s of sites) {
    const dx = s.x - player.x, dz = s.z - player.z, d = Math.hypot(dx, dz);
    if (d < minD || d > maxD) continue;
    const front = (dx * fwd.x + dz * fwd.z) / d > 0.35;                      // dans un cône d'environ ±70°
    cand.push({ s, w: front ? 4 : 1 });
  }
  if (!cand.length) return null;
  let r = rng() * cand.reduce((a, c) => a + c.w, 0);
  let pick = cand[cand.length - 1].s;
  for (const c of cand) { r -= c.w; if (r <= 0) { pick = c.s; break; } }
  const ang = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * spread;         // le missile ne tombe pas pile sur le foyer
  return { x: pick.x + Math.cos(ang) * rad, z: pick.z + Math.sin(ang) * rad };
}

/** Trajectoire du missile : k de 0 (départ) à 1 (impact). Descend de plus en plus raide ; renvoie { x, y, z } ; from, to : { x, y, z }. */
export function missilePath(from, to, k) {
  const u = clamp01(k);
  const drop = Math.pow(u, 1.6);                                            // la hauteur se perd surtout vers la fin
  return { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * drop, z: from.z + (to.z - from.z) * u };
}
