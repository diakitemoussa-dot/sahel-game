"""Animations de tir : le canon des deux armes vise le centre de l'image de la caméra.

Fusil : jambes et hanches de l'animation de déplacement + haut du corps de 'Rifle Aim' (déjà aligné),
        le fusil suit la main droite avec un décalage fixe (il ne se détache jamais), puis correction fine du buste.
Pistolet : copie de l'animation d'origine (le pistolet est déjà attaché à la main) + correction du buste.
Les animations d'origine ne sont pas modifiées : on crée des versions '... Tir'."""
import bpy
from mathutils import Matrix
import s13_aim_bake as B

CAM = "Cam_Visee"
REF_ACTION, REF_OFF = "Rifle Aim", 20

RIFLE_SET = [("Rifle Walk", "Rifle Walk Tir"), ("Rifle Run", "Rifle Run Tir"),
             ("Rifle Walk Backward", "Rifle Walk Backward Tir"), ("Rifle Crouch Walk", "Rifle Crouch Walk Tir"),
             ("Rifle Kneel", "Rifle Kneel Tir"), ("Rifle Jump", "Rifle Jump Tir"),
             ("Strafe Left", "Rifle Strafe Left Tir"), ("Strafe Right", "Rifle Strafe Right Tir")]
PISTOL_SET = [("Pistol Idle", "Pistol Idle Tir"), ("Pistol Walk", "Pistol Walk Tir"), ("Pistol Run", "Pistol Run Tir"),
              ("Pistol Walk Backward", "Pistol Walk Backward Tir"), ("Pistol Strafe", "Pistol Strafe Tir"),
              ("Pistol Kneel", "Pistol Kneel Tir"), ("Pistol Jump", "Pistol Jump Tir")]


def _upper_bones(arm):
    root = arm.data.bones["mixamorig4:Spine"]
    names = {root.name}
    stack = [root]
    while stack:
        b = stack.pop()
        for c in b.children:
            names.add(c.name)
            stack.append(c)
    return names


def _snap(pb):
    return (pb.location.copy(), pb.rotation_mode, (pb.rotation_quaternion.copy() if pb.rotation_mode == 'QUATERNION'
                                                     else pb.rotation_euler.copy()), pb.scale.copy())


def _apply(pb, s):
    pb.location = s[0]
    pb.rotation_mode = s[1]
    if s[1] == 'QUATERNION':
        pb.rotation_quaternion = s[2]
    else:
        pb.rotation_euler = s[2]
    pb.scale = s[3]


def _key(pb, f):
    pb.keyframe_insert("location", frame=f)
    pb.keyframe_insert("rotation_quaternion" if pb.rotation_mode == 'QUATERNION' else "rotation_euler", frame=f)
    pb.keyframe_insert("scale", frame=f)


def _set_action(arm, act):
    for t in arm.animation_data.nla_tracks:
        t.mute = True
    arm.animation_data.action = act


def rifle_variant(src_name, dst_name):
    sc = bpy.context.scene
    arm = bpy.data.objects["Armature"]
    MW = arm.matrix_world
    upper = _upper_bones(arm)
    pbs = arm.pose.bones
    ref = bpy.data.actions[REF_ACTION]
    src = bpy.data.actions[src_name]
    # 1) pose de référence du haut du corps (visée) + décalage de prise fusil / main droite
    _set_action(arm, ref)
    sc.frame_set(int(ref.frame_range[0]) + REF_OFF)
    bpy.context.view_layer.update()
    aim = {n: _snap(pbs[n]) for n in upper | {"Weapon", "Mag"} if n in pbs}
    rh = pbs["mixamorig4:RightHand"]
    grip = (MW @ rh.matrix).inverted() @ (MW @ pbs["Weapon"].matrix)
    # 2) échantillonner le bas du corps de l'animation de déplacement
    _set_action(arm, src)
    f0, f1 = int(src.frame_range[0]), int(src.frame_range[1])
    lower = {}
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        bpy.context.view_layer.update()
        lower[f] = {pb.name: _snap(pb) for pb in pbs if pb.name not in aim}
    # 3) nouvelle action : bas du corps de la marche/course + haut du corps de la visée
    old = bpy.data.actions.get(dst_name)
    if old:
        bpy.data.actions.remove(old)
    new = bpy.data.actions.new(dst_name)
    new.use_fake_user = True
    _set_action(arm, new)
    for f in range(f0, f1 + 1):
        for pb in pbs:
            _apply(pb, aim[pb.name] if pb.name in aim else lower[f][pb.name])
            _key(pb, f)
    # 4) le fusil suit la main droite à chaque image (décalage fixe)
    wp = pbs["Weapon"]
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        bpy.context.view_layer.update()
        wp.matrix = MW.inverted() @ ((MW @ rh.matrix) @ grip)
        wp.keyframe_insert("location", frame=f)
        wp.keyframe_insert("rotation_quaternion", frame=f)
    # 5) correction fine du buste pour que le canon vise exactement le centre
    return B.bake(dst_name, CAM, "Muzzle", weapon=True)


def pistol_variant(src_name, dst_name):
    old = bpy.data.actions.get(dst_name)
    if old:
        bpy.data.actions.remove(old)
    a = bpy.data.actions[src_name].copy()
    a.name = dst_name
    a.use_fake_user = True
    return B.bake(dst_name, CAM, "Muzzle_Pistol", weapon=False)
