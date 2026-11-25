// Conduite d'un véhicule le long d'une piste (logique pure, testée sans navigateur) : le chemin, la vitesse, et la position/inclinaison sur le relief.
// Coordonnées de la piste : repère Blender (x, y). Cap : angle three.js autour de Y, 0 = vers +z, l'avant du véhicule est vers (sin cap, cos cap) dans le plan (x, z).
import { sampleCurve } from './road.js';

/** Chemin lissé et longueurs cumulées. points : [[x, y], ...] en repère Blender. */
export function buildPath(points, step = 1) {
  const pts = sampleCurve(points, step);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, length: cum[cum.length - 1], points };
}

/** Position et cap à la distance s du début du chemin. Renvoie { x, y (repère Blender), heading (three.js) }. */
export function pathAt(path, s) {
  const { pts, cum } = path;
  const d = Math.max(0, Math.min(path.length, s));
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
  const seg = cum[hi] - cum[lo] || 1, u = (d - cum[lo]) / seg;
  const x = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * u, y = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * u;
  const tx = pts[hi][0] - pts[lo][0], ty = pts[hi][1] - pts[lo][1];
  return { x, y, heading: Math.atan2(tx, -ty) };                // Blender (tx, ty) -> three (tx, -ty)
}

/** Distance du chemin la plus proche du point (x, y) Blender (pour poser le véhicule sur la piste). */
export function nearestS(path, x, y) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < path.pts.length; i++) {
    const d = Math.hypot(path.pts[i][0] - x, path.pts[i][1] - y);
    if (d < bd) { bd = d; best = path.cum[i]; }
  }
  return best;
}

/** Régulateur de vitesse : accélère jusqu'à `cruise`, ralentit pour s'arrêter pile à `stopAt` (ou dès qu'on lui demande de freiner). */
export class Cruise {
  constructor({ cruise = 8, accel = 2.2, brake = 4 } = {}) { Object.assign(this, { cruise, accel, brake }); this.v = 0; this.braking = false; }
  /** s : distance parcourue ; stopAt : distance où s'arrêter. Renvoie la nouvelle vitesse. */
  update(dt, s, stopAt) {
    const left = Math.max(0, stopAt - s);
    const stopSpeed = Math.sqrt(2 * this.brake * left);         // vitesse maximale pour pouvoir s'arrêter en `left` mètres
    const target = this.braking ? 0 : Math.min(this.cruise, stopSpeed);
    if (this.v < target) this.v = Math.min(target, this.v + this.accel * dt);
    else this.v = Math.max(target, this.v - this.brake * dt);
    return this.v;
  }
  get stopped() { return this.v < 0.05; }
}

/** Hauteur et inclinaison d'un véhicule posé sur le sol en (x, z) avec le cap donné : on lit le sol sous les quatre roues.
 *  groundY(x, z) : hauteur du sol (three.js). wheelbase, track : empattement et voie (m). Renvoie { y, pitch (nez en haut > 0), roll (côté droit en haut > 0) }. */
export function vehiclePose(groundY, x, z, heading, wheelbase = 6, track = 3.2) {
  const fx = Math.sin(heading), fz = Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);       // avant, droite du véhicule
  const at = (a, b) => groundY(x + fx * a + rx * b, z + fz * a + rz * b);
  const w = wheelbase / 2, t = track / 2;
  const fl = at(w, -t), fr = at(w, t), rl = at(-w, -t), rr = at(-w, t);
  const front = (fl + fr) / 2, rear = (rl + rr) / 2, right = (fr + rr) / 2, left = (fl + rl) / 2;
  return { y: (fl + fr + rl + rr) / 4, pitch: Math.atan2(front - rear, wheelbase), roll: Math.atan2(right - left, track) };
}

/** Un véhicule posé sur ses quatre roues (logique pure). surface(x, z) : hauteur RÉELLE du sol sous un point (three.js) ; (x, z) : où est l'origine du véhicule ; heading : son cap ;
 *  wheels : { front, rear (z des essieux dans le repère du véhicule, > 0 vers l'avant), half (demi-voie) }.
 *  Renvoie { y (hauteur de l'origine), pitch (nez en haut > 0), roll (côté droit en haut > 0) } : l'inclinaison suit le plan des quatre roues, et la hauteur est celle qui
 *  pose la roue la plus haute sur le sol, pour qu'AUCUNE roue ne s'enfonce ; drops : de combien chaque roue [avant gauche, avant droite, arrière gauche, arrière droite] est au-dessus du sol,
 *  c'est-à-dire de combien sa suspension doit la descendre pour la poser dessus. */
export function rideOnSurface(surface, x, z, heading, wheels = { front: 2.91, rear: -1.69, half: 1.72 }) {
  const fx = Math.sin(heading), fz = Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
  const pts = [[wheels.front, -wheels.half], [wheels.front, wheels.half], [wheels.rear, -wheels.half], [wheels.rear, wheels.half]];      // [avant/arrière, gauche/droite]
  const h = pts.map(([a, b]) => surface(x + fx * a + rx * b, z + fz * a + rz * b));
  const wheelbase = wheels.front - wheels.rear, track = wheels.half * 2;
  const lim = (v, m) => Math.max(-m, Math.min(m, v));                          // un véhicule ne se couche pas : au-delà, c'est la suspension qui rattrape
  const pitch = lim(Math.atan2((h[0] + h[1]) / 2 - (h[2] + h[3]) / 2, wheelbase), 0.32), roll = lim(Math.atan2((h[1] + h[3]) / 2 - (h[0] + h[2]) / 2, track), 0.26);
  const tz = Math.tan(pitch), tx = Math.tan(roll);
  let y = -Infinity;
  pts.forEach(([a, b], i) => { y = Math.max(y, h[i] - (tz * a + tx * b)); });
  const drops = pts.map(([a, b], i) => Math.max(0, y + tz * a + tx * b - h[i]));
  return { y, pitch, roll, drops };
}

/** Lisse un angle (radians) vers sa cible, en prenant le chemin le plus court. */
export function smoothAngle(cur, target, k) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * k;
}
