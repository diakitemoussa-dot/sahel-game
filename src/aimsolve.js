import * as THREE from 'three';

/** Rotation (quaternion, repère monde) à appliquer autour de `pivot` pour que le canon vise `target`.
 *  muzzlePos / muzzleDir : position et direction de tir actuelles du canon.
 *  Même calcul que tools/blender/s13_aim_bake.py. */
export function solveAim(pivot, muzzlePos, muzzleDir, target, iterations = 5) {
  const R = new THREE.Quaternion();
  const mp = new THREE.Vector3(), md = new THREE.Vector3(), want = new THREE.Vector3();
  const step = new THREE.Quaternion();
  for (let i = 0; i < iterations; i++) {
    mp.copy(muzzlePos).sub(pivot).applyQuaternion(R).add(pivot);
    md.copy(muzzleDir).applyQuaternion(R).normalize();
    want.copy(target).sub(mp).normalize();
    step.setFromUnitVectors(md, want);
    R.premultiply(step);
  }
  return R;
}

/** Fait monter ou descendre progressivement le poids de la visée vers `target` (0 ou 1). rate : vitesse (par seconde). */
export function blendWeight(w, target, dt, rate = 9) {
  return w + (target - w) * (1 - Math.exp(-dt * rate));
}

/** Dose une rotation de visée : poids 0 = aucune rotation, 1 = rotation entière. */
export function blendRotation(q, w) {
  return new THREE.Quaternion().slerp(q, w);
}

/** Limite l'angle d'une rotation (en radians) en gardant son axe. */
export function limitRotation(q, maxRad) {
  const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
  if (angle <= maxRad) return q;
  const axis = new THREE.Vector3(q.x, q.y, q.z).normalize();
  if (q.w < 0) axis.negate();
  return new THREE.Quaternion().setFromAxisAngle(axis, maxRad);
}
