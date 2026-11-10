"""Repères visuels des caméras de jeu (cône + rayon colorés). Aides de visualisation :
à exclure de l'export vers le jeu (propriété personnalisée 'helper' = True)."""
import math, bpy, bmesh
import s12_cameras as K


def _mat(name, color):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1.0)
    try:
        b.inputs["Emission Color"].default_value = (*color, 1.0)
        b.inputs["Emission Strength"].default_value = 2.0
    except KeyError:
        pass
    return m


def _cone(name, r, depth, seg=4):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=0.0, depth=depth)
    # pointe vers -Z local de la caméra : on retourne le cône (sommet vers -Z)
    for v in bm.verts:
        v.co.z = -v.co.z - depth / 2.0
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def _beam(name, length, r=0.012):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=r, radius2=r, depth=length)
    for v in bm.verts:
        v.co.z = -(v.co.z + length / 2.0)   # de 0 à -length selon -Z
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def run():
    col = bpy.data.collections.get("Cameras_Jeu_Reperes") or bpy.data.collections.new("Cameras_Jeu_Reperes")
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    for o in list(col.objects):
        me = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if me.users == 0:
            bpy.data.meshes.remove(me)
    for name, rgb in K.COLORS.items():
        cam = bpy.data.objects[name]
        mat = _mat("Repere_" + name, rgb)
        for kind, me in (("Cone", _cone("Repere_" + name + "_Cone", 0.12, 0.3)),
                         ("Rayon", _beam("Repere_" + name + "_Rayon", 4.0))):
            o = bpy.data.objects.new(f"Repere_{name}_{kind}", me)
            col.objects.link(o)
            o.data.materials.append(mat)
            o.parent = cam          # même position et même orientation que la caméra
            o["helper"] = True
            o.hide_render = True    # pas dans les rendus du jeu
