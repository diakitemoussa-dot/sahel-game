// Alliés du joueur (logique pure, testée sans navigateur) : suivre le joueur en formation, et choisir une cible parmi les adversaires.
// Coordonnées du plan (x, z) de three.js ; cap = angle autour de Y (0 = +z, le personnage regarde vers (sin cap, cos cap)) ; sa gauche est (cos cap, -sin cap).

/** Suit un chef (le joueur) en gardant une place dans la formation : à côté et en retrait de lui.
 *  slot : [côté, recul] en mètres (côté > 0 = à gauche du chef, recul > 0 = derrière lui).
 *  Il s'arrête près de sa place, repart quand il s'en éloigne (marge pour éviter de trembler), court puis sprinte quand il est loin. */
export class Follower {
  constructor({ slot = [1.8, 2.4], stop = 1.1, go = 2.0, run = 3.5, sprint = 8 } = {}) {      // le joueur court plus vite maintenant : l allié court dès 3,5 m d écart et sprinte dès 8 m, pour ne pas se laisser distancer
    Object.assign(this, { slot, stop, go, run, sprint });
    this.moving = false;
    this._ref = null; this._acc = 0; this.detourT = 0; this.detourDir = 1; this.jumpNow = false;      // anti-blocage : coincé contre un obstacle, il saute et contourne
  }

  /** Place visée : celle du joueur dans la formation (selon la direction où il regarde). */
  goal(leader) {
    const fx = Math.sin(leader.yaw), fz = Math.cos(leader.yaw), lx = Math.cos(leader.yaw), lz = -Math.sin(leader.yaw);
    return { x: leader.x + lx * this.slot[0] - fx * this.slot[1], z: leader.z + lz * this.slot[0] - fz * this.slot[1] };
  }

  /** pos : { x, z } ; leader : { x, z, yaw }. Renvoie une commande { mode: 'follow', heading, moveX, moveY, aim, fire, melee, sprint, crouch, ready }. */
  command(pos, leader, dt = 0) {
    const g = this.goal(leader);
    const dx = g.x - pos.x, dz = g.z - pos.z, d = Math.hypot(dx, dz);
    if (!this.moving && d > this.go) this.moving = true;
    else if (this.moving && d < this.stop) this.moving = false;
    // coincé : il avance mais ne bouge presque pas (obstacle) -> il saute (double saut : il peut grimper) et contourne d'un côté, puis de l'autre
    if (this.moving && dt > 0) {
      this.detourT -= dt; this._acc += dt;
      if (!this._ref) this._ref = { x: pos.x, z: pos.z };
      if (this._acc >= 0.7) {
        const moved = Math.hypot(pos.x - this._ref.x, pos.z - this._ref.z);
        this._ref = { x: pos.x, z: pos.z }; this._acc = 0;
        if (moved < 0.35 && this.detourT <= 0) { this.detourT = 1.1; this.detourDir = -this.detourDir; this.jumpNow = true; }
      }
    } else { this._acc = 0; this._ref = null; this.detourT = 0; }
    const cmd = { mode: 'follow', heading: this.moving ? Math.atan2(dx, dz) + (this.detourT > 0 ? this.detourDir * 1.1 : 0) : leader.yaw, moveX: 0, moveY: 0, aim: false, fire: false, melee: false, sprint: false, crouch: false, ready: true, jump: this.jumpNow };
    this.jumpNow = false;      // ready : le fusil reste levé, comme celui du joueur (pas de pose détendue voûtée)
    if (this.moving) { cmd.moveY = d > this.run ? 1 : 0.5; cmd.sprint = d > this.sprint; }
    return cmd;
  }
}

/** Choisit la cible d'un PNJ parmi des candidats { id, x, z, ... } : le plus proche visible (portée max), sinon le plus proche tout court.
 *  los(c) : le candidat est-il en ligne de vue ? previous : id de la cible précédente (on lui reste fidèle tant qu'elle n'est pas nettement plus loin).
 *  Renvoie { target, visible } ou null s'il n'y a aucun candidat. */
export function chooseTarget(pos, candidates, los, { range = 30, previous = null } = {}) {
  let best = null, bestScore = Infinity;
  for (const c of candidates) {
    const d = Math.hypot(c.x - pos.x, c.z - pos.z);
    const visible = d <= range && !!los(c);
    const score = d + (visible ? 0 : 1000) - (c.id === previous ? d * 0.3 : 0);     // visible d'abord, puis le plus proche ; fidélité de 30 % à la cible précédente
    if (score < bestScore) { bestScore = score; best = { target: c, visible }; }
  }
  return best;
}
