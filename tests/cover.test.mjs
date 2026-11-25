import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCover } from '../src/cover.js';

// monde fictif : la menace est en (0, 30) ; un mur (rectangle) cache une zone à l'ouest de l'axe x = -6
const threat = { x: 0, z: 30 };
const free = () => true;
// un muret haut en (-5..-3, 8..10) : il cache de la menace tout ce qui est derrière lui (au sud, vu de la menace)
const behind = (wall) => (x, z) => {
  // le point est caché si le segment menace -> point traverse le rectangle du mur
  for (let t = 0.02; t < 1; t += 0.02) {
    const px = threat.x + (x - threat.x) * t, pz = threat.z + (z - threat.z) * t;
    if (px >= wall.x0 && px <= wall.x1 && pz >= wall.z0 && pz <= wall.z1) return true;
  }
  return false;
};
const wallHigh = { x0: -5, x1: -3, z0: 8, z1: 10 };
const never = () => false;

test('il choisit un point caché derrière un obstacle, pas un point à découvert', () => {
  const c = chooseCover({ pos: { x: 0, z: 0 }, threat, walkable: free, hiddenCrouched: behind(wallHigh), hiddenStanding: behind(wallHigh) });
  assert.ok(c, 'un abri existe');
  assert.ok(behind(wallHigh)(c.x, c.z), 'le point choisi est bien caché');
  assert.equal(c.low, false, 'le mur est haut : caché même debout');
});

test('aucun abri : null', () => {
  assert.equal(chooseCover({ pos: { x: 0, z: 0 }, threat, walkable: free, hiddenCrouched: never, hiddenStanding: never }), null);
});

test('un abri bas (caché accroupi, visible debout) est préféré à un abri haut un peu plus proche', () => {
  const low = { x0: 4, x1: 6, z0: 9, z1: 11 };       // plus loin à parcourir, mais bas
  const high = wallHigh;
  const hiddenCrouched = (x, z) => behind(high)(x, z) || behind(low)(x, z);
  const hiddenStanding = (x, z) => behind(high)(x, z);      // seul le mur haut cache debout
  const c = chooseCover({ pos: { x: 0, z: 0 }, threat, walkable: free, hiddenCrouched, hiddenStanding });
  assert.equal(c.low, true);
  assert.ok(behind(low)(c.x, c.z));
});

test('l abri doit être atteignable, à bonne distance de la menace et pas déjà pris', () => {
  const noWest = (x) => x > -1;                         // tout ce qui est à l'ouest est inaccessible
  const c = chooseCover({ pos: { x: 0, z: 0 }, threat, walkable: (x, z) => noWest(x), hiddenCrouched: behind(wallHigh), hiddenStanding: behind(wallHigh) });
  assert.equal(c, null, 'l abri est derrière un obstacle infranchissable');
  const near = chooseCover({ pos: { x: 0, z: 22 }, threat, walkable: free, hiddenCrouched: () => true, hiddenStanding: () => true, minThreat: 5 });
  assert.ok(Math.hypot(near.x - threat.x, near.z - threat.z) >= 5, 'pas collé à la menace');
  const wide = { x0: -14, x1: -2, z0: 8, z1: 10 };       // un long mur : plusieurs places derrière
  const first = chooseCover({ pos: { x: 0, z: 0 }, threat, walkable: free, hiddenCrouched: behind(wide), hiddenStanding: behind(wide) });
  const second = chooseCover({ pos: { x: 0, z: 0 }, threat, walkable: free, hiddenCrouched: behind(wide), hiddenStanding: behind(wide), avoid: [first] });
  assert.ok(second && Math.hypot(second.x - first.x, second.z - first.z) >= 1.5, 'un deuxième PNJ prend une autre place');
});

test('il ne s éloigne pas au-delà de la portée de recherche', () => {
  const c = chooseCover({ pos: { x: 0, z: 0 }, threat, walkable: free, hiddenCrouched: () => true, hiddenStanding: () => true, radius: 6 });
  assert.ok(c.travel <= 6);
});
