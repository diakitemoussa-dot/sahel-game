// Monter dans le blindé et rouler : le joueur et ses alliés entrent un par un par la porte arrière (animation « Entrer_Blinde_Arriere » faite dans Blender),
// s'installent chacun à sa place, et un allié conduit le véhicule le long de la piste. Un appui sur E arrête le blindé, puis tout le monde descend.
//  - BoardingFlow : les phases d'UN passager (logique pure, testée sans navigateur) ;
//  - Convoy : le blindé, ses passagers, la porte, les roues, la conduite (relie le tout au jeu).
// Repère des places : celui de Blender (x vers la droite, y vers l'arrière = -y est l'avant) dans le repère du véhicule.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { decodeSCOL } from './meshworld.js';
import { buildPath, pathAt, nearestS, Cruise, vehiclePose, smoothAngle } from './vehicle.js';
import { pickClip } from './animstate.js';
import { ASSET_VERSION } from './version.js';

const UP = new THREE.Vector3(0, 1, 0);
const ease = (u) => u * u * (3 - 2 * u);

/** Les phases d'un passager. Entrée : wait (il attend son tour) -> align (il se place devant la porte) -> enter (animation d'entrée) -> slide (il glisse jusqu'à sa place)
 *  -> seated. Sortie : unslide -> exit (animation à l'envers) -> done. */
export class BoardingFlow {
  constructor({ clipDur, speed = 1, alignTime = 0.6, slideTime = 0.8, gunner = false, walkTime = 1.5 }) {
    Object.assign(this, { clipDur, speed, alignTime, slideTime, gunner, walkTime });
    this.phase = 'wait'; this.t = 0;
  }
  /** Il peut commencer (son tour est venu et il est devant la porte). */
  go() { if (this.phase === 'wait') { this.phase = 'align'; this.t = 0; } }
  /** Fait descendre un passager installé. */
  release() {
    if (this.phase === 'seated') { this.phase = 'unslide'; this.t = 0; }
    else if (this.standing) { this.phase = 'exit'; this.t = 0; }        // le tireur redescend directement à la porte
  }
  get done() { return this.phase === 'done'; }
  get seated() { return this.phase === 'seated' || this.phase === 'gunner'; }
  /** Le tireur est debout à la trappe : il joue avec les commandes normales (viser, tirer...). */
  get standing() { return this.phase === 'walk' || this.phase === 'rise' || this.phase === 'gunner'; }
  /** Avance d'un pas de temps. */
  tick(dt) {
    this.t += dt;
    switch (this.phase) {
      case 'align': if (this.t >= this.alignTime) { this.phase = 'enter'; this.t = 0; } break;
      case 'enter': if (this.t * this.speed >= this.clipDur) { this.phase = this.gunner ? 'walk' : 'slide'; this.t = 0; } break;
      case 'walk': if (this.t >= this.walkTime) { this.phase = 'rise'; this.t = 0; } break;
      case 'rise': if (this.t >= this.slideTime) { this.phase = 'gunner'; this.t = 0; } break;
      case 'slide': if (this.t >= this.slideTime) { this.phase = 'seated'; this.t = 0; } break;
      case 'unslide': if (this.t >= this.slideTime) { this.phase = 'exit'; this.t = 0; } break;
      case 'exit': if (this.t * this.speed >= this.clipDur) { this.phase = 'done'; this.t = 0; } break;
      default: break;
    }
    return this.phase;
  }
  /** Où il en est : temps dans l'animation (0 à clipDur), progression du glissement (0 à 1), progression du placement (0 à 1). */
  get pose() {
    switch (this.phase) {
      case 'align': return { clipT: 0, slide: 0, align: Math.min(1, this.t / this.alignTime) };
      case 'enter': return { clipT: Math.min(this.clipDur, this.t * this.speed), slide: 0, align: 1 };
      case 'slide': return { clipT: this.clipDur, slide: Math.min(1, this.t / this.slideTime), align: 1 };
      case 'walk': return { clipT: this.clipDur, slide: Math.min(1, this.t / this.walkTime), align: 1 };
      case 'rise': return { clipT: this.clipDur, slide: Math.min(1, this.t / this.slideTime), align: 1 };
      case 'gunner': return { clipT: this.clipDur, slide: 1, align: 1 };
      case 'seated': return { clipT: this.clipDur, slide: 1, align: 1 };
      case 'unslide': return { clipT: this.clipDur, slide: 1 - Math.min(1, this.t / this.slideTime), align: 1 };
      case 'exit': return { clipT: Math.max(0, this.clipDur - this.t * this.speed), slide: 0, align: 1 };
      default: return { clipT: 0, slide: 0, align: 1 };
    }
  }
}

/** Hauteur à ajouter au personnage pendant l'animation d'entrée pour qu'il marche sur le VRAI sol : l'animation suppose un sol plat au niveau du véhicule, or le sol derrière le blindé
 *  est plus haut ou plus bas. Plein effet tant qu'il est dehors, puis il s'efface pendant qu'il monte sur le marchepied (de 16 % à 45 % de l'animation) : à l'intérieur c'est le plancher du véhicule. */
export function groundBlend(clipT, dur) {
  const u = (clipT / dur - 0.16) / (0.45 - 0.16);
  if (u <= 0) return 1;
  if (u >= 1) return 0;
  return 1 - u * u * (3 - 2 * u);
}

/** Place du passager `i` : le joueur d'abord, puis les alliés dans l'ordre (le premier conduit). */
export function assignSeats(seats, n) {
  return seats.slice(0, n);
}

export class Convoy {
  /** opts : { prop (décor chargé par props.js), player, getAllies (() => PNJ alliés), world, hud, skirmish, clip (animation d'entrée), doorClip, path (piste) } */
  constructor({ prop, player, getAllies, world, hud, skirmish = null, clip, doorClip = null, path, colGeo = null, colHandle = null }) {
    Object.assign(this, { prop, player, getAllies, world, hud, skirmish, clip, path, colGeo, colHandle });
    const def = prop.def, b = def.boarding;
    this.def = def; this.cfg = b;
    this.root = prop.root;
    this.state = 'parked';
    this.occ = [];
    this.s = nearestS(path, def.pos[0], def.pos[1]);                          // distance parcourue sur la piste
    this.endS = Math.max(this.s, path.length - (b.stopBefore ?? 4));
    this.cruise = new Cruise({ cruise: b.cruise ?? 8 });
    this.heading = def.yaw ?? 0; this.pitch = 0; this.roll = 0; this.wheelAngle = 0;
    this.doorMixer = doorClip ? new THREE.AnimationMixer(this.root) : null;
    this.doorAction = doorClip ? this.doorMixer.clipAction(doorClip) : null;
    if (this.doorAction) { this.doorAction.play(); this.doorAction.paused = true; }
    this.doorOpenT = doorClip ? Math.min(doorClip.duration, 40 / 24) : 1.6;      // l'ouverture dure jusqu'à l'image 40 (1,6 s)
    this.door = 0; this.doorTarget = 0;                                          // 0 fermée, 1 ouverte
    this.wheels = ['Roue_AVG', 'Roue_AVD', 'Roue_ARG', 'Roue_ARD'].map((n) => this.root.getObjectByName(n)).filter(Boolean);
    this.q = new THREE.Quaternion(); this.v3 = new THREE.Vector3();
    this.prompt = null;
    this.groundDelta = 0;                                              // écart entre le vrai sol derrière le blindé et le sol « plat » supposé par l'animation (voir groundBlend)
    this.camW = 0; this.cine = false;                                  // caméra de cinéma pendant l'installation : poids du fondu (0 = caméra du jeu)
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3();
    hud?.onPrompt?.(() => { this.pressed = true; });
  }

  // ------------------------------------------------------------------ repères
  /** Position (monde) d'un point du repère Blender du véhicule (x, y, z) : (x, z, -y) dans le repère three.js du véhicule. */
  local(xb, yb, zb = 0, out = new THREE.Vector3()) { return this.root.localToWorld(out.set(xb, zb, -yb)); }
  get anchor() { return this.local(this.cfg.start[0], this.cfg.start[1]); }
  get busy() { return this.state !== 'parked'; }
  get driving() { return this.state === 'driving' || this.state === 'stopping'; }
  /** Le joueur est à son poste de tir et le blindé est parti : le jeu lui rend ses commandes (viser, tirer). */
  get gunnerFree() { return !!(this.occ[0]?.isPlayer && this.occ[0].flow.phase === 'gunner' && !this.cine && this.state !== 'unloading'); }

  // ------------------------------------------------------------------ passagers
  _updateGround() {
    const an = this.anchor;
    this.groundDelta = Math.max(-1.5, Math.min(1.5, this.world.groundY(an.x, an.z) - an.y));
  }

  _occupant(actor, seat, isPlayer, delay) {
    const speed = this.cfg.speed ?? 1.25;
    return { actor, player: actor.player ?? actor, seat, isPlayer, flow: new BoardingFlow({ clipDur: this.clip.duration, speed, alignTime: 0.6, slideTime: seat.gunner ? 1.0 : seat.hide ? 0.05 : 0.9, gunner: !!seat.gunner,
               walkTime: seat.gunner ? Math.hypot(seat.x - this.cfg.clipEnd[0], seat.y - this.cfg.clipEnd[1]) / (this.cfg.walkSpeed ?? 1.7) : 0 }),
             delay, started: false, action: null, from: null };
  }

  /** Arrivé au bout de la piste, le blindé repart dans l'autre sens : on retourne le chemin et on tourne le véhicule sur place avant que quiconque monte. */
  _reverseIfAtEnd() {
    if (this.path.length - this.s > 25) return;
    const here = this.root.position;
    this.path = buildPath([...this.path.points].reverse());
    this.s = nearestS(this.path, here.x, -here.z);
    this.endS = Math.max(this.s, this.path.length - (this.cfg.stopBefore ?? 4));
    const had = !!this.colHandle; this._unpark(); this._setPose(true); if (had || this.colGeo) this._park();
  }

  _startLoading() {
    this._reverseIfAtEnd();
    const seats = this.cfg.seats;
    this.occ = [this._occupant(this.player, seats.find((s) => s.id === 'player') ?? seats[0], true, 0)];
    const free = seats.filter((s) => s.id !== 'player');
    const an = this.anchor;
    const allies = this.getAllies().filter((a) => !a.dead && !a.boarded)
      .sort((a, b) => Math.hypot(a.player.pos.x - an.x, a.player.pos.z - an.z) - Math.hypot(b.player.pos.x - an.x, b.player.pos.z - an.z)).slice(0, free.length);      // le plus proche conduit
    allies.forEach((a, i) => { a.boarded = true; this.occ.push(this._occupant(a, free[i], false, 0)); });
    this._updateGround();
    this.state = 'loading'; this.doorTarget = 1;
    this.occ[0].flow.go();
    this.hud?.toast?.(allies.length ? 'Tout le monde monte dans le blindé' : 'Vous montez dans le blindé (aucun allié pour conduire)', 2600);
  }

  /** Un passager qui attend son tour : il se range à côté de la porte (une place chacun, jamais les uns sur les autres), puis court à la porte quand le précédent est bien avancé. */
  _waiting(o, i, dt) {
    const a = o.actor, p = o.player, c = this.cfg;
    const prev = this.occ[i - 1];
    const myTurn = prev.flow.phase === 'slide' || prev.flow.seated || (prev.flow.phase === 'enter' && prev.flow.pose.clipT > this.clip.duration * 0.45) || prev.flow.phase === 'unslide';
    const spots = c.queue ?? [[-1.6, 1.6], [1.6, 1.6], [0, 3.4]];                     // places d'attente derrière le blindé (repère Blender, par rapport à la porte)
    const sp = spots[(i - 1) % spots.length];
    const target = myTurn ? this.anchor : this.local(c.start[0] + sp[0], c.start[1] + sp[1], 0, this._t2 ??= new THREE.Vector3());
    const dx = target.x - p.pos.x, dz = target.z - p.pos.z, d = Math.hypot(dx, dz);
    if (d > (myTurn ? 1.0 : 0.6) && !(myTurn && o.late > 6)) {
      if (myTurn) o.late = (o.late ?? 0) + dt;
      a.update(dt, this.world, { mode: 'follow', heading: Math.atan2(dx, dz), moveX: 0, moveY: myTurn ? 1 : 0.7, aim: false, fire: false, melee: false, sprint: d > 6, crouch: false, ready: true }, null);
    } else if (myTurn) o.flow.go();
    else a.update(dt, this.world, { mode: 'follow', heading: this.heading, moveX: 0, moveY: 0, ready: true }, null);      // il attend, tourné vers le blindé
  }

  /** Le tireur : après l'animation d'entrée il SE LÈVE et MARCHE dans le véhicule jusqu'au pied de la trappe, puis monte sur son poste, debout, le haut du corps dehors.
   *  Pendant l'installation (caméra de cinéma) c'est ce code qui le fait jouer ; une fois le blindé parti, le jeu le pilote normalement (viser, tirer, recharger)
   *  mais il reste à sa place (Player.locked) ; ici on ne fait alors que le suivre le véhicule. */
  _placeGunner(o, dt) {
    const p = o.player, f = o.flow, seat = o.seat, c = this.cfg;
    const floorY = c.floorY ?? 1.25, topY = seat.rootY ?? 2.55, base = { x: seat.x, z: -seat.y };
    if (!o.rise) {                                                     // début : d'où il part (là où l'animation d'entrée l'a laissé), et fondu vers la marche
      p.model.updateMatrixWorld(true);
      o.hips ??= p.model.getObjectByName('mixamorig4Hips');
      const hl = this.root.worldToLocal(o.hips.getWorldPosition(new THREE.Vector3()));
      o.rise = { x: hl.x, z: hl.z, walkYaw: Math.atan2(base.x - hl.x, base.z - hl.z) };
      o.action?.fadeOut(0.45);
      p.current = null; p.action = null; p.locked = true; p.relaxed = false; p.state.crouch = false; p.state.overlay = null;
    }
    const r = o.rise;
    let x = base.x, z = base.z, y = topY, yaw = this.heading;
    if (f.phase === 'walk') {                                          // il marche en ligne droite jusqu'au pied de la trappe, le fusil à la main
      const k = f.pose.slide;
      x = r.x + (base.x - r.x) * k; z = r.z + (base.z - r.z) * k; y = floorY; yaw = this.heading + r.walkYaw;
      p._play({ clip: p.clips.has('Rifle Walk') ? 'Rifle Walk' : 'Walk' });
    } else if (f.phase === 'rise') {                                   // il monte sur son poste en se tournant vers l'avant
      const k = ease(f.pose.slide);
      y = floorY + (topY - floorY) * k; yaw = this.heading + r.walkYaw * (1 - k);
      p._play(pickClip(p.state));
    } else if (this.cine) p._play(pickClip(p.state));                  // à son poste, en attendant le départ
    p.pos.copy(this.root.localToWorld(this.v3.set(x, y, z)));
    p.root.position.copy(p.pos);
    const owns = f.phase !== 'gunner' || this.cine;                    // sinon c'est le jeu qui l'anime (Player.step et Player.pose, dans main.js)
    if (owns) {
      p.yaw = yaw; p.model.rotation.set(0, yaw, 0);
      p.mixer.update(dt);
      p.model.updateMatrixWorld(true); p._applyGrip?.();
    }
  }

  _place(o, dt) {
    if (o.seat.gunner && o.flow.standing) { this._placeGunner(o, dt); return; }
    const p = o.player, f = o.flow, pose = f.pose, c = this.cfg;
    const wasPhase = o.lastPhase; o.lastPhase = f.phase;
    if (!o.action && ['enter', 'slide', 'seated', 'unslide', 'exit'].includes(f.phase)) {         // l'animation d'entrée prend la main sur toutes les autres
      p.mixer.stopAllAction();
      o.action = p.mixer.clipAction(this.clip); o.action.play(); o.action.paused = true; o.action.enabled = true; o.action.setEffectiveWeight(1);
    }
    if (f.phase === 'align') {                                         // il marche jusqu'à la porte et se tourne vers le véhicule
      o.from ??= { x: p.pos.x, z: p.pos.z, yaw: p.yaw };
      const an = this.anchor, k = ease(pose.align);
      o.from.y ??= p.pos.y;
      p.pos.set(o.from.x + (an.x - o.from.x) * k, o.from.y + (an.y + this.groundDelta - o.from.y) * k, o.from.z + (an.z - o.from.z) * k);
      p.yaw = smoothAngle(o.from.yaw, this.heading, k);
      p._play({ clip: p.clips.has('Rifle Walk') ? 'Rifle Walk' : 'Walk' });
      p.mixer.update(dt);
      p.root.position.copy(p.pos); p.model.rotation.y = p.yaw; p.model.rotation.x = 0; p.model.rotation.z = 0;
    } else if (f.phase !== 'wait') {
      if (o.action) { o.action.time = pose.clipT; p.mixer.update(0); }
      const seat = o.seat, k = ease(pose.slide), psi = (seat.yaw ?? 0) * k;
      // fin de l'animation = hanches en `clipEnd`. Pour arriver à sa place on tourne le personnage autour de ses hanches puis on le glisse jusqu'au siège
      const px = c.clipEnd[0], pz = -c.clipEnd[1], rx = c.start[0] - px, rz = -c.start[1] - pz, cs = Math.cos(psi), sn = Math.sin(psi);
      const lx = px + rx * cs + rz * sn + (seat.x - px) * k, lz = pz - rx * sn + rz * cs + (-seat.y - pz) * k;
      p.pos.copy(this.root.localToWorld(this.v3.set(lx, 0, lz)));
      p.pos.y += this.groundDelta * groundBlend(pose.clipT, this.clip.duration);        // pas dans la terre : il marche sur le vrai sol, puis monte dans le véhicule
      this.q.copy(this.root.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(UP, psi));
      p.model.quaternion.copy(this.q);
      p.yaw = this.heading + psi;
      p.root.position.copy(p.pos);
      p.model.visible = !(seat.hide && (f.phase === 'slide' || f.phase === 'unslide'));
    }
    if (f.phase !== 'wait') {
      p.model.updateMatrixWorld(true); p._applyGrip?.();
      if (f.phase !== 'align') {                                      // pour le reste du jeu (caméra, radar, tirs), le joueur est là où sont ses hanches, pas à l'origine de l'animation
        o.hips ??= p.model.getObjectByName('mixamorig4Hips');
        if (o.hips) { o.hips.getWorldPosition(this.v3); p.pos.x = this.v3.x; p.pos.z = this.v3.z; }
      }
    }
    void wasPhase;
  }

  _release() {
    for (const o of this.occ) {
      const p = o.player;
      o.action?.stop(); o.action = null;
      p.locked = false; o.rise = null;
      p.model.visible = true; p.model.rotation.set(0, this.heading, 0); p.model.quaternion.setFromAxisAngle(UP, this.heading);
      p.current = null; p.action = null; p.mixer.stopAllAction();
      const an = this.anchor, k = o.isPlayer ? 0 : this.occ.indexOf(o);
      const side = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
      p.pos.set(an.x + side.x * (k ? (k % 2 ? 1.7 : -1.7) * Math.ceil(k / 2) : 0), 0, an.z + side.z * (k ? (k % 2 ? 1.7 : -1.7) * Math.ceil(k / 2) : 0));
      p.pos.y = this.world.groundY(p.pos.x, p.pos.z);
      p.yaw = this.heading; p.vy = 0; p.onGround = true;
      p.root.position.copy(p.pos);
      if (!o.isPlayer) { o.actor.boarded = false; o.actor.update?.(0.016, this.world, { mode: 'follow', heading: p.yaw, moveX: 0, moveY: 0, ready: true }, null); }
    }
    this.occ = [];
    this.state = 'parked'; this.doorTarget = 0;
    this._park();
  }

  // ------------------------------------------------------------------ véhicule
  _setPose(snap = false) {
    const g = this.world, p = pathAt(this.path, this.s);
    const x = p.x, z = -p.y;
    this.heading = snap ? p.heading : smoothAngle(this.heading, p.heading, 0.35);
    const vp = vehiclePose(g.groundY, x, z, this.heading);
    const kp = snap ? 1 : 0.2;
    this.pitch += (vp.pitch - this.pitch) * kp; this.roll += (vp.roll - this.roll) * kp;
    if (![x, z, vp.y, this.heading].every(Number.isFinite)) throw new Error('position du blindé invalide');
    this.root.position.set(x, vp.y, z);
    this.root.quaternion.setFromAxisAngle(UP, this.heading)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -this.pitch))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -this.roll));
    this.root.updateMatrixWorld(true);
  }

  _unpark() { if (this.colHandle) { this.world.removeCollision(this.colHandle); this.colHandle = null; } }
  _park() {
    if (this.colGeo && !this.colHandle) { this.root.updateMatrixWorld(true); this.colHandle = this.world.addCollision(this.colGeo, this.root.matrixWorld.elements); }
  }

  _door(dt) {
    this.door += Math.sign(this.doorTarget - this.door) * Math.min(Math.abs(this.doorTarget - this.door), dt / 1.4);
    if (this.doorAction) { this.doorAction.time = ease(this.door) * this.doorOpenT; this.doorMixer.update(0); }
  }

  /** Caméra de cinéma : derrière le blindé, un peu à gauche et en hauteur, face à la porte arrière ouverte : on voit entrer le joueur et chaque allié, et les autres attendre leur tour. */
  _cinema(dt) {
    this.cine = this.state === 'loading' || this.state === 'unloading';
    this.camW += ((this.cine ? 1 : 0) - this.camW) * Math.min(1, dt * 2.5);
    if (this.camW < 0.002) { this.camW = 0; return null; }
    const cam = this.cfg.camera ?? { pos: [-6, 12.5, 3.4], look: [0.4, 4.6, 1.9] };
    this.local(cam.pos[0], cam.pos[1], cam.pos[2], this.camPos);
    this.local(cam.look[0], cam.look[1], cam.look[2], this.camLook);
    return { pos: this.camPos, look: this.camLook, w: ease(Math.min(1, this.camW)) };
  }

  // ------------------------------------------------------------------ boucle
  /** Appelé à chaque image. interact : E enfoncé cette image. Renvoie { control, focus } : control = le blindé pilote le joueur (le jeu n'applique pas ses commandes). */
  update(dt, interact = false) {
    const pressed = interact || this.pressed; this.pressed = false;
    const player = this.player;
    this._door(dt);
    const cam = this._cinema(dt);
    if (this.state === 'parked') {
      const an = this.anchor, near = player.pos.distanceTo(an) < this.cfg.reach && !player.state.dead && !this.skirmish?.player?.health?.dead && !this._wardrobeOpen?.();
      this.prompt = near ? this.cfg.label : null;
      this.hud?.setPrompt?.(this.prompt);
      if (near && pressed) { this.hud?.setPrompt?.(null); this._startLoading(); }
      return { control: false, cam };
    }
    if (this.skirmish) this.skirmish.protectedFor = Math.max(this.skirmish.protectedFor, 0.4);       // blindé : personne n'est touché à bord
    if (this.driving) {                                                  // le véhicule avance d'abord, puis les passagers le suivent
      this.hud?.setPrompt?.(this.state === 'driving' ? 'E : arrêter le blindé' : 'Le blindé s’arrête…');
      if (pressed && this.state === 'driving') { this.cruise.braking = true; this.state = 'stopping'; }
      const v = this.cruise.update(dt, this.s, this.endS);
      this.s = Math.min(this.endS, this.s + v * dt);
      this._setPose();
      this.wheelAngle += (v * dt) / (this.cfg.wheelRadius ?? 0.85);
      for (const w of this.wheels) w.rotation.x = this.wheelAngle;
    }
    this.occ.forEach((o, i) => {
      if (o.flow.phase === 'wait' && i > 0) this._waiting(o, i, dt);
      else o.flow.tick(dt);
      if (o.flow.phase !== 'wait') this._place(o, dt);
    });
    if (this.state === 'loading') {
      this.hud?.setPrompt?.(null);
      if (this.occ.every((o) => o.flow.seated)) {
        this.doorTarget = 0;
        if (this.occ.length > 1) { this._unpark(); this.state = 'driving'; } else this.state = 'riding';
      }
    } else if (this.state === 'riding') {                                // seul à bord : personne ne conduit
      this.hud?.setPrompt?.('E : descendre');
      if (pressed) this._startUnloading();
    } else if (this.driving) {
      if (this.cruise.stopped && (this.state === 'stopping' || this.s >= this.endS - 0.3)) this._startUnloading();
    } else if (this.state === 'unloading') {
      this.hud?.setPrompt?.(null);
      if (this.occ.every((o) => o.flow.done)) { this._release(); return { control: false, cam }; }
    }
    return { control: !this.gunnerFree, gunner: this.gunnerFree, cam, focus: this.v3.copy(this.player.pos) };
  }

  /** Filet de sécurité : si quelque chose se passe mal (erreur, valeur invalide), on rend leurs commandes au joueur et aux alliés et le blindé redevient un simple décor. */
  abort(err = null) {
    if (this.state === 'parked' && !this.occ.length) return;
    if (err) console.warn('blindé interrompu :', err?.message ?? err);
    try { for (const o of this.occ) { o.action?.stop(); o.player.mixer.stopAllAction(); o.player.model.visible = true; o.player.locked = false; if (o.actor.boarded !== undefined) o.actor.boarded = false; } } catch { /* on continue */ }
    this.player.locked = false;
    this.occ = []; this.state = 'parked'; this.cruise.v = 0; this.cruise.braking = false; this.doorTarget = 0; this.camW = 0; this.cine = false;
    if (!Number.isFinite(this.root.position.x + this.root.position.y + this.root.position.z)) { this.s = nearestS(this.path, this.def.pos[0], this.def.pos[1]); this.heading = this.def.yaw ?? 0; this._setPose(true); }
    for (const a of this.getAllies()) a.boarded = false;
    try { this._park(); } catch { /* on continue */ }
    this.hud?.setPrompt?.(null);
  }

  _startUnloading() {
    this.cruise.v = 0; this.cruise.braking = false;
    this._park();
    this._updateGround();
    this.state = 'unloading'; this.doorTarget = 1;
    for (const o of this.occ) {
      if (o.flow.standing) {                                           // le tireur quitte sa trappe : il reprend l'animation de sortie à la porte
        const p = o.player;
        p.locked = false; p.mixer.stopAllAction(); o.action = null; o.rise = null; p.current = null; p.action = null;
        p.model.quaternion.copy(this.root.quaternion);
      }
      o.flow.release();
    }
    this.root.updateMatrixWorld(true);
    this.hud?.toast?.('On descend', 1800);
  }
}

/** Charge l'animation d'entrée et la piste, et prépare un Convoy pour chaque décor qui a un « boarding » dans props.json. */
export async function loadConvoys(props, { player, getAllies, world, hud, skirmish }) {
  const out = [];
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  for (const prop of props) {
    const b = prop.def.boarding;
    if (!b) continue;
    try {
      const gltf = await loader.loadAsync(`${b.anim}?v=${ASSET_VERSION}`);
      const clip = gltf.animations[0];
      if (!clip) throw new Error('animation d’entrée absente');
      clip.name = b.clip ?? clip.name;
      const door = prop.anims?.[0] ?? null;
      if (door && b.doorClip) door.name = b.doorClip;
      const road = await (await fetch(`config/road.json?v=${ASSET_VERSION}`)).json();
      const r = road.roads.find((x) => x.id === prop.def.drive?.road) ?? road.roads[0];
      const path = buildPath(r.points);
      out.push(new Convoy({ prop, player, getAllies, world, hud, skirmish, clip, doorClip: door, path, colGeo: prop.colGeo ?? null, colHandle: prop.colHandle ?? null }));
    } catch (e) { console.error(`blindé ${prop.def.id} : montée impossible`, e); }
  }
  return out;
}
