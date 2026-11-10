"""Outil : rend des vues de contrôle de la scène depuis des caméras données (EXPLORE="x,y,z,tx,ty,tz,lens;..." ; INTRO_OUT = dossier)."""
import os, sys, math, importlib.util
import bpy
from mathutils import Vector
spec = importlib.util.spec_from_file_location("s40", r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game\tools\blender\s40_intro.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sc = m.sc
m.setup_render(True); m.clean_scene(); m.dawn_light()
for t in list(sc.timeline_markers): sc.timeline_markers.remove(t)
arm = bpy.data.objects["Armature"]; arm.hide_render = True
for o in arm.children: o.hide_render = True
os.makedirs(m.OUT, exist_ok=True)
for i, spec_ in enumerate(os.environ["EXPLORE"].split(";")):
    v = [float(x) for x in spec_.split(",")]
    cd = bpy.data.cameras.new(f"x{i}"); cd.lens = v[6] if len(v) > 6 else 28; cd.clip_end = 3000
    co = bpy.data.objects.new(f"x{i}", cd); sc.collection.objects.link(co)
    co.location = (v[0], v[1], v[2])
    co.rotation_euler = (Vector(v[3:6]) - co.location).to_track_quat("-Z", "Y").to_euler()
    sc.camera = co
    sc.render.filepath = os.path.join(m.OUT, f"x_{i}.png"); bpy.ops.render.render(write_still=True)
