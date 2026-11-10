// Effets sonores fabriqués par calcul (aucun fichier audio) avec l'API Web Audio.
// Chaque son est une fonction (ctx, out, t, p) : ctx = contexte audio (réel ou « hors ligne » pour les tests), out = nœud de sortie,
// t = instant de départ, p = { r : nombre au hasard 0..1 pour varier un peu chaque son }.
// Les fonctions renvoient la durée du son (s).

const noiseCache = new WeakMap();
export function noiseBuffer(ctx) { return noiseBuf(ctx); }
function noiseBuf(ctx) {
  let b = noiseCache.get(ctx);
  if (!b) {
    const n = Math.floor(ctx.sampleRate * 2);
    b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let s = 12345;                                             // générateur simple : même bruit à chaque fois
    for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
    noiseCache.set(ctx, b);
  }
  return b;
}

/** Souffle de bruit filtré dont la fréquence glisse de f0 à f1, avec une enveloppe qui retombe. */
function burst(ctx, out, t, { dur = 0.1, type = 'lowpass', f0 = 800, f1 = f0, q = 0.8, gain = 0.5, attack = 0.002, offset = 0 }) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf(ctx);
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(out);
  src.start(t, offset); src.stop(t + dur + 0.05);
}

/** Note (ou coup sourd) dont la hauteur glisse de f0 à f1. */
function tone(ctx, out, t, { dur = 0.1, type = 'sine', f0 = 400, f1 = f0, gain = 0.4, attack = 0.002 }) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}

/** Suite de bruits de manipulation d'arme. Chaque ligne : ['clack', instant, fréquence, force, grave] (déclic métallique),
 *  ['slide', instant, durée, fréquence départ, fréquence fin, force] (frottement) ou ['thump', instant, force] (chute sourde). */
function reloadFx(ctx, out, t, events) {
  for (const [kind, at, a, b, c, d] of events) {
    const tt = t + at;
    if (kind === 'clack') {
      burst(ctx, out, tt, { dur: 0.04, type: 'bandpass', f0: a, f1: a * 0.6, q: 3.5, gain: b });
      tone(ctx, out, tt, { dur: 0.03, type: 'square', f0: a * 0.5, f1: a * 0.35, gain: b * 0.22 });
      if (c) tone(ctx, out, tt, { dur: 0.09, f0: c, f1: c * 0.55, gain: b * 0.5 });
    } else if (kind === 'slide') {
      burst(ctx, out, tt, { dur: a, type: 'bandpass', f0: b, f1: c, q: 1.2, gain: d, attack: a * 0.4, offset: at });
    } else if (kind === 'thump') {
      tone(ctx, out, tt, { dur: 0.12, f0: 90, f1: 45, gain: 0.35 * a });
      burst(ctx, out, tt, { dur: 0.08, type: 'lowpass', f0: 500, f1: 200, gain: 0.3 * a, offset: 0.5 });
    }
  }
}

export const SYNTH = {
  // ------------------------------------------------------------------ armes
  rifle(ctx, out, t, p = {}) {
    const r = p.r ?? 0.5;
    burst(ctx, out, t, { dur: 0.05, type: 'highpass', f0: 2200 + r * 800, gain: 0.55, q: 0.5 });                   // claquement sec
    burst(ctx, out, t, { dur: 0.24, type: 'lowpass', f0: 1400, f1: 260, gain: 0.8, q: 0.6, offset: r });            // corps du coup
    tone(ctx, out, t, { dur: 0.2, f0: 140 + r * 20, f1: 42, gain: 0.7 });                                            // coup sourd dans la poitrine
    burst(ctx, out, t + 0.03, { dur: 0.7, type: 'lowpass', f0: 500, f1: 150, gain: 0.16, q: 0.4, offset: 1 });       // écho dans le désert
    return 0.8;
  },
  pistol(ctx, out, t, p = {}) {
    const r = p.r ?? 0.5;
    burst(ctx, out, t, { dur: 0.04, type: 'highpass', f0: 3000 + r * 800, gain: 0.5, q: 0.5 });
    burst(ctx, out, t, { dur: 0.15, type: 'lowpass', f0: 2000, f1: 500, gain: 0.7, q: 0.6, offset: r });
    tone(ctx, out, t, { dur: 0.12, f0: 200, f1: 70, gain: 0.5 });
    burst(ctx, out, t + 0.02, { dur: 0.45, type: 'lowpass', f0: 700, f1: 200, gain: 0.1, q: 0.4, offset: 1.4 });
    return 0.55;
  },
  whiz(ctx, out, t, p = {}) {                                   // balle qui siffle tout près
    burst(ctx, out, t, { dur: 0.16, type: 'bandpass', f0: 4200, f1: 1400 + (p.r ?? 0) * 400, q: 2.5, gain: 0.45, attack: 0.03 });
    return 0.2;
  },
  impact_dust(ctx, out, t, p = {}) {                            // balle dans le sable
    burst(ctx, out, t, { dur: 0.13, type: 'bandpass', f0: 1500, f1: 600, q: 0.9, gain: 0.45, offset: (p.r ?? 0) * 1.5 });
    tone(ctx, out, t, { dur: 0.05, f0: 260, f1: 120, gain: 0.18 });
    return 0.15;
  },
  impact_flesh(ctx, out, t, p = {}) {                           // balle ou coup qui touche un corps
    tone(ctx, out, t, { dur: 0.13, f0: 110 + (p.r ?? 0) * 25, f1: 48, gain: 0.55 });
    burst(ctx, out, t, { dur: 0.09, type: 'lowpass', f0: 900, f1: 300, gain: 0.45, offset: 0.8 });
    return 0.15;
  },
  // ------------------------------------------------------------------ retours du jeu
  hit_tick(ctx, out, t) { tone(ctx, out, t, { dur: 0.06, f0: 1900, f1: 1500, gain: 0.22 }); return 0.07; },
  kill(ctx, out, t) {
    tone(ctx, out, t, { dur: 0.08, f0: 1300, f1: 1100, gain: 0.25 });
    tone(ctx, out, t + 0.07, { dur: 0.14, f0: 760, f1: 520, gain: 0.28 });
    return 0.25;
  },
  hurt(ctx, out, t, p = {}) {                                   // le joueur est touché : souffle + choc grave
    tone(ctx, out, t, { dur: 0.3, type: 'sawtooth', f0: 170 - (p.r ?? 0) * 25, f1: 85, gain: 0.16 });
    burst(ctx, out, t, { dur: 0.18, type: 'lowpass', f0: 700, f1: 200, gain: 0.5, offset: 0.4 });
    tone(ctx, out, t, { dur: 0.16, f0: 90, f1: 40, gain: 0.5 });
    return 0.35;
  },
  death(ctx, out, t) {
    tone(ctx, out, t, { dur: 0.7, f0: 80, f1: 28, gain: 0.7 });
    burst(ctx, out, t, { dur: 0.5, type: 'lowpass', f0: 600, f1: 90, gain: 0.5, offset: 0.2 });
    return 0.8;
  },
  // ------------------------------------------------------------------ mouvements
  step(ctx, out, t, p = {}) {                                   // pas dans le sable
    const r = p.r ?? 0.5;
    burst(ctx, out, t, { dur: 0.13, type: 'lowpass', f0: 900 + r * 500, f1: 280, q: 0.5, gain: 0.5, attack: 0.012, offset: r * 1.5 });
    burst(ctx, out, t + 0.03, { dur: 0.1, type: 'bandpass', f0: 2600, f1: 1500, q: 0.7, gain: 0.07, attack: 0.01, offset: 1 });   // grains
    return 0.2;
  },
  land(ctx, out, t) {
    burst(ctx, out, t, { dur: 0.22, type: 'lowpass', f0: 800, f1: 150, gain: 0.7, attack: 0.006 });
    tone(ctx, out, t, { dur: 0.16, f0: 75, f1: 38, gain: 0.5 });
    return 0.25;
  },
  // Recharges : les bruits suivent l'animation (instants mesurés sur « Rifle Reload », jouée à 1,6 pour le fusil et 1,9 pour le pistolet) :
  // déclic du chargeur, chargeur qui glisse et tombe, nouveau chargeur qui entre, culasse tirée puis relâchée.
  reload_rifle(ctx, out, t) {
    reloadFx(ctx, out, t, [
      ['clack', 0.30, 1500, 0.55, 160],                  // bouton du chargeur
      ['slide', 0.45, 0.35, 900, 400, 0.18],             // le chargeur glisse hors de l'arme
      ['clack', 0.84, 900, 0.35, 0],                     // il se détache
      ['thump', 0.97, 1],                                // il tombe dans le sable
      ['slide', 1.10, 0.18, 400, 900, 0.16],             // le nouveau chargeur remonte
      ['clack', 1.28, 1300, 0.7, 200],                   // il s'enclenche
      ['slide', 1.50, 0.15, 1200, 2400, 0.12], ['clack', 1.52, 2200, 0.5, 0],     // culasse tirée
      ['clack', 1.78, 1000, 0.75, 140],                  // culasse relâchée : chargé
      ['slide', 1.98, 0.05, 3000, 3000, 0.1],            // cliquetis de la sangle
    ]);
    return 2.3;
  },
  reload_pistol(ctx, out, t) {
    reloadFx(ctx, out, t, [
      ['clack', 0.26, 2300, 0.45, 220],
      ['slide', 0.38, 0.22, 1400, 700, 0.13],
      ['clack', 0.62, 1600, 0.3, 0],
      ['thump', 0.74, 0.6],
      ['slide', 0.90, 0.12, 700, 1400, 0.12],
      ['clack', 1.06, 2000, 0.6, 260],
      ['slide', 1.26, 0.1, 2000, 3500, 0.1], ['clack', 1.28, 3000, 0.4, 0],     // culasse tirée
      ['clack', 1.48, 1800, 0.65, 200],                                         // relâchée
    ]);
    return 1.9;
  },
  switch(ctx, out, t) {                                         // changement d'arme
    burst(ctx, out, t, { dur: 0.04, type: 'bandpass', f0: 1500, f1: 900, q: 2, gain: 0.4 });
    burst(ctx, out, t + 0.09, { dur: 0.05, type: 'bandpass', f0: 2100, f1: 1200, q: 2, gain: 0.35 });
    return 0.2;
  },
  punch(ctx, out, t) {
    burst(ctx, out, t, { dur: 0.14, type: 'bandpass', f0: 500, f1: 1400, q: 0.8, gain: 0.2, attack: 0.06 });           // souffle du bras
    tone(ctx, out, t + 0.1, { dur: 0.1, f0: 120, f1: 55, gain: 0.5 });
    burst(ctx, out, t + 0.1, { dur: 0.07, type: 'lowpass', f0: 900, f1: 300, gain: 0.4, offset: 1.1 });
    return 0.25;
  },
  kick(ctx, out, t) {
    burst(ctx, out, t, { dur: 0.2, type: 'bandpass', f0: 400, f1: 1200, q: 0.7, gain: 0.25, attack: 0.09 });
    tone(ctx, out, t + 0.14, { dur: 0.14, f0: 95, f1: 40, gain: 0.6 });
    burst(ctx, out, t + 0.14, { dur: 0.09, type: 'lowpass', f0: 800, f1: 250, gain: 0.4, offset: 0.6 });
    return 0.35;
  },
  // ------------------------------------------------------------------ champ de bataille
  explosion(ctx, out, t, p = {}) {                              // missile qui éclate : coup sourd, souffle, craquement, grondement, débris
    tone(ctx, out, t, { dur: 1.7, f0: 95, f1: 26, gain: 0.5 });
    burst(ctx, out, t, { dur: 1.5, type: 'lowpass', f0: 1100, f1: 90, gain: 0.5, q: 0.5, offset: (p.r ?? 0) * 0.5 });
    burst(ctx, out, t, { dur: 0.09, type: 'highpass', f0: 2400, gain: 0.3, q: 0.5 });
    burst(ctx, out, t + 0.05, { dur: 3.0, type: 'lowpass', f0: 260, f1: 60, gain: 0.26, q: 0.4, offset: 1 });
    [0.4, 0.7, 1.1, 1.6].forEach((at, i) => burst(ctx, out, t + at, { dur: 0.08, type: 'bandpass', f0: 1400 - i * 200, f1: 600, q: 1.5, gain: 0.1, offset: i }));
    return 3.2;
  },
  missile(ctx, out, t) {                                        // missile qui passe : sifflement qui monte, grondement du moteur
    burst(ctx, out, t, { dur: 1.7, type: 'bandpass', f0: 500, f1: 2400, q: 0.9, gain: 0.26, attack: 0.9 });
    burst(ctx, out, t, { dur: 2.4, type: 'lowpass', f0: 360, f1: 240, gain: 0.2, attack: 0.8, offset: 0.7 });
    tone(ctx, out, t, { dur: 2.0, type: 'sawtooth', f0: 90, f1: 150, gain: 0.04, attack: 0.9 });
    return 2.6;
  },
  crackle(ctx, out, t, p = {}) {                                // crépitement du feu
    const r = p.r ?? 0.5;
    burst(ctx, out, t, { dur: 0.16, type: 'lowpass', f0: 900, f1: 300, gain: 0.12, offset: r * 1.5 });
    [0, 0.05 + r * 0.04, 0.12 + r * 0.05].forEach((at, i) => burst(ctx, out, t + at, { dur: 0.03, type: 'bandpass', f0: 2500 + i * 900 + r * 800, f1: 1500, q: 2, gain: 0.22, offset: i * 0.3 }));
    return 0.3;
  },
  // ------------------------------------------------------------------ menu
  ui_move(ctx, out, t) { tone(ctx, out, t, { dur: 0.05, f0: 720, f1: 640, gain: 0.12 }); return 0.06; },
  ui_ok(ctx, out, t) { tone(ctx, out, t, { dur: 0.05, f0: 520, f1: 600, gain: 0.16 }); tone(ctx, out, t + 0.05, { dur: 0.08, f0: 780, f1: 900, gain: 0.16 }); return 0.14; },
  ui_back(ctx, out, t) { tone(ctx, out, t, { dur: 0.09, f0: 620, f1: 360, gain: 0.15 }); return 0.1; },
  ui_start(ctx, out, t) {                                       // JOUER / COMMENCER : accord qui monte, avec un coup grave
    [196, 294, 392].forEach((f, i) => tone(ctx, out, t + i * 0.06, { dur: 0.5, type: 'triangle', f0: f, f1: f * 1.01, gain: 0.14 }));
    tone(ctx, out, t, { dur: 0.35, f0: 100, f1: 50, gain: 0.45 });
    return 0.6;
  },
};

export const SOUND_NAMES = Object.keys(SYNTH);

/** Ambiance : vent du désert en boucle (bruit filtré dont le volume et la tonalité ondulent doucement). Renvoie { gain, stop() }. */
export function startWind(ctx, out) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf(ctx); src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6;
  const g = ctx.createGain(); g.gain.value = 0.0;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
  const lg = ctx.createGain(); lg.gain.value = 0.35;                      // les rafales : le volume varie de ±35 %
  const lf = ctx.createGain(); lf.gain.value = 160;                       // et la tonalité de ±160 Hz
  lfo.connect(lg); lg.connect(g.gain); lfo.connect(lf); lf.connect(f.frequency);
  src.connect(f); f.connect(g); g.connect(out);
  src.start(); lfo.start();
  return { gain: g.gain, stop() { try { src.stop(); lfo.stop(); } catch { /* déjà arrêté */ } } };
}

/** Pour les tests : fabrique chaque son hors ligne et mesure son niveau. Renvoie { nom: { peak, rms, seconds } }. */
export async function renderAll(OfflineCtx = globalThis.OfflineAudioContext, rate = 22050) {
  const res = {};
  for (const name of SOUND_NAMES) {
    const ctx = new OfflineCtx(1, rate * 2, rate);
    const dur = SYNTH[name](ctx, ctx.destination, 0.01, { r: 0.5 });
    const buf = await ctx.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0, sum = 0;
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; }
    res[name] = { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4), seconds: dur };
  }
  return res;
}
