import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { pickClip, nextWeapon, fadeTime, clipSpeed, boostFor } from './animstate.js';
import { solveAim, limitRotation, blendWeight, blendRotation } from './aimsolve.js';
import { updateOrbit, followYaw } from './orbit.js';
import { canMove } from './movement.js';
import { Combo } from './combo.js';
import { Health } from './combat.js';
import { ASSET_VERSION } from './version.js';
import { Ammo, RELOAD_CLIP } from './ammo.js';
import { makePistolReload } from './reloadclip.js';

const now = () => performance.now() / 1000;

const UP = new THREE.Vector3(0, 1, 0);
const san = (n) => THREE.PropertyBinding.sanitizeNodeName(n);     // three retire les ':' des noms d'os
const SPEED = { walk: 2.4, run: 5.5, sprint: 7.0, crouch: 2.0 };       // m/s : +20 % avec les animations jouées 20 % plus vite (animstate.ANIM_SPEED), pour que les pas collent au sol
const JUMP_SPEED = 6.0;                                   // vitesse verticale d'un saut : 1 m de haut ; le second saut ajoute presque autant

export class Player {
  static async load(scene, url = `assets/player.glb?v=${ASSET_VERSION}`) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);                 // le personnage est compressé (Meshopt + textures WebP)
    const gltf = await loader.loadAsync(url);
    return new Player(scene, gltf);
  }

  constructor(scene, gltf) {
    this.root = new THREE.Group();
    this.model = gltf.scene;
    this.root.add(this.model);
    scene.add(this.root);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = new Map(gltf.animations.map((c) => [c.name, c]));
    const pr = makePistolReload(this.clips);                           // recharge du pistolet : composée à partir de deux animations existantes
    if (pr && !this.clips.has(pr.name)) this.clips.set(pr.name, pr);
    this.ammo = new Ammo();                                            // chargeurs du fusil et du pistolet
    const find = (n) => this.model.getObjectByName(san(n));
    this.bones = { spine: find('mixamorig4:Spine1'), hand: find('mixamorig4:RightHand'), weapon: find('Weapon'), head: find('mixamorig4:Head') };
    this.rifle = find('Rifle'); this.mag = find('Rifle_Mag'); this.pistol = find('Pistol');
    this.muzzles = { rifle: find('Muzzle'), pistol: find('Muzzle_Pistol') };
    for (const [k, v] of Object.entries({ ...this.bones, rifle: this.rifle, pistol: this.pistol, muzzleRifle: this.muzzles.rifle, muzzlePistol: this.muzzles.pistol })) {
      if (!v) throw new Error(`nœud introuvable dans player.glb : ${k}`);
    }
    this.model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });

    this.pos = new THREE.Vector3();
    this.yaw = 0; this.vy = 0; this.onGround = true;     // yaw : orientation du corps
    this.jumps = 0;                                       // sauts utilisés depuis le sol (0, 1 ou 2 : double saut)
    this.climb = null;                                    // escalade en cours : { t, dur, from, to }
    this.locked = false;                                  // vrai : il reste à sa place (tireur à la trappe du blindé) ; il vise, tire, recharge, change d'arme, mais ne marche ni ne saute
    this.aimWeight = 1;                                   // 0 = canon libre, 1 = canon sur le centre : change progressivement
    this.smooth = true;                                   // false = ancien comportement (fondu court, visée d'un coup), pour comparer dans les tests
    this.orbiting = false;                                // vrai quand la caméra tourne autour du personnage à l'arrêt
    this.sniperLatched = false;                           // tireur d'élite activé par la touche T
    this.fps = false;
    this.health = new Health(100);                        // points de vie (joueur et PNJ)
    this.animBoost = 1;                                   // multiplicateur de vitesse des animations ET des déplacements (le joueur : voir main.js) ; 1 = normal
    this.onAttack = null;                                 // appelé au début d'une attaque (le combat y calcule les dégâts)
    this.relaxed = false;                                 // vrai (PNJ) : arme baissée même à l'arrêt, animations sans « Tir »
    this.current = null; this.action = null;
    this.state = { weapon: 'rifle', crouch: false, move: 'idle', aiming: false, firing: false,
                   sniper: false, downed: false, dead: false, airborne: false, raised: true,
                   running: false, side: 'right' };
    this._computeGrip();
    this.setWeapon('rifle');
    // fin d'une action ponctuelle (recharge, mêlée...) : on revient à l'animation de déplacement
    this.combo = new Combo();
    this.kicks = new Combo();                              // coups de pied : F (clavier)
    this.activeCombo = this.combo;                         // enchaînement auquel appartient l'attaque en cours
    this.comboActive = false;                              // une attaque du combo est en cours
    this.comboLog = [];                                    // attaques lancées, pour les tests automatiques
    this.mixer.addEventListener('finished', (e) => {
      if (this.state.overlay && e.action.getClip().name === this.state.overlay) {
        if (/Reload/.test(this.state.overlay)) this.ammo.finishReload();            // fin de la recharge : chargeur plein
        this.state.overlay = null;
        if (this.comboActive) {                            // un appui en attente : on enchaîne tout de suite
          const chain = this.activeCombo;
          const next = chain.finished(now());
          if (!next || !this._startCombo(next, chain)) this.comboActive = false;
        }
      }
    });
  }

  _startCombo(name, chain = this.combo) {
    if (!this._startOverlay(name)) return false;
    this.activeCombo = chain;
    this.comboActive = true;
    this.comboLog.push(name);
    return true;
  }

  /** Lance une action ponctuelle (animation jouée une fois, par-dessus le déplacement). */
  _startOverlay(name) {
    const s = this.state;
    if (!this.clips.has(name) || s.dead || s.downed || s.overlay) return false;
    s.overlay = name;
    this.onAttack?.(name);
    return true;
  }

  /** Peut-il tirer ? (arme à feu, vivant, chargeur non vide, pas en recharge) */
  canShoot() {
    const s = this.state;
    return !s.dead && !s.downed && this.ammo.canFire(s.weapon);
  }
  /** Un coup est parti : une balle de moins. Chargeur vide : la recharge démarre toute seule (renvoie 'reload' si elle démarre). */
  onShot() {
    const w = this.state.weapon;
    if (!this.ammo.fire(w)) return null;
    return this.ammo.mag[w] === 0 && this.reload() ? 'reload' : null;
  }
  /** Recharge l'arme tenue en jouant l'animation de recharge. Renvoie faux si rien à recharger ou si une autre action est en cours. */
  reload() {
    const w = this.state.weapon, name = RELOAD_CLIP[w];
    if (!name || !this.ammo.needsReload(w) || !this.clips.has(name) || !this._startOverlay(name)) return false;
    this.ammo.startReload(w, this.clips.get(name).duration / (clipSpeed(name) * boostFor(name, this.animBoost)));
    return true;
  }

  /** Décalage fixe entre la main droite et l'os du fusil, mesuré sur la visée (le fusil y est rigide à moins de 1 cm). */
  _computeGrip() {
    const clip = this.clips.get('Rifle Aim');
    if (!clip) throw new Error("animation 'Rifle Aim' introuvable");
    const a = this.mixer.clipAction(clip);
    a.play();
    this.mixer.setTime(0.5);
    this.model.updateMatrixWorld(true);
    const { hand, weapon } = this.bones;
    this.grip = new THREE.Matrix4().copy(hand.matrixWorld).invert().multiply(weapon.matrixWorld);
    this.mixer.stopAllAction();
  }

  _applyGrip() {
    const { hand, weapon } = this.bones;
    if (this.state.weapon !== 'rifle') return;
    const world = new THREE.Matrix4().multiplyMatrices(hand.matrixWorld, this.grip);
    const local = new THREE.Matrix4().copy(weapon.parent.matrixWorld).invert().multiply(world);
    local.decompose(weapon.position, weapon.quaternion, weapon.scale);
    weapon.updateMatrixWorld(true);
  }

  /** Mort : l'animation de chute reste figée au sol (même effet que la touche M). */
  die() {
    const s = this.state;
    s.dead = true; s.downed = false; s.overlay = null; this.comboActive = false; this.current = null;
    this.ammo.cancel();
  }

  /** Remise sur pied avec toute la vie. */
  revive() {
    const s = this.state;
    s.dead = false; s.downed = false; s.overlay = null; this.comboActive = false; this.current = null;
    this.health.reset(); this.ammo.refillAll();                        // il réapparaît avec des chargeurs pleins
  }

  setWeapon(w) {
    this.state.weapon = w;
    this.rifle.visible = w === 'rifle';
    if (this.mag) this.mag.visible = w === 'rifle';
    this.pistol.visible = w === 'pistol';
  }

  /** Déplacement, saut, collisions. camYaw : le joueur regarde toujours dans la direction de la caméra. */
  step(dt, inp, world, camYaw) {
    const s = this.state;
    const wanted = inp.weapon || (inp.toggleWeapon ? nextWeapon(s.weapon) : null);   // 'rifle', 'pistol' ou 'none' (mains nues)
    if (wanted && wanted !== s.weapon && !s.dead && !s.downed) {
      if (this.ammo.reloading) { this.ammo.cancel(); if (/Reload/.test(s.overlay ?? '')) { s.overlay = null; this.current = null; } }     // changer d'arme interrompt la recharge
      this.setWeapon(wanted);                                           // changement d'arme immédiat, sans geste
    }
    this.ammo.update(dt);
    if (inp.reload) this.reload();                                        // R : recharge (fusil ou pistolet) si le chargeur n'est pas plein
    else if (this.ammo.uses(s.weapon) && this.ammo.mag[s.weapon] === 0 && !this.ammo.reloading && !s.overlay && !s.dead && !s.downed) this.reload();     // chargeur vide : recharge automatique
    if (inp.melee) this._startOverlay(s.weapon === 'pistol' ? 'Pistol Whip' : 'Melee Punch');
    if (inp.combo && !s.dead && !s.downed) {                              // X / Triangle : enchaîne toutes les animations de combat
      if (!s.overlay) { const c = this.combo.press(s.weapon, false, now()); if (c) this._startCombo(c); }
      else if (this.comboActive && this.activeCombo === this.combo) this.combo.press(s.weapon, true, now());   // attaque en cours : appui mis en attente
    }
    if (inp.kick && !s.dead && !s.downed) {                               // F : coups de pied, un par pression
      if (!s.overlay) { const c = this.kicks.press('kick', false, now()); if (c) this._startCombo(c, this.kicks); }
      else if (this.comboActive && this.activeCombo === this.kicks) this.kicks.press('kick', true, now());
    }
    if (inp.wave) this._startOverlay('Wave');
    if (inp.victory) this._startOverlay('Victory');
    if (inp.hit) this._startOverlay('Hit Reaction');
    if (inp.deadToggle) { s.dead = !s.dead; s.downed = false; s.overlay = null; this.comboActive = false; this.current = null; }
    if (inp.downedToggle) { s.downed = !s.downed; s.dead = false; s.overlay = null; this.comboActive = false; this.current = null; }
    if (inp.crouchToggle && !this.locked) s.crouch = !s.crouch;
    // sprint : stick gauche enfoncé (ou Maj) en poussant vers l'avant ; viser, tirer, s'accroupir ou une action l'interrompent
    s.sprint = !!inp.sprint && inp.moveY > 0.3 && !inp.aim && !inp.fire && !s.crouch && !s.overlay && !s.dead && !s.downed;
    s.raised = !this.relaxed && !s.overlay && !s.dead && !s.downed && !s.sprint;  // action, à terre ou sprint : le canon ne vise pas le centre
    // tireur d'élite : touche T (bascule) ou L2 de la manette (tant qu'elle est enfoncée), avec le fusil ou le pistolet
    const canSnipe = s.weapon === 'rifle' || s.weapon === 'pistol';
    if (inp.sniperToggle && canSnipe) this.sniperLatched = !this.sniperLatched;
    s.sniper = canSnipe && (this.sniperLatched || !!inp.sniperHold);
    s.aiming = !!inp.aim; s.firing = !!inp.fire;
    const shooting = s.firing && s.weapon !== 'none';
    // il ne glisse pas pendant le tir ni une action ; accroupi il peut se déplacer en marchant
    const allowed = canMove({ dead: s.dead, downed: s.downed, overlay: s.overlay, shooting, crouch: s.crouch, onGround: this.onGround }) && !this.climb && !this.locked;

    const f = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const r = new THREE.Vector3().crossVectors(f, UP);
    const dir = new THREE.Vector3().addScaledVector(f, inp.moveY).addScaledVector(r, inp.moveX);
    const mag = Math.min(1, dir.length());
    const speed = s.crouch ? SPEED.crouch
      : s.sprint ? SPEED.sprint
      : (mag > 0.6 && !s.aiming && !s.sniper ? SPEED.run : SPEED.walk);
    if (allowed && mag > 0.01) { dir.normalize().multiplyScalar(speed * this.animBoost * mag * dt); this.pos.add(dir); }      // les pas suivent la vitesse des animations
    s.running = speed >= SPEED.run;
    s.side = inp.moveX < 0 ? 'left' : 'right';
    s.move = !allowed || mag < 0.05 ? 'idle'
      : Math.abs(inp.moveX) > Math.abs(inp.moveY) ? 'side'
      : inp.moveY < 0 ? 'back'
      : speed >= SPEED.run ? 'run' : 'walk';

    // saut, puis double saut : en l'air, un deuxième appui près d'un rebord à portée de main fait GRIMPER dessus ; sinon c'est un second saut
    if (inp.jump && !s.crouch && !s.dead && !s.downed && !this.climb && !this.locked) {
      if (this.onGround) { this.vy = JUMP_SPEED; this.onGround = false; this.jumps = 1; }
      else if (this.jumps === 1) {
        const look = mag > 0.05 ? { x: dir.x / (dir.length() || 1), z: dir.z / (dir.length() || 1) } : { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
        const ledge = world.findLedge?.(this.pos, look);
        if (ledge) this._startClimb(ledge);
        else { this.vy = JUMP_SPEED; this.jumps = 2; this.current = null; }       // second saut (l'animation repart)
      }
    }
    if (this.locked) {
      this.vy = 0; this.onGround = true; this.jumps = 0; this.climb = null;       // la position est imposée de l'extérieur (le blindé)
    } else if (this.climb) {
      this._updateClimb(dt);
    } else {
      this.vy -= 18.0 * dt;
      this.pos.y += this.vy * dt;
      world.collide(this.pos);                                        // parois des objets (maillage de collision), sur toute la hauteur du personnage
      const g = world.surfaceY ? world.surfaceY(this.pos.x, this.pos.z, this.pos.y) : world.groundY(this.pos.x, this.pos.z);   // sol, ou dessus d'un objet
      const stick = this.onGround && this.vy <= 0 ? 0.12 : 0;           // au sol, il suit les pentes (jusqu'à 12 cm d'écart) ; plus bas qu'un bord, il tombe
      if (this.pos.y <= g + stick) { this.pos.y = g; this.vy = 0; this.onGround = true; this.jumps = 0; }
      else this.onGround = false;
    }
    s.airborne = !this.onGround;
    // orientation du corps : il suit la caméra, sauf quand le stick droit la fait tourner autour de lui à l'arrêt
    this.orbiting = updateOrbit({
      orbiting: this.orbiting,
      // le tireur d'élite verrouille l'orbite : le stick droit tourne alors le personnage avec la caméra
      active: mag > 0.05 || s.aiming || s.firing || s.sprint || s.sniper || s.airborne || s.dead || s.downed,
      mouseLook: inp.lookX !== 0 || inp.lookY !== 0,
      stickLook: (inp.padLookX || 0) !== 0 || (inp.padLookY || 0) !== 0,
    });
    s.orbit = this.orbiting;
    if (!this.orbiting) this.yaw = followYaw(this.yaw, camYaw, dt, 18);
    this.root.position.copy(this.pos);
    this.model.rotation.y = this.yaw;           // le modèle regarde vers +Z quand yaw = 0
  }

  /** Début d'une escalade : il monte le long de l'objet puis se rétablit sur le dessus (ledge : { x, y, z } où il sera debout). */
  _startClimb(ledge) {
    this.climb = { t: 0, dur: 0.85, from: this.pos.clone(), to: new THREE.Vector3(ledge.x, ledge.y, ledge.z) };
    this.vy = 0; this.onGround = false; this.current = null;               // l'animation de saut repart
    this.state.overlay = null; this.comboActive = false; this.ammo.cancel();
  }

  _updateClimb(dt) {
    const c = this.climb;
    c.t += dt / c.dur;
    const k = Math.min(1, c.t);
    const ease = (u) => u * u * (3 - 2 * u);
    const rise = ease(Math.min(1, k / 0.65)), fwd = ease(Math.max(0, (k - 0.5) / 0.5));       // d'abord vers le haut, puis vers l'avant, sur le dessus
    this.pos.y = c.from.y + (c.to.y - c.from.y) * rise;
    this.pos.x = c.from.x + (c.to.x - c.from.x) * fwd;
    this.pos.z = c.from.z + (c.to.z - c.from.z) * fwd;
    if (k >= 1) { this.pos.copy(c.to); this.vy = 0; this.onGround = true; this.jumps = 0; this.climb = null; }
  }

  _play(sel) {
    const clip = this.clips.get(sel.clip);
    if (!clip) { if (!this._warned?.has(sel.clip)) { (this._warned ??= new Set()).add(sel.clip); console.warn('animation absente :', sel.clip); } return; }
    if (this.current === sel.clip) return;
    const fade = this.smooth ? fadeTime(this.current, sel.clip) : 0.15;   // progressif autour de l'arrêt et de la visée
    const next = this.mixer.clipAction(clip);
    next.reset();
    next.setLoop(sel.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = !!sel.clamp || !!sel.once;
    next.enabled = true;
    next.setEffectiveTimeScale(clipSpeed(sel.clip) * boostFor(sel.clip, this.animBoost));                  // les animations de combat sont jouées plus vite
    next.play();
    if (this.action) next.crossFadeFrom(this.action, fade, false);
    this.action = next; this.current = sel.clip;
  }

  /** Muzzle de l'arme tenue : position et direction de tir dans le monde. */
  muzzleWorld() {
    const mz = this.muzzles[this.state.weapon] || this.muzzles.rifle;      // mains nues : pas d'arme, on garde un repère
    this.model.updateMatrixWorld(true);
    return { pos: mz.getWorldPosition(new THREE.Vector3()), dir: new THREE.Vector3(1, 0, 0).transformDirection(mz.matrixWorld) };
  }

  /** Animation, fusil dans la main, buste tourné pour que le canon vise `target` (point du monde). */
  pose(dt, target) {
    this._play(pickClip(this.state));
    this.mixer.update(dt);
    this.model.updateMatrixWorld(true);
    this._applyGrip();
    const s = this.state;
    // la visée du canon monte et descend progressivement (au lieu d'un saut brutal) quand on lève ou baisse l'arme
    const wantAim = s.raised && s.weapon !== 'none' && !s.dead && !s.downed && !this.orbiting ? 1 : 0;
    this.aimWeight = this.smooth ? blendWeight(this.aimWeight, wantAim, dt, 14) : wantAim;
    if (this.aimWeight > 0.01) this._aim(target, this.aimWeight);
    this.bones.head.scale.setScalar(this.fps ? 0.001 : 1);     // vue première personne : la tête disparaît
    this.model.updateMatrixWorld(true);
  }

  _aim(target, weight = 1) {
    const { pos: mp, dir: md } = this.muzzleWorld();
    const sp = this.bones.spine;
    const pivot = sp.getWorldPosition(new THREE.Vector3());
    let R = solveAim(pivot, mp, md, target, 5);
    R = limitRotation(R, THREE.MathUtils.degToRad(60));
    R = blendRotation(R, weight);
    const wq = sp.getWorldQuaternion(new THREE.Quaternion());
    const pq = sp.parent.getWorldQuaternion(new THREE.Quaternion());
    sp.quaternion.copy(pq.invert().multiply(R.multiply(wq)));
    this.model.updateMatrixWorld(true);
    this._applyGrip();
  }
}
