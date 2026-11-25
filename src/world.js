import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ASSET_VERSION } from './version.js';
import { sampleHeight } from './heightmap.js';
import { pushOut } from './colliders.js';
import { segmentBlocked } from './combat.js';
import { MeshWorld, decodeSCOL } from './meshworld.js';

const getJSON = (n) => fetch(`config/${n}.json?v=${ASSET_VERSION}`).then((r) => { if (!r.ok) throw new Error(`config/${n}.json introuvable`); return r.json(); });
export const STEP = 0.45;                                       // hauteur qu'un personnage enjambe sans sauter (marche, rebord bas)

/** API du monde (sol, collisions, lignes de vue). mesh : collisions sur maillage de tous les objets (assets/collision.bin) ;
 *  sans lui, on retombe sur les anciennes boîtes et cercles 2D (colliders). Coordonnées de jeu : celles de three.js (Y en haut). */
export function createWorldApi({ hm, colliders, cams, spawns, mesh = null, groundMeshes = [] }) {
  const dynamic = [];                                           // obstacles mobiles (blindés du convoi) : boîtes { t:'b', x, y, hx, hy, yaw } en repère Blender, mises à jour par leur propriétaire
  const patches = [];                                          // corrections locales du sol (par exemple une piste posée sur le sable : on marche sur elle, pas dedans)
  const groundY = (x, z) => { let h = sampleHeight(hm, x, -z); for (const p of patches) h += p(x, z); return h; };          // three (x, z) -> Blender (x, -z)
  const api = {
    hm, colliders, cams, spawns, groundY, mesh, groundMeshes, addGroundPatch: (fn) => patches.push(fn),         // groundMeshes : les dalles du sable (Sol_Desert, Sol_Desert_1...), pour poser des décors exactement dessus
    /** position d'apparition d'un joueur en coordonnées three.js */
    spawn(name) { const s = spawns[name] || [0, 0, 0]; return new THREE.Vector3(s[0], s[2], -s[1]); },
    /** hauteur sur laquelle se tient un personnage dont les pieds sont à feetY : le sol, ou le dessus d'un objet qu'il peut enjamber (à moins de STEP) */
    surfaceY(x, z, feetY, step = STEP) {
      const g = groundY(x, z);
      if (!mesh) return g;
      const s = mesh.surfaceY(x, z, feetY + step);
      return s !== null && s > g ? s : g;
    },
    /** repousse la position (three.js, pieds en p.y) hors des obstacles : parois des objets sur toute la hauteur du personnage */
    collide(p, radius = 0.4) {
      if (dynamic.length) { const d = { x: p.x, y: -p.z }; pushOut(d, radius, dynamic); p.x = d.x; p.z = -d.y; }
      if (mesh) { mesh.pushOut(p, radius); return; }
      const q = { x: p.x, y: -p.z };
      pushOut(q, radius, colliders);
      p.x = q.x; p.z = -q.y;
    },
    /** le segment a -> b (points avec x, y, z) traverse-t-il un objet ? (ligne de vue, tir) */
    blocked(a, b) {
      return mesh ? mesh.blocked(a, b) : segmentBlocked(a.x, a.z, b.x, b.z, colliders, 0.3);
    },
    /** rebord à portée de main devant un personnage (double saut : il grimpe dessus) : { x, y, z } ou null */
    findLedge(pos, dir) { return mesh ? mesh.findLedge(pos, dir) : null; },
    /** ajoute des objets (par exemple un véhicule posé dans le monde) aux collisions */
    addCollision(geo, matrix) { if (!mesh) return null; mesh.add(geo, matrix); return mesh.lastAdd; },        // renvoie de quoi le retirer
    removeCollision(handle) { if (mesh) mesh.remove(handle); },
    addDynamic(box) { dynamic.push(box); return box; },
    /** premier point où le rayon touche le sol ou un objet, sinon le point à `max` mètres */
    rayGround(origin, dir, max = 120) {
      const p = new THREE.Vector3();
      const hit = mesh ? mesh.raycast(origin, dir, max) : null;
      const lim = hit !== null ? hit : max;
      for (let d = 1; d <= lim; d += 1) {
        p.copy(origin).addScaledVector(dir, d);
        if (p.y <= groundY(p.x, p.z)) return p.clone();
      }
      return origin.clone().addScaledVector(dir, lim);
    },
  };
  return api;
}

/** Charge la carte et les fichiers de configuration. */
export async function loadWorld(scene) {
  const [hm, colliders, cams, spawns] = await Promise.all(['heightmap', 'colliders', 'cameras', 'spawns'].map(getJSON));
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);                   // la carte est compressée (EXT_meshopt_compression)
  const [gltf, mesh] = await Promise.all([
    loader.loadAsync(`assets/map.glb?v=${ASSET_VERSION}`),
    fetch(`assets/collision.bin?v=${ASSET_VERSION}`).then(async (r) => (r.ok ? new MeshWorld().add(decodeSCOL(await r.arrayBuffer())) : null)).catch(() => null),
  ]);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.receiveShadow = true; o.castShadow = false;
    // textures du sable : nettes aussi quand on regarde le sol en biais (limité par la carte graphique)
    for (const m of [].concat(o.material)) for (const t of [m.map, m.normalMap]) if (t) t.anisotropy = 8;
  });
  scene.add(gltf.scene);
  if (!mesh) console.warn('collision.bin introuvable : collisions 2D de secours');
  return createWorldApi({ hm, colliders, cams, spawns, mesh, groundMeshes: (() => { const l = []; gltf.scene.traverse((o) => { if (o.isMesh && /^Sol_Desert/.test(o.name)) l.push(o); }); return l; })() });
}
