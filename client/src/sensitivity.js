// Sensibilité du viseur (logique pure, testée sans navigateur).
// Les commandes (souris, stick droit, doigt) donnent un angle brut ; on le multiplie par un facteur :
//   BASE (0,55 : réglage par défaut, bien plus lent qu'avant) x réglage du joueur (30 % à 250 %) x ralentissement quand il vise.
export const BASE = 0.55;
export const AIM = 0.65;          // clic droit maintenu : le viseur ralentit pour placer le tir
export const SNIPER = 0.45;       // tireur d'élite (T ou L2) : encore plus lent
export const MIN = 0.3, MAX = 2.5, STEP = 0.1;
const KEY = 'sahel.sensitivity';

export function lookScale({ user = 1, aiming = false, sniper = false } = {}) {
  return BASE * user * (sniper ? SNIPER : aiming ? AIM : 1);
}

/** Réglage du joueur après un appui (dir = +1 ou -1), arrondi au dixième et borné. */
export function stepUser(user, dir) {
  const v = Math.round((user + dir * STEP) * 10) / 10;
  return Math.min(MAX, Math.max(MIN, v));
}

export function loadUser(storage) {
  try { const v = parseFloat(storage?.getItem(KEY)); return Number.isFinite(v) ? Math.min(MAX, Math.max(MIN, v)) : 1; } catch { return 1; }
}
export function saveUser(storage, v) {
  try { storage?.setItem(KEY, String(v)); } catch { /* navigation privée : pas de mémorisation */ }
}
