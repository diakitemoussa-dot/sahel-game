// Le combat : relie les règles pures (combat.js), les cerveaux (npcbrain.js, allybrain.js) et les personnages. Deux camps :
//  - le joueur et ses ALLIÉS (PNJ de son groupe, en tenue militaire) ;
//  - les MILICIENS (PNJ ennemis).
// Chaque PNJ choisit sa cible parmi ses adversaires (un milicien : le joueur ou un allié, le plus proche visible ; un allié : un milicien).
//  - le joueur tire (rayon de la caméra contre les miliciens, bloqué par les objets) ou frappe (coup qui touche à un moment précis de l'animation) ;
//  - mort du joueur (il réapparaît au départ) ; un PNJ (milicien ou allié) qui meurt reste mort : il ne revient jamais.
// hud : { flashHurt(), setHealth(frac, hp), hitMarker(kill), toast(text, ms), setKills(n), shotFrom(id, pos, power) } (peut être null dans les tests).
import * as THREE from 'three';
import { rayCapsule, hitChance, inCone, mulberry32,
         PLAYER_DAMAGE, MELEE_DELAY, NPC_DAMAGE, ALLY_DAMAGE, MELEE_RANGE, MELEE_HALF_ANGLE, ENEMY_FIRE_GAP, ENEMY_MELEE_GAP } from './combat.js';
import { chooseTarget } from './allybrain.js';
import { chooseCover } from './cover.js';
import { assignRoles, flankCandidates } from './squad.js';
import { BurnState, inFire } from './firelogic.js';
import { blastDamage } from './warlogic.js';

const CAP_R = 0.38, CAP_H = 1.75;               // corps d'un personnage : cylindre de 38 cm de rayon, 1,75 m de haut
const CHEST = 1.25, CHEST_CROUCH = 0.8;         // hauteur visée par les PNJ (debout, accroupi)
const PLAYER_RESPAWN = 5, SPAWN_PROTECTION = 3, CORPSE_FREEZE = 4;     // secondes (CORPSE_FREEZE : un PNJ mort n'est plus animé après sa chute)
const ENEMY_TRACER = 0xff7a4a, ALLY_TRACER = 0xa6ff7a;
const ACTIVE_R = 105, SLEEP_R = 125, FAR_R = 55;     // FAR_R : au-delà, un milicien est mis à jour une image sur deux et ne projette plus d'ombre (invisible de si loin)
const ACTIVE_R_ = 0; // (réservé)            // un milicien à plus de 125 m du joueur « dort » (ni mis à jour ni affiché) jusqu'à ce que le joueur revienne à moins de 105 m
const LEASH = 22;                               // un allié qui s'éloigne de plus de 22 m du joueur revient le rejoindre

export class Skirmish {
  constructor({ player, npcs, allies = [], world, tracer, hud = null, spawnPlayer, muzzleFx = null, bloodFx = null, sfx = null, smoke = null, seed = 7 }) {
    this.player = player; this.npcs = npcs; this.allies = []; this.world = world; this.tracer = tracer ?? (() => {});
    this.hud = hud; this.spawnPlayer = spawnPlayer; this.muzzleFx = muzzleFx; this.bloodFx = bloodFx; this.sfx = sfx; this.smoke = smoke;      // smoke : champ de bataille (zones en feu, flammes sur les personnages qui brûlent)
    this.zones = []; this.playerBurn = new BurnState();
    this.onLaunch = null;                         // appelé quand un lance-missiles tire : l'aviation se rabat sur lui (main.js)
    this.convoy = null;                           // le convoi de blindés (convoy.js) : cible des miliciens lance-missiles
          // sfx : effets sonores (facultatif)      // bloodFx : { hit(point, dir, amount), bleed(pos) } (effets de sang, facultatifs)
    this.rng = mulberry32(seed);
    this.hostile = true;                         // faux : les miliciens ne font que patrouiller et les alliés restent sur place (tests des autres scénarios)
    this.time = 0; this.pending = [];            // coups en attente : { at, run }
    this.kills = 0; this.allyKills = 0; this.respawnIn = 0; this.losTimer = 0; this.protectedFor = 0;     // protégé un moment après la réapparition
    this.playerSpeed = 0; this._lastPos = player.pos.clone();
    this.log = [];                               // événements, pour les tests : { t, type, ... }
    player.onAttack = (name) => this.playerAttack(name);
    for (const n of npcs) n.player.onAttack = (name) => this.npcAttack(n, name);
    allies.forEach((a) => this.addAlly(a));
    this.hud?.setHealth(1, player.health.hp);
    this.hud?.setKills(0);
  }

  addAlly(a) {
    this.allies.push(a);
    a.player.onAttack = (name) => this.allyAttack(a, name);
  }

  _log(type, o = {}) { this.log.push({ t: +this.time.toFixed(2), type, ...o }); if (this.log.length > 200) this.log.shift(); }
  get playerAlive() { return !this.player.health.dead; }
  _chest(pos, crouched = false) { return new THREE.Vector3(pos.x, pos.y + (crouched ? CHEST_CROUCH : CHEST), pos.z); }

  // ------------------------------------------------------------------ cibles (un « candidat » = un adversaire possible)
  _playerTarget() { const p = this.player; return { id: 'joueur', kind: 'player', x: p.pos.x, z: p.pos.z, pos: p.pos, speed: this.playerSpeed, crouched: !!p.state.crouch }; }
  _allyTarget(a) { return { id: a.id, kind: 'ally', x: a.player.pos.x, z: a.player.pos.z, pos: a.player.pos, speed: a._speed ?? 0, npc: a, crouched: !!a.player.state.crouch }; }
  _enemyTarget(n) { return { id: n.id, kind: 'enemy', x: n.player.pos.x, z: n.player.pos.z, pos: n.player.pos, speed: n._speed ?? 0, npc: n, crouched: !!n.player.state.crouch }; }

  /** Ligne de vue (de ses yeux à ceux de la cible) mise en cache 10 fois par seconde : les objets bas ne cachent pas. */
  _los(npc, target) {
    npc._losCache ??= new Map();
    const c = npc._losCache.get(target.id);
    if (c && c.t > this.time) return c.v;
    const np = npc.player.pos;
    const v = !this.world.blocked({ x: np.x, y: np.y + 1.6, z: np.z }, { x: target.pos.x, y: target.pos.y + 1.4, z: target.pos.z });
    npc._losCache.set(target.id, { v, t: this.time + 0.1 });
    return v;
  }

  // ------------------------------------------------------------------ attaques du joueur
  /** Le joueur tire. origin, dir : rayon de la caméra (le milieu de l'écran). Renvoie { point, npc, headshot, killed }. */
  playerShoot(origin, dir, weapon = 'rifle') {
    const out = { point: null, npc: null, headshot: false, killed: false };
    this._noise(this.player.pos, 1, 'joueur');
    let best = null;
    for (const n of this.npcs) {
      if (n.dead || n._asleep) continue;
      const g = n.player.pos;
      const r = rayCapsule(origin, dir, 150, { x: g.x, z: g.z, r: CAP_R, y0: g.y, y1: g.y + (n.player.state.crouch ? CAP_H * 0.65 : CAP_H) });
      if (r && (!best || r.t < best.r.t)) best = { n, r };
      if (this.hostile) {                                                          // une balle passe tout près d'un milicien : il esquive
        const ox = g.x - origin.x, oz = g.z - origin.z, along = ox * dir.x + oz * dir.z;
        if (along > 0 && along < 90 && Math.abs(ox * dir.z - oz * dir.x) / Math.max(1e-6, Math.hypot(dir.x, dir.z)) < 2.5) n.brain.underFire();
      }
    }
    if (!best) return out;
    const hit = new THREE.Vector3().copy(origin).addScaledVector(dir, best.r.t);
    const muzzle = this.player.muzzleWorld().pos;
    if (this.world.blocked(muzzle, hit)) return out;                              // un objet (mur, rocher...) est entre le canon et le PNJ
    const dmg = (PLAYER_DAMAGE[weapon] ?? PLAYER_DAMAGE.rifle) * (best.r.headshot ? PLAYER_DAMAGE.headshot : 1);
    out.point = hit; out.npc = best.n; out.headshot = best.r.headshot;
    out.killed = this.hurtNpc(best.n, dmg, best.r.headshot ? 'tir à la tête' : 'tir',
      { point: hit, dir: new THREE.Vector3(dir.x, dir.y, dir.z).normalize(), headshot: best.r.headshot }, { kind: 'player', pos: this.player.pos });
    return out;
  }

  /** Début d'une attaque du joueur (animation lancée) : le coup touchera un peu plus tard, si un milicien est encore devant lui. */
  playerAttack(name) {
    if (!(name in MELEE_DELAY)) return;
    this._noise(this.player.pos, 20, 'joueur');
    this.pending.push({ at: this.time + MELEE_DELAY[name] / this.player.animBoost, run: () => {      // l'impact arrive plus tôt si l'animation est plus rapide
      const p = this.player;
      if (p.state.dead) return;
      let best = null, bd = Infinity;
      for (const n of this.npcs) {
        if (n.dead || n._asleep) continue;
        const d = Math.hypot(n.player.pos.x - p.pos.x, n.player.pos.z - p.pos.z);
        if (d < bd && inCone(p.pos, p.yaw, n.player.pos, MELEE_RANGE, MELEE_HALF_ANGLE)) { best = n; bd = d; }
      }
      if (best) {
        const c = this._chest(best.player.pos), d = new THREE.Vector3(best.player.pos.x - p.pos.x, 0.1, best.player.pos.z - p.pos.z).normalize();
        this.hurtNpc(best, PLAYER_DAMAGE[name], name, { point: c, dir: d }, { kind: 'player', pos: p.pos });
      }
    } });
  }

  /** Un milicien reçoit des dégâts. by : { kind: 'player' | 'ally', pos } (qui le touche). Renvoie vrai si le coup est fatal. */
  hurtNpc(npc, dmg, how = 'tir', fx = null, by = { kind: 'player', pos: this.player.pos }) {
    const res = npc.health.damage(dmg);
    if (fx && this.bloodFx && res.dealt > 0) this.bloodFx.hit(fx.point, fx.dir, Math.min(1.5, dmg / 40 + (fx.headshot ? 0.5 : 0) + (res.died ? 0.6 : 0)));   // sang à l'impact, dans le sens du tir
    if (fx && res.dealt > 0) this.sfx?.play('impact_flesh', { pos: fx.point });
    this._log('npc_touche', { id: npc.id, dmg, how, hp: npc.health.hp, par: by.kind });
    if (res.died) {
      npc.die();
      if (by.kind === 'player') { this.kills++; this.hud?.setKills(this.kills); } else this.allyKills++;
      this.pending.push({ at: this.time + 0.9, run: () => this.bloodFx?.bleed(npc.player.pos) });     // la mare se forme une fois le PNJ au sol
      this._log('npc_mort', { id: npc.id, par: by.kind });
      for (const o of this.npcs) if (o !== npc && !o.dead) {                // les miliciens proches sont alertés, et leur moral en prend un coup
        const od = Math.hypot(o.player.pos.x - npc.player.pos.x, o.player.pos.z - npc.player.pos.z);
        if (od < 45) { o.brain.alarm(by.pos); o.brain.mind?.onAllyDown(od); }
      }
    } else if (this.hostile) npc.brain.hit(by.pos, dmg);
    if (by.kind === 'player') { this.hud?.hitMarker(res.died); this.sfx?.play(res.died ? 'kill' : 'hit_tick'); }
    return res.died;
  }

  /** Bruit à `pos` (tir, bagarre) : les PNJ de l'autre camp à moins de leur portée d'écoute vont voir.
   *  from : 'joueur' ou 'allie' -> les miliciens entendent ; 'milicien' -> les alliés entendent. */
  _noise(pos, scale = 1, from = 'joueur') {
    if (!this.hostile) return;
    const listeners = from === 'milicien' ? this.allies : this.npcs;
    for (const n of listeners) {
      if (n.dead || n._asleep) continue;
      const d = Math.hypot(n.player.pos.x - pos.x, n.player.pos.z - pos.z);
      n.brain.hear(pos, d / scale);
    }
  }

  // ------------------------------------------------------------------ attaques des PNJ (miliciens et alliés)
  /** Tir d'un PNJ sur une cible (candidat). Les miliciens tirent sur le joueur ou un allié ; les alliés sur un milicien. */
  npcShoot(npc, target, team) {
    const p = npc.player;
    if (p.onShot() === 'reload') this.sfx?.play(p.state.weapon === 'pistol' ? 'reload_pistol' : 'reload_rifle', { pos: p.pos, vol: 0.9 });          // dernier coup du chargeur : il recharge
    const mz = p.muzzleWorld();
    const tgt = this._chest(target.pos, target.crouched);
    const dist = Math.hypot(tgt.x - mz.pos.x, tgt.z - mz.pos.z);
    const blocked = this.world.blocked(mz.pos, tgt);
    target.npc?.brain.underFire();                                                // la cible entend siffler les balles : elle esquive
    const hit = !blocked && this.rng() < hitChance(dist, target.speed ?? 0, { crouched: target.crouched });
    const end = hit ? tgt : tgt.clone().add(new THREE.Vector3((this.rng() - 0.5) * 3, (this.rng() - 0.3) * 1.4, (this.rng() - 0.5) * 3));
    this.muzzleFx?.(mz.pos, mz.dir);                                          // flamme à la bouche du canon du PNJ
    this.tracer(mz.pos, blocked ? mz.pos.clone().lerp(tgt, 0.6) : end, team === 'ally' ? ALLY_TRACER : ENEMY_TRACER);
    this._log(team === 'ally' ? 'allie_tir' : 'npc_tir', { id: npc.id, cible: target.id, hit, dist: +dist.toFixed(1) });
    this._noise(npc.player.pos, 1, team === 'ally' ? 'allie' : 'milicien');
    if (target.kind === 'player') this.hud?.shotFrom(npc.id, npc.player.pos, hit ? 1 : 0.7);     // arc jaune du côté du tireur
    if (!hit && !blocked && target.kind === 'player') this.sfx?.play('whiz', { pos: end });          // la balle siffle à côté du joueur
    if (!hit) return;
    npc.brain.mind?.onSuccess(false);
    if (target.kind === 'player') this.hurtPlayer(NPC_DAMAGE.rifle, npc.player.pos);
    else if (target.kind === 'ally') this.hurtAlly(target.npc, NPC_DAMAGE.rifle, npc.player.pos);
    else if (target.kind === 'enemy') {
      const d = new THREE.Vector3(tgt.x - mz.pos.x, tgt.y - mz.pos.y, tgt.z - mz.pos.z).normalize();
      if (this.hurtNpc(target.npc, ALLY_DAMAGE.rifle, 'tir', { point: tgt, dir: d }, { kind: 'ally', pos: npc.player.pos })) npc.brain.mind?.onSuccess(true);
    }
  }

  /** Attaque au corps à corps d'un milicien : touche la cible choisie si elle est encore devant lui. */
  npcAttack(npc, name) {
    if (!(name in MELEE_DELAY)) return;
    this.pending.push({ at: this.time + MELEE_DELAY[name], run: () => {
      const t = npc._target;
      if (npc.dead || !t) return;
      if (!inCone(npc.player.pos, npc.player.yaw, t.pos, MELEE_RANGE + 0.3, MELEE_HALF_ANGLE + 0.2)) return;
      this._log('npc_coup', { id: npc.id, cible: t.id });
      if (t.kind === 'player') { if (!this.playerAlive) return; this.hud?.shotFrom(npc.id, npc.player.pos, 1); this.hurtPlayer(NPC_DAMAGE.melee, npc.player.pos, true); }
      else if (t.kind === 'ally') this.hurtAlly(t.npc, NPC_DAMAGE.melee, npc.player.pos, true);
    } });
  }

  /** Attaque au corps à corps d'un allié sur un milicien devant lui. */
  allyAttack(ally, name) {
    if (!(name in MELEE_DELAY)) return;
    this.pending.push({ at: this.time + MELEE_DELAY[name], run: () => {
      if (ally.dead) return;
      let best = null, bd = Infinity;
      for (const n of this.npcs) {
        if (n.dead) continue;
        const d = Math.hypot(n.player.pos.x - ally.player.pos.x, n.player.pos.z - ally.player.pos.z);
        if (d < bd && inCone(ally.player.pos, ally.player.yaw, n.player.pos, MELEE_RANGE + 0.3, MELEE_HALF_ANGLE + 0.2)) { best = n; bd = d; }
      }
      if (best) {
        const c = this._chest(best.player.pos), d = new THREE.Vector3(best.player.pos.x - ally.player.pos.x, 0.1, best.player.pos.z - ally.player.pos.z).normalize();
        this._log('allie_coup', { id: ally.id, cible: best.id });
        this.hurtNpc(best, ALLY_DAMAGE.melee, name, { point: c, dir: d }, { kind: 'ally', pos: ally.player.pos });
      }
    } });
  }

  /** Le joueur reçoit des dégâts. heavy : coup au corps à corps (il sursaute). */
  hurtPlayer(dmg, from, heavy = false) {
    if (!this.playerAlive || this.protectedFor > 0) return;
    const res = this.player.health.damage(dmg);
    this.onHurt?.(dmg);
    this.hud?.flashHurt();
    this.sfx?.play(this.player.health.dead ? 'death' : 'hurt');
    this.hud?.setHealth(this.player.health.frac, this.player.health.hp);
    this._log('joueur_touche', { dmg, hp: this.player.health.hp });
    if (res.died) {
      this.player.die(); this.respawnIn = PLAYER_RESPAWN;
      this.hud?.toast(`Vous êtes tombé. Réapparition dans ${PLAYER_RESPAWN} s...`, PLAYER_RESPAWN * 1000);
      this._log('joueur_mort');
    } else if (heavy) this.player._startOverlay('Hit Reaction');
  }

  /** Un allié reçoit des dégâts d'un milicien (from : sa position). Il se retourne vers lui ; mort, il le reste. */
  hurtAlly(ally, dmg, from, heavy = false) {
    if (ally.dead || ally.boarded) return;
    const res = ally.health.damage(dmg);
    this._log('allie_touche', { id: ally.id, dmg, hp: ally.health.hp });
    if (res.died) {
      ally.die();
      this.hud?.toast('Un allié est tombé', 2200);
      this.pending.push({ at: this.time + 0.9, run: () => this.bloodFx?.bleed(ally.player.pos) });
      this._log('allie_morte', { id: ally.id });
      for (const o of this.allies) if (o !== ally && !o.dead) o.brain.mind?.onAllyDown(Math.hypot(o.player.pos.x - ally.player.pos.x, o.player.pos.z - ally.player.pos.z));
    } else this.hostile && ally.brain.hit(from, dmg);
  }

  // ------------------------------------------------------------------ le feu brûle
  /** Le joueur et les PNJ qui sont dans les flammes perdent des points de vie petit à petit (et brûlent encore un moment après en être sortis). */
  _burn(dt) {
    const z = this.zones, p = this.player;
    // joueur
    if (this.playerAlive) {
      const r = this.playerBurn.update(dt, !!inFire(p.pos, z));
      if (r.started && this.protectedFor <= 0) this.hud?.toast('Vous brûlez ! Sortez des flammes', 1600);
      if (r.burning) this._flames(this.playerBurn, p.pos, dt);
      if (r.dmg > 0 && this.protectedFor <= 0) this._burnPlayer(r.dmg, dt);
    } else this.playerBurn = new BurnState();
    // PNJ : miliciens et alliés. Seuls ceux qui sont pris par une explosion brûlent (les autres contournent le feu)
    if (!z.length && !this._anyBurning) return;
    this._anyBurning = false;
    for (const n of this.npcs) this._burnNpc(n, z, dt, false);
    for (const a of this.allies) this._burnNpc(a, z, dt, true);
  }

  _flames(st, pos, dt) {
    st.acc += 22 * dt;
    while (st.acc >= 1) { st.acc -= 1; this.smoke?.flameBody(pos.x, pos.y, pos.z); }
  }

  _burnPlayer(dmg, dt) {
    const hp = this.player.health;
    const res = hp.damage(dmg);
    this.hud?.setHealth(hp.frac, hp.hp);
    const st = this.playerBurn; st.cry -= dt;
    if (st.cry <= 0 || res.died) { st.cry = 1.1; this.hud?.flashHurt(); this.sfx?.play(res.died ? 'death' : 'hurt'); }
    if (res.died) {
      this.player.die(); this.respawnIn = PLAYER_RESPAWN;
      this.hud?.toast(`Vous avez brûlé. Réapparition dans ${PLAYER_RESPAWN} s...`, PLAYER_RESPAWN * 1000);
      this._log('joueur_mort', { par: 'feu' });
    }
  }

  _burnNpc(n, z, dt, ally) {
    if (n.dead || n._asleep || n.boarded) return;
    const st = (n._burn ??= new BurnState());
    const r = st.update(dt, !!inFire(n.player.pos, z));
    if (!r.burning) return;
    this._anyBurning = true;
    this._flames(st, n.player.pos, dt);
    if (r.started) this._log(ally ? 'allie_brule' : 'npc_brule', { id: n.id });
    if (r.dmg <= 0) return;
    const res = this._envHurt(n, r.dmg, ally, 'feu');
    st.cry -= dt;
    if (st.cry <= 0 && !res.died) { st.cry = 1.4; this.sfx?.play('hurt', { pos: n.player.pos, vol: 0.8 }); }
  }

  /** Dégâts du décor (feu, explosion) sur un PNJ ; how : 'feu' | 'explosion'. Renvoie { dealt, died }. */
  _envHurt(n, dmg, ally, how) {
    const res = n.health.damage(dmg);
    if (res.died) {
      n.die();
      this.sfx?.play('death', { pos: n.player.pos, vol: 0.8 });
      if (ally) this.hud?.toast(how === 'feu' ? 'Un allié a brûlé' : 'Un allié est tombé', 2200);
      this.pending.push({ at: this.time + 0.9, run: () => this.bloodFx?.bleed(n.player.pos) });
      this._log(ally ? 'allie_morte' : 'npc_mort', { id: n.id, par: how });
    }
    return res;
  }

  /** Une explosion de taille `scale` en pos : blesse (ou tue) le joueur et les PNJ proches, et alerte les miliciens des environs. */
  blast(pos, scale = 1) {
    const p = this.player, dy = (q) => Math.abs((q.y ?? pos.y) - pos.y);
    const pd = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
    const pdmg = dy(p.pos) < 8 ? blastDamage(pd, scale) : 0;
    if (pdmg > 1 && this.playerAlive) this.hurtPlayer(pdmg, pos, pdmg > 25);
    let hit = 0;
    for (const [list, ally] of [[this.npcs, false], [this.allies, true]]) for (const n of list) {
      if (n.dead || n._asleep) continue;
      const d = Math.hypot(n.player.pos.x - pos.x, n.player.pos.z - pos.z), dmg = dy(n.player.pos) < 8 ? blastDamage(d, scale) : 0;
      if (dmg > 1) { this._envHurt(n, dmg, ally, 'explosion'); hit++; if (!n.dead) n.brain.hit?.(pos, dmg); }
      else if (!ally && this.hostile && d < 70 && !n.dead) n.brain.alarm(pos);          // l'explosion les met en alerte
    }
    this._log('explosion', { d: +pd.toFixed(1), joueur: +pdmg.toFixed(1), pnj: hit });
  }

  // ------------------------------------------------------------------ sommeil des miliciens lointains et choix d'un abri
  /** Un milicien loin du joueur ne coûte rien : ni mis à jour ni affiché. Renvoie vrai s'il est endormi. */
  _sleeping(n) {
    const p = this.player.pos, q = n.player.pos;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    n._dist = d;
    if (n._asleep === undefined) n._asleep = d > SLEEP_R;
    else if (n._asleep && d < ACTIVE_R) n._asleep = false;
    else if (!n._asleep && d > SLEEP_R) n._asleep = true;
    if (n.player.root.visible === n._asleep) n.player.root.visible = !n._asleep;
    return n._asleep;
  }

  /** Cherche un abri pour `npc` contre `target` (le candidat visé). Utilise la géométrie du monde : atteignable, caché accroupi, caché debout ou non. */
  _findCover(npc, target, team, opts = {}) {
    const w = this.world, np = npc.player.pos;
    const tp = target.pos ?? np;
    const eye = { x: target.x, y: tp.y + 1.6, z: target.z };
    const taken = team.filter((o) => o !== npc && !o.dead && o.brain.coverPt).map((o) => o.brain.coverPt);
    const gy = (x, z) => w.groundY(x, z);
    const c = chooseCover({
      ...opts, pos: { x: np.x, z: np.z }, threat: { x: target.x, z: target.z }, avoid: taken, phase: npc._coverPhase = ((npc._coverPhase ?? 0) + 0.7) % 6.283,
      walkable: (x, z) => {
        const g = gy(x, z);
        if (Math.abs(g - np.y) > 1.5) return false;                                            // pas de falaise ni de toit
        if (this.zones.length && inFire({ x, z, y: g }, this.zones, 2)) return false;           // pas d'abri dans les flammes
        if (w.mesh && w.mesh.insideObject(x, g + 0.9, z) >= 0) return false;                   // pas dans un objet
        return !w.blocked({ x: np.x, y: np.y + 0.5, z: np.z }, { x, y: g + 0.5, z });          // trajet direct dégagé
      },
      hiddenCrouched: (x, z) => w.blocked(eye, { x, y: gy(x, z) + 1.0, z }),
      hiddenStanding: (x, z) => w.blocked(eye, { x, y: gy(x, z) + 1.5, z }),
    });
    if (c) this._log(team === this.allies ? 'allie_abri' : 'npc_abri', { id: npc.id, low: c.low, d: +c.travel.toFixed(1), repli: !!opts.minThreat });
    return c;
  }

  /** Point de contournement praticable sur le côté `side` de l'adversaire : libre, hors des flammes, atteignable en ligne droite, et d'où on voit l'adversaire. */
  _findFlank(npc, target, side) {
    const w = this.world, np = npc.player.pos, tp = target.pos ?? np;
    const eye = { x: target.x, y: tp.y + 1.6, z: target.z };
    for (const c of flankCandidates({ x: np.x, z: np.z }, { x: target.x, z: target.z }, side)) {
      const g = w.groundY(c.x, c.z);
      if (Math.abs(g - np.y) > 4) continue;
      if (this.zones.length && inFire({ x: c.x, z: c.z, y: g }, this.zones, 2)) continue;
      if (w.mesh && w.mesh.insideObject(c.x, g + 0.9, c.z) >= 0) continue;
      if (w.blocked({ x: np.x, y: np.y + 0.5, z: np.z }, { x: c.x, y: g + 0.5, z: c.z })) continue;          // trajet direct dégagé
      if (w.blocked(eye, { x: c.x, y: g + 1.4, z: c.z })) continue;                                          // de là, il verra l'adversaire
      this._log(npc.team === 'ally' ? 'allie_flanc' : 'npc_flanc', { id: npc.id, side, d: +Math.hypot(c.x - np.x, c.z - np.z).toFixed(1) });
      return c;
    }
    return null;
  }

  _navApi(npc) {
    npc._navApi ??= { flank: (side) => (npc._target ? this._findFlank(npc, npc._target, side) : null) };
    return npc._navApi;
  }

  /** Coordination de chaque camp : qui couvre, qui contourne (squad.js), et ce que chacun sait de la situation (camarades proches, adversaires en vue). */
  _squads(dt) {
    this._squadT = (this._squadT ?? 0) - dt;
    if (this._squadT > 0) return;
    this._squadT = 0.5;
    this._roles ??= { enemy: {}, ally: {} };
    for (const [list, key, foes] of [[this.npcs, 'enemy', () => [this._playerTarget(), ...this.allies.filter((a) => !a.dead).map((a) => this._allyTarget(a))]],
                                      [this.allies, 'ally', () => this.npcs.filter((n) => !n.dead && !n._asleep).map((n) => this._enemyTarget(n))]]) {
      const alive = list.filter((n) => !n.dead && !n._asleep);
      const foeList = key === 'enemy' && !this.playerAlive ? foes().slice(1) : foes();
      const engaged = alive.filter((n) => n._target && (n.brain.state === 'engage' || n.brain.state === 'alert' || n.brain.state === 'hurt') && n.brain.mind);
      const byTarget = new Map();
      for (const n of engaged) { const k = n._target.id; if (!byTarget.has(k)) byTarget.set(k, []); byTarget.get(k).push(n); }
      const roles = {};
      for (const [, group] of byTarget) {
        const t = group[0]._target;
        const r = assignRoles(group.map((n) => ({ id: n.id, x: n.player.pos.x, z: n.player.pos.z, courage: n.brain.mind.traits.courage, teamwork: n.brain.mind.traits.teamwork })),
                              { x: t.x, z: t.z }, this._roles[key]);
        Object.assign(roles, r);
      }
      this._roles[key] = roles;
      for (const n of alive) {
        const q = n.player.pos;
        const friends = alive.filter((o) => o !== n && Math.hypot(o.player.pos.x - q.x, o.player.pos.z - q.z) < 30).length;
        const foesNear = foeList.filter((f) => Math.hypot(f.x - q.x, f.z - q.z) < 40).length;
        const r = roles[n.id];
        n._tactics = { friends, foes: Math.max(1, foesNear), role: r?.role ?? 'solo', side: r?.side ?? 0 };
      }
    }
  }

  /** Un PNJ qui vient de repérer l'adversaire prévient ses camarades par radio : ils viennent vers l'endroit indiqué (à quelques mètres près, après un court délai). */
  _callout(npc, target, team) {
    for (const m of team) {
      if (m === npc || m.dead || m._asleep) continue;
      const d = Math.hypot(m.player.pos.x - npc.player.pos.x, m.player.pos.z - npc.player.pos.z);
      if (d > 70) continue;
      this.pending.push({ at: this.time + 0.35 + d / 90, run: () => { if (!m.dead) m.brain.intel({ x: target.x, z: target.z }, 3 + d * 0.06); } });
    }
    this._log(team === this.allies ? 'allie_radio' : 'npc_radio', { id: npc.id });
  }

  _coverApi(npc, team) {
    npc._coverApi ??= { find: (target, opts) => this._findCover(npc, npc._target ?? target, team, opts) };
    return npc._coverApi;
  }

  // ------------------------------------------------------------------ miliciens lance-missiles
  /** Un milicien lance-missiles (def.launcher) tranquille repère un blindé du convoi à portée, le vise pendant `aim` secondes puis tire un missile devant lui (il anticipe sa course, avec une
   *  marge d'erreur qui grandit avec la distance), puis recharge. Renvoie vrai s'il s'occupe de lui-même ce tour (visée, tir) : le cerveau normal est alors suspendu. */
  _launchStep(n, dt) {
    const cv = this.convoy, sm = this.smoke, cfg = cv?.cfg?.launcher ?? {};
    if (!cv || !sm?.enabled || !this.hostile || n.brain.state !== 'patrol') { n._launch = null; return false; }
    n._launchCd = (n._launchCd ?? 2 + this.rng() * 6) - dt;
    const eye = n.player.pos;
    if (!n._launch) {
      if (n._launchCd > 0) return false;
      const target = this._launchTarget(n, cfg.min ?? 30, cfg.max ?? 120);
      if (!target) { n._launchCd = 1.2; return false; }
      n._launch = { t: 0, target, fired: false };
    }
    const L = n._launch, pos = L.target.pos();
    const dx = pos.x - eye.x, dz = pos.z - eye.z, d = Math.hypot(dx, dz);
    if (!L.target.alive() || d > (cfg.max ?? 120) + 15) { n._launch = null; n._launchCd = 2; return false; }
    L.t += dt;
    const aimPt = new THREE.Vector3(pos.x, pos.y + 1.6, pos.z);
    n.update(dt, this.world, { mode: 'alert', heading: Math.atan2(dx, dz), moveX: 0, moveY: 0, aim: true, fire: false, melee: false, crouch: false }, aimPt);
    if (!L.fired && L.t >= (cfg.aim ?? 1.8) && Math.abs(((Math.atan2(dx, dz) - n.player.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.5) {
      L.fired = true;
      const mz = n.player.muzzleWorld().pos, v = L.target.speed(), h = L.target.heading();
      const dur = Math.max(2.2, Math.min(5, Math.hypot(pos.x - mz.x, pos.z - mz.z) / 190));       // même durée de vol que dans SmokeSystem.launchMissile
      const err = 0.8 + d * 0.02, a = this.rng() * Math.PI * 2, r = this.rng() * err;
      const to = { x: pos.x + Math.sin(h) * v * dur + Math.cos(a) * r, z: pos.z + Math.cos(h) * v * dur + Math.sin(a) * r };
      sm.launchMissile(to, dur, { x: mz.x, y: mz.y, z: mz.z });
      this.muzzleFx?.(mz, new THREE.Vector3(dx, 0.2, dz).normalize());
      this._log('npc_missile', { id: n.id, d: +d.toFixed(0), erreur: +err.toFixed(1) });
      n._firedAt = this.time;
      this.pending.push({ at: this.time + 5 + this.rng() * 4, run: () => { if (!n.dead) this.onLaunch?.({ x: n.player.pos.x, z: n.player.pos.z }); } });      // quelques secondes plus tard, les avions arrivent sur lui
      const rl = cfg.reload ?? [10, 16];
      n._launchCd = rl[0] + this.rng() * (rl[1] - rl[0]);
    }
    if (L.t >= (cfg.aim ?? 1.8) + 1.2) n._launch = null;                                              // il baisse l'arme et reprend sa ronde
    return true;
  }

  /** Où les avions tirent : un milicien ou un groupe de miliciens, loin du joueur et des alliés (pas de tir fratricide). Priorité aux lance-missiles qui viennent de tirer, puis aux groupes les plus fournis.
   *  Renvoie { x, z } ou null. */
  airTarget(player) {
    const px = this.player.pos.x, pz = this.player.pos.z, friends = [{ x: px, z: pz }, ...this.allies.filter((a) => !a.dead).map((a) => ({ x: a.player.pos.x, z: a.player.pos.z }))];
    const live = this.npcs.filter((n) => !n.dead && !n._asleep);
    let best = null, bs = -1;
    for (const n of live) {
      const q = n.player.pos, d = Math.hypot(q.x - px, q.z - pz);
      if (d < 40 || d > 280 || friends.some((f) => Math.hypot(f.x - q.x, f.z - q.z) < 30)) continue;
      const group = live.filter((o) => Math.hypot(o.player.pos.x - q.x, o.player.pos.z - q.z) < 14).length;
      const score = (n._firedAt !== undefined && this.time - n._firedAt < 60 ? 10 : 0) + group + (n.brain.state === 'engage' ? 1 : 0) + this.rng() * 0.5;
      if (score > bs) { bs = score; best = { x: q.x, z: q.z }; }
    }
    return best;
  }

  /** Le blindé vivant le plus proche, à portée, qu'il voit (ligne de vue dégagée du lanceur jusqu'au toit du blindé). */
  _launchTarget(n, min, max) {
    const cv = this.convoy, e = n.player.pos;
    let best = null, bd = Infinity;
    cv.items.forEach((it, i) => {
      if (it.v.state === 'neutralise') return;
      const p = it.root.position, d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d < min || d > max || d >= bd) return;
      if (this.world.blocked({ x: e.x, y: e.y + 1.5, z: e.z }, { x: p.x, y: p.y + 3.2, z: p.z })) return;
      bd = d; best = { pos: () => it.root.position, alive: () => it.v.state !== 'neutralise', speed: () => it.v.v, heading: () => it.heading };
    });
    return best;
  }

  // ------------------------------------------------------------------ boucle
  _speeds(dt) {
    for (const n of [...this.npcs, ...this.allies]) {
      n._last ??= n.player.pos.clone();
      n._speed = n._last.distanceTo(n.player.pos) / Math.max(dt, 1e-3);
      n._last.copy(n.player.pos);
    }
  }

  update(dt) {
    this.time += dt;
    this.protectedFor -= dt;
    const p = this.player;
    this.playerSpeed = this._lastPos.distanceTo(p.pos) / Math.max(dt, 1e-3); this._lastPos.copy(p.pos);
    this._speeds(dt);
    this.zones = this.smoke?.burnZones() ?? [];
    this._burn(dt);

    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].at <= this.time) { const q = this.pending[i]; this.pending.splice(i, 1); q.run(); }
    }
    if (p.health.dead && this.respawnIn > 0) {
      this.respawnIn -= dt;
      if (this.respawnIn <= 0) {
        p.revive(); this.spawnPlayer?.(p); this.protectedFor = SPAWN_PROTECTION;
        this.hud?.setHealth(1, p.health.hp); this._log('joueur_reapparait');
      }
    }
    this._squads(dt);
    this._updateEnemies(dt);
    this._updateAllies(dt);
  }

  /** Miliciens : cible = le joueur ou un allié (le plus proche visible). */
  _updateEnemies(dt) {
    const p = this.player;
    for (const n of this.npcs) {
      const np = n.player;
      n.fireZones = this.zones;
      if (this._sleeping(n)) continue;                                                       // trop loin : il ne coûte rien
      if (n.def.launcher && !n.dead && this._launchStep(n, dt)) continue;                    // lance-missiles : il vise le convoi et tire
      // loin du joueur : une image sur deux (le pas de temps s'accumule : l'animation reste fluide) et pas d'ombre
      const far = n._dist > FAR_R;
      if (far !== !!n._far) { n._far = far; n.player.model.traverse((o) => { if (o.isMesh) o.castShadow = !far; }); }
      n._acc = (n._acc ?? 0) + dt; n._skip = !n._skip;
      if (far && n._skip) continue;
      const step = n._acc; n._acc = 0;
      if (n.dead) {                                                                           // il reste mort pour de bon ; après sa chute il n'est plus animé
        n.deadFor = (n.deadFor ?? 0) + step;
        if (n.deadFor < CORPSE_FREEZE) n.update(step, this.world, { mode: 'dead' });
        continue;
      }
      if (!this.hostile) { n.update(step, this.world); continue; }
      const cands = [];
      if (this.playerAlive) cands.push(this._playerTarget());
      for (const a of this.allies) if (!a.dead && !a.boarded) cands.push(this._allyTarget(a));
      const ch = chooseTarget(np.pos, cands, (c) => this._los(n, c), { range: n.brain.sight, previous: n._target?.id });
      const t = ch ? ch.target : null;
      n._target = t;
      const before = n.brain.state;
      const cmd = n.brain.update(step, {
        pos: { x: np.pos.x, z: np.pos.z }, yaw: np.yaw,
        player: t ? { x: t.x, z: t.z, alive: true, speed: t.speed } : { x: p.pos.x, z: p.pos.z, alive: false, speed: 0 },
        canSee: !!ch && ch.visible, hpFrac: n.health.frac, cover: this._coverApi(n, this.npcs), nav: this._navApi(n), tactics: n._tactics });
      if (t && ch.visible && (before === 'patrol' || before === 'search') && n.brain.state === 'alert') this._callout(n, t, this.npcs);      // il a repéré l'adversaire : radio
      if (cmd.melee && n.meleeCd > 0) cmd.melee = false;                                    // une attaque toutes les 0,9 s
      const aiming = t && cmd.mode !== 'patrol' && cmd.mode !== 'search' && cmd.mode !== 'dead' && !(cmd.mode === 'cover' && !cmd.aim);
      n.update(step, this.world, cmd, aiming ? this._chest(t.pos, t.crouched) : null);
      if (cmd.melee && np.state.overlay) n.meleeCd = ENEMY_MELEE_GAP;
      if (t && cmd.fire && n.fireCd <= 0 && np.state.firing && np.canShoot()) { n.fireCd = ENEMY_FIRE_GAP; this.npcShoot(n, t, 'enemy'); }
    }
  }

  /** Point à 30 m devant un personnage (cap : angle autour de Y), à hauteur de poitrine : où pointe son canon quand il n'a pas de cible. */
  _ahead(pos, heading) { return new THREE.Vector3(pos.x + Math.sin(heading) * 30, pos.y + 1.4, pos.z + Math.cos(heading) * 30); }

  /** Alliés : ils suivent le joueur ; ils repèrent, poursuivent et combattent les miliciens. */
  _updateAllies(dt) {
    const p = this.player;
    const leader = { x: p.pos.x, z: p.pos.z, yaw: p.yaw };
    for (const a of this.allies) {
      const ap = a.player;
      a.fireZones = this.zones;
      if (a.boarded) continue;                                                              // à bord du blindé : c'est le blindé qui le déplace (boarding.js)
      if (a.dead) {
        a.deadFor = (a.deadFor ?? 0) + dt;
        if (a.deadFor < CORPSE_FREEZE) a.update(dt, this.world, { mode: 'dead' });
        continue;
      }
      if (!this.hostile) { a.update(dt, this.world, { mode: 'follow', moveX: 0, moveY: 0, heading: ap.yaw, ready: true }, this._ahead(ap.pos, ap.yaw)); continue; }     // tests : il reste sur place
      const cands = [];
      for (const n of this.npcs) if (!n.dead && !n._asleep) cands.push(this._enemyTarget(n));
      const ch = chooseTarget(ap.pos, cands, (c) => this._los(a, c), { range: a.brain.sight, previous: a._target?.id });
      const t = ch && ch.visible ? ch.target : null;                                         // un allié ne poursuit que ce qu'il voit
      a._target = t;
      const toLeader = Math.hypot(leader.x - ap.pos.x, leader.z - ap.pos.z);
      const before = a.brain.state;
      let cmd = a.brain.update(dt, {
        pos: { x: ap.pos.x, z: ap.pos.z }, yaw: ap.yaw,
        player: t ? { x: t.x, z: t.z, alive: true, speed: t.speed } : { x: leader.x, z: leader.z, alive: false, speed: 0 },
        canSee: !!t, hpFrac: a.health.frac, cover: this._coverApi(a, this.allies), nav: this._navApi(a), tactics: a._tactics });
      if (t && (before === 'patrol' || before === 'search') && a.brain.state === 'alert') this._callout(a, t, this.allies);
      const fighting = cmd.mode === 'engage' || cmd.mode === 'melee' || cmd.mode === 'alert' || cmd.mode === 'hurt' || cmd.mode === 'cover';
      if (!fighting || toLeader > LEASH) cmd = a.follower.command(ap.pos, leader, dt);          // sinon (ou trop loin du joueur) : il suit
      if (cmd.melee && a.meleeCd > 0) cmd.melee = false;
      const aiming = t && fighting && toLeader <= LEASH && !(cmd.mode === 'cover' && !cmd.aim);
      a.update(dt, this.world, cmd, aiming ? this._chest(t.pos, t.crouched) : cmd.ready ? this._ahead(ap.pos, cmd.heading) : null);     // sans cible : le canon pointe droit devant lui
      if (cmd.melee && ap.state.overlay) a.meleeCd = 1.3;
      if (t && cmd.fire && a.fireCd <= 0 && ap.state.firing && ap.canShoot()) { a.fireCd = 0.2; this.npcShoot(a, t, 'ally'); }
    }
  }
}
