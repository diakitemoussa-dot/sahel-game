// La guerre autour du joueur : règles pures (testées sans navigateur).
//  - WAR : cadence et taille de chaque événement de fond (combats lointains, explosions, obus, tirs d'hélicoptère) ;
//  - ringPoint : un point autour du joueur, de préférence devant lui (pour qu'il le voie) ;
//  - fightPlan : un combat lointain entre deux groupes ; strafeLine : la ligne de tir d'un hélicoptère au sol ;
//  - blastDamage : dégâts d'une explosion selon la distance.

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const pick = ([a, b], rng) => lerp(a, b, rng());

export const WAR = {
  fight: { first: 4, min: 6, max: 13, range: [100, 300], len: [28, 60], shots: [12, 30], gap: [0.07, 0.16], concurrent: 3 },     // combats entre deux groupes, au loin
  distant: { first: 10, min: 10, max: 22, range: [150, 340], maxTemp: 8 },                                                          // explosions lointaines (foyers temporaires au plus)
  shells: { first: 30, min: 34, max: 60, count: [1, 3], gap: [0.35, 0.8], range: [45, 115] },                                    // salves d'obus qui tombent plus près du joueur
  heli: { first: 12, min: 11, max: 24, range: 340, shots: [16, 30], gap: 0.075, ring: [30, 110], length: [20, 45] },            // rafales d'hélicoptère sur le sol
};

/** c : { x, z } ; heading : regard du joueur ; range : [min, max] m ; front : chance (0..1) que le point soit dans le cône de ±60° devant lui. */
export function ringPoint(c, heading, rng, range, front = 0.65) {
  const ang = rng() < front ? heading + (rng() - 0.5) * 2.1 : rng() * TAU;
  const d = pick(range, rng);
  return { x: c.x + Math.sin(ang) * d, z: c.z + Math.cos(ang) * d };
}

/** Un combat lointain : deux groupes à 28-60 m l'un de l'autre, au loin. Renvoie { a, b, shots, gap }. */
export function fightPlan(player, heading, rng, cfg = WAR.fight) {
  const a = ringPoint(player, heading, rng, cfg.range);
  const ang = rng() * TAU, len = pick(cfg.len, rng);
  return { a, b: { x: a.x + Math.sin(ang) * len, z: a.z + Math.cos(ang) * len }, shots: Math.round(pick(cfg.shots, rng)), gap: pick(cfg.gap, rng) };
}

/** Ligne de tir d'un hélicoptère : part d'un point au sol autour du joueur (jamais pile sur lui) et avance sur 20-45 m. Renvoie { from, to }. */
export function strafeLine(player, rng, cfg = WAR.heli) {
  const ang = rng() * TAU, d = pick(cfg.ring, rng);
  const from = { x: player.x + Math.sin(ang) * d, z: player.z + Math.cos(ang) * d };
  const dir = rng() * TAU, len = pick(cfg.length, rng);
  return { from, to: { x: from.x + Math.sin(dir) * len, z: from.z + Math.cos(dir) * len } };
}

/** Dégâts d'une explosion de taille `scale` à `dist` mètres : fort au centre, nul au bord (rayon 10 m x taille). */
export function blastDamage(dist, scale = 1, power = 75) {
  const R = 10 * scale;
  return dist >= R ? 0 : power * Math.pow(1 - dist / R, 1.3);
}

/** Intensité : facteur de cadence selon le profil de performance (1 = tout, 0,5 = moitié moins d'événements). Cadence min/max divisée par le niveau. */
export const cadence = (c, level = 1) => ({ first: c.first / level, min: c.min / level, max: c.max / level });
