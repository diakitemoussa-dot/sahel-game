// Effets de sang sur les PNJ : jet de gouttelettes et brume rouge à l'impact (dans le sens du tir), éclaboussures qui retombent et tachent le sable,
// mare qui s'étend sous un PNJ tombé. Semi-réaliste : rouge sombre, taches irrégulières qui sèchent et s'effacent lentement.
// splatSpecs, poolRadius, decalAlpha et groundNormal sont de la logique pure (testée sans navigateur) ; BloodFx les affiche.
// Désactivable : ajouter ?sang=0 à l'adresse du jeu.
import * as THREE from 'three';
import { ParticlePool, makePoints } from './dust.js';
import { mulberry32 } from './combat.js';

const UP = new THREE.Vector3(0, 1, 0);

/** Gouttelettes et brume d'un impact. dir : direction du tir (unitaire, [x, y, z]) ; amount : 0..1+ (dégâts, tir à la tête, coup fatal).
 *  Renvoie { drops: [{ v: [x, y, z], size, life }], mist: [{ v, size0, size1, life, alpha }] } (vitesses en m/s, repère du monde). */
export function splatSpecs(rng, dir, amount = 0.5) {
  const r = (a, b) => a + (b - a) * rng();
  const n = Math.round(4 + 16 * Math.min(1.5, amount));
  const drops = [], mist = [];
  for (let i = 0; i < n; i++) {
    const sp = r(1.5, 7.5) * (0.6 + 0.5 * Math.min(1.5, amount));
    drops.push({ v: [dir[0] * sp + r(-1.6, 1.6), dir[1] * sp + r(0.2, 2.6), dir[2] * sp + r(-1.6, 1.6)], size: r(0.018, 0.045), life: r(0.5, 1.2) });
  }
  const m = Math.round(1 + 3 * Math.min(1.5, amount));
  for (let i = 0; i < m; i++) {
    mist.push({ v: [dir[0] * r(0.5, 2.4) + r(-0.6, 0.6), r(0.1, 0.9), dir[2] * r(0.5, 2.4) + r(-0.6, 0.6)], size0: r(0.06, 0.1), size1: r(0.18, 0.32), life: r(0.15, 0.32), alpha: r(0.25, 0.42) });
  }
  return { drops, mist };
}

/** Rayon (m) de la mare t secondes après la chute : elle s'étend vite puis se stabilise. */
export function poolRadius(t, max = 0.5, tau = 1.8) {
  return t <= 0 ? 0 : max * (1 - Math.exp(-t / tau));
}

/** Opacité d'une tache selon son âge : nette un long moment, puis elle sèche et s'efface (life secondes au total). */
export function decalAlpha(age, life = 60, peak = 0.85) {
  if (age < 0 || age >= life) return 0;
  const fadeStart = life * 0.55;
  return age < fadeStart ? peak : peak * (1 - (age - fadeStart) / (life - fadeStart));
}

/** Normale du sol en (x, z) d'après une fonction de hauteur h(x, z) : sert à poser les taches à plat sur la pente. Renvoie [x, y, z] unitaire. */
export function groundNormal(h, x, z, e = 0.35) {
  const dx = h(x + e, z) - h(x - e, z), dz = h(x, z + e) - h(x, z - e);
  const n = [-dx / (2 * e), 1, -dz / (2 * e)], l = Math.hypot(...n);
  return n.map((v) => v / l);
}

/** Texture d'une tache : tache centrale irrégulière, gouttes autour, une traînée. kind 0..2. */
function splatTexture(kind, seed) {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), rng = mulberry32(seed + kind * 17);
  g.translate(S / 2, S / 2);
  const blob = (x, y, rx, ry, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    gr.addColorStop(0, `rgba(88,4,6,${a})`); gr.addColorStop(0.75, `rgba(70,3,5,${a * 0.9})`); gr.addColorStop(1, 'rgba(60,2,4,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, rng() * 3, 0, 6.283); g.fill();
  };
  blob(0, 0, 20 + rng() * 10, 16 + rng() * 10, 0.95);
  for (let i = 0; i < 6 + kind * 3; i++) { const a = rng() * 6.283, d = 16 + rng() * 36; blob(Math.cos(a) * d, Math.sin(a) * d, 2 + rng() * 6, 2 + rng() * 5, 0.9); }
  g.strokeStyle = 'rgba(75,3,5,0.85)'; g.lineCap = 'round';                                        // traînées
  for (let i = 0; i < 2 + kind; i++) { const a = rng() * 6.283, l = 26 + rng() * 30; g.lineWidth = 2 + rng() * 3; g.beginPath(); g.moveTo(Math.cos(a) * 10, Math.sin(a) * 10); g.lineTo(Math.cos(a) * l, Math.sin(a) * l); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Texture de la mare : grande tache arrondie, bord irrégulier, centre plus sombre. */
function poolTexture(seed) {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), rng = mulberry32(seed);
  g.translate(S / 2, S / 2);
  g.beginPath();
  for (let i = 0; i <= 40; i++) { const a = i / 40 * 6.283, r = 46 + 9 * Math.sin(a * 3 + 1) + 7 * Math.sin(a * 5 + 2) + rng() * 4; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath();
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 56); gr.addColorStop(0, 'rgba(58,2,4,0.97)'); gr.addColorStop(0.7, 'rgba(82,4,6,0.92)'); gr.addColorStop(1, 'rgba(95,6,8,0.55)');
  g.fillStyle = gr; g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class BloodFx {
  constructor(scene, world, camera, { seed = 21, enabled = true, maxDecals = 140 } = {}) {
    this.scene = scene; this.world = world; this.camera = camera; this.enabled = enabled; this.rng = mulberry32(seed); this.t = 0;
    this.dropPool = new ParticlePool(320); this.mistPool = new ParticlePool(80);
    this.drops = makePoints(320, 0x5a0408); this.mist = makePoints(80, 0x8a0c10);
    this.drops.renderOrder = 12; this.mist.renderOrder = 13;
    scene.add(this.drops, this.mist);
    this.splatTex = [0, 1, 2].map((k) => splatTexture(k, seed)); this.poolTex = poolTexture(seed);
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.decals = [];                                                      // { mesh, born, size, grow?: { max, start } }
    this.maxDecals = maxDecals; this.nextDecal = 0;
    this._scaleSet = false;
  }

  _decal(x, z, size, tex, { alpha = 0.85, life = 60, grow = null } = {}) {
    const y = this.world.groundY(x, z) + 0.07;
    let d = this.decals[this.nextDecal];
    if (!d) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
      const mesh = new THREE.Mesh(this.geo, mat); mesh.renderOrder = 4; mesh.frustumCulled = true;
      this.scene?.add(mesh);
      d = { mesh }; this.decals[this.nextDecal] = d;
    }
    this.nextDecal = (this.nextDecal + 1) % this.maxDecals;                // la réserve est circulaire : la plus ancienne tache est remplacée
    const n = groundNormal((a, b) => this.world.groundY(a, b), x, z);
    d.mesh.material.map = tex;
    d.mesh.position.set(x, y, z);
    d.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...n));
    d.mesh.rotateZ(this.rng() * 6.283);
    d.mesh.scale.setScalar(grow ? 0.01 : size);
    d.born = this.t; d.size = size; d.life = life; d.peak = alpha; d.grow = grow;
    d.mesh.visible = true; d.mesh.material.opacity = alpha;
    return d;
  }

  /** Impact sur un PNJ : pos = point touché (monde, Vector3), dir = direction du tir (Vector3 unitaire), amount : 0..1.5. */
  hit(pos, dir, amount = 0.5) {
    if (!this.enabled) return;
    const sp = splatSpecs(this.rng, [dir.x, dir.y, dir.z], amount);
    for (const d of sp.drops) this.dropPool.spawn(pos.x, pos.y, pos.z, d.v[0], d.v[1], d.v[2], d.life, d.size, d.size * 0.8, 0.95);
    for (const m of sp.mist) this.mistPool.spawn(pos.x, pos.y, pos.z, m.v[0], m.v[1], m.v[2], m.life, m.size0, m.size1, m.alpha);
  }

  /** Un PNJ est tombé : une mare s'étend sous lui. */
  bleed(pos) {
    if (!this.enabled) return;
    this._decal(pos.x, pos.z, 0.5, this.poolTex, { alpha: 0.8, life: 60, grow: { max: 0.5, start: this.t } });
  }

  _resize() {
    const h = (this.renderer?.domElement?.height ?? innerHeight);
    const scale = h / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    for (const o of [this.drops, this.mist]) o.material.uniforms.uScale.value = scale;
  }

  update(dt) {
    this.t += dt;
    if (!this._scaleSet) { this._resize(); this._scaleSet = true; }
    // gouttelettes : gravité ; au contact du sol, certaines laissent une tache
    this.dropPool.update(dt, 0, 0, 0.35, -9.8);
    const P = this.dropPool, da = this.drops.geometry.attributes;
    for (let i = 0; i < P.n; i++) {
      if (P.life[i] <= 0) { da.aSize.array[i] = 0; da.aAlpha.array[i] = 0; continue; }
      const x = P.pos[i * 3], y = P.pos[i * 3 + 1], z = P.pos[i * 3 + 2];
      const g = this.world.groundY(x, z);
      if (y <= g + 0.02) {
        if (this.rng() < 0.28) this._decal(x, z, 0.08 + this.rng() * 0.16, this.splatTex[(this.rng() * 3) | 0], { alpha: 0.7, life: 30 });
        P.life[i] = 0; da.aSize.array[i] = 0; da.aAlpha.array[i] = 0; continue;
      }
      da.position.array[i * 3] = x; da.position.array[i * 3 + 1] = y; da.position.array[i * 3 + 2] = z;
      da.aSize.array[i] = P.s0[i]; da.aAlpha.array[i] = 0.95;
    }
    da.position.needsUpdate = da.aSize.needsUpdate = da.aAlpha.needsUpdate = true;
    // brume rouge à l'impact
    this.mistPool.update(dt, 0, 0, 2.5, -0.5);
    const M = this.mistPool, ma = this.mist.geometry.attributes;
    for (let i = 0; i < M.n; i++) {
      const lk = M.look(i);
      ma.aSize.array[i] = lk.size; ma.aAlpha.array[i] = lk.alpha;
      ma.position.array[i * 3] = M.pos[i * 3]; ma.position.array[i * 3 + 1] = M.pos[i * 3 + 1]; ma.position.array[i * 3 + 2] = M.pos[i * 3 + 2];
    }
    ma.position.needsUpdate = ma.aSize.needsUpdate = ma.aAlpha.needsUpdate = true;
    // taches et mares : la mare grossit, toutes sèchent et s'effacent
    for (const d of this.decals) {
      if (!d || !d.mesh.visible) continue;
      const age = this.t - d.born;
      if (d.grow) d.mesh.scale.setScalar(Math.max(0.01, poolRadius(age, d.grow.max) * 2));
      const a = decalAlpha(age, d.life, d.peak);
      if (a <= 0) { d.mesh.visible = false; continue; }
      d.mesh.material.opacity = a;
    }
  }
}
