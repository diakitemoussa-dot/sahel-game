// Ciel du désert : dôme dessiné par un shader (dégradé bleu -> brume chaude à l'horizon, soleil avec halo et lueur, nuages qui dérivent).
// La direction du soleil est la même que celle de la lumière du jeu (main.js) : le soleil qu'on voit correspond aux ombres.
import * as THREE from 'three';

/** Direction vers le soleil. azimut : 0 = devant le joueur au départ (+z), positif vers la gauche (+x) ; élévation au-dessus de l'horizon, en degrés. */
export function sunDirection(azimuthDeg, elevationDeg) {
  const a = azimuthDeg * Math.PI / 180, e = elevationDeg * Math.PI / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
}

// Même direction que la lumière d'origine du jeu (-60, 90, -40) : derrière le joueur au départ, à droite, haut dans le ciel.
// Le joueur la voit en se retournant ; la lumière qui éclaire le personnage vient bien du soleil du ciel.
export const SUN = (() => { const v = [-60, 90, -40], n = Math.hypot(...v); return v.map((c) => c / n); })();
export const HORIZON = 0xd9cdb4;        // brume chaude à l'horizon : aussi la couleur du brouillard, le sable lointain s'y fond
export const ZENITH = 0x2a6cc4;
export const LOW_SKY = 0x9cc6ea;       // bleu pâle juste au-dessus de la brume de l'horizon

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;               // toujours au fond
}`;

const FRAG = /* glsl */`
varying vec3 vDir;
uniform vec3 uSun, uHorizon, uZenith, uLow;
uniform float uTime, uCover;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 sky = mix(mix(uHorizon, uLow, smoothstep(0.0, 0.28, h)), uZenith, pow(h, 0.65));
  float sd = max(dot(d, uSun), 0.0);
  // soleil : disque éblouissant, halo, grande lueur chaude
  sky += vec3(1.0, 0.93, 0.78) * (pow(sd, 1800.0) * 14.0 + pow(sd, 90.0) * 0.55 + pow(sd, 7.0) * 0.18);
  // nuages : plan de nuages projeté sur le ciel (perspective), qui dérive avec le vent
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.18) * 0.85 + vec2(uTime * 0.012, uTime * 0.005);
    float c = fbm(uv * 1.1);
    float cov = smoothstep(uCover, uCover + 0.2, c);               // où il y a un nuage
    float body = smoothstep(uCover + 0.05, uCover + 0.5, c);        // épaisseur
    float c2 = fbm(uv * 1.1 + uSun.xz * 0.10);                      // même nuage décalé vers le soleil : donne le relief éclairé
    float lit = clamp(0.62 + (c - c2) * 5.0, 0.25, 1.15);
    vec3 shade = vec3(0.56, 0.58, 0.64), bright = vec3(1.0, 0.97, 0.90);
    vec3 cloud = mix(shade, bright, lit) * (1.0 - 0.28 * body * (1.0 - lit));
    cloud += vec3(1.0, 0.85, 0.6) * pow(sd, 6.0) * 0.5 * cov;       // bord doré près du soleil
    float fade = smoothstep(0.0, 0.22, d.y);                        // les nuages se perdent dans la brume de l'horizon
    sky = mix(sky, cloud, cov * fade * 0.94);
  }
  // brume de l'horizon, épaisse comme dans un vrai désert
  sky = mix(sky, uHorizon, exp(-h * 7.0) * 0.75);
  if (d.y < 0.0) sky = uHorizon;
  gl_FragColor = vec4(sky, 1.0);
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor({ cover = 0.46 } = {}) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
      uniforms: {
        uSun: { value: new THREE.Vector3(...SUN) }, uTime: { value: 0 }, uCover: { value: cover },
        uHorizon: { value: new THREE.Color(HORIZON) }, uZenith: { value: new THREE.Color(ZENITH) }, uLow: { value: new THREE.Color(LOW_SKY) },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.material);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
  }
  /** Le dôme suit la caméra (le ciel est toujours à l'infini) ; t : temps en secondes (dérive des nuages). */
  update(camera, t) {
    this.mesh.position.copy(camera.position);
    this.mesh.scale.setScalar((camera.far ?? 900) * 0.9);
    this.material.uniforms.uTime.value = t;
  }
}
