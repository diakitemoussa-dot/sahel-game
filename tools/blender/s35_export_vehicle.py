"""Export du véhicule (Blender en arrière-plan) : client/assets/vehicles/<id>.glb.
Usage : blender -b assets/sahel_desert.blend --python tools/blender/s35_export_vehicle.py -- <dossier client> [id, 'technique' par défaut]
Le véhicule est exporté à l'origine, avant vers +Z dans le jeu (avant = -Y dans Blender). Les roues, la tourelle et les canons sont des nœuds
(V_Roue..., V_Tourelle, V_Canons) que le jeu peut faire tourner. Le .blend n'est pas enregistré."""
import json, math, os, sys
import bpy

CLIENT = sys.argv[sys.argv.index("--") + 1]
UID = sys.argv[sys.argv.index("--") + 2] if len(sys.argv) > sys.argv.index("--") + 2 else "technique"
sys.stdout = sys.stderr = open(os.path.join(CLIENT, f"export_vehicle_{UID}.log"), "w", buffering=1, encoding="utf-8")
COLL = {"technique": "Vehicule_Technique"}[UID]

act = bpy.context.view_layer.objects.active
if act is not None and act.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
col = bpy.data.collections[COLL]
lc = bpy.context.view_layer.layer_collection.children.get(COLL)
if lc:
    lc.exclude = False; lc.hide_viewport = False
col.hide_viewport = False; col.hide_render = False
root = bpy.data.objects["Technique"]
root.location = (0.0, 0.0, 0.0)                    # à l'origine : le jeu le place lui-même
for o in bpy.data.objects:
    o.select_set(False)
n = 0
bpy.context.view_layer.update()
for o in col.objects:
    o.hide_set(False); o.hide_viewport = False
    o.select_set(True); n += 1
bpy.context.view_layer.objects.active = root
print("objets exportés:", n)

out_dir = os.path.join(CLIENT, "assets", "vehicles")
os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, f"{UID}.glb")
kw = dict(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_apply=False, export_skins=False, export_animations=False,
          export_cameras=False, export_lights=False, export_image_format='WEBP', export_image_quality=88,
          export_meshopt_compression_enable=True, export_meshopt_extension='EXT_meshopt_compression')
try:
    bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)       # les couleurs de sommets portent la saleté (multipliées à la texture)
except TypeError as e:
    print("export_vertex_color refusé :", e)
    bpy.ops.export_scene.gltf(**kw)
print("EXPORT OK:", out, round(os.path.getsize(out) / 1e6, 2), "Mo")
