import * as THREE from 'three';
import { indicatorAngle, indicatorAlpha, crescent, arrowhead } from './hitdir.js';
import { radarPoint } from './radar.js';

const pts = (list) => list.map(([x, y]) => `${(100 + x).toFixed(2)},${(100 + y).toFixed(2)}`).join(' ');
const ARC_POINTS = pts(crescent()), ARROW_POINTS = pts(arrowhead());

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
  setPrompt(text) { if (text !== this._prompt) { this._prompt = text; this.promptEl.textContent = text ?? ''; this.promptEl.style.display = text ? 'block' : 'none'; } }
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
