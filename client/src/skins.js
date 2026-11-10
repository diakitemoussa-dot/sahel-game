// Teintes de peau : le personnage a une seule texture de corps (atlas : visage, mains, jambes, yeux, vêtements de base).
// Pour varier les personnages, on remplace cette texture par une variante où seule la peau est recolorée
// (fichiers assets/skins/peau_<nom>.webp, mêmes coordonnées de texture ; script tools/uniforms/recolor_peau.py).
// Chaque personnage reçoit sa propre copie du matériau (le matériau d'origine est partagé par tous les clones) ; les textures sont partagées.
import * as THREE from 'three';
import { ASSET_VERSION } from './version.js';

export const SKINS = ['noire', 'metisse', 'blanche'];
const BODY_MATERIAL = 'Ch12_body';          // matériau de la peau dans player.glb
const textures = new Map();

export const skinUrl = (name) => `assets/skins/peau_${name}.webp?v=${ASSET_VERSION}`;

/** Charge (une seule fois) la texture d'une teinte ; rejette si le nom est inconnu ou le fichier absent. */
export function loadSkin(name, loader = new THREE.TextureLoader()) {
  if (!SKINS.includes(name)) return Promise.reject(new Error(`teinte de peau inconnue : ${name}`));
  if (!textures.has(name)) {
    textures.set(name, loader.loadAsync(skinUrl(name)).then((t) => {
      t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;           // comme les textures d'un fichier glTF
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
      return t;
    }).catch((e) => { textures.delete(name); throw e; }));
  }
  return textures.get(name);
}

/** Donne à ce personnage sa teinte : copie du matériau de peau avec la texture choisie. Renvoie le nombre de matériaux remplacés. */
export function applySkin(root, texture) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (m) => { if (m?.name !== BODY_MATERIAL) return m; const c = m.clone(); c.map = texture; c.needsUpdate = true; n++; return c; };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  return n;
}

/** Charge la teinte et l'applique ; si elle manque, le personnage garde sa peau d'origine (le jeu continue). */
export async function giveSkin(root, name) {
  if (!name) return 0;
  try { return applySkin(root, await loadSkin(name)); } catch (e) { console.warn('peau indisponible :', name, e.message); return 0; }
}
