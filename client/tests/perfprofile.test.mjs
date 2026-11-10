import test from 'node:test';
import assert from 'node:assert/strict';
import { detectProfile, resolveProfile, settingsFor, PROFILES } from '../src/perfprofile.js';

const PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';

test('détection : ordinateur, téléphone, téléphone modeste', () => {
  assert.equal(detectProfile({ ua: PC, coarse: false, memory: 8, cores: 8 }), 'desktop');
  assert.equal(detectProfile({ ua: PHONE, coarse: true, memory: 8, cores: 8 }), 'mobile');
  assert.equal(detectProfile({ ua: IPHONE, coarse: true, cores: 6 }), 'mobile', 'iPhone : mémoire inconnue, 6 cœurs');
  assert.equal(detectProfile({ ua: PHONE, coarse: true, memory: 2, cores: 8 }), 'mobile_low', 'peu de mémoire');
  assert.equal(detectProfile({ ua: PHONE, coarse: true, memory: 4, cores: 4 }), 'mobile_low', '4 cœurs');
  assert.equal(detectProfile({ ua: PC, coarse: true, memory: 8, cores: 8 }), 'mobile', 'écran tactile principal = mobile');
  assert.equal(detectProfile({}), 'desktop'); assert.equal(detectProfile(), 'desktop');
});

test('choix du joueur : Auto suit la détection, Économie force le profil mobile, Maximum le profil ordinateur', () => {
  const phone = { ua: PHONE, coarse: true, memory: 8, cores: 8 }, pc = { ua: PC, coarse: false, memory: 8, cores: 8 };
  assert.equal(resolveProfile('auto', phone), 'mobile'); assert.equal(resolveProfile('auto', pc), 'desktop');
  assert.equal(resolveProfile('eco', pc), 'mobile', 'essayer le mode téléphone sur ordinateur');
  assert.equal(resolveProfile('eco', { ...phone, memory: 2 }), 'mobile_low');
  assert.equal(resolveProfile('max', phone), 'desktop');
  assert.equal(resolveProfile(undefined, pc), 'desktop');
});

test('l\'adresse ?perf= l\'emporte sur le réglage ; valeur inconnue ignorée', () => {
  const pc = { ua: PC };
  assert.equal(resolveProfile('max', pc, 'eco'), 'mobile');
  assert.equal(resolveProfile('eco', pc, 'max'), 'desktop');
  assert.equal(resolveProfile('eco', pc, 'n importe quoi'), 'mobile');
  assert.equal(resolveProfile('auto', pc, null), 'desktop');
});

test('réglages : plus on descend en gamme, plus c\'est léger', () => {
  const d = settingsFor('desktop'), m = settingsFor('mobile'), l = settingsFor('mobile_low');
  assert.ok(d.maxPixelRatio > m.maxPixelRatio && m.maxPixelRatio >= l.maxPixelRatio);
  assert.ok(d.antialias && !m.antialias && !l.antialias);
  assert.ok(d.shadowMap > m.shadowMap && m.shadowMap > l.shadowMap && l.shadowMap === 0, 'ombres : grandes, moyennes, aucune');
  assert.ok(d.smoke.rate > m.smoke.rate && m.smoke.rate > l.smoke.rate);
  assert.ok(d.smoke.burst > m.smoke.burst && m.smoke.burst > l.smoke.burst);
  assert.ok(d.smoke.trail < m.smoke.trail && m.smoke.trail < l.smoke.trail, 'traînées d\'avion plus espacées');
  assert.equal(d.fpsCap, 0); assert.equal(m.fpsCap, 30); assert.equal(l.fpsCap, 30);
  assert.equal(settingsFor('inconnu'), PROFILES.desktop);
  assert.ok(m.maxPixelRatio <= 1.5, 'un téléphone à écran 3x ne dessine pas à 3x');
});
