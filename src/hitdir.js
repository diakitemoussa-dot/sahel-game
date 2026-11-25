// Indicateur de direction des tirs (logique pure, testée sans navigateur) : un arc jaune autour du personnage pointe vers le tireur.
// Repère three.js : un cap est l'angle autour de Y (0 = +z, positif vers +x), comme la caméra du jeu : elle regarde vers (sin cap, cos cap).

/** Cap (radians) d'un point `to` vu depuis `from`, plan (x, z). */
export function headingTo(from, to) { return Math.atan2(to.x - from.x, to.z - from.z); }

/** Angle de l'arc sur l'écran, en degrés, sens des aiguilles d'une montre depuis le haut (0 = tireur devant, 90 = à droite, 180 = derrière).
 *  camHeading : cap de la caméra ; from : position du joueur ; to : position du tireur. */
export function indicatorAngle(camHeading, from, to) {
  let a = (camHeading - headingTo(from, to)) * 180 / Math.PI;    // à gauche de la caméra = +x : cap plus grand, donc angle négatif (anti-horaire)
  a = ((a % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;                                  // -180..180
}

/** Opacité d'une indication selon son âge : pleine un instant, puis elle s'efface en douceur. */
export function indicatorAlpha(age, life = 2.2, hold = 0.5) {
  if (age < 0 || age >= life) return 0;
  return age <= hold ? 1 : 1 - (age - hold) / (life - hold);
}

/** Points d'un croissant (arc épais au milieu, effilé aux bouts) : centre (0, 0), rayon moyen R, épaisseur T, demi-ouverture en degrés.
 *  Angle 0 = en haut. Renvoie une liste [x, y] fermée (bord extérieur, puis bord intérieur en sens inverse). */
export function crescent(R = 78, T = 9, half = 42, steps = 20) {
  const out = [], inn = [];
  for (let i = 0; i <= steps; i++) {
    const u = -1 + 2 * i / steps, a = u * half * Math.PI / 180;
    const w = (T / 2) * Math.cos(u * Math.PI / 2);                // épaisseur : maximale au milieu, nulle aux bouts
    out.push([Math.sin(a) * (R + w), -Math.cos(a) * (R + w)]);
    inn.push([Math.sin(a) * (R - w), -Math.cos(a) * (R - w)]);
  }
  return [...out, ...inn.reverse()];
}

/** Pointe de flèche au milieu de l'arc, tournée vers l'extérieur (vers le tireur) : un triangle échancré à l'arrière.
 *  Même repère que crescent() : centre (0, 0), angle 0 = en haut. Renvoie [x, y] : pointe, aile droite, creux, aile gauche. */
export function arrowhead(R = 78, T = 9, len = 26, wing = 12) {
  const base = R + T / 2 - 3;                          // l'arrière de la pointe chevauche l'arc
  return [[0, -(base + len)], [wing, -(base - 3)], [0, -(base + len * 0.3)], [-wing, -(base - 3)]];
}
