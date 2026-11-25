// Pistes du désert : config/road.json donne des points de passage (coordonnées Blender x, y) ; on trace une courbe lisse
// et on y pose un ruban de terre battue qui épouse le relief (hauteur lue dans la carte de hauteur du monde).
import * as THREE from 'three';
import { ASSET_VERSION } from './version.js';

/** Courbe de Catmull-Rom passant par les points ; renvoie des points [x, y] espacés d'environ `step` mètres. */
export function sampleCurve(pts, step = 1.5) {
  if (pts.length < 2) return pts.map((p) => [...p]);
  const at = (t) => {
    const i = Math.min(Math.floor(t), pts.length - 2), u = t - i;
    const a = pts[Math.max(i - 1, 0)], b = pts[i], c = pts[i + 1], d = pts[Math.min(i + 2, pts.length - 1)];
    return [0, 1].map((k) => 0.5 * (2 * b[k] + (-a[k] + c[k]) * u + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * u * u + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * u ** 3));
  };
  const out = [at(0)];
  const fine = (pts.length - 1) * 40;
  let acc = 0, prev = out[0];
  for (let s = 1; s <= fine; s++) {
    const p = at((s / fine) * (pts.length - 1));
    acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p;
    if (acc >= step || s === fine) { out.push(p); acc = 0; }
  }
  return out;
}

let tex = null;
function texture() {
  if (tex) return tex;
  const W = 128, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  // terre battue : fond brun-sable, deux ornières plus sombres, grain ; les bords s'effacent (la piste se fond dans le sable)
  g.fillStyle = '#8b7456'; g.fillRect(0, 0, W, H);
  for (const x of [38, 90]) { const gr = g.createLinearGradient(x - 14, 0, x + 14, 0); gr.addColorStop(0, 'rgba(60,45,30,0)'); gr.addColorStop(0.5, 'rgba(60,45,30,0.45)'); gr.addColorStop(1, 'rgba(60,45,30,0)'); g.fillStyle = gr; g.fillRect(x - 14, 0, 28, H); }
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,30,20' : '200,175,135'},${Math.random() * 0.18})`; g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 3); }
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = Math.min(x, W - 1 - x) / (W * 0.28);                   // 0 au bord, 1 à 28 % du bord
    d[(y * W + x) * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, e)) ** 1.5 * 0.92);
  }
  g.putImageData(img, 0, 0);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
  return tex;
}

/** Extrait du maillage du sable les seuls triangles proches de la piste (marge `margin` m) : les rayons qui mesurent la hauteur du sable vont beaucoup plus vite dessus. */
export function corridorMesh(groundMeshes, pts3, margin = 8) {
  const CELL = 8, near = new Set(), key = (i, j) => i * 100003 + j;
  const m = Math.ceil(margin / CELL);
  for (const [x, z] of pts3) { const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL); for (let i = -m; i <= m; i++) for (let j = -m; j <= m; j++) near.add(key(ci + i, cj + j)); }
  const out = [], v = new THREE.Vector3(), tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (const o of groundMeshes) {
    o.updateWorldMatrix(true, false);
    const pos = o.geometry.attributes.position, index = o.geometry.index, n = index ? index.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      let hit = false;
      for (let k = 0; k < 3; k++) {
        tri[k].fromBufferAttribute(pos, index ? index.getX(t + k) : t + k).applyMatrix4(o.matrixWorld);
        if (!hit && near.has(key(Math.floor(tri[k].x / CELL), Math.floor(tri[k].z / CELL)))) hit = true;
      }
      if (hit) for (let k = 0; k < 3; k++) out.push(tri[k].x, tri[k].y, tri[k].z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  return mesh;
}

const COLS = [-0.5, -0.25, 0, 0.25, 0.5];             // colonnes de sommets en travers de la piste (en fractions de la largeur) : le ruban épouse aussi les bosses latérales
const STEP = 0.75;                                      // espacement des rangées le long de la piste (m) : un ruban trop lâche passe sous les bosses et le sable le troue

/** Ruban posé sur le terrain le long de la courbe. groundY(x, z) : hauteur du sol en coordonnées three.js ; groundMeshes : dalles du sable (hauteur exacte). */
export function buildRoadMesh(points, width, groundY, lift = 0.1, groundMeshes = []) {
  const pts = sampleCurve(points, STEP);
  // hauteur réelle du sable : un rayon vers le bas sur les triangles proches de la piste (la carte de hauteur est plus grossière)
  const near = groundMeshes.length ? corridorMesh(groundMeshes, pts.map((p) => [p[0], -p[1]])) : null;
  const ray = near ? new THREE.Raycaster() : null;
  if (ray) ray.firstHitOnly = true;
  const down = new THREE.Vector3(0, -1, 0), from = new THREE.Vector3();
  const surface = (x, z) => {
    const g = groundY(x, z);
    if (!ray) return g;
    ray.set(from.set(x, g + 6, z), down);
    const hit = ray.intersectObject(near, false)[0];
    return hit && Math.abs(hit.point.y - g) < 6 ? hit.point.y : g;
  };
  const pos = [], uv = [], idx = [], samples = [], nc = COLS.length;
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const nx = -ty, ny = tx;                                          // perpendiculaire, dans le plan de la carte
    if (i > 0) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    COLS.forEach((k, c) => {
      const x = pts[i][0] + nx * k * width, y = pts[i][1] + ny * k * width;
      const h = surface(x, -y) + lift;
      pos.push(x, h, -y);                                              // Blender (x, y) -> three (x, hauteur, -y)
      uv.push(k + 0.5, dist / (width * 2));
      samples.push({ x, z: -y, d: h - groundY(x, -y) });               // écart entre la surface de la piste et le sol de la carte de hauteur (sert à faire marcher les personnages dessus)
    });
    if (i > 0) for (let c = 0; c < nc - 1; c++) { const q = i * nc + c, r = (i - 1) * nc + c; idx.push(r, r + 1, q, r + 1, q + 1, q); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  near?.geometry.dispose();
  const mat = new THREE.MeshStandardMaterial({ map: texture(), transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'piste';
  mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.renderOrder = 1;
  mesh.userData.samples = samples;
  return mesh;
}

/** Correction du sol pour que les personnages marchent SUR la piste (à la hauteur du ruban) et non dedans : sur la piste le sol prend la hauteur du ruban,
 *  puis il retrouve la carte de hauteur sur 2 m de part et d'autre. Renvoie (x, z) -> hauteur à ajouter. */
export function roadGroundPatch(samples, halfWidth, fade = 2) {
  const CELL = 4, grid = new Map(), reach = halfWidth + fade;
  const key = (i, j) => i * 100003 + j;
  for (const s of samples) {
    const i0 = Math.floor((s.x - reach) / CELL), i1 = Math.floor((s.x + reach) / CELL), j0 = Math.floor((s.z - reach) / CELL), j1 = Math.floor((s.z + reach) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); }
  }
  return (x, z) => {
    const cell = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!cell) return 0;
    let best = null, bd = reach;
    for (const s of cell) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
    if (!best) return 0;
    const t = bd <= halfWidth ? 1 : 1 - (bd - halfWidth) / fade;
    return best.d * t * t * (3 - 2 * t);
  };
}

/** Lit config/road.json et ajoute les pistes à la scène. Renvoie la liste des maillages. */
export async function loadRoads(scene, world) {
  const r = await fetch(`config/road.json?v=${ASSET_VERSION}`);
  if (!r.ok) return [];
  const cfg = await r.json();
  const meshes = [];
  for (const road of cfg.roads ?? []) {
    const m = buildRoadMesh(road.points, road.width ?? 6, world.groundY, 0.1, world.groundMeshes ?? []);
    m.name = `piste_${road.id}`;
    scene.add(m); meshes.push(m);
    world.addGroundPatch?.(roadGroundPatch(m.userData.samples, (road.width ?? 6) / 2));
  }
  return meshes;
}
