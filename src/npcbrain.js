// Cerveau d'un PNJ hostile (logique pure, testée sans navigateur).
// États : patrol (patrouille) -> alert (il a repéré ou entendu le joueur : il se tourne, temps de réaction) -> engage (il combat)
//         -> search (il a perdu le joueur de vue : il va à sa dernière position connue) -> patrol ;
//         hurt (il vient d'être touché : sursaut) ; dead.
// En combat (engage) il est malin : dès qu'il voit son adversaire il cherche un ABRI (ctx.cover.find) et y court, s'y accroupit (hide),
// se relève pour tirer (peek) puis se recache ; il ESQUIVE par un pas de côté rapide quand on lui tire dessus (underFire) ; sans abri
// il combat à découvert en se déplaçant. Un « abri bas » (caisse) permet de tirer debout ; un « abri haut » oblige à se décaler.
// update() renvoie une commande { mode, heading, moveX, moveY, aim, fire, melee, crouch } que le PNJ transmet à la classe Player
// (les mêmes entrées que le clavier du joueur). Coordonnées du plan (x, z) de three.js ; cap = angle autour de Y (0 = +z).
// Avec un esprit (mind : npcmind.js) il RÉFLÉCHIT en plus : à chaque instant il choisit un plan tactique (foncer, couvrir, contourner l'adversaire par un côté,
// se replier vers un abri plus lointain, fuir, attendre caché), selon son caractère, son moral, ses blessures, ses camarades et ses adversaires ; il se souvient d'où
// l'adversaire allait et le cherche là où il a dû passer ; il prévient ses camarades quand il le repère (intel).
import { angleDiff, mulberry32 } from './combat.js';

export class NpcBrain {
  constructor({ sight = 28, fov = Math.PI * 0.8, hearing = 45, engageMax = 15, engageMin = 4, meleeRange = 1.8,
                reaction = 0.55, loseSight = 7, hurtTime = 0.7, seed = 1,
                burstCycle = 1.5, burstLen = 0.6, dodgeTime = 0.4, dodgeCooldown = 1.3, hideTime = 1.1, peekTime = 1.4, mind = null } = {}) {
    Object.assign(this, { sight, fov, hearing, engageMax, engageMin, meleeRange, reaction, loseSight, hurtTime,
                          burstCycle, burstLen, dodgeTime, dodgeCooldown, hideTime, peekTime });
    this.rng = mulberry32(seed);
    this.mind = mind;
    if (mind) { const c = mind.traits.courage; this.hideTime *= 1.25 - c * 0.5; this.peekTime *= 0.8 + c * 0.4; }     // un peureux reste caché plus longtemps, un brave ressort plus vite
    this.reset();
  }

  reset() {
    this.state = 'patrol'; this.timer = 0; this.lostTimer = 0; this.heading = 0;
    this.last = null;                                // dernière position connue du joueur
    this.burst = 0; this.strafeDir = 1; this.strafeTimer = 0; this.dead = false; this.hurtFrom = null; this.searchWait = 0;
    this.coverPt = null; this.sub = null; this.subTimer = 0; this.coverCd = 0; this.cycles = 0; this.peekDir = 1;   // abri : point, phase (seek | hide | peek), minuterie
    this.dodgeT = 0; this.dodgeCd = 0; this.dodgeDir = 1;                                                         // esquive en cours
    this.flankPt = null; this.flankT = 0; this.flankCd = 0; this.retreatPt = null; this.retreatT = 0; this.appliedPlan = null;       // plans tactiques (esprit)
  }

  /** Ce qu'il pense en ce moment (vide s'il n'a rien à dire) : affiché au-dessus de sa tête. */
  get thought() { return this.mind && this.mind.thoughtAge < 3.2 ? this.mind.thought : ''; }
  get plan() { return this.mind ? this.mind.plan : null; }

  /** Le PNJ est mort (aucune commande ensuite). */
  die() { this.dead = true; this.state = 'dead'; }

  /** Il a été touché par le joueur (source : position du joueur) : sursaut, puis il se bat, qu'il voie ou non le joueur. */
  hit(source, dmg = 10) {
    if (this.dead) return;
    this.mind?.onHit(dmg, source);
    this.last = { x: source.x, z: source.z };
    this.hurtFrom = this.state === 'hurt' ? this.hurtFrom : this.state;
    this.state = 'hurt'; this.timer = this.hurtTime;
    this.coverPt = null; this.sub = null; this.coverCd = 0;                // son abri n'a pas suffi : il en cherchera un autre
  }

  /** On lui tire dessus (touché ou non), de la position `from` : s'il combat, il esquive par un pas de côté rapide (pas trop souvent). */
  underFire() {
    if (!this.dead) this.mind?.onNearMiss();
    if (this.dead || this.state !== 'engage' || this.dodgeCd > 0 || this.sub === 'hide') return;     // caché, il ne bouge pas
    this.dodgeT = this.dodgeTime * (0.75 + this.rng() * 0.5);
    this.dodgeCd = this.dodgeCooldown * (0.8 + this.rng() * 0.6);
    this.dodgeDir = this.rng() < 0.5 ? -1 : 1;
  }

  /** Il a entendu un bruit (tir, combat) à cette position : s'il est tranquille, il va voir. */
  hear(pos, dist) {
    if (this.dead || dist > this.hearing) return;
    if (this.state === 'patrol' || this.state === 'search') { this.last = { x: pos.x, z: pos.z }; this.state = 'alert'; this.timer = this.reaction; this.mind?.say('noise'); }
  }

  /** Un allié proche est tombé : il sait où est l'ennemi. */
  alarm(pos) {
    if (this.dead) return;
    if (this.state === 'patrol' || this.state === 'search') { this.last = { x: pos.x, z: pos.z }; this.state = 'alert'; this.timer = this.reaction; }
  }

  /** Un camarade l'appelle par radio : l'adversaire est vers `pos` (à `err` mètres près : la radio n'est pas parfaite). */
  intel(pos, err = 3) {
    if (this.dead) return;
    if (this.state === 'patrol' || this.state === 'search') {
      this.last = { x: pos.x + (this.rng() - 0.5) * 2 * err, z: pos.z + (this.rng() - 0.5) * 2 * err };
      this.state = 'alert'; this.timer = this.reaction * 1.4; this.mind?.say('help');
    }
  }

  /** Un point de repli plus loin de l'adversaire (cherché via ctx.cover, gardé 2,5 s). */
  _retreat(ctx, target, tdist, pos) {
    if (this.retreatT > 0 && this.retreatPt) return this.retreatPt;
    this.retreatT = 2.5;
    this.retreatPt = ctx.cover?.find(target, { radius: 20, minThreat: tdist + 5, maxThreat: 70 }) ?? null;
    if (!this.retreatPt) {                                         // pas d'abri : simplement s'éloigner, à l'opposé de l'adversaire
      const a = Math.atan2(pos.x - target.x, pos.z - target.z);
      this.retreatPt = { x: pos.x + Math.sin(a) * 10, z: pos.z + Math.cos(a) * 10, low: false, free: true };
    }
    return this.retreatPt;
  }

  /** ctx : { pos: {x, z}, yaw, player: {x, z, alive, speed}, canSee (ligne de vue libre), hpFrac, cover, nav, tactics } */
  update(dt, ctx) {
    if (this.dead) return { mode: 'dead' };
    const { pos, player } = ctx;
    const dx = player.x - pos.x, dz = player.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);
    const inFov = Math.abs(angleDiff(toPlayer, ctx.yaw)) <= this.fov / 2;
    const sees = player.alive && ctx.canSee && dist <= this.sight && (inFov || dist < 5);
    if (sees) { this.last = { x: player.x, z: player.z }; this.lostTimer = 0; }
    const tk = ctx.tactics ?? {};
    if (this.mind) {
      if (sees) this.mind.onSeen({ x: player.x, z: player.z }, dt);
      this.mind.tick(dt, { calm: this.state !== 'engage' && this.state !== 'hurt', safe: this.sub === 'hide' || !sees || dist > 30, friends: tk.friends ?? 0, sees });
      this.flankCd -= dt; this.retreatT -= dt; this.flankT -= dt;
    }

    if (!player.alive && this.state !== 'patrol') { this.state = 'patrol'; }    // le joueur est mort : il reprend sa ronde

    if (this.state !== 'engage' && this.state !== 'hurt' && this.coverPt) { this.coverPt = null; this.sub = null; }     // plus de combat : plus d'abri
    switch (this.state) {
      case 'patrol':
        if (sees) { this.state = 'alert'; this.timer = this.reaction; this.mind?.say('contact'); this.mind?.setPlan('suppress'); }
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
        const target = sees ? player : (this.mind?.predicted() ?? this.last ?? player);
        const tdx = target.x - pos.x, tdz = target.z - pos.z, tdist = Math.hypot(tdx, tdz);
        this.heading = Math.atan2(tdx, tdz);
        const cmd = { mode: 'engage', heading: this.heading, moveX: 0, moveY: 0, aim: sees, fire: false, melee: false, crouch: ctx.hpFrac < 0.3 };
        this.dodgeT = Math.max(0, this.dodgeT - dt); this.dodgeCd -= dt; this.coverCd -= dt; this.subTimer -= dt;
        if (sees && dist <= this.meleeRange) { this.coverPt = null; this.sub = null; cmd.mode = 'melee'; cmd.melee = true; return cmd; }      // corps à corps
        // ---- esprit : il choisit un plan tactique selon sa situation (voir npcmind.js)
        let plan = 'suppress';
        if (this.mind) {
          plan = this.mind.decide({ dist: tdist, sees, hpFrac: ctx.hpFrac, friends: tk.friends ?? 0, foes: tk.foes ?? 1, role: tk.role ?? 'solo',
            canFlank: !!ctx.nav && this.flankCd <= 0, hasCover: !!ctx.cover, inCover: !!this.coverPt && this.sub === 'hide', flankSide: tk.side });
          if (plan !== this.appliedPlan) {                                   // il vient de changer d'avis
            if (plan === 'fallback' || plan === 'flee') { this.coverPt = null; this.sub = null; this.retreatT = 0; this.retreatPt = null; }
            if (plan === 'flank') { this.flankPt = null; this.flankT = 0; }
            this.appliedPlan = plan;
          }
        }
        if (plan === 'flee') {                                               // panique : il court se mettre à l'abri, sans viser
          const pt = this._retreat(ctx, target, tdist, pos);
          return { mode: 'cover', heading: Math.atan2(pt.x - pos.x, pt.z - pos.z), moveX: 0, moveY: 1, aim: false, fire: false, melee: false, crouch: false, sprint: true };
        }
        if (plan === 'fallback') {                                           // repli : il rejoint un abri plus loin de l'adversaire, puis y reste caché plus longtemps
          if (!this.coverPt) {
            const pt = this._retreat(ctx, target, tdist, pos);
            if (pt.free) return { mode: 'cover', heading: Math.atan2(pt.x - pos.x, pt.z - pos.z), moveX: 0, moveY: 1, aim: false, fire: false, melee: false, crouch: false, sprint: true };
            this.coverPt = pt; this.sub = 'seek'; this.subTimer = 6; this.cycles = 0;
          }
        }
        if (plan === 'flank' && this.mind) {                                 // contournement : il court vers un point sur le côté de l'adversaire
          if (!this.flankPt || this.flankT <= 0) {
            this.flankPt = ctx.nav?.flank?.(tk.side ?? 1) ?? null; this.flankT = 9;
            if (!this.flankPt) { this.flankCd = 8; this.mind.setPlan('advance'); }
          }
          if (this.flankPt) {
            const fx = this.flankPt.x - pos.x, fz = this.flankPt.z - pos.z, fd = Math.hypot(fx, fz);
            if (fd < 2 || (sees && tdist < this.engageMax * 0.55)) { this.flankPt = null; this.flankCd = 14; this.mind.setPlan('advance'); }     // arrivé (ou déjà à bonne portée) : il attaque
            else return { mode: 'cover', heading: Math.atan2(fx, fz), moveX: 0, moveY: 1, aim: false, fire: false, melee: false, crouch: false, sprint: fd > 7 };
          }
        }
        // trop loin pour tirer : il s'approche en courant (viser le ralentirait) ; il quitte son abri
        if (!sees && !this.coverPt || dist > (this.coverPt ? this.engageMax * 1.3 : this.engageMax)) { this.coverPt = null; this.sub = null; cmd.moveY = (this.mind && !sees && this.mind.traits.caution > 0.6) ? 0.5 : 1; cmd.aim = false; cmd.crouch = false; return cmd; }

        // ---- abri : dès qu'il voit son adversaire il cherche où se cacher (le jeu fournit ctx.cover.find)
        if (ctx.cover && sees && !this.coverPt && this.coverCd <= 0 && this.dodgeT <= 0 && plan !== 'advance') {
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
            if (this.subTimer <= 0 && (plan === 'fallback' || plan === 'hold') && this.mind && this.mind.planAge < 4 + this.mind.traits.caution * 4) this.subTimer = 0.8;      // il attend encore : trop dangereux de sortir
            else if (this.subTimer <= 0) { this.sub = 'peek'; this.subTimer = this.peekTime * (0.8 + this.rng() * 0.6); this.burst = 0; this.peekDir = this.rng() < 0.5 ? -1 : 1; }
            if (this.sub === 'hide') return { mode: 'cover', heading: this.heading, moveX: 0, moveY: 0, aim: false, fire: false, melee: false, crouch: true };
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
        const shooting = this.burst < this.burstLen * (plan === 'suppress' ? 1.3 : 1) && Math.abs(angleDiff(this.heading, ctx.yaw)) < 0.25;
        cmd.aim = true; cmd.fire = shooting;
        if (!shooting && !cmd.crouch) {
          this.strafeTimer -= dt;
          if (this.strafeTimer <= 0) { this.strafeDir = this.rng() < 0.5 ? -1 : 1; this.strafeTimer = 0.6 + this.rng() * 1.2; }
          cmd.moveX = 0.6 * this.strafeDir;
          if (dist < this.engageMin) cmd.moveY = -0.5;                                                   // trop près : il recule
          else if (plan === 'advance' && dist > this.engageMin + 3) cmd.moveY = 0.45;                  // il gagne du terrain entre deux rafales
        }
        return cmd;
      }
      case 'search': {
        if (sees) { this.state = 'engage'; this.lostTimer = 0; return { mode: 'engage', heading: toPlayer, moveX: 0, moveY: 0, aim: true, fire: false, melee: false, crouch: false }; }
        const t = this.mind?.predicted() ?? this.last ?? pos;
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
