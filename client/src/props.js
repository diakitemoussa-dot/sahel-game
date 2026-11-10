// Objets de décor posés dans le monde (véhicules...) : config/props.json décrit chaque objet (fichier .glb, position, cap, collision).
// Un objet est posé sur le sol (suit la pente) et sa maille de collision est ajoutée à celle de la carte : on ne passe pas à travers,
// on peut monter dessus, et les tirs sont arrêtés. Position en coordonnées Blender (x, y) ; cap : rotation en radians autour de Z (0 = avant vers -y).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { groundNormal } from './blood.js';
import { decodeSCOL } from './meshworld.js';
import { ASSET_VERSION } from './version.js';

/** Boîte de collision (repère Blender) d'un décor : centre décalé dans le repère de l'objet, puis tourné du cap de l'objet. */
export function colliderFor(def) {
  const c = def.collider;
  if (!c) return null;
  const yaw = def.yaw ?? 0, dx = c.dx ?? 0, dy = c.dy ?? 0;
  return { t: 'b', x: def.pos[0] + dx * Math.cos(yaw) - dy * Math.sin(yaw), y: def.pos[1] + dx * Math.sin(yaw) + dy * Math.cos(yaw),
           hx: c.hx, hy: c.hy, yaw };
}

export function parseProps(json) {
  const list = json?.props ?? [];
  const ids = new Set();
  return list.map((p) => {
    if (!p.id || !p.file || !Array.isArray(p.pos) || p.pos.length !== 2) throw new Error(`props.json : décor incomplet (${p.id ?? '?'})`);
    if (ids.has(p.id)) throw new Error(`props.json : décor en double (${p.id})`);
    ids.add(p.id);
    return { scale: 1, yaw: 0, ...p };
  });
}

/** Matériau carbonisé : peinture noircie de suie, mat (les matériaux sont copiés : le véhicule intact garde les siens). */
function charred(mat) {
  if (Array.isArray(mat)) return mat.map(charred);
  const m = mat.clone();
  if (m.color) m.color.multiplyScalar(0.14);
  if ('roughness' in m) m.roughness = 0.95;
  if ('metalness' in m) m.metalness = 0.05;
  if (m.map) m.map = null;
  return m;
}

/** Charge et pose les décors. Un décor qui ne se charge pas est ignoré (le jeu démarre quand même). */
export async function loadProps(scene, world) {
  const r = await fetch(`config/props.json?v=${ASSET_VERSION}`);
  if (!r.ok) return [];
  const defs = parseProps(await r.json());
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const out = [];
  for (const def of defs) {
    try {
      const gltf = await loader.loadAsync(`${def.file}?v=${ASSET_VERSION}`);
      const root = gltf.scene;
      root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (def.burnt) o.material = charred(o.material); } });
      const [bx, by] = def.pos, x = bx, z = -by;
      const h = (a, b) => world.groundY(a, b);
      // posé sur le sol (hauteur au centre) et incliné selon la pente
      const ground = h(x, z);
      root.position.set(x, ground, z);
      const n = groundNormal(h, x, z, 1.2);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...n));
      root.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), def.yaw));
      root.scale.setScalar(def.scale);
      scene.add(root);
      root.updateMatrixWorld(true);
      // collisions : la maille du véhicule (enveloppes de ses pièces) posée là où il est : on peut monter sur le capot, le toit, la plateau.
      // Sans maillage (fichier absent), on retombe sur la boîte 2D.
      let col = null;
      if (def.collision && world.mesh) {
        const rr = await fetch(`${def.collision}?v=${ASSET_VERSION}`);
        if (rr.ok) world.addCollision(decodeSCOL(await rr.arrayBuffer()), root.matrixWorld.elements);
      }
      if (!world.mesh || !def.collision) { col = colliderFor(def); if (col) world.colliders.push(col); }
      out.push({ def, root, collider: col, nodes: (name) => root.getObjectByName(name) });
    } catch (e) { console.error(`décor ${def.id} non chargé`, e); }
  }
  return out;
}
