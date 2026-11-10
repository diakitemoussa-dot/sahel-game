// Cerveau d'un PNJ hostile (logique pure, testée sans navigateur).
// États : patrol (patrouille) -> alert (il a repéré ou entendu le joueur : il se tourne, temps de réaction) -> engage (il combat)
//         -> search (il a perdu le joueur de vue : il va à sa dernière position connue) -> patrol ;
//         hurt (il vient d'être touché : sursaut) ; dead.
// En combat (engage) il est malin : dès qu'il voit son adversaire il cherche un ABRI (ctx.cover.find) et y court, s'y accroupit (hide),
// se relève pour tirer (peek) puis se recache ; il ESQUIVE par un pas de côté rapide quand on lui tire dessus (underFire) ; sans abri
// il combat à découvert en se déplaçant. Un « abri bas » (caisse) permet de tirer debout ; un « abri haut » oblige à se décaler.
// update() renvoie une commande { mode, heading, moveX, moveY, aim, fire, melee, crouch } que le PNJ transmet à la classe Player
// (les mêmes entrées que le clavier du joueur). Coordonnées du plan (x, z) de three.js ; cap = angle autour de Y (0 = +z).
import { angleDiff, mulberry32 } from './combat.js';

export class NpcBrain {
  constructor({ sight = 28, fov = Math.PI * 0.8, hearing = 45, engageMax = 15, engageMin = 4, meleeRange = 1.8,
                reaction = 0.55, loseSight = 7, hurtTime = 0.7, seed = 1,
                burstCycle = 1.5, burstLen = 0.6, dodgeTime = 0.4, dodgeCooldown = 1.3, hideTime = 1.1, peekTime = 1.4 } = {}) {
    Object.assign(this, { sight, fov, hearing, engageMax, engageMin, meleeRange, reaction, loseSight, hurtTime,
                          burstCycle, burstLen, dodgeTime, dodgeCooldown, hideTime, peekTime });
    this.rng = mulberry32(seed);
    this.reset();
  }

  reset() {
    this.state = 'patrol'; this.timer = 0; this.lostTimer = 0; this.heading = 0;
    this.last = null;                                // dernière position connue du joueur
    this.burst = 0; this.strafeDir = 1; this.strafeTimer = 0; this.dead = false; this.hurtFrom = null; this.searchWait = 0;
    this.coverPt = null; this.sub = null; this.subTimer = 0; this.coverCd = 0; this.cycles = 0; this.peekDir = 1;   // abri : point, phase (seek | hide | peek), minuterie
    this.dodgeT = 0; this.dodgeCd = 0; this.dodgeDir = 1;                                                         // esquive en cours
  }

  /** Le PNJ est mort (aucune commande ensuite). */
  die() { this.dead = true; this.state = 'dead'; }

  /** Il a été touché par le joueur (source : position du joueur) : sursaut, puis il se bat, qu'il voie ou non le joueur. */
  hit(source) {
    if (this.dead) return;
    this.last = { x: source.x, z: source.z };
    this.hurtFrom = this.state === 'hurt' ? this.hurtFrom : this.state;
    this.state = 'hurt'; this.timer = this.hurtTime;
    this.coverPt = null; this.sub = null; this.coverCd = 0;                // son abri n'a pas suffi : il en cherchera un autre
  }

  /** On lui tire dessus (touché ou non), de la position `from` : s'il combat, il esquive par un pas de côté rapide (pas trop souvent). */
  underFire() {
    if (this.dead || this.state !== 'engage' || this.dodgeCd > 0 || this.sub === 'hide') return;     // caché, il ne bouge pas
    this.dodgeT = this.dodgeTime * (0.75 + this.rng() * 0.5);
    this.dodgeCd = this.dodgeCooldown * (0.8 + this.rng() * 0.6);
    this.dodgeDir = this.rng() < 0.5 ? -1 : 1;
  }

  /** Il a entendu un bruit (tir, combat) à cette position : s'il est tranquille, il va voir. */
  hear(pos, dist) {
    if (this.dead || dist > this.hearing) return;
    if (this.state === 'patrol' || this.state === 'search') { this.last = { x: pos.x, z: pos.z }; this.state = 'alert'; this.timer = this.reaction; }
  }

  /** Un allié proche est tombé : il sait où est l'ennemi. */
  alarm(pos) {
    if (this.dead) return;
    if (this.state === 'patrol' || this.state === 'search') { this.last = { x: pos.x, z: pos.z }; this.state = 'alert'; this.timer = this.reaction; }
  }

  /** ctx : { pos: {x, z}, yaw, player: {x, z, alive, speed}, canSee (ligne de vue libre), hpFrac } */
  update(dt, ctx) {
    if (this.dead) return { mode: 'dead' };
    const { pos, player } = ctx;
    const dx = player.x - pos.x, dz = player.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);
    const inFov = Math.abs(angleDiff(toPlayer, ctx.yaw)) <= this.fov / 2;
    const sees = player.alive && ctx.canSee && dist <= this.sight && (inFov || dist < 5);
    if (sees) { this.last = { x: player.x, z: player.z }; this.lostTimer = 0; }

    if (!player.alive && this.state !== 'patrol') { this.state = 'patrol'; }    // le joueur est mort : il reprend sa ronde

    if (this.state !== 'engage' && this.state !== 'hurt' && this.coverPt) { this.coverPt = null; this.sub = null; }     // plus de combat : plus d'abri
    switch (this.state) {
      case 'patrol':
        if (sees) { this.state = 'alert'; this.timer = this.reaction; }
        return { mode: 'patrol' };
      case 'alert': {
        const target = this.last ?? player;
        this.heading = Math.atan2(target.x - pos.x, target.z - pos.z);
        this.timer -= dt;
        if (this.timer <= 0) { this.state = 'engage'; this.lostTimer = 0; this.coverCd = 0; }
        return { mode: 'alert', heading: this.heading, moveX: 0, moveY: 0, aim: true, fire: false, melee: false, crouch: false };
      }
      case 'hurt':
        this.timer -= dt;
        if (this.timer <= 0) { this.state = 'engage'; this.lostTimer = 0; }
        return { mode: 'hurt', heading: this.heading, moveX: 0, moveY: 0, aim: false, fire: false, melee: false, crouch: false };
      case 'engage': {
        if (!sees) { this.lostTimer += dt; if (this.lostTimer > this.loseSight) { this.state = 'search'; this.searchWait = 0; } }
        const target = sees ? player : (this.last ?? player);
        const tdx = target.x - pos.x, tdz = target.z - pos.z, tdist = Math.hypot(tdx, tdz);
        this.heading = Math.atan2(tdx, tdz);
        const cmd = { mode: 'engage', heading: this.heading, moveX: 0, moveY: 0, aim: sees, fire: false, melee: false, crouch: ctx.hpFrac < 0.3 };
        this.dodgeT = Math.max(0, this.dodgeT - dt); this.dodgeCd -= dt; this.coverCd -= dt; this.subTimer -= dt;
        if (sees && dist <= this.meleeRange) { this.coverPt = null; this.sub = null; cmd.mode = 'melee'; cmd.melee = true; return cmd; }      // corps à corps
        // trop loin pour tirer : il s'approche en courant (viser le ralentirait) ; il quitte son abri
        if (!sees && !this.coverPt || dist > (this.coverPt ? this.engageMax * 1.3 : this.engageMax)) { this.coverPt = null; this.sub = null; cmd.moveY = 1; cmd.aim = false; cmd.crouch = false; return cmd; }

        // ---- abri : dès qu'il voit son adversaire il cherche où se cacher (le jeu fournit ctx.cover.find)
        if (ctx.cover && sees && !this.coverPt && this.coverCd <= 0 && this.dodgeT <= 0) {
          this.coverCd = 2.5;
          const c = ctx.cover.find(target);
          if (c) { this.coverPt = c; this.sub = 'seek'; this.subTimer = 4.5; this.cycles = 0; }
        }
        if (this.coverPt) {
          const cx = this.coverPt.x - pos.x, cz = this.coverPt.z - pos.z, cd = Math.hypot(cx, cz);
          if (this.sub === 'seek') {                                    // il court à l'abri (sans viser : viser le ralentirait)
            if (cd < 0.9) { this.sub = 'hide'; this.subTimer = this.hideTime * (0.7 + this.rng() * 0.8) * (ctx.hpFrac < 0.4 ? 1.8 : 1); }
            else if (this.subTimer <= 0) { this.coverPt = null; this.sub = null; }
            else return { mode: 'cover', heading: Math.atan2(cx, cz), moveX: 0, moveY: 1, aim: false, fire: false, melee: false, crouch: false, sprint: cd > 6 };
          }
          if (this.sub === 'hide') {                                    // accroupi derrière l'abri, tourné vers l'adversaire
            if (this.subTimer <= 0) { this.sub = 'peek'; this.subTimer = this.peekTime * (0.8 + this.rng() * 0.6); this.burst = 0; this.peekDir = this.rng() < 0.5 ? -1 : 1; }
            else return { mode: 'cover', heading: this.heading, moveX: 0, moveY: 0, aim: false, fire: false, melee: false, crouch: true };
          }
          if (this.sub === 'peek') {                                    // il se relève : abri bas = il tire de là ; abri haut = il se décale pour voir
            if (this.subTimer <= 0) {
              this.cycles++;
              if (this.cycles >= 3) { this.coverPt = null; this.sub = null; this.coverCd = 0; }     // trois sorties : il en cherche un autre
              else { this.sub = 'hide'; this.subTimer = this.hideTime * (0.7 + this.rng() * 0.8); }
            } else if (this.dodgeT > 0 && sees) {
              return { mode: 'cover', heading: this.heading, moveX: this.dodgeDir, moveY: 0, aim: false, fire: false, melee: false, crouch: false };   // esquive depuis l'abri
            } else if (!sees) {
              return { mode: 'cover', heading: this.heading, moveX: 0.7 * this.peekDir, moveY: 0, aim: false, fire: false, melee: false, crouch: false };
            } else {
              this.burst = (this.burst + dt) % this.burstCycle;
              const shooting = this.burst < this.burstLen && Math.abs(angleDiff(this.heading, ctx.yaw)) < 0.25;
              return { mode: 'cover', heading: this.heading, moveX: 0, moveY: 0, aim: true, fire: shooting, melee: false, crouch: false };
            }
          }
        }

        // ---- à découvert : il esquive par un pas de côté rapide quand on lui tire dessus
        if (this.dodgeT > 0 && sees) { cmd.moveX = this.dodgeDir; cmd.aim = false; cmd.crouch = false; return cmd; }
        // à bonne distance : il tire par rafales, en se déplaçant un peu de côté entre deux rafales
        this.burst = (this.burst + dt) % this.burstCycle;
        const shooting = this.burst < this.burstLen && Math.abs(angleDiff(this.heading, ctx.yaw)) < 0.25;
        cmd.aim = true; cmd.fire = shooting;
        if (!shooting && !cmd.crouch) {
          this.strafeTimer -= dt;
          if (this.strafeTimer <= 0) { this.strafeDir = this.rng() < 0.5 ? -1 : 1; this.strafeTimer = 0.6 + this.rng() * 1.2; }
          cmd.moveX = 0.6 * this.strafeDir;
          if (dist < this.engageMin) cmd.moveY = -0.5;                                                   // trop près : il recule
        }
        return cmd;
      }
      case 'search': {
        if (sees) { this.state = 'engage'; this.lostTimer = 0; return { mode: 'engage', heading: toPlayer, moveX: 0, moveY: 0, aim: true, fire: false, melee: false, crouch: false }; }
        const t = this.last ?? pos;
        const tdx = t.x - pos.x, tdz = t.z - pos.z, tdist = Math.hypot(tdx, tdz);
        if (tdist < 1.5) {
          this.searchWait += dt;
          if (this.searchWait > 3) { this.state = 'patrol'; this.last = null; }
          return { mode: 'search', heading: this.heading, moveX: 0, moveY: 0, aim: false, fire: false, melee: false, crouch: false };
        }
        this.heading = Math.atan2(tdx, tdz);
        return { mode: 'search', heading: this.heading, moveX: 0, moveY: 0.5, aim: false, fire: false, melee: false, crouch: false };
      }
      default:
        return { mode: this.state };
    }
  }
}
