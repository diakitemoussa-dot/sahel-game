// Effets sonores : logique pure (testée sans navigateur).
//  - spatial : volume, côté (gauche/droite), étouffement et retard d'un son selon sa distance et la direction où l'on regarde ;
//  - stepInterval / StepClock : cadence des pas selon la vitesse ;
//  - overlaySound : quel son pour quelle animation d'action (recharge, coups).

export const MAX_HEAR = 140;                                   // au-delà (m), on n'entend plus rien
export const SOUND_SPEED = 340;                                // m/s

/** listener : { x, z } ; yaw : direction du regard (même convention que le jeu : avant = (sin yaw, cos yaw)) ; src : { x, z }.
 *  Renvoie { gain 0..1, pan -1 (gauche)..1 (droite), lowpass (Hz), delay (s) }. */
export function spatial(listener, yaw, src, { ref = 6, max = MAX_HEAR } = {}) {
  const dx = src.x - listener.x, dz = src.z - listener.z;
  const dist = Math.hypot(dx, dz);
  if (dist >= max) return { gain: 0, pan: 0, lowpass: 600, delay: 0, dist };
  const near = Math.max(dist, ref);
  const gain = Math.min(1, ref / near) * (1 - (dist / max) ** 2);          // décroissance en 1/d, annulée au bord de la portée
  // droite du joueur = (cos yaw, -sin yaw) quand l'avant est (sin yaw, cos yaw)
  const pan = dist < 0.5 ? 0 : Math.max(-1, Math.min(1, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / dist));
  const lowpass = 18000 / (1 + dist / 18);                                   // l'air étouffe les aigus : un tir lointain est plus sourd
  return { gain, pan, lowpass: Math.max(500, lowpass), delay: Math.min(0.6, dist / SOUND_SPEED), dist };
}

/** Secondes entre deux pas selon la vitesse (m/s) ; 0 = pas de pas (immobile ou presque). */
export function stepInterval(speed) {
  if (!(speed > 0.6)) return 0;
  return Math.max(0.24, 1.3 / (speed + 0.6) + 0.12);            // marche 2,4 m/s ≈ 0,56 s ; course 5,5 ≈ 0,34 s ; sprint 7 ≈ 0,29 s
}

/** Compteur de pas : à chaque image, dit combien de pas sonores sont à jouer (0 ou 1). */
export class StepClock {
  constructor() { this.t = 0; }
  update(dt, speed, onGround = true) {
    const iv = stepInterval(speed);
    if (!onGround || !iv) { this.t = Math.min(this.t, iv ? iv * 0.5 : 0); return 0; }     // en l'air ou arrêté : le prochain pas partira vite à la reprise
    this.t += dt;
    if (this.t >= iv) { this.t = 0; return 1; }
    return 0;
  }
}

/** Nom du son à jouer au début d'une animation d'action du joueur (null = aucun). */
export function overlaySound(name) {
  if (!name) return null;
  if (/reload/i.test(name)) return /pistol/i.test(name) ? 'reload_pistol' : 'reload_rifle';
  if (/kick/i.test(name)) return 'kick';
  if (/punch|melee|whip/i.test(name)) return 'punch';
  return null;
}

/** Volume des pas : plus fort en sprint, discret accroupi. */
export function stepVolume(speed, crouch = false) {
  const v = Math.min(1, 0.25 + speed / 9);
  return crouch ? v * 0.45 : v;
}

/** Vitesse d'un personnage déduite de ses positions successives. Les PNJ lointains ne sont mis à jour qu'une image sur deux :
 *  on mesure donc la vitesse sur le temps écoulé entre deux changements de position (et non image par image). */
export class SpeedTracker {
  constructor() { this.x = null; this.z = 0; this.t = 0; this.speed = 0; }
  update(x, z, t) {
    if (this.x === null) { this.x = x; this.z = z; this.t = t; return 0; }
    const d = Math.hypot(x - this.x, z - this.z);
    if (d > 1e-4) {
      const dt = Math.max(1e-3, t - this.t);
      this.speed = d / dt; this.x = x; this.z = z; this.t = t;
      if (d > 8) this.speed = 0;                                      // téléportation (réapparition) : pas une course
    } else if (t - this.t > 0.3) this.speed = 0;                      // immobile depuis un moment
    return this.speed;
  }
}

export const NPC_STEP_RANGE = 40;                                   // m : au-delà, les pas des PNJ ne sont pas joués
