// Cerveau de patrouille d'un PNJ (logique pure, testée sans navigateur) : il va de point en point, s'arrête un moment à chacun,
// puis repart. Coordonnées du plan (x, z) de three.js. step() renvoie le cap (angle autour de Y, comme la caméra du joueur)
// et si le PNJ doit avancer : le corps du PNJ est ensuite piloté par la même classe Player que le joueur.
export class Patrol {
  /** route : [[x, z], ...] ; wait : pause (s) à chaque point ; reach : distance (m) à laquelle un point est atteint. */
  constructor(route, { wait = 3, reach = 0.6, stuckTime = 2.5, startIndex = 0 } = {}) {
    if (!route || route.length < 2) throw new Error('une patrouille a besoin d\'au moins 2 points');
    this.route = route; this.wait = wait; this.reach = reach; this.stuckTime = stuckTime;
    this.index = startIndex % route.length;
    this.mode = 'walk';
    this.timer = 0;
    this.heading = 0;
    this.best = Infinity; this.stuck = 0;           // meilleure distance au point visé, et temps sans progrès (obstacle)
  }

  /** pos : { x, z } position actuelle. Renvoie { heading, moving, index, mode }. */
  step(dt, pos) {
    const [tx, tz] = this.route[this.index];
    const dx = tx - pos.x, dz = tz - pos.z;
    const dist = Math.hypot(dx, dz);
    if (this.mode === 'wait') {
      this.timer -= dt;
      if (this.timer <= 0) { this.index = (this.index + 1) % this.route.length; this.mode = 'walk'; this.best = Infinity; this.stuck = 0; }
      return { heading: this.heading, moving: false, index: this.index, mode: this.mode };
    }
    if (dist < this.reach) {
      this.mode = 'wait'; this.timer = this.wait;
      return { heading: this.heading, moving: false, index: this.index, mode: this.mode };
    }
    this.heading = Math.atan2(dx, dz);              // le joueur avance vers (sin cap, cos cap)
    if (dist < this.best - 0.05) { this.best = dist; this.stuck = 0; }
    else {
      this.stuck += dt;
      if (this.stuck > this.stuckTime) {            // bloqué par un obstacle : on passe au point suivant
        this.index = (this.index + 1) % this.route.length; this.best = Infinity; this.stuck = 0;
      }
    }
    return { heading: this.heading, moving: true, index: this.index, mode: this.mode };
  }
}
