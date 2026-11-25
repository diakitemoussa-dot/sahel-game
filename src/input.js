// Une seule lecture par image : poll() renvoie l'état des commandes, quelle que soit la source.
// Clavier : touches physiques (KeyW = Z sur AZERTY). Souris : verrouillage du pointeur au clic.
import { PadHub, PadNav, padCommands } from './gamepad.js';

export class Input {
  constructor(canvas, { gamepad = true } = {}) {
    this.canvas = canvas;
    this.useGamepad = gamepad;         // désactivé en mode test automatique : la vraie manette de l'utilisateur fausserait les mesures
    this.keys = new Set();
    this.pressed = new Set();
    this.lookX = 0; this.lookY = 0;
    this.mouse = { left: false, right: false };
    this.t = { move: { x: 0, y: 0 }, fire: false, aim: false, jump: false, crouch: false, weapon: false, wardrobe: false, reload: false, sprint: false, melee: false, lookX: 0, lookY: 0 };
    this.padPrev = [];
    this.padHub = new PadHub();
    this.padNav = new PadNav();         // navigation des menus à la manette
    this.padStatus = [];               // une ligne par manette détectée, affichée dans l'aide à l'écran
    this.override = {};              // pour les tests automatiques : fusionné dans le résultat de poll()
    this.isTouch = matchMedia('(pointer: coarse)').matches || matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0 || 'ontouchstart' in window;      // téléphone ou tablette : les boutons tactiles s'affichent

    addEventListener('keydown', (e) => { if (!e.repeat) this.pressed.add(e.code); this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    canvas.addEventListener('click', () => {
      if (document.body.classList.contains('gm-menu')) return;                // dans le menu, la souris reste libre (orbite autour du personnage, boutons)
      if (!this.isTouch && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) { this.lookX += e.movementX; this.lookY += e.movementY; }
    });
    addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    if (this.isTouch) this._buildTouchUI();
  }

  _buildTouchUI() {
    const stick = document.createElement('div'); stick.id = 'stick';
    const knob = document.createElement('div'); knob.id = 'knob'; stick.appendChild(knob);
    document.body.appendChild(stick);
    const setStick = (touch) => {
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (touch.clientX - cx) / (r.width / 2), dy = (touch.clientY - cy) / (r.height / 2);
      const n = Math.hypot(dx, dy); if (n > 1) { dx /= n; dy /= n; }
      this.t.move.x = dx; this.t.move.y = -dy;
      knob.style.left = 45 + dx * 45 + 'px'; knob.style.top = 45 + dy * 45 + 'px';
    };
    let stickId = null;
    stick.addEventListener('touchstart', (e) => { stickId = e.changedTouches[0].identifier; setStick(e.changedTouches[0]); e.preventDefault(); }, { passive: false });
    stick.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === stickId) setStick(t); e.preventDefault(); }, { passive: false });
    const endStick = (e) => { for (const t of e.changedTouches) if (t.identifier === stickId) {
      stickId = null; this.t.move.x = 0; this.t.move.y = 0; knob.style.left = '45px'; knob.style.top = '45px'; } };
    stick.addEventListener('touchend', endStick); stick.addEventListener('touchcancel', endStick);

    // glisser le doigt dans la moitié droite de l'écran : caméra
    let lookId = null, lx = 0, ly = 0;
    addEventListener('touchstart', (e) => { for (const t of e.changedTouches)
      if (lookId === null && t.clientX > innerWidth * 0.5 && !t.target.classList?.contains('tbtn')) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; } });
    addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) {
      this.t.lookX += (t.clientX - lx) * 0.5; this.t.lookY += (t.clientY - ly) * 0.5; lx = t.clientX; ly = t.clientY; } });
    const endLook = (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
    addEventListener('touchend', endLook); addEventListener('touchcancel', endLook);

    const btn = (label, right, bottom, hold, key) => {
      const b = document.createElement('div'); b.className = 'tbtn'; b.textContent = label;
      b.style.right = right + 'px'; b.style.bottom = bottom + 'px'; document.body.appendChild(b);
      b.addEventListener('touchstart', (e) => { this.t[key] = true; e.preventDefault(); }, { passive: false });
      if (hold) { const up = () => { this.t[key] = false; }; b.addEventListener('touchend', up); b.addEventListener('touchcancel', up); }
    };
    // boutons à droite (le stick de déplacement reste à gauche) : 3 rangées de 3
    btn('TIR', 16, 16, true, 'fire');
    btn('VISER', 84, 16, true, 'aim');
    btn('SAUT', 152, 16, false, 'jump');
    btn('ARME', 16, 84, false, 'weapon');
    btn('ACCR.', 84, 84, false, 'crouch');
    btn('RECH.', 152, 84, false, 'reload');
    btn('COURIR', 16, 152, true, 'sprint');
    btn('MÊLÉE', 84, 152, false, 'melee');
    btn('TENUE', 152, 152, false, 'wardrobe');
  }

  poll() {
    const k = (c) => this.keys.has(c), p = (c) => this.pressed.has(c);
    let mx = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    let my = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
    let lookX = this.lookX * 0.0022, lookY = this.lookY * 0.0022;
    this.lookX = 0; this.lookY = 0;
    let fire = this.mouse.left, aim = this.mouse.right;
    let jump = p('Space'), crouchToggle = p('KeyC'), toggleWeapon = p('KeyQ');
    let weapon = p('Digit1') ? 'rifle' : p('Digit2') ? 'pistol' : p('Digit3') ? 'none' : null;
    const viewToggle = p('KeyB'), sniperToggle = p('KeyT');
    let reload = p('KeyR'); let melee = p('KeyV'), wave = p('KeyG'), victory = p('KeyK'), hit = p('KeyH');
    const deadToggle = p('KeyM'), downedToggle = p('KeyN');
    let combo = p('KeyX');                                     // X : enchaîne toutes les animations de combat (Triangle sur la manette)
    let kick = p('KeyF');                                      // F : coups de pied seulement (pas de bouton séparé sur la manette)
    const sensDown = p('PageDown') || p('NumpadSubtract'), sensUp = p('PageUp') || p('NumpadAdd');   // sensibilité du viseur : PageDown moins, PageUp plus
    let interact = p('KeyE');                                  // E : monter dans le blindé, l'arrêter, descendre
    let wardrobeToggle = p('KeyU');                            // U : menu des tenues (Select sur la manette)
    let menuLeft = p('ArrowLeft'), menuRight = p('ArrowRight');
    const menuOk = p('Enter'), menuBack = p('Escape');         // dans le menu seulement (le jeu ignore ses commandes quand il est ouvert)

    const pads = this.useGamepad && navigator.getGamepads ? [...navigator.getGamepads()].filter((g) => g && g.connected) : [];
    const { pad, status } = this.padHub.read(pads);            // pad = null tant qu'aucune manette n'a servi
    this.padStatus = status;
    let sprint = k('ShiftLeft') || k('ShiftRight');            // clavier : Maj gauche ; manette : stick gauche enfoncé (L3)
    let padLookX = 0, padLookY = 0;                            // stick droit : fait tourner la caméra autour du personnage
    let sniperHold = false;                                    // L2 maintenue : tireur d'élite
    if (pad) {
      const c = padCommands(pad, this.padPrev);
      this.padPrev = c.pressedNow;
      mx += c.moveX; my += c.moveY;
      padLookX = c.lookX * 0.045; padLookY = c.lookY * 0.045;
      fire = fire || c.fire; aim = aim || c.aim; sprint = sprint || c.sprint; sniperHold = c.sniper;
      jump = jump || c.jump;
      crouchToggle = crouchToggle || c.crouchToggle;
      toggleWeapon = toggleWeapon || c.toggleWeapon;           // L1
      combo = combo || c.combo;                                // Triangle : tous les coups
      kick = kick || c.kick;
      reload = reload || c.reload;                             // Carré : recharge
      wardrobeToggle = wardrobeToggle || c.wardrobe;           // Select
      menuLeft = menuLeft || c.menuLeft; menuRight = menuRight || c.menuRight;
    } else {
      this.padPrev = [];
    }
    const nav = this.padNav.update(pad, performance.now());    // croix / A / B / Start pour le menu du jeu
    if (this.isTouch) {
      mx += this.t.move.x; my += this.t.move.y;
      lookX += this.t.lookX * 0.004; lookY += this.t.lookY * 0.004; this.t.lookX = 0; this.t.lookY = 0;
      fire = fire || this.t.fire; aim = aim || this.t.aim;
      if (this.t.jump) { jump = true; this.t.jump = false; }
      if (this.t.crouch) { crouchToggle = true; this.t.crouch = false; }
      if (this.t.weapon) { toggleWeapon = true; this.t.weapon = false; }
      if (this.t.wardrobe) { wardrobeToggle = true; this.t.wardrobe = false; }
      if (this.t.reload) { reload = true; this.t.reload = false; }
      if (this.t.melee) { melee = true; this.t.melee = false; }
      sprint = sprint || this.t.sprint;
    }
    const n = Math.hypot(mx, my);
    if (n > 1) { mx /= n; my /= n; }
    this.pressed.clear();
    return { moveX: mx, moveY: my, lookX, lookY, padLookX, padLookY, fire, aim, sprint, sniperHold, jump, crouchToggle, toggleWeapon, weapon, viewToggle, sniperToggle,
             reload, melee, combo, kick, wave, victory, hit, deadToggle, downedToggle,
             interact, wardrobeToggle, menuLeft, menuRight, menuOk, menuBack, sensDown, sensUp, nav, ...this.override };
  }
}
