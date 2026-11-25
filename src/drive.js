// Conduire un blindé : le joueur s'approche, un bouton « Entrer » apparaît ; il monte, ses alliés montent aussi (l'un se place au poste de tir sur le toit, les autres s'installent à l'intérieur),
// puis l'interface de conduite s'affiche (vitesse, commandes clavier et manette). Les véhicules sont décrits dans config/drive.json.
//  - DriveVehicle : un véhicule (modèle 3D, roues, collision mobile, passagers) ;
//  - DriveSystem : tous les véhicules, le bouton « Entrer » et le véhicule conduit en ce moment ;
//  - la physique de conduite est dans drivelogic.js (logique pure, testée sans navigateur).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { Driving, driveCommands } from './drivelogic.js';
import { rideOnSurface, smoothAngle } from './vehicle.js';
import { corridorMesh } from './road.js';
import { tuneVehicle } from './vehiclefx.js';
import { ASSET_VERSION } from './version.js';

const UP = new THREE.Vector3(0, 1, 0);
const NEAR_R = 70;                  // rayon (m) du morceau de sable gardé autour du véhicule pour lire le vrai sol sous les roues
const WALK_INPUT = { moveX: 0, moveY: 1, aim: false, fire: false, sprint: false };

export class DriveVehicle {
  /** def : { id, pos: [x, z], yaw } ; cfg : config/drive.json ; gltf : le modèle du blindé. */
  constructor({ def, cfg, gltf = null, root = null, prop = null, scene, world, player, getAllies, hud, skirmish, flags = null }) {
    Object.assign(this, { def, cfg, world, player, getAllies, hud, skirmish });
    if (root) {                                                    // un décor déjà posé dans le monde (props.json) : on le conduit tel quel
      this.root = root;
      if (prop?.colHandle) { world.removeCollision?.(prop.colHandle); prop.colHandle = null; }      // sa collision statique disparaît : c'est la boîte mobile qui le protège
      if (prop?.collider) { const i = world.colliders?.indexOf(prop.collider) ?? -1; if (i >= 0) world.colliders.splice(i, 1); prop.collider = null; }
    } else {
      this.root = clone(gltf.scene);
      this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      tuneVehicle(this.root);                                      // peinture un peu métallisée, reflet de ciel
      scene.add(this.root);
    }
    this.wheels = ['Roue_AVG', 'Roue_AVD', 'Roue_ARG', 'Roue_ARD'].map((n) => this.root.getObjectByName(n));
    this.base = this.wheels.map((w) => w?.position.y ?? 0); this.susp = this.wheels.map(() => 0); this.wheelAngle = 0;
    this.box = { t: 'b', x: 0, y: 0, hx: cfg.box?.[0] ?? 2.1, hy: cfg.box?.[1] ?? 5.0, yaw: 0 };          // collision mobile : les autres personnages le contournent
    world.addDynamic?.(this.box);
    this.drv = new Driving(cfg.physics ?? {});
    this.drv.place(def.pos[0], def.pos[1], def.yaw ?? 0);
    this.state = 'parked';                                         // parked -> boarding -> driving -> parked
    this.occ = [];                                                 // passagers : { actor, gunner, phase, t }
    this.t = 0; this.y = undefined; this.pitch = 0; this.roll = 0;
    this._ray = new THREE.Raycaster(); this._ray.firstHitOnly = true; this._from = new THREE.Vector3(); this._down = new THREE.Vector3(0, -1, 0);
    this._near = null; this._nearC = null;
    this.camYawOff = 0; this.lookIdle = 0; this.camYaw = this.drv.heading;
    this.v3 = new THREE.Vector3(); this.v3b = new THREE.Vector3();
    this._pose(true);
    this.flag = flags?.add(this.root, cfg.flag, () => [Math.sin(this.drv.heading) * this.drv.v, Math.cos(this.drv.heading) * this.drv.v]);      // drapeau du Mali sur l'antenne
  }

  get driving() { return this.state === 'driving'; }
  get busy() { return this.state !== 'parked'; }
  get pos() { return this.root.position; }
  local(x, y, z, out = new THREE.Vector3()) { return this.root.localToWorld(out.set(x, y, z)); }        // (la matrice est mise à jour par _pose à chaque image)
  get door() { const d = this.cfg.door ?? [0, -5.6]; return this.local(d[0], 0, d[1], this.v3b).clone(); }

  // ------------------------------------------------------------------ sol et pose
  /** Garde en mémoire le sable autour du véhicule (le vrai maillage : la carte de hauteur est trop grossière, les roues s'enfonçaient) ; refait quand il s'éloigne. */
  _ensureNear(x, z) {
    const gm = this.world.groundMeshes;
    if (!gm?.length) return;
    if (this._nearC && Math.hypot(x - this._nearC[0], z - this._nearC[1]) < NEAR_R * 0.45) return;
    this._near = corridorMesh(gm, [[x, z]], NEAR_R); this._nearC = [x, z];
  }

  _surface(x, z) {
    const g = this.world.groundY(x, z);
    if (!this._near) return g;
    this._ray.set(this._from.set(x, g + 6, z), this._down);
    const hit = this._ray.intersectObject(this._near, false)[0];
    return hit && Math.abs(hit.point.y - g) < 5 ? hit.point.y : g;
  }

  _pose(snap = false, dt = 0.016) {
    const { x, z, heading } = this.drv;
    this._ensureNear(x, z);
    const vp = rideOnSurface((a, b) => this._surface(a, b), x, z, heading, this.cfg.wheels);
    if (![x, z, vp.y, heading].every(Number.isFinite)) return;
    const ks = snap ? 1 : 1 - Math.exp(-dt * 7);
    if (snap || this.y === undefined) { this.y = vp.y; this.pitch = vp.pitch; this.roll = vp.roll; }
    else { this.pitch += (vp.pitch - this.pitch) * ks; this.roll += (vp.roll - this.roll) * ks; this.y += (vp.y - this.y) * (1 - Math.exp(-dt * 14)); }
    this.y = Math.max(this.y, vp.y - 0.04);                                                    // la suspension ne laisse pas une roue s'enfoncer de plus de 4 cm
    this.root.position.set(x, this.y + 0.03, z);
    const ke = snap ? 1 : 1 - Math.exp(-dt * 12);
    this.wheels.forEach((w, i) => {                                                           // suspension : chaque roue descend jusqu'au sol
      if (!w) return;
      this.susp[i] += (Math.min(0.6, vp.drops[i]) - this.susp[i]) * ke;
      w.position.y = this.base[i] - this.susp[i] / (w.parent?.scale.y || 1);
    });
    this.root.quaternion.setFromAxisAngle(UP, heading)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -this.pitch))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.roll));
    this.root.updateMatrixWorld(true);
    this.box.x = x; this.box.y = -z; this.box.yaw = heading;
  }

  /** Avance d'un pas en tenant compte des obstacles : trois points le long du véhicule sont repoussés hors des murs et des autres véhicules ; un choc fait perdre de la vitesse. */
  _collide(dt) {
    const d = this.drv, fx = Math.sin(d.heading), fz = Math.cos(d.heading);
    const bx = this.box.x, by = this.box.y; this.box.x = 1e6; this.box.y = 1e6;                  // pas de collision avec soi-même
    let px = 0, pz = 0;
    for (const off of this.cfg.sample ?? [2.8, 0, -2.4]) {
      const p = this.v3.set(d.x + fx * off, this.y ?? 0, d.z + fz * off);
      const ox = p.x, oz = p.z;
      this.world.collide(p, this.cfg.radius ?? 1.9);
      px += p.x - ox; pz += p.z - oz;
    }
    this.box.x = bx; this.box.y = by;
    const push = Math.hypot(px, pz);
    if (push > 0.02) {
      const k = 1 / 3;
      d.x += px * k * 1.5; d.z += pz * k * 1.5;                                                   // il est repoussé (un peu plus que nécessaire : il ne s'incruste pas)
      if (Math.abs(d.v) > 2) d.bump(0.55);
      else d.v *= 0.8;
    }
    void dt;
  }

  // ------------------------------------------------------------------ montée
  startBoarding() {
    const allies = this.getAllies().filter((a) => !a.dead && !a.boarded)
      .sort((a, b) => Math.hypot(a.player.pos.x - this.pos.x, a.player.pos.z - this.pos.z) - Math.hypot(b.player.pos.x - this.pos.x, b.player.pos.z - this.pos.z))
      .slice(0, this.cfg.seats ?? 3);
    this.occ = allies.map((a, i) => ({ actor: a, gunner: i === 0, phase: 'walk', t: 0, shootCd: 1.2 }));
    for (const o of this.occ) o.actor.boarded = true;               // à partir de maintenant c'est ce module qui les déplace (skirmish.js les laisse tranquilles)
    this.pPhase = 'walk'; this.t = 0;
    this.state = 'boarding';
    this.hud?.toast?.(allies.length ? 'Tout le monde monte à bord' : 'Vous montez à bord (aucun allié disponible)', 2600);
  }

  _hidePlayer(on) {
    const p = this.player;
    p.model.visible = !on;
    p.locked = on;
  }

  _walkTo(actor, isPlayer, target, dt, sprint) {
    const p = isPlayer ? this.player : actor.player;
    const dx = target.x - p.pos.x, dz = target.z - p.pos.z, d = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
    if (isPlayer) { p.step(dt, { ...WALK_INPUT, sprint }, this.world, yaw); p.pose(dt, this.v3.set(target.x, p.pos.y + 1.2, target.z)); }
    else actor.update(dt, this.world, { mode: 'follow', heading: yaw, moveX: 0, moveY: 1, sprint, ready: true }, null);
    return d;
  }

  _boarding(dt) {
    this.t += dt;
    const door = this.door;
    if (this.pPhase === 'walk') {                                    // le joueur marche jusqu'à la porte arrière, puis monte
      const d = this._walkTo(null, true, door, dt, true);
      if (d < 1.3 || this.t > 3) { this.pPhase = 'in'; this._hidePlayer(true); }
    }
    for (const o of this.occ) {
      o.t += dt;
      if (o.phase !== 'walk') continue;
      if (this.pPhase === 'walk' && o.t < 0.4) { o.actor.update(dt, this.world, { mode: 'follow', heading: this.drv.heading, moveX: 0, moveY: 0, ready: true }, null); continue; }
      const d = this._walkTo(o.actor, false, door, dt, true);
      if (d < 1.4 || o.t > 7) { o.phase = 'in'; this._enter(o); }
    }
    if (this.pPhase === 'in' && this.occ.every((o) => o.phase === 'in')) this._startDriving();
    else if (this.pPhase === 'in' && this.t > 9) {                   // ceux qui n'ont pas pu monter restent dehors
      for (const o of this.occ) if (o.phase !== 'in') { o.actor.boarded = false; o.phase = 'out'; }
      this.occ = this.occ.filter((o) => o.phase === 'in'); this._startDriving();
    }
  }

  /** Un allié passe la porte : le tireur monte sur son poste (debout, le haut du corps dehors), les autres disparaissent à l'intérieur. */
  _enter(o) {
    const p = o.actor.player;
    if (o.gunner) { p.root.visible = true; p.model.visible = true; }
    else { p.root.visible = false; }
  }

  _startDriving() {
    this.state = 'driving';
    this.drv.v = 0; this.camYawOff = 0; this.lookIdle = 9; this.camYaw = this.drv.heading;
    this.exitWarnAt = -9;
    this.hud?.toast?.('À vous de conduire', 2200);
  }

  // ------------------------------------------------------------------ passagers pendant la route
  _gunnerPos() { const g = this.cfg.gunner ?? { x: 0, z: 0.5, y: 2.45 }; return this.local(g.x, g.y, g.z, this.v3b); }

  _updatePassengers(dt) {
    const sk = this.skirmish;
    for (const o of this.occ) {
      if (o.phase !== 'in') continue;
      const a = o.actor, p = a.player;
      if (!o.gunner) { p.pos.copy(this.pos); p.root.position.copy(p.pos); continue; }          // à l'intérieur : il suit le véhicule (invisible)
      // le tireur : il vise le milicien le plus proche à portée et tire dessus
      const g = this._gunnerPos();
      let best = null, bd = this.cfg.gunRange ?? 75;
      for (const n of sk?.npcs ?? []) {
        if (n.dead || n._asleep) continue;
        const d = Math.hypot(n.player.pos.x - g.x, n.player.pos.z - g.z);
        if (d < bd) { bd = d; best = n; }
      }
      const tgt = best ? sk._chest(best.player.pos, !!best.player.state.crouch) : null;
      const heading = tgt ? Math.atan2(tgt.x - g.x, tgt.z - g.z) : this.drv.heading;
      a.update(dt, this.world, { mode: 'follow', heading, moveX: 0, moveY: 0, aim: !!tgt, fire: !!tgt, ready: true }, tgt);
      p.pos.copy(g); p.vy = 0; p.onGround = true; p.root.position.copy(p.pos);                  // il reste à son poste, quoi que fasse l'animation
      o.shootCd -= dt;
      if (tgt && o.shootCd <= 0 && sk && !a.dead) {
        o.shootCd = 0.5 + Math.random() * 0.35;
        try { sk.npcShoot(a, sk._enemyTarget(best), 'ally'); } catch (e) { console.warn('tir du tireur du blindé', e); }
      }
    }
  }

  // ------------------------------------------------------------------ descente
  _unload() {
    const e = this.cfg.exit ?? [-3.4, 0.6];
    const place = (p, x, z, k) => {
      const w = this.local(x, 0, z + k * 1.7, this.v3);
      p.pos.set(w.x, this.world.groundY(w.x, w.z), w.z); p.vy = 0; p.onGround = true; p.root.position.copy(p.pos);
      p.yaw = this.drv.heading + Math.PI / 2; p.model.rotation.y = p.yaw;                       // il descend du côté gauche, face au véhicule : la caméra, derrière lui, reste dehors
    };
    this._hidePlayer(false);
    place(this.player, e[0], e[1], 0);
    this.occ.forEach((o, i) => {
      const p = o.actor.player;
      p.root.visible = true; p.model.visible = true; p.locked = false;
      place(p, e[0] - (i % 2 ? 1.6 : 0), e[1], i + 1);
      o.actor.boarded = false;
    });
    this.occ = []; this.drv.v = 0; this.state = 'parked';
    this._pose(true);
    this.hud?.setDrive?.(null);
    this.hud?.toast?.('Vous descendez du blindé', 1800);
  }

  // ------------------------------------------------------------------ caméra
  /** Caméra de poursuite : derrière le véhicule, qui suit son cap ; la souris et le stick droit font tourner autour, puis la caméra revient d'elle-même. */
  _chase(dt, inp) {
    const c = this.cfg.cam ?? { dist: 13, h: 4.4, look: 2.0, fov: 62 };
    const look = Math.abs(inp.lookX ?? 0) + Math.abs(inp.padLookX ?? 0);
    if (look > 0.0004) { this.lookIdle = 0; this.camYawOff -= (inp.lookX ?? 0) + (inp.padLookX ?? 0); } else this.lookIdle += dt;
    if (this.lookIdle > 1.6) this.camYawOff *= Math.exp(-dt * 1.8);
    this.camYawOff = Math.max(-Math.PI, Math.min(Math.PI, this.camYawOff));
    this.camYaw = smoothAngle(this.camYaw, this.drv.heading, 1 - Math.exp(-dt * 2.6));
    const yaw = this.camYaw + this.camYawOff;
    const c0 = this.pos;
    const pos = new THREE.Vector3(c0.x - Math.sin(yaw) * c.dist, c0.y + c.h, c0.z - Math.cos(yaw) * c.dist);
    pos.y = Math.max(pos.y, this.world.groundY(pos.x, pos.z) + 1.2);                             // jamais sous le sol
    const look3 = new THREE.Vector3(c0.x + Math.sin(this.drv.heading) * 3, c0.y + c.look, c0.z + Math.cos(this.drv.heading) * 3);
    return { pos, look: look3, fov: c.fov };
  }

  /** Pendant la montée : la caméra est derrière et sur le côté, face à la porte arrière, pour qu'on voie chacun monter. */
  _cinema() {
    const c = this.cfg.boardCam ?? { pos: [-6.5, 3.6, -11], look: [0, 1.5, -4.2] };
    return { pos: this.local(...c.pos).clone(), look: this.local(...c.look).clone(), fov: 58 };
  }

  // ------------------------------------------------------------------ boucle
  update(dt, inp, pressed) {
    const sk = this.skirmish;
    if (sk) sk.protectedFor = Math.max(sk.protectedFor ?? 0, 0.4);                                   // à bord, personne n'est touché
    if (this.state === 'boarding') {
      this._boarding(dt);
      return { control: true, chase: this.state === 'boarding' ? this._cinema() : this._chase(dt, inp) };
    }
    if (this.state === 'driving') {
      this._ensureNear(this.drv.x, this.drv.z);
      this.drv.step(dt, driveCommands(inp));
      this._collide(dt);
      this._pose(false, dt);
      this.wheelAngle += (this.drv.v * dt) / (this.cfg.wheelRadius ?? 0.85);
      for (const w of this.wheels) if (w) w.rotation.x = this.wheelAngle;
      const p = this.player;
      p.pos.set(this.pos.x, this.pos.y + 1.2, this.pos.z); p.root.position.copy(p.pos); p.vy = 0;
      this._updatePassengers(dt);
      this.hud?.setDrive?.({ kmh: this.drv.kmh, gear: this.drv.gear, frac: this.drv.frac, steer: this.drv.steer, allies: this.occ.length });
      this.hud?.setPrompt?.(Math.abs(this.drv.v) < 3 ? 'Descendre' : null, { icon: 'exit', keys: ['E', 'R1'] });          // cliquable : c'est aussi le bouton pour descendre sur écran tactile
      if (pressed) {
        if (Math.abs(this.drv.v) < 3) { const h = this.drv.heading; this._unload(); return { control: false, yaw: h + Math.PI / 2 }; }
        if (performance.now() - this.exitWarnAt > 2000) { this.exitWarnAt = performance.now(); this.hud?.toast?.('Ralentissez pour descendre', 1500); }
      }
      return { control: true, chase: this._chase(dt, inp) };
    }
    return { control: false };
  }

  /** Filet de sécurité : tout le monde redescend et reprend ses commandes. */
  abort(err = null) {
    if (err) console.warn('conduite interrompue :', err?.message ?? err);
    try { if (this.busy) this._unload(); } catch { /* on continue */ }
    this.player.locked = false; this.player.model.visible = true;
    for (const a of this.getAllies()) { if (a.boarded) { a.boarded = false; a.player.root.visible = true; a.player.model.visible = true; } }
    this.occ = []; this.state = 'parked'; this.drv.v = 0;
    this.hud?.setDrive?.(null); this.hud?.setPrompt?.(null);
  }
}

export class DriveSystem {
  constructor({ vehicles, hud, player }) {
    this.vehicles = vehicles; this.hud = hud; this.player = player;
    this.active = null; this.clicked = false; this.cool = 0;
    this.cfgReach = vehicles[0]?.cfg.reach ?? 7;
    hud?.onPrompt?.(() => { this.clicked = true; });                 // le bouton « Entrer » est cliquable (écran tactile, souris)
  }

  get activeVehicle() { return this.active; }

  /** inp : commandes de l'image ; renvoie { control, chase } : control = le véhicule pilote le joueur (le jeu n'applique pas ses commandes de marche). */
  update(dt, inp, { blocked = false } = {}) {
    const pressed = !!inp.interact || this.clicked; this.clicked = false;
    if (this.active) {
      const r = this.active.update(dt, inp, pressed);
      if (!this.active.busy) { this.active = null; this.cool = 0.6; }                  // à peine descendu : pas de nouvelle montée par le même appui
      return r;
    }
    this.cool = Math.max(0, this.cool - dt);
    // pas à bord : le véhicule le plus proche, s'il est à portée, propose « Entrer »
    const p = this.player;
    let best = null, bd = Infinity;
    for (const v of this.vehicles) { const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z); if (d < bd) { bd = d; best = v; } }
    const dead = p.state?.dead || this.player.health?.dead;
    const near = best && bd < this.cfgReach && !dead && !blocked;
    this.hud?.setPrompt?.(near ? 'Entrer' : null, near ? { icon: 'enter', keys: ['E', 'R1'] } : undefined);
    if (near && pressed && this.cool <= 0) { this.hud?.setPrompt?.(null); this.active = best; best.startBoarding(); }
    return { control: false };
  }

  abort(err) { for (const v of this.vehicles) v.abort(err); this.active = null; }
}

/** Charge config/drive.json et le modèle du blindé. Renvoie null si le fichier manque (le jeu démarre quand même). */
export async function loadDrive({ scene, world, player, getAllies, hud, skirmish, props = [], flags = null }) {
  const r = await fetch(`config/drive.json?v=${ASSET_VERSION}`);
  if (!r.ok) return null;
  const cfg = await r.json();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), models = new Map();
  const vehicles = [];
  for (const def of cfg.vehicles) {
    const c = { ...cfg, ...def };                                      // les réglages propres au véhicule remplacent ceux par défaut
    const base = { def, cfg: c, scene, world, player, getAllies, hud, skirmish, flags };
    if (def.prop) {                                                    // un décor de props.json : on conduit le modèle déjà posé
      const prop = props.find((p) => p.def.id === def.prop);
      if (!prop) { console.warn(`véhicule à conduire : décor ${def.prop} introuvable`); continue; }
      vehicles.push(new DriveVehicle({ ...base, root: prop.root, prop }));
    } else {
      const file = def.file ?? cfg.file;
      if (!models.has(file)) models.set(file, await loader.loadAsync(`${file}?v=${ASSET_VERSION}`));
      vehicles.push(new DriveVehicle({ ...base, gltf: models.get(file) }));
    }
  }
  return new DriveSystem({ vehicles, hud, player });
}
