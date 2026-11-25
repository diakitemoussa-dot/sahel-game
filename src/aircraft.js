// Avions de chasse (passages dans le ciel) et hélicoptères (qui tournent au-dessus de la carte).
// Les appareils sont construits en code (formes simples, gris militaire) : aucun fichier de modèle. Chacun a son moteur, placé dans l'espace.
import * as THREE from 'three';
import { orbitPose, planPass, passPosition } from './aircraftlogic.js';
import { StrikeScheduler } from './smokelogic.js';

const std = (color, rough = 0.55, metal = 0.5, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

/** Pièce plate : polygone (x, y) extrudé sur `thick`, posé à plat (shape y -> avant z) ou debout (shape x -> -z, thickness -> x). */
function flat(points, thick, mat, mode = 'wing') {
  const sh = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  if (mode === 'wing') g.rotateX(Math.PI / 2); else g.rotateY(Math.PI / 2);
  return new THREE.Mesh(g, mat);
}

/** Avion de chasse, nez vers +Z, ~17 m. Renvoie { group, nozzles : [positions locales des deux tuyères], glow : [cônes de postcombustion] }. */
export function buildJet() {
  const g = new THREE.Group();
  const body = std(0x6e747c, 0.42, 0.6), dark = std(0x2a2d32, 0.6, 0.4), glass = std(0x0a1218, 0.08, 0.95);
  // fuselage : profil tourné autour de l'axe de l'appareil
  const prof = [[0.0, -8.4], [0.62, -8.4], [0.8, -7.2], [0.98, -4.8], [1.08, -1.0], [1.06, 2.0], [0.86, 4.4], [0.5, 6.6], [0.16, 8.2], [0.0, 8.8]].map(([r, y]) => new THREE.Vector2(r, y));
  const fus = new THREE.LatheGeometry(prof, 20); fus.rotateX(Math.PI / 2); fus.scale(1, 0.82, 1);
  g.add(new THREE.Mesh(fus, body));
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), glass); canopy.scale.set(0.5, 0.42, 1.9); canopy.position.set(0, 0.78, 3.0); g.add(canopy);
  const wing = flat([[0.9, 1.6], [6.4, -3.0], [6.4, -4.5], [0.9, -4.3], [-0.9, -4.3], [-6.4, -4.5], [-6.4, -3.0], [-0.9, 1.6]], 0.17, body); wing.position.y = -0.1; g.add(wing);
  const stabH = flat([[0.8, -5.2], [3.5, -7.1], [3.5, -7.9], [0.8, -7.7], [-0.8, -7.7], [-3.5, -7.9], [-3.5, -7.1], [-0.8, -5.2]], 0.12, body); stabH.position.y = -0.05; g.add(stabH);
  for (const s of [-1, 1]) {                                                    // deux dérives inclinées
    const fin = flat([[3.2, 0.7], [7.1, 0.7], [7.5, 3.3], [6.0, 3.3]], 0.12, body, 'fin');
    fin.position.set(s * 0.95, 0, 0); fin.rotation.z = -s * 0.28; g.add(fin);
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 2.6), dark); intake.position.set(s * 1.15, -0.1, 1.3); g.add(intake);
  }
  const nozzles = [], glow = [];
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const s of [-1, 1]) {
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.58, 1.3, 14), dark); n.rotation.x = Math.PI / 2; n.position.set(s * 0.52, 0, -8.5); g.add(n);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.4, 4.2, 12), glowMat); f.rotation.x = -Math.PI / 2; f.position.set(s * 0.52, 0, -11.0); g.add(f);   // la pointe vers l'arrière
    nozzles.push(new THREE.Vector3(s * 0.52, 0, -9.3)); glow.push(f);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { group: g, nozzles, glow };
}

/** Hélicoptère, nez vers +Z, ~13 m. Renvoie { group, rotor, tail, light }. */
export function buildHeli() {
  const g = new THREE.Group();
  const body = std(0x41483a, 0.62, 0.3), dark = std(0x1b1d1c, 0.7, 0.3), glass = std(0x0c1319, 0.08, 0.95);
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), body); hull.scale.set(1.2, 1.25, 2.7); g.add(hull);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), glass); nose.scale.set(0.95, 0.9, 1.35); nose.position.set(0, 0.12, 1.75); g.add(nose);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.13, 6.2, 12), body); boom.rotation.x = Math.PI / 2; boom.position.set(0, 0.45, -5.0); g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.7, 1.2), body); fin.position.set(0, 1.15, -7.6); fin.rotation.x = 0.28; g.add(fin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.65), body); stab.position.set(0, 0.6, -7.0); g.add(stab);
  const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.55, 2.7, 14), dark); eng.rotation.x = Math.PI / 2; eng.position.set(0, 1.4, -0.4); g.add(eng);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.9, 10), dark); mast.position.y = 1.95; g.add(mast);
  const rotor = new THREE.Group(); rotor.position.y = 2.45; g.add(rotor);
  for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.045, 0.4), dark); b.rotation.y = i * Math.PI / 2; rotor.add(b); }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(4.1, 28), new THREE.MeshBasicMaterial({ color: 0x151515, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; rotor.add(disc);                              // flou de rotation
  const tail = new THREE.Group(); tail.position.set(0.28, 1.2, -7.75); g.add(tail);
  for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.7, 0.13), dark); b.rotation.x = i * Math.PI / 2; tail.add(b); }
  for (const s of [-1, 1]) {                                                    // patins
    const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.8, 8), dark); sk.rotation.x = Math.PI / 2; sk.position.set(s * 1.05, -1.5, 0.2); g.add(sk);
    for (const z of [-0.7, 1.0]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.75, 6), dark); st.position.set(s * 1.0, -1.15, z); st.rotation.z = s * 0.25; g.add(st); }
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), lightMat); light.position.set(0, 2.05, -8.0); g.add(light);   // feu de position clignotant
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { group: g, rotor, tail, light };
}

// orbites des hélicoptères (repère du jeu) : une tout près de la zone de départ, une plus loin à l'est, en sens inverse
const HELI_ORBITS = [
  { cx: -60, cz: 60, radius: 140, alt: 58, speed: 22, dir: 1, phase: 0.6 },
  { cx: 110, cz: -60, radius: 120, alt: 68, speed: 19, dir: -1, phase: 2.4 },
];

export class AirTraffic {
  /** opts : { sfx, smoke (traînées de condensation), enabled, passes (passages d'avions automatiques), orbits } */
  constructor(scene, camera, world, { sfx = null, smoke = null, enabled = true, passes = true, orbits = HELI_ORBITS } = {}) {
    this.targetPicker = null;                                                   // (joueur, cap) -> { x, z } : où les avions tirent (les miliciens) ; null : foyers habituels
    this.supportAt = -1e9;
    this.scene = scene; this.camera = camera; this.world = world; this.sfx = sfx; this.smoke = smoke;
    this.enabled = enabled; this.autoPasses = passes; this.time = 0; this.audible = true;
    this.helis = []; this.passes = []; this.jetsFlown = 0;
    this.scheduler = new StrikeScheduler({ first: 25, min: 45, max: 90 });                // passages moins fréquents (avant : 10 / 30-58 s)
    this.strikes = true; this.strikesFired = 0;                                  // les frappes (missiles) partent des avions de chasse
    if (enabled) for (const o of orbits) this._addHeli(o);
  }

  _addHeli(orbit) {
    const m = buildHeli();
    m.group.rotation.order = 'YXZ';
    this.scene.add(m.group);
    const base = this.world.groundY(orbit.cx, orbit.cz);
    this.helis.push({ ...m, orbit: { ...orbit, alt: base + orbit.alt }, voice: this.sfx?.voice('heli') ?? null, pos: new THREE.Vector3() });
    this._poseHeli(this.helis[this.helis.length - 1], 0);
  }

  _poseHeli(h, t) {
    const p = orbitPose(h.orbit, t);
    h.pos.set(p.x, p.y, p.z); h.vel = { x: p.vx, z: p.vz };
    h.group.position.copy(h.pos);
    h.group.rotation.set(0.07, p.yaw, p.bank);                                // nez légèrement baissé, penché vers le centre du cercle
  }

  /** Lance un passage de deux avions de chasse devant le joueur. Renvoie le passage. */
  launchPass(player, heading, target = null) {
    const plan = target ? planPass(target, Math.random() * Math.PI * 2, Math.random, { ahead: 0, side: 0 }) : planPass(player, heading);        // à l'appui : le passage survole la cible
    const jets = [0, 1].map((i) => {
      const m = buildJet(); m.group.rotation.order = 'YXZ'; m.group.visible = false; this.scene.add(m.group);
      return { ...m, off: i === 0 ? { along: 0, lat: 0, up: 0 } : { along: -26, lat: 22, up: 5 } };    // l'ailier est un peu derrière et sur le côté
    });
    const shots = [{ jet: 0, at: plan.dur * 0.3 }, { jet: 1, at: plan.dur * 0.3 + 0.8 }];       // chaque avion tire un missile (le 2e avion 0,8 s après le 1er)
    const pass = { plan, target, t: 0, shots, jets, voice: this.sfx?.voice('jet') ?? null, trail: 0, pos: { x: plan.from.x, z: plan.from.z }, y: this.world.groundY(player.x, player.z) + plan.alt };
    this.passes.push(pass); this.jetsFlown += 2;
    return pass;
  }

  /** Les avions se rabattent sur `target` ({ x, z }) : un passage qui survole la cible et tire dessus. Au plus un appui toutes les 30 s ; renvoie vrai s'il part. */
  callSupport(target) {
    if (!this.enabled || !this.strikes || !this.smoke?.enabled || this.time - this.supportAt < 30 || this.passes.length > 1) return false;
    this.supportAt = this.time;
    this.launchPass(target, 0, { x: target.x, z: target.z });
    return true;
  }

  setAudible(on) { this.audible = on; if (!on) { for (const h of this.helis) h.voice?.update(null, null, 0); for (const p of this.passes) p.voice?.update(null, null, 0); } }

  /** player : { x, z } ; heading : regard du joueur ; allowPasses : vrai en jeu et derrière le menu. */
  update(dt, player, heading = 0, allowPasses = true) {
    if (!this.enabled) return;
    this.time += dt;
    const L = this.camera.position;
    for (const h of this.helis) {
      this._poseHeli(h, this.time);
      h.rotor.rotation.y += dt * 27; h.tail.rotation.x += dt * 45;
      h.light.visible = Math.sin(this.time * 5 + h.orbit.phase) > 0.2;
      h.voice?.update(h.pos, h.vel, this.audible ? 1 : 0);
    }
    if (allowPasses && this.autoPasses && this.scheduler.update(dt)) this.launchPass(player, heading);
    for (let k = this.passes.length - 1; k >= 0; k--) {
      const p = this.passes[k], plan = p.plan;
      p.t += dt;
      const lead = passPosition(plan, p.t);
      const yaw = Math.atan2(plan.dir.x, plan.dir.z), right = { x: -plan.dir.z, z: plan.dir.x };
      for (const j of p.jets) {
        j.group.visible = true;
        const x = lead.x + plan.dir.x * j.off.along + right.x * j.off.lat, z = lead.z + plan.dir.z * j.off.along + right.z * j.off.lat;
        j.group.position.set(x, p.y + j.off.up, z);
        j.group.rotation.set(0.03, yaw, Math.sin(this.time * 0.8 + j.off.lat) * 0.06);
        j.group.updateMatrixWorld(true);
        const pulse = 0.85 + 0.15 * Math.sin(this.time * 40 + j.off.lat);
        for (const f of j.glow) f.scale.set(pulse, pulse, 0.8 + 0.25 * pulse);                         // la postcombustion vacille
      }
      p.pos = { x: lead.x, z: lead.z };
      for (const sh of p.shots) {
        if (sh.done || p.t < sh.at) continue;
        sh.done = true;
        if (!this.strikes || !this.smoke?.enabled) continue;
        const w = p.jets[sh.jet].group.position, origin = { x: w.x, y: w.y - 1, z: w.z };
        const aim = p.target ?? this.targetPicker?.(player, heading);                                  // les miliciens d'abord
        if (aim) { this.smoke.launchMissile({ x: aim.x + (Math.random() - 0.5) * 5, z: aim.z + (Math.random() - 0.5) * 5 }, 3.4, origin); this.strikesFired++; }
        else if (this.smoke.strike(player, heading, origin)) this.strikesFired++;
      }
      p.voice?.update({ x: lead.x, y: p.y, z: lead.z }, { x: plan.dir.x * plan.speed, z: plan.dir.z * plan.speed }, this.audible ? 1 : 0);
      if (this.smoke?.enabled) {                                                                       // traînées blanches derrière les tuyères
        p.trail += dt;
        const gap = 0.06 * (this.smoke.detail?.trail ?? 1);
        while (p.trail >= gap) {
          p.trail -= gap;
          for (const j of p.jets) for (const n of j.nozzles) {
            const w = n.clone().applyMatrix4(j.group.matrixWorld);
            this.smoke.smoke.spawn(w.x - plan.dir.x * plan.speed * 0.03, w.y, w.z - plan.dir.z * plan.speed * 0.03, 0, 0, 0, 9, 1.3, 11, 0.5, { drag: 0.1, tone: 0.5, hot: 0, spin: 0.05 });
          }
        }
      }
      if (lead.done) {
        for (const j of p.jets) { this.scene.remove(j.group); j.group.traverse((o) => { o.geometry?.dispose?.(); }); }
        p.voice?.stop();
        this.passes.splice(k, 1);
      }
    }
  }
}
