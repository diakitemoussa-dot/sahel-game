"""Essai de vue à la première personne : caméra aux yeux + tête masquée + visée du canon sur le centre.
N'altère pas les 5 autres caméras ni les animations d'origine."""
import math
import bpy
from mathutils import Vector
import s12_cameras as K
import s12b_cam_markers as M
import s13_aim_bake as B

NAME = "Cam_PremierePersonne"


def add_camera():
    p = K.CAMS[NAME]
    col = bpy.data.collections["Cameras_Jeu"]
    pivot = bpy.data.objects["Cam_Pivot"]
    old = bpy.data.objects.get(NAME)
    if old is not None:
        d = old.data
        bpy.data.objects.remove(old, do_unlink=True)
        bpy.data.cameras.remove(d)
    cd = bpy.data.cameras.new(NAME)
    cd.sensor_fit = 'VERTICAL'
    cd.angle = math.radians(p["fov"])
    cd.clip_start, cd.clip_end = 0.03, 800.0
    cd.display_size = 0.6
    cam = bpy.data.objects.new(NAME, cd)
    col.objects.link(cam)
    cam.parent = pivot
    pos = Vector((p["side"], -p["dist"], p["h"]))
    look = Vector(p["look"])
    cam.location = pos
    cam.rotation_mode = 'XYZ'
    cam.rotation_euler = (look - pos).to_track_quat('-Z', 'Y').to_euler()
    cam.color = (*K.COLORS[NAME], 1.0)
    for k, v in (("dist", p["dist"]), ("h", p["h"]), ("side", p["side"]), ("fov", p["fov"]), ("look", list(p["look"]))):
        cam[k] = v
    cam["def"] = [p["dist"], p["h"], p["side"], p["fov"], *p["look"]]
    # repères visuels (cône + rayon), comme pour les autres caméras
    mcol = bpy.data.collections["Cameras_Jeu_Reperes"]
    for o in [o for o in mcol.objects if o.name.startswith("Repere_" + NAME)]:
        me = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if me.users == 0:
            bpy.data.meshes.remove(me)
    mat = M._mat("Repere_" + NAME, K.COLORS[NAME])
    for kind, me in (("Cone", M._cone("Repere_" + NAME + "_Cone", 0.12, 0.3)),
                     ("Rayon", M._beam("Repere_" + NAME + "_Rayon", 4.0))):
        o = bpy.data.objects.new(f"Repere_{NAME}_{kind}", me)
        mcol.objects.link(o)
        o.data.materials.append(mat)
        o.parent = cam
        o["helper"] = True
        o.hide_render = True
    return cam


def head_mask():
    """Groupe 'Tete' (sommets du corps pondérés sur la tête et le cou) + modificateur Mask (désactivé par défaut)."""
    body = bpy.data.objects["Body"]
    names = [g.name for g in body.vertex_groups if g.name.endswith(":Head") or g.name.endswith(":Neck")]
    idx = {body.vertex_groups[n].index for n in names}
    vg = body.vertex_groups.get("Tete") or body.vertex_groups.new(name="Tete")
    vg.remove(range(len(body.data.vertices)))
    n = 0
    for v in body.data.vertices:
        w = sum(g.weight for g in v.groups if g.group in idx)
        if w > 0.5:
            vg.add([v.index], 1.0, 'REPLACE')
            n += 1
    m = body.modifiers.get("MasqueTete") or body.modifiers.new("MasqueTete", 'MASK')
    m.vertex_group = "Tete"
    m.invert_vertex_group = True          # on retire la tête, on garde mains et pieds
    m.show_viewport = False
    m.show_render = False
    # le Mask passe avant l'armature (il retire des sommets, l'armature déforme ceux qui restent)
    i = [x.name for x in body.modifiers].index("MasqueTete")
    if i != 0:
        body.modifiers.move(i, 0)
    return n


def bake_actions():
    out = {}
    for src, dst in (("Rifle Aim", "Rifle Aim FPS"), ("Rifle Fire", "Rifle Fire FPS")):
        old = bpy.data.actions.get(dst)
        if old:
            bpy.data.actions.remove(old)
        a = bpy.data.actions[src].copy()
        a.name = dst
        a.use_fake_user = True
        out[dst] = B.bake(dst, NAME)
    return out
