// Drapeau qui flotte (logique pure, testée sans navigateur) : le vent apparent (vent + mouvement du véhicule) et la forme du tissu à chaque instant.
// Repère du drapeau : l'origine est au milieu du bord côté mât ; x va du mât vers le bout libre (0 à w), y vers le haut (-h/2 à h/2), z est la profondeur (les ondulations).

export const FLAG = { w: 0.7, h: 0.47 };            // 3 : 2 comme le drapeau du Mali (vert, jaune, rouge en partant du mât)

/** Vent apparent : le vent de l'air (wx, wz) moins la vitesse du véhicule (vx, vz), tous en m/s dans le repère du monde (x, z de three.js).
 *  Renvoie { ax, az, speed, yaw } ; yaw : rotation autour de Y qui tourne l'axe x du drapeau (mât -> bout libre) vers l'aval du vent apparent. */
export function apparentWind(wx, wz, vx, vz) {
  const ax = wx - vx, az = wz - vz;
  return { ax, az, speed: Math.hypot(ax, az), yaw: Math.atan2(-az, ax) };
}

/** Force du vent sur le tissu, de 0 (il pend) à 1 (il est tendu à l'horizontale et claque). Le vent du jeu fait 1 à 3 m/s : à 3,2 m/s le tissu est déjà complètement tendu, pour qu'on le voie bien flotter. */
export function windFactor(speed) { return Math.max(0, Math.min(1, speed / 3.2)); }

/** Point du tissu. u : de 0 (mât) à 1 (bout libre) ; v : de -0.5 (bas) à 0.5 (haut) ; t : temps (s) ; wf : force du vent (0 à 1) ; phase : décalage propre à chaque drapeau.
 *  Le bord du mât ne bouge pas ; plus on s'éloigne du mât, plus ça ondule ; sans vent le bout pend vers le bas, avec du vent il se tend. Renvoie [x, y, z]. */
export function flagPoint(u, v, t, wf, { w, h } = FLAG, phase = 0) {
  const s = u * w, y0 = v * h;
  const amp = (0.04 + 0.26 * wf) * w * Math.pow(u, 1.25);                               // l'amplitude grandit vers le bout libre
  const cycles = 0.8 + 1.6 * wf;                                                        // plus de vent : plus de vagues
  const arg = Math.PI * 2 * cycles * u - Math.PI * 2 * (0.7 + 3 * wf) * t + v * 1.4 + phase;
  const z = amp * Math.sin(arg);
  const lift = 0.18 * amp * Math.sin(2 * arg + 0.8);
  const droop = Math.pow(1 - wf, 1.6) * 1.35;                                           // angle d'affaissement du bout libre (rad)
  return [s * Math.cos(droop), y0 + lift - s * Math.sin(droop), z];
}
