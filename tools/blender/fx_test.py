"""Test des effets seuls : une explosion et des coups de feu en rase campagne, caméra fixe (images dans INTRO_OUT)."""
import os, sys, importlib.util
PROJ = r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game"
os.environ["INTRO_OUT"] = os.environ.get("INTRO_OUT", os.path.join(PROJ, "assets", "intro3", "test"))
os.makedirs(os.environ["INTRO_OUT"], exist_ok=True)
spec = importlib.util.spec_from_file_location("intro_fx", os.path.join(PROJ, "tools", "blender", "intro_fx.py"))
X = importlib.util.module_from_spec(spec); spec.loader.exec_module(X)
S = X.S; sc = S.sc
import bpy
from mathutils import Vector
S.S40.setup_render(True); S.S40.clean_scene(); S.S40.dawn_light(elevation_deg=11, azimuth_deg=100, strength=3.4)
for o in [S.SRC_ARM] + list(S.SRC_ARM.children_recursive): o.hide_render = True
for t in list(sc.timeline_markers): sc.timeline_markers.remove(t)
sc.frame_start, sc.frame_end = 1, 60
cx, cy = -60.0, 40.0
g = S.ground(cx, cy)
X.cam_track("CT", 28, 1, 60, lambda f: ((cx - 18, cy - 10, g + 9.0), (cx, cy, g + 3.5)), every=10)
X.make_cam_proxy(1, 60)
X.explosion((cx, cy, g + 2.0), 6, 4.0, flash=0.0)
X.fire_column((cx + 14, cy + 3, g), 1, 60, 2.0)
S.FLASH.clear()
sc.render.resolution_x, sc.render.resolution_y = 640, 360
for f in (8, 12, 18, 28, 45):
    sc.frame_set(f); sc.render.filepath = os.path.join(os.environ["INTRO_OUT"], f"t_{f:02d}.png"); bpy.ops.render.render(write_still=True); S.log("rendu", f)
