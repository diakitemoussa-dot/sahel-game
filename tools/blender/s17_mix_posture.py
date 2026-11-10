"""Mélange deux animations : le BAS du corps (bassin, jambes) d'une animation et le HAUT du corps (colonne, bras, mains, tête)
d'une autre, puis recale le canon du pistolet sur le centre de la caméra.

Le haut vient de la POSTURE MOYENNE de l'animation source (moyenne des images : pas de balancement de la course
quand le personnage est à l'arrêt). Les rotations sont moyennées en quaternions.
"""
import bpy
from mathutils import Quaternion, Vector
import s13_aim_bake as B
import s15_fire_set as S


def avg_pose(arm, action, bones):
    sc = bpy.context.scene
    pbs = arm.pose.bones
    S._set_action(arm, action)
    f0, f1 = int(action.frame_range[0]), int(action.frame_range[1])
    locs = {n: Vector() for n in bones}
    scales = {n: Vector() for n in bones}
    quats = {n: [] for n in bones}
    count = 0
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        bpy.context.view_layer.update()
        count += 1
        for n in bones:
            pb = pbs[n]
            locs[n] += pb.location
            scales[n] += pb.scale
            quats[n].append(pb.rotation_quaternion.copy())
    out = {}
    for n in bones:
        ref = quats[n][0]
        acc = Quaternion((0, 0, 0, 0))
        for q in quats[n]:
            if q.dot(ref) < 0:                       # même hémisphère avant de moyenner
                q = Quaternion((-q.w, -q.x, -q.y, -q.z))
            acc = Quaternion((acc.w + q.w, acc.x + q.x, acc.y + q.y, acc.z + q.z))
        acc.normalize()
        out[n] = (locs[n] / count, 'QUATERNION', acc, scales[n] / count)
    return out


def mix(lower_name, upper_name, dst_name, cam="Cam_Visee"):
    sc = bpy.context.scene
    arm = bpy.data.objects["Armature"]
    pbs = arm.pose.bones
    upper = S._upper_bones(arm) - {"Weapon", "Mag"}
    lower_act, upper_act = bpy.data.actions[lower_name], bpy.data.actions[upper_name]
    avg = avg_pose(arm, upper_act, upper)
    # bas du corps : échantillonné image par image dans l'animation « bas »
    S._set_action(arm, lower_act)
    f0, f1 = int(lower_act.frame_range[0]), int(lower_act.frame_range[1])
    lower = {}
    lower_bones = [pb.name for pb in pbs if pb.name not in upper]
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        bpy.context.view_layer.update()
        lower[f] = {n: S._snap(pbs[n]) for n in lower_bones}
    old = bpy.data.actions.get(dst_name)
    if old:
        bpy.data.actions.remove(old)
    new = bpy.data.actions.new(dst_name)
    new.use_fake_user = True
    S._set_action(arm, new)
    skip = {"Weapon", "Mag"}
    for f in range(f0, f1 + 1):
        for n in lower_bones:
            if n in skip:
                continue
            S._apply(pbs[n], lower[f][n])
            S._key(pbs[n], f)
    for n in upper:                                  # haut du corps : posture constante, deux clés suffisent
        for f in (f0, f1):
            S._apply(pbs[n], avg[n])
            S._key(pbs[n], f)
    # le canon doit viser le centre de la caméra : on recale le buste (le pistolet suit la main droite)
    return B.bake(dst_name, cam, "Muzzle_Pistol", weapon=False)
