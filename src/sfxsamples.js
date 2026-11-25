// Sons de tir enregistrés (le fichier « tire.mp3 » du joueur, découpé coup par coup dans assets/sounds/) : ils remplacent les sons fabriqués par calcul pour le fusil et le pistolet.
// Sept coups différents plus un coup à longue résonance (l'écho du dernier tir d'une rafale) : en les tirant au hasard, une rafale ne répète pas toujours le même bruit.
// Tant qu'ils ne sont pas chargés (ou s'ils manquent), les sons fabriqués par calcul de sfxsynth.js servent de secours.
import { ASSET_VERSION } from './version.js';

const SHOTS = ['tir_1', 'tir_2', 'tir_3', 'tir_4', 'tir_5', 'tir_6', 'tir_7'];

/** Pour chaque son du jeu : les fichiers, la chance de jouer le coup à longue résonance, la plage de vitesse de lecture (la hauteur varie un peu), le volume. */
export const SAMPLES = {
  rifle: { shots: SHOTS, long: 'tir_long', longChance: 0.12, rate: [0.97, 1.03], vol: 1 },
  pistol: { shots: SHOTS, long: 'tir_long', longChance: 0.1, rate: [1.18, 1.3], vol: 0.85 },        // plus aigu et un peu plus discret qu'un fusil
};

/** Choisit un coup. r1, r2 : nombres au hasard entre 0 et 1. Renvoie { name (fichier), rate }. */
export function pickSample(def, r1 = Math.random(), r2 = Math.random()) {
  const name = r1 < def.longChance ? def.long : def.shots[Math.min(def.shots.length - 1, Math.floor(((r1 - def.longChance) / (1 - def.longChance)) * def.shots.length))];
  return { name, rate: def.rate[0] + (def.rate[1] - def.rate[0]) * r2 };
}

/** Charge et décode tous les fichiers. Renvoie { fichier: AudioBuffer } ; un fichier absent est simplement ignoré. */
export async function loadSamples(ctx, base = 'assets/sounds') {
  const names = [...new Set(Object.values(SAMPLES).flatMap((d) => [...d.shots, d.long]))];
  const out = {};
  await Promise.all(names.map(async (n) => {
    try {
      const r = await fetch(`${base}/${n}.wav?v=${ASSET_VERSION}`);
      if (!r.ok) return;
      out[n] = await ctx.decodeAudioData(await r.arrayBuffer());
    } catch (e) { console.warn(`son de tir ${n} non chargé`, e); }
  }));
  return out;
}
