// Écusson du Mali (rouge, jaune, vert) cousu sur chaque épaule, quelle que soit la tenue.
// Il est rattaché aux os des bras du personnage : il suit donc les animations. Les mesures sont dans l'unité de l'armature (1 = 1 cm).
import * as THREE from 'three';

// Mesures relevées sur le galon vert des tenues (Piece_U_Velcro), dans le repère de l'os du bras (1 = 1 cm) :
// il couvre x de -4,7 à 5 et y de 7 à 20, sur la face -Z du bras, et épouse la manche. L'écusson le recouvre exactement.
export const PATCH = { x: 0.7, y: 13.4, width: 6, height: 4, radius: 6.3, surfaceZ: -7.6 };
const SIDES = ['mixamorig4LeftArm', 'mixamorig4RightArm'];

let sharedTex = null;
function texture() {
  if (sharedTex) return sharedTex;
  const c = document.createElement('canvas'); c.width = 96; c.height = 72;
  const g = c.getContext('2d');
  ['#ce1126', '#fcd116', '#14b53a'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 32, 0, 32, 72); });
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 4; g.strokeRect(2, 2, 92, 68);       // liseré sombre : l'écusson se détache du tissu
  sharedTex = new THREE.CanvasTexture(c);
  sharedTex.colorSpace = THREE.SRGBColorSpace;
  sharedTex.anisotropy = 4;
  return sharedTex;
}

/** Colle l'écusson sur les deux épaules du joueur. Renvoie les deux maillages. */
export function addFlagPatches(player) {
  const bones = new Map();
  player.model.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
  const mat = new THREE.MeshStandardMaterial({ map: texture(), roughness: 0.9, side: THREE.DoubleSide });
  const out = [];
  const { x, y, width, height, radius, surfaceZ } = PATCH;
  const arc = 2 * Math.asin(Math.min(1, width / 2 / radius));
  for (const bone of SIDES) {
    const b = bones.get(bone);
    if (!b) continue;
    // morceau de cylindre courbé comme la manche, centré sur la face -Z
    const geo = new THREE.CylinderGeometry(radius, radius, height, 24, 1, true, Math.PI - arc / 2, arc);
    const m = new THREE.Mesh(geo, mat);
    m.name = 'ecusson_mali';
    m.castShadow = false;
    m.frustumCulled = false;
    m.position.set(x, y, surfaceZ + radius);
    b.add(m);
    out.push(m);
  }
  return out;
}
