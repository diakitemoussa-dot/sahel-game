"""Crée l'animation de pas de côté du pistolet vers la droite en mettant en miroir le BAS du corps de celle vers la gauche.

Retournés : bassin et jambes (le déplacement de chaque os par rapport à sa pose de repos est retourné, plan de symétrie X = 0
dans l'armature, puis appliqué à l'os opposé Left <-> Right).
Gardés exactement comme dans l'original, dans l'espace : poitrine, cou, bras, mains. Le pistolet est dans la main droite : un miroir
des bras le mettrait dans la mauvaise main.
Le bassin retourné tourne de ~93° par rapport à l'original : ce contre-mouvement est réparti en trois tiers sur Spine, Spine1 et
Spine2 pour que la taille ne se torde pas à une seule articulation.
"""
import math
import bpy
from mathutils import Matrix
import s15_fire_set as S

MIRROR = Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0))
SPINE_CHAIN = [("mixamorig4:Spine", 1.0 / 3.0), ("mixamorig4:Spine1", 2.0 / 3.0), ("mixamorig4:Spine2", 1.0)]


def partner(name):
    if "Left" in name:
        return name.replace("Left", "Right")
    if "Right" in name:
        return name.replace("Right", "Left")
    return name


def lower_bones(arm):
    """Bassin et jambes."""
    out = {"mixamorig4:Hips"}
    for side in ("Left", "Right"):
        stack = [arm.data.bones[f"mixamorig4:{side}UpLeg"]]
        while stack:
            b = stack.pop()
            out.add(b.name)
            stack += list(b.children)
    return out


def depth(bone):
    d = 0
    while bone.parent:
        d += 1
        bone = bone.parent
    return d


def mirror_lower(src_name, dst_name):
    """Retourne (écart max de position des os retournés en cm, écart d'orientation max de la poitrine en degrés,
    torsion max du bassin à compenser en degrés)."""
    sc = bpy.context.scene
    arm = bpy.data.objects["Armature"]
    pbs = arm.pose.bones
    rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
    lower = lower_bones(arm)
    order = sorted(lower, key=lambda n: depth(arm.data.bones[n]))
    src = bpy.data.actions[src_name]
    S._set_action(arm, src)
    f0, f1 = int(src.frame_range[0]), int(src.frame_range[1])
    frames = {}
    # 1) échantillonner la source : pose locale de tous les os, matrice d'armature du bassin et des jambes
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        bpy.context.view_layer.update()
        world = {n: pbs[n].matrix.copy() for n in lower}
        basis = {pb.name: S._snap(pb) for pb in pbs}
        src_world = {n: pbs[n].matrix.copy() for n, _ in SPINE_CHAIN}
        src_basis = {n: pbs[n].matrix_basis.copy() for n, _ in SPINE_CHAIN}
        # 2) le mouvement par rapport au repos de l'os A devient celui de l'os opposé B
        mirrored = {}
        for n in lower:
            delta = world[n] @ rest[n].inverted()
            mirrored[partner(n)] = (MIRROR @ delta @ MIRROR) @ rest[partner(n)]
        # 3) pose locale correspondante, parent avant enfant
        local = {}
        for n in order:
            parent = arm.data.bones[n].parent
            if parent is None:
                B = rest[n].inverted() @ mirrored[n]
            else:
                B = rest[n].inverted() @ rest[parent.name] @ mirrored[parent.name].inverted() @ mirrored[n]
            loc, rot, sca = B.decompose()
            local[n] = (loc, 'QUATERNION', rot, sca)
        # 4) colonne : Spine2 retrouve exactement l'orientation d'origine, le contre-mouvement est réparti en trois tiers
        parent_name, parent_world = "mixamorig4:Hips", mirrored["mixamorig4:Hips"]
        for name, t in SPINE_CHAIN:
            L = parent_world @ rest[parent_name].inverted() @ rest[name]          # matrice de l'os si sa pose locale était nulle
            a = (L @ src_basis[name]).to_quaternion()                             # orientation avec la pose locale d'origine
            s = src_world[name].to_quaternion()                                   # orientation d'origine dans l'espace
            bq = L.to_quaternion().inverted() @ a.slerp(s, t)
            loc, sca = src_basis[name].to_translation(), src_basis[name].to_scale()
            local[name] = (loc, 'QUATERNION', bq, sca)
            parent_name, parent_world = name, L @ Matrix.LocRotScale(loc, bq, sca)
        twist = mirrored["mixamorig4:Hips"].to_quaternion().rotation_difference(world["mixamorig4:Hips"].to_quaternion()).angle
        frames[f] = (basis, local, {n: mirrored[n].translation.copy() for n in mirrored}, src_world["mixamorig4:Spine2"].to_3x3(), twist)
    # 5) nouvelle action : haut du corps inchangé, bas du corps retourné
    old = bpy.data.actions.get(dst_name)
    if old:
        bpy.data.actions.remove(old)
    new = bpy.data.actions.new(dst_name)
    new.use_fake_user = True
    S._set_action(arm, new)
    for f in range(f0, f1 + 1):
        basis, local = frames[f][0], frames[f][1]
        for pb in pbs:
            S._apply(pb, local[pb.name] if pb.name in local else basis[pb.name])
            S._key(pb, f)
    # 6) vérification
    worst, chest_gap = 0.0, 0.0
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        bpy.context.view_layer.update()
        targets, chest_src = frames[f][2], frames[f][3]
        for n in lower:
            worst = max(worst, (pbs[n].matrix.translation - targets[n]).length)
        chest_gap = max(chest_gap, math.degrees(pbs["mixamorig4:Spine2"].matrix.to_3x3().to_quaternion().rotation_difference(chest_src.to_quaternion()).angle))
    return worst, chest_gap, math.degrees(max(frames[f][4] for f in frames))
