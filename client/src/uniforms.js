// Bibliothèque de tenues : config/uniforms.json décrit les tenues, Outfit en habille un joueur.
// Une tenue = un fichier .glb séparé (mêmes os que le personnage) + la liste des pièces de base à cacher.
// Les animations ne changent pas : les pièces de la tenue sont rattachées au squelette du joueur, elles suivent donc ses os.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ASSET_VERSION } from './version.js';
import { addFlagPatches } from './flagpatch.js';

/** Vérifie la configuration et la renvoie normalisée. Lance une erreur claire si elle est incohérente. */
export function parseLibrary(json) {
  const list = json?.uniforms;
  if (!Array.isArray(list) || list.length === 0) throw new Error('uniforms.json : aucune tenue');
  const ids = new Set();
  const uniforms = list.map((u) => {
    if (!u.id || !u.name) throw new Error('uniforms.json : une tenue sans id ou sans nom');
    if (ids.has(u.id)) throw new Error(`uniforms.json : tenue en double (${u.id})`);
    ids.add(u.id);
    if (u.file && !u.file.endsWith('.glb')) throw new Error(`uniforms.json : ${u.id} doit pointer vers un .glb`);
    return { id: u.id, name: u.name, description: u.description ?? '', file: u.file ?? null, hide: u.hide ?? [], menu: u.menu !== false, flag: u.flag !== false };
  });
  const def = json.default ?? uniforms[0].id;
  if (!ids.has(def)) throw new Error(`uniforms.json : tenue par défaut inconnue (${def})`);
  return { default: def, uniforms };
}

/** La tenue demandée, ou la tenue par défaut si l'identifiant est inconnu (ancienne sauvegarde, fichier modifié). */
export function pickUniform(lib, id) {
  return lib.uniforms.find((u) => u.id === id) ?? lib.uniforms.find((u) => u.id === lib.default);
}

/** Noms de toutes les pièces de base qu'au moins une tenue sait cacher. */
export function hideableNames(lib) {
  return [...new Set(lib.uniforms.flatMap((u) => u.hide))];
}

export async function loadLibrary() {
  const r = await fetch(`config/uniforms.json?v=${ASSET_VERSION}`);
  if (!r.ok) throw new Error('config/uniforms.json introuvable');
  return parseLibrary(await r.json());
}

function sameSkeleton(sk, bones, inverses) {
  if (sk.bones.length !== bones.length) return false;
  for (let i = 0; i < bones.length; i++) {
    if (sk.bones[i] !== bones[i]) return false;
    const a = sk.boneInverses[i].elements, b = inverses[i].elements;
    for (let k = 0; k < 16; k++) if (a[k] !== b[k]) return false;
  }
  return true;
}

/** Rattache les maillages skinnés d'un glTF au squelette du joueur (os retrouvés par leur nom). Renvoie le groupe créé. */
export function attachToSkeleton(player, gltf) {
  const bones = new Map();
  player.model.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
  const group = new THREE.Group();
  group.name = 'tenue';
  const meshes = [];
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  if (meshes.length === 0) throw new Error('tenue sans maillage skinné');
  const shared = [];                                       // squelettes déjà créés : les pièces qui ont les mêmes os et les mêmes matrices le partagent (mis à jour une seule fois par image)
  for (const m of meshes) {
    const mine = m.skeleton.bones.map((b) => {
      const t = bones.get(b.name);
      if (!t) throw new Error(`os introuvable sur le personnage : ${b.name}`);
      return t;
    });
    let sk = shared.find((s) => sameSkeleton(s, mine, m.skeleton.boneInverses));
    if (!sk) { sk = new THREE.Skeleton(mine, m.skeleton.boneInverses); shared.push(sk); }
    const bindMatrix = m.bindMatrix.clone();
    m.removeFromParent();
    m.bind(sk, bindMatrix);
    m.frustumCulled = false;
    m.castShadow = true;
    group.add(m);
  }
  (player.model.getObjectByName('Armature') ?? player.model).add(group);
  return group;
}

export class Outfit {
  constructor(player, lib) {
    this.player = player; this.lib = lib;
    this.current = null;
    this.groups = new Map();          // id -> groupe déjà chargé
    this.loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    this._seq = 0;
  }

  async _load(entry) {
    const gltf = await this.loader.loadAsync(`${entry.file}?v=${ASSET_VERSION}`);
    const group = attachToSkeleton(this.player, gltf);
    this.groups.set(entry.id, group);
    return group;
  }

  /** Habille le joueur. Si une demande plus récente arrive pendant le chargement, celle-ci est abandonnée. */
  async apply(id) {
    const entry = pickUniform(this.lib, id);
    const seq = ++this._seq;
    if (entry.flag && !this._patches) this._patches = addFlagPatches(this.player);      // écusson du Mali sur les deux épaules (sauf tenues avec "flag": false, comme les miliciens)
    const group = entry.file ? (this.groups.get(entry.id) ?? await this._load(entry)) : null;
    if (seq !== this._seq) return this.current;
    for (const g of this.groups.values()) g.visible = false;
    if (group) group.visible = true;
    for (const name of hideableNames(this.lib)) {
      const o = this.player.model.getObjectByName(name);
      if (o) o.visible = !entry.hide.includes(name);
    }
    this.current = entry.id;
    this.player.uniformId = entry.id;
    this.player.uniformName = entry.name;
    return entry.id;
  }
}
