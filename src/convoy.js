// Le convoi de blindés : plusieurs MRAP qui roulent doucement en file le long de la piste (config/convoy.json). Des miliciens lance-missiles les prennent pour cible (skirmish.js) ;
// un blindé touché deux fois est neutralisé : il s'arrête, brûle, et bloque ceux qui le suivent.
//  - ConvoyLogic : la file, les vitesses, les dégâts (logique pure, testée sans navigateur) ;
//  - Convoy : les modèles 3D, les roues, la collision mobile, les flammes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { decodeSCOL } from './meshworld.js';
import { buildPath, pathAt, rideOnSurface, vehiclePose, smoothAngle } from './vehicle.js';
import { corridorMesh } from './road.js';
import { tuneVehicle } from './vehiclefx.js';
import { ASSET_VERSION } from './version.js';

const UP = new THREE.Vector3(0, 1, 0);

const clamp01 = (u) => Math.max(0, Math.min(1, u));
const smooth = (u) => u * u * (3 - 2 * u);

/** La file de véhicules. s : distance parcourue sur la piste ; lat : écart latéral à la piste (m, > 0 = à gauche) ; le premier de la liste est en tête.
 *  Quand un blindé est neutralisé, ceux qui arrivent derrière CONTOURNENT l'épave : ils choisissent un côté où le terrain est praticable (sideOk), ralentissent, se décalent
 *  progressivement (pas de coup de volant), la dépassent avec la marge voulue (clear), puis reviennent sur la piste. Si aucun côté n'est praticable, ils s'arrêtent avant elle. */
export class ConvoyLogic {
  constructor({ starts, cruise = 3.2, spacing = 17, hp = 3, length = 0, accel = 1.2, brake = 3, clear = 5.6, sideOk = null }) {
    Object.assign(this, { cruise, spacing, length, accel, brake, clear, sideOk });
    this.vehicles = starts.map((s, i) => ({ id: i, s, v: 0, lat: 0, latRate: 0, plan: null, hp, maxHp: hp, state: 'roule' }));       // 'roule' | 'neutralise' | 'arrive'
  }

  get alive() { return this.vehicles.filter((v) => v.state !== 'neutralise'); }
  get allDown() { return this.vehicles.every((v) => v.state === 'neutralise'); }

  /** Dégâts à un véhicule ; renvoie vrai s'il vient d'être neutralisé. */
  damage(i, n = 1) {
    const v = this.vehicles[i];
    if (v.state === 'neutralise') return false;
    v.hp -= n;
    if (v.hp <= 0) { v.hp = 0; v.state = 'neutralise'; return true; }
    return false;
  }

  /** Une explosion en (x, z) : renvoie les indices des véhicules touchés et ce qu'ils ont reçu. positions : [{ x, z }] dans l'ordre des véhicules.
   *  À moins de 4 m : 2 points de dégâts (en plein dessus) ; jusqu'à 8 m : 1 point. */
  blast(x, z, positions) {
    const out = [];
    positions.forEach((p, i) => {
      const v = this.vehicles[i];
      if (v.state === 'neutralise') return;
      const d = Math.hypot(p.x - x, p.z - z), dmg = d <= 4 ? 2 : d <= 8 ? 1 : 0;
      if (dmg) out.push({ i, dmg, killed: this.damage(i, dmg) });
    });
    return out;
  }

  /** Le côté par lequel contourner l'épave w : 1 (gauche), -1 (droite) ou 0 (aucun passage). */
  _chooseSide(w) {
    if (!this.sideOk) return 1;
    for (const side of [1, -1]) if (this.sideOk(w.s, w.lat + side * this.clear)) return side;
    return 0;
  }

  /** Fait avancer la file d'un pas de temps. Chacun roule à la vitesse de croisière, garde ses distances avec le véhicule vivant qui le précède, et contourne les épaves. */
  update(dt) {
    const vs = this.vehicles;
    let rank = 0;                                                               // nombre de véhicules vivants devant lui (pour sa place à l'arrivée)
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (v.state === 'neutralise') { v.v = Math.max(0, v.v - this.brake * 1.5 * dt); v.s += v.v * dt; v.latRate = 0; continue; }     // l'épave glisse un peu puis s'arrête
      let front = null;
      for (let j = i - 1; j >= 0; j--) if (vs[j].state !== 'neutralise') { front = vs[j]; break; }
      let target = v.state === 'arrive' ? 0 : this.cruise;
      if (front) {
        const gap = front.s - v.s, want = this.spacing;
        if (front.state === 'arrive') target = Math.min(target, Math.max(0, (gap - want) * 0.8));                                   // il se range derrière
        else if (gap < want) target = Math.min(target, Math.max(0, front.v - (want - gap) * 0.5));                                  // trop près : il ralentit
      }
      // épave devant : on la contourne
      let obs = null, od = Infinity;
      for (const w of vs) if (w.state === 'neutralise') { const d = w.s - v.s; if (d > -28 && d < 45 && d < od) { od = d; obs = w; } }
      let latTarget = 0;
      if (obs) {
        if (!v.plan || v.plan.obs !== obs) v.plan = { obs, side: this._chooseSide(obs) };
        if (v.plan.side === 0) target = Math.min(target, Math.sqrt(2 * this.brake * Math.max(0, od - 14)));                         // pas de passage : il s'arrête avant
        else {
          const a = smooth(clamp01((35 - od) / 20)), b = od < -14 ? smooth(clamp01((-od - 14) / 12)) : 0;                         // il se décale entre 35 et 15 m avant l'épave, et ne revient qu'une fois entièrement dépassée (14 à 26 m après)
          latTarget = obs.lat + v.plan.side * this.clear * a * (1 - b);
          if (od > -14 && od < 24) target = Math.min(target, 2.0);                                                                // lentement près de l'épave
        }
      } else v.plan = null;
      if (this.length) {                                                         // bout de la piste : chacun s'arrête pile à sa place dans la file
        const stopAt = this.length - 4 - rank * this.spacing;
        target = Math.min(target, Math.sqrt(2 * this.brake * Math.max(0, stopAt - v.s)) * 0.9);
        if (v.s >= stopAt - 0.3 && v.v < 0.1) v.state = 'arrive';
      }
      if (v.v < target) v.v = Math.min(target, v.v + this.accel * dt); else v.v = Math.max(target, v.v - this.brake * dt);
      const rate = 1.6 * Math.min(1, v.v / 1.5), dl = Math.max(-rate * dt, Math.min(rate * dt, latTarget - v.lat));        // le volant tourne progressivement
      v.lat += dl; v.latRate = dt > 0 ? dl / dt : 0;
      v.s += v.v * dt;
      rank++;
    }
  }
}

export class Convoy {
  /** cfg : config/convoy.json ; road : { points } ; world ; smoke (SmokeSystem, facultatif) ; hud. */
  constructor({ cfg, path, world, scene, gltf, collisionGeo, smoke = null, hud = null }) {
    this.cfg = cfg; this.path = path; this.world = world; this.scene = scene; this.smoke = smoke; this.hud = hud;
    // hauteur RÉELLE du sable sous les roues (rayon sur les triangles proches de la piste) : la carte de hauteur est trop grossière et les roues s'enfonçaient ou flottaient
    this._ray = new THREE.Raycaster(); this._ray.firstHitOnly = true; this._from = new THREE.Vector3(); this._down = new THREE.Vector3(0, -1, 0);
    this._near = world.groundMeshes?.length ? corridorMesh(world.groundMeshes, path.pts.map((p) => [p[0], -p[1]]), 16) : null;
    this.logic = new ConvoyLogic({ starts: cfg.starts, cruise: cfg.cruise, spacing: cfg.spacing, hp: cfg.hp, length: path.length, clear: cfg.clear ?? 5.6, sideOk: (s, lat) => this._sideOk(s, lat) });
    this.items = this.logic.vehicles.map((v) => {
      const root = clone(gltf.scene);
      root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material = o.material.clone(); } });
      tuneVehicle(root);                                                     // peinture un peu métallisée, reflet de ciel
      scene.add(root);
      const box = { t: 'b', x: 0, y: 0, hx: cfg.box?.[0] ?? 2.1, hy: cfg.box?.[1] ?? 5.0, yaw: 0 };                  // collision mobile (voir world.addDynamic)
      world.addDynamic?.(box);
      const wheels = ['Roue_AVG', 'Roue_AVD', 'Roue_ARG', 'Roue_ARD'].map((n) => root.getObjectByName(n));            // avant gauche, avant droite, arrière gauche, arrière droite
      return { v, root, box, heading: 0, pitch: 0, roll: 0, wheelAngle: 0, wheels: wheels.filter(Boolean), susp: wheels.map(() => 0), base: wheels.map((w) => w?.position.y ?? 0), allWheels: wheels, burning: null };
    });
    this.items.forEach((it, i) => this._pose(it, true));
    this.onDown = null;                                                         // appelé quand un blindé est neutralisé
  }

  /** Avancement du convoi pour la carte : { alive, total, fraction (0..1 : le plus avancé des blindés vivants), done, vehicles: [{ f, alive }] }. */
  progress() {
    const L = this.path.length, vs = this.logic.vehicles;
    const alive = vs.filter((v) => v.state !== 'neutralise');
    const fraction = alive.length ? Math.max(...alive.map((v) => v.s)) / L : Math.max(...vs.map((v) => v.s)) / L;
    return { alive: alive.length, total: vs.length, fraction: Math.max(0, Math.min(1, fraction)), done: alive.length > 0 && alive.every((v) => v.state === 'arrive'),
             vehicles: vs.map((v) => ({ f: Math.max(0, Math.min(1, v.s / L)), alive: v.state !== 'neutralise' })) };
  }

  /** Positions monde des véhicules : [{ x, y, z, heading, v, alive }]. */
  positions() {
    return this.items.map((it) => ({ x: it.root.position.x, y: it.root.position.y, z: it.root.position.z, heading: it.heading, v: it.v.v, alive: it.v.state !== 'neutralise' }));
  }

  /** Le terrain est-il praticable à l'écart latéral `lat` de la piste, autour de la distance s (12 m avant à 12 m après) ? Pas d'objet de la carte, pas de forte pente. */
  _sideOk(s, lat) {
    for (const ds of [-12, -8, -4, 0, 4, 8, 12]) {
      const p = pathAt(this.path, s + ds), c = Math.cos(p.heading), n = Math.sin(p.heading);
      const x = p.x + c * lat, z = -(p.y + n * lat), gy = this.world.groundY(x, z);
      if (this.world.mesh && this.world.mesh.insideObject(x, gy + 0.9, z) >= 0) return false;
      const vp = vehiclePose(this.world.groundY, x, z, p.heading);
      if (Math.abs(vp.pitch) > 0.38 || Math.abs(vp.roll) > 0.3) return false;
    }
    return true;
  }

  /** Hauteur du sable en (x, z) : le vrai maillage s'il est là, sinon la carte de hauteur. */
  _surface(x, z) {
    const g = this.world.groundY(x, z);
    if (!this._near) return g;
    this._ray.set(this._from.set(x, g + 6, z), this._down);
    const hit = this._ray.intersectObject(this._near, false)[0];
    return hit && Math.abs(hit.point.y - g) < 5 ? hit.point.y : g;
  }

  _pose(it, snap = false, dt = 0.016) {
    const p = pathAt(this.path, it.v.s), lat = it.v.lat, x = p.x + Math.cos(p.heading) * lat, z = -(p.y + Math.sin(p.heading) * lat);
    const turn = Math.max(-0.5, Math.min(0.5, Math.atan2(it.v.latRate, Math.max(it.v.v, 0.6))));       // il s'oriente dans le sens où il se décale
    const kh = snap ? 1 : 1 - Math.exp(-dt * 6), ks = snap ? 1 : 1 - Math.exp(-dt * 7);                // lissage indépendant du nombre d'images par seconde
    it.heading = smoothAngle(it.heading, p.heading + turn, kh);
    const vp = rideOnSurface((a, b) => this._surface(a, b), x, z, it.heading, this.cfg.wheels);
    if (![x, z, vp.y, it.heading].every(Number.isFinite)) return;
    if (snap || it.y === undefined) { it.y = vp.y; it.pitch = vp.pitch; it.roll = vp.roll; }
    else { it.pitch += (vp.pitch - it.pitch) * ks; it.roll += (vp.roll - it.roll) * ks; it.y += (vp.y - it.y) * (1 - Math.exp(-dt * 14)); }
    it.y = Math.max(it.y, vp.y - 0.04);                                                              // la suspension ne peut pas laisser une roue s'enfoncer de plus de 4 cm
    it.root.position.set(x, it.y + 0.03, z);
    const ke = snap ? 1 : 1 - Math.exp(-dt * 12);
    it.allWheels.forEach((w, i) => {                                                                  // suspension : chaque roue descend jusqu'au sol (jusqu'à 60 cm)
      if (!w) return;
      it.susp[i] += (Math.min(0.6, vp.drops[i]) - it.susp[i]) * ke;
      w.position.y = it.base[i] - it.susp[i] / (w.parent?.scale.y || 1);
    });
    it.root.quaternion.setFromAxisAngle(UP, it.heading)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -it.pitch))      // nez en haut : rotation négative autour de X
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), it.roll));       // côté droit en haut : rotation positive autour de Z
    it.box.x = x; it.box.y = -z; it.box.yaw = it.heading;
  }

  update(dt) {
    this.logic.update(dt);
    for (const it of this.items) {
      this._pose(it, false, dt);
      it.wheelAngle += (it.v.v * dt) / 0.85;
      for (const w of it.wheels) w.rotation.x = it.wheelAngle;
    }
  }

  /** Une explosion en pos : les blindés proches sont touchés ; un blindé neutralisé s'arrête, noircit et brûle. Renvoie la liste des touchés. */
  blast(pos) {
    const hits = this.logic.blast(pos.x, pos.z, this.items.map((it) => ({ x: it.root.position.x, z: it.root.position.z })));
    for (const h of hits) if (h.killed) this._neutralise(this.items[h.i]);
    return hits;
  }

  _neutralise(it) {
    it.root.traverse((o) => {                                                   // peinture noircie de suie
      if (!o.isMesh) return;
      const m = o.material; if (m.color) m.color.multiplyScalar(0.18);
      if ('roughness' in m) m.roughness = 0.95; if ('metalness' in m) m.metalness = 0.05; if (m.map) m.map = null;
    });
    if (this.smoke?.enabled) {
      const p = it.root.position;
      it.burning = this.smoke.addSite({ id: `blinde_${it.v.id}`, x: p.x, z: p.z, y: p.y + 1.5, kind: 'car', scale: 1.4, intensity: 0.2, target: 1 });
    }
    this.hud?.toast?.(this.logic.allDown ? 'Tout le convoi est neutralisé' : 'Un blindé du convoi est neutralisé', 3200);
    this.onDown?.(it);
  }
}

/** Charge le convoi décrit par config/convoy.json. Renvoie null si le fichier manque ou si rien ne peut être chargé (le jeu démarre quand même). */
export async function loadConvoy({ scene, world, smoke, hud }) {
  const r = await fetch(`config/convoy.json?v=${ASSET_VERSION}`);
  if (!r.ok) return null;
  const cfg = await r.json();
  const roads = await (await fetch(`config/road.json?v=${ASSET_VERSION}`)).json();
  const road = roads.roads.find((x) => x.id === cfg.road) ?? roads.roads[0];
  const path = buildPath(road.points);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(`${cfg.file}?v=${ASSET_VERSION}`);
  return new Convoy({ cfg, path, world, scene, gltf, smoke, hud });
}
