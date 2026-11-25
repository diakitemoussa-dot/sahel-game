// Repousse le joueur (cercle de rayon `radius`, position {x, y} en coordonnées Blender) hors des obstacles.
// Obstacle cercle : {t:'c', x, y, r}. Obstacle boîte : {t:'b', x, y, hx, hy, yaw} (demi-dimensions, rotation autour de Z).
export function pushOut(pos, radius, colliders) {
  for (const c of colliders) {
    if (c.t === 'c') {
      const dx = pos.x - c.x, dy = pos.y - c.y;
      const d = Math.hypot(dx, dy), m = radius + c.r;
      if (d < m) {
        if (d > 1e-6) { const k = (m - d) / d; pos.x += dx * k; pos.y += dy * k; }
        else { pos.x += m; }
      }
    } else {
      const cs = Math.cos(-c.yaw), sn = Math.sin(-c.yaw);
      const dx = pos.x - c.x, dy = pos.y - c.y;
      const lx = dx * cs - dy * sn, ly = dx * sn + dy * cs;       // position dans le repère de la boîte
      const qx = Math.max(-c.hx, Math.min(c.hx, lx));
      const qy = Math.max(-c.hy, Math.min(c.hy, ly));
      const ox = lx - qx, oy = ly - qy;
      const d = Math.hypot(ox, oy);
      if (d < radius) {
        let nx, ny, push;
        if (d > 1e-6) { nx = ox / d; ny = oy / d; push = radius - d; }
        else {
          const px = c.hx - Math.abs(lx), py = c.hy - Math.abs(ly);
          if (px < py) { nx = Math.sign(lx) || 1; ny = 0; push = px + radius; }
          else { nx = 0; ny = Math.sign(ly) || 1; push = py + radius; }
        }
        pos.x += (nx * Math.cos(c.yaw) - ny * Math.sin(c.yaw)) * push;
        pos.y += (nx * Math.sin(c.yaw) + ny * Math.cos(c.yaw)) * push;
      }
    }
  }
  return pos;
}
