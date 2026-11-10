"""Cuisson de la texture du sable (Blender en arrière-plan, le .blend n'est PAS enregistré).
Usage : blender -b assets/sahel_desert.blend --python s23_bake_sand.py -- <dossier du projet> [taille, 4096 par défaut]
Écrit assets/textures/sable_color.jpg (couleur) et sable_normal.jpg (relief). Journal : tools/blender/bake_sand.log"""
import os, sys, time
import bpy

args = sys.argv[sys.argv.index("--") + 1:]
PROJ = args[0]
COLOR_SIZE = int(args[1]) if len(args) > 1 else 4096     # la couleur varie lentement : 4096 px ne pèse que 0,5 Mo
NORMAL_SIZE = int(args[2]) if len(args) > 2 else 2048    # le relief est lourd en JPEG (5 Mo à 4096 px) : 2048 px
sys.stdout = sys.stderr = open(os.path.join(PROJ, "tools", "blender", "bake_sand.log"), "w", buffering=1, encoding="utf-8")
sys.path.insert(0, os.path.join(PROJ, "tools", "blender"))
import sand_tex as T

t0 = time.time()
out = T.tex_dir(PROJ)
os.makedirs(out, exist_ok=True)
sc = bpy.context.scene
try:
    sc.render.engine = 'CYCLES'
except TypeError as e:
    raise SystemExit("Cycles indisponible : " + str(e))
sc.cycles.device = 'CPU'
sc.cycles.samples = 1
sc.cycles.use_denoising = False

obj = bpy.data.objects["Sol_Desert"]
T.ensure_planar_uv(obj)
for o in bpy.context.view_layer.objects:
    o.select_set(False)
obj.hide_set(False)
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
mat = bpy.data.materials["Sable"]
nt = mat.node_tree


def bake(kind, filename, colorspace, size, **kw):
    img = bpy.data.images.new("bake_" + kind, size, size, alpha=False)
    img.colorspace_settings.name = colorspace
    node = nt.nodes.new("ShaderNodeTexImage")
    node.image = img
    nt.nodes.active = node
    t = time.time()
    bpy.ops.object.bake(type=kind, margin=8, margin_type='EXTEND', **kw)
    img.filepath_raw = os.path.join(out, filename)
    img.file_format = 'JPEG'
    img.save()
    print(f"{kind}: {filename} écrit en {time.time() - t:.1f} s,", round(os.path.getsize(img.filepath_raw) / 1e6, 2), "Mo")
    nt.nodes.remove(node)


bake('DIFFUSE', T.COLOR_FILE, 'sRGB', COLOR_SIZE, pass_filter={'COLOR'})
bake('NORMAL', T.NORMAL_FILE, 'Non-Color', NORMAL_SIZE, normal_space='TANGENT')
print(f"TERMINÉ en {time.time() - t0:.1f} s (couleur {COLOR_SIZE}, relief {NORMAL_SIZE})")
