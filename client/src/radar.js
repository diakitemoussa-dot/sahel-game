// Carte de repérage (logique pure, testée sans navigateur) : position d'un personnage sur le radar, centré sur le joueur.
// Le haut du radar est la direction où regarde la caméra. Coordonnées du plan (x, z) de three.js ; cap = angle autour de Y (0 = +z).
// Droite de l'écran : (-cos cap, sin cap), avant : (sin cap, cos cap).

export const RADAR_RANGE = 140;           // portée du radar en mètres (le monde fait environ 400 m de large)

/** Position d'une cible sur le radar : { x, y } en fraction du rayon (-1..1, x vers la droite, y vers le bas), { far } vrai si elle est
 *  hors de portée (alors posée sur le bord du cercle, dans sa direction), { dist } en mètres. */
export function radarPoint(origin, heading, target, range = RADAR_RANGE) {
  const dx = target.x - origin.x, dz = target.z - origin.z;
  const fx = Math.sin(heading), fz = Math.cos(heading), rx = -Math.cos(heading), rz = Math.sin(heading);
  const right = dx * rx + dz * rz, fwd = dx * fx + dz * fz;
  const dist = Math.hypot(dx, dz);
  const k = dist > range ? range / dist : 1;
  const edge = 0.94;                                                    // les cibles lointaines restent juste à l'intérieur du bord
  const s = (dist > range ? edge : (dist / range) * edge) / (dist || 1);
  return { x: right * s, y: -fwd * s, far: dist > range, dist };
}
