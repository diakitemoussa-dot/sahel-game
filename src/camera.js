import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const clone = (c) => ({ ...c, look: [...c.look] });
const CROUCH_DROP = 0.55;           // à genoux, la tête et le buste sont 55 cm plus bas (mesuré : tête 1,48 -> 0,92 m, buste 1,16 -> 0,62 m)
const LOW_FLOOR = 0.3;              // la caméra reste à au moins 30 cm au-dessus du sol (20 cm en vue première personne)
const DROPS = new Set(['Cam_Visee', 'Cam_Sniper', 'Cam_PremierePersonne']);      // caméras réglées pour un personnage debout : elles descendent quand il s'agenouille

export class CameraRig {
  constructor(camera, cfgs) {
    this.camera = camera;
    this.cfgs = cfgs;
    this.cur = clone(cfgs.Cam_Exploration);
    this.view = 'epaule';                     // 'epaule' ou 'fps'
    this.drop = 0;                            // descente actuelle de la caméra (personnage à genoux), progressive
  }

  toggleView() { this.view = this.view === 'epaule' ? 'fps' : 'epaule'; }

  /** nom de la caméra de Blender à utiliser selon l'état */
  nameFor(s) {
    if (this.view === 'fps') return 'Cam_PremierePersonne';
    if (s.downed) return 'Cam_ATerre';
    if (s.sniper) return 'Cam_Sniper';
    if (s.aiming) return 'Cam_Visee';
    if (s.crouch) return 'Cam_Accroupi';
    return 'Cam_Exploration';
  }

  /** ground : position du joueur au sol (three.js). yaw, pitch : orientation voulue par le joueur (pitch > 0 : regarder en haut).
   *  world (facultatif) : { groundY, blocked } pour que la caméra ne passe ni sous le sol ni dans un mur. */
  update(dt, ground, yaw, pitch, state, world = null) {
    const name = this.nameFor(state);
    const goal = this.cfgs[name];
    const k = 1 - Math.exp(-dt * 10);
    this.drop += ((state.crouch && !state.downed && DROPS.has(name) ? CROUCH_DROP : 0) - this.drop) * k;
    for (const key of ['dist', 'h', 'side', 'fov']) this.cur[key] += (goal[key] - this.cur[key]) * k;
    for (let i = 0; i < 3; i++) this.cur.look[i] += (goal.look[i] - this.cur.look[i]) * k;

    const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const r = new THREE.Vector3().crossVectors(f, UP);
    const c = this.cur;
    const kn = this.drop / CROUCH_DROP;                                  // 0 debout, 1 à genoux : la tête est alors 18 cm plus à droite et 13 cm plus en avant, la caméra s'écarte pour la dégager
    const pos = ground.clone().addScaledVector(r, c.side + 0.15 * kn).addScaledVector(f, -(c.dist + 0.1 * kn)).addScaledVector(UP, c.h - this.drop);
    const tgt = ground.clone().addScaledVector(r, c.look[0]).addScaledVector(f, c.look[1]).addScaledVector(UP, c.look[2] - this.drop);
    // tangage : on fait tourner la caméra et sa cible autour d'un point d'appui à hauteur de tête, axe = droite du joueur
    const pivot = ground.clone().addScaledVector(UP, 1.5 - this.drop);
    const q = new THREE.Quaternion().setFromAxisAngle(r, pitch);
    pos.sub(pivot).applyQuaternion(q).add(pivot);
    tgt.sub(pivot).applyQuaternion(q).add(pivot);

    if (world && this.view !== 'fps' && c.dist > 0.7) {                 // un mur entre la tête et la caméra : elle se rapproche du personnage
      const head = ground.clone().addScaledVector(UP, 1.5 - this.drop);
      if (world.blocked(head, pos)) {
        for (const t of [0.8, 0.62, 0.46, 0.32, 0.2, 0.1]) {
          const p2 = head.clone().lerp(pos, t);
          if (!world.blocked(head, p2)) { pos.copy(p2); break; }
          if (t === 0.1) pos.copy(p2);
        }
      }
    }
    if (world) pos.y = Math.max(pos.y, world.groundY(pos.x, pos.z) + (this.view === 'fps' ? 0.2 : LOW_FLOOR));       // jamais sous le sol
    this.camera.position.copy(pos);
    this.camera.lookAt(tgt);
    this.camera.fov = c.fov;
    this.camera.updateProjectionMatrix();
  }
}
