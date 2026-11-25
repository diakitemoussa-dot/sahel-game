// Aspect des véhicules : peinture un peu métallisée, un peu moins lisse, et un reflet de ciel (le jeu n'a pas de carte d'environnement : sans elle un métal ne reflète rien et paraît juste sombre).
// tuneMaterial est pur (testé sans navigateur) ; makeSkyEnv fabrique le petit reflet de ciel à partir du rendu du jeu.
import * as THREE from 'three';

/** Réglages : roughUp = rugosité ajoutée ; paintMetal = métal de la peinture (0 = mat, 1 = métal pur) ; envIntensity = force du reflet. */
export const VEHICLE_LOOK = { roughUp: 0.08, paintMetal: 0.3, envIntensity: 0.8 };
const SKIP = /^(Phare|Feu_|Plafonnier|Vitre)/;            // phares, feux, plafonnier et vitres gardent leur aspect

let env = null;
export function setVehicleEnv(texture) { env = texture; }

/** Règle un matériau. Renvoie vrai s'il a été modifié (une seule fois par matériau, même s'il est partagé entre plusieurs véhicules). */
export function tuneMaterial(m, texture = env, look = VEHICLE_LOOK) {
  if (!m || m.userData?.vehicleTuned || m.transparent || typeof m.roughness !== 'number' || SKIP.test(m.name ?? '')) return false;
  m.userData = { ...(m.userData ?? {}), vehicleTuned: true };
  m.roughness = Math.min(1, m.roughness + look.roughUp);
  if (/^Peinture/.test(m.name ?? '') && m.metalness < look.paintMetal) m.metalness = look.paintMetal;
  if (texture) { m.envMap = texture; m.envMapIntensity = look.envIntensity; }
  m.needsUpdate = true;
  return true;
}

export function tuneVehicle(root, texture = env, look = VEHICLE_LOOK) {
  root.traverse((o) => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) tuneMaterial(m, texture, look); });
}

/** Un petit ciel : bleu en haut, sable à l'horizon et au sol, avec un point très clair pour le soleil (reflet qui accroche sur la peinture et le métal). */
export function makeSkyEnv(renderer) {
  const geo = new THREE.SphereGeometry(50, 32, 16), pos = geo.attributes.position, col = [];
  const top = new THREE.Color('#7fb0ea'), hor = new THREE.Color('#f0e0bc'), gnd = new THREE.Color('#a98b5a'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 50;
    if (y >= 0) c.copy(hor).lerp(top, Math.pow(y, 0.6)); else c.copy(hor).lerp(gnd, Math.min(1, -y * 2.2));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 4.6) }));
  sun.position.set(25, 30, 20); scene.add(sun);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(scene, 0.02).texture;
  pm.dispose(); geo.dispose();
  return tex;
}
