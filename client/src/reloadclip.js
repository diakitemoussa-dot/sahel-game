// L'animation « Pistol Reload » n'existe pas dans player.glb : on la compose au chargement.
// Hanches et jambes : « Pistol Idle ». Haut du corps (buste, tête, bras, mains, doigts) : « Rifle Reload » : la main droite ramène l'arme
// devant la poitrine, la main gauche va chercher le chargeur, l'insère, puis arme. Le pistolet est fixé à la main droite, il suit le geste.
import * as THREE from 'three';

const UPPER = /^mixamorig4(Spine|Neck|Head|(Left|Right)(Shoulder|Arm|ForeArm|Hand))/;      // buste, tête, épaules, bras, mains (les doigts commencent par « LeftHand » / « RightHand »)

/** clips : Map nom -> AnimationClip. Renvoie le clip « Pistol Reload », ou null si les animations de départ manquent. */
export function makePistolReload(clips, { name = 'Pistol Reload', base = 'Pistol Idle', source = 'Rifle Reload' } = {}) {
  const b = clips.get(base), s = clips.get(source);
  if (!b || !s) return null;
  const tracks = [
    ...b.tracks.filter((t) => !UPPER.test(t.name)).map((t) => t.clone()),
    ...s.tracks.filter((t) => UPPER.test(t.name)).map((t) => t.clone()),
  ];
  return new THREE.AnimationClip(name, s.duration, tracks);
}
