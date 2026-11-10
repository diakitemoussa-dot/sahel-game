// Effets sonores du jeu : lecture des sons de sfxsynth.js, placés dans l'espace (volume, gauche/droite, étouffement, retard).
// Le navigateur n'autorise le son qu'après un geste du joueur (clic, touche) : le contexte audio est créé et réveillé à ce moment.
import { SYNTH, startWind, noiseBuffer } from './sfxsynth.js';
import { spatial } from './sfxlogic.js';
import { dopplerRatio, radialSpeed } from './aircraftlogic.js';

const WIND_LEVEL = 0.07;                              // volume du vent du désert (0,16 au début : trop fort)
// volume des appareils volants (augmenté : ~3,5 fois plus fort qu'avant) ; ref = distance où le son est à pleine force, max = portée (m)
const HELI_GAIN = 1.15, JET_GAIN = 1.05;
const HELI_EAR = { ref: 45, max: 650 }, JET_EAR = { ref: 140, max: 1300 };
const MIN_GAP = { step: 0, ui_move: 0.03 };            // secondes minimum entre deux fois le même son (les autres : 0,035)

/** Voix continue d'un appareil qui bouge (hélicoptère : battement du rotor ; avion : rugissement + sifflement avec effet Doppler).
 *  Les nœuds audio ne sont créés qu'au premier appel de update() quand le son est autorisé ; update(null, null, 0) coupe le volume. */
class Voice {
  constructor(sfx, kind) { this.sfx = sfx; this.kind = kind; this.g = null; this.dead = false; }
  _build() {
    const sfx = this.sfx, ctx = sfx.ctx, heli = this.kind === 'heli';
    const g = this.g = { srcs: [], oscs: [], t0: ctx.currentTime };
    const noise = (rate = 1) => { const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx); n.loop = true; n.playbackRate.value = rate; n.start(0, Math.random() * 1.5); g.srcs.push(n); return n; };
    const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const gain = (v) => { const x = ctx.createGain(); x.gain.value = v; return x; };
    g.out = gain(0); g.air = filt('lowpass', 8000, 0.5); g.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    g.out.connect(g.air); if (g.pan) { g.air.connect(g.pan); g.pan.connect(sfx.master); } else g.air.connect(sfx.master);
    if (heli) {
      const thump = gain(0.5), n1 = noise(), f1 = filt('lowpass', 520);                  // battement des pales : bruit grave dont le volume pulse
      n1.connect(f1); f1.connect(thump); thump.connect(g.out);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 12.5; lfo.type = 'sine'; const lg = gain(0.5); lfo.connect(lg); lg.connect(thump.gain); lfo.start(); g.oscs.push(lfo);
      const n2 = noise(), f2 = filt('lowpass', 150); const rg = gain(0.6); n2.connect(f2); f2.connect(rg); rg.connect(g.out);   // grondement du moteur
      const w = ctx.createOscillator(); w.type = 'sine'; w.frequency.value = 360; g.whine = w; g.base = 360; const wg = gain(0.025); w.connect(wg); wg.connect(g.out); w.start(); g.oscs.push(w);
      g.level = 0.9;
    } else {
      const n1 = noise(), f1 = filt('bandpass', 950, 0.6), a1 = gain(0.5); n1.connect(f1); f1.connect(a1); a1.connect(g.out);      // souffle des réacteurs
      const n2 = noise(), f2 = filt('lowpass', 230), a2 = gain(1.0); n2.connect(f2); f2.connect(a2); a2.connect(g.out);             // rugissement grave
      const w = ctx.createOscillator(); w.type = 'sawtooth'; w.frequency.value = 420; g.whine = w; g.base = 420; const wf = filt('lowpass', 1400); const wg = gain(0.035); w.connect(wf); wf.connect(wg); wg.connect(g.out); w.start(); g.oscs.push(w);
      g.level = 1.5;
    }
    g.noises = g.srcs;
  }
  /** pos, vel : { x, z } (y ignoré) ; vol : 0..1 (0 = muet). */
  update(pos, vel, vol = 1) {
    const sfx = this.sfx;
    if (this.dead) return;
    if (!sfx.enabled || sfx.away) return;
    if (!pos || vol <= 0) { if (this.g) this.g.out.gain.setTargetAtTime(0, sfx.ctx.currentTime, 0.1); return; }
    if (!sfx.unlock() || sfx.ctx.state !== 'running') return;
    if (!this.g) this._build();
    const g = this.g, now = sfx.ctx.currentTime, heli = this.kind === 'heli';
    const s = spatial(sfx.listener, sfx.yaw, pos, heli ? HELI_EAR : JET_EAR);
    g.out.gain.setTargetAtTime(s.gain * vol * g.level * (heli ? HELI_GAIN : JET_GAIN), now, 0.08);
    g.air.frequency.setTargetAtTime(Math.max(2200, s.lowpass), now, 0.1);          // un appareil puissant reste net même de loin
    if (g.pan) g.pan.pan.setTargetAtTime(s.pan, now, 0.08);
    const r = dopplerRatio(vel ? radialSpeed(pos, vel, sfx.listener) : 0);                // plus aigu en approche, plus grave en s'éloignant
    g.whine.frequency.setTargetAtTime(g.base * r, now, 0.08);
    for (const n of g.noises) n.playbackRate.setTargetAtTime(r, now, 0.08);
  }
  stop() {
    this.dead = true;
    const g = this.g, sfx = this.sfx;
    if (!g || !sfx.ctx) return;
    g.out.gain.setTargetAtTime(0, sfx.ctx.currentTime, 0.15);
    setTimeout(() => { for (const n of [...g.srcs, ...g.oscs]) { try { n.stop(); } catch { /* déjà arrêté */ } } }, 900);
  }
}

export class Sfx {
  /** volume : 0..1 ; enabled : faux = aucun son (test automatique) mais les appels sont comptés. */
  constructor({ volume = 0.8, enabled = true } = {}) {
    this.enabled = enabled; this.volume = volume;
    this.ctx = null; this.master = null; this.wind = null; this.windOn = false;
    this.listener = { x: 0, z: 0 }; this.yaw = 0;
    this.count = {};                                    // nombre de fois que chaque son a été demandé (pour les tests)
    this.last = {};
    this.rng = Math.random;
  }

  /** Crée / réveille le contexte audio ; à appeler depuis un geste du joueur. Renvoie vrai si le son peut jouer. */
  unlock() {
    if (!this.enabled || this.away) return false;
    try {
      if (!this.ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) { this.enabled = false; return false; }
        this.ctx = new AC();
        const comp = this.ctx.createDynamicsCompressor();           // évite la saturation quand plusieurs sons se superposent
        comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
        this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
        this.master.connect(comp); comp.connect(this.ctx.destination);
        this._syncWind();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume?.().catch?.(() => {});
    } catch { return false; }
    return this.ctx.state === 'running';
  }

  /** Voix continue suivie dans l'espace : kind 'heli' ou 'jet'. L'appel est compté (pour les tests) même sans son. */
  voice(kind) { this.count[`voice_${kind}`] = (this.count[`voice_${kind}`] || 0) + 1; return new Voice(this, kind); }

  /** Fenêtre quittée : tout le son s'arrête (les sons déjà lancés sont figés, ils reprendront au retour). */
  suspend() { this.away = true; try { this.ctx?.suspend?.(); } catch { /* rien */ } }
  resume() { this.away = false; try { if (this.ctx) this.ctx.resume?.().catch?.(() => {}); } catch { /* rien */ } }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
  }
  /** Position et direction du regard de celui qui écoute (la caméra). */
  setListener(pos, yaw) { this.listener.x = pos.x; this.listener.z = pos.z; this.yaw = yaw; }

  /** Joue un son. o : { pos (point du monde : placé dans l'espace), vol (0..1), rate, ear ({ ref, max } : portée du son, par défaut 6 et 140 m) }. */
  play(name, o = {}) {
    this.count[name] = (this.count[name] || 0) + 1;
    if (!this.enabled || !SYNTH[name]) return false;
    if (!this.unlock() || !this.ctx || this.ctx.state !== 'running') return false;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] ?? -1) < (MIN_GAP[name] ?? 0.035)) return false;
    this.last[name] = now;
    let vol = o.vol ?? 1, pan = 0, lp = 0, delay = 0;
    if (o.pos) {
      const s = spatial(this.listener, this.yaw, o.pos, o.ear);
      if (s.gain < 0.01) return false;
      vol *= s.gain; pan = s.pan; lp = s.lowpass; delay = s.delay;
    }
    const ctx = this.ctx;
    let node = ctx.createGain(); node.gain.value = vol;
    const first = node;
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; node.connect(p); node = p; }
    node.connect(this.master);
    SYNTH[name](ctx, first, now + 0.005 + delay, { r: this.rng() });
    return true;
  }

  /** Vent du désert en fond (arrêté pendant la vidéo d'intro, qui a sa propre bande son). */
  setAmbient(on) { if (on === this.windOn && (this.wind || !this.ctx)) return; this.windOn = on; this._syncWind(); }
  _syncWind() {
    if (!this.ctx || !this.master) return;
    if (this.windOn && !this.wind) this.wind = startWind(this.ctx, this.master);
    if (this.wind) this.wind.gain.setTargetAtTime(this.windOn ? WIND_LEVEL : 0.0, this.ctx.currentTime, 0.6);
  }
}
