// Le feu brûle : logique pure (testée sans navigateur).
//  - zoneOf / fireZones : la zone de brûlure d'un foyer (cercle autour des flammes), tant que le feu est assez vif ;
//  - BurnState : la brûlure d'un personnage : dégâts par seconde qui montent tant qu'il reste dans le feu, puis qui s'éteignent après sa sortie ;
//  - keepOut : un PNJ ne marche pas dans le feu (il contourne), et s'il se retrouve dans le feu (explosion) il en sort en courant.
import { fadeIntensity } from './smokelogic.js';

export const BURN = {
  dps0: 8, dps1: 18, ramp: 3,        // dégâts par seconde : 8 au contact, 18 après 3 s dans le feu (100 points de vie : ~6 s pour mourir en restant dedans)
  after: 2.5, afterDps: 6,           // après la sortie : il brûle encore 2,5 s, de moins en moins fort
  margin: 1.0,                       // distance de sécurité que les PNJ gardent autour des flammes (m)
  minIntensity: 0.25,                // un foyer presque éteint ne brûle plus
  height: 2.6,                       // on ne brûle pas si on est à plus de 2,6 m au-dessus du foyer (toit, saut)
  flee: 5,                           // vitesse de sortie (m/s) d'un PNJ pris dans le feu
};

/** Rayon de brûlure d'un foyer : un peu plus que la zone où naissent les flammes. profile : { radius } (smoke.js), scale : taille du foyer. */
export const burnRadius = (profile, scale = 1) => profile.radius * 0.55 * scale + 1.0;

/** { x, z, y, r } si ce foyer brûle en ce moment, sinon null. site : foyer de smoke.js. */
export function zoneOf(site) {
  if (!site.fire) return null;
  const inten = site.temp ? fadeIntensity(site.age, site.life) : site.intensity;
  if (!(inten >= BURN.minIntensity)) return null;
  return { x: site.x, z: site.z, y: site.y, r: burnRadius(site.p, site.scale) };
}

export const fireZones = (sites) => sites.map(zoneOf).filter(Boolean);

/** La zone dans laquelle se trouve pos ({ x, z, y? }), ou null. grow : marge ajoutée au rayon (m). */
export function inFire(pos, zones, grow = 0) {
  for (const z of zones) {
    if (pos.y !== undefined && z.y !== undefined && pos.y - z.y > BURN.height) continue;
    if (Math.hypot(pos.x - z.x, pos.z - z.z) < z.r + grow) return z;
  }
  return null;
}

const lerp = (a, b, t) => a + (b - a) * t;

/** Brûlure d'un personnage. update(dt, dansLeFeu) renvoie { dmg, burning } : les points de vie à retirer cette image, et s'il brûle (flammes sur lui). */
export class BurnState {
  constructor() { this.t = 0; this.after = 0; this.acc = 0; this.cry = 0; this.was = false; }
  update(dt, inside) {
    let dmg = 0;
    if (inside) {
      this.t += dt; this.after = BURN.after;
      dmg = lerp(BURN.dps0, BURN.dps1, Math.min(1, this.t / BURN.ramp)) * dt;
    } else if (this.after > 0) {
      this.after = Math.max(0, this.after - dt);
      this.t = Math.max(0, this.t - dt * 2);
      dmg = BURN.afterDps * (this.after / BURN.after) * dt;
    } else this.t = 0;
    const burning = inside || this.after > 0;
    const started = burning && !this.was; this.was = burning;
    return { dmg, burning, started };
  }
}

/** Écarte un PNJ du feu. pos : position après son déplacement { x, z } (modifiée), prev : position avant, side : +1 ou -1 (côté de contournement),
 *  dt : durée de l'image. Renvoie vrai si la position a été corrigée. */
export function keepOut(pos, prev, zones, side = 1, dt = 1 / 60) {
  let moved = false;
  for (let pass = 0; pass < 2; pass++) {
    let again = false;
    for (const z of zones) {
      const R = z.r + BURN.margin;
      let dx = pos.x - z.x, dz = pos.z - z.z, d = Math.hypot(dx, dz);
      if (d >= R) continue;
      if (d < 1e-4) { dx = 1; dz = 0; d = 1; pos.x = z.x + 1e-4; }
      const ux = dx / d, uz = dz / d;
      if (Math.hypot(prev.x - z.x, prev.z - z.z) < R - 0.05) {   // il était déjà dans le feu (explosion sur lui) : il en sort en courant
        const s = Math.min(R - d, BURN.flee * dt);
        pos.x += ux * s; pos.z += uz * s;
        moved = true; continue;                                 // (une seule poussée par image : pas de second tour)
      } else {                                                  // il marchait vers le feu : il reste au bord et glisse sur le côté
        const step = Math.hypot(pos.x - prev.x, pos.z - prev.z);
        const toward = d < Math.hypot(prev.x - z.x, prev.z - z.z) - 1e-6;       // il s'est rapproché du centre
        let vx = ux * R, vz = uz * R;
        if (toward) { vx += -uz * side * step * 0.9; vz += ux * side * step * 0.9; }
        const n = Math.hypot(vx, vz);
        pos.x = z.x + vx / n * R; pos.z = z.z + vz / n * R;
      }
      moved = true; again = true;
    }
    if (!again) break;
  }
  return moved;
}
