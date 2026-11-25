// Drapeau du Mali (vert, jaune, rouge à partir du mât) hissé sur l'antenne des véhicules ; il flotte selon le vent du jeu (le même que celui de la poussière et de la fumée)
// ET selon le mouvement du véhicule : à l'arrêt il suit le vent, en roulant il est plaqué vers l'arrière. La forme du tissu est calculée dans flaglogic.js (logique pure, testée).
import * as THREE from 'three';
import { FLAG, apparentWind, windFactor, flagPoint } from './flaglogic.js';
import { smoothAngle } from './vehicle.js';

let sharedTex = null;
function texture() {
  if (sharedTex) return sharedTex;
  const c = document.createElement('canvas'); c.width = 96; c.height = 64;
  const g = c.getContext('2d');
  ['#14b53a', '#fcd116', '#ce1126'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 32, 0, 32, 64); });         // vert (côté mât), jaune, rouge
  sharedTex = new THREE.CanvasTexture(c);
  sharedTex.colorSpace = THREE.SRGBColorSpace;
  sharedTex.anisotropy = 4;
  return sharedTex;
}

const SEG_X = 16, SEG_Y = 5;

class Flag {
  /** root : le véhicule ; mount : { tip: [x, y, z] (sommet de l'antenne, repère du véhicule), pole?: { base: [x, y, z] } (un mât à ajouter s'il n'y a pas d'antenne) } ;
   *  getVelocity : () => [vx, vz] vitesse du véhicule dans le monde (m/s). */
  constructor(scene, root, mount, getVelocity, seed) {
    this.root = root; this.mount = mount; this.getVelocity = getVelocity;
    this.phase = seed * 2.399; this.yaw = 0; this.wf = 0.3; this.t0 = seed * 1.7;
    const geo = new THREE.PlaneGeometry(FLAG.w, FLAG.h, SEG_X, SEG_Y);
    const uv = geo.attributes.uv;
    this.u = new Float32Array(uv.count); this.v = new Float32Array(uv.count);
    for (let i = 0; i < uv.count; i++) { this.u[i] = uv.getX(i); this.v[i] = uv.getY(i) - 0.5; }
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: texture(), side: THREE.DoubleSide, roughness: 0.9, metalness: 0 }));
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;                           // les sommets bougent : on ne laisse pas la boîte d'origine le faire disparaître
    this.group = new THREE.Group(); this.group.add(this.mesh);
    scene.add(this.group);
    this.tmp = new THREE.Vector3();
    if (mount.pole) this._addPole(root, mount);
    this._shape(0);
  }

  /** Un mât fin et noir pour les véhicules sans antenne. */
  _addPole(root, mount) {
    const b = mount.pole.base, t = mount.tip, len = Math.max(0.1, t[1] - b[1]);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, len, 6), new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6, metalness: 0.5 }));
    pole.position.set(b[0], b[1] + len / 2, b[2]); pole.castShadow = true;
    root.add(pole);
  }

  setVisible(on) { this.group.visible = on; }

  _shape(t) {
    const p = this.geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const [x, y, z] = flagPoint(this.u[i], this.v[i], t, this.wf, FLAG, this.phase); p.setXYZ(i, x, y, z); }
    p.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  /** t : temps (s) ; dt : durée de l'image ; (wx, wz) : le vent. */
  update(t, dt, wx, wz) {
    if (!this.group.visible) return;
    this.root.updateWorldMatrix(true, false);
    const tip = this.root.localToWorld(this.tmp.set(this.mount.tip[0], this.mount.tip[1], this.mount.tip[2]));
    this.group.position.set(tip.x, tip.y - 0.05 - FLAG.h / 2, tip.z);                       // le bord haut est juste sous le sommet de l'antenne
    const [vx, vz] = this.getVelocity();
    const a = apparentWind(wx, wz, vx, vz);
    const k = 1 - Math.exp(-dt * 2.5);
    if (a.speed > 0.15) this.yaw = smoothAngle(this.yaw, a.yaw, k);                         // quasi sans vent apparent, il garde sa direction (et pend)
    this.wf += (windFactor(a.speed) - this.wf) * k;
    this.group.rotation.y = this.yaw;
    this._shape(t + this.t0);
  }
}

export class FlagSystem {
  /** windFn : (t) => [vx, vz] ; par défaut, le vent de dust.js. */
  constructor(scene, windFn) {
    this.scene = scene; this.windFn = windFn; this.flags = []; this.t = 0;
  }

  /** Hisse un drapeau sur un véhicule. Renvoie le drapeau (pour le cacher si le véhicule brûle). */
  add(root, mount, getVelocity = () => [0, 0]) {
    if (!mount?.tip) return null;
    const f = new Flag(this.scene, root, mount, getVelocity, this.flags.length + 1);
    this.flags.push(f);
    return f;
  }

  update(dt) {
    this.t += dt;
    if (!this.flags.length) return;
    const [wx, wz] = this.windFn(this.t);
    for (const f of this.flags) f.update(this.t, dt, wx, wz);
  }
}
