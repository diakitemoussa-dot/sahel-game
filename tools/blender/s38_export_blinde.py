"""Export du blindé (MRAP) et de l'animation « Entrer_Blinde_Arriere » depuis assets/blinde_mrap.blend. Le personnage n'est PAS exporté : le jeu a déjà le sien.
Usage (Blender en arrière-plan) : blender -b assets/blinde_mrap.blend --python tools/blender/s38_export_blinde.py -- <dossier client> <dossier brut>
  ou, dans un Blender ouvert : sys.argv = ['blender', '--', client, brut]; exec(open('.../s38_export_blinde.py').read())
Produit dans <dossier brut> (fichiers non compressés), à passer ensuite par tools/glb/compress_glb.mjs :
  - blinde.glb          : le véhicule à l'origine (avant = -Y dans Blender, +Z dans le jeu) avec le nœud PorteArr animé (clip Porte_Arriere_Ouvre) ;
  - entrer_blinde.glb   : le squelette seul avec le clip « Entrer_Blinde_Arriere » (cinématique d'entrée par la porte arrière, 156 images à 24 i/s) ; les cibles IK sont cuites dans les os ;
et dans <dossier client> : assets/vehicles/blinde_collision.bin (enveloppes convexes des grosses pièces).
Le clip est joué par le jeu avec le personnage placé à (0, 7) dans le repère du véhicule, tourné vers -Y (là où il commence dans le .blend). Le .blend n'est pas enregistré."""
import math, os, sys
import bpy

args = sys.argv[sys.argv.index("--") + 1:]
CLIENT, RAW = args[0], args[1]
os.makedirs(RAW, exist_ok=True)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.path.join(CLIENT, "..", "tools", "blender"))

ROOT = "Blinde_MRAP_racine"
CLIP = "Entrer_Blinde_Arriere"
DOOR = "PorteArr"

act = bpy.context.view_layer.objects.active
if act is not None and act.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')


def select_only(objs, active):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.hide_set(False); o.hide_viewport = False
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


# ------------------------------------------------------------------ 1) le véhicule + la porte arrière animée
root = bpy.data.objects[ROOT]
parts = [root] + [o for o in root.children_recursive]

# Trou de tir : la bague, la trappe et les périscopes qui dépassent du toit autour du trou rond sont retirés (sur une COPIE de l'objet, le .blend reste intact) :
# le tireur du jeu se tient debout dans le trou, le haut du corps dehors, sans rien devant lui. Zone : rayon HATCH_R autour de (HATCH_X, HATCH_Y), au-dessus du toit (z >= HATCH_Z).
import bmesh, math
HATCH_X, HATCH_Y, HATCH_R, HATCH_Z = 0.0, 0.65, 0.95, 3.2
det = bpy.data.objects["Exterieur_Details"]
tmp = det.copy(); tmp.data = det.data.copy(); tmp.name = "Exterieur_Details_Trou"
for c in det.users_collection:
    c.objects.link(tmp)
bm = bmesh.new(); bm.from_mesh(tmp.data)
mw = tmp.matrix_world
cut = [f for f in bm.faces if all(math.hypot((mw @ v.co).x - HATCH_X, (mw @ v.co).y - HATCH_Y) <= HATCH_R and (mw @ v.co).z >= HATCH_Z for v in f.verts)]
bmesh.ops.delete(bm, geom=cut, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(tmp.data); bm.free()
print("trou de tir :", len(cut), "faces retirées")
parts = [tmp if o is det else o for o in parts]
door = bpy.data.objects[DOOR]
assert door.animation_data and door.animation_data.action, "la porte arrière n'a pas d'animation"
select_only(parts, root)
kw = dict(export_format='GLB', use_selection=True, export_yup=True, export_apply=False, export_cameras=False, export_lights=False,
          export_image_format='WEBP', export_image_quality=88, export_skins=False)
out_v = os.path.join(RAW, "blinde.glb")
bpy.ops.export_scene.gltf(filepath=out_v, export_animations=True, export_animation_mode='ACTIVE_ACTIONS', export_force_sampling=True, **kw)
print("véhicule :", out_v, round(os.path.getsize(out_v) / 1e6, 2), "Mo,", len(parts), "objets")
tmp_mesh = tmp.data
bpy.data.objects.remove(tmp, do_unlink=True); bpy.data.meshes.remove(tmp_mesh)       # la copie n'est plus utile

# ------------------------------------------------------------------ 2) l'animation du personnage : squelette seul (pas de maillage)
arm = bpy.data.objects["Armature"]
clip = bpy.data.actions[CLIP]
keep = (tuple(arm.location), tuple(arm.rotation_euler), tuple(arm.scale))
old_action = arm.animation_data.action
arm.animation_data.action = clip
arm.location = (0.0, 0.0, 0.0)                              # le jeu place le personnage lui-même ; seul le mouvement relatif compte
bpy.context.scene.frame_start, bpy.context.scene.frame_end = int(clip.frame_range[0]), int(clip.frame_range[1])
select_only([arm], arm)
out_a = os.path.join(RAW, "entrer_blinde.glb")
try:
    bpy.ops.export_scene.gltf(filepath=out_a, export_animations=True, export_animation_mode='ACTIVE_ACTIONS', export_force_sampling=True,
                              export_optimize_animation_size=True, export_optimize_animation_keep_anim_armature=True,
                              export_def_bones=False, **kw)
finally:
    arm.location, arm.rotation_euler, arm.scale = keep
    arm.animation_data.action = old_action
print("animation :", out_a, round(os.path.getsize(out_a) / 1e6, 2), "Mo")

# ------------------------------------------------------------------ 3) collisions : enveloppes convexes des grosses pièces
import colmesh as K
bpy.context.view_layer.update()
KEEP = ("Chassis", "Coque", "Roue_", "Marchepied", "Porte_D", "Porte_G", "PorteArr")
b = K.Builder(); kept = 0
for o in root.children_recursive:
    if o.type == 'MESH' and o.name.startswith(KEEP):
        for hull in K.object_hulls(o, max_tris=64):
            b.add(hull, o.name); kept += 1
out_c = os.path.join(CLIENT, "assets", "vehicles", "blinde_collision.bin")
os.makedirs(os.path.dirname(out_c), exist_ok=True)
nv, nt, no = b.write(out_c)
print(f"collision : {out_c} | {kept} morceaux, {nv} sommets, {nt} triangles | {os.path.getsize(out_c) / 1024:.0f} Ko")
