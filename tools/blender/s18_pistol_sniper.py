"""Pistolet en mode tireur d'élite : 'Pistol Aim Sniper'.
Même principe que 'Rifle Aim Sniper' : le canon (Muzzle_Pistol) vise le centre de l'image de Cam_Sniper.
Le pistolet de 'Pistol Idle' est tenu à hauteur de poitrine : vu de Cam_Sniper (à hauteur des yeux, sur l'épaule
droite) seul le bout du canon dépasserait en bas de l'image. On lève donc les deux bras (ALPHA) et on les
tourne vers la droite du personnage (BETA), puis on réaligne le buste sur le centre (s13_aim_bake)."""
import math
import bpy
from mathutils import Matrix, Quaternion, Vector
import s13_aim_bake as B

SRC, DST, CAM, MZ = "Pistol Idle", "Pistol Aim Sniper", "Cam_Sniper", "Muzzle_Pistol"
ARMS = ("mixamorig4:RightArm", "mixamorig4:LeftArm")
ALPHA = 20.0     # levée des bras (degrés)
BETA = 0.0       # rotation des bras vers la droite (degrés) : inutile, le réalignement du buste l'annule et le tord (essais 2026-11-06)


def run(alpha=ALPHA, beta=BETA):
    sc = bpy.context.scene
    arm = bpy.data.objects["Armature"]
    MW = arm.matrix_world
    pbs = arm.pose.bones
    old = bpy.data.actions.get(DST)
    if old:
        bpy.data.actions.remove(old)
    act = bpy.data.actions[SRC].copy()
    act.name = DST
    act.use_fake_user = True
    for t in arm.animation_data.nla_tracks:
        t.mute = True
    arm.animation_data.action = act
    bpy.data.objects["Pistol"].hide_set(False)
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    up = Vector((0, 0, 1))
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        bpy.context.view_layer.update()
        r = ((MW @ pbs[ARMS[0]].head) - (MW @ pbs[ARMS[1]].head)).normalized()   # axe « droite » du personnage
        c = (MW @ pbs[ARMS[0]].head + MW @ pbs[ARMS[1]].head) / 2                # milieu des épaules
        Rt = (Matrix.Translation(c) @ Quaternion(up, math.radians(beta)).to_matrix().to_4x4()
              @ Quaternion(r, math.radians(alpha)).to_matrix().to_4x4() @ Matrix.Translation(-c))
        worlds = {n: MW @ pbs[n].matrix for n in ARMS}
        for n in ARMS:
            pbs[n].matrix = MW.inverted() @ (Rt @ worlds[n])
            pbs[n].keyframe_insert("rotation_quaternion", frame=f)
    return B.bake(DST, CAM, MZ, weapon=False)
