// La guerre en fond : le joueur n'est jamais seul au milieu d'un décor calme.
//  - combats lointains : deux groupes qui s'échangent des rafales (traçantes visibles, tirs entendus au loin) ;
//  - explosions lointaines et salves d'obus qui tombent à 45-115 m ;
//  - hélicoptères qui balaient le sol de rafales.
// Les règles (cadence, distances) sont dans warlogic.js. Tout est joué avec les moyens existants : traçantes, sons, fumée, missiles.
import * as THREE from 'three';
import { StrikeScheduler } from './smokelogic.js';
import { WAR, ringPoint, fightPlan, strafeLine, cadence } from './warlogic.js';

const TRACER_ENEMY = 0xff7a4a, TRACER_ALLY = 0xa6ff7a, TRACER_HELI = 0xffc860;
const EAR_SHOT = { ref: 20, max: 650 };                  // les tirs lointains s'entendent de plus loin que les sons du jeu

export class War {
  /** world, smoke (SmokeSystem), air (AirTraffic, pour les hélicoptères), sfx, tracer(from, to, color), muzzle (facultatif), level : 1 = tout, moins = moins d'événements. */
  constructor({ world, smoke, air = null, sfx = null, tracer, muzzle = null, enabled = true, level = 1, rng = Math.random }) {
    this.world = world; this.smoke = smoke; this.air = air; this.sfx = sfx; this.tracer = tracer; this.muzzle = muzzle; this.enabled = enabled; this.rng = rng;
    this.fights = []; this.shells = []; this.bursts = []; this.time = 0;
    this.stats = { fights: 0, shots: 0, far: 0, shells: 0, heliBursts: 0, heliShots: 0 };
    this.timers = {
      fight: new StrikeScheduler(cadence(WAR.fight)), far: new StrikeScheduler(cadence(WAR.distant)),
      shell: new StrikeScheduler(cadence(WAR.shells)), heli: new StrikeScheduler(cadence(WAR.heli)),
    };
    this.setLevel(level);
  }

  /** level : 1 (ordinateur) ; téléphone : moins d'événements pour ménager la machine. */
  setLevel(level) {
    this.level = level;
    for (const [k, cfg] of [['fight', WAR.fight], ['far', WAR.distant], ['shell', WAR.shells], ['heli', WAR.heli]]) { const c = cadence(cfg, level); this.timers[k].min = c.min; this.timers[k].max = c.max; }
  }

  _gy(p) { return this.world.groundY(p.x, p.z); }
  _sfx(name, pos, vol) { this.sfx?.play(name, { pos, vol, ear: EAR_SHOT }); }

  // ------------------------------------------------------------------ événements (publics : les tests les déclenchent à la main)
  startFight(player, heading) {
    const plan = fightPlan(player, heading, this.rng);
    this.fights.push({ ...plan, left: plan.shots, next: 0, turn: 0, run: 0 });
    this.stats.fights++;
  }

  farBlast(player, heading) {
    const temp = this.smoke.sites.filter((s) => s.temp).length;
    if (temp >= WAR.distant.maxTemp) return false;
    const p = ringPoint(player, heading, this.rng, WAR.distant.range);
    this.smoke.explode({ x: p.x, y: this._gy(p), z: p.z }, 0.9 + this.rng() * 0.6);
    this.stats.far++;
    return true;
  }

  shellVolley(player, heading) {
    const n = Math.round(WAR.shells.count[0] + (WAR.shells.count[1] - WAR.shells.count[0]) * this.rng());
    let at = this.time;
    for (let i = 0; i < n; i++) {
      at += WAR.shells.gap[0] + (WAR.shells.gap[1] - WAR.shells.gap[0]) * this.rng();
      this.shells.push({ at, to: ringPoint(player, heading, this.rng, WAR.shells.range, 0.8) });
    }
  }

  heliBurst(player) {
    if (!this.air) return false;
    let best = null, bd = WAR.heli.range;
    for (const h of this.air.helis) { const d = Math.hypot(h.pos.x - player.x, h.pos.z - player.z); if (d < bd) { bd = d; best = h; } }
    if (!best) return false;
    const line = strafeLine(player, this.rng);
    const n = Math.round(WAR.heli.shots[0] + (WAR.heli.shots[1] - WAR.heli.shots[0]) * this.rng());
    this.bursts.push({ heli: best, line, n, left: n, next: 0 });
    this.stats.heliBursts++;
    return true;
  }

  // ------------------------------------------------------------------ boucle
  /** player : { x, z } ; heading : regard du joueur. */
  update(dt, player, heading = 0) {
    if (!this.enabled) return;
    this.time += dt;
    const T = this.timers;
    if (T.fight.update(dt) && this.fights.length < WAR.fight.concurrent) this.startFight(player, heading);
    if (T.far.update(dt)) this.farBlast(player, heading);
    if (T.shell.update(dt)) this.shellVolley(player, heading);
    if (T.heli.update(dt)) this.heliBurst(player);
    this._fights(dt, player);
    this._shells();
    this._bursts(dt, player);
  }

  _fights(dt, player) {
    for (let k = this.fights.length - 1; k >= 0; k--) {
      const f = this.fights[k];
      f.next -= dt;
      while (f.next <= 0 && f.left > 0) {
        f.next += f.gap * (0.8 + this.rng() * 0.5); f.left--;
        if (++f.run > 2 + Math.floor(this.rng() * 3)) { f.run = 0; f.turn ^= 1; f.next += 0.25 + this.rng() * 0.5; }      // une rafale de 3-5 coups, puis l'autre camp répond
        const from = f.turn ? f.b : f.a, to = f.turn ? f.a : f.b;
        const a = new THREE.Vector3(from.x, this._gy(from) + 1.4, from.z);
        const miss = this.rng() < 0.45;                                             // un coup sur deux finit dans le sable : jet de poussière
        const b = new THREE.Vector3(to.x + (this.rng() - 0.5) * 5, miss ? this._gy(to) + 0.2 : this._gy(to) + 1.2, to.z + (this.rng() - 0.5) * 5);
        this.tracer(a, b, f.turn ? TRACER_ALLY : TRACER_ENEMY);
        this._sfx('rifle', from, 0.6);
        if (this.muzzle && f.left % 2 === 0 && Math.hypot(from.x - player.x, from.z - player.z) < 190) this.muzzle.shot(a, b.clone().sub(a).normalize(), 0.9);
        this.stats.shots++;
      }
      if (f.left <= 0) this.fights.splice(k, 1);
    }
  }

  _shells() {
    for (let k = this.shells.length - 1; k >= 0; k--) {
      const s = this.shells[k];
      if (this.time < s.at) continue;
      this.shells.splice(k, 1);
      const y = this._gy(s.to), a = this.rng() * 6.283;
      this.smoke.launchMissile({ x: s.to.x, z: s.to.z }, 2.4, { x: s.to.x + Math.cos(a) * 70, y: y + 190, z: s.to.z + Math.sin(a) * 70 });      // obus qui plonge du ciel
      this.stats.shells++;
    }
  }

  _bursts(dt, player) {
    for (let k = this.bursts.length - 1; k >= 0; k--) {
      const b = this.bursts[k];
      b.next -= dt;
      while (b.next <= 0 && b.left > 0) {
        b.next += WAR.heli.gap; b.left--;
        const u = 1 - b.left / b.n, L = b.line;
        const to = new THREE.Vector3(L.from.x + (L.to.x - L.from.x) * u + (this.rng() - 0.5) * 2, 0, L.from.z + (L.to.z - L.from.z) * u + (this.rng() - 0.5) * 2);
        to.y = this._gy(to) + 0.1;
        const from = b.heli.pos.clone(); from.y -= 1.2;
        this.tracer(from, to, TRACER_HELI);
        this._sfx('rifle', from, 0.8);
        if (Math.hypot(to.x - player.x, to.z - player.z) < 22 && this.rng() < 0.5) this.sfx?.play('whiz', { pos: to, vol: 0.8 });      // les balles frappent près du joueur
        this.stats.heliShots++;
      }
      if (b.left <= 0) this.bursts.splice(k, 1);
    }
  }
}
