import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { SAMPLES, pickSample } from '../src/sfxsamples.js';
import { MAG_SIZE } from '../src/ammo.js';

test('les fichiers des sons de tir existent et sont des sons courts (pas le fichier de 7 s en entier)', () => {
  const files = [...new Set(Object.values(SAMPLES).flatMap((d) => [...d.shots, d.long]))];
  assert.ok(files.length >= 8);
  for (const f of files) {
    const p = new URL(`../assets/sounds/${f}.wav`, import.meta.url);
    assert.ok(existsSync(p), `${f}.wav`);
    const size = statSync(p).size;                                         // WAV 16 bits mono 44,1 kHz : 88,2 Ko par seconde
    assert.ok(size < 100000, `${f} dure moins de 1,1 s (${size} octets)`);
  }
  for (const f of SAMPLES.rifle.shots) assert.ok(statSync(new URL(`../assets/sounds/${f}.wav`, import.meta.url)).size < 10000, 'un coup dure 0,1 s : il rentre dans la cadence du fusil');
});

test('un coup est tiré au hasard parmi tous les coups ; le coup à longue résonance est rare', () => {
  const d = SAMPLES.rifle, seen = new Map();
  for (let i = 0; i < 2000; i++) { const p = pickSample(d, (i + 0.5) / 2000, 0.5); seen.set(p.name, (seen.get(p.name) ?? 0) + 1); }
  for (const s of d.shots) assert.ok(seen.get(s) > 100, `${s} sert régulièrement`);
  const long = seen.get(d.long) / 2000;
  assert.ok(Math.abs(long - d.longChance) < 0.01, `résonance longue ${long}`);
});

test('la hauteur varie un peu à chaque coup, et le pistolet est plus aigu que le fusil', () => {
  const lo = pickSample(SAMPLES.rifle, 0.5, 0).rate, hi = pickSample(SAMPLES.rifle, 0.5, 1).rate;
  assert.ok(lo < 1 && hi > 1 && hi - lo < 0.1);
  assert.ok(pickSample(SAMPLES.pistol, 0.5, 0).rate > hi);
});

test('le chargeur du fusil fait 50 balles, celui du pistolet 12', () => {
  assert.equal(MAG_SIZE.rifle, 50); assert.equal(MAG_SIZE.pistol, 12);
});
