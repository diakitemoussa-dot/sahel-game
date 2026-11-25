// Champ de bataille : colonnes de fumée noire (véhicules en feu, foyers), missiles qui tombent et explosent, avec flammes, lueur et son.
// Les fumées sont des particules « panneaux » (toujours face à la caméra) dessinées en un seul appel par couche (InstancedBufferGeometry) :
//  - couche fumée (mélange normal) : nuage en chou-fleur, noir au pied avec une lueur orange, de plus en plus clair en montant ;
//  - couche feu (mélange additif) : flammes, boule de feu, tête et flamme des missiles.
// Les règles (taille, opacité, quand et où tombent les missiles) sont dans smokelogic.js (testées sans navigateur).
import * as THREE from 'three';
import { wind } from './dust.js';
import { columnLook, fireLook, siteRate, fadeIntensity, StrikeScheduler, pickStrike, missilePath, rampIntensity } from './smokelogic.js';
import { fireZones } from './firelogic.js';

const lerp = (a, b, t) => a + (b - a) * t;

/** Texture d'un nuage « chou-fleur » : le rouge donne l'ombrage (face au soleil plus claire), l'alpha la forme. */
function cloudTexture(size = 128, seed = 7) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 0.3 * size, x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d;
    const r = (0.1 + 0.13 * rnd()) * size;
    const lit = Math.max(0, Math.min(1, 0.5 + 0.5 * (-(x - size / 2) * 0.7 - (y - size / 2) * 0.9) / (0.3 * size)));
    const v = Math.round(105 + 135 * lit);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${v},${v},${v},1)`); gr.addColorStop(0.7, `rgba(${v},${v},${v},0.92)`); gr.addColorStop(1, `rgba(${Math.round(v * 0.7)},${Math.round(v * 0.7)},${Math.round(v * 0.7)},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = 'destination-in';                       // bord doux : aucun carré visible
  const mask = g.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size * 0.5);
  mask.addColorStop(0, 'rgba(0,0,0,1)'); mask.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = mask; g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

const VERT = /* glsl */`
attribute vec3 aPos; attribute vec4 aParams; attribute vec2 aLook;
varying vec2 vUv; varying float vAlpha; varying float vHeat; varying float vLight; varying float vTone; varying float vDepth;
void main() {
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  float c = cos(aParams.z), s = sin(aParams.z);
  vec2 q = position.xy * aParams.x;
  mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  gl_Position = projectionMatrix * mv;
  vUv = uv; vDepth = -mv.z;
  vAlpha = aParams.y * smoothstep(2.0, 18.0, -mv.z);                  // les nuages collés à la caméra s'effacent
  vHeat = aParams.w; vLight = aLook.x; vTone = aLook.y;
}`;
const FRAG_SMOKE = /* glsl */`
uniform sampler2D uMap; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
varying vec2 vUv; varying float vAlpha; varying float vHeat; varying float vLight; varying float vTone; varying float vDepth;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vAlpha;
  if (a < 0.004) discard;
  float shade = clamp(t.r / 0.9, 0.0, 1.2);
  vec3 smoke = mix(vec3(0.035, 0.032, 0.032), vec3(0.46, 0.44, 0.41), vLight);        // noir de fumée, de plus en plus gris clair
  vec3 base = mix(smoke, vec3(0.74, 0.62, 0.44), vTone);                              // poussière de sable (explosions)
  vec3 col = base * (0.42 + 0.95 * shade);
  col += vHeat * vec3(1.0, 0.40, 0.07) * (0.3 + 0.9 * shade);                         // lueur du feu au pied de la colonne
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vDepth));
  gl_FragColor = vec4(col, a);
}`;
const FRAG_FIRE = /* glsl */`
uniform sampler2D uMap; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
varying vec2 vUv; varying float vAlpha; varying float vHeat; varying float vLight; varying float vTone; varying float vDepth;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vAlpha;
  if (a < 0.004) discard;
  vec3 col = mix(vec3(0.85, 0.10, 0.02), vec3(1.0, 0.82, 0.38), vHeat) * (0.55 + 0.9 * t.r);
  col *= 1.0 - 0.8 * smoothstep(uFogNear, uFogFar, vDepth);
  gl_FragColor = vec4(col, a);
}`;

/** Une couche de particules : tableaux fixes (aucune allocation pendant le jeu), une instance dessinée par particule. */
class Layer {
  constructor(n, frag, additive, map, fog) {
    this.n = n; this.next = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.a0 = new Float32Array(n);
    this.rot = new Float32Array(n); this.spin = new Float32Array(n); this.drag = new Float32Array(n); this.hot = new Float32Array(n); this.tone = new Float32Array(n);
    this.additive = additive;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aParams = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); this.aParams.setUsage(THREE.DynamicDrawUsage);
    this.aLook = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2); this.aLook.setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    geo.setIndex([0, 1, 2, 2, 1, 3]);
    geo.setAttribute('aPos', this.aPos); geo.setAttribute('aParams', this.aParams); geo.setAttribute('aLook', this.aLook);
    geo.instanceCount = n;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: frag, transparent: true, depthWrite: false, depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uMap: { value: map }, uFogColor: { value: new THREE.Color(fog.color) }, uFogNear: { value: fog.near }, uFogFar: { value: fog.far } },
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 3 : 2;
  }
  get alive() { let c = 0; for (let i = 0; i < this.n; i++) if (this.life[i] > 0) c++; return c; }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, a0, o = {}) {
    const i = this.next; this.next = (this.next + 1) % this.n;                 // réserve pleine : on remplace la plus ancienne
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
    this.rot[i] = o.rot ?? Math.random() * 6.283; this.spin[i] = o.spin ?? (Math.random() - 0.5) * 0.5;
    this.drag[i] = o.drag ?? 0.02; this.hot[i] = o.hot ?? 1; this.tone[i] = o.tone ?? 0;
    return i;
  }
  /** wx, wz : vent (m/s) vers lequel la fumée dérive. */
  update(dt, wx, wz) {
    const P = this.aParams.array, A = this.aPos.array, L = this.aLook.array;
    for (let i = 0; i < this.n; i++) {
      const j = i * 3;
      if (this.life[i] <= 0) { P[i * 4] = 0; P[i * 4 + 1] = 0; continue; }
      this.life[i] -= dt;
      const dk = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[j] = this.vel[j] * dk + (wx * 1.3 - this.vel[j] * dk) * Math.min(1, 0.3 * dt);
      this.vel[j + 1] *= dk;
      this.vel[j + 2] = this.vel[j + 2] * dk + (wz * 1.3 - this.vel[j + 2] * dk) * Math.min(1, 0.3 * dt);
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      this.rot[i] += this.spin[i] * dt;
      const age = 1 - Math.max(0, this.life[i]) / this.max[i];
      A[j] = this.pos[j]; A[j + 1] = this.pos[j + 1]; A[j + 2] = this.pos[j + 2];
      if (this.additive) {
        const f = fireLook(age, this.s0[i], this.a0[i]);
        P[i * 4] = f.size; P[i * 4 + 1] = f.alpha; P[i * 4 + 3] = f.heat; L[i * 2] = 0; L[i * 2 + 1] = 0;
      } else {
        const f = columnLook(age, this.s0[i], this.s1[i], this.a0[i]);
        P[i * 4] = f.size; P[i * 4 + 1] = f.alpha; P[i * 4 + 3] = f.heat * this.hot[i]; L[i * 2] = f.light; L[i * 2 + 1] = this.tone[i];
      }
      P[i * 4 + 2] = this.rot[i];
    }
    this.aPos.needsUpdate = this.aParams.needsUpdate = this.aLook.needsUpdate = true;
  }
}

// profils des foyers : rate = particules de fumée par seconde ; vy = vitesse de montée (m/s) ; life = durée de vie (s) ; s0 / s1 = taille au pied / au sommet (m)
const PROFILES = {
  column: { rate: 12, vy: [7.5, 10], life: [13, 16], s0: [3.2, 5], s1: [20, 30], a0: 0.88, radius: 3, lift: 0.6, fireRate: 7, fireSize: 3.2 },
  car:    { rate: 8, vy: [5.5, 8], life: [11, 14], s0: [1.8, 2.6], s1: [11, 17], a0: 0.85, radius: 1.3, lift: 1.1, fireRate: 20, fireSize: 1.9 },
};

export class SmokeSystem {
  constructor(scene, world, camera, { enabled = true, strikes = true, seed = 3 } = {}) {
    this.scene = scene; this.world = world; this.camera = camera; this.enabled = enabled; this.autoStrikes = strikes;
    const fog = { color: scene.fog?.color ?? 0xcfd8e0, near: scene.fog?.near ?? 90, far: scene.fog?.far ?? 380 };
    const map = cloudTexture(128, seed + 4);
    this.smoke = new Layer(2800, FRAG_SMOKE, false, map, fog);
    this.fire = new Layer(700, FRAG_FIRE, true, map, fog);
    scene.add(this.smoke.mesh, this.fire.mesh);
    this.light = new THREE.PointLight(0xff7a30, 0, 40, 2); this.light.position.set(0, -50, 0); scene.add(this.light);   // lueur du feu sur le décor proche
    this.sites = []; this.missiles = []; this.time = 0; this.explosions = 0; this.shake = 0; this.flash = null;
    this.scheduler = new StrikeScheduler({ first: 16, min: 30, max: 60 });
    this.onExplosion = null; this.onMissile = null; this.onCrackle = null;
    this._quiet = false;
    this.detail = { rate: 1, burst: 1, size: 1, trail: 1 };      // niveau de détail (profil de performance) : moins de nuages, un peu plus gros
  }

  /** d : { rate, burst, size, trail } (voir perfprofile.js). */
  setDetail(d) { this.detail = { rate: 1, burst: 1, size: 1, trail: 1, ...d }; }

  /** Ajoute un foyer. def : { id, x, z (repère du jeu), kind: 'column' | 'car', scale, fire, tone, temp, life }. */
  addSite(def) {
    const p = PROFILES[def.kind ?? 'column'];
    const y = def.y ?? this.world.groundY(def.x, def.z);
    const site = { fire: true, scale: 1, intensity: 1, age: 0, acc: 0, facc: 0, crack: 0, ...def, p, y };
    this.sites.push(site);
    return site;
  }

  /** Un missile tombe sur `to` (repère du jeu : { x, z }). Il part de `origin` ({ x, y, z } : le dessous d'un avion de chasse) ; sans origine, de loin dans le ciel. */
  launchMissile(to, dur = 3.4, origin = null) {
    const y = this.world.groundY(to.x, to.z);
    const dest = { x: to.x, y, z: to.z };
    let from;
    if (origin) {
      from = { x: origin.x, y: origin.y, z: origin.z };
      dur = Math.max(2.2, Math.min(5, Math.hypot(dest.x - from.x, dest.z - from.z) / 190));      // ~190 m/s : le temps de le voir descendre
    } else {
      const ang = Math.random() * Math.PI * 2, far = 240;
      from = { x: to.x + Math.cos(ang) * far, y: y + 140, z: to.z + Math.sin(ang) * far };
    }
    const m = { from, to: dest, t: 0, dur, trail: 0 };
    this.missiles.push(m);
    const mid = missilePath(from, dest, 0.45);
    if (!this._quiet) this.onMissile?.(mid);
    return m;
  }

  /** Frappe immédiate (test) ou au hasard près d'un foyer, visible du joueur. origin : d'où part le missile (un avion). Renvoie le point visé, ou null. */
  strike(player = null, heading = 0, origin = null) {
    const sites = this.sites.filter((s) => !s.temp);
    const target = player ? (pickStrike(sites, player, heading) ?? pickStrike(sites, player, heading, Math.random, { minD: 40, maxD: 520 })) : (sites[0] ? { x: sites[0].x + 6, z: sites[0].z + 4 } : null);
    if (target) this.launchMissile(target, 3.4, origin);
    return target;
  }

  /** Allume un foyer éteint (une frappe l'a touché) : il s'embrase en ~8 s. Renvoie vrai s'il était éteint. */
  ignite(site) {
    if (site.temp || (site.target ?? site.intensity) >= 1) return false;
    site.target = 1; this.ignitions = (this.ignitions ?? 0) + 1;
    return true;
  }

  /** Zones qui brûlent en ce moment : [{ x, z, y, r }] (voir firelogic.js). */
  burnZones() { return this.enabled ? fireZones(this.sites) : []; }

  /** Une flamme (et parfois un peu de fumée) sur le corps d'un personnage qui brûle, en (x, y, z) = ses pieds. */
  flameBody(x, y, z) {
    if (!this.enabled) return;
    const R = Math.random;
    this.fire.spawn(x + (R() - 0.5) * 0.5, y + 0.2 + R() * 1.5, z + (R() - 0.5) * 0.5, (R() - 0.5) * 0.6, 1.4 + R() * 1.6, (R() - 0.5) * 0.6, 0.35 + R() * 0.3, 0.9 + R() * 0.6, 0, 0.9, { drag: 0.4 });
    if (R() < 0.5 * this.detail.rate + 0.15) this.smoke.spawn(x + (R() - 0.5) * 0.4, y + 1.7, z + (R() - 0.5) * 0.4, (R() - 0.5) * 0.8, 1.8 + R(), (R() - 0.5) * 0.8, 2.5 + R() * 1.5, 0.6, 3.2, 0.55, { drag: 0.3, hot: 0.4 });
  }

  explode(pos, scale = 1) {
    const s = scale, F = this.fire, S = this.smoke, R = Math.random;
    this.explosions++;
    const B = this.detail.burst, Z = this.detail.size;
    for (let i = 0; i < Math.round(16 * Math.max(0.6, B)); i++) {         // boule de feu
      const a = R() * 6.283, up = 0.4 + R() * 0.8, sp = (3 + R() * 6) * s;
      F.spawn(pos.x + (R() - 0.5) * 2 * s, pos.y + 1 + R() * 2 * s, pos.z + (R() - 0.5) * 2 * s, Math.cos(a) * sp * 0.6, up * sp, Math.sin(a) * sp * 0.6,
        0.55 + R() * 0.7, (5 + R() * 4) * s, 0, 0.95, { drag: 1.4 });
    }
    for (let i = 0; i < Math.round(38 * B); i++) {                         // fumée noire projetée
      const a = R() * 6.283, sp = (2 + R() * 6) * s, up = (3 + R() * 9) * s;
      S.spawn(pos.x, pos.y + 1.5, pos.z, Math.cos(a) * sp, up, Math.sin(a) * sp, 7 + R() * 5, (3 + R() * 2) * s * Z, (13 + R() * 8) * s * Z, 0.9, { drag: 0.5, hot: 1.4 });
    }
    for (let i = 0; i < Math.round(22 * B); i++) {                         // anneau de poussière soulevée
      const a = R() * 6.283, sp = (8 + R() * 8) * s;
      S.spawn(pos.x, pos.y + 0.6, pos.z, Math.cos(a) * sp, 0.5 + R() * 2, Math.sin(a) * sp, 3 + R() * 2, 2.5 * s, (10 + R() * 5) * s, 0.55, { drag: 1.3, tone: 0.9, hot: 0 });
    }
    this.flash = { t: 0, pos: { x: pos.x, y: pos.y + 3, z: pos.z }, power: 560 * s };               // éclair un peu moins violent
    const d = Math.hypot(pos.x - this.camera.position.x, pos.z - this.camera.position.z);
    this.shake = Math.max(this.shake, Math.max(0, 1 - d / 150) * Math.min(1.2, s) * 0.7);         // secousse un peu plus douce
    if (!this._quiet) this.onExplosion?.(pos, s);
    for (const s of this.sites) if (!s.temp && Math.hypot(s.x - pos.x, s.z - pos.z) < 30) this.ignite(s);       // la frappe rallume les foyers voisins : la situation empire
    this.addSite({ id: `impact_${this.explosions}`, x: pos.x, z: pos.z, y: pos.y, kind: 'column', temp: true, life: 70 + R() * 30, scale: 0.9 + R() * 0.3, fireSize: 2.4 });
  }

  /** Dessine d'avance `seconds` secondes de fumée : au lancement les colonnes sont déjà hautes. */
  prewarm(seconds = 16, step = 0.1) {
    if (!this.enabled) return;
    this._quiet = true;
    for (let t = 0; t < seconds; t += step) this._step(step, false);
    this._quiet = false;
  }

  get alive() { return this.smoke.alive + this.fire.alive; }

  /** player : { x, z } ; heading : où regarde le joueur ; allowStrikes : vrai en jeu et derrière le menu (pas pendant l'intro). */
  update(dt, player, heading = 0, allowStrikes = true) {
    if (!this.enabled) return;
    this._step(dt, allowStrikes && this.autoStrikes, player, heading);
  }

  _step(dt, strikes, player = null, heading = 0) {
    this.time += dt;
    const cam = this.camera.position, R = Math.random;
    const [wx, wz] = wind(this.time);
    // foyers : émission de fumée et de flammes
    for (let k = this.sites.length - 1; k >= 0; k--) {
      const s = this.sites[k], p = s.p;
      s.age += dt;
      if (!s.temp && s.target !== undefined) s.intensity = rampIntensity(s.intensity, s.target, dt, 0.12);
      const inten = s.temp ? fadeIntensity(s.age, s.life) : s.intensity;
      if (s.temp && s.age >= s.life) { this.sites.splice(k, 1); continue; }
      const dist = Math.hypot(s.x - cam.x, s.z - cam.z);
      s.acc += siteRate(p.rate, inten, dist) * this.detail.rate * dt;
      while (s.acc >= 1) {
        s.acc -= 1;
        const a = R() * 6.283, r = Math.sqrt(R()) * p.radius * s.scale;
        this.smoke.spawn(s.x + Math.cos(a) * r, s.y + p.lift, s.z + Math.sin(a) * r, (R() - 0.5) * 1.2, lerp(p.vy[0], p.vy[1], R()) * Math.sqrt(s.scale), (R() - 0.5) * 1.2,
          lerp(p.life[0], p.life[1], R()), lerp(p.s0[0], p.s0[1], R()) * Math.sqrt(s.scale) * this.detail.size, lerp(p.s1[0], p.s1[1], R()) * s.scale * this.detail.size, p.a0 * (0.85 + R() * 0.15),
          { tone: s.tone ?? 0, drag: 0.02 });
      }
      if (s.fire && dist < 320) {
        s.facc += p.fireRate * inten * Math.max(0.5, this.detail.rate) * dt;
        while (s.facc >= 1) {
          s.facc -= 1;
          const a = R() * 6.283, r = Math.sqrt(R()) * p.radius * 0.55 * s.scale;
          this.fire.spawn(s.x + Math.cos(a) * r, s.y + p.lift * 0.6, s.z + Math.sin(a) * r, (R() - 0.5) * 0.8, 2.2 + R() * 2.4, (R() - 0.5) * 0.8,
            0.45 + R() * 0.5, (s.fireSize ?? p.fireSize) * (0.7 + R() * 0.6), 0, 0.9, { drag: 0.3 });
        }
        if (!this._quiet && inten > 0.3 && dist < 45) {                  // crépitement du feu, de près
          s.crack -= dt;
          if (s.crack <= 0) { s.crack = 0.25 + R() * 0.7; this.onCrackle?.({ x: s.x + (R() - 0.5) * 2, y: s.y + 1, z: s.z + (R() - 0.5) * 2 }); }
        }
      }
    }
    // missiles en vol
    for (let k = this.missiles.length - 1; k >= 0; k--) {
      const m = this.missiles[k];
      m.t += dt;
      const pos = missilePath(m.from, m.to, m.t / m.dur);
      const prev = m.prev ?? pos;
      m.trail += dt;
      for (let n = 0; m.trail >= 0.016; n++) {                           // traînée de fumée blanche : posée tout le long du chemin parcouru depuis la dernière image
        m.trail -= 0.016;
        const u = Math.min(1, (n + 1) * 0.016 / Math.max(dt, 0.016));
        this.smoke.spawn(lerp(prev.x, pos.x, u), lerp(prev.y, pos.y, u), lerp(prev.z, pos.z, u), (R() - 0.5) * 0.6, (R() - 0.5) * 0.6, (R() - 0.5) * 0.6, 4.5 + R() * 1.5, 0.9, 5.5, 0.5, { drag: 0.6, tone: 0.55, hot: 0 });
      }
      m.prev = pos;
      this.fire.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.12, 2.4, 0, 0.95, { drag: 0 });
      if (m.t >= m.dur) { this.missiles.splice(k, 1); this.explode(m.to, 1.1 + R() * 0.35); }
    }
    // frappes au hasard
    if (strikes && player && this.scheduler.update(dt)) this.strike(player, heading);
    // couches de particules
    this.smoke.update(dt, wx, wz); this.fire.update(dt, wx * 0.3, wz * 0.3);
    // lueur : l'éclair d'une explosion, sinon le foyer en feu le plus proche
    let lightI = 0, lx = 0, ly = -50, lz = 0, dist = 40;
    if (this.flash) {
      this.flash.t += dt;
      const f = Math.max(0, 1 - this.flash.t / 0.55);
      if (f <= 0) this.flash = null;
      else { lightI = this.flash.power * f * f; lx = this.flash.pos.x; ly = this.flash.pos.y; lz = this.flash.pos.z; dist = 160; }
    }
    if (lightI < 5) {
      let best = null, bd = 60;
      for (const s of this.sites) {
        if (!s.fire || (!s.temp && s.intensity < 0.1)) continue;
        const d = Math.hypot(s.x - cam.x, s.z - cam.z);
        if (d < bd) { bd = d; best = s; }
      }
      if (best) {
        const inten = best.temp ? fadeIntensity(best.age, best.life) : best.intensity;
        lightI = Math.max(lightI, 70 * inten * (0.7 + 0.3 * Math.sin(this.time * 17) * Math.sin(this.time * 7.3 + 1)));
        lx = best.x; ly = best.y + 2; lz = best.z; dist = 38;
      }
    }
    this.light.intensity = lightI; this.light.distance = dist; this.light.position.set(lx, ly, lz);
    this.shake = Math.max(0, this.shake - dt * 1.6);
  }
}
