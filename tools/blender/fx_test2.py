import os, sys, importlib.util
PROJ = r"C:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\projects\active\Sahel-Game"
os.environ["INTRO_OUT"] = os.path.join(PROJ, "assets", "intro3", "test")
spec = importlib.util.spec_from_file_location("intro_fx", os.path.join(PROJ, "tools", "blender", "intro_fx.py"))
X = importlib.util.module_from_spec(spec); spec.loader.exec_module(X)
S = X.S; sc = S.sc
import bpy
S.S40.setup_render(True); S.S40.clean_scene(); S.S40.dawn_light()
for o in [S.SRC_ARM] + list(S.SRC_ARM.children_recursive): o.hide_render = True
for t in list(sc.timeline_markers): sc.timeline_markers.remove(t)
sc.frame_start, sc.frame_end = 1, 10
cx, cy = -60.0, 40.0; g = S.ground(cx, cy)
X.cam_track("CT", 35, 1, 10, lambda f: ((cx - 14, cy, g + 5.0), (cx, cy, g + 5.0)), every=5)
X.make_cam_proxy(1, 10)
X.sprite("feu", (cx, cy, g + 5.0), 1, 12, 6.0, 6.0, strength=7.0, fade_in=1, ease=1)
X.sprite("bouche", (cx, cy + 5, g + 5.0), 1, 12, 3.0, 3.0, strength=90.0, fade_in=1)
X.sprite("fumee", (cx, cy - 5, g + 5.0), 1, 12, 4.0, 4.0, fade_in=1)
sc.render.resolution_x, sc.render.resolution_y = 640, 360
sc.frame_set(4); sc.render.filepath = os.path.join(os.environ["INTRO_OUT"], "t2.png"); bpy.ops.render.render(write_still=True)
for o in S.FX.objects:
    if o.name.startswith("sp_"):
        m = o.data.materials[0]
        S.log("DBG2", o.name, m.name, [k for k in o.keys()], [round(o[k], 3) for k in ("fx_u", "fx_v", "fx_a") if k in o.keys()])
