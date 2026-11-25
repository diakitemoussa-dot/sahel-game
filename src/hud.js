import * as THREE from 'three';
import { indicatorAngle, indicatorAlpha, crescent, arrowhead } from './hitdir.js';
import { radarPoint } from './radar.js';

const pts = (list) => list.map(([x, y]) => `${(100 + x).toFixed(2)},${(100 + y).toFixed(2)}`).join(' ');
const ARC_POINTS = pts(crescent()), ARROW_POINTS = pts(arrowhead());

const DRIVE_SEGMENTS = 24;           // segments de la jauge de vitesse
const PROMPT_ICONS = {
  enter: '<path d="M14 4h5v16h-5M3 12h11M10 8l4 4-4 4"/>',          // une flèche qui entre par la porte
  exit: '<path d="M10 4H5v16h5M21 12H10M17 8l4 4-4 4"/>',           // une flèche qui sort par la porte
};

export class Hud {
  constructor() {
    this.el = document.getElementById('hud'); this.msg = document.getElementById('msg');
    const add = (id, html = '') => { const d = document.createElement('div'); d.id = id; d.innerHTML = html; document.body.appendChild(d); return d; };
    this.danger = add('danger');                                         // bord de l'écran qui pulse en rouge quand la vie est basse
    this.hurt = add('hurt');                                             // flash rouge quand le joueur est touché
    this.hitmark = add('hitmark', '<i></i><i></i><i></i><i></i>');       // croix autour du viseur quand un tir touche
    this.life = add('life', '<span id="lifelab">Vie</span><div id="lifebar"><div id="lifefill"></div></div><span id="lifetxt">100</span>');
    this.kills = add('kills');
    this.missionEl = add('mission');                                      // objectif : miliciens éliminés et hommes de l'escouade encore debout
    this.bannerEl = add('banner');                                        // grand message (mission accomplie)
    this.ammoEl = add('ammo');                                            // munitions de l'arme tenue : « 24 / 50 », ou « RECHARGE… »
    this.toastEl = add('toast');
    this.dock = add('dock');                                              // barre du bas : PV, armes (1, 2, 3), munitions, convoi, escouade, miliciens
    this._dockHtml = '';
    this.convoyEl = add('convoy');                                         // avancement du convoi de blindés (nombre vivants, pourcentage, position de chacun sur la route)
    this.promptEl = add('prompt');                                        // « E : monter dans le blindé » (cliquable : écrans tactiles)
    this.promptEl.addEventListener('click', (e) => { e.stopPropagation(); this._onPrompt?.(); });
    this.dirs = add('dirs');                                              // arcs jaunes : d'où viennent les tirs
    this.radarEl = document.createElement('canvas'); this.radarEl.id = 'radar'; this.radarEl.width = this.radarEl.height = 320;     // carte de repérage
    this.radarEl.title = 'Carte : rouge = ennemis, vert = alliés'; document.body.appendChild(this.radarEl);
    this.tagEls = new Map();                                               // id du personnage -> repère (nom + barre de vie) à l'écran
    this._v = new THREE.Vector3();
    this.indicators = new Map();                                          // id du tireur -> { x, z, age, power, el }
    this._t = {};
  }
  /** Invite d'action au bas de l'écran (null : la cacher). */
  /** opts (facultatif) : { icon: 'enter' | 'exit', keys: ['E', 'R1'] } : une icône et les touches (clavier, manette) à côté du texte. Cliquable : écrans tactiles. */
  setPrompt(text, opts) {
    const key = text ? `${text}|${opts?.icon ?? ''}|${(opts?.keys ?? []).join('/')}` : '';
    if (key === this._prompt) return;
    this._prompt = key;
    if (!text) { this.promptEl.style.display = 'none'; return; }
    const icon = opts?.icon ? `<svg viewBox="0 0 24 24" aria-hidden="true">${PROMPT_ICONS[opts.icon] ?? ''}</svg>` : '';
    const keys = (opts?.keys ?? []).map((k) => `<kbd>${k}</kbd>`).join('');
    this.promptEl.innerHTML = `${icon}<span>${text}</span>${keys}`;
    this.promptEl.style.display = 'flex';
  }
  /** Interface de conduite : info = { kmh, gear ('D' | 'R' | 'N'), frac (0 à 1) } ; null : la cacher (les commandes du joueur à pied reviennent). */
  setDrive(info) {
    if (!this.driveEl) {
      const segs = Array.from({ length: DRIVE_SEGMENTS }, (_, i) => `<i style="--c:hsl(${Math.round(52 - 52 * (i / (DRIVE_SEGMENTS - 1)))} 95% 55%)"></i>`).join('');
      this.driveEl = document.createElement('div'); this.driveEl.id = 'drive';
      this.driveEl.innerHTML = `<div class="dr-speed"><b>0</b><span>km/h</span><em>N</em></div><div class="dr-bar">${segs}</div>`;
      document.body.appendChild(this.driveEl);
      this._drSpeed = this.driveEl.querySelector('.dr-speed b'); this._drGear = this.driveEl.querySelector('.dr-speed em');
      this._drSegs = [...this.driveEl.querySelectorAll('.dr-bar i')]; this._drKey = '';
    }
    document.body.classList.toggle('gm-drive', !!info);
    this.driveEl.style.display = info ? 'block' : 'none';
    if (!info) { this._drKey = ''; return; }
    const kmh = Math.round(info.kmh), lit = Math.round(Math.min(1, info.frac) * DRIVE_SEGMENTS), key = `${kmh}|${info.gear}|${lit}`;
    if (key === this._drKey) return;                                      // rien n'a changé : on ne touche pas au texte
    this._drKey = key;
    this._drSpeed.textContent = kmh; this._drGear.textContent = info.gear;
    this._drSegs.forEach((s, i) => s.classList.toggle('on', i < lit));
  }
  onPrompt(fn) { this._onPrompt = fn; }
  /** Panneau du convoi. info : voir Convoy.progress() ou null (pas de convoi : le panneau disparaît). */
  setConvoy(info) {
    const key = info ? `${info.alive}/${info.total}|${Math.round(info.fraction * 100)}|${info.done}|${info.vehicles.map((v) => `${Math.round(v.f * 60)}${v.alive ? 'a' : 'd'}`).join(',')}` : '';
    if (key === this._convoyKey) return;
    this._convoyKey = key;
    const el = this.convoyEl; el.style.display = info ? 'block' : 'none';
    if (!info) return;
    const state = info.alive === 0 ? '<span class="bad">neutralisé</span>' : info.done ? '<span class="ok">arrivé</span>' : `${Math.round(info.fraction * 100)} %`;
    const marks = info.vehicles.map((v) => `<i class="${v.alive ? 'a' : 'd'}" style="left:${(v.f * 100).toFixed(1)}%"></i>`).join('');
    el.innerHTML = `<b>CONVOI</b> ${info.alive}/${info.total} blindés · ${state}<div class="route"><u style="width:${(info.fraction * 100).toFixed(1)}%"></u>${marks}</div>`;
  }

  hideMessage() { this.msg.style.display = 'none'; }
  showMessage(t) { this.msg.style.display = 'flex'; this.msg.textContent = t; }

  /** Barre de vie : frac de 0 à 1. */
  setHealth(frac, hp) {
    document.getElementById('lifefill').style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    const c = frac > 0.5 ? '#3ddc5a' : frac > 0.25 ? '#ffa23a' : '#ff3d5a';      // la couleur de fin du dégradé change quand la vie baisse
    document.getElementById('lifefill').style.background = `linear-gradient(90deg, #ffd23a, ${c})`;
    document.getElementById('lifetxt').textContent = Math.max(0, Math.round(hp));
    this.danger.classList.toggle('on', frac > 0 && frac <= 0.3);
  }
  /** Munitions : weapon 'rifle' | 'pistol' | autre (mains nues : rien d'affiché) ; n balles dans le chargeur sur size ; reloading : recharge en cours. */
  setAmmo(weapon, n, size, reloading = false) {
    const key = `${weapon}|${n}|${size}|${reloading}`;
    if (key === this._ammoKey) return;                                   // rien n'a changé : on ne touche pas au texte
    this._ammoKey = key;
    const name = weapon === 'rifle' ? 'FUSIL' : weapon === 'pistol' ? 'PISTOLET' : null;
    this.ammoEl.style.display = name ? 'block' : 'none';
    this.ammoEl.classList.toggle('low', !!name && !reloading && n <= Math.ceil(size * 0.25));
    this.ammoEl.classList.toggle('reloading', !!reloading);
    if (name) this.ammoEl.innerHTML = reloading ? `${name}<b>RECHARGE…</b>` : `${name}<b>${n}</b><span> / ${size}</span>`;
  }
  /** Barre du bas (style « fiche de combat ») : vie, armes (touches 1, 2, 3) avec celle tenue en surbrillance, munitions du chargeur, convoi, escouade et miliciens.
   *  info : { weapon, n, size, reloading, hp, frac, convoy (Convoy.progress() ou null), allies: { alive, total }, enemies: { dead, total } }. Ne reconstruit le HTML que si quelque chose change. */
  updateDock(info) {
    const { weapon, n, size, reloading, hp, frac, convoy, allies, enemies } = info;
    const SLOTS = [['rifle', 'Fusil', '1', 'M2 11h24v-2h6v4h-6v2h-4v4h-3v-4H12l-2 3H6v-3H2z'],
                   ['pistol', 'Pistolet', '2', 'M10 8h20v5h-6v8h-6v-8h-8z'],
                   ['none', 'Mains nues', '3', 'M10 6h10v6h4v6h-4v4H10z']];
    const slots = SLOTS.map(([id, name, key, d]) => `<div class="dk-slot${weapon === id ? ' sel' : ''}"><em>${key}</em><svg viewBox="0 0 40 24"><path d="${d}"/></svg><span>${name}</span></div>`).join('');
    const hasAmmo = weapon === 'rifle' || weapon === 'pistol';
    const ammo = hasAmmo ? (reloading ? '<b>RECHARGE…</b>' : `<b>${n}</b><span> / ${size}</span>`) : '';
    const cv = convoy ? `${convoy.alive}/${convoy.total} · ${convoy.done ? 'arrivé' : convoy.alive === 0 ? 'neutralisé' : `${Math.round(convoy.fraction * 100)} %`}` : 'absent';
    const pct = Math.max(0, Math.min(1, frac)) * 100;
    const html = `<div class="dk-pv"><span class="dk-lbl">PV</span><b>${Math.max(0, Math.round(hp))}</b><div class="dk-bar"><i style="width:${pct.toFixed(1)}%"></i></div></div>`
      + `<div class="dk-weap">${slots}</div>`
      + `<div class="dk-ammo">${ammo}</div>`
      + `<div class="dk-info"><div>Convoi <b>${cv}</b></div><div>Escouade <b>${allies.alive}/${allies.total}</b></div><div>Miliciens <b>${enemies.dead}/${enemies.total}</b> neutralisés</div></div>`;
    if (html === this._dockHtml) return;
    this._dockHtml = html; this.dock.innerHTML = html;
  }
  /** Panneau de mission (3 lignes) ; ne touche au texte que s'il change. */
  setMission(text) {
    if (text === this._missionText) return;
    this._missionText = text; this.missionEl.innerHTML = text.split(/\n/).map((l, i) => (i === 0 ? `<b>${l}</b>` : l)).join('<br>');
  }
  /** Grand message au centre, qui s'efface après ms millisecondes. */
  showBanner(title, sub = '', ms = 9000) {
    this.bannerEl.innerHTML = `<h1>${title}</h1><p>${sub}</p>`;
    this._pulse(this.bannerEl, 'banner', ms);
  }
  setKills(n) { this.kills.textContent = `PNJ neutralisés : ${n}`; }
  _pulse(el, key, ms) {                                                  // rejoue une animation courte (opacité 1 -> 0)
    clearTimeout(this._t[key]);
    el.classList.add('on');
    this._t[key] = setTimeout(() => el.classList.remove('on'), ms);
  }
  flashHurt() { this._pulse(this.hurt, 'hurt', 250); }
  hitMarker(kill = false) { this.hitmark.classList.toggle('kill', !!kill); this._pulse(this.hitmark, 'hit', 220); }
  toast(text, ms = 3000) { this.toastEl.textContent = text; this._pulse(this.toastEl, 'toast', ms); }

  /** Repères au-dessus de la tête : nom, barre de vie et petite flèche, de la couleur du camp (verte : alliés, rouge : miliciens, bleue : le joueur).
   *  tags : [{ id, kind: 'ally' | 'enemy' | 'self', name, player (le Player qui porte la position), health, dead, hidden }]. Cachés derrière la caméra, morts ou trop loin. */
  updateTags(tags, camera) {
    for (const t of tags) {
      let el = this.tagEls.get(t.id);
      if (!el) {
        el = document.createElement('div'); el.className = `tag ${t.kind}`;
        el.innerHTML = '<span class="th"></span><b></b><i><u></u></i><em>▼</em>';
        el.querySelector('b').textContent = t.name;
        el._u = el.querySelector('u'); el._th = el.querySelector('.th');
        document.body.appendChild(el); this.tagEls.set(t.id, el);
      }
      const p = t.player.pos;
      this._v.set(p.x, p.y + 2.0, p.z).project(camera);
      const dist = camera.position.distanceTo(p);
      const show = !t.dead && !t.hidden && this._v.z < 1 && Math.abs(this._v.x) < 1.1 && Math.abs(this._v.y) < 1.1 && dist < 80;
      el.style.display = show ? 'flex' : 'none';
      if (!show) continue;
      el.style.left = `${(this._v.x * 0.5 + 0.5) * innerWidth}px`; el.style.top = `${(-this._v.y * 0.5 + 0.5) * innerHeight}px`;
      el.style.opacity = Math.max(0.35, Math.min(1, 1.4 - dist / 60)).toFixed(2);
      el._u.style.width = `${Math.max(0, t.health.frac) * 100}%`;
      const th = dist < 45 ? (t.thought ?? '') : '';                                       // ce que le PNJ pense en ce moment (npcmind.js)
      if (el._thText !== th) { el._thText = th; el._th.textContent = th; el._th.style.display = th ? 'block' : 'none'; }
    }
  }


  /** Carte de repérage : le joueur au centre, le haut = où regarde la caméra. Rouge : miliciens (cerclés s'ils combattent), vert : alliés ;
   *  hors de portée, un point pâle sur le bord indique la direction. entities : { origin: {x, z}, heading, enemies: [{ pos, state, dead }], allies: [{ pos, dead }] }. */
  updateRadar({ origin, heading, enemies = [], allies = [], road = [], convoy = [] }) {
    const cv = this.radarEl, g = cv.getContext('2d'), W = cv.width, R = W / 2 - 6, c = W / 2;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.clip();
    g.fillStyle = 'rgba(14,18,16,.58)'; g.fillRect(0, 0, W, W);
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 2;
    for (const f of [1 / 3, 2 / 3]) { g.beginPath(); g.arc(c, c, R * f, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(c, c - R); g.lineTo(c, c + R); g.moveTo(c - R, c); g.lineTo(c + R, c); g.stroke();
    // champ de vision de la caméra
    g.fillStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.moveTo(c, c); g.arc(c, c, R, -Math.PI / 2 - 0.8, -Math.PI / 2 + 0.8); g.closePath(); g.fill();
    const dot = (t, color, size, ring) => {
      const p = radarPoint(origin, heading, t);
      const x = c + p.x * R, y = c + p.y * R;
      g.globalAlpha = p.far ? 0.45 : 1;
      g.fillStyle = color; g.strokeStyle = 'rgba(0,0,0,.75)'; g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, size, 0, Math.PI * 2); g.fill(); g.stroke();
      if (ring) { g.strokeStyle = color; g.lineWidth = 3; g.beginPath(); g.arc(x, y, size + 6, 0, Math.PI * 2); g.stroke(); }
      g.globalAlpha = 1;
    };
    if (road.length > 1) {                                                // la piste du convoi, là où elle passe dans la portée du radar
      g.strokeStyle = 'rgba(236,206,140,.55)'; g.lineWidth = 3; g.lineJoin = 'round'; g.beginPath();
      let pen = false;
      for (const q of road) { const p = radarPoint(origin, heading, q); if (p.far) { pen = false; continue; } const x = c + p.x * R, y = c + p.y * R; if (pen) g.lineTo(x, y); else g.moveTo(x, y); pen = true; }
      g.stroke();
    }
    for (const v of convoy) {                                             // les blindés : carrés dorés (gris barrés quand ils sont neutralisés) ; hors de portée : posés sur le bord
      const p = radarPoint(origin, heading, v.pos), x = c + p.x * R, y = c + p.y * R;
      g.globalAlpha = p.far ? 0.55 : 1; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)';
      if (v.alive) { g.fillStyle = '#ffd23a'; g.fillRect(x - 8, y - 8, 16, 16); g.strokeRect(x - 8, y - 8, 16, 16); }
      else { g.strokeStyle = '#8a8a8a'; g.beginPath(); g.moveTo(x - 8, y - 8); g.lineTo(x + 8, y + 8); g.moveTo(x + 8, y - 8); g.lineTo(x - 8, y + 8); g.stroke(); }
      g.globalAlpha = 1;
    }
    for (const a of allies) if (!a.dead) dot(a.pos, '#6fe35f', 8, false);
    for (const e of enemies) if (!e.dead) dot(e.pos, '#ff5a4a', 9, e.state === 'engage' || e.state === 'alert' || e.state === 'hurt');
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 3; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.stroke();
    // le joueur : flèche bleue au centre, pointée vers le haut
    g.fillStyle = '#4db8ff'; g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(c, c - 14); g.lineTo(c + 10, c + 11); g.lineTo(c, c + 6); g.lineTo(c - 10, c + 11); g.closePath(); g.fill(); g.stroke();
  }

  /** Un tir (ou un coup) vient de la position `from` : un arc jaune apparaît du côté du tireur. power : 1 si le tir a touché, moins s'il a raté. */
  shotFrom(id, from, power = 1) {
    let ind = this.indicators.get(id);
    if (!ind) {
      if (this.indicators.size >= 6) return;
      const el = document.createElement('div');
      el.className = 'dir';
      el.innerHTML = `<svg viewBox="0 0 200 200" width="200" height="200"><defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="#fff58a"/><stop offset="0.55" stop-color="#ffd21a"/><stop offset="1" stop-color="#ff9d00"/></linearGradient></defs>` +
        `<g fill="url(#g${id})" stroke="rgba(110,50,0,.75)" stroke-width="1.4" stroke-linejoin="round">` +
        `<polygon points="${ARC_POINTS}"/><polygon points="${ARROW_POINTS}"/></g></svg>`;
      this.dirs.appendChild(el);
      ind = { el };
      this.indicators.set(id, ind);
    }
    Object.assign(ind, { x: from.x, z: from.z, age: 0, power });
  }

  /** À appeler à chaque image : fait tourner les arcs avec la caméra et les efface peu à peu. camHeading : cap de la caméra ; at : position du joueur. */
  updateIndicators(dt, camHeading, at) {
    const k = Math.max(0.8, Math.min(1.6, Math.min(innerWidth, innerHeight) / 700));
    for (const [id, ind] of this.indicators) {
      ind.age += dt;
      const a = indicatorAlpha(ind.age) * ind.power;
      if (a <= 0) { ind.el.remove(); this.indicators.delete(id); continue; }
      ind.el.style.opacity = a.toFixed(3);
      ind.el.style.transform = `rotate(${indicatorAngle(camHeading, at, ind).toFixed(1)}deg) scale(${(k * (0.92 + 0.12 * ind.power)).toFixed(3)})`;
    }
  }

  update(p, rig, padStatus = []) {
    const s = p.state;
    const pads = padStatus.length ? `Manette détectée : ${padStatus.join(' | ')}\n` : '';
    this.el.textContent = pads +
      `Arme : ${{ rifle: 'fusil', pistol: 'pistolet', none: 'mains nues' }[s.weapon]}${s.sniper ? ' (lunette)' : ''}   Vue : ${rig.view === 'fps' ? 'première personne' : "par-dessus l'épaule"}\n` +
      `Animation : ${p.current ?? '-'}   Tenue : ${p.uniformName ?? '-'}\n` +
      `ZQSD/WASD bouger · souris viser · clic gauche tirer · clic droit viser · Espace sauter · C accroupi · Maj sprint\n` +
      `Manette : stick gauche bouger · stick droit tourner autour du personnage · RT tirer · L2 tireur d'élite (maintenu) · A sauter · B accroupi · L1 changer d'arme · L3 (stick enfoncé) sprint\n` +
      `1 fusil · 2 pistolet · 3 mains nues · Q alterner · T lunette · B changer de vue · cliquer pour capturer la souris\n` +
      `R recharger (Carré sur la manette) · V mêlée · G saluer · K victoire · H coup reçu · M mourir/revivre · N à terre/se relever\n` +
      `X (Triangle sur la manette) : enchaîner TOUTES les animations de combat, une pression par coup\n` +
      `F : coups de pied seulement (clavier)\n` +
      `U (Select ou R3 sur la manette, bouton TENUE au tactile) : choisir la tenue · ← → choisir · Entrée valider · Échap annuler
` +
      `PageUp / PageDown : sensibilité du viseur (plus lent quand on vise)`;
  }
}
