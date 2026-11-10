"""Correction de la visée : le bout du canon ('Muzzle', collé au fusil) doit pointer vers le centre de l'image
de la caméra. On fait tourner d'un bloc tout le haut du corps (os Spine1 et ses enfants : bras, mains, tête)
ET l'os 'Weapon' (le fusil), autour de la hanche haute, de la rotation qui amène le canon sur la cible.
Le fusil ne se détache donc jamais de ses mains (il est rigide par rapport à la main droite à < 1 cm).
Les clés sont écrites dans l'action : il faut une sauvegarde avant de lancer bake()."""
import math
import bpy
from mathutils import Vector, Matrix, Quaternion

PIVOT_BONE = "mixamorig4:Spine1"
D = 30.0   # la cible est le point au centre de l'image, à 30 m de la caméra


def _target(cam):
    m = cam.matrix_world
    return m.translation + (m.to_3x3() @ Vector((0, 0, -1))).normalized() * D


def _muzzle(mz):
    mw = mz.matrix_world
    return mw.translation.copy(), (mw.to_3x3() @ Vector((1, 0, 0))).normalized()


def error_deg(sc, mz, cam):
    bpy.context.view_layer.update()
    p, d = _muzzle(mz)
    return math.degrees(d.angle((_target(cam) - p).normalized()))


def _set_action(arm, act):
    for t in arm.animation_data.nla_tracks:
        t.mute = True
    arm.animation_data.action = act


def bake(action_name, cam_name="Cam_Visee", mz_name="Muzzle", weapon=True):
    """mz_name : 'Muzzle' (fusil) ou 'Muzzle_Pistol'. weapon=False pour le pistolet, qui est déjà
    attaché à l'os de la main (il suit le buste tout seul) : seul le buste est tourné."""
    sc = bpy.context.scene
    arm = bpy.data.objects["Armature"]
    mz = bpy.data.objects[mz_name]
    if mz.parent is not None:
        mz.parent.hide_set(False)       # un objet masqué n'est pas recalculé : on affiche l'arme mesurée
    cam = bpy.data.objects[cam_name]
    spine, wp = arm.pose.bones[PIVOT_BONE], arm.pose.bones["Weapon"]
    MW = arm.matrix_world
    act = bpy.data.actions[action_name]
    _set_action(arm, act)
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    plan, before = {}, []
    # passe 1 : calculer, pour chaque image, la rotation à appliquer (sans rien modifier)
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        bpy.context.view_layer.update()
        T = _target(cam)
        mpos, mdir = _muzzle(mz)
        P = MW @ spine.head
        before.append(math.degrees(mdir.angle((T - mpos).normalized())))
        R = Quaternion()
        for _ in range(5):             # le canon bouge quand on tourne autour de P : on itère
            mp = P + R @ (mpos - P)
            md = R @ mdir
            R = md.rotation_difference((T - mp).normalized()) @ R
        plan[f] = (R, P.copy(), (MW @ spine.matrix).copy(), (MW @ wp.matrix).copy())
    # passe 2 : écrire les clés corrigées (os Spine1 et os Weapon)
    for f in range(f0, f1 + 1):
        R, P, spine_w, wp_w = plan[f]
        sc.frame_set(f)
        bpy.context.view_layer.update()
        Tr = Matrix.Translation(P) @ R.to_matrix().to_4x4() @ Matrix.Translation(-P)
        spine.matrix = MW.inverted() @ (Tr @ spine_w)
        spine.keyframe_insert("rotation_quaternion", frame=f)
        if weapon:
            wp.matrix = MW.inverted() @ (Tr @ wp_w)
            wp.keyframe_insert("location", frame=f)
            wp.keyframe_insert("rotation_quaternion", frame=f)
    after = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        after.append(error_deg(sc, mz, cam))
    return dict(frames=f1 - f0 + 1, before_mean=sum(before) / len(before), before_max=max(before),
                after_mean=sum(after) / len(after), after_max=max(after),
                turn_max=max(math.degrees(plan[f][0].angle) for f in plan))
