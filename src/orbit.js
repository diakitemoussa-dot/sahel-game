// Orbite de la caméra autour du personnage (stick droit de la manette).
// Le personnage regarde normalement dans la direction de la caméra. À l'arrêt, le stick droit fait tourner la caméra
// AUTOUR de lui : il garde son orientation. Dès qu'il avance, vise, tire ou sprinte, il se retourne vers la caméra.
// La souris continue de le faire tourner avec la caméra.

/** Ramène un angle dans [-pi, pi]. */
export function wrapPi(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

/** Nouvel état d'orbite.
 *  active : le joueur avance, vise, tire, sprinte ou saute. mouseLook : la souris (ou le tactile) a bougé.
 *  stickLook : le stick droit a bougé. */
export function updateOrbit({ orbiting, active, mouseLook, stickLook }) {
  if (active || mouseLook) return false;
  if (stickLook) return true;
  return orbiting;
}

/** Fait tourner l'orientation du corps vers celle de la caméra, par le chemin le plus court, avec lissage. */
export function followYaw(bodyYaw, camYaw, dt, rate = 14) {
  return bodyYaw + wrapPi(camYaw - bodyYaw) * (1 - Math.exp(-dt * rate));
}
