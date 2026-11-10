// Avions de chasse et hélicoptères : logique pure (testée sans navigateur).
//  - orbitPose : position et cap d'un hélicoptère qui tourne en rond au-dessus de la carte ;
//  - planPass / passPosition : un passage d'avions de chasse qui traverse le ciel devant le joueur ;
//  - dopplerRatio : le son d'un avion qui s'approche est plus aigu, celui qui s'éloigne plus grave.
// Repère du jeu : avant = (sin yaw, cos yaw) ; y vers le haut.

const lerp = (a, b, t) => a + (b - a) * t;

/** Orbite : { cx, cz (centre), radius, alt (hauteur au-dessus de base), speed (m/s), dir (+1 ou -1), phase }. t en secondes.
 *  Renvoie { x, y, z, yaw, bank, vx, vz } ; bank : inclinaison vers le centre du cercle (positive = penché à droite). */
export function orbitPose(o, t) {
  const dir = o.dir ?? 1, w = dir * o.speed / o.radius, a = (o.phase ?? 0) + w * t;
  const fx = -Math.sin(a) * dir, fz = Math.cos(a) * dir;                    // direction de marche (tangente au cercle)
  return {
    x: o.cx + Math.cos(a) * o.radius, y: o.alt + Math.sin(t * 0.5 + (o.phase ?? 0)) * 1.2, z: o.cz + Math.sin(a) * o.radius,
    yaw: Math.atan2(fx, fz), bank: 0.22 * dir, vx: fx * o.speed, vz: fz * o.speed,
  };
}

/** Passage d'avions de chasse : traverse le ciel d'un côté à l'autre, à ~170 m devant le joueur, de gauche à droite ou l'inverse.
 *  player : { x, z } ; heading : regard du joueur. Renvoie { from, to, dir (unitaire), alt (m), speed (m/s), dur (s) } (from/to : { x, z }). */
export function planPass(player, heading, rng = Math.random, { ahead = 170, side = 70, alt = [85, 135], speed = [140, 170], half = 650 } = {}) {
  const fwd = { x: Math.sin(heading), z: Math.cos(heading) };
  const right = { x: -fwd.z, z: fwd.x };
  const sgn = rng() < 0.5 ? -1 : 1;
  const dir = { x: right.x * sgn, z: right.z * sgn };
  const d = ahead + (rng() - 0.5) * 80, lat = (rng() - 0.5) * 2 * side;
  const mid = { x: player.x + fwd.x * d + right.x * lat, z: player.z + fwd.z * d + right.z * lat };
  const sp = lerp(speed[0], speed[1], rng());
  return { from: { x: mid.x - dir.x * half, z: mid.z - dir.z * half }, to: { x: mid.x + dir.x * half, z: mid.z + dir.z * half },
           dir, alt: lerp(alt[0], alt[1], rng()), speed: sp, dur: (2 * half) / sp };
}

/** Position de l'avion de tête à l'instant t (s) après le début du passage ; done = le passage est terminé. */
export function passPosition(pass, t) {
  const u = Math.max(0, Math.min(1, t / pass.dur));
  return { x: lerp(pass.from.x, pass.to.x, u), z: lerp(pass.from.z, pass.to.z, u), done: t >= pass.dur };
}

/** Rapport de fréquence d'un son dont la source s'éloigne (vitesse radiale > 0) ou s'approche (< 0) de l'auditeur. */
export function dopplerRatio(radialSpeed, c = 340) {
  return c / (c + Math.max(-0.8 * c, Math.min(0.8 * c, radialSpeed)));
}

/** Vitesse radiale de la source par rapport à l'auditeur (positive si elle s'éloigne). pos, vel, listener : { x, z } (vel en m/s). */
export function radialSpeed(pos, vel, listener) {
  const dx = pos.x - listener.x, dz = pos.z - listener.z, d = Math.hypot(dx, dz);
  return d < 1e-3 ? 0 : (vel.x * dx + vel.z * dz) / d;
}
