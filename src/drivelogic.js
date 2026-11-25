// Conduite d'un véhicule par le joueur (logique pure, testée sans navigateur) : accélérer, freiner, reculer, tourner.
// Repère : cap en radians autour de Y ; l'avant est (sin cap, cos cap), la droite est (cos cap, -sin cap) ; tourner à droite augmente le cap.

/** Réglages d'un blindé lourd : vitesse en m/s, accélérations en m/s². */
export const DRIVE_DEFAULTS = { maxSpeed: 17, reverseMax: 5, accel: 5, brake: 11, handbrake: 16, coast: 1.6, wheelbase: 4.6, maxSteer: 0.55, steerRate: 2.4 };

/** Commandes : throttle et brake de 0 à 1, steer de -1 (gauche) à 1 (droite), handbrake vrai/faux. */
export class Driving {
  constructor(opts = {}) {
    Object.assign(this, DRIVE_DEFAULTS, opts);
    this.x = 0; this.z = 0; this.heading = 0; this.v = 0;        // v > 0 : il avance, v < 0 : il recule
    this.steer = 0;                                              // braquage actuel (-1..1), le volant tourne progressivement
  }

  place(x, z, heading) { this.x = x; this.z = z; this.heading = heading; this.v = 0; this.steer = 0; }

  /** Un pas de temps. Renvoie la vitesse en m/s. */
  step(dt, { throttle = 0, brake = 0, steer = 0, handbrake = false } = {}) {
    // le volant suit la consigne sans à-coup
    const dsteer = Math.max(-this.steerRate * dt, Math.min(this.steerRate * dt, steer - this.steer));
    this.steer += dsteer;

    let a = 0;
    if (throttle > 0) a += this.v < -0.3 ? this.brake * throttle : this.accel * throttle * (1 - Math.max(0, this.v) / this.maxSpeed);       // il ralentit en s'approchant de sa vitesse maximale
    if (brake > 0) a -= this.v > 0.3 ? this.brake * brake : this.accel * 0.7 * brake * (1 - Math.max(0, -this.v) / this.reverseMax);          // freine, puis recule
    this.v += a * dt;
    // frottements : l'élan (sans pédale) et le frein à main arrêtent le véhicule, ils ne le font jamais reculer
    const friction = (throttle <= 0 && brake <= 0 ? this.coast : 0) + (handbrake ? this.handbrake : 0);
    if (friction > 0 && this.v !== 0) { const dv = friction * dt; this.v = Math.abs(this.v) <= dv ? 0 : this.v - Math.sign(this.v) * dv; }
    this.v = Math.max(-this.reverseMax, Math.min(this.maxSpeed, this.v));

    // braquage actuel (-1..1), le volant tourne progressivement
  }

  place(x, z, heading) { this.x = x; this.z = z; this.heading = heading; this.v = 0; this.steer = 0; }

  /** Un pas de temps. Renvoie la vitesse en m/s. */
  step(dt, { throttle = 0, brake = 0, steer = 0, handbrake = false } = {}) {
    // le volant suit la consigne sans à-coup
    const dsteer = Math.max(-this.steerRate * dt, Math.min(this.steerRate * dt, steer - this.steer));
    this.steer += dsteer;

    let a = 0;
    if (throttle > 0) a += this.v < -0.3 ? this.brake * throttle : this.accel * throttle * (1 - Math.max(0, this.v) / this.maxSpeed);       // il ralentit en s'approchant de sa vitesse maximale
    if (brake > 0) a -= this.v > 0.3 ? this.brake * brake : this.accel * 0.7 * brake * (1 - Math.max(0, -this.v) / this.reverseMax);          // freine, puis recule
    if (throttle <= 0 && brake <= 0 && Math.abs(this.v) > 0) a -= Math.sign(this.v) * Math.min(this.coast, Math.abs(this.v) / Math.max(dt, 1e-6));      // il roule sur son élan
    if (handbrake && this.v !== 0) a -= Math.sign(this.v) * Math.min(this.handbrake, Math.abs(this.v) / Math.max(dt, 1e-6));
    const before = this.v;
    this.v = Math.max(-this.reverseMax, Math.min(this.maxSpeed, this.v + a * dt));
    if (before !== 0 && Math.sign(before) !== Math.sign(this.v) && !(throttle > 0 && before < 0) && !(brake > 0 && before > 0.3)) this.v = 0;       // le frein à main et l'élan arrêtent le véhicule, ils ne le font pas reculer

    // braquage : plus il va vite, moins les roues peuvent tourner ; à l'arrêt il ne pivote pas sur place
    const lock = this.maxSteer / (1 + Math.abs(this.v) / 9);
    const turn = (this.v / this.wheelbase) * Math.tan(this.steer * lock);
    this.heading += turn * dt;
    this.x += Math.sin(this.heading) * this.v * dt;
    this.z += Math.cos(this.heading) * this.v * dt;
    return this.v;
  }

  /** Un choc : le véhicule perd de la vitesse (0 = arrêt net, 1 = rien). */
  bump(keep = 0.5) { this.v *= keep; }

  get kmh() { return Math.abs(this.v) * 3.6; }
  /** « D » en avançant, « R » en reculant, « N » à l'arrêt. */
  get gear() { return this.v > 0.4 ? 'D' : this.v < -0.4 ? 'R' : 'N'; }
  /** Part de la vitesse maximale (0 à 1), pour la jauge. */
  get frac() { return Math.min(1, Math.abs(this.v) / this.maxSpeed); }
}

/** Traduit les commandes du jeu (clavier, souris, manette, écran tactile) en commandes de conduite.
 *  inp : sortie d'Input.poll() ; moveY > 0 = avant/haut du stick, moveX > 0 = droite ; padRT, padLT : gâchettes de la manette (0 à 1) ; driveBrake : frein à main tenu. */
export function driveCommands(inp) {
  const my = inp.moveY ?? 0, mx = inp.moveX ?? 0;
  return {
    throttle: Math.max(0, my, inp.padRT ?? 0),
    brake: Math.max(0, -my, inp.padLT ?? 0),
    steer: Math.max(-1, Math.min(1, mx)),
    handbrake: !!inp.driveBrake,
  };
}

/** Les commandes à afficher dans l'interface de conduite (clavier + souris, et manette). */
export const DRIVE_HELP = {
  pc: [['Z / ↑', 'accélérer'], ['S / ↓', 'freiner, reculer'], ['Q D / ← →', 'tourner'], ['Espace', 'frein à main'], ['Souris', 'regarder autour'], ['E', 'descendre']],
  pad: [['RT', 'accélérer'], ['LT', 'freiner, reculer'], ['Stick gauche', 'tourner'], ['A', 'frein à main'], ['Stick droit', 'regarder autour'], ['R1', 'descendre']],
};
