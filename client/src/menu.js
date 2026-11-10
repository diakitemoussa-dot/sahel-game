// Menu du jeu (affichage et commandes) : écran d'accueil, vidéo d'introduction, menu principal, options, crédits, pause.
// La logique des écrans et des réglages est dans menustate.js (testée). Ici : le HTML, la vidéo et le clavier.
import { MenuFlow, loadOptions, saveOptions, sanitizeOptions, volumeOf, QUALITES } from './menustate.js';
import { ASSET_VERSION } from './version.js';

const ASSET = (f) => `assets/video/${f}?v=${ASSET_VERSION}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class GameMenu {
  /** hooks : { onPlay(), onResume(), onQuit(), onOptions(options), onTenues(), wardrobeOpen(), sens: { get(), set(v) } } ; testing : pas de menu (le jeu démarre tout de suite). */
  constructor({ testing = false, storage = null, hooks = {} } = {}) {
    this.hooks = hooks; this.storage = storage; this.testing = testing;
    this.flow = new MenuFlow(testing ? 'playing' : 'splash');
    this.options = loadOptions(storage);
    this.root = document.createElement('div'); this.root.id = 'gm';
    this.root.innerHTML = this._html();
    document.body.appendChild(this.root);
    this.video = this.root.querySelector('.gm-video');
    this.video.addEventListener('ended', () => this._introDone());
    this.video.addEventListener('error', () => { if (this.flow.state === 'intro') this._introDone(); });
    this.root.addEventListener('click', (e) => this._click(e));
    this.root.addEventListener('mouseover', (e) => { const b = e.target.closest('.gm-btn, .gm-seg, .gm-sw'); if (b && b !== this._hover) { this._hover = b; this._sfx('ui_move'); } });
    this.root.addEventListener('input', (e) => this._input(e));
    addEventListener('keydown', (e) => this._key(e));
    this._applyOptions(false);
    this.render();
  }

  get state() { return this.flow.state; }

  // ---------------------------------------------------------------------------------------- HTML
  _html() {
    const logo = ASSET('logo_fennec.png');
    const o = this.options, sens = this.hooks.sens?.get?.() ?? 1;
    const seg = (name, values, cur) => values.map(([v, l]) => `<button class="gm-seg${cur === v ? ' on' : ''}" data-act="set" data-key="${name}" data-val="${v}">${l}</button>`).join('');
    const sw = (name, label, on) => `<div class="gm-row"><span>${label}</span><button class="gm-sw${on ? ' on' : ''}" data-act="toggle" data-key="${name}" aria-pressed="${on}"><i></i></button></div>`;
    return `
<video class="gm-video" playsinline preload="auto" poster="${ASSET('intro_poster.jpg')}"></video>
<section class="gm-screen gm-splash" data-screen="splash">
  <img class="gm-logo" src="${logo}" alt="">
  <h1>SAHEL GAME</h1><p class="gm-sub">IR GANDA · L'OMBRE D'ARTEX</p>
  <button class="gm-start" data-act="start" disabled>Chargement du monde…</button>
  <p class="gm-tip">Appuyez sur <b>A</b> / <b>Croix</b> (manette) ou cliquez · pour le son, mettez des écouteurs</p>
</section>
<section class="gm-screen gm-intro" data-screen="intro">
  <button class="gm-skip gm-sound" data-act="sound" hidden>🔊 Activer le son <small>Carré</small></button>
  <button class="gm-skip" data-act="skip">Passer ▸ <small>Espace · A</small></button>
</section>
<section class="gm-screen gm-main" data-screen="main">
  <div class="gm-col">
    <img class="gm-logo small" src="${logo}" alt=""><h1>SAHEL GAME</h1><p class="gm-sub">IR GANDA · L'OMBRE D'ARTEX</p>
    <nav class="gm-nav">
      <button class="gm-btn primary" data-act="play">JOUER</button>
      <button class="gm-btn" data-act="tenues">TENUES</button>
      <button class="gm-btn" data-act="options">OPTIONS</button>
      <button class="gm-btn" data-act="intro">REVOIR L'INTRO</button>
      <button class="gm-btn" data-act="credits">CRÉDITS</button>
    </nav>
    <p class="gm-ver">Glisser la souris ou stick droit : tourner autour du personnage · molette : zoom<br>↑ ↓ ou croix pour choisir · Entrée ou A pour valider · Échap ou B pour revenir</p>
  </div>
</section>
<section class="gm-screen gm-pause" data-screen="pause">
  <div class="gm-col">
    <h1 class="mid">PAUSE</h1>
    <nav class="gm-nav">
      <button class="gm-btn primary" data-act="resume">REPRENDRE</button>
      <button class="gm-btn" data-act="tenues">TENUES</button>
      <button class="gm-btn" data-act="options">OPTIONS</button>
      <button class="gm-btn" data-act="quit">QUITTER AU MENU</button>
    </nav>
  </div>
</section>
<section class="gm-screen gm-panelwrap" data-screen="options">
  <div class="gm-panel">
    <h2>OPTIONS</h2>
    <div class="gm-row"><span>Volume (intro et effets)</span><span class="gm-ctl"><input type="range" min="0" max="100" step="5" value="${o.volume}" data-key="volume"><b data-out="volume">${o.volume} %</b></span></div>
    <div class="gm-row"><span>Sensibilité du viseur</span><span class="gm-ctl"><input type="range" min="30" max="250" step="10" value="${Math.round(sens * 100)}" data-key="sens"><b data-out="sens">${Math.round(sens * 100)} %</b></span></div>
    <div class="gm-row"><span>Qualité de l'image</span><span class="gm-ctl">${seg('qualite', Object.keys(QUALITES).map((k) => [k, k[0].toUpperCase() + k.slice(1)]), o.qualite)}</span></div>
    <div class="gm-row"><span>Performances <small class="gm-hint">Auto s'adapte à l'appareil</small></span><span class="gm-ctl">${seg('perf', [['auto', 'Auto'], ['eco', 'Économie'], ['max', 'Maximum']], o.perf)}</span></div>
    ${sw('radar', 'Carte de repérage (radar)', o.radar)}
    ${sw('aide', 'Aide des touches à l\'écran', o.aide)}
    ${sw('sang', 'Effets de sang', o.sang)}
    <div class="gm-row"><span>Affichage</span><span class="gm-ctl"><button class="gm-seg" data-act="fullscreen">Plein écran</button></span></div>
    <div class="gm-actions"><button class="gm-btn primary" data-act="back">RETOUR</button></div>
  </div>
</section>
<section class="gm-screen gm-panelwrap" data-screen="credits">
  <div class="gm-panel">
    <h2>CRÉDITS</h2>
    <p class="gm-cr"><b>SAHEL GAME</b><br>Un jeu d'action coopératif dans le Sahel d'Ir Ganda.</p>
    <p class="gm-cr">Histoire, direction et modèles : le studio<br>Personnage, véhicule et décors modélisés avec Blender<br>Moteur : three.js · Animations : Mixamo</p>
    <p class="gm-cr">Toute ressemblance avec des forces armées ou des événements réels est fortuite : Ir Ganda, Artex et la milice sont fictifs.</p>
    <div class="gm-actions"><button class="gm-btn primary" data-act="back">RETOUR</button></div>
  </div>
</section>`;
  }

  // ---------------------------------------------------------------------------------------- affichage
  render() {
    const s = this.flow.state;
    this.root.dataset.state = s;
    this.root.classList.toggle('gm-hidden', s === 'playing' || s === 'tenues');
    document.body.classList.toggle('gm-menu', this.flow.active);
    document.body.classList.toggle('gm-no-radar', !this.options.radar);
    document.body.classList.toggle('gm-no-aide', !this.options.aide);
    for (const sec of this.root.querySelectorAll('.gm-screen')) sec.classList.toggle('on', sec.dataset.screen === s);
    this.root.classList.toggle('gm-video-on', s === 'intro');
    if (s === 'intro') this._playIntro(); else this._stopIntro();
    const start = this.root.querySelector('.gm-start');
    if (start) { start.disabled = !this.flow.loaded; start.textContent = this.flow.loaded ? 'COMMENCER' : 'Chargement du monde…'; }
    this._focusFirst();
  }

  _focusFirst() {
    const sec = this.root.querySelector('.gm-screen.on');
    if (!sec || this.root.classList.contains('gm-hidden')) return;
    const b = sec.querySelector('.gm-btn.primary, .gm-start:not(:disabled), .gm-btn, .gm-skip');
    b?.focus({ preventScroll: true });
  }

  _playIntro() {
    const v = this.video;
    if (!v.getAttribute('src')) v.src = ASSET('intro.mp4');
    v.volume = volumeOf(this.options); v.muted = false; this._soundBtn(false);
    try { v.currentTime = 0; } catch { /* la vidéo n'est pas encore prête : elle partira du début */ }
    const p = v.play();
    if (p?.catch) p.catch(() => { v.muted = true; this._soundBtn(true); v.play().catch(() => this._introDone()); });      // son refusé : on joue sans son, avec un bouton pour l'activer      // son refusé : on joue sans son ; vidéo impossible : on passe
  }
  _soundBtn(show) { const b = this.root.querySelector('.gm-sound'); if (b) b.hidden = !show; }
  _unmute() { this.video.muted = false; this.video.volume = volumeOf(this.options); this._soundBtn(false); }
  _stopIntro() { try { this.video.pause(); } catch { /* rien */ } }
  _introDone() { if (this.flow.state === 'intro') { this.flow.skipIntro(); this.render(); } }

  // ---------------------------------------------------------------------------------------- commandes
  /** Va à un écran (appelé par les boutons et par les tests). */
  go(screen) {
    this.flow.go(screen); this.render();
    if (screen === 'tenues') this.hooks.onTenues?.();
  }
  open(screen) { return this.go(screen); }
  setLoaded() { this.flow.setLoaded(); this.render(); }
  /** Appelé à chaque image : au retour du choix de tenue (menu fermé), on revient à l'écran d'où l'on venait. */
  update() {
    if (this.flow.state === 'tenues' && !this.hooks.wardrobeOpen?.()) { this.flow.back(); this.render(); }
  }
  /** Reprise automatique après un retour dans la fenêtre. */
  resumeGame() { if (this.flow.resume()) { this.render(); return true; } return false; }
  /** Fenêtre quittée / retrouvée : la vidéo d'intro s'arrête et repart. */
  suspendMedia() { if (this.flow.state === 'intro') { try { this.video.pause(); } catch { /* rien */ } } }
  resumeMedia() { if (this.flow.state === 'intro') this.video.play?.().catch?.(() => {}); }
  pause() { if (this.flow.pause()) { this.render(); return true; } return false; }

  _sfx(name) { this.hooks.onSfx?.(name); }

  _act(act, btn) {
    const f = this.flow;
    this._sfx(['back', 'skip', 'quit'].includes(act) ? 'ui_back' : ['start', 'play', 'resume'].includes(act) ? 'ui_start' : 'ui_ok');
    switch (act) {
      case 'start': if (f.start()) this.render(); break;
      case 'skip': this._introDone(); break;
      case 'sound': this._unmute(); break;
      case 'intro': f.go('intro'); this.render(); break;
      case 'play': if (f.play()) { this.render(); this.hooks.onPlay?.(); } break;
      case 'resume': if (f.resume()) { this.render(); this.hooks.onResume?.(); } break;
      case 'quit': if (f.quitToMenu()) { this.render(); this.hooks.onQuit?.(); } break;
      case 'tenues': this.go('tenues'); break;
      case 'options': this.go('options'); break;
      case 'credits': this.go('credits'); break;
      case 'back': this._back(); break;
      case 'fullscreen': (document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.()); break;
      case 'set': this._set(btn.dataset.key, btn.dataset.val); break;
      case 'toggle': this._set(btn.dataset.key, !this.options[btn.dataset.key]); break;
    }
  }
  _back() {
    const before = this.flow.state;
    if (before !== 'main' && before !== 'playing') this._sfx('ui_back');
    this.flow.back(); this.render();
    if (before === 'pause') this.hooks.onResume?.();            // Échap dans la pause : on reprend
  }
  _set(key, val) {
    this.options = sanitizeOptions({ ...this.options, [key]: val });
    saveOptions(this.storage, this.options);
    this._applyOptions(true);
    for (const b of this.root.querySelectorAll(`[data-key="${key}"]`)) {
      if (b.classList.contains('gm-seg')) b.classList.toggle('on', b.dataset.val === this.options[key]);
      if (b.classList.contains('gm-sw')) { b.classList.toggle('on', !!this.options[key]); b.setAttribute('aria-pressed', String(!!this.options[key])); }
    }
  }
  _applyOptions(notify) {
    this.video.volume = volumeOf(this.options);
    document.body.classList.toggle('gm-no-radar', !this.options.radar);
    document.body.classList.toggle('gm-no-aide', !this.options.aide);
    if (notify) this.hooks.onOptions?.(this.options);
  }
  /** Réglages au démarrage du jeu (le jeu les applique à son rendu). */
  startupOptions() { return this.options; }

  _click(e) {
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled) { e.stopPropagation(); this._act(b.dataset.act, b); return; }
    if (this.flow.state === 'intro') this._introDone();             // un clic n'importe où passe l'intro
  }
  _input(e) {
    const el = e.target;
    if (el.type !== 'range') return;
    const key = el.dataset.key, v = Number(el.value);
    const out = this.root.querySelector(`[data-out="${key}"]`);
    if (out) out.textContent = `${v} %`;
    if (key === 'sens') this.hooks.sens?.set?.(v / 100);
    else this._set(key, v);
  }

  _key(e) {
    const s = this.flow.state;
    if (s === 'playing') {
      if (e.code === 'Escape' && !this.hooks.wardrobeOpen?.()) { if (this.pause()) this.hooks.onPause?.(); }
      return;
    }
    if (s === 'tenues') return;                                         // le choix de tenue gère lui-même ses touches
    const k = e.code;
    if (s === 'splash') { if (k === 'Enter' || k === 'Space') { e.preventDefault(); this._act('start'); } return; }
    if (s === 'intro') { if (['Escape', 'Space', 'Enter'].includes(k)) { e.preventDefault(); this._introDone(); } return; }
    if (k === 'Escape') { e.preventDefault(); this._back(); return; }
    if (['ArrowDown', 'ArrowUp', 'KeyS', 'KeyW', 'KeyZ'].includes(k)) {
      e.preventDefault(); this._move((k === 'ArrowDown' || k === 'KeyS') ? 1 : -1);
    }
  }

  /** Éléments que l'on parcourt à la flèche / à la croix : boutons, curseurs, interrupteurs, un seul bouton par groupe de choix (celui qui est choisi). */
  _items() {
    return [...this.root.querySelectorAll('.gm-screen.on .gm-btn, .gm-screen.on .gm-seg, .gm-screen.on .gm-sw, .gm-screen.on input')]
      .filter((el) => !el.classList.contains('gm-seg') || !el.dataset.key || el.classList.contains('on'));
  }
  _move(dir) {
    const items = this._items();
    if (!items.length) return;
    this._sfx('ui_move');
    const cur = items.indexOf(document.activeElement);
    const i = cur >= 0 ? cur : (dir > 0 ? -1 : 0);
    items[(i + dir + items.length) % items.length].focus();
  }
  /** Gauche / droite sur l'élément choisi : curseur = un cran, groupe de choix = choix voisin. */
  _side(dir) {
    const el = document.activeElement;
    if (!el || !this.root.contains(el)) return;
    if (el.type === 'range') {
      const step = Number(el.step) || 1;
      el.value = String(Math.min(Number(el.max), Math.max(Number(el.min), Number(el.value) + dir * step)));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (el.classList.contains('gm-seg') && el.dataset.key) {
      const sibs = [...el.parentElement.querySelectorAll('.gm-seg')];
      const nx = sibs[Math.min(sibs.length - 1, Math.max(0, sibs.indexOf(el) + dir))];
      if (nx && nx !== el) { nx.click(); nx.focus(); }
    }
  }

  /** Commandes de la manette (voir PadNav) : n = { up, down, left, right, ok, back, start, square }. Appelé à chaque image quand le menu est affiché. */
  nav(n) {
    if (!n) return;
    const s = this.flow.state;
    if (s === 'playing' || s === 'tenues') return;
    if (s === 'splash') { if (n.ok || n.square || n.start) this._act('start'); return; }       // X de la manette Xbox (Carré PlayStation) valide aussi
    if (s === 'intro') { if (n.square) this._unmute(); else if (n.ok || n.back || n.start) this._introDone(); return; }
    if (s === 'pause' && n.start) { this._back(); return; }
    if (n.back) { this._back(); return; }
    if (n.down) this._move(1); else if (n.up) this._move(-1);
    else if (n.left) this._side(-1); else if (n.right) this._side(1);
    else if (n.ok || n.square) {                                          // A ou X (Xbox) : croix ou carré (PlayStation) valident dans les menus
      const el = document.activeElement;
      if (el && this.root.contains(el) && el.tagName === 'BUTTON' && !el.disabled) el.click();
    }
  }
}
