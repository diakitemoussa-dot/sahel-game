// Poussière du désert : (1) grains qui flottent autour de la caméra et voiles de poussière près du sol, portés par le vent avec des rafales ;
// (2) nuages de poussière soulevés sous les pieds des personnages qui courent et aux impacts de balles.
// ParticlePool et wrap sont de la logique pure (testée sans navigateur) ; DustSystem les affiche avec THREE.Points.
import * as THREE from 'three';

/** Ramène v dans [center - half, center + half] en le faisant « boucler » (les grains qui sortent de la zone ressortent de l'autre côté). */
export function wrap(v, center, half) {
  const span = 2 * half;
  return center - half + ((((v - (center - half)) % span) + span) % span);
}

/** Vent à l'instant t : direction fixe, force qui varie par rafales. Renvoie [vx, vz] en m/s. */
export function wind(t, base = 1.6) {
  const gust = 1 + 0.55 * Math.sin(t * 0.21) + 0.25 * Math.sin(t * 0.67 + 1.3);
  const k = base * Math.max(0.25, gust);
  return [k * 0.95, k * 0.31];
}

/** Réserve de particules à durée de vie (nuages de poussière) : tableaux fixes, aucune allocation pendant le jeu. */
export class ParticlePool {
  constructor(n) {
    this.n = n;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n);       // life : temps restant (0 = libre)
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.a0 = new Float32Array(n);
    this.next = 0;
  }
  get alive() { let c = 0; for (let i = 0; i < this.n; i++) if (this.life[i] > 0) c++; return c; }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, a0) {
    const i = this.next; this.next = (this.next + 1) % this.n;              // si la réserve est pleine, on remplace la plus ancienne
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
    return i;
  }
  /** wx, wz : vent ; drag : freinage par seconde. */
  update(dt, wx = 0, wz = 0, drag = 1.6, rise = 0.25) {            // rise : accélération verticale (positive : monte ; négative : retombe, comme des étincelles)
    const k = Math.max(0, 1 - drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j] = this.vel[j] * k + wx * dt * 0.8; this.vel[j + 1] = this.vel[j + 1] * k + rise * dt; this.vel[j + 2] = this.vel[j + 2] * k + wz * dt * 0.8;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
    }
  }
  /** Taille et opacité d'une particule : elle grossit, et s'efface (rapidement au début, doucement ensuite). */
  look(i) {
    if (this.life[i] <= 0) return { size: 0, alpha: 0 };
    const age = 1 - this.life[i] / this.max[i];
    const fade = Math.min(1, age * 8) * Math.pow(1 - age, 1.4);
    return { size: this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(age), alpha: this.a0[i] * fade };
  }
}

const VERT = /* glsl */`
attribute float aSize; attribute float aAlpha;
uniform float uScale; varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 0.0, 600.0);
  vAlpha = aAlpha * smoothstep(0.3, 2.5, -mv.z);                  // les grains collés à la caméra disparaissent
}`;
const FRAG = /* glsl */`
uniform vec3 uColor; varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.15, 1.0, r);                       // disque moelleux, plein au centre
  if (a * vAlpha < 0.003) discard;
  gl_FragColor = vec4(uColor, a * vAlpha);
  #include <colorspace_fragment>
}`;

export function makePoints(n, color, blending = THREE.NormalBlending) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1));
  const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending, fog: false, toneMapped: false,
    uniforms: { uScale: { value: 800 }, uColor: { value: new THREE.Color(color) } } });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

export class DustSystem {
  /** world : { groundY(x, z) } ; camera : pour l'échelle des points. */
  constructor(scene, world, camera, { grains = 650, veils = 70, puffs = 420 } = {}) {
    this.world = world; this.camera = camera; this.t = 0;
    this.grains = grains; this.veils = veils;
    this.ambient = makePoints(grains, 0xf0e2c0);            // petits grains clairs, éclairés par le soleil
    this.haze = makePoints(veils, 0xd9c49b);                 // gros voiles de poussière près du sol
    this.puffs = makePoints(puffs, 0xd8c29a);                // nuages soulevés par les pas et les impacts
    this.pool = new ParticlePool(puffs);
    for (const o of [this.haze, this.ambient, this.puffs]) { o.renderOrder = 10; scene.add(o); }
    // positions de départ aléatoires dans la boîte autour de la caméra (le reste se fait dans update)
    this.seed = new Float32Array((grains + veils) * 4);
    for (let i = 0; i < this.seed.length; i++) this.seed[i] = Math.random();
    this.gp = new Float32Array(grains * 3); this.vp = new Float32Array(veils * 3);
    this._init = false; this.feet = new Map(); this.emitCd = new Map();
  }

  _resize() {
    const h = (this.renderer?.domElement?.height ?? innerHeight);
    const scale = h / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    for (const o of [this.ambient, this.haze, this.puffs]) o.material.uniforms.uScale.value = scale;
  }

  /** Nuage de poussière à `pos` : count particules, étalement spread (m), vitesse vers le haut up (m/s), taille finale size (m). */
  puff(pos, { count = 8, spread = 0.5, up = 0.8, size = 1.2, life = 1.4, alpha = 0.35, dir = null } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      const vx = Math.cos(a) * r + (dir ? dir.x : 0), vz = Math.sin(a) * r + (dir ? dir.z : 0);
      this.pool.spawn(pos.x + Math.cos(a) * 0.1, pos.y + 0.25, pos.z + Math.sin(a) * 0.1, vx, up * (0.5 + Math.random() * 0.7), vz,
        life * (0.7 + Math.random() * 0.6), size * 0.25, size * (0.7 + Math.random() * 0.6), alpha);
    }
  }

  /** Impact (balle au sol) : petit jet de poussière. */
  impact(pos) { this.puff(pos, { count: 10, spread: 1.4, up: 2.0, size: 1.6, life: 1.4, alpha: 0.8 }); }

  /** chars : [{ pos, onGround, dead, speed? }] : ceux qui courent soulèvent de la poussière à chaque pas. */
  update(dt, chars = []) {
    this.t += dt;
    const cam = this.camera.position;
    const [wx, wz] = wind(this.t);
    if (!this._init) { this._resize(); this._init = true; }
    const gy = this.world.groundY(cam.x, cam.z);
    // grains : boîte de 70 m autour de la caméra, ils bouclent ; mouvement = vent + petit tourbillon propre à chaque grain
    const H = 38, ga = this.ambient.geometry.attributes, sa = ga.aSize.array, aa = ga.aAlpha.array, pa = ga.position.array;
    for (let i = 0; i < this.grains; i++) {
      const s = i * 4, j = i * 3;
      if (!this._seeded) {
        this.gp[j] = cam.x + (this.seed[s] - 0.5) * 2 * H; this.gp[j + 1] = gy + 0.2 + this.seed[s + 1] * 9; this.gp[j + 2] = cam.z + (this.seed[s + 2] - 0.5) * 2 * H;
      }
      const ph = this.seed[s + 3] * 6.28;
      this.gp[j] += (wx * 1.3 + Math.sin(this.t * 0.9 + ph) * 0.5) * dt;
      this.gp[j + 1] += Math.sin(this.t * 0.7 + ph * 1.7) * 0.25 * dt;
      this.gp[j + 2] += (wz * 1.3 + Math.cos(this.t * 0.8 + ph) * 0.5) * dt;
      this.gp[j] = wrap(this.gp[j], cam.x, H); this.gp[j + 2] = wrap(this.gp[j + 2], cam.z, H);
      this.gp[j + 1] = Math.min(gy + 10, Math.max(gy + 0.1, this.gp[j + 1]));
      pa[j] = this.gp[j]; pa[j + 1] = this.gp[j + 1]; pa[j + 2] = this.gp[j + 2];
      sa[i] = 0.05 + this.seed[s + 3] * 0.08;
      aa[i] = 0.55 + 0.4 * Math.sin(this.t * 1.7 + ph);                  // scintillement
    }
    this._seeded = true;
    ga.position.needsUpdate = ga.aSize.needsUpdate = ga.aAlpha.needsUpdate = true;
    // voiles de poussière : grosses taches très transparentes qui rasent le sol, plus denses dans les rafales
    const gust = Math.hypot(wx, wz) / 1.7;
    const hv = this.haze.geometry.attributes, hs = hv.aSize.array, ha = hv.aAlpha.array, hp = hv.position.array, W = 60;
    for (let i = 0; i < this.veils; i++) {
      const s = (this.grains + i) * 4, j = i * 3;
      if (!this._veilSeeded) {
        this.vp[j] = cam.x + (this.seed[s] - 0.5) * 2 * W; this.vp[j + 1] = 0.5 + this.seed[s + 1] * 3.5; this.vp[j + 2] = cam.z + (this.seed[s + 2] - 0.5) * 2 * W;
      }
      this.vp[j] = wrap(this.vp[j] + wx * 2.2 * dt, cam.x, W); this.vp[j + 2] = wrap(this.vp[j + 2] + wz * 2.2 * dt, cam.z, W);
      hp[j] = this.vp[j]; hp[j + 2] = this.vp[j + 2];
      hp[j + 1] = this.world.groundY(hp[j], hp[j + 2]) + this.vp[j + 1];
      hs[i] = 7 + this.seed[s + 3] * 9;
      ha[i] = (0.12 + 0.16 * gust) * (0.6 + 0.4 * Math.sin(this.t * 0.35 + this.seed[s + 3] * 9));
    }
    this._veilSeeded = true;
    hv.position.needsUpdate = hv.aSize.needsUpdate = hv.aAlpha.needsUpdate = true;
    // pas : un nuage tous les 0,13 s pour un personnage qui court au sol
    for (const c of chars) {
      const prev = this.feet.get(c);
      this.feet.set(c, c.pos.clone ? c.pos.clone() : { ...c.pos });
      if (!prev || (c.dead ?? c.state?.dead) || !c.onGround) continue;
      const sp = Math.hypot(c.pos.x - prev.x, c.pos.z - prev.z) / Math.max(dt, 1e-3);
      const cd = (this.emitCd.get(c) ?? 0) - dt;
      if (sp > 3.2 && cd <= 0) {
        const k = Math.min(1.6, sp / 4.6);
        this.puff(c.pos, { count: 5, spread: 0.9, up: 0.9, size: 1.9 * k, life: 1.6, alpha: 0.7, dir: { x: -(c.pos.x - prev.x) / dt * 0.12, z: -(c.pos.z - prev.z) / dt * 0.12 } });
        this.emitCd.set(c, 0.13);
      } else this.emitCd.set(c, cd);
    }
    // nuages soulevés
    this.pool.update(dt, wx, wz);
    const pa2 = this.puffs.geometry.attributes, ps = pa2.aSize.array, pal = pa2.aAlpha.array, pp = pa2.position.array;
    for (let i = 0; i < this.pool.n; i++) {
      const lk = this.pool.look(i);
      ps[i] = lk.size; pal[i] = lk.alpha;
      pp[i * 3] = this.pool.pos[i * 3]; pp[i * 3 + 1] = this.pool.pos[i * 3 + 1]; pp[i * 3 + 2] = this.pool.pos[i * 3 + 2];
    }
    pa2.position.needsUpdate = pa2.aSize.needsUpdate = pa2.aAlpha.needsUpdate = true;
  }
}
