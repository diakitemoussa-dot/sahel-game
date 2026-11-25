// Menu de choix de la tenue. WardrobeMenu : état pur (testé sans navigateur). Wardrobe : relie le menu au joueur,
// à la sauvegarde du choix (localStorage) et à l'affichage.
import { pickUniform } from './uniforms.js';

const KEY = 'sahel.uniform';

export function loadSavedId(storage) {
  try { return storage?.getItem(KEY) ?? null; } catch { return null; }
}
export function saveId(storage, id) {
  try { storage?.setItem(KEY, id); } catch { /* navigation privée : le choix ne sera pas mémorisé */ }
}

export class WardrobeMenu {
  constructor(entries, savedId) {
    this.entries = entries;
    this.saved = savedId;           // tenue validée
    this.open = false;
    this.index = Math.max(0, entries.findIndex((e) => e.id === savedId));
  }
  get hovered() { return this.entries[this.index]; }

  show() { this.open = true; this.index = Math.max(0, this.entries.findIndex((e) => e.id === this.saved)); }

  /** Change la sélection : renvoie la tenue à montrer en aperçu. */
  move(dir) {
    if (!this.open) return null;
    const n = this.entries.length;
    this.index = (this.index + dir + n) % n;
    return this.hovered.id;
  }
  /** Valide la tenue sélectionnée et ferme le menu. */
  confirm() {
    if (!this.open) return null;
    this.saved = this.hovered.id; this.open = false;
    return this.saved;
  }
  /** Ferme sans valider : renvoie la tenue à remettre (celle d'avant l'ouverture). */
  cancel() {
    if (!this.open) return null;
    this.open = false; this.index = Math.max(0, this.entries.findIndex((e) => e.id === this.saved));
    return this.saved;
  }
}

export class Wardrobe {
  /** outfit : objet avec apply(id) (Outfit) ; ui : objet avec render(menu) ou null ; storage : localStorage ou null. */
  constructor({ outfit, lib, storage = null, ui = null, savedId = undefined }) {
    this.outfit = outfit; this.ui = ui; this.storage = storage; this.lib = lib;
    const wanted = pickUniform(lib, savedId === undefined ? loadSavedId(storage) : savedId);
    const start = wanted.menu ? wanted.id : lib.default;
    this.menu = new WardrobeMenu(lib.uniforms.filter((u) => u.menu), start);      // les tenues sans menu (PNJ) ne sont pas proposées au joueur
    this.error = null;
    this.team = [];                                  // les Outfit des alliés : ils portent la même tenue que le joueur
    this.ui?.bind?.(this);
  }
  get open() { return this.menu.open; }

  async _apply(id) {
    try { await this.outfit.apply(id); this.error = null; }
    catch (e) { this.error = `Tenue indisponible : ${e.message}`; console.error(e); }
    this.ui?.render(this.menu, this.error);
  }
  /** Habille toute l'équipe comme le joueur (tenue validée). Une tenue indisponible chez un allié ne bloque pas les autres. */
  async _applyTeam(id) {
    await Promise.all(this.team.map((o) => o.apply(id).catch((e) => console.error('tenue d’un allié indisponible', e))));
  }
  /** Ajoute des alliés à l'équipe : ils prennent tout de suite la tenue du joueur. */
  addTeam(outfits) { this.team.push(...outfits); return this._applyTeam(this.menu.saved); }
  /** Habille le joueur avec la tenue enregistrée (au démarrage). */
  start() { return this._apply(this.menu.saved); }
  /** Choix direct, sans menu (tests). */
  async select(id) {
    const u = pickUniform(this.lib, id);
    this.menu.saved = u.menu ? u.id : this.lib.default;
    await this._apply(this.menu.saved);
    saveId(this.storage, this.menu.saved);
    await this._applyTeam(this.menu.saved);
  }

  toggle() { if (this.menu.open) return this.cancel(); this.menu.show(); this.ui?.render(this.menu, this.error); return null; }
  move(dir) { const id = this.menu.move(dir); if (id) this._apply(id); this.ui?.render(this.menu, this.error); }
  confirm() { const id = this.menu.confirm(); if (id) { saveId(this.storage, id); this._apply(id); this._applyTeam(id); } this.ui?.render(this.menu, this.error); }
  cancel() { const id = this.menu.cancel(); if (id) this._apply(id); this.ui?.render(this.menu, this.error); }

  /** Appelé à chaque image avec les commandes lues. Renvoie vrai tant que le menu est ouvert (le jeu ignore alors les commandes). */
  update(inp) {
    if (inp.wardrobeToggle) this.toggle();
    else if (this.menu.open) {
      if (inp.menuLeft) this.move(-1);
      else if (inp.menuRight) this.move(1);
      else if (inp.menuOk || inp.jump || inp.nav?.square) this.confirm();       // Entrée, A, ou X de la manette
      else if (inp.menuBack || inp.crouchToggle) this.cancel();
    }
    return this.menu.open;
  }
}

/** Affichage HTML du menu : liste centrée, boutons cliquables (souris et tactile). */
export class WardrobeUI {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'wardrobe';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
    // bouton toujours visible (en haut à droite) : on n'a pas à connaître la touche U
    this.btn = document.createElement('button');
    this.btn.id = 'wbtn';
    this.btn.textContent = '👕 TENUES (U)';
    document.body.appendChild(this.btn);
  }
  bind(w) {
    this.btn.addEventListener('click', (e) => { e.stopPropagation(); if (!w.open) w.toggle(); });
    this.el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'prev') w.move(-1); else if (a === 'next') w.move(1);
      else if (a === 'ok') w.confirm(); else if (a === 'close') w.cancel();
    });
  }
  render(menu, error = null) {
    this.el.style.display = menu.open ? 'flex' : 'none';
    this.btn.style.display = menu.open ? 'none' : 'block';
    if (!menu.open) return;
    if (document.pointerLockElement) document.exitPointerLock?.();       // libère la souris pour cliquer
    const items = menu.entries.map((e, i) =>
      `<div class="w-item${i === menu.index ? ' sel' : ''}"><b>${e.name}</b><span>${e.description}</span></div>`).join('');
    this.el.innerHTML = `<div class="w-box"><h2>TENUES</h2>${items}${error ? `<p class="w-err">${error}</p>` : ''}
      <div class="w-btns"><button data-act="prev">◀</button><button data-act="ok">VALIDER</button><button data-act="next">▶</button><button data-act="close">✕</button></div>
      <p class="w-hint">← → choisir · Entrée valider · Échap annuler · (manette : croix + A / B)<br>Glisser la souris ou stick droit : tourner autour du personnage</p></div>`;
  }
}
