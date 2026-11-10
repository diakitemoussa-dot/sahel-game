// Collisions sur maillage (mesh collider) : tous les objets solides de la carte sont des triangles (enveloppes convexes exportées de Blender,
// voir tools/blender/colmesh.py). Logique pure, testée sans navigateur. Repère du jeu (three.js) : y = hauteur.
//  - surfaceY : hauteur du dessus d'un objet sous un point (on peut se tenir debout dessus) ;
//  - pushOut  : repousse un personnage (cylindre) hors des parois, sur toute sa hauteur ;
//  - blocked  : un segment (ligne de vue, tir) traverse-t-il un objet ;
//  - findLedge: rebord à portée de main devant un personnage en l'air (double saut : il grimpe dessus).

const CELL = 2.0;                       // taille des cases de la grille (m)
const FLOOR_NY = 0.7;                   // surface praticable si sa normale pointe assez vers le haut (pente < 45°)

/** Lit un fichier 'SCOL' (voir colmesh.py). Renvoie { positions: Float32Array, indices: Uint32Array, obj: Uint16Array }. */
export function decodeSCOL(buffer) {
  const dv = new DataView(buffer);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'SCOL') throw new Error('fichier de collision invalide');
  const N = dv.getUint32(8, true), T = dv.getUint32(12, true);
  const mn = [0, 1, 2].map((i) => dv.getFloat32(16 + 4 * i, true)), sc = [0, 1, 2].map((i) => dv.getFloat32(28 + 4 * i, true));
  let off = 40;
  const positions = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) { positions[i * 3 + k] = mn[k] + dv.getUint16(off, true) * sc[k]; off += 2; }
  const indices = new Uint32Array(T * 3);
  for (let i = 0; i < T * 3; i++) { indices[i] = dv.getUint32(off, true); off += 4; }
  const obj = new Uint16Array(T);
  for (let i = 0; i < T; i++) { obj[i] = dv.getUint16(off, true); off += 2; }
  return { positions, indices, obj };
}

/** Point du triangle (a, b, c) le plus proche de p (Ericson, Real-Time Collision Detection). Écrit dans out [x, y, z]. */
export function closestPointOnTriangle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz, out) {
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out[0] = ax; out[1] = ay; out[2] = az; return out; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { out[0] = bx; out[1] = by; out[2] = bz; return out; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); out[0] = ax + v * abx; out[1] = ay + v * aby; out[2] = az + v * abz; return out; }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { out[0] = cx; out[1] = cy; out[2] = cz; return out; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); out[0] = ax + w * acx; out[1] = ay + w * acy; out[2] = az + w * acz; return out; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    out[0] = bx + w * (cx - bx); out[1] = by + w * (cy - by); out[2] = bz + w * (cz - bz); return out;
  }
  const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom;
  out[0] = ax + abx * v + acx * w; out[1] = ay + aby * v + acy * w; out[2] = az + abz * v + acz * w;
  return out;
}

export class MeshWorld {
  constructor() {
    this.tv = [];                      // sommets des triangles, à plat : ax ay az bx by bz cx cy cz
    this.objIds = [];
    this.nObj = 0;
    this.dirty = false;
    this.T = 0;
    this._out = [0, 0, 0];
    this._stamp = 0;
  }

  /** Ajoute une géométrie ({ positions, indices, obj? }), éventuellement transformée (matrice 4x4 colonnes, Float32Array/array de 16). */
  add(geo, matrix = null) {
    const { positions, indices, obj } = geo;
    const P = (i) => {
      const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
      if (!matrix) return [x, y, z];
      const m = matrix;
      return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
    };
    const base = this.nObj;
    let maxObj = -1;
    for (let t = 0; t < indices.length / 3; t++) {
      const a = P(indices[t * 3]), b = P(indices[t * 3 + 1]), c = P(indices[t * 3 + 2]);
      this.tv.push(...a, ...b, ...c);
      const o = obj ? obj[t] : 0;
      this.objIds.push(base + o); maxObj = Math.max(maxObj, o);
    }
    this.nObj = base + maxObj + 1;
    this.dirty = true;
    return this;
  }

  _build() {
    const T = this.tv.length / 9;
    this.T = T;
    const tv = this.v = Float32Array.from(this.tv);
    this.nx = new Float32Array(T); this.ny = new Float32Array(T); this.nz = new Float32Array(T);
    this.ymin = new Float32Array(T); this.ymax = new Float32Array(T);
    this.obj = Uint16Array.from(this.objIds);
    this.grid = new Map();
    for (let t = 0; t < T; t++) {
      const o = t * 9;
      const ux = tv[o + 3] - tv[o], uy = tv[o + 4] - tv[o + 1], uz = tv[o + 5] - tv[o + 2];
      const wx = tv[o + 6] - tv[o], wy = tv[o + 7] - tv[o + 1], wz = tv[o + 8] - tv[o + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz) || 1;
      this.nx[t] = nx / l; this.ny[t] = ny / l; this.nz[t] = nz / l;
      this.ymin[t] = Math.min(tv[o + 1], tv[o + 4], tv[o + 7]); this.ymax[t] = Math.max(tv[o + 1], tv[o + 4], tv[o + 7]);
      const x0 = Math.min(tv[o], tv[o + 3], tv[o + 6]), x1 = Math.max(tv[o], tv[o + 3], tv[o + 6]);
      const z0 = Math.min(tv[o + 2], tv[o + 5], tv[o + 8]), z1 = Math.max(tv[o + 2], tv[o + 5], tv[o + 8]);
      for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
        const k = ix * 100003 + iz;
        let a = this.grid.get(k); if (!a) { a = []; this.grid.set(k, a); }
        a.push(t);
      }
    }
    this.mark = new Uint32Array(T);
    this.dirty = false;
  }

  _ensure() { if (this.dirty || !this.v) this._build(); }

  get triangles() { this._ensure(); return this.T; }

  /** Hauteur du dessus d'un objet sous (x, z), au plus maxY (surface praticable : pente < 45°) ; null s'il n'y en a pas. */
  surfaceY(x, z, maxY = Infinity) {
    this._ensure();
    const cell = this.grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
    if (!cell) return null;
    const v = this.v; let best = null;
    for (const t of cell) {
      const ny = this.ny[t];
      if (ny < FLOOR_NY) continue;
      const o = t * 9;
      const ax = v[o], az = v[o + 2], bx = v[o + 3], bz = v[o + 5], cx = v[o + 6], cz = v[o + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
      const e = -1e-6;
      if (l1 < e || l2 < e || l3 < e) continue;
      const y = l1 * v[o + 1] + l2 * v[o + 4] + l3 * v[o + 7];
      if (y <= maxY && (best === null || y > best)) best = y;
    }
    return best;
  }

  /** Repousse un personnage (cylindre de rayon r et de hauteur h, pieds en pos.y) hors des parois. Les parois dont le haut est sous
   *  les pieds + step sont ignorées (marche, rebord : il monte dessus), celles au-dessus de la tête aussi. Renvoie vrai s'il a bougé. */
  pushOut(pos, r = 0.4, h = 1.75, step = 0.45) {
    this._ensure();
    const v = this.v, out = this._out;
    const feet = pos.y;
    const hs = [step + 0.05, 1.0, h - 0.2];
    let moved = false;
    for (let pass = 0; pass < 3; pass++) {
      let any = false;
      const i0 = Math.floor((pos.x - r) / CELL), i1 = Math.floor((pos.x + r) / CELL), j0 = Math.floor((pos.z - r) / CELL), j1 = Math.floor((pos.z + r) / CELL);
      this._stamp++;
      for (let ix = i0; ix <= i1; ix++) for (let iz = j0; iz <= j1; iz++) {
        const cell = this.grid.get(ix * 100003 + iz);
        if (!cell) continue;
        for (const t of cell) {
          if (this.mark[t] === this._stamp) continue;
          this.mark[t] = this._stamp;
          const ny = this.ny[t];
          if (ny >= FLOOR_NY || ny <= -FLOOR_NY) continue;                      // dessus (on marche dessus) et dessous (plafond) : pas des parois
          if (this.ymax[t] <= feet + step || this.ymin[t] >= feet + h) continue;
          const o = t * 9;
          for (const dh of hs) {
            const py = feet + dh;
            if (py < this.ymin[t] - r || py > this.ymax[t] + r) continue;
            closestPointOnTriangle(pos.x, py, pos.z, v[o], v[o + 1], v[o + 2], v[o + 3], v[o + 4], v[o + 5], v[o + 6], v[o + 7], v[o + 8], out);
            const dx = pos.x - out[0], dy = py - out[1], dz = pos.z - out[2];
            if (dx * dx + dy * dy + dz * dz >= r * r) continue;
            const dxz = Math.hypot(dx, dz), need = Math.sqrt(Math.max(0, r * r - dy * dy));
            const push = need - dxz;
            if (push <= 1e-5) continue;
            if (dxz > 1e-5) { pos.x += dx / dxz * push; pos.z += dz / dxz * push; }
            else { const nl = Math.hypot(this.nx[t], this.nz[t]) || 1; pos.x += this.nx[t] / nl * push; pos.z += this.nz[t] / nl * push; }
            any = true; moved = true;
          }
        }
      }
      if (!any) break;
    }
    return moved;
  }

  /** Le segment a -> b ({x, y, z}) traverse-t-il un objet ? (ligne de vue, tir) */
  blocked(a, b) {
    this._ensure();
    const v = this.v;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return false;
    this._stamp++;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (CELL * 0.5)));
    for (let s = 0; s <= n; s++) {
      const x = a.x + dx * s / n, z = a.z + dz * s / n;
      for (const [ox, oz] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {      // la case et ses voisines proches : un triangle peut dépasser de sa case
        const cell = this.grid.get(Math.floor((x + ox) / CELL) * 100003 + Math.floor((z + oz) / CELL));
        if (!cell) continue;
        for (const t of cell) {
          if (this.mark[t] === this._stamp) continue;
          this.mark[t] = this._stamp;
          const o = t * 9;
          // Möller-Trumbore, segment (t entre 0 et 1), les deux faces
          const e1x = v[o + 3] - v[o], e1y = v[o + 4] - v[o + 1], e1z = v[o + 5] - v[o + 2], e2x = v[o + 6] - v[o], e2y = v[o + 7] - v[o + 1], e2z = v[o + 8] - v[o + 2];
          const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          if (Math.abs(det) < 1e-12) continue;
          const inv = 1 / det, tx = a.x - v[o], ty = a.y - v[o + 1], tz = a.z - v[o + 2];
          const u = (tx * px + ty * py + tz * pz) * inv;
          if (u < 0 || u > 1) continue;
          const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
          const w = (dx * qx + dy * qy + dz * qz) * inv;
          if (w < 0 || u + w > 1) continue;
          const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (tt > 1e-4 && tt < 1 - 1e-4) return true;
        }
      }
    }
    return false;
  }

  /** Premier objet touché par un rayon (origine o, direction unitaire d, portée max) : distance, ou null. */
  raycast(o, d, max = 120) {
    this._ensure();
    const v = this.v;
    let best = null;
    this._stamp++;
    const n = Math.max(1, Math.ceil(Math.min(max, 400) * Math.hypot(d.x, d.z) / (CELL * 0.5)));
    for (let s = 0; s <= n; s++) {
      const dist = max * s / n;
      const x = o.x + d.x * dist, z = o.z + d.z * dist;
      if (best !== null && dist > best + CELL) break;                                  // plus rien de plus proche à trouver plus loin
      for (const [ox, oz] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
        const cell = this.grid.get(Math.floor((x + ox) / CELL) * 100003 + Math.floor((z + oz) / CELL));
        if (!cell) continue;
        for (const t of cell) {
          if (this.mark[t] === this._stamp) continue;
          this.mark[t] = this._stamp;
          const q = t * 9;
          const e1x = v[q + 3] - v[q], e1y = v[q + 4] - v[q + 1], e1z = v[q + 5] - v[q + 2], e2x = v[q + 6] - v[q], e2y = v[q + 7] - v[q + 1], e2z = v[q + 8] - v[q + 2];
          const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          if (Math.abs(det) < 1e-12) continue;
          const inv = 1 / det, tx = o.x - v[q], ty = o.y - v[q + 1], tz = o.z - v[q + 2];
          const u = (tx * px + ty * py + tz * pz) * inv;
          if (u < 0 || u > 1) continue;
          const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
          const w = (d.x * qx + d.y * qy + d.z * qz) * inv;
          if (w < 0 || u + w > 1) continue;
          const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (tt > 1e-4 && tt <= max && (best === null || tt < best)) best = tt;
        }
      }
    }
    return best;
  }

  /** Numéro de l'objet qui contient le point (x, y, z), ou -1 (tir d'un rayon vers le haut : nombre impair de faces traversées). Sert aux tests. */
  insideObject(x, y, z) {
    this._ensure();
    const cell = this.grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
    if (!cell) return -1;
    const v = this.v, count = new Map();
    for (const t of cell) {
      if (Math.abs(this.ny[t]) < 1e-3) continue;
      const o = t * 9;
      const ax = v[o], az = v[o + 2], bx = v[o + 3], bz = v[o + 5], cx = v[o + 6], cz = v[o + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const yy = l1 * v[o + 1] + l2 * v[o + 4] + l3 * v[o + 7];
      if (yy > y) count.set(this.obj[t], (count.get(this.obj[t]) ?? 0) + 1);
    }
    for (const [o, c] of count) if (c % 2 === 1) return o;
    return -1;
  }

  /** Rebord à portée de main devant un personnage en l'air : dessus d'un objet situé devant lui, plus haut que ce qu'on enjambe (minRise) et
   *  à moins de reach au-dessus de ses pieds, avec la place d'y tenir debout. pos : pieds ; dir : direction horizontale unitaire { x, z }.
   *  Renvoie { x, y, z } (où il se retrouvera debout) ou null. */
  findLedge(pos, dir, { reach = 2.5, minRise = 0.5, maxDist = 1.1, headroom = 1.75 } = {}) {
    this._ensure();
    for (let dist = 0.45; dist <= maxDist + 1e-9; dist += 0.2) {
      const x = pos.x + dir.x * dist, z = pos.z + dir.z * dist;
      const top = this.surfaceY(x, z, pos.y + reach);
      if (top === null || top < pos.y + minRise) continue;
      // de la place au-dessus pour se tenir debout, et un point d'arrivée un peu plus loin sur le dessus
      const clear = (px, pz) => !this.blocked({ x: px, y: top + 0.08, z: pz }, { x: px, y: top + headroom, z: pz });
      if (!clear(x, z)) continue;
      const fx = x + dir.x * 0.4, fz = z + dir.z * 0.4;
      const ft = this.surfaceY(fx, fz, pos.y + reach);
      if (ft !== null && Math.abs(ft - top) < 0.15 && clear(fx, fz)) return { x: fx, y: ft, z: fz };
      return { x, y: top, z };
    }
    return null;
  }
}
