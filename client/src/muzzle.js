// Flamme de bouche du canon : éclair vif, boule de feu orange qui jaillit vers l'avant, étincelles, petite fumée, éclairage orange très bref.
// burstSpecs, heatColor et flashLevel sont de la logique pure (testée sans navigateur) ; MuzzleFlash les affiche.
import * as THREE from 'three';
import { ParticlePool, makePoints } from './dust.js';
import { mulberry32 } from './combat.js';

/** Couleur d'une flamme selon sa chaleur (1 = cœur blanc-jaune, 0 = braise rouge sombre). Renvoie [r, g, b] entre 0 et 1. */
export function heatColor(h) {
  const stops = [[0.0, [0.34, 0.07, 0.02]], [0.35, [1.0, 0.38, 0.05]], [0.7, [1.0, 0.72, 0.2]], [1.0, [1.0, 0.96, 0.75]]];
  const x = Math.max(0, Math.min(1, h));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [h0, c0] = stops[i - 1], [h1, c1] = stops[i], t = (x - h0) / (h1 - h0);
      return c0.map((v, k) => v + (c1[k] - v) * t);
    }
  }
  return stops[stops.length - 1][1];
}

/** Intensité de l'éclair et de la lumière à l'instant age (s) : maximale au premier instant, éteinte au bout de `life`. */
export function flashLevel(age, life = 0.07) {
  if (age < 0 || age >= life) return 0;
  const t = age / life;
  return (1 - t) * (1 - t);
}

/** Particules d'un coup de feu, dans le repère du canon : x = devant (direction du tir), y = côté, z = haut. Tirage reproductible (rng).
 *  Renvoie { fire, sparks, smoke } : listes de { v: [x, y, z] vitesse m/s, p: [x, y, z] décalage m, size0, size1, life, alpha }. */
export function burstSpecs(rng, scale = 1) {
  const r = (a, b) => a + (b - a) * rng();
  const fire = [], sparks = [], smoke = [];
  for (let i = 0; i < 9; i++) {                                            // flamme : surtout vers l'avant, un peu vers les côtés et vers l'arrière
    const fwd = i < 2 ? r(-2.5, 0) : r(3, 14) * scale;
    fire.push({ v: [fwd, r(-2.6, 2.6) * scale, r(-2.2, 3.0) * scale], p: [r(0, 0.12) * scale, r(-0.03, 0.03), r(-0.03, 0.03)],
                size0: r(0.15, 0.25) * scale, size1: r(0.48, 0.95) * scale, life: r(0.11, 0.28), alpha: r(0.85, 1.0) });
  }
  for (let i = 0; i < 5; i++) {                                            // quelques étincelles : rapides, fines, éparpillées en cône
    const sp = r(8, 22) * scale;
    sparks.push({ v: [sp * r(0.55, 1), r(-1, 1) * sp * 0.45, r(-0.6, 1) * sp * 0.45], p: [r(0, 0.1), 0, 0],
                  size0: r(0.04, 0.07), size1: r(0.025, 0.04), life: r(0.14, 0.38), alpha: 1 });
  }
  for (let i = 0; i < 2; i++) {                                            // fumée grise qui s'attarde
    smoke.push({ v: [r(0.4, 1.8), r(-0.5, 0.5), r(0.2, 0.9)], p: [r(0.05, 0.3), 0, 0],
                 size0: r(0.14, 0.22) * scale, size1: r(0.6, 0.95) * scale, life: r(0.6, 1.1), alpha: r(0.12, 0.2) });
  }
  return { fire, sparks, smoke };
}

const VERT = /* glsl */`
attribute float aSize; attribute float aAlpha; attribute float aHeat;
uniform float uScale; uniform float uMin; varying float vAlpha; varying float vHeat;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.05), uMin, 500.0);
  vAlpha = aAlpha; vHeat = aHeat;
}`;
const FRAG = /* glsl */`
varying float vAlpha; varying float vHeat;
vec3 ramp(float h) {
  vec3 red = vec3(0.34, 0.07, 0.02), orange = vec3(1.0, 0.38, 0.05), yellow = vec3(1.0, 0.72, 0.2), white = vec3(1.0, 0.96, 0.75);
  h = clamp(h, 0.0, 1.0);
  return h < 0.35 ? mix(red, orange, h / 0.35) : h < 0.7 ? mix(orange, yellow, (h - 0.35) / 0.35) : mix(yellow, white, (h - 0.7) / 0.3);
}
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.1, 1.0, r);
  a = a * (0.55 + 0.45 * a);                                             // disque plus plein qu'un simple dégradé
  vec3 c = ramp(vHeat) * (1.0 + 0.9 * vHeat * (1.0 - r));               // coeur plus brillant que les bords
  gl_FragColor = vec4(c, a * vAlpha);
  #include <colorspace_fragment>
}`;

function firePoints(n, blending = THREE.AdditiveBlending) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  for (const k of ['aSize', 'aAlpha', 'aHeat']) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n), 1));
  const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending,
    fog: false, toneMapped: false, uniforms: { uScale: { value: 800 }, uMin: { value: 1.0 } } });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 20;
  return p;
}

/** Texture de l'éclair : coeur blanc, halo jaune-orange, quelques pointes qui rayonnent. */
function flashTexture(seed) {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), rng = mulberry32(seed);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,250,215,1)'); grad.addColorStop(0.10, 'rgba(255,215,110,0.95)'); grad.addColorStop(0.35, 'rgba(255,125,20,0.7)'); grad.addColorStop(0.7, 'rgba(235,70,0,0.25)'); grad.addColorStop(1, 'rgba(255,90,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  for (let i = 0; i < 7; i++) {                                                 // pointes
    g.rotate(rng() * 6.283); const len = S * (0.34 + rng() * 0.16), w = 2.5 + rng() * 4;
    const lg = g.createLinearGradient(0, 0, len, 0); lg.addColorStop(0, 'rgba(255,225,120,0.98)'); lg.addColorStop(1, 'rgba(255,100,10,0)');
    g.fillStyle = lg; g.beginPath(); g.moveTo(0, -w); g.lineTo(len, 0); g.lineTo(0, w); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Taille de la flamme par rapport au modèle de base de burstSpecs : 0,3 = petite flamme discrète (1 = grosse boule de feu).
export const FLAME_SIZE = 0.3;

export class MuzzleFlash {
  constructor(scene, camera, { seed = 3 } = {}) {
    this.camera = camera; this.rng = mulberry32(seed); this.t = 0;
    this.firePool = new ParticlePool(260); this.sparkPool = new ParticlePool(200); this.smokePool = new ParticlePool(80);
    this.fire = firePoints(260, THREE.NormalBlending); this.sparks = firePoints(200); this.sparks.material.uniforms.uMin.value = 3.0;
    this.smoke = makePoints(80, 0x8c8782);
    for (const o of [this.fire, this.sparks, this.smoke]) scene.add(o);
    this.smoke.renderOrder = 18;
    // éclairs : quelques sprites réutilisés
    this.flashes = [0, 1, 2, 3].map((i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(11 + i), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false }));
      sp.visible = false; sp.renderOrder = 22; sp.userData.age = 1; scene.add(sp); return sp;
    });
    this.nextFlash = 0;
    // lumière orange très brève : toujours présente (intensité 0 au repos), pour ne pas recompiler les matériaux à chaque tir
    this.light = new THREE.PointLight(0xffa447, 0, 9, 2);
    scene.add(this.light);
    this.lightAge = 1; this.lightPower = 0;
    this._scaleSet = false;
  }

  _basis(dir) {
    const f = dir.clone().normalize();
    const up = Math.abs(f.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(f, up).normalize();
    return { f, right, up: new THREE.Vector3().crossVectors(right, f) };
  }

  /** Un coup de feu : pos = bouche du canon (monde), dir = direction du tir, scale : 1 fusil, ~0.7 pistolet. L'effet reste une PETITE flamme (FLAME_SIZE). */
  shot(pos, dir, scale = 1) {
    scale *= FLAME_SIZE;
    const { f, right, up } = this._basis(dir);
    const spec = burstSpecs(this.rng, scale);
    const put = (pool, list) => {
      for (const s of list) {
        const px = pos.x + f.x * s.p[0] + right.x * s.p[1] + up.x * s.p[2], py = pos.y + f.y * s.p[0] + right.y * s.p[1] + up.y * s.p[2], pz = pos.z + f.z * s.p[0] + right.z * s.p[1] + up.z * s.p[2];
        const vx = f.x * s.v[0] + right.x * s.v[1] + up.x * s.v[2], vy = f.y * s.v[0] + right.y * s.v[1] + up.y * s.v[2], vz = f.z * s.v[0] + right.z * s.v[1] + up.z * s.v[2];
        pool.spawn(px, py, pz, vx, vy, vz, s.life, s.size0, s.size1, s.alpha);
      }
    };
    put(this.firePool, spec.fire); put(this.sparkPool, spec.sparks); put(this.smokePool, spec.smoke);
    // éclair : sprite à la bouche, un peu devant, taille et rotation aléatoires
    const sp = this.flashes[this.nextFlash]; this.nextFlash = (this.nextFlash + 1) % this.flashes.length;
    sp.position.copy(pos).addScaledVector(f, 0.12 * scale); sp.userData.age = 0; sp.userData.size = (0.8 + this.rng() * 0.45) * scale;
    sp.material.rotation = this.rng() * 6.283; sp.visible = true;
    this.light.position.copy(pos).addScaledVector(f, 0.35); this.lightAge = 0; this.lightPower = 14 * scale;
  }

  _resize() {
    const h = (this.renderer?.domElement?.height ?? innerHeight);
    const scale = h / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    for (const o of [this.fire, this.sparks, this.smoke]) o.material.uniforms.uScale.value = scale;
  }

  update(dt) {
    this.t += dt;
    if (!this._scaleSet) { this._resize(); this._scaleSet = true; }
    for (const sp of this.flashes) {
      if (!sp.visible) continue;
      sp.userData.age += dt;
      const k = flashLevel(sp.userData.age);
      if (k <= 0) { sp.visible = false; continue; }
      sp.scale.setScalar(sp.userData.size * (0.8 + 0.6 * (1 - k)));
      sp.material.opacity = Math.min(1, k * 1.3);
    }
    this.lightAge += dt;
    this.light.intensity = this.lightPower * flashLevel(this.lightAge, 0.09);
    this._fill(this.firePool, this.fire, dt, 3.5, 0.6, null);
    this._fill(this.sparkPool, this.sparks, dt, 0.6, -9, 1);
    // fumée : même mécanique que la poussière (gris, mélange normal), portée par le vent
    this.smokePool.update(dt, 1.2, 0.4, 1.8, 0.5);
    const a = this.smoke.geometry.attributes, N = this.smokePool.n;
    for (let i = 0; i < N; i++) {
      const lk = this.smokePool.look(i);
      a.aSize.array[i] = lk.size; a.aAlpha.array[i] = lk.alpha;
      a.position.array[i * 3] = this.smokePool.pos[i * 3]; a.position.array[i * 3 + 1] = this.smokePool.pos[i * 3 + 1]; a.position.array[i * 3 + 2] = this.smokePool.pos[i * 3 + 2];
    }
    a.position.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
  }

  _fill(pool, pts, dt, drag, rise, fixedHeat) {
    pool.update(dt, 0, 0, drag, rise);
    const a = pts.geometry.attributes, N = pool.n;
    for (let i = 0; i < N; i++) {
      const lk = pool.look(i);
      const age = pool.life[i] > 0 ? 1 - pool.life[i] / pool.max[i] : 1;
      a.aSize.array[i] = lk.size;
      a.aAlpha.array[i] = pool.life[i] > 0 ? pool.a0[i] * Math.pow(1 - age, 1.2) : 0;     // la flamme est vive d'emblée (pas de montée) puis s'éteint
      a.aHeat.array[i] = fixedHeat ?? Math.max(0, 0.82 - 0.82 * Math.pow(age, 0.6));          // jaune-orange au départ, orange, puis braise
      a.position.array[i * 3] = pool.pos[i * 3]; a.position.array[i * 3 + 1] = pool.pos[i * 3 + 1]; a.position.array[i * 3 + 2] = pool.pos[i * 3 + 2];
    }
    a.position.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = a.aHeat.needsUpdate = true;
  }
}
