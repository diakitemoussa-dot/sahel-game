import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleHeight } from '../src/heightmap.js';

// carte 3x3 où la hauteur vaut x (0, 1, 2) sur chaque ligne
const hm = { x0: 0, y0: 0, step: 1, n: 3, h: [0, 1, 2, 0, 1, 2, 0, 1, 2] };

const near = (a, b) => Math.abs(a - b) < 1e-9;

test('interpolation bilinéaire', () => {
  assert.ok(near(sampleHeight(hm, 0.5, 1), 0.5));
  assert.ok(near(sampleHeight(hm, 1.25, 0.3), 1.25));
});

test('hors de la carte : valeur du bord', () => {
  assert.equal(sampleHeight(hm, -5, 1), 0);
  assert.equal(sampleHeight(hm, 99, 1), 2);
});
