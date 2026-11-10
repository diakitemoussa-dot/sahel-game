// Choix d'un abri pour un PNJ (logique pure, testée sans navigateur : le monde est passé sous forme de fonctions).
// Un bon abri est un point que le PNJ peut atteindre, hors de la ligne de tir de l'adversaire quand il est accroupi, et à bonne distance de lui.
// Mieux encore, un abri BAS (caisse, muret) : accroupi il y est caché, debout il voit et peut tirer par-dessus.
// Coordonnées du plan (x, z) de three.js.

/** Cherche le meilleur abri autour de `pos` contre la menace `threat`.
 *  Options (fonctions fournies par le jeu) :
 *   walkable(x, z)  : le point est libre et atteignable en ligne droite depuis le PNJ ;
 *   hiddenCrouched(x, z) : un obstacle le cache de la menace quand on s'y accroupit ;
 *   hiddenStanding(x, z) : un obstacle le cache de la menace même debout (abri haut : il faudra se décaler pour tirer) ;
 *   avoid : liste de points { x, z } à éviter (abris déjà pris, rayon 1,5 m) ;
 *   radius, minThreat, maxThreat : rayon de recherche, distances mini et maxi à la menace.
 *  Renvoie { x, z, low, travel, threatDist } (low : abri bas, on peut tirer debout) ou null. */
export function chooseCover({ pos, threat, walkable, hiddenCrouched, hiddenStanding, avoid = [], radius = 14, minThreat = 5, maxThreat = 26,
                              rings = [2.5, 5, 8, 11, 14], dirs = 16, phase = 0 }) {
  let best = null;
  const here = Math.hypot(threat.x - pos.x, threat.z - pos.z);
  for (const r of rings) {
    if (r > radius) break;
    for (let i = 0; i < dirs; i++) {
      const a = phase + (i / dirs) * Math.PI * 2;
      const x = pos.x + Math.sin(a) * r, z = pos.z + Math.cos(a) * r;
      const td = Math.hypot(threat.x - x, threat.z - z);
      if (td < minThreat || td > maxThreat) continue;
      if (avoid.some((o) => Math.hypot(o.x - x, o.z - z) < 1.5)) continue;
      if (!walkable(x, z)) continue;
      if (!hiddenCrouched(x, z)) continue;
      const low = !hiddenStanding(x, z);
      // coût : trajet à courir, abri haut moins pratique (il faut se décaler pour tirer), ne pas se rapprocher de la menace
      const score = r + (low ? 0 : 5) + Math.max(0, here - td) * 0.6;
      if (!best || score < best.score) best = { x, z, low, travel: r, threatDist: td, score };
    }
  }
  if (!best) return null;
  const { score, ...out } = best;
  return out;
}
