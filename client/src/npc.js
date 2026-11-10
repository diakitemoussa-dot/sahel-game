// PNJ : même personnage que le joueur (même modèle, mêmes 57 animations, mêmes collisions), habillé d'une tenue (config/uniforms.json).
// Il est piloté comme le joueur, par les mêmes entrées (déplacement, viser, tirer, frapper). Deux camps :
//  - team 'enemy' (miliciens) : patrouille tant qu'ils sont tranquilles, puis cerveau de combat (npcbrain.js) ;
//  - team 'ally' (alliés du joueur, en tenue militaire) : suivent le joueur en formation (allybrain.js) et combattent les miliciens.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { Player } from './player.js';
import { Outfit } from './uniforms.js';
import { Patrol } from './patrol.js';
import { NpcBrain } from './npcbrain.js';
import { Follower } from './allybrain.js';
import { giveSkin } from './skins.js';
import { keepOut } from './firelogic.js';
import { ENEMY_HP } from './combat.js';
import { ASSET_VERSION } from './version.js';

const IDLE_INPUT = { moveX: 0, moveY: 0 };
const WALK_INPUT = { moveX: 0, moveY: 0.5 };           // 0,5 : allure de marche
const PASSIVE = new Set(['patrol', 'search', 'follow']);

export class Npc {
  /** def : { id, uniform, skin (noire | metisse | blanche), weapon, route (miliciens), start (alliés), slot (alliés), wait } ; route3 : la route en (x, z) three.js ; team : 'enemy' ou 'ally' */
  constructor(player, def, patrol, route3, seed = 1, team = 'enemy') {
    this.id = def.id; this.def = def; this.player = player; this.patrol = patrol; this.route3 = route3; this.team = team;
    this.health = player.health;                          // la vie est portée par le Player (même classe que le joueur)
    // un allié voit tout autour de lui et de plus loin : il surveille les environs du joueur
    // réactions rapides : repère en 0,25 à 0,3 s, rafales plus serrées, esquive brève
    this.brain = new NpcBrain(team === 'ally'
      ? { seed, sight: 32, fov: Math.PI * 2, hearing: 50, engageMax: 18, reaction: 0.25, burstCycle: 1.2, burstLen: 0.5 }
      : { seed, reaction: 0.15, sight: 34, hearing: 60, burstCycle: 0.8, burstLen: 0.62, hurtTime: 0.3, dodgeTime: 0.3, dodgeCooldown: 0.8, hideTime: 0.65, peekTime: 0.95 });      // miliciens : repèrent presque aussitôt, sursaut court, esquive et abri vifs, rafales longues et rapprochées
    if (team === 'enemy') { this.health.max = ENEMY_HP; this.health.hp = ENEMY_HP; }      // un milicien encaisse plus avant de tomber
    this.follower = team === 'ally' ? new Follower({ slot: def.slot ?? [1.8, 2.4] }) : null;
    this.override = null;
    this.fireZones = null;                                // zones en feu (mises à jour par skirmish.js) : il les contourne
    this.fireSide = (parseInt(String(def.id).replace(/\D/g, ''), 10) || 0) % 2 ? 1 : -1;     // côté par lequel il contourne
    this.fireCd = 0; this.meleeCd = 0;
    this.prevMode = 'patrol';
    this.heading = 0;
    player.relaxed = true;                                // arme baissée : animations « Rifle Idle / Rifle Walk »
  }

  get dead() { return this.health.dead; }

  /** cmd : commande du cerveau (voir npcbrain.js, allybrain.js) ; target : point que le canon doit viser (Vector3). */
  update(dt, world, cmd = { mode: 'patrol' }, target = null) {
    const p = this.player;
    this.fireCd -= dt; this.meleeCd -= dt;
    let inp, heading;
    if (cmd.mode === 'dead') {
      inp = IDLE_INPUT; heading = p.yaw;
    } else if (cmd.mode === 'patrol') {
      if (this.patrol) { const b = this.patrol.step(dt, p.pos); inp = b.moving ? WALK_INPUT : IDLE_INPUT; heading = b.heading; }
      else { inp = IDLE_INPUT; heading = p.yaw; }
    } else {
      heading = cmd.heading ?? p.yaw;
      inp = { moveX: cmd.moveX ?? 0, moveY: cmd.moveY ?? 0, aim: !!cmd.aim, fire: !!cmd.fire, melee: !!cmd.melee, sprint: !!cmd.sprint, jump: !!cmd.jump };
      if (cmd.mode === 'hurt' && this.prevMode !== 'hurt') inp.hit = true;                       // sursaut : « Hit Reaction »
      if (cmd.crouch !== undefined && !!cmd.crouch !== p.state.crouch) inp.crouchToggle = true;   // se met à genoux, ou se relève
    }
    if (p.state.crouch && PASSIVE.has(cmd.mode)) inp = { ...inp, crouchToggle: true };
    p.relaxed = PASSIVE.has(cmd.mode) && !cmd.ready;      // un allié qui suit garde l'arme au niveau (cmd.ready), comme le joueur
    const extra = this.override; this.override = null;      // commande ponctuelle (tests)
    const px = p.pos.x, pz = p.pos.z;
    p.step(dt, { ...inp, ...extra }, world, heading);
    if (this.fireZones?.length && cmd.mode !== 'dead') keepOut(p.pos, { x: px, z: pz }, this.fireZones, this.fireSide, dt);       // il ne marche pas dans les flammes
    // sans cible : le canon pointe droit devant lui (pas vers ses propres pieds, ce qui le courbait en avant quand il court ou se met à l'abri)
    p.pose(dt, target ?? this._ahead());
    this.prevMode = cmd.mode;
    this.heading = heading;
  }

  /** Point à 30 m devant lui, à hauteur de poitrine. */
  _ahead() {
    const p = this.player;
    return (this._aheadPt ??= new THREE.Vector3()).set(p.pos.x + Math.sin(p.yaw) * 30, p.pos.y + 1.4, p.pos.z + Math.cos(p.yaw) * 30);
  }

  /** Mort du PNJ. */
  die() { this.player.die(); this.brain.die(); }
}

/** Charge player.glb une seule fois, en fait une copie par PNJ (squelettes séparés), les habille et les place.
 *  team 'enemy' : defs avec une route ; team 'ally' : defs avec un point de départ (start, repère Blender) et une place dans la formation (slot). */
export async function loadNpcs(scene, world, lib, defs, team = 'enemy') {
  if (!defs.length) return [];
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(`assets/player.glb?v=${ASSET_VERSION}`);
  const out = [];
  let seed = team === 'ally' ? 41 : 11;
  for (const def of defs) {
    const player = new Player(scene, { scene: clone(gltf.scene), animations: gltf.animations });
    player.setWeapon(def.weapon ?? 'rifle');
    let route = null, patrol = null;
    if (team === 'ally') player.pos.set(def.start[0], 0, -def.start[1]);
    else {
      route = def.route.map(([x, y]) => [x, -y]);       // Blender (x, y) -> three.js (x, z)
      player.pos.set(route[0][0], 0, route[0][1]);
      patrol = new Patrol(route, { wait: def.wait ?? 3, startIndex: 1 });
    }
    player.pos.y = world.groundY(player.pos.x, player.pos.z);
    await giveSkin(player.model, def.skin);                 // teinte de peau propre à ce PNJ (noire, métisse, blanche)
    const outfit = new Outfit(player, lib);
    try { await outfit.apply(def.uniform); } catch (e) { console.error(`PNJ ${def.id} : tenue indisponible`, e); }
    out.push(new Npc(player, def, patrol, route, seed++, team));
  }
  return out;
}

/** Lit config/npcs.json : { npcs: [miliciens], allies: [alliés du joueur] }. */
export async function loadNpcDefs() {
  const r = await fetch(`config/npcs.json?v=${ASSET_VERSION}`);
  if (!r.ok) return { npcs: [], allies: [] };
  const j = await r.json();
  return { npcs: j.npcs ?? [], allies: j.allies ?? [] };
}
