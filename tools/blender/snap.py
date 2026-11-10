"""Captures du personnage depuis n'importe quel angle (caméra temporaire, rendu Workbench avec textures), pour vérifier une tenue.
Usage dans Blender :  import snap; snap.shot("face", az=0, el=5, dist=4.2, z=1.0)   -> renvoie le chemin du PNG
az : 0 = vu de face (le personnage regarde vers -Y), 180 = de dos, 90 = côté. Ne modifie pas la scène : tout est rétabli après le rendu."""
import math
import bpy
from mathutils import Vector

BASE_CLOTHES = ("Hoodie", "Pants", "Shoes", "Hair_Twists", "Rifle", "Pistol", "Rifle_Mag")


def shot(tag, az=0.0, el=5.0, dist=4.2, z=1.0, out=None, size=(700, 900), lens=50, show=("Tenue_PNJ",), center=None, with_player=True):
    sc = bpy.context.scene
    arm = bpy.data.objects["Armature"]
    c = Vector((arm.location.x, arm.location.y, z)) if center is None else Vector((center[0], center[1], z))
    path = out or (bpy.app.tempdir + f"snap_{tag}.png")
    # état à rétablir
    col_state = {col: col.hide_render for col in bpy.data.collections}
    obj_names = ("Body",) + BASE_CLOTHES
    obj_state = {o: o.hide_render for o in (bpy.data.objects.get(n) for n in obj_names) if o is not None}
    saved = {k: getattr(sc.render, k) for k in ("engine", "resolution_x", "resolution_y", "filepath", "film_transparent")}
    sh = sc.display.shading
    sh_state = (sh.light, sh.color_type, sh.background_type, tuple(sh.background_color))
    cam_prev = sc.camera
    cam_data = bpy.data.cameras.new("tmp_snap"); cam_data.lens = lens; cam_data.clip_end = 2000
    cam = bpy.data.objects.new("tmp_snap", cam_data)
    sc.collection.objects.link(cam)
    try:
        for col in bpy.data.collections:
            col.hide_render = not (col.name in show or (with_player and col.name == "Joueurs"))
        for o in obj_state:
            o.hide_render = o.name in BASE_CLOTHES or (not with_player and o.name == "Body")
        a, e = math.radians(az), math.radians(el)
        cam.location = c + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
        cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.camera = cam
        sc.render.engine = 'BLENDER_EEVEE'
        sc.render.resolution_x, sc.render.resolution_y = size
        sc.render.film_transparent = False
        sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'; sh.background_type = 'VIEWPORT'; sh.background_color = (0.55, 0.56, 0.58)
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
    finally:
        for col, v in col_state.items():
            col.hide_render = v
        for o, v in obj_state.items():
            o.hide_render = v
        sh.light, sh.color_type, sh.background_type = sh_state[0], sh_state[1], sh_state[2]
        sh.background_color = sh_state[3]
        for k, v in saved.items():
            setattr(sc.render, k, v)
        sc.camera = cam_prev
        bpy.data.objects.remove(cam, do_unlink=True)
        bpy.data.cameras.remove(cam_data)
    return path
