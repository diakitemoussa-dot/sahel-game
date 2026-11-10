"""Export du personnage (Blender en arrière-plan). Usage : blender -b fichier.blend --python s21_export_player.py -- <dossier client>
Le fichier produit est compressé (textures WebP réduites, géométrie et animations Meshopt) mais garde tous les canaux d'animation.
Pour le poids minimal (23,5 Mo -> 2,7 Mo), deux étapes de plus :
  1. même commande avec la variable SAHEL_RAW=1 et un dossier temporaire (export non compressé, lu pour l'analyse) ;
  2. node tools/glb/prune_channels.mjs <player.glb compressé> <player.glb brut> <sortie.glb> : retire les canaux inutiles
     dans tous les clips (141 sur 201). Ne retirer que ceux-là : un canal retiré d'un seul clip casse les autres."""
import json, math, os, sys
import bpy

CLIENT = sys.argv[sys.argv.index("--") + 1]
sys.stdout = sys.stderr = open(os.path.join(CLIENT, "export_player.log"), "w", buffering=1, encoding="utf-8")   # le lanceur Windows ne renvoie rien
KEEP =json.load(open(os.path.join(CLIENT, "config", "clips.json"), encoding="utf-8"))["export"]
OBJECTS = ["Armature", "Body", "Hoodie", "Hair_Twists", "Pants", "Shoes", "Rifle", "Rifle_Mag", "Pistol", "Muzzle", "Muzzle_Pistol"]

arm = bpy.data.objects["Armature"]
arm.location = (0.0, 0.0, 0.0)               # personnage à l'origine, debout, face à -Y
arm.rotation_euler = (math.radians(90), 0.0, 0.0)
arm.hide_set(False)

# le masque de tête (essai première personne) ne doit pas partir dans le fichier
body = bpy.data.objects["Body"]
m = body.modifiers.get("MasqueTete")
if m is not None:
    body.modifiers.remove(m)


def fcurves_of(a):
    try:
        return list(a.fcurves)
    except Exception:
        return [fc for L in a.layers for S in L.strips for cb in S.channelbags for fc in cb.fcurves]


# 1) une piste par animation à exporter, rien d'autre
ad = arm.animation_data
for t in list(ad.nla_tracks):
    ad.nla_tracks.remove(t)
ad.action = None
missing = []
for name in KEEP:
    act = bpy.data.actions.get(name)
    if act is None:
        missing.append(name)
        continue
    # 2) le déplacement horizontal des hanches est figé (axes X et Z locaux chez Mixamo) : le jeu décide de la position
    for fc in fcurves_of(act):
        if fc.data_path == 'pose.bones["mixamorig4:Hips"].location' and fc.array_index in (0, 2) and len(fc.keyframe_points):
            v0 = fc.keyframe_points[0].co[1]
            for kp in fc.keyframe_points:
                kp.co[1] = v0
                kp.handle_left[1] = v0
                kp.handle_right[1] = v0
            fc.update()
    tr = ad.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, int(act.frame_range[0]), act)
    st.name = name
assert not missing, "animations introuvables: %s" % missing
print("animations exportées:", len(KEEP))

# 3) sélection et export
for o in bpy.data.objects:
    o.select_set(False)
for n in OBJECTS:
    o = bpy.data.objects[n]
    o.hide_set(False)
    o.hide_viewport = False
    o.select_set(True)
bpy.context.view_layer.objects.active = arm

# 4) textures réduites avant l'export (le fichier .blend n'est pas enregistré : l'original reste intact).
#    La peau ne montre que la tête, les mains et les pieds ; les cheveux ont peu de détail.
TEX_SIZE = {"body_color_alpha": 1024, "file3": 1024, "hair_color_alpha": 512}
for name, size in TEX_SIZE.items():
    im = bpy.data.images.get(name)
    if im is not None and im.size[0] > size:
        im.scale(size, size)
        print("texture réduite:", name, "->", size)
os.makedirs(os.path.join(CLIENT, "assets"), exist_ok=True)
out = os.path.join(CLIENT, "assets", "player.glb")
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True,
                          export_apply=False, export_skins=True, export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_force_sampling=True,
                          export_optimize_animation_size=True, export_optimize_animation_keep_anim_armature=True,   # tri ensuite : tools/glb/prune_channels.mjs
                          export_cameras=False, export_lights=False,
                          # compression : WebP (garde la transparence des cheveux) + géométrie et animations en Meshopt
                          export_image_format='WEBP', export_image_quality=75,
                          export_meshopt_compression_enable=not os.environ.get('SAHEL_RAW'), export_meshopt_extension='EXT_meshopt_compression')
print("EXPORT OK:", out, round(os.path.getsize(out) / 1e6, 1), "Mo")
