"""Export de la carte (Blender en arrière-plan). Usage : blender -b fichier.blend --python s20_export_map.py -- <dossier client>"""
import os, sys
import bpy

CLIENT = sys.argv[sys.argv.index("--") + 1]
sys.stdout = sys.stderr = open(os.path.join(CLIENT, "export_map.log"), "w", buffering=1, encoding="utf-8")   # le lanceur Windows ne renvoie rien
PROJ = os.path.dirname(os.path.normpath(CLIENT))
sys.path.insert(0, os.path.join(PROJ, "tools", "blender"))
import sand_tex as T
STATIC = ("Terrain", "Camp", "Oasis", "Village", "Fort", "Props", "Cabanes")
SAND_BAKED = all(os.path.exists(os.path.join(T.tex_dir(PROJ), f)) for f in (T.COLOR_FILE, T.NORMAL_FILE))


def mat_params(mat):
    """Couleur moyenne (milieu de la rampe de couleurs si elle existe), rugosité, opacité."""
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if mat.use_nodes else None
    ramp = next((n for n in mat.node_tree.nodes if n.type == "VALTORGB"), None) if mat.use_nodes else None
    rough = bsdf.inputs["Roughness"].default_value if bsdf else 0.9
    alpha = bsdf.inputs["Alpha"].default_value if bsdf else 1.0
    if ramp is not None:
        color = tuple(ramp.color_ramp.evaluate(0.5)[:3])
    elif bsdf is not None:
        color = tuple(bsdf.inputs["Base Color"].default_value[:3])
    else:
        color = tuple(mat.diffuse_color[:3])
    return color, rough, alpha


def simple_material(src):
    if src.name == "Sable" and SAND_BAKED:
        return T.baked_sand_material(PROJ)         # sable : textures cuites (couleur + relief) au lieu d'une couleur unie
    name = "G_" + src.name
    m = bpy.data.materials.get(name)
    if m is None:
        color, rough, alpha = mat_params(src)
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        b.inputs["Base Color"].default_value = (*color, 1.0)
        b.inputs["Roughness"].default_value = rough
        b.inputs["Alpha"].default_value = alpha
        if alpha < 1.0:
            try:
                m.surface_render_method = 'BLENDED'
            except Exception:
                pass
    return m


def static_objects():
    out = []
    for cname in STATIC:
        c = bpy.data.collections.get(cname)
        if c is None:
            continue
        for o in c.all_objects:
            if o.type == 'MESH' and not o.get("helper") and len(o.data.polygons) > 0:
                out.append(o)
    return out


objs = static_objects()
print("objets statiques:", len(objs), "| sable cuit:", SAND_BAKED)
if SAND_BAKED:
    T.ensure_planar_uv(bpy.data.objects["Sol_Desert"])
for o in objs:
    o.hide_set(False)
    o.hide_viewport = False
    for slot in o.material_slots:
        if slot.material is not None:
            slot.material = simple_material(slot.material)

act = bpy.context.view_layer.objects.active
if act is not None and act.mode != 'OBJECT':          # fichier enregistré en mode pose : les sélections échouent hors du mode objet
    bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT')
terrain = bpy.data.objects["Sol_Desert"]
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = terrain
bpy.ops.object.join()
joined = bpy.context.view_layer.objects.active
joined.name = "Carte"
joined.data.calc_loop_triangles()
print("carte fusionnée:", len(joined.data.vertices), "sommets,", len(joined.data.loop_triangles), "triangles,",
      len(joined.data.materials), "matériaux")

os.makedirs(os.path.join(CLIENT, "assets"), exist_ok=True)
out = os.path.join(CLIENT, "assets", "map.glb")
bpy.ops.object.select_all(action='DESELECT')
joined.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True,
                          export_apply=True, export_materials='EXPORT', export_cameras=False,
                          export_lights=False, export_animations=False,
                          # même taille de fichier qu'avant : géométrie compressée, JPEG à 80 %
                          export_meshopt_compression_enable=True, export_meshopt_extension='EXT_meshopt_compression',
                          export_image_format='JPEG', export_jpeg_quality=80)
print("EXPORT OK:", out, round(os.path.getsize(out) / 1e6, 1), "Mo")
