"""Export de la tenue militaire (Blender en arrière-plan) : un GLB séparé, sans le personnage de base.
Usage : blender -b assets/sahel_desert.blend --python s25_export_uniform.py -- <dossier client> [id de tenue, 'militaire' par défaut]
Le fichier contient l'armature (mêmes noms d'os que player.glb) et les pièces U_* : le jeu les rattache au squelette du joueur.
Le .blend n'est pas enregistré."""
import json, math, os, sys
import bpy

CLIENT = sys.argv[sys.argv.index("--") + 1]
UID = sys.argv[sys.argv.index("--") + 2] if len(sys.argv) > sys.argv.index("--") + 2 else "militaire"
sys.stdout = sys.stderr = open(os.path.join(CLIENT, f"export_uniform_{UID}.log"), "w", buffering=1, encoding="utf-8")
COLL = {"militaire": "Tenue_Militaire", "pnj_milicien": "Tenue_PNJ"}[UID]

arm = bpy.data.objects["Armature"]
arm.location = (0.0, 0.0, 0.0)               # même placement que pour player.glb : mêmes matrices d'os
arm.rotation_euler = (math.radians(90), 0.0, 0.0)
act = bpy.context.view_layer.objects.active
if act is not None and act.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
arm.data.pose_position = 'REST'
arm.animation_data_clear()                    # pas d'animation dans ce fichier : celles de player.glb s'appliquent

# la collection de la tenue doit être visible et sélectionnable
lc = bpy.context.view_layer.layer_collection.children.get(COLL)
if lc:
    lc.exclude = False; lc.hide_viewport = False
col = bpy.data.collections[COLL]
col.hide_viewport = False
for o in bpy.data.objects:
    o.select_set(False)
arm.hide_set(False); arm.select_set(True)
n = 0
bpy.context.view_layer.update()
for o in col.objects:
    if o is None:
        continue
    o.hide_set(False); o.hide_viewport = False
    if o.type == 'MESH' and len(o.data.polygons):
        o.select_set(True); n += 1
bpy.context.view_layer.objects.active = arm
print("pièces exportées:", n)

# la camouflage est une image 1024 : on la garde ; les JPEG/WebP n'aiment pas les aplats pixélisés, qualité élevée
out_dir = os.path.join(CLIENT, "assets", "uniforms")
os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, f"{UID}.glb")
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True,
                          export_apply=False, export_skins=True, export_animations=False,
                          export_cameras=False, export_lights=False,
                          export_image_format='WEBP', export_image_quality=88,
                          export_meshopt_compression_enable=True, export_meshopt_extension='EXT_meshopt_compression')
print("EXPORT OK:", out, round(os.path.getsize(out) / 1e6, 2), "Mo")
