// Profils de performance : le jeu s'adapte à l'appareil (ordinateur, téléphone, téléphone modeste) pour rester fluide sans faire chauffer.
// Logique pure, testée sans navigateur. Les réglages sont appliqués par main.js.
//  - detectProfile : devine le type d'appareil (écran tactile, navigateur mobile, mémoire, nombre de cœurs) ;
//  - resolveProfile : tient compte du choix du joueur (Auto / Économie / Maximum) et de l'adresse ?perf=eco|max|auto (pour essayer sur ordinateur) ;
//  - settingsFor : les réglages de chaque profil.

export const PROFILES = {
  desktop: {
    name: 'desktop', maxPixelRatio: 1.75, antialias: true, powerPreference: 'high-performance',
    shadowMap: 2048, shadowExtent: 30,                      // taille de la carte d'ombre (0 = pas d'ombre) et zone couverte autour du joueur (m)
    smoke: { rate: 1, burst: 1, size: 1, trail: 1 },        // fumée : cadence, éclats d'explosion, taille des nuages, espacement des traînées d'avion
    fpsCap: 0,                                              // 0 = pas de plafond
    war: 0.65,                                              // intensité de la guerre de fond (combats lointains, obus, rafales) : 1 = tout (réduit d'un cran : 0,65)
  },
  mobile: {
    name: 'mobile', maxPixelRatio: 1.5, antialias: false, powerPreference: 'default',
    shadowMap: 1024, shadowExtent: 22,
    smoke: { rate: 0.55, burst: 0.6, size: 1.1, trail: 2 },
    fpsCap: 30,
    war: 0.45,
  },
  mobile_low: {
    name: 'mobile_low', maxPixelRatio: 1.25, antialias: false, powerPreference: 'default',
    shadowMap: 0, shadowExtent: 22,
    smoke: { rate: 0.4, burst: 0.45, size: 1.15, trail: 3 },
    fpsCap: 30,
    war: 0.3,
  },
};

/** env : { coarse (écran tactile principal), ua (identité du navigateur), memory (Go, si connu), cores } → 'desktop' | 'mobile' | 'mobile_low'. */
export function detectProfile(env = {}) {
  const mobile = !!env.coarse || /Android|iPhone|iPad|iPod|Mobile/i.test(env.ua ?? '');
  if (!mobile) return 'desktop';
  const weak = (typeof env.memory === 'number' && env.memory <= 3) || (typeof env.cores === 'number' && env.cores > 0 && env.cores <= 4);
  return weak ? 'mobile_low' : 'mobile';
}

/** Choix final : l'adresse (?perf=) l'emporte, puis le réglage du joueur ('eco' = profil mobile, 'max' = profil ordinateur, 'auto' = détection). */
export function resolveProfile(perf, env, urlPerf = null) {
  const choice = ['auto', 'eco', 'max'].includes(urlPerf) ? urlPerf : (perf ?? 'auto');
  if (choice === 'eco') return detectProfile(env) === 'mobile_low' ? 'mobile_low' : 'mobile';
  if (choice === 'max') return 'desktop';
  return detectProfile(env);
}

export const settingsFor = (name) => PROFILES[name] ?? PROFILES.desktop;
