// Hauteur du terrain en (x, y) en coordonnées Blender. La grille est rangée ligne par ligne (x varie le plus vite).
export function sampleHeight(hm, x, y) {
  const fx = (x - hm.x0) / hm.step;
  const fy = (y - hm.y0) / hm.step;
  const i = Math.max(0, Math.min(hm.n - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(hm.n - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - i));
  const ty = Math.max(0, Math.min(1, fy - j));
  const h = (a, b) => hm.h[b * hm.n + a];
  return h(i, j) * (1 - tx) * (1 - ty) + h(i + 1, j) * tx * (1 - ty)
       + h(i, j + 1) * (1 - tx) * ty + h(i + 1, j + 1) * tx * ty;
}
