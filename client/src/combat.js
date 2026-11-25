// Règles de combat (logique pure, testée sans navigateur) : points de vie, dégâts, tir contre un personnage, obstacles, précision.
// Repère : celui de three.js. Un personnage est un cylindre { x, z, r, y0, y1 } (rayon r, du sol y0 à la tête y1).
import { pushOut } from './colliders.js';

/** Générateur pseudo-aléatoire à graine (les tests de combat sont reproductibles). */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Dégâts infligés PAR le joueur (un PNJ a 100 points de vie : 4 balles de fusil, 7 de pistolet, 4 coups de poing, 4 coups de pied)
export const PLAYER_DAMAGE = { rifle: 25, pistol: 15, headshot: 2,
  'Melee Punch': 20, 'Punch': 15, 'Cross Punch': 20, 'Elbow Punch': 20, 'Kick': 30, 'Side Kick': 30, 'Pistol Whip': 20 };
// Moment (s après le début de l'animation) où le coup touche
export const MELEE_DELAY = { 'Melee Punch': 0.35, 'Punch': 0.30, 'Cross Punch': 0.30, 'Elbow Punch': 0.30, 'Kick': 0.30, 'Side Kick': 0.35, 'Pistol Whip': 0.35 };
// Dégâts infligés PAR un PNJ au joueur (100 points de vie : 20 balles ou 9 coups)
export const NPC_DAMAGE = { rifle: 5, melee: 12 };
// Dégâts infligés PAR un allié à un milicien (100 points de vie : 10 balles, ou 7 coups)
export const ALLY_DAMAGE = { rifle: 10, melee: 15 };
export const ENEMY_HP = 160;                    // points de vie d'un milicien (7 balles de fusil au lieu de 4)
export const ENEMY_FIRE_GAP = 0.15;             // secondes entre deux balles d'un milicien en rafale (0,2 au début, 0,12 ensuite : un cran de moins d'intensité)
export const ENEMY_MELEE_GAP = 0.9;             // secondes entre deux attaques au corps à corps (avant 1,3)
export const MELEE_RANGE = 1.9;                 // m
export const MELEE_HALF_ANGLE = Math.PI * 0.32; // ~58° de chaque côté du regard

export class Health {
  constructor(max = 100) { this.max = max; this.hp = max; }
  get dead() { return this.hp <= 0; }
  get frac() { return this.hp / this.max; }
  /** Retire des points de vie. Renvoie { dealt, died } (died : ce coup est le coup fatal). */
  damage(n) {
    if (this.dead || n <= 0) return { dealt: 0, died: false };
    const dealt = Math.min(n, this.hp);
    this.hp -= dealt;
    return { dealt, died: this.hp <= 0 };
  }
  reset() { this.hp = this.max; }
}

/** Distance (m) à laquelle un rayon touche un personnage (cylindre vertical), ou null. o, d : { x, y, z } (d normalisé). */
export function rayCapsule(o, d, maxDist, cap) {
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return null;                    // tir à la verticale : on ignore
  const ox = o.x - cap.x, oz = o.z - cap.z;
  const b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - cap.r * cap.r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
  if (t2 < 0) return null;                      // le cylindre est entièrement derrière le tireur
  for (const t of [Math.max(0, t1), t2]) {      // t1 < 0 : le tireur est déjà dans le cylindre
    if (t < 0 || t > maxDist) continue;
    const y = o.y + d.y * t;
    if (y >= cap.y0 && y <= cap.y1) return { t, y, headshot: y > cap.y0 + (cap.y1 - cap.y0) * 0.86 };
  }
  return null;
}

/** Un obstacle (mur, tente, caisse...) coupe-t-il la ligne de (ax, az) à (bx, bz) ? Les colliders sont en repère Blender (y = -z). */
export function segmentBlocked(ax, az, bx, bz, colliders, step = 0.3) {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 1; i < n; i++) {
    const x = ax + (bx - ax) * i / n, y = -(az + (bz - az) * i / n);
    for (const c of colliders) {
      if (c.t === 'c') { if (Math.hypot(x - c.x, y - c.y) < c.r) return true; }
      else {
        const cs = Math.cos(-c.yaw), sn = Math.sin(-c.yaw), dx = x - c.x, dy = y - c.y;
        if (Math.abs(dx * cs - dy * sn) < c.hx && Math.abs(dx * sn + dy * cs) < c.hy) return true;
      }
    }
  }
  return false;
}

/** Probabilité qu'un tir de PNJ touche : baisse avec la distance et si la cible court ou est accroupie. */
export function hitChance(dist, targetSpeed, { base = 0.6, minimum = 0.08, crouched = false } = {}) {
  const p = base * Math.max(0, 1 - dist / 55) * (targetSpeed > 1.2 ? 0.55 : 1) * (crouched ? 0.65 : 1);      // une cible qui court ou qui s'accroupit est plus difficile à toucher
  return Math.max(minimum, Math.min(0.9, p));
}

/** Angle signé (-pi..pi) entre deux caps. */
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** `to` est-il à portée et dans le champ de `from` ? yaw : cap de `from` (le personnage regarde vers (sin yaw, cos yaw)). */
export function inCone(from, yaw, to, range, halfAngle) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (d < 0.3) return true;
  return Math.abs(angleDiff(Math.atan2(dx, dz), yaw)) <= halfAngle;
}

/** Un point (x, z) est-il dans un obstacle ? (utilisé pour poser un PNJ à un endroit libre) */
export function blockedAt(x, z, colliders, radius = 0.5) {
  const p = { x, y: -z };
  pushOut(p, radius, colliders);
  return Math.hypot(p.x - x, p.y + z) > 1e-6;
}
